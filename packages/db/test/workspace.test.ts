import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { ENGINE_VERSION, parseDeckAny, type OpIssue, type WorkspaceOp } from "@lamina/contracts";
import { applyOpsPure, hashJson, schema, workflow as wf, workspace as ws, units } from "../src";
import { mkUser, testDb } from "./helpers";

let h: Awaited<ReturnType<typeof testDb>>;
beforeAll(async () => { h = await testDb("lamina_test_ws"); });
afterAll(async () => { await h.pool.end(); });

const comp = (id: string, props: Record<string, unknown> = {}) => ({ componentId: id, version: "1.0.0", props });
const mkDeck = () => ({
  schemaVersion: 1, engineVersion: ENGINE_VERSION, themeId: "lamina-claro", meta: { title: "T", topic: "t", level: "u" },
  slides: [
    { id: "a", layout: "title-content", slots: { title: comp("SectionHeader", { text: "A" }), main: comp("BulletPoints", { items: ["x"] }) }, notes: "", build: { steps: [] }, transition: "fade" },
    { id: "b", layout: "title-content", slots: { title: comp("SectionHeader", { text: "B" }), main: comp("BulletPoints", { items: ["y"] }) }, notes: "", build: { steps: [] }, transition: "fade" },
    { id: "c", layout: "title-content", slots: { title: comp("SectionHeader", { text: "C" }), main: comp("BulletPoints", { items: ["z"] }) }, notes: "", build: { steps: [] }, transition: "fade" },
  ],
});
const mkContent = () => ({
  schemaVersion: 1, meta: { topic: "Derivadas", level: "U", objective: "o", language: "es" },
  sections: [{ id: "s1", title: "Def", locked: false, slidesHint: [{ id: "h1", intent: "i", blocks: [{ id: "b1", type: "text", md: "hola", origin: "generated", sourceRefs: [] }] }] }],
  warnings: [],
});

/** Presentación en design_review con contenido y deck. */
async function setup() {
  const o = await mkUser(h.db);
  const p = await wf.createPresentation(h.db, o, { title: "t", topic: "Derivadas", level: "U", objective: "o" });
  await wf.beginContentGeneration(h.db, p.id, o);
  const c = mkContent();
  const cv = await wf.contentGenerated(h.db, p.id, { content: c, sha256: hashJson(c), parentId: null });
  await wf.approveContent(h.db, p.id, o, cv.id, cv.sha256);
  await wf.beginDesign(h.db, p.id, o);
  const d = mkDeck();
  await wf.designDrafted(h.db, p.id, { deck: d, sha256: hashJson(d), contentVersionId: cv.id, parentId: null });
  const cur = (await h.db.select().from(schema.presentations).where(eq(schema.presentations.id, p.id)))[0]!;
  await wf.designFinish(h.db, p.id, cur.currentDeckVersionId!);
  return { o, id: p.id };
}

