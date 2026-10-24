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
import { designRepair, repairTargets } from "../src/handlers/repair";
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
    const p = await wf.createPresentation(h.db, o, { title: "t", topic: "La derivada", level: "Universidad", objective: "Entender la derivada", subject: "Cálculo I", period: " Abr–Ago 2026 " });
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
    // el borrador queda en "designing" hasta que render + reparación puntual terminen
    expect(cur.stage).toBe("designing");
    expect(sent.at(-1)!.name).toBe("render");
    expect(sent.at(-1)!.data).toMatchObject({ then: "repair", attempt: 0 });
    await wf.designFinish(h.db, p.id, cur.currentDeckVersionId!);
    cur = (await h.db.select().from(schema.presentations).where(eq(schema.presentations.id, p.id)))[0]!;
    expect(cur.stage).toBe("design_review");
    const [dv] = await h.db.select().from(schema.deckVersions).where(eq(schema.deckVersions.id, cur.currentDeckVersionId!));
    const deck = DeckDocument.parse(dv!.deck);
    expect(deck.slides.length).toBeGreaterThan(8);
    // branding: solo lo que existe (sin institución, logo ni grupo → sin claves vacías)
    expect(deck.meta.branding).toEqual({ teacher: "Prof. Prueba", subject: "Cálculo I", period: "Abr–Ago 2026" });
    expect(deck.slides[0]).toMatchObject({ id: "title", layout: "cover-branded" });
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

  it("reparación puntual: corrige solo la diapositiva con error, copia las demás y re-renderiza", async () => {
    const o = await user();
    const p = await wf.createPresentation(h.db, o, { title: "t", topic: "La derivada", level: "U", objective: "o" });
    await wf.beginContentGeneration(h.db, p.id, o, { name: "research", payload: {} });
    await contentGenerate(ctx, { presentationId: p.id, baseVersionId: null });
    const pr = (await h.db.select().from(schema.presentations).where(eq(schema.presentations.id, p.id)))[0]!;
    const [cv] = await h.db.select().from(schema.contentVersions).where(eq(schema.contentVersions.id, pr.currentContentVersionId!));
    await wf.approveContent(h.db, p.id, o, cv!.id, cv!.sha256);
    await wf.beginDesign(h.db, p.id, o, { name: "design.generate", payload: {} });
    await designGenerate(ctx, { presentationId: p.id, contentVersionId: cv!.id, baseDeckVersionId: null });
    const cur = (await h.db.select().from(schema.presentations).where(eq(schema.presentations.id, p.id)))[0]!;
    const v1 = cur.currentDeckVersionId!;
    const [dv] = await h.db.select().from(schema.deckVersions).where(eq(schema.deckVersions.id, v1));
    const deck = DeckDocument.parse(dv!.deck);
    const bad = deck.slides[3]!.id;
    const err = { slot: "main", kind: "overflow", severity: "error", message: "La matriz se sale de la diapositiva por la derecha.", detail: "mide 988×878" };
    await h.db.insert(schema.renderArtifacts).values(deck.slides.map((s) => ({ presentationId: p.id, deckVersionId: v1, slideId: s.id, path: `/x/${s.id}.png`, issues: s.id === bad ? [err] : [] })));
    expect([...repairTargets(await h.db.select().from(schema.renderArtifacts).where(eq(schema.renderArtifacts.deckVersionId, v1))).keys()]).toEqual([bad]);

    // el proveedor fake devuelve la misma diapositiva → no hay cambios → se cierra el diseño sin crear versión
    await designRepair(ctx, { presentationId: p.id, userId: o, deckVersionId: v1, attempt: 0 });
    let after = (await h.db.select().from(schema.presentations).where(eq(schema.presentations.id, p.id)))[0]!;
    expect(after.stage).toBe("design_review");
    expect(after.currentDeckVersionId).toBe(v1);

    // con un proveedor que sí cambia la diapositiva: nueva versión "repair", artefactos copiados y render encolado
    await wf.beginDesign(h.db, p.id, o, { name: "design.repair", payload: {} });
    const fixing: Ctx = { ...ctx, ai: new AiClient({ provider: { chat: async (req: any) => ({ text: JSON.stringify({ slide: { ...(req.fakeContext as any).slide, notes: "corregida" } }), promptTokens: 0, completionTokens: 0 }) } as any, hooks: makeHooks(h.db, 1000) }) };
    await designRepair(fixing, { presentationId: p.id, userId: o, deckVersionId: v1, attempt: 0 });
    after = (await h.db.select().from(schema.presentations).where(eq(schema.presentations.id, p.id)))[0]!;
    expect(after.stage).toBe("designing");
    expect(after.currentDeckVersionId).not.toBe(v1);
    const [v2] = await h.db.select().from(schema.deckVersions).where(eq(schema.deckVersions.id, after.currentDeckVersionId!));
    expect(v2).toMatchObject({ kind: "repair", parentId: v1, authorKind: "ia" });
    const copied = await h.db.select().from(schema.renderArtifacts).where(eq(schema.renderArtifacts.deckVersionId, v2!.id));
    expect(copied.length).toBe(deck.slides.length - 1); // la corregida se re-renderiza
    expect(copied.some((a) => a.slideId === bad)).toBe(false);
    expect(sent.at(-1)!.data).toMatchObject({ deckVersionId: v2!.id, then: "repair", attempt: 1 });
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

describe("jobs durables (V3 bloque 1)", () => {
  it("matar el worker a media generación y reanudar sin repetir las diapositivas ya hechas", async () => {
    const { setFlag } = await import("@lamina/db");
    await setFlag(h.db, "v3_durable_jobs", { mode: "all" });
    const o = await user();
    const p = await wf.createPresentation(h.db, o, { title: "t", topic: "La derivada", level: "U", objective: "o" });
    await wf.beginContentGeneration(h.db, p.id, o, { name: "research", payload: {} });
    await contentGenerate(ctx, { presentationId: p.id, baseVersionId: null });
    const pr = (await h.db.select().from(schema.presentations).where(eq(schema.presentations.id, p.id)))[0]!;
    const [cv] = await h.db.select().from(schema.contentVersions).where(eq(schema.contentVersions.id, pr.currentContentVersionId!));
    await wf.approveContent(h.db, p.id, o, cv!.id, cv!.sha256);
    await wf.beginDesign(h.db, p.id, o, { name: "design.generate", payload: {} });

    const fake = makeFakeProvider();
    let slideCalls = 0;
    const counting = (dieAt: number): Ctx => ({
      ...ctx,
      ai: new AiClient({
        hooks: makeHooks(h.db, 1000),
        provider: { chat: async (r) => { if (r.task === "design.slide") { if (slideCalls >= dieAt) throw new Error("proceso muerto"); slideCalls++; } return fake.chat(r); } },
      }),
    });
    const payload = { presentationId: p.id, contentVersionId: cv!.id, baseDeckVersionId: null };
    await expect(designGenerate(counting(4), payload)).rejects.toThrow("proceso muerto");
    expect(slideCalls).toBe(4);
    const progress = (await h.db.select().from(schema.presentations).where(eq(schema.presentations.id, p.id)))[0]!.progress;
    expect(progress).toMatch(/^4 de \d+ diapositivas listas$/);

    slideCalls = 0;
    await designGenerate(counting(Infinity), payload); // reintento: reanuda
    const total = Number(progress!.match(/de (\d+)/)![1]);
    expect(slideCalls).toBe(total - 4);
    const after = (await h.db.select().from(schema.presentations).where(eq(schema.presentations.id, p.id)))[0]!;
    expect(after.currentDeckVersionId).toBeTruthy();
    expect(await h.db.select().from(schema.workUnits).where(eq(schema.workUnits.presentationId, p.id))).toHaveLength(0);
  });
});
