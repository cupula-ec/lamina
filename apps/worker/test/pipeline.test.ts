import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, runMigrations, schema, workflow as wf, hashJson } from "@lamina/db";
import { AiClient } from "@lamina/ai";
import { ContentDraft, DeckDocument, LaminaError } from "@lamina/contracts";
import { eq } from "drizzle-orm";
import type { Ctx } from "../src/ctx";
import { makeFakeProvider } from "../src/fake-provider";
import { makeHooks } from "../src/ai";
import { research } from "../src/handlers/research";
import { contentGenerate, mergeSections } from "../src/handlers/content";
import { designGenerate, missingFormulas, mustKeep } from "../src/handlers/design";
import { applySuggestions, deterministicPolish, disallowedChanges, polish } from "../src/handlers/polish";
import { guarded } from "../src/run";

const URL = "postgres://lamina:lamina@127.0.0.1:55432/lamina_worker_test";
let h: ReturnType<typeof createDb>;
const sent: { name: string; data: any }[] = [];
let ctx: Ctx;

beforeAll(async () => {
  const admin = createDb(URL.replace(/\/[^/]+$/, "/postgres"), 1);
  await admin.pool.query("drop database if exists lamina_worker_test with (force)");
  await admin.pool.query("create database lamina_worker_test");
  await admin.pool.end();
  h = createDb(URL, 4);
  await runMigrations(h.db);
  const boss: any = { send: async (name: string, data: any) => { sent.push({ name, data }); return "id"; } };
  ctx = {
    env: { LAMINA_AI_PROVIDER: "fake", AI_DAILY_BUDGET: 1000 } as any, db: h.db, boss, search: [],
    ai: new AiClient({ provider: makeFakeProvider(), hooks: makeHooks(h.db, 1000) }), log: () => {},
  };
});
afterAll(async () => { await h.pool.end(); });

async function user() {
  const id = `u${Math.random().toString(36).slice(2)}`;
  await h.db.insert(schema.user).values({ id, name: "Prof. Prueba", email: `${id}@t.test` });
  return id;
}

