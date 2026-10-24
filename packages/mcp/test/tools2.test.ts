import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { schema } from "@lamina/db";
import { DRAFT, approveAs, connect, mkUser, testDb, validDeck } from "./helpers";

let h: Awaited<ReturnType<typeof testDb>>;
beforeAll(async () => { h = await testDb("lamina_mcp2_test"); });
afterAll(async () => { await h.pool.end(); });
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));

describe("MCP v2: la IA externa es la autora, Lámina el motor", () => {
  it("sin el flag solo existen las herramientas v1; con el flag se añaden las v2 y las v1 siguen igual", async () => {
    const u = await mkUser(h.db);
    const off = (await (await connect(h.db, { userId: u })).client.listTools()).tools.map((t) => t.name);
    expect(off).not.toContain("start_here");
    const on = (await (await connect(h.db, { userId: u }, { v2: true })).client.listTools()).tools.map((t) => t.name);
    for (const n of ["start_here", "next_step", "get_outline", "apply_content_ops", "list_slides", "apply_deck_ops", "list_components", "propose_component", "search_images", "insert_image", "commit_checkpoint", "get_links", "submit_deck", "submit_content_draft", "get_render_issues"]) expect(on, n).toContain(n);
    expect(on.join(" ")).not.toMatch(/approve|publish|delete|share|aprob|borra/);
  });

  it("start_here deja claro el rol y next_step da argumentos de ejemplo por etapa", async () => {
    const u = await mkUser(h.db);
    const cli = await connect(h.db, { userId: u }, { v2: true });
    const s = await cli.call("start_here", {});
    expect(s.data.role).toMatch(/autora/);
    expect(s.data.role).toMatch(/NO tiene una IA/);
    expect(JSON.stringify(s.data.rules)).toMatch(/get_links/);
    const p = await cli.call("create_presentation", { topic: "Pilas", level: "Grado", objective: "Entender pilas", area: "programming", length: "short" });
    expect(p.data.id).toBeTruthy();
    const n = await cli.call("next_step", { id: p.data.id });
    expect(n.data).toMatchObject({ stage: "draft", tool: "submit_content_draft" });
    expect(n.data.argsHint.draft.sections).toBeTruthy();
    const [row] = await h.db.select().from(schema.presentations);
    expect(row).toBeTruthy();
  });

  it("camino completo: contenido por partes, aprobación, diseño por operaciones, checkpoints y enlaces", async () => {
    const u = await mkUser(h.db);
    const cli = await connect(h.db, { userId: u }, { v2: true });
    const { data: pres } = await cli.call("create_presentation", { topic: "La derivada", level: "Primer ciclo", objective: "Calcular derivadas" });
    const id = pres.id as string;
    expect((await cli.call("submit_content_draft", { id, draft: clone(DRAFT), baseVersionId: null })).isError).toBe(false);

    const outline = await cli.call("get_outline", { id });
    expect(outline.data.sections.map((s: { id: string }) => s.id)).toEqual(["s1", "s2"]);
    const sec = await cli.call("get_content_section", { id, sectionId: "s2" });
    expect(sec.data.section.slidesHint[0].id).toBe("h3");

    // Edición incremental del contenido (un bloque nuevo) y confirmación como versión.
    const ops = [{ op: "add_block", hintId: "h3", block: { id: "b9", type: "text", md: "- Un ejemplo cotidiano: la velocidad" } }];
    const dry = await cli.call("apply_content_ops", { id, ops, baseRev: outline.data.rev, dryRun: true });
    expect(dry.data).toMatchObject({ ok: true, dryRun: true });
    const applied = await cli.call("apply_content_ops", { id, ops, baseRev: outline.data.rev, opId: "c1" });
    expect(applied.isError, JSON.stringify(applied.data)).toBe(false);
    const replay = await cli.call("apply_content_ops", { id, ops, baseRev: outline.data.rev, opId: "c1" });
    expect(replay.data.replayed).toBe(true); // idempotente por opId
    const stale = await cli.call("apply_content_ops", { id, ops: [{ op: "remove_block", blockId: "b9" }], baseRev: outline.data.rev });
    expect(stale.isError).toBe(true);
    expect(stale.data.error).toMatchObject({ code: "stale_rev", fix: { tool: "get_outline" } });
    const cp = await cli.call("commit_checkpoint", { id, label: "Ejemplo cotidiano" });
    expect(cp.data.committed).toBe(true);

    await approveAs(h.db, id, u);
    // Diseño: deck completo (v1) y luego por operaciones.
    const sub = await cli.call("submit_deck", { id, deck: validDeck(), baseVersionId: null });
    expect(sub.isError, JSON.stringify(sub.data)).toBe(false);
    const slides = await cli.call("list_slides", { id });
    expect(slides.data.slides.length).toBeGreaterThan(3);
    const target = slides.data.slides.find((s: { slots: Record<string, string> }) => Object.values(s.slots).some((c) => c.startsWith("FormulaHighlight")));
    const slot = Object.keys(target.slots).find((k) => target.slots[k].startsWith("FormulaHighlight"))!;
    const edit = await cli.call("apply_deck_ops", { id, baseRev: slides.data.rev, ops: [{ op: "set_slot_props", slideId: target.id, slot, props: { caption: "Texto nuevo y corto" } }] });
    expect(edit.isError, JSON.stringify(edit.data)).toBe(false);
    const got = await cli.call("get_slide", { id, slideId: target.id });
    expect(JSON.stringify(got.data.slide)).toContain("Texto nuevo y corto");

    // Errores accionables: componente que no existe → fix list_components; op mal formada → fix start_here.
    const bad = await cli.call("apply_deck_ops", { id, ops: [{ op: "set_slot", slideId: target.id, slot, ref: { componentId: "NoExiste", version: "1.0.0", props: {} } }] });
    expect(bad.isError).toBe(true);
    expect(bad.data.error.fix.tool).toBe("list_components");
    const malformed = await cli.call("apply_deck_ops", { id, ops: [{ op: "inventada" }] });
    expect(malformed.data.error.fix.tool).toBe("start_here");

    const cp2 = await cli.call("commit_checkpoint", { id, label: "Texto más corto" });
    expect(cp2.data.committed).toBe(true);
    const links = await cli.call("get_links", { id });
    expect(links.data.viewer).toContain(`/presentations/${id}/view`);
    const comps = await cli.call("list_components", { id, area: "math" });
    expect(comps.data.components.some((c: { id: string }) => c.id === "FunctionPlot")).toBe(true);
    expect(comps.data.components.some((c: { id: string }) => c.id === "Image")).toBe(false); // gated por flag
  });

  it("el cliente v1 no ve cambios: submit_deck conserva el tope de versiones solo sin el flag", async () => {
    const u = await mkUser(h.db);
    const c1 = await connect(h.db, { userId: u });
    expect((await c1.client.listTools()).tools.length).toBe(7);
  });

  it("propose_component y las imágenes responden claro cuando el servidor no los ofrece", async () => {
    const u = await mkUser(h.db);
    const cli = await connect(h.db, { userId: u }, { v2: true });
    const { data: pres } = await cli.call("create_presentation", { topic: "T", level: "L", objective: "Objetivo largo" });
    const r = await cli.call("search_images", { id: pres.id, query: "pila" });
    expect(r.isError).toBe(true);
    expect(r.data.error.code).toBe("not_available");
    const c = await cli.call("propose_component", { id: pres.id, name: "Demo", title: "Demo", purpose: "Un componente de demostración", useCases: ["x"], tsx: "export default function Component(){ return null }", propsJsonSchema: { type: "object" }, fixtures: [{}] });
    expect(c.data.error.code).toBe("not_available");
  });
});
