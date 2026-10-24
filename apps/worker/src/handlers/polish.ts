import { eq } from "drizzle-orm";
import { z } from "zod";
import { DeckDocument, Transition, type DeckDocument as Deck, type Slide } from "@lamina/contracts";
import { polishSystem, QuotaWaitError } from "@lamina/ai";
import { hashJson, schema, workflow as wf } from "@lamina/db";
import { validateDeckAgainstCatalog } from "@lamina/components";
import { enqueue } from "@lamina/jobs";
import type { Ctx } from "../ctx";
import { expectStage } from "../run";
import { loadProvisional, lookupFor } from "../catalog";
import { canonicalJson } from "@lamina/contracts";

const PolishOut = z.object({
  slides: z.array(z.object({
    id: z.string(),
    transition: Transition.optional(),
    build: z.object({ steps: z.array(z.object({ reveal: z.array(z.string()).min(1) })).max(16) }).optional(),
    stepwiseSlots: z.array(z.string()).max(3).optional(),
  })).max(80),
});

const STEPWISE = new Set(["Derivation", "WorkedExample", "Checkpoint", "Exercise", "CodeTrace"]);
const stepsNeeded = (componentId: string, props: any): number =>
  componentId === "Derivation" ? Math.min(props?.steps?.length ?? 1, 8) : componentId === "WorkedExample" ? Math.min((props?.steps?.length ?? 1) + 2, 8)
    : componentId === "Exercise" ? Math.min((props?.hints?.length ?? 0) + (props?.steps?.length ?? 0) + 1, 16)
    : componentId === "CodeTrace" ? Math.min(Math.max((props?.steps?.length ?? 2) - 1, 1), 16) : 2;

/**
 * Validador de diff: el pulido solo puede cambiar `build`, `transition` y `props.stepwise` (de Derivation/WorkedExample/Checkpoint).
 * Devuelve la lista de diferencias no permitidas (vacía = ok).
 */
export function disallowedChanges(before: Deck, after: Deck): string[] {
  const strip = (d: Deck) => canonicalJson({
    ...d,
    slides: d.slides.map((s) => ({
      ...s, build: undefined, transition: undefined,
      slots: Object.fromEntries(Object.entries(s.slots).map(([k, r]) => [k, { ...r, props: STEPWISE.has(r.componentId) ? { ...(r.props as object), stepwise: undefined } : r.props }])),
    })),
  });
  const problems: string[] = [];
  if (before.slides.length !== after.slides.length) problems.push("cambió el número de slides");
  else if (strip(before) !== strip(after)) problems.push("se modificó contenido distinto de build/transition");
  return problems;
}

/** Pulido determinista (también usado como respaldo): transiciones sobrias y reveals que ayudan a explicar. */
export function deterministicPolish(deck: Deck): Deck {
  const slides: Slide[] = deck.slides.map((s) => {
    const transition: Slide["transition"] = s.layout === "section" ? "slide" : s.layout === "title" ? "fade" : "fade";
    let steps: { reveal: string[] }[] = [];
    const slots = Object.entries(s.slots);
    const stepwiseSlot = slots.find(([, r]) => r.componentId === "Derivation" && ((r.props as any).steps?.length ?? 0) >= 3);
    const ex = slots.find(([, r]) => r.componentId === "WorkedExample");
    const cp = slots.find(([, r]) => r.componentId === "Checkpoint" && (r.props as any).answer);
    // V3: estos componentes se revelan por pasos siempre (el enunciado antes que la solución, la traza línea a línea).
    const guided = slots.find(([, r]) => r.componentId === "Exercise" || (r.componentId === "CodeTrace" && ((r.props as any).steps?.length ?? 0) >= 2));
    const props = (r: any, on: boolean) => ({ ...r, props: { ...r.props, stepwise: on } });
    const newSlots = { ...s.slots };
    if (guided) { const [k, r] = guided; newSlots[k] = props(r, true); steps = Array.from({ length: stepsNeeded(r.componentId, r.props) }, () => ({ reveal: [k] })); }
    else if (stepwiseSlot) { const [k, r] = stepwiseSlot; newSlots[k] = props(r, true); steps = Array.from({ length: stepsNeeded("Derivation", r.props) }, () => ({ reveal: [k] })); }
    else if (ex) { const [k, r] = ex; newSlots[k] = props(r, true); steps = Array.from({ length: stepsNeeded("WorkedExample", r.props) }, () => ({ reveal: [k] })); }
    else if (cp) { const [k, r] = cp; newSlots[k] = props(r, true); steps = [{ reveal: [k] }, { reveal: [k] }]; }
    else if (s.layout === "split-visual") steps = [{ reveal: ["visual"] }];
    else if (s.layout === "formula-focus" && s.slots.note) steps = [{ reveal: ["note"] }];
    else if (s.layout === "two-column") steps = [{ reveal: ["right"] }];
    return { ...s, slots: newSlots, build: { steps }, transition };
  });
  return { ...deck, slides };
}

