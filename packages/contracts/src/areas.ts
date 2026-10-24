import { z } from "zod";

/** Áreas de conocimiento de V3 (PLAN-v3 §5.3). `general` es el respaldo para cualquier otra área. Los AreaPack (datos) llegan en el bloque 4. */
export const AREA_IDS = ["math", "programming", "humanities", "natsci", "general"] as const;
export const AreaId = z.enum(AREA_IDS);
export type AreaId = z.infer<typeof AreaId>;

export const AREA_LABELS: Record<AreaId, string> = {
  math: "Matemáticas y estadística",
  programming: "Programación y computación",
  humanities: "Educación, humanidades y ciencias sociales",
  natsci: "Ciencias naturales (química, biología, física)",
  general: "Otra área",
};

/** Cantidad de diapositivas pedida por el docente: la IA decide dentro del rango. */
export const LENGTH_IDS = ["short", "medium", "long"] as const;
export const LengthId = z.enum(LENGTH_IDS);
export type LengthId = z.infer<typeof LengthId>;
export const LENGTHS: Record<LengthId, { label: string; approx: number; min: number; max: number; minutes: string; blurb: string }> = {
  short: { label: "Corta", approx: 8, min: 6, max: 10, minutes: "unos 30 min de clase", blurb: "Una idea principal, un ejemplo y un cierre." },
  medium: { label: "Media", approx: 15, min: 12, max: 18, minutes: "una clase de 60 min", blurb: "Concepto, ejemplos resueltos y práctica guiada." },
  long: { label: "Extensa", approx: 25, min: 22, max: 28, minutes: "90 min o una sesión doble", blurb: "Varios conceptos con motivación, práctica y cierre." },
};
