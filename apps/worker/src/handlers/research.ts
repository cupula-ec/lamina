import fs from "node:fs/promises";
import path from "node:path";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { AREA_PACKS, LaminaError, detectArea } from "@lamina/contracts";
import { researchQueriesSystem } from "@lamina/ai";
import { flagEnabled, schema } from "@lamina/db";
import { enqueue } from "@lamina/jobs";
import {
  chunkText, extractFromBuffer, htmlToMarkdown, pdfToText, safeFetch, searchWithFallback, wrapUntrusted, type Extracted,
} from "@lamina/research";
import type { Ctx } from "../ctx";
import { ocrForPdf } from "../ocr";
import { expectStage } from "../run";

const Queries = z.object({ queries: z.array(z.string().min(3).max(160)).min(1).max(4) });
const MAX_SEARCHES = 4;   // tope propio (≤ 6 del plan)
const MAX_FETCHES = 12;   // plan: máx. 12 fetch
const MAX_CHUNKS_PER_SOURCE = 10;

async function saveChunks(ctx: Ctx, presentationId: string, sourceId: string, ex: Extracted) {
  const chunks = chunkText(ex.pages).slice(0, MAX_CHUNKS_PER_SOURCE * (ex.pages.length > 1 ? 6 : 1));
  if (!chunks.length) throw new LaminaError("extraction_failed", "No se obtuvo texto de la fuente", 422);
  await ctx.db.insert(schema.sourceChunks).values(chunks.map((c) => ({ sourceId, presentationId, ord: c.ord, page: c.page ?? null, text: c.text })));
}

async function extractFromUrl(url: string, ocr?: (buf: Buffer, ex: Extracted) => Promise<Extracted>): Promise<Extracted> {
  const doc = await safeFetch(url);
  if (doc.contentType === "application/pdf") {
    const ex = await pdfToText(doc.body, new URL(doc.url).pathname.split("/").pop() || "documento.pdf");
    return ex.needsOcr && ocr ? ocr(doc.body, ex) : { ...ex, needsOcr: undefined };
  }
  if (/wordprocessingml/.test(doc.contentType)) return (await extractFromBuffer(doc.body, "documento.docx", doc.contentType));
  if (doc.contentType.startsWith("text/plain") || doc.contentType.includes("markdown")) {
    const text = doc.body.toString("utf8").trim();
    if (text.length < 120) throw new LaminaError("extraction_failed", "La página no contiene texto suficiente", 422);
    return { title: new URL(doc.url).hostname, pages: [{ text: text.slice(0, 200_000) }] };
  }
  return htmlToMarkdown(doc.body.toString("utf8"), doc.url);
}

/** Procesa las fuentes aportadas por el docente (pendientes): URLs, archivos y notas. */
async function processTeacherSources(ctx: Ctx, p: typeof schema.presentations.$inferSelect) {
  const presentationId = p.id;
  const pending = await ctx.db.select().from(schema.sources).where(and(eq(schema.sources.presentationId, presentationId), eq(schema.sources.status, "pending")));
  for (const s of pending) {
    try {
      let ex: Extracted;
      let note: string | null = null;
      if (s.kind === "url" && s.url) {
        ex = await extractFromUrl(s.url, async (buf, e) => { const r = await ocrForPdf(ctx, p, null, buf, e); note = r.note; return r.ex; });
      }
      else if (s.kind === "upload" && s.uploadId) {
        const [u] = await ctx.db.select().from(schema.uploads).where(eq(schema.uploads.id, s.uploadId));
        if (!u) throw new LaminaError("extraction_failed", "Archivo no encontrado", 404);
        const buf = await fs.readFile(path.resolve(u.storagePath));
        ex = await extractFromBuffer(buf, u.filename, u.mime);
        if (ex.needsOcr) { const r = await ocrForPdf(ctx, p, u.id, buf, ex); ex = r.ex; note = r.note; }
      } else throw new LaminaError("extraction_failed", "Fuente sin contenido", 422);
      await saveChunks(ctx, presentationId, s.id, ex);
      const ocrUsed = ex.pages.some((pg) => pg.ocr);
      await ctx.db.update(schema.sources).set({ status: "ok", title: ocrUsed ? `${s.title || ex.title} (OCR)`.slice(0, 200) : s.title || ex.title, error: note }).where(eq(schema.sources.id, s.id));
    } catch (e) {
      const msg = e instanceof LaminaError ? e.message : "No se pudo procesar la fuente";
      await ctx.db.update(schema.sources).set({ status: "failed", error: msg }).where(eq(schema.sources.id, s.id));
    }
  }
}

