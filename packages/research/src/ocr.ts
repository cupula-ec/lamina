import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { checkLatex } from "@lamina/validation";
import type { Extracted, ExtractedPage, NeedsOcr } from "./extract";

const envInt = (name: string, def: number, min: number, max: number) => {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n > 0 ? Math.min(max, Math.max(min, Math.floor(n))) : def;
};

/** Límites duros del OCR (anti PDF-bomb y de recursos). Configurables por entorno dentro de rangos seguros. */
export const OCR_LIMITS = {
  maxPages: envInt("LAMINA_OCR_MAX_PAGES", 40, 1, 150),
  maxTotalMs: envInt("LAMINA_OCR_MAX_MINUTES", 8, 1, 30) * 60_000,
  concurrency: envInt("LAMINA_OCR_CONCURRENCY", 2, 1, 2),
  dpi: 200,
  rasterTimeoutMs: 30_000,
  tesseractTimeoutMs: 30_000,
  /** Píxeles máximos por página rasterizada (A3 a 200 dpi ≈ 9,7 Mpx). */
  maxPagePixels: 16_000_000,
  maxImageBytes: 24 * 1024 * 1024,
  maxVisionImageBytes: 6 * 1024 * 1024,
  lowConfidence: 70,
  langs: process.env.LAMINA_OCR_LANGS?.match(/^[a-z_]{3,8}(\+[a-z_]{3,8})*$/) ? process.env.LAMINA_OCR_LANGS : "spa+eng",
};
export type OcrLimits = typeof OCR_LIMITS;

export type OcrWord = { text: string; conf: number };
export type TesseractPage = { text: string; confidence: number | null; words: OcrWord[]; lines: string[] };

/** Entorno mínimo para los binarios: sin secretos del proceso (claves, BD…). */
const childEnv = () => ({
  PATH: process.env.PATH ?? "/usr/bin:/bin",
  LC_ALL: "C",
  OMP_THREAD_LIMIT: "1",
  ...(process.env.TESSDATA_PREFIX ? { TESSDATA_PREFIX: process.env.TESSDATA_PREFIX } : {}),
});

type ExecResult = { stdout: string; stderr: string };
function run(cmd: string, args: string[], timeoutMs: number, maxBuffer = 16 * 1024 * 1024): Promise<ExecResult> {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { timeout: timeoutMs, killSignal: "SIGKILL", maxBuffer, env: childEnv() as unknown as NodeJS.ProcessEnv, windowsHide: true, encoding: "utf8" }, (err, stdout, stderr) => {
      if (err) return reject(Object.assign(err, { stderr: String(stderr ?? "").slice(0, 400) }));
      resolve({ stdout, stderr });
    });
  });
}

/* ───── Disponibilidad ───── */
export type OcrAvailability = { ok: boolean; missing: string[] };
let availability: Promise<OcrAvailability> | undefined;
/** Comprueba (una vez por proceso) que existen pdftoppm y tesseract con los idiomas pedidos. */
export function checkOcrAvailable(langs = OCR_LIMITS.langs): Promise<OcrAvailability> {
  availability ??= (async () => {
    const missing: string[] = [];
    try { await run("pdftoppm", ["-v"], 5000); } catch (e) { if ((e as NodeJS.ErrnoException).code === "ENOENT") missing.push("pdftoppm"); }
    try {
      const r = await run("tesseract", ["--list-langs"], 10_000);
      const have = new Set(`${r.stdout}\n${r.stderr}`.split(/\s+/));
      for (const l of langs.split("+")) if (!have.has(l)) missing.push(`tesseract:${l}`);
    } catch (e) { missing.push((e as NodeJS.ErrnoException).code === "ENOENT" ? "tesseract" : "tesseract:error"); }
    return { ok: missing.length === 0, missing };
  })();
  return availability;
}
export const resetOcrAvailabilityCache = () => { availability = undefined; };

/* ───── Rasterizado y Tesseract ───── */
export type OcrEngineDeps = {
  rasterize(pdfPath: string, page: number, outDir: string, dpi: number): Promise<string>;
  tesseract(imagePath: string, langs: string): Promise<string>;
};

