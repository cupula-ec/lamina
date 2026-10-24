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

/** Datos por área (PLAN-v3 §5.3). Solo datos: los fragmentos de prompt viven en @lamina/ai. */
export type AreaPack = {
  id: AreaId;
  label: string;
  keywords: RegExp[];
  /** Consultas de investigación por defecto; `{t}` se sustituye por el tema. */
  researchQueryHints: string[];
  exercisePolicy: "hints-steps-answer" | "activity" | "code-trace";
};

export const AREA_PACKS: Record<AreaId, AreaPack> = {
  math: {
    id: "math", label: AREA_LABELS.math,
    keywords: [/matem[aá]tic|[aá]lgebra|c[aá]lculo|derivad|integral|l[ií]mite|ecuaci|matriz|vector|polinom|geometr[ií]a|trigonom|c[oó]nica|estad[ií]stic|probabilidad/i],
    researchQueryHints: ["{t} explicación ejemplos resueltos", "{t} definición teorema"],
    exercisePolicy: "hints-steps-answer",
  },
  programming: {
    id: "programming", label: AREA_LABELS.programming,
    keywords: [/program|c[oó]digo|algoritm|software|python|java|javascript|c\+\+|base de datos|sql|estructura de datos|redes|sistemas operativos|computaci[oó]n|inform[aá]tica/i],
    researchQueryHints: ["{t} tutorial con ejemplos de código", "{t} conceptos y buenas prácticas"],
    exercisePolicy: "code-trace",
  },
  humanities: {
    id: "humanities", label: AREA_LABELS.humanities,
    keywords: [/educaci[oó]n|pedagog|did[aá]ctic|human|historia|filosof|literatur|sociolog|psicolog|derecho|ling[uü][ií]stic|comunicaci[oó]n|econom[ií]a|pol[ií]tic|antropolog/i],
    researchQueryHints: ["{t} marco teórico y autores", "{t} estudio de caso ejemplos en el aula"],
    exercisePolicy: "activity",
  },
  natsci: {
    id: "natsci", label: AREA_LABELS.natsci,
    keywords: [/qu[ií]mic|biolog|f[ií]sica|cinem|din[aá]mica|termodin|ecolog|gen[eé]tic|c[eé]lula|anatom|geolog|astronom|ondas|fuerza|energ[ií]a/i],
    researchQueryHints: ["{t} explicación con diagramas y ejemplos", "{t} experimento o fenómeno cotidiano"],
    exercisePolicy: "hints-steps-answer",
  },
  general: {
    id: "general", label: AREA_LABELS.general,
    keywords: [],
    researchQueryHints: ["{t} introducción y conceptos clave", "{t} ejemplos y casos prácticos"],
    exercisePolicy: "activity",
  },
};

/** Orden de decisión (PLAN-v3 §5.3): elección explícita > palabras clave en materia/tema > general. */
export function detectArea(input: { explicit?: string | null; subject?: string | null; topic: string }): AreaId {
  const parsed = AreaId.safeParse(input.explicit);
  if (parsed.success) return parsed.data;
  const text = `${input.subject ?? ""} ${input.topic}`;
  for (const id of ["programming", "natsci", "math", "humanities"] as const) if (AREA_PACKS[id].keywords.some((k) => k.test(text))) return id;
  return "general";
}