describe("workspace: núcleo puro", () => {
  const state = () => ({ deck: parseDeckAny(mkDeck()), content: null });
  const ops: WorkspaceOp[] = [
    { op: "move_slide", slideId: "c", afterId: null },
    { op: "set_slot_props", slideId: "a", slot: "main", props: { items: ["nuevo"], extra: 1 } },
    { op: "set_notes", slideId: "b", notes: "ojo" },
    { op: "set_build", slideId: "a", steps: [{ reveal: ["main"] }] },
    { op: "remove_slide", slideId: "b" },
    { op: "add_slide", slide: { id: "n", layout: "title-content", slots: { title: comp("SectionHeader"), main: comp("BulletPoints") }, notes: "", build: { steps: [] }, transition: "fade" } as never, afterId: "a" },
    { op: "set_theme", themeId: "lamina-oscuro" as never },
  ];
  it("aplicar y luego deshacer devuelve el estado inicial (inversas en orden inverso)", () => {
    const r = applyOpsPure(state(), ops);
    expect(r.ok).toBe(true);
    expect(hashJson(r.state.deck)).not.toBe(hashJson(state().deck));
    const back = applyOpsPure(r.state, [...r.inverses].reverse());
    expect(back.ok).toBe(true);
    expect(hashJson(back.state.deck)).toBe(hashJson(state().deck));
  });
  it("es atómico: un op inválido no deja cambios a medias", () => {
    const r = applyOpsPure(state(), [{ op: "set_notes", slideId: "a", notes: "x" }, { op: "remove_slide", slideId: "zzz" }]);
    expect(r.ok).toBe(false);
    expect(r.issues[0]).toMatchObject({ opIndex: 1, code: "not_found" });
    expect(hashJson(r.state.deck)).toBe(hashJson(state().deck));
  });
  it("valida la estructura final (slot inexistente)", () => {
    const r = applyOpsPure(state(), [{ op: "set_slot", slideId: "a", slot: "inventado", ref: comp("X") }]);
    expect(r.ok).toBe(false);
    expect(r.issues[0]!.message).toMatch(/inventado/);
  });
  it("ops de contenido: bloque se añade, mueve y deshace", () => {
    const c = parseDeckAny; void c;
    const content = { ...mkContent() } as never;
    const add: WorkspaceOp = { op: "add_block", hintId: "h1", block: { id: "b2", type: "text", md: "dos", origin: "generated", sourceRefs: [] } as never };
    const r = applyOpsPure({ deck: null, content }, [add]);
    expect(r.ok).toBe(true);
    const back = applyOpsPure(r.state, r.inverses);
    expect(hashJson(back.state.content)).toBe(hashJson(content));
  });
});