export const defaultDeps: OcrEngineDeps = {
  async rasterize(pdfPath, page, outDir, dpi) {
    const prefix = path.join(outDir, `p${page}`);
    await run("pdftoppm", ["-f", String(page), "-l", String(page), "-r", String(dpi), "-gray", "-png", "-singlefile", pdfPath, prefix], OCR_LIMITS.rasterTimeoutMs);
    return `${prefix}.png`;
  },
  async tesseract(imagePath, langs) {
    const r = await run("tesseract", [imagePath, "stdout", "-l", langs, "--psm", "3", "--dpi", String(OCR_LIMITS.dpi), "tsv"], OCR_LIMITS.tesseractTimeoutMs);
    return r.stdout;
  },
};

/** Interpreta la salida TSV de Tesseract: texto por líneas/párrafos y confianza media por palabra. */
export function parseTsv(tsv: string): TesseractPage {
  const words: OcrWord[] = [];
  const lines: string[] = [];
  const paras: string[][] = [];
  let key = "";
  let pkey = "";
  let cur: string[] = [];
  const flushLine = () => { if (cur.length) { const l = cur.join(" "); lines.push(l); (paras[paras.length - 1] ??= []).push(l); } cur = []; };
  for (const row of tsv.split("\n").slice(1)) {
    const c = row.split("\t");
    if (c.length < 12 || c[0] !== "5") continue;
    const text = c.slice(11).join("\t").trim();
    const conf = Number(c[10]);
    if (!text || !Number.isFinite(conf) || conf < 0) continue;
    const k = `${c[2]}.${c[3]}.${c[4]}`;
    const pk = `${c[2]}.${c[3]}`;
    if (k !== key) { flushLine(); key = k; if (pk !== pkey) { paras.push([]); pkey = pk; } }
    cur.push(text);
    words.push({ text, conf });
  }
  flushLine();
  const text = paras.filter((p) => p.length).map((p) => p.join("\n")).join("\n\n").trim();
  const confidence = words.length ? Math.round(words.reduce((n, w) => n + w.conf, 0) / words.length) : null;
  return { text, confidence, words, lines };
}

/* ───── Heurística de fórmulas / baja calidad ───── */
const MATH_SYMBOLS = /[=∑∫√±^_{}∂≤≥≠≈∞π∆∇→⇒⇔×÷∈∉⊂∪∩αβγδθλμσφωΩ]/g;
export type PageAssessment = { needsVision: boolean; reasons: string[]; mathDensity: number };

export function assessPage(p: Pick<TesseractPage, "text" | "confidence" | "lines">, lowConfidence = OCR_LIMITS.lowConfidence): PageAssessment {
  const reasons: string[] = [];
  const chars = p.text.replace(/\s/g, "").length;
  const symbols = (p.text.match(MATH_SYMBOLS) ?? []).length;
  const mathDensity = chars ? symbols / chars : 0;
  const fractions = (p.text.match(/\b\d+\s*\/\s*\d+\b|\b[a-zA-Z]\s*\/\s*[a-zA-Z0-9]\b/g) ?? []).length;
  const mathLines = p.lines.filter((l) => l.length <= 40 && (l.match(MATH_SYMBOLS) ?? []).length >= 2).length;
  if (p.confidence !== null && p.confidence < lowConfidence) reasons.push("baja_confianza");
  if (chars < 15) reasons.push("sin_texto");
  if (mathDensity > 0.04 && symbols >= 4) reasons.push("simbolos");
  if (fractions >= 3) reasons.push("fracciones");
  if (p.lines.length >= 3 && mathLines / p.lines.length > 0.25) reasons.push("lineas_matematicas");
  return { needsVision: reasons.length > 0, reasons, mathDensity };
}

/* ───── Salida de visión (no confiable) ───── */
export type VisionResult = { text_md: string; formulas: { latex: string; display?: boolean }[] };
export type VisionApplied = { text: string; formulas: number; invalid: number };

// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g;

/** Sanea la salida del modelo de visión y valida cada fórmula con KaTeX; las inválidas quedan marcadas «por revisar». */
export function applyVision(v: VisionResult): VisionApplied {
  let text = v.text_md.replace(CONTROL, "").replace(/\r\n?/g, "\n").trim().slice(0, 24_000);
  let invalid = 0;
  const seen = new Set<string>();
  for (const f of v.formulas.slice(0, 80)) {
    const latex = f.latex.replace(CONTROL, "").trim();
    if (!latex || seen.has(latex)) continue;
    seen.add(latex);
    if (checkLatex(latex) === null) continue;
    invalid++;
    const mark = `[fórmula por revisar: ${latex.replace(/[$\n]+/g, " ").slice(0, 200)}]`;
    text = text.split(`$$${latex}$$`).join(mark).split(`$${latex}$`).join(mark);
  }
  return { text, formulas: seen.size, invalid };
}

