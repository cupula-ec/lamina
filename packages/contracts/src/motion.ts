import { z } from "zod";
import type { ThemeId } from "./themes";

/**
 * Motion por código (V3 §5.6): presets que el motor traduce a CSS/WAAPI. No hay IA ni librería de animación.
 * Todo corre dentro de `prefers-reduced-motion: no-preference`; con reduced motion hay cortes.
 */
export const MOTION_PRESETS = ["calm", "lively", "editorial"] as const;
export const MotionPreset = z.enum(MOTION_PRESETS);
export type MotionPreset = z.infer<typeof MotionPreset>;
/** `none` apaga todo el motion de V3 en un deck (el docente lo puede elegir). */
export const DeckMotion = z.union([MotionPreset, z.literal("none")]);
export type DeckMotion = z.infer<typeof DeckMotion>;

export type MotionSpec = {
  /** Duración de la entrada de cada elemento y desfase entre elementos (ms). */
  enterMs: number; staggerMs: number; distancePx: number; ease: string;
  /** Duración del trazado de curvas (ms). */
  drawMs: number;
  /** Transición entre diapositivas que el preset impone cuando no es "none". */
  transition: "fade" | "slide" | "zoom";
  label: string; blurb: string;
};
export const MOTION_SPECS: Record<MotionPreset, MotionSpec> = {
  calm: { enterMs: 420, staggerMs: 90, distancePx: 14, ease: "cubic-bezier(.2,.7,.2,1)", drawMs: 900, transition: "fade", label: "Sereno", blurb: "Entradas suaves y cortas; no distrae del contenido." },
  lively: { enterMs: 480, staggerMs: 130, distancePx: 40, ease: "cubic-bezier(.2,.9,.25,1.05)", drawMs: 1100, transition: "slide", label: "Dinámico", blurb: "Elementos que entran uno tras otro con más recorrido." },
  editorial: { enterMs: 600, staggerMs: 160, distancePx: 22, ease: "cubic-bezier(.3,.1,.1,1)", drawMs: 1300, transition: "fade", label: "Editorial", blurb: "Pausado y elegante, para textos y citas." },
};

/** Preset por defecto de cada tema (los temas ausentes usan "calm"). */
const THEME_MOTION: Partial<Record<ThemeId, MotionPreset>> = {
  pizarra: "lively", "educacion-calido": "lively", "programacion-terminal": "lively", "fisica-aurora": "lively",
  "calculo-editorial": "editorial", "humanidades-editorial": "editorial", "institucional-sobrio": "calm", "institucional-marca": "calm",
};
export const motionForTheme = (themeId: string): MotionPreset => THEME_MOTION[themeId as ThemeId] ?? "calm";

/** Entrada de los elementos de una diapositiva. */
export const SlideMotion = z.object({ enter: z.enum(["stagger", "none"]).default("stagger") });
export type SlideMotion = z.infer<typeof SlideMotion>;