function heuristicQueries(topic: string, level: string, hints?: string[]): string[] {
  if (hints?.length) return [`${topic} ${level}`, ...hints.map((h) => h.replace("{t}", topic))].slice(0, 3);
  return [`${topic} ${level}`, `${topic} explicación ejemplos resueltos`, `${topic} definición teorema`].slice(0, 3);
}

async function webResearch(ctx: Ctx, p: typeof schema.presentations.$inferSelect) {
  const [existing] = await ctx.db.select().from(schema.sources).where(and(eq(schema.sources.presentationId, p.id), eq(schema.sources.kind, "search"))).limit(1);
  if (existing) return; // ya investigado (reintento): no repetir
  if (!ctx.search.length) {
    await ctx.db.insert(schema.sources).values({ presentationId: p.id, kind: "search", origin: "research", title: "Búsqueda web", status: "failed", error: "La búsqueda web no está configurada en este servidor." });
    return;
  }
  const v3Areas = await flagEnabled(ctx.db, "v3_areas", { userId: p.ownerId, presentationId: p.id });
  let queries = heuristicQueries(p.topic, p.level, v3Areas ? AREA_PACKS[detectArea({ explicit: p.area, subject: p.subject, topic: p.topic })].researchQueryHints : undefined);
  try {
    const q = await ctx.ai.structured({
      role: "research", task: "research.queries", schema: Queries, presentationId: p.id, maxTokens: 400, temperature: 0.2,
      system: researchQueriesSystem(),
      user: `Tema: ${p.topic}\nNivel: ${p.level}\nObjetivo: ${p.objective}\nPropón entre 2 y 4 consultas de búsqueda para encontrar explicaciones fiables, definiciones y ejemplos resueltos.`,
      fakeContext: { topic: p.topic },
    });
    queries = q.queries.slice(0, MAX_SEARCHES);
  } catch { /* se usan las consultas heurísticas */ }

  const seen = new Set<string>();
  const perHost = new Map<string, number>();
  const hits: { title: string; url: string; snippet: string }[] = [];
  let lastError = "";
  for (const q of queries) {
    try {
      const r = await searchWithFallback(ctx.search, q, { max: 6 });
      for (const h of r.hits) {
        let host: string;
        try { host = new URL(h.url).hostname; } catch { continue; }
        if (seen.has(h.url) || (perHost.get(host) ?? 0) >= 2) continue;
        seen.add(h.url); perHost.set(host, (perHost.get(host) ?? 0) + 1); hits.push(h);
      }
    } catch (e) { lastError = (e as Error).message; }
  }
  if (!hits.length) {
    await ctx.db.insert(schema.sources).values({ presentationId: p.id, kind: "search", origin: "research", title: "Búsqueda web", status: "failed", error: lastError || "La búsqueda no devolvió resultados." });
    return;
  }
  let fetched = 0, ok = 0;
  for (const h of hits) {
    if (fetched >= MAX_FETCHES || ok >= 6) break;
    fetched++;
    try {
      const ex = await extractFromUrl(h.url);
      const [s] = await ctx.db.insert(schema.sources).values({ presentationId: p.id, kind: "search", origin: "research", url: h.url, title: (ex.title || h.title).slice(0, 200), status: "ok" }).returning();
      try { await saveChunks(ctx, p.id, s!.id, ex); ok++; } catch { await ctx.db.delete(schema.sources).where(eq(schema.sources.id, s!.id)); }
    } catch { /* fuente inaccesible: se omite, no se simula */ }
  }
  if (ok === 0) await ctx.db.insert(schema.sources).values({ presentationId: p.id, kind: "search", origin: "research", title: "Búsqueda web", status: "failed", error: "No se pudo leer ninguna de las páginas encontradas." });
  void wrapUntrusted;
}

export async function research(ctx: Ctx, data: { presentationId: string; userId: string }) {
  const p = await expectStage(ctx, data.presentationId, "researching");
  if (!p) return;
  try {
    await processTeacherSources(ctx, p);
  } finally {
    await ctx.db.update(schema.presentations).set({ progress: null }).where(eq(schema.presentations.id, p.id)).catch(() => {});
  }
  await webResearch(ctx, p);
  const cur = await expectStage(ctx, p.id, "researching");
  if (!cur) return;
  try {
    await enqueue(ctx.boss, "content.generate", { presentationId: p.id, userId: p.ownerId, baseVersionId: null }, { base: "init" });
  } catch (e) {
    if (!(e instanceof LaminaError && e.code === "job_in_progress")) throw e;
  }
}