/* ───── Pipeline ───── */
export type VisionHook = {
  /** Reserva cupo (cuota por usuario/día); false = sin cupo. */
  reserve: () => Promise<boolean>;
  /** Devuelve el cupo reservado cuando la llamada falló. */
  release?: () => Promise<void>;
  transcribe: (png: Buffer, page: number) => Promise<VisionResult>;
};
export type OcrPageMeta = { page: number; engine: "tesseract" | "vision"; confidence: number | null; chars: number; status: "ok" | "low" | "failed" };
export type OcrOptions = {
  vision?: VisionHook;
  onProgress?: (done: number, total: number) => void | Promise<void>;
  onPage?: (meta: OcrPageMeta) => void | Promise<void>;
  deps?: Partial<OcrEngineDeps>;
  limits?: Partial<OcrLimits>;
  now?: () => number;
};
export type VisionStatus = "not_requested" | "used" | "quota" | "failed";
export type OcrOutcome = {
  pages: ExtractedPage[];
  /** Páginas que no se pudieron leer (límite, tamaño, error). */
  skipped: number[];
  truncated: boolean;
  timedOut: boolean;
  vision: VisionStatus;
  /** Páginas con fórmulas que no pasaron por visión y quedan sin verificar. */
  unverified: number[];
};

/**
 * OCR de las páginas indicadas de un PDF: rasteriza (pdftoppm), lee con Tesseract y, si se permite,
 * reenvía a visión las páginas con fórmulas o baja confianza. Todo en un tmp privado que se borra siempre.
 */
export async function ocrPdf(pdf: Buffer, needs: NeedsOcr, opts: OcrOptions = {}): Promise<OcrOutcome> {
  const L: OcrLimits = { ...OCR_LIMITS, ...opts.limits };
  const deps: OcrEngineDeps = { ...defaultDeps, ...opts.deps };
  const now = opts.now ?? Date.now;
  const deadline = now() + L.maxTotalMs;
  const targets = needs.pages.slice(0, L.maxPages);
  const outcome: OcrOutcome = { pages: [], skipped: [], truncated: needs.pages.length > targets.length, timedOut: false, vision: "not_requested", unverified: [] };
  outcome.skipped.push(...needs.pages.slice(targets.length));
  if (!targets.length) return outcome;

  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "lamina-ocr-"));
  await fs.chmod(tmp, 0o700);
  try {
    const pdfPath = path.join(tmp, "in.pdf");
    await fs.writeFile(pdfPath, pdf, { mode: 0o600 });
    let done = 0;
    let visionOff = false;
    let visionFails = 0;
    let progress: Promise<void> = Promise.resolve();
    const tick = () => { done++; const d = done; progress = progress.then(() => opts.onProgress?.(d, targets.length)).catch(() => {}); };
    const results = new Map<number, ExtractedPage>();
    let next = 0;

    const doPage = async (page: number) => {
      const [w, h] = needs.sizes[page] ?? [0, 0];
      const px = (w / 72) * L.dpi * ((h / 72) * L.dpi);
      if (!(w > 0 && h > 0) || px > L.maxPagePixels) { outcome.skipped.push(page); await opts.onPage?.({ page, engine: "tesseract", confidence: null, chars: 0, status: "failed" }); return; }
      const img = await deps.rasterize(pdfPath, page, tmp, L.dpi);
      try {
        if ((await fs.stat(img)).size > L.maxImageBytes) throw new Error("imagen demasiado grande");
        const tp = parseTsv(await deps.tesseract(img, L.langs));
        const a = assessPage(tp, L.lowConfidence);
        let out: ExtractedPage = { page, text: tp.text, ocr: { engine: "tesseract", confidence: tp.confidence } };
        let meta: OcrPageMeta = { page, engine: "tesseract", confidence: tp.confidence, chars: tp.text.length, status: tp.confidence !== null && tp.confidence < L.lowConfidence ? "low" : "ok" };
        if (a.needsVision && opts.vision && !visionOff) {
          const size = (await fs.stat(img)).size;
          if (size <= L.maxVisionImageBytes && (await opts.vision.reserve())) {
            try {
              const v = applyVision(await opts.vision.transcribe(await fs.readFile(img), page));
              if (v.text.replace(/\s/g, "").length < 10) throw new Error("visión sin contenido útil");
              out = { page, text: v.text, ocr: { engine: "vision", confidence: null, review: v.invalid || undefined } };
              meta = { page, engine: "vision", confidence: null, chars: v.text.length, status: v.invalid ? "low" : "ok" };
              outcome.vision = outcome.vision === "failed" ? "failed" : "used";
              visionFails = 0;
            } catch {
              await opts.vision.release?.();
              outcome.vision = "failed";
              if (++visionFails >= 2) visionOff = true;
              out.ocr!.unverified = true;
              outcome.unverified.push(page);
            }
          } else {
            if (size <= L.maxVisionImageBytes) { visionOff = true; if (outcome.vision !== "used") outcome.vision = "quota"; }
            out.ocr!.unverified = true;
            outcome.unverified.push(page);
          }
        } else if (a.needsVision && a.reasons.some((r) => r !== "sin_texto" && r !== "baja_confianza")) {
          out.ocr!.unverified = true;
          outcome.unverified.push(page);
        }
        if (out.text) results.set(page, out);
        await opts.onPage?.(meta);
      } finally {
        await fs.rm(img, { force: true });
      }
    };

    const worker = async () => {
      for (;;) {
        const i = next++;
        if (i >= targets.length) return;
        const page = targets[i]!;
        if (now() > deadline) { outcome.timedOut = true; outcome.skipped.push(page); tick(); continue; }
        try { await doPage(page); }
        catch (e) {
          if ((e as NodeJS.ErrnoException).code === "ENOENT" && /pdftoppm|tesseract/.test(String((e as { path?: string }).path ?? ""))) throw e;
          outcome.skipped.push(page);
          await opts.onPage?.({ page, engine: "tesseract", confidence: null, chars: 0, status: "failed" });
        }
        tick();
      }
    };
    await Promise.all(Array.from({ length: Math.min(L.concurrency, targets.length) }, worker));
    await progress;
    outcome.pages = [...results.values()].sort((a, b) => a.page! - b.page!);
    outcome.skipped.sort((a, b) => a - b);
    outcome.unverified.sort((a, b) => a - b);
    return outcome;
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
}