describe("pipeline completo con proveedor fake", () => {
  it("research → contenido → aprobar → diseño → aprobar → pulido → publicar", async () => {
    const o = await user();
    const p = await wf.createPresentation(h.db, o, { title: "t", topic: "La derivada", level: "Universidad", objective: "Entender la derivada" });
    await wf.beginContentGeneration(h.db, p.id, o, { name: "research", payload: { presentationId: p.id, userId: o } });

    await research(ctx, { presentationId: p.id, userId: o });
    expect(sent.at(-1)!.name).toBe("content.generate");
    // sin búsqueda configurada: queda registrado el motivo y se avisa en el borrador
    const src = await h.db.select().from(schema.sources).where(eq(schema.sources.presentationId, p.id));
    expect(src[0]).toMatchObject({ kind: "search", status: "failed" });

    await contentGenerate(ctx, { presentationId: p.id, baseVersionId: null });
    let cur = (await h.db.select().from(schema.presentations).where(eq(schema.presentations.id, p.id)))[0]!;
    expect(cur.stage).toBe("content_review");
    const [cv] = await h.db.select().from(schema.contentVersions).where(eq(schema.contentVersions.id, cur.currentContentVersionId!));
    const draft = ContentDraft.parse(cv!.content);
    expect(draft.warnings.some((w) => /Búsqueda web no disponible/.test(w.message))).toBe(true);
    expect(draft.sections.length).toBeGreaterThanOrEqual(3);
    expect(draft.warnings.filter((w) => /Posible error matemático/.test(w.message))).toEqual([]);

    await wf.approveContent(h.db, p.id, o, cv!.id, cv!.sha256);
    await wf.beginDesign(h.db, p.id, o, { name: "design.generate", payload: {} });
    await designGenerate(ctx, { presentationId: p.id, contentVersionId: cv!.id, baseDeckVersionId: null });
    cur = (await h.db.select().from(schema.presentations).where(eq(schema.presentations.id, p.id)))[0]!;
    expect(cur.stage).toBe("design_review");
    expect(sent.at(-1)!.name).toBe("render");
    const [dv] = await h.db.select().from(schema.deckVersions).where(eq(schema.deckVersions.id, cur.currentDeckVersionId!));
    const deck = DeckDocument.parse(dv!.deck);
    expect(deck.slides.length).toBeGreaterThan(8);
    const used = new Set(deck.slides.flatMap((s) => Object.values(s.slots).map((r) => r.componentId)));
    for (const c of ["FunctionPlot", "Derivation", "WorkedExample", "Definition", "Table"]) expect(used.has(c)).toBe(true);

    // regeneración selectiva: solo un slide cambia y el resto se conserva idéntico
    await wf.approveDesign(h.db, p.id, o, dv!.id, dv!.sha256);
    await wf.beginPolish(h.db, p.id, o, { name: "polish", payload: {} });
    await polish(ctx, { presentationId: p.id, deckVersionId: dv!.id });
    cur = (await h.db.select().from(schema.presentations).where(eq(schema.presentations.id, p.id)))[0]!;
    expect(cur.stage).toBe("final_review");
    const [fv] = await h.db.select().from(schema.deckVersions).where(eq(schema.deckVersions.id, cur.finalDeckVersionId!));
    const final = DeckDocument.parse(fv!.deck);
    expect(disallowedChanges(deck, final)).toEqual([]);
    expect(final.slides.some((s) => s.build.steps.length > 0)).toBe(true);
    const pub = await wf.publish(h.db, p.id, o, "public");
    expect(pub.presentation.publishedDeckVersionId).toBe(fv!.id);
    const calls = await h.db.select().from(schema.aiCalls);
    expect(calls.every((c) => c.model.endsWith(":free"))).toBe(true);
  });

  it("regeneración de contenido conserva secciones bloqueadas y solo cambia las pedidas", async () => {
    const o = await user();
    const p = await wf.createPresentation(h.db, o, { title: "t", topic: "La derivada", level: "U", objective: "o" });
    await wf.beginContentGeneration(h.db, p.id, o, { name: "research", payload: {} });
    await contentGenerate(ctx, { presentationId: p.id, baseVersionId: null });
    const pr = (await h.db.select().from(schema.presentations).where(eq(schema.presentations.id, p.id)))[0]!;
    const [v1] = await h.db.select().from(schema.contentVersions).where(eq(schema.contentVersions.id, pr.currentContentVersionId!));
    const d1 = ContentDraft.parse(v1!.content);
    // el docente bloquea s2 y edita
    d1.sections[1]!.locked = true;
    d1.sections[1]!.title = "Reglas (editadas por el docente)";
    const edited = await wf.saveTeacherContent(h.db, p.id, o, { content: d1, sha256: hashJson(d1), baseVersionId: v1!.id });
    await wf.beginContentGeneration(h.db, p.id, o, { name: "content.generate", payload: {} });
    await contentGenerate(ctx, { presentationId: p.id, baseVersionId: edited.id, feedback: "más ejemplos", onlySectionIds: ["s1", "s2"] });
    const pr2 = (await h.db.select().from(schema.presentations).where(eq(schema.presentations.id, p.id)))[0]!;
    const [v3] = await h.db.select().from(schema.contentVersions).where(eq(schema.contentVersions.id, pr2.currentContentVersionId!));
    const d3 = ContentDraft.parse(v3!.content);
    expect(d3.sections[1]!.title).toBe("Reglas (editadas por el docente)"); // bloqueada: intacta
    expect(d3.sections[0]!.title).toContain("(revisada)");                  // pedida: regenerada
    expect(d3.sections[2]!.title).toBe(d1.sections[2]!.title);             // no pedida: igual
    expect(v3!.parentId).toBe(edited.id);
    // la versión anterior sigue ahí (no se sobrescribe)
    const all = await h.db.select().from(schema.contentVersions).where(eq(schema.contentVersions.presentationId, p.id));
    expect(all.length).toBe(3);
  });

  it("quota_wait: cuando la IA no tiene cupo el job pasa a quota_wait con hora de reanudación", async () => {
    const o = await user();
    const p = await wf.createPresentation(h.db, o, { title: "t", topic: "T", level: "U", objective: "o" });
    await wf.beginContentGeneration(h.db, p.id, o, { name: "content.generate", payload: { presentationId: p.id, userId: o, baseVersionId: null } });
    const exhausted: Ctx = { ...ctx, ai: new AiClient({ provider: makeFakeProvider(), hooks: { onCall() {}, consumeBudget: () => false } }) };
    await guarded(exhausted, "content.generate", contentGenerate as any)([{ data: { presentationId: p.id, baseVersionId: null } as any }]);
    const cur = (await h.db.select().from(schema.presentations).where(eq(schema.presentations.id, p.id)))[0]!;
    expect(cur.stage).toBe("quota_wait");
    expect(cur.resumeAt!.getTime()).toBeGreaterThan(Date.now());
    expect(cur.lastError).toMatch(/sin cupo/);
    const r = await wf.resumeFromWait(h.db, p.id, o);
    expect(r.pending.name).toBe("content.generate");
  });

  it("job obsoleto (etapa distinta) se descarta sin efectos", async () => {
    const o = await user();
    const p = await wf.createPresentation(h.db, o, { title: "t", topic: "T", level: "U", objective: "o" });
    await contentGenerate(ctx, { presentationId: p.id, baseVersionId: null }); // stage = draft → no hace nada
    expect((await h.db.select().from(schema.contentVersions).where(eq(schema.contentVersions.presentationId, p.id))).length).toBe(0);
  });
});

