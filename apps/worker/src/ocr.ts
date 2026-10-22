import { and, eq } from "drizzle-orm";
import { LaminaError } from "@lamina/contracts";
import { VISION_TASK, VisionPage, visionSystem, visionUser } from "@lamina/ai";
import { refundQuota, schema, tryConsumeQuota } from "@lamina/db";
import { LIMITS, checkOcrAvailable, mergeOcr, ocrNote, ocrPdf, type Extracted, type OcrEngineDeps, type OcrPageMeta, type VisionHook } from "@lamina/research";
import type { Ctx } from "./ctx";

type Pres = typeof schema.presentations.$inferSelect;
export type OcrRun = { ex: Extracted; note: string | null };

const textLen = (ex: Extracted) => ex.pages.reduce((n, p) => n + p.text.length, 0);

/** El docente aceptó (checkbox aparte) enviar imágenes de páginas con fórmulas a la IA de visión. */
export async function hasVisionConsent(ctx: Ctx, presentationId: string): Promise<boolean> {
  const [e] = await ctx.db.select({ id: schema.events.id }).from(schema.events)
    .where(and(eq(schema.events.presentationId, presentationId), eq(schema.events.name, "consent_ocr_vision"))).limit(1);
  return !!e;
}

async function setProgress(ctx: Ctx, presentationId: string, progress: string | null) {
  await ctx.db.update(schema.presentations).set({ progress }).where(eq(schema.presentations.id, presentationId)).catch(() => {});
}

/**
 * OCR de las páginas sin texto de un PDF. Nunca registra texto ni imágenes; solo metadatos en `ocr_pages`.
 * Degrada a solo Tesseract si no hay consentimiento, cupo o modelo de visión.
 */
export async function ocrForPdf(ctx: Ctx, p: Pres, uploadId: string | null, buf: Buffer, ex: Extracted, deps?: Partial<OcrEngineDeps>): Promise<OcrRun> {
  const needs = ex.needsOcr;
  if (!needs) return { ex, note: null };
  const have = textLen(ex);
  const avail = deps ? { ok: true, missing: [] as string[] } : await checkOcrAvailable();
  if (!avail.ok) {
    ctx.log("ocr: herramientas no disponibles", { missing: avail.missing.join(",") });
    if (have >= LIMITS.minTextChars) return { ex: { ...ex, needsOcr: undefined }, note: `Se omitieron ${needs.pages.length} páginas sin texto: el OCR no está disponible en este servidor.` };
    throw new LaminaError("extraction_failed", "Este PDF parece un escaneo y el OCR no está disponible en este servidor.", 422);
  }
  const consent = uploadId !== null && (await hasVisionConsent(ctx, p.id));
  const vision: VisionHook | undefined = consent
    ? {
        reserve: () => tryConsumeQuota(ctx.db, p.ownerId, "ocr_vision_page"),
        release: () => refundQuota(ctx.db, p.ownerId, "ocr_vision_page"),
        async transcribe(png, page) {
          const r = await ctx.ai.structured({
            role: "vision", task: VISION_TASK, schema: VisionPage, presentationId: p.id, maxTokens: 6000, temperature: 0,
            system: visionSystem(), user: visionUser(page), images: [{ mime: "image/png", base64: png.toString("base64") }],
            fakeContext: { page },
          });
          return { text_md: r.text_md, formulas: r.formulas };
        },
      }
    : undefined;

  const metas: OcrPageMeta[] = [];
  let outcome;
  try {
    outcome = await ocrPdf(buf, needs, {
      vision, deps,
      onProgress: (done, total) => setProgress(ctx, p.id, `OCR página ${done} de ${total}`),
      onPage: async (m) => {
        metas.push(m);
        if (!uploadId) return;
        await ctx.db.insert(schema.ocrPages).values({ uploadId, page: m.page, engine: m.engine, confidence: m.confidence === null ? null : Math.round(m.confidence), chars: m.chars, status: m.status })
          .onConflictDoUpdate({ target: [schema.ocrPages.uploadId, schema.ocrPages.page, schema.ocrPages.engine], set: { confidence: m.confidence, chars: m.chars, status: m.status } }).catch(() => {});
      },
    });
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") throw new LaminaError("extraction_failed", "El OCR no está disponible en este servidor.", 422);
    throw e;
  }
  const merged = mergeOcr(ex, outcome);
  if (textLen(merged) < LIMITS.minOcrChars)
    throw new LaminaError("extraction_failed", "No se pudo reconocer texto en el PDF escaneado (imagen borrosa, manuscrita o demasiado grande).", 422);
  await ctx.db.insert(schema.events).values({
    name: "ocr_done", userId: p.ownerId, presentationId: p.id,
    data: { pages: needs.pages.length, read: outcome.pages.length, vision: outcome.pages.filter((x) => x.ocr?.engine === "vision").length, skipped: outcome.skipped.length, visionStatus: outcome.vision },
  }).catch(() => {});
  return { ex: merged, note: ocrNote(merged.pages, outcome, consent) };
}