/** Aplica sugerencias del modelo solo si pasan la validación; si no, conserva el pulido determinista de ese slide. */
export function applySuggestions(base: Deck, out: z.infer<typeof PolishOut>): Deck {
  const by = new Map(out.slides.map((s) => [s.id, s]));
  const slides = base.slides.map((s) => {
    const sug = by.get(s.id);
    if (!sug) return s;
    if (Object.values(s.slots).some((r) => r.componentId === "Exercise" || r.componentId === "CodeTrace")) return s; // el revelado guiado lo fija el pulido determinista
    const cand: Slide = { ...s, slots: { ...s.slots } };
    if (sug.transition) cand.transition = sug.transition;
    if (sug.build) {
      const valid = sug.build.steps.every((st) => st.reveal.every((r) => s.slots[r]));
      if (valid) cand.build = sug.build;
    }
    for (const k of sug.stepwiseSlots ?? []) {
      const r = s.slots[k];
      if (r && STEPWISE.has(r.componentId)) {
        const need = stepsNeeded(r.componentId, r.props);
        const have = cand.build.steps.filter((st) => st.reveal.includes(k)).length;
        if (have === need) cand.slots[k] = { ...r, props: { ...(r.props as object), stepwise: true } };
      }
    }
    return cand;
  });
  return { ...base, slides };
}

export async function polish(ctx: Ctx, data: { presentationId: string; deckVersionId: string }) {
  const p = await expectStage(ctx, data.presentationId, "polishing");
  if (!p) return;
  if (p.approvedDeckVersionId !== data.deckVersionId) return; // job obsoleto: no es la versión aprobada
  const [dv] = await ctx.db.select().from(schema.deckVersions).where(eq(schema.deckVersions.id, data.deckVersionId));
  const approved = DeckDocument.parse(dv!.deck);
  let result = deterministicPolish(approved);
  try {
    const summary = approved.slides.map((s) => ({ id: s.id, layout: s.layout, slots: Object.fromEntries(Object.entries(s.slots).map(([k, r]) => [k, r.componentId])), notes: !!s.notes }));
    const out = await ctx.ai.structured({
      role: "design", task: "polish", schema: PolishOut, presentationId: p.id, maxTokens: 3000, temperature: 0.2,
      system: polishSystem(), user: `Slides del deck (resumen):\n${JSON.stringify(summary)}\n\nPropón transición y build por slide.`,
      fakeContext: { deck: approved },
    });
    result = applySuggestions(result, out);
  } catch (e) {
    if (e instanceof QuotaWaitError) throw e;
    // sin IA: se mantiene el pulido determinista
  }
  // El validador de diff es la garantía: ante cualquier cambio no permitido, se descarta la propuesta del modelo.
  let diff = disallowedChanges(approved, result);
  if (diff.length) { result = deterministicPolish(approved); diff = disallowedChanges(approved, result); if (diff.length) throw new Error(`polish: ${diff.join("; ")}`); }
  const prov = await loadProvisional(ctx, p.id);
  const v = validateDeckAgainstCatalog(result, lookupFor(prov));
  if (!v.ok) { result = approved; }
  const saved = await wf.polishGenerated(ctx.db, p.id, { deck: result, sha256: hashJson(result), note: "Pulido de transiciones y build" });
  // Re-render + re-detección sobre la versión final: sin esto final_review quedaba sin artefactos ni issues.
  await enqueue(ctx.boss, "render", { presentationId: p.id, deckVersionId: saved.id }, { base: saved.id }).catch(() => {});
}
