import { LAYOUT_IDS, type Block, type Branding } from "@lamina/contracts";

/** Máximo de diapositivas consecutivas con el mismo layout. */
export const MAX_SAME_LAYOUT_RUN = 2;

/** Layouts de uso general que la IA puede alternar en el cuerpo de la clase. */
const BODY_LAYOUTS = ["title-content", "two-column", "split-visual", "formula-focus", "hero-formula", "three-column", "steps-timeline", "comparison", "big-number", "sidebar-notes", "quote-source", "full-visual", "agenda"] as const;

/** El contenido que por su naturaleza solo cabe en un layout (derivaciones y ejemplos resueltos) queda exento de la regla. */
const demanding = (b: Block) => b.type === "derivation" || b.type === "example";

export function trailingRun(prev: readonly string[], layout: string): number {
  let n = 0;
  for (let i = prev.length - 1; i >= 0 && prev[i] === layout; i--) n++;
  return n;
}

/** Mensaje de feedback para la IA si `layout` repetiría el mismo layout más de MAX_SAME_LAYOUT_RUN veces seguidas; `null` si está bien. */
export function varietyProblem(prev: readonly string[], layout: string, blocks?: readonly Block[]): string | null {
  if (trailingRun(prev, layout) < MAX_SAME_LAYOUT_RUN) return null;
  if (blocks?.some(demanding)) return null;
  const options = BODY_LAYOUTS.filter((l) => l !== layout && (LAYOUT_IDS as readonly string[]).includes(l)).slice(0, 8).join(", ");
  return `Variedad: las ${MAX_SAME_LAYOUT_RUN} diapositivas anteriores ya usan el layout "${layout}". Elige un layout distinto para esta (por ejemplo: ${options}) manteniendo el contenido.`;
}

/** Posiciones donde un deck ya armado rompe la regla (tercera diapositiva consecutiva con el mismo layout o más). */
export function varietyViolations(layouts: readonly string[]): number[] {
  const out: number[] = [];
  layouts.forEach((l, i) => { if (trailingRun(layouts.slice(0, i), l) >= MAX_SAME_LAYOUT_RUN) out.push(i); });
  return out;
}

export function hasBranding(b?: Branding): boolean {
  if (!b) return false;
  return !!(b.institution || b.personalLogoUrl || b.teacher?.trim() || b.subject?.trim() || b.period?.trim() || b.group?.trim());
}
