import { afterAll, beforeAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";
import { createDb, runMigrations, schema, workflow as wf } from "@lamina/db";
import { AiClient, FakeProvider, VISION_TASK } from "@lamina/ai";
import { checkOcrAvailable, pdfToText } from "@lamina/research";
import type { Ctx } from "../src/ctx";
import { makeHooks } from "../src/ai";
import { research } from "../src/handlers/research";
import { ocrForPdf } from "../src/ocr";

const URL = "postgres://lamina:lamina@127.0.0.1:55432/lamina_worker_ocr_test";
const FX = path.join(__dirname, "../../../packages/research/test/fixtures");
let h: ReturnType<typeof createDb>;
let dir: string;
const avail = await checkOcrAvailable();

const vision = { handler: (_: any): unknown => ({ text_md: "Teorema: $$\\int_a^b f(x)\\,dx=F(b)-F(a)$$", formulas: [{ latex: "\\int_a^b f(x)\\,dx=F(b)-F(a)" }] }), calls: 0 };
const provider = new FakeProvider({ [VISION_TASK]: (r) => { vision.calls++; return vision.handler(r); } });
let ctx: Ctx;
const logs: string[] = [];

beforeAll(async () => {
  const admin = createDb(URL.replace(/\/[^/]+$/, "/postgres"), 1);
  await admin.pool.query("drop database if exists lamina_worker_ocr_test with (force)");
  await admin.pool.query("create database lamina_worker_ocr_test");
  await admin.pool.end();
  h = createDb(URL, 4);
  await runMigrations(h.db);
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "lamina-test-up-"));
  const boss: any = { send: async () => "id" };
  ctx = { env: { LAMINA_AI_PROVIDER: "fake", AI_DAILY_BUDGET: 1000 } as any, db: h.db, boss, search: [], ai: new AiClient({ provider, hooks: makeHooks(h.db, 1000) }), log: (m, x) => void logs.push(`${m} ${JSON.stringify(x ?? {})}`) };
});
afterAll(async () => { await h.pool.end(); fs.rmSync(dir, { recursive: true, force: true }); });

async function setup(file: string, opts: { consent?: boolean; visionQuota?: number } = {}) {
  const id = `u${Math.random().toString(36).slice(2)}`;
  await h.db.insert(schema.user).values({ id, name: "Prof", email: `${id}@t.test` });
  if (opts.visionQuota !== undefined) await h.db.insert(schema.userProfiles).values({ userId: id, quotaOverrides: { ocr_vision_page: opts.visionQuota } });
  const p = await wf.createPresentation(h.db, id, { title: "t", topic: "Derivadas", level: "Universidad", objective: "Entender derivadas" });
  await wf.beginContentGeneration(h.db, p.id, id, { name: "research", payload: { presentationId: p.id, userId: id } });
  const dest = path.join(dir, `${p.id}.pdf`);
  fs.copyFileSync(path.join(FX, file), dest);
  const [u] = await h.db.insert(schema.uploads).values({ presentationId: p.id, filename: file, mime: "application/pdf", bytes: fs.statSync(dest).size, sha256: "x", storagePath: dest }).returning();
  const [s] = await h.db.insert(schema.sources).values({ presentationId: p.id, kind: "upload", origin: "teacher", title: file, uploadId: u!.id, status: "pending" }).returning();
  if (opts.consent) await h.db.insert(schema.events).values({ name: "consent_ocr_vision", userId: id, presentationId: p.id, data: {} });
  return { id, p, u: u!, s: s! };
}
const load = async (pid: string, sid: string) => ({
  src: (await h.db.select().from(schema.sources).where(eq(schema.sources.id, sid)))[0]!,
  chunks: await h.db.select().from(schema.sourceChunks).where(eq(schema.sourceChunks.sourceId, sid)),
  pres: (await h.db.select().from(schema.presentations).where(eq(schema.presentations.id, pid)))[0]!,
});

