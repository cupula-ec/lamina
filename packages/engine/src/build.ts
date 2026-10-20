import type { Slide } from "@lamina/contracts";

/**
 * Semántica de build: `build.steps[i].reveal` lista slots que se revelan en el paso i+1.
 * Un slot sin ninguna aparición en `build` es visible siempre. `revealCount` = nº de pasos ≤ step que lo revelan.
 */
export function revealCounts(slide: Pick<Slide, "build" | "slots">, step: number): Record<string, number | null> {
  const out: Record<string, number | null> = {};
  const gated = new Set(slide.build.steps.flatMap((s) => s.reveal));
  for (const slot of Object.keys(slide.slots)) {
    if (!gated.has(slot)) { out[slot] = null; continue; }
    out[slot] = slide.build.steps.slice(0, step).filter((s) => s.reveal.includes(slot)).length;
  }
  return out;
}

export const isSlotVisible = (counts: Record<string, number | null>, slot: string) => counts[slot] === null || (counts[slot] ?? 0) > 0;
export const stepsOf = (slide: Pick<Slide, "build">) => slide.build.steps.length;

/** Navegación lineal: avanza primero los pasos del slide y luego el siguiente slide. */
export function nextPos(slides: Pick<Slide, "build">[], pos: { slide: number; step: number }) {
  const s = slides[pos.slide];
  if (s && pos.step < stepsOf(s)) return { slide: pos.slide, step: pos.step + 1 };
  if (pos.slide < slides.length - 1) return { slide: pos.slide + 1, step: 0 };
  return pos;
}
export function prevPos(slides: Pick<Slide, "build">[], pos: { slide: number; step: number }) {
  if (pos.step > 0) return { slide: pos.slide, step: pos.step - 1 };
  if (pos.slide > 0) return { slide: pos.slide - 1, step: stepsOf(slides[pos.slide - 1]!) };
  return pos;
}