describe("workspace: base de datos", () => {
  it("creación perezosa, dryRun = real, idempotencia por opId, stale_rev, deshacer y checkpoint", async () => {
    const { o, id } = await setup();
    const w0 = await ws.getWorkspace(h.db, id, o);
    expect(w0.rev).toBe(0);
    expect(parseDeckAny(w0.deck).slides).toHaveLength(3);

    const ops = [{ op: "set_notes", slideId: "a", notes: "nota IA" }, { op: "move_slide", slideId: "c", afterId: null }];
    const dry = await ws.applyOps(h.db, id, ops, "mcp", { ownerId: o, dryRun: true });
    expect(dry.ok).toBe(true);
    expect((await ws.getWorkspace(h.db, id)).rev).toBe(0); // dryRun no persiste

    const real = await ws.applyOps(h.db, id, ops, "mcp", { ownerId: o, opId: "lote-1", baseRev: 0, label: "ordenar" });
    expect(real.ok && real.newRev).toBe(1);
    expect(real.ok && real.touchedSlideIds.sort()).toEqual((dry.ok && dry.touchedSlideIds.sort()) || []);

    const again = await ws.applyOps(h.db, id, ops, "mcp", { ownerId: o, opId: "lote-1" });
    expect(again).toMatchObject({ ok: true, replayed: true, newRev: 1 });
    expect((await ws.getWorkspace(h.db, id)).rev).toBe(1);

    const stale = await ws.applyOps(h.db, id, [{ op: "set_notes", slideId: "b", notes: "x" }], "docente", { ownerId: o, baseRev: 0 });
    expect(stale).toMatchObject({ ok: false, error: "stale_rev" });
    expect(!stale.ok && stale.diff).toEqual(expect.arrayContaining([{ slideId: "a", change: "modified" }, { slideId: "c", change: "moved" }]));

    const batches = await ws.listBatches(h.db, id, o);
    expect(batches.batches[0]).toMatchObject({ author: "mcp", label: "ordenar", ops: 2 });
    const undo = await ws.undoBatch(h.db, id, real.ok ? real.batchId! : "", "docente", { ownerId: o });
    expect(undo.ok).toBe(true);
    const w2 = await ws.getWorkspace(h.db, id);
    expect(parseDeckAny(w2.deck).slides.map((s) => s.id)).toEqual(["a", "b", "c"]);
    expect(parseDeckAny(w2.deck).slides[0]!.notes).toBe("");

    // checkpoint: lo pendiente se vuelve versión inmutable; el historial actual sigue siendo el historial
    await ws.applyOps(h.db, id, [{ op: "set_notes", slideId: "b", notes: "final" }], "docente", { ownerId: o });
    const before = await h.db.select().from(schema.deckVersions).where(eq(schema.deckVersions.presentationId, id));
    const cp = await ws.commitCheckpoint(h.db, id, o, "docente", "mis notas");
    expect(cp).toMatchObject({ committed: true });
    const after = await h.db.select().from(schema.deckVersions).where(eq(schema.deckVersions.presentationId, id));
    expect(after.length).toBe(before.length + 1);
    const pres = (await h.db.select().from(schema.presentations).where(eq(schema.presentations.id, id)))[0]!;
    expect(pres.currentDeckVersionId).toBe(cp.deckVersionId);
    expect((await ws.commitCheckpoint(h.db, id, o, "docente", "otra vez")).committed).toBe(false);
  });

  it("otro dueño no ve el workspace; validador semántico rechaza el lote; re-basa si no hay cambios pendientes", async () => {
    const { o, id } = await setup();
    const other = await mkUser(h.db);
    await expect(ws.getWorkspace(h.db, id, other)).rejects.toMatchObject({ code: "not_found" });
    const issue: OpIssue = { code: "catalog", message: "componente desconocido" };
    const bad = await ws.applyOps(h.db, id, [{ op: "set_notes", slideId: "a", notes: "x" }], "ia", { ownerId: o, validateDeck: () => [issue] });
    expect(bad).toMatchObject({ ok: false, issues: [issue] });
    // un deck nuevo (versión externa) sin cambios pendientes → el workspace se re-basa solo
    const w = await ws.getWorkspace(h.db, id);
    const d2 = { ...mkDeck(), slides: mkDeck().slides.slice(0, 2) };
    await wf.saveEditedDeck(h.db, id, o, { baseVersionId: w.baseDeckVersionId!, deck: d2, sha256: hashJson(d2), note: "externa" });
    const w2 = await ws.getWorkspace(h.db, id);
    expect(parseDeckAny(w2.deck).slides).toHaveLength(2);
    expect(w2.rev).toBe(w.rev + 1);
  });

  it("durante `designing` no deja tocar diapositivas que se están generando", async () => {
    const { o, id } = await setup();
    await wf.beginDesign(h.db, id, o);
    await units.startUnit(h.db, { presentationId: id, runKey: "k", kind: "slide" }, "b");
    const r = await ws.applyOps(h.db, id, [{ op: "set_notes", slideId: "b", notes: "x" }], "mcp", { ownerId: o });
    expect(r).toMatchObject({ ok: false, issues: [{ code: "slide_busy", slideId: "b" }] });
    const ok = await ws.applyOps(h.db, id, [{ op: "set_notes", slideId: "a", notes: "x" }], "mcp", { ownerId: o });
    expect(ok.ok).toBe(true);
    // en `designing` no se confirma (el job escribe la versión)
    await expect(ws.commitCheckpoint(h.db, id, o, "mcp", "x")).rejects.toMatchObject({ code: "invalid_transition" });
  });

  it("set_logo: bloqueado sin flag de escritura v2; con él el deck pasa a v2, se confirma y deshacer lo devuelve a v1", async () => {
    const { o, id } = await setup();
    const logo = { op: "set_logo", logo: { corner: "br", which: "institution", size: "s" } };
    const off = await ws.applyOps(h.db, id, [logo], "docente", { ownerId: o });
    expect(off).toMatchObject({ ok: false, issues: [{ code: "feature_off" }] });
    const before = await ws.getWorkspace(h.db, id);
    const on = await ws.applyOps(h.db, id, [logo], "docente", { ownerId: o, allowV2: true });
    expect(on.ok).toBe(true);
    const w1 = await ws.getWorkspace(h.db, id);
    expect(parseDeckAny(w1.deck)).toMatchObject({ schemaVersion: 2, meta: { logo: { corner: "br", which: "institution" } } });
    const cp = await ws.commitCheckpoint(h.db, id, o, "docente", "logo");
    expect(cp.committed).toBe(true);
    const [row] = await h.db.select().from(schema.deckVersions).where(eq(schema.deckVersions.id, cp.deckVersionId!));
    expect((row!.deck as { schemaVersion: number }).schemaVersion).toBe(2);
    // una versión derivada de un deck v2 (edición posterior) hereda el permiso
    const next = await ws.applyOps(h.db, id, [{ op: "set_notes", slideId: "a", notes: "n" }], "docente", { ownerId: o });
    expect(next.ok).toBe(true);
    expect((await ws.commitCheckpoint(h.db, id, o, "docente", "notas")).committed).toBe(true);
    // deshacer el logo vuelve a v1 sin dejar rastro
    const undo = await ws.undoBatch(h.db, id, on.ok ? on.batchId! : "", "docente", { ownerId: o });
    expect(undo.ok).toBe(true);
    const w2 = parseDeckAny((await ws.getWorkspace(h.db, id)).deck);
    expect(w2.schemaVersion).toBe(1);
    expect(w2.meta.logo).toBeUndefined();
    expect(w2.slides[0]!.notes).toBe("n"); // lo posterior se conserva
  });
});

