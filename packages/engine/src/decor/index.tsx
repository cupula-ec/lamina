import type { ThemeId } from "@lamina/contracts";
import { DECOR_KINDS, type DecorKind, type DecorRole } from "./kinds";
import { hashSeed, makeRand } from "./rng";

export * from "./rng";
export { DECOR_KINDS, type DecorKind, type DecorRole } from "./kinds";

/** Qué decoración usa cada tema en cada tipo de diapositiva (ausente = sin decoración). Es parte de la identidad del tema. */
export const THEME_DECOR: Record<ThemeId, Partial<Record<DecorRole, DecorKind>>> = {
  "lamina-claro": { cover: "corner", closing: "corner" },
  "lamina-oscuro": { cover: "corner", closing: "corner" },
  "calculo-editorial": { cover: "curve-family", section: "curve-family", closing: "corner", interior: "corner" },
  "algebra-grafito": { cover: "axes-grid", section: "iso-grid", closing: "axes-grid", interior: "axes-grid" },
  "fisica-aurora": { cover: "field-lines", section: "waves", closing: "field-lines", interior: "waves" },
  "geometria-compas": { cover: "compass-arcs", section: "compass-arcs", closing: "compass-arcs", interior: "corner" },
  "estadistica-datos": { cover: "data-dots", section: "data-dots", closing: "data-dots", interior: "corner" },
  "quimica-laboratorio": { cover: "hex-molecules", section: "hex-molecules", closing: "hex-molecules", interior: "hex-molecules" },
  "institucional-sobrio": { cover: "corner", section: "corner", closing: "corner", interior: "corner" },
  pizarra: { cover: "chalk", section: "chalk", closing: "chalk", interior: "chalk" },
  "institucional-marca": { cover: "corner", section: "corner", closing: "corner", interior: "corner" },
  "programacion-terminal": { cover: "axes-grid", section: "data-dots", closing: "axes-grid", interior: "corner" },
  "humanidades-editorial": { cover: "corner", section: "corner", closing: "corner", interior: "corner" },
  "biologia-natural": { cover: "hex-molecules", section: "waves", closing: "hex-molecules", interior: "corner" },
  "educacion-calido": { cover: "corner", section: "chalk", closing: "corner", interior: "corner" },
};

/** Layouts sin decoración de fondo (llevan un visual a sangre o su propio fondo). */
const NO_DECOR = new Set(["full-visual"]);

export function decorRole(layout: string): DecorRole | null {
  if (NO_DECOR.has(layout)) return null;
  if (layout === "title" || layout === "cover-branded") return "cover";
  if (layout === "section") return "section";
  if (layout === "closing") return "closing";
  return "interior";
}

export function decorKindFor(themeId: string, layout: string): { kind: DecorKind; role: DecorRole } | null {
  const role = decorRole(layout);
  if (!role) return null;
  const spec = (THEME_DECOR as Record<string, Partial<Record<DecorRole, DecorKind>>>)[themeId] ?? THEME_DECOR["lamina-claro"];
  const kind = spec[role];
  return kind ? { kind, role } : null;
}

/** Decoración procedural (SVG inline, sin red) determinista por seed; vive detrás de los slots y no participa en la detección de problemas. */
export function SlideDecor({ themeId, layout, seed }: { themeId: string; layout: string; seed: string }) {
  const d = decorKindFor(themeId, layout);
  if (!d) return null;
  const W = 1920, H = 1080;
  const r = makeRand(hashSeed(`${seed}|${d.kind}|${d.role}`));
  return (
    <svg className={`lm-decor lm-decor-${d.role}`} data-lm-decor={d.kind} aria-hidden="true" focusable="false" width={W} height={H} viewBox={`0 0 ${W} ${H}`} fill="none">
      {DECOR_KINDS[d.kind]({ r, role: d.role, w: W, h: H })}
    </svg>
  );
}