describe("utilidades", () => {
  it("mergeSections respeta bloqueadas y posiciones", () => {
    const S = (id: string, locked = false, t = id) => ({ id, title: t, locked, slidesHint: [{ id: `h${id}`, intent: "i", blocks: [{ id: `b${id}`, type: "text" as const, md: "x", origin: "generated" as const, sourceRefs: [] }] }] });
    const base = [S("a"), S("b", true, "B editada"), S("c")];
    expect(mergeSections(base, [S("a", false, "A2"), S("c", false, "C2")]).map((s) => s.title)).toEqual(["A2", "B editada", "C2"]);
    expect(mergeSections(base, [S("a", false, "A3")], ["a"]).map((s) => s.title)).toEqual(["A3", "B editada", "c"]);
  });
  it("missingFormulas detecta fórmulas alteradas por el modelo", () => {
    const hint: any = { id: "h", intent: "i", blocks: [{ id: "b", type: "formula", latex: "f'(x)=3x^2", origin: "generated", sourceRefs: [] }] };
    const ok: any = { id: "h", layout: "formula-focus", slots: { main: { componentId: "FormulaHighlight", version: "1.0.0", props: { latex: "f'(x) = 3x^2" } } } };
    const bad: any = { ...ok, slots: { main: { ...ok.slots.main, props: { latex: "f'(x)=3x^3" } } } };
    expect(mustKeep(hint)).toEqual(["f'(x)=3x^2"]);
    expect(missingFormulas(hint, ok)).toEqual([]);
    expect(missingFormulas(hint, bad)).toEqual(["f'(x)=3x^2"]);
    // subcadena NO vale: x^2 no está en x^2+1
    const sub: any = { ...ok, slots: { main: { ...ok.slots.main, props: { latex: "f'(x)=3x^2+1" } } } };
    expect(missingFormulas(hint, sub)).toEqual(["f'(x)=3x^2"]);
    const inline: any = { ...ok, slots: { main: { ...ok.slots.main, props: { md: "Entonces $f'(x)=3x^2$ siempre." } } } };
    expect(missingFormulas(hint, inline)).toEqual([]);
  });
  it("el pulido rechaza cualquier cambio de contenido", () => {
    const deck = DeckDocument.parse({ schemaVersion: 1, engineVersion: "1.0.0", meta: { title: "t", topic: "t", level: "u" }, slides: [
      { id: "a", layout: "title-content", slots: { title: { componentId: "SectionHeader", version: "1.0.0", props: { title: "x" } }, main: { componentId: "Derivation", version: "1.0.0", props: { steps: [{ latex: "a", explanation: "" }, { latex: "b", explanation: "" }, { latex: "c", explanation: "" }] } } } },
    ] });
    const polished = deterministicPolish(deck);
    expect(disallowedChanges(deck, polished)).toEqual([]);
    expect(polished.slides[0]!.build.steps).toHaveLength(3);
    const tampered = structuredClone(polished); (tampered.slides[0]!.slots.title!.props as any).title = "hackeado";
    expect(disallowedChanges(deck, tampered).length).toBeGreaterThan(0);
    const sug = applySuggestions(polished, { slides: [{ id: "a", transition: "zoom", build: { steps: [{ reveal: ["nope"] }] } }] });
    expect(sug.slides[0]!.transition).toBe("zoom");
    expect(sug.slides[0]!.build.steps).toHaveLength(3); // build inválido ignorado
    void LaminaError;
  });
});