describe.skipIf(!avail.ok)(`research con PDF escaneado y OCR real (se omite si faltan: ${avail.missing.join(", ") || "—"})`, () => {
  it("sin consentimiento de visión: solo Tesseract, fuente marcada como OCR, metadatos sin texto y sin llamadas a visión", async () => {
    vision.calls = 0;
    const { p, u, s } = await setup("escaneado-es.pdf");
    await research(ctx, { presentationId: p.id, userId: p.ownerId });
    const { src, chunks, pres } = await load(p.id, s.id);
    expect(src.status).toBe("ok");
    expect(src.title).toMatch(/\(OCR\)$/);
    expect(src.error).toMatch(/Texto reconocido por OCR.*puede contener errores/);
    expect(chunks.map((c) => c.text).join(" ").toLowerCase()).toMatch(/derivada/);
    expect(vision.calls).toBe(0);
    expect(pres.progress).toBeNull();
    const meta = await h.db.select().from(schema.ocrPages).where(eq(schema.ocrPages.uploadId, u.id));
    expect(meta.map((m) => [m.page, m.engine]).sort()).toEqual([[1, "tesseract"], [2, "tesseract"]]);
    expect(JSON.stringify(meta)).not.toMatch(/derivada/i);
    expect(await h.db.select().from(schema.aiCalls).where(eq(schema.aiCalls.presentationId, p.id))).toEqual(expect.not.arrayContaining([expect.objectContaining({ role: "vision" })]));
  }, 90_000);

  it("con consentimiento: la página con fórmulas pasa por visión, se valida con KaTeX y consume cuota ocr_vision_page", async () => {
    vision.calls = 0;
    const { p, id, s } = await setup("formulas.pdf", { consent: true });
    await research(ctx, { presentationId: p.id, userId: id });
    const { src, chunks } = await load(p.id, s.id);
    expect(vision.calls).toBe(1);
    expect(src.error).not.toMatch(/sin verificar/);
    expect(chunks.map((c) => c.text).join(" ")).toContain("\\int_a^b");
    const [q] = await h.db.select().from(schema.usageCounters).where(eq(schema.usageCounters.scope, `u:${id}`));
    expect(q).toMatchObject({ kind: "ocr_vision_page", count: 1 });
    const calls = await h.db.select().from(schema.aiCalls).where(eq(schema.aiCalls.presentationId, p.id));
    expect(calls.filter((c) => c.role === "vision")).toHaveLength(1);
    expect(calls[0]!.model).toMatch(/:free$/);
    expect(JSON.stringify(calls)).not.toMatch(/int_a|base64|iVBOR/);
  }, 90_000);

  it("sin cupo de visión: degrada a Tesseract y lo avisa (no entra en quota_wait)", async () => {
    vision.calls = 0;
    const { p, id, s } = await setup("formulas.pdf", { consent: true, visionQuota: 0 });
    await research(ctx, { presentationId: p.id, userId: id });
    const { src, pres } = await load(p.id, s.id);
    expect(vision.calls).toBe(0);
    expect(src.status).toBe("ok");
    expect(src.error).toMatch(/Fórmulas sin verificar por visión.*cupo diario/);
    expect(pres.stage).not.toBe("quota_wait");
  }, 90_000);

  it("el modelo de visión falla: degrada a Tesseract, devuelve el cupo y marca fórmulas sin verificar", async () => {
    const prev = vision.handler;
    vision.handler = () => { throw new Error("modelo caído"); };
    try {
      const { p, id, s } = await setup("formulas.pdf", { consent: true });
      await research(ctx, { presentationId: p.id, userId: id });
      const { src } = await load(p.id, s.id);
      expect(src.status).toBe("ok");
      expect(src.error).toMatch(/visión no estuvo disponible/);
      const q = await h.db.select().from(schema.usageCounters).where(eq(schema.usageCounters.scope, `u:${id}`));
      expect(q[0]?.count ?? 0).toBe(0);
    } finally { vision.handler = prev; }
  }, 90_000);

  it("PDF hostil (página enorme): la fuente falla con mensaje amigable, sin colgar el job", async () => {
    const { p, s } = await setup("hostil-pagina-enorme.pdf");
    await research(ctx, { presentationId: p.id, userId: p.ownerId });
    const { src } = await load(p.id, s.id);
    expect(src.status).toBe("failed");
    expect(src.error).toMatch(/No se pudo reconocer texto/);
  }, 60_000);
});

describe("ocrForPdf (binarios simulados)", () => {
  it("sin herramientas de OCR y PDF sin texto: error amigable (no excepción cruda)", async () => {
    const { p } = await setup("escaneado-es.pdf");
    const buf = fs.readFileSync(path.join(FX, "escaneado-es.pdf"));
    const ex = await pdfToText(buf, "x.pdf");
    const old = process.env.PATH;
    process.env.PATH = "/nonexistent";
    try {
      const { resetOcrAvailabilityCache } = await import("@lamina/research");
      resetOcrAvailabilityCache();
      const row = (await h.db.select().from(schema.presentations).where(eq(schema.presentations.id, p.id)))[0]!;
      await expect(ocrForPdf(ctx, row, null, buf, ex)).rejects.toMatchObject({ code: "extraction_failed", message: expect.stringMatching(/OCR no está disponible/) });
    } finally {
      process.env.PATH = old;
      (await import("@lamina/research")).resetOcrAvailabilityCache();
    }
  });
});