describe("workspace: etapa, opId y deshacer sin pisar (revisión)", () => {
  it("rechaza editar el contenido ya aprobado (no deja cambios imposibles de confirmar)", async () => {
    const { o, id } = await setup();
    const r = await ws.applyOps(h.db, id, [{ op: "edit_section", sectionId: "s1", title: "Otro" }], "mcp", { ownerId: o });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.issues[0]!.code).toBe("wrong_stage");
  });
  it("el opId se compara exacto: «_» y «%» no son comodines", async () => {
    const { o, id } = await setup();
    const op = (n: string): WorkspaceOp[] => [{ op: "set_notes", slideId: "a", notes: n }];
    expect((await ws.applyOps(h.db, id, op("uno"), "docente", { ownerId: o, opId: "lote-1" })).ok).toBe(true);
    const r = await ws.applyOps(h.db, id, op("dos"), "docente", { ownerId: o, opId: "lote_1" });
    expect(r.ok && r.replayed).toBeFalsy();
    const w = await ws.getWorkspace(h.db, id, o);
    expect(parseDeckAny(w.deck).slides[0]!.notes).toBe("dos");
  });
  it("deshacer se rechaza si después se editó la misma diapositiva", async () => {
    const { o, id } = await setup();
    const a = await ws.applyOps(h.db, id, [{ op: "set_notes", slideId: "a", notes: "IA" }], "ia", { ownerId: o });
    if (!a.ok) throw new Error("no aplicó");
    await ws.applyOps(h.db, id, [{ op: "set_notes", slideId: "a", notes: "mano del docente" }], "docente", { ownerId: o });
    const u = await ws.undoBatch(h.db, id, a.batchId!, "docente", { ownerId: o });
    expect(u.ok).toBe(false);
    expect(!u.ok && u.issues[0]!.code).toBe("undo_conflict");
    expect(parseDeckAny((await ws.getWorkspace(h.db, id, o)).deck).slides[0]!.notes).toBe("mano del docente");
    // sin conflicto sí se deshace
    const b = await ws.applyOps(h.db, id, [{ op: "set_notes", slideId: "b", notes: "otra" }], "ia", { ownerId: o });
    if (!b.ok) throw new Error("no aplicó");
    expect((await ws.undoBatch(h.db, id, b.batchId!, "docente", { ownerId: o })).ok).toBe(true);
  });
});
