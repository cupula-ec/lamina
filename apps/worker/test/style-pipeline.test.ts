import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, runMigrations, schema, workflow as wf } from "@lamina/db";
import { AiClient } from "@lamina/ai";
import { DeckDocument, isStyleProposal } from "@lamina/contracts";
import { varietyViolations, validateDeckAgainstCatalog } from "@lamina/components";
import { eq } from "drizzle-orm";
import type { Ctx } from "../src/ctx";
import { makeFakeProvider } from "../src/fake-provider";
import { makeHooks } from "../src/ai";
import { contentGenerate } from "../src/handlers/content";
import { designGenerate } from "../src/handlers/design";

const URL = "postgres://lamina:lamina@127.0.0.1:55432/lamina_style_test";
let h: ReturnType<typeof createDb>;
let ctx: Ctx;

beforeAll(async () => {
  const admin = createDb(URL.replace(/\/[^/]+$/, "/postgres"), 1);
  await admin.pool.query("drop database if exists lamina_style_test with (force)");
  await admin.pool.query("create database lamina_style_test");
  await admin.pool.end();
  h = createDb(URL, 4);
  await runMigrations(h.db);
  const boss: any = { send: async () => "id" };
  ctx = { env: { LAMINA_AI_PROVIDER: "fake", AI_DAILY_BUDGET: 1000 } as any, db: h.db, boss, search: [], ai: new AiClient({ provider: makeFakeProvider(), hooks: makeHooks(h.db, 1000) }), log: () => {} };
});
afterAll(async () => { await h.pool.end(); });

async function design(topic: string, subject: string | undefined, pref?: string) {
  const id = `u${Math.random().toString(36).slice(2)}`;
  await h.db.insert(schema.user).values({ id, name: "Prof. Prueba", email: `${id}@t.test` });
  const p = await wf.createPresentation(h.db, id, { title: "t", topic, level: "Universidad", objective: "Comprender", ...(subject ? { subject } : {}) });
  if (pref) await h.db.update(schema.presentations).set({ themeId: pref }).where(eq(schema.presentations.id, p.id));
  await wf.beginContentGeneration(h.db, p.id, id, { name: "research", payload: {} });
  await contentGenerate(ctx, { presentationId: p.id, baseVersionId: null });
  const pr = (await h.db.select().from(schema.presentations).where(eq(schema.presentations.id, p.id)))[0]!;
  const [cv] = await h.db.select().from(schema.contentVersions).where(eq(schema.contentVersions.id, pr.currentContentVersionId!));
  await wf.approveContent(h.db, p.id, id, cv!.id, cv!.sha256);
  await wf.beginDesign(h.db, p.id, id, { name: "design.generate", payload: {} });
  await designGenerate(ctx, { presentationId: p.id, contentVersionId: cv!.id, baseDeckVersionId: null });
  const cur = (await h.db.select().from(schema.presentations).where(eq(schema.presentations.id, p.id)))[0]!;
  const [dv] = await h.db.select().from(schema.deckVersions).where(eq(schema.deckVersions.id, cur.currentDeckVersionId!));
  return { p: cur, deck: DeckDocument.parse(dv!.deck), versionId: dv!.id, contentVersionId: cv!.id, owner: id };
}

describe("diseño: estilo y variedad", () => {
  it("la IA propone el estilo y se guarda en presentations.theme_id y deck.themeId", async () => {
    const r = await design("Cinemática del movimiento", "Física I");
    expect(r.deck.themeId).toBe("fisica-aurora");
    expect(r.p.themeId).toBe("fisica-aurora:a:ia"); // propuesta de la IA, no elección del docente
    expect(isStyleProposal(r.p.themeId)).toBe(true);
    expect(validateDeckAgainstCatalog(r.deck).ok).toBe(true);
  });
  it("Cálculo y Física generan estilos distintos con el mismo código", async () => {
    const calc = await design("La derivada", "Cálculo I");
    const fis = await design("Dinámica de partículas", "Física");
    expect(calc.deck.themeId).toBe("calculo-editorial");
    expect(fis.deck.themeId).toBe("fisica-aurora");
    expect(calc.deck.themeId).not.toBe(fis.deck.themeId);
  });
  it("la elección del docente (tema:acento) manda sobre la IA", async () => {
    const r = await design("La derivada", "Cálculo I", "pizarra:c");
    expect(r.deck.themeId).toBe("pizarra");
    expect(r.deck.accent).toBe("c");
    expect(r.p.themeId).toBe("pizarra:c");
  });
  it("la regeneración conserva el estilo del deck vigente", async () => {
    const r = await design("La derivada", "Cálculo I");
    await h.db.update(schema.presentations).set({ stage: "design_review" }).where(eq(schema.presentations.id, r.p.id));
    await wf.beginDesign(h.db, r.p.id, r.owner, { name: "design.generate", payload: {} });
    await designGenerate(ctx, { presentationId: r.p.id, contentVersionId: r.contentVersionId, baseDeckVersionId: r.versionId, feedback: "más sobrio" });
    const cur = (await h.db.select().from(schema.presentations).where(eq(schema.presentations.id, r.p.id)))[0]!;
    const [dv] = await h.db.select().from(schema.deckVersions).where(eq(schema.deckVersions.id, cur.currentDeckVersionId!));
    expect(DeckDocument.parse(dv!.deck).themeId).toBe("calculo-editorial");
  });
  it("el deck nunca tiene más de 2 diapositivas consecutivas con el mismo layout (salvo contenido exigente)", async () => {
    const r = await design("La derivada", "Cálculo I");
    const layouts = r.deck.slides.map((s) => s.layout);
    expect(varietyViolations(layouts)).toEqual([]);
    expect(layouts[0]).toBe("cover-branded");
    expect(new Set(layouts).size).toBeGreaterThanOrEqual(5);
  });
});