/** Combina el texto nativo del PDF con el reconocido por OCR, en orden de página. */
export function mergeOcr(base: Extracted, outcome: OcrOutcome): Extracted {
  const pages = [...base.pages, ...outcome.pages].sort((a, b) => (a.page ?? 0) - (b.page ?? 0));
  const { needsOcr: _n, ...rest } = base;
  return { ...rest, pages };
}

const ranges = (ns: number[]) => {
  const out: string[] = [];
  for (let i = 0; i < ns.length; ) {
    let j = i;
    while (ns[j + 1] === ns[j]! + 1) j++;
    out.push(j > i ? `${ns[i]}–${ns[j]}` : `${ns[i]}`);
    i = j + 1;
  }
  return out.join(", ");
};

/** Aviso visible en la fuente: marca de OCR + límites y fórmulas sin verificar. */
export function ocrNote(pages: ExtractedPage[], outcome: OcrOutcome, consentVision: boolean): string {
  const ocr = pages.filter((p) => p.ocr);
  const parts = [`Texto reconocido por OCR (páginas ${ranges(ocr.map((p) => p.page!)) || "—"}); puede contener errores.`];
  const revisar = ocr.filter((p) => p.ocr?.review).map((p) => p.page!);
  if (revisar.length) parts.push(`Fórmulas por revisar en las páginas ${ranges(revisar)}.`);
  if (outcome.unverified.length) {
    const why = !consentVision ? "no autorizaste el envío de imágenes a la IA" : outcome.vision === "quota" ? "se agotó tu cupo diario de visión" : "la IA de visión no estuvo disponible";
    parts.push(`Fórmulas sin verificar por visión en las páginas ${ranges(outcome.unverified)} (${why}).`);
  }
  if (outcome.skipped.length) parts.push(`No se leyeron las páginas ${ranges(outcome.skipped)}${outcome.truncated ? ` (máximo ${OCR_LIMITS.maxPages} páginas de OCR por documento)` : outcome.timedOut ? " (se agotó el tiempo)" : ""}.`);
  return parts.join(" ");
}
