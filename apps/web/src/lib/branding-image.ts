import sharp, { type SharpOptions } from "sharp";
import { LaminaError } from "@lamina/contracts";

export const LOGO_MAX_BYTES = 1024 * 1024;
export const LOGO_MAX_INPUT_SIDE = 4000;
export const LOGO_OUT_SIDE = 1024;
const LOGO_MIN_SIDE = 16;

export type LogoKind = "png" | "jpeg" | "webp" | "svg";

const bad = (msg: string, status = 400) => new LaminaError("invalid_input", msg, status);

/** Tipo real por magic bytes; nunca se confía en la extensión ni en el Content-Type del cliente. */
export function sniffLogo(buf: Buffer): LogoKind | null {
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "png";
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpeg";
  if (buf.length >= 12 && buf.subarray(0, 4).toString("latin1") === "RIFF" && buf.subarray(8, 12).toString("latin1") === "WEBP") return "webp";
  const head = buf.subarray(0, 4096).toString("utf8").replace(/^﻿/, "").trimStart();
  if (/^(<\?xml[^>]*\?>\s*)?(<!--[\s\S]*?-->\s*)*(<!DOCTYPE\s+svg[^>[]*>\s*)?(<!--[\s\S]*?-->\s*)*<svg[\s>]/i.test(head)) return "svg";
  return null;
}

const SAFE_DATA_URI = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=\s]+$/i;

/**
 * Lista de rechazo para SVG (el SVG nunca se sirve: se rasteriza). Se rechaza cualquier cosa activa o con referencias externas
 * en lugar de intentar limpiarla, para no depender de un parser permisivo.
 */
export function assertSafeSvg(svg: string): void {
  const reject = (why: string) => { throw bad(`El SVG no es seguro (${why}). Exporta el logo como PNG o SVG simple sin scripts ni enlaces.`); };
  if (/<\s*(script|foreignObject|iframe|object|embed|audio|video|animate|animateTransform|animateMotion|set|handler|listener)\b/i.test(svg)) reject("contiene elementos activos");
  if (/[\s"'/]on[a-z]+\s*=/i.test(svg)) reject("contiene manejadores de eventos");
  if (/javascript\s*:|vbscript\s*:/i.test(svg)) reject("contiene código ejecutable");
  if (/<!ENTITY/i.test(svg) || /<!DOCTYPE[^>]*\[/i.test(svg)) reject("define entidades XML");
  if (/&(?!(amp|lt|gt|quot|apos);)[#A-Za-z0-9]+;/.test(svg)) reject("usa entidades XML");
  if (/@import/i.test(svg)) reject("importa recursos externos");
  for (const m of svg.matchAll(/(?:xlink:)?href\s*=\s*(["'])(.*?)\1/gis)) {
    const v = m[2]!.trim();
    if (!v.startsWith("#") && !SAFE_DATA_URI.test(v)) reject("referencia recursos externos");
  }
  for (const m of svg.matchAll(/url\(\s*(["']?)([^)"']*)\1\s*\)/gi)) {
    if (!m[2]!.trim().startsWith("#")) reject("referencia recursos externos");
  }
}

export type ProcessedLogo = { png: Buffer; width: number; height: number; kind: LogoKind };

/**
 * Valida y normaliza un logo subido: tipo real, tamaño, dimensiones; re-encodea SIEMPRE a PNG (sin metadatos ni cola de bytes,
 * lo que elimina polyglots) y rasteriza el SVG. Lanza LaminaError con mensaje apto para el usuario.
 */
export async function processLogo(input: Buffer): Promise<ProcessedLogo> {
  if (input.length === 0) throw bad("El archivo está vacío.");
  if (input.length > LOGO_MAX_BYTES) throw bad("El logo supera 1 MB.", 413);
  const kind = sniffLogo(input);
  if (!kind) throw bad("Formato no admitido: sube PNG, JPEG, WebP o SVG.", 415);
  let src: Buffer = input;
  const opts: SharpOptions = { limitInputPixels: LOGO_MAX_INPUT_SIDE * LOGO_MAX_INPUT_SIDE, failOn: "error", pages: 1 };
  if (kind === "svg") {
    const text = input.toString("utf8").replace(/^﻿/, "");
    assertSafeSvg(text);
    src = Buffer.from(text, "utf8");
    opts.density = 192;
  }
  try {
    const meta = await sharp(src, opts).metadata();
    if (!meta.width || !meta.height) throw bad("No se pudo leer la imagen.");
    if (meta.width > LOGO_MAX_INPUT_SIDE || meta.height > LOGO_MAX_INPUT_SIDE) throw bad(`La imagen es demasiado grande (máximo ${LOGO_MAX_INPUT_SIDE} px por lado).`);
    if (meta.width < LOGO_MIN_SIDE || meta.height < LOGO_MIN_SIDE) throw bad("La imagen es demasiado pequeña.");
    const { data, info } = await sharp(src, opts).rotate().resize({ width: LOGO_OUT_SIDE, height: LOGO_OUT_SIDE, fit: "inside", withoutEnlargement: kind !== "svg" }).png({ compressionLevel: 9 }).toBuffer({ resolveWithObject: true });
    return { png: data, width: info.width, height: info.height, kind };
  } catch (e) {
    if (e instanceof LaminaError) throw e;
    throw bad("La imagen está dañada o no es válida.");
  }
}
