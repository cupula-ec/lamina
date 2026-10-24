import { describe, expect, it } from "vitest";
import { ContentDraft, LaminaError, type DeckDocument } from "@lamina/contracts";
import { NATIVE_MANIFESTS, deckFromContent } from "@lamina/components";
import type { Ctx } from "../src/ctx";
import { runHarness, type ActionT } from "../src/harness";

const content = ContentDraft.parse({
  schemaVersion: 1, meta: { topic: "Derivadas", level: "Grado", objective: "Derivar" },
  sections: [{ id: "s1", title: "Reglas", slidesHint: [{ id: "h1", intent: "Regla de la potencia", blocks: [{ id: "b1", type: "formula", latex: "\\frac{d}{dx}x^n=nx^{n-1}" }, { id: "b2", type: "text", md: "- La derivada baja el exponente\n- Y lo reduce en uno" }] }] }],
});
const deck: DeckDocument = deckFromContent(content);
const slideId = "h1";
const hint = content.sections[0]!.slidesHint[0]!;
const lookup = () => undefined;

/** AI guionizada: devuelve (o lanza) lo que toque en cada turno. */
const script = (turns: (ActionT | Error)[]) => {
  let i = 0;
  const seen: string[] = [];
  const ctx = { ai: { structured: async (o: { user: string }) => { seen.push(o.user); const t = turns[i++]; if (!t) throw new LaminaError("provider_failed", "sin más turnos", 502); if (t instanceof Error) throw t; return t; } }, log: () => {} } as unknown as Ctx;
  return { ctx, seen, used: () => i };
};
const env = (ctx: Ctx, over: object = {}) => ({ ctx, presentationId: "p", ownerId: "u", deck, content, slideId, issues: [{ slot: "main", kind: "overflow", severity: "error", message: "se sale" }], hint, manifests: NATIVE_MANIFESTS, lookup, goal: "corrige los problemas", ...over });
const A = (tool: string, args: object = {}, thought?: string) => ({ thought, action: { tool, args } }) as unknown as ActionT;

describe("harness de la IA (una diapositiva, herramientas pequeñas)", () => {
  const first = deck.slides.find((s) => s.id === slideId)!;
  const slot = Object.keys(first.slots).find((k) => k !== "title")!;

  it("camino feliz: lee, edita un slot, valida y cierra con una sola op", async () => {
    const s = script([A("read_slide"), A("edit_slot", { slot, props: { items: [{ text: "La derivada baja el exponente" }] } }), A("validate"), A("done", { summary: "Acorté el texto" })]);
    const r = await runHarness(env(s.ctx));
    expect(r.ok).toBe(true);
    if (r.ok) { expect(r.ops).toHaveLength(1); expect(r.ops[0]).toMatchObject({ op: "set_slot_props", slideId }); expect(r.summary).toBe("Acorté el texto"); expect(r.steps).toBe(4); }
  });

  it("un JSON ilegible o argumentos inválidos consumen un paso pero no abortan", async () => {
    const s = script([new LaminaError("provider_failed", "JSON ilegible", 502), A("edit_slot", {}), A("validate"), A("done", {})]);
    const r = await runHarness(env(s.ctx));
    expect(r.ok).toBe(true);
    expect(s.seen[2]).toContain("argumentos inválidos");
    expect(s.seen[1]).toContain("no fue un JSON de acción válido");
  });

  it("done se rechaza mientras la diapositiva no sea válida (y no devuelve cambios)", async () => {
    const bad = { componentId: "BulletPoints", version: "1.0.0", props: { items: [] } };
    const s = script([A("edit_slot", { slot, component: bad }), A("done", {})]);
    const r = await runHarness(env(s.ctx, { maxSteps: 2 }));
    expect(r.ok).toBe(false);
  });

  it("si se pierde una fórmula del contenido, no deja cerrar", async () => {
    const noFormula = { componentId: "BulletPoints", version: "1.0.0", props: { items: [{ text: "solo texto" }] } };
    const fslot = Object.keys(first.slots).find((k) => first.slots[k]!.componentId === "FormulaHighlight") ?? slot;
    const s = script([A("edit_slot", { slot: fslot, component: noFormula }), A("done", {}), A("validate")]);
    const r = await runHarness(env(s.ctx, { maxSteps: 3 }));
    expect(r.ok).toBe(false);
    expect(s.seen[2]).toContain("fórmulas");
  });

  it("presupuesto duro: si se agota, no hay cambios", async () => {
    const s = script(Array.from({ length: 10 }, () => A("read_slide")));
    const r = await runHarness(env(s.ctx, { maxSteps: 3 }));
    expect(r).toMatchObject({ ok: false, steps: 3 });
    expect(s.used()).toBe(3);
  });

  it("aborta si la señal está cancelada y respeta la falta de cupo", async () => {
    const ac = new AbortController(); ac.abort();
    expect(await runHarness(env(script([]).ctx, { signal: ac.signal }))).toMatchObject({ ok: false, reason: "cancelado" });
  });

  it("las imágenes no están disponibles sin el flag (no hay proveedor)", async () => {
    const s = script([A("search_images", { query: "pilas" }), A("done", { summary: "sin cambios" })]);
    const r = await runHarness(env(s.ctx, { issues: [] }));
    expect(s.seen[1]).toContain("no están disponibles");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.ops).toHaveLength(0);
  });
});
