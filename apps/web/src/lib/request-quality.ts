import { AREA_IDS, type AreaId } from "@lamina/contracts";

/** Calidad del pedido (V3 §5.8): guía a quien no sabe cuánta información dar. Pura y testeable. */
export type RequestFields = { objective: string; level: string; prior: string; examples: string; avoid: string; materials: boolean };
export type CheckItem = { id: "objective" | "level" | "prior" | "materials" | "examples" | "avoid"; label: string; why: string; cost?: string; done: boolean };
export type Quality = "basic" | "good" | "excellent";

export function checklist(f: RequestFields): CheckItem[] {
  return [
    { id: "objective", label: "Objetivo claro", why: "Dice qué debe poder hacer el estudiante al final; ordena toda la clase.", done: f.objective.trim().length >= 40 },
    { id: "level", label: "Nivel elegido", why: "Ajusta el vocabulario y la profundidad.", done: f.level.trim().length >= 2 },
    { id: "prior", label: "Qué saben ya tus estudiantes", why: "Evita repetir lo que ya dominan o saltar pasos que les faltan.", done: f.prior.trim().length >= 10 },
    { id: "materials", label: "Tus apuntes, enlaces o archivos", why: "Lámina los usa como fuente principal en lugar de inventar.", cost: "Más material implica más tiempo de investigación y de generación.", done: f.materials },
    { id: "examples", label: "Ejemplos que quieres ver", why: "Los ejemplos son lo que más recuerdan los estudiantes.", done: f.examples.trim().length >= 10 },
    { id: "avoid", label: "Qué evitar", why: "Ahorra correcciones: temas fuera de programa, notación que no usan, etc.", done: f.avoid.trim().length >= 5 },
  ];
}

export function quality(f: RequestFields): { level: Quality; done: number; total: number; label: string } {
  const items = checklist(f);
  // El nivel siempre viene preseleccionado: no cuenta para medir el esfuerzo del docente.
  const counted = items.filter((i) => i.id !== "level");
  const done = counted.filter((i) => i.done).length;
  const level: Quality = done >= 4 ? "excellent" : done >= 2 ? "good" : "basic";
  return { level, done, total: counted.length, label: level === "excellent" ? "Excelente" : level === "good" ? "Bueno" : "Básico" };
}

/** Texto de indicaciones del docente que se guarda en `presentations.extraNotes` (se envuelve como no confiable al generar). */
export function guidanceNotes(f: Pick<RequestFields, "prior" | "examples" | "avoid">): string | undefined {
  const parts = [
    f.prior.trim() && `Lo que los estudiantes ya saben: ${f.prior.trim()}`,
    f.examples.trim() && `Ejemplos que el docente quiere ver: ${f.examples.trim()}`,
    f.avoid.trim() && `Evitar: ${f.avoid.trim()}`,
  ].filter(Boolean);
  return parts.length ? parts.join("\n") : undefined;
}

export const TEMPLATES: Record<AreaId, { objective: string; prior: string; examples: string }> = {
  math: { objective: "Que los estudiantes calculen la derivada de funciones compuestas con la regla de la cadena e interpreten el resultado como pendiente.", prior: "Conocen límites y la derivada de funciones básicas.", examples: "Un ejemplo con trigonométricas y otro con una aplicación a velocidad." },
  programming: { objective: "Que los estudiantes implementen una pila y una cola en Python y expliquen cuándo usar cada una.", prior: "Conocen listas y funciones; no han visto estructuras de datos.", examples: "Deshacer en un editor (pila) y una fila de atención (cola)." },
  humanities: { objective: "Que los estudiantes comparen el conductismo y el constructivismo y propongan una actividad de aula para cada enfoque.", prior: "Han leído una introducción a las teorías del aprendizaje.", examples: "Un caso de aula real y una actividad para trabajar en parejas." },
  natsci: { objective: "Que los estudiantes describan las etapas de la fotosíntesis y relacionen cada etapa con su ubicación en el cloroplasto.", prior: "Conocen la estructura de la célula vegetal.", examples: "Un diagrama del cloroplasto y un experimento sencillo con luz." },
  general: { objective: "Que los estudiantes puedan explicar con sus palabras el concepto central y aplicarlo a un caso nuevo.", prior: "Tienen una idea general del tema.", examples: "Un ejemplo cotidiano y un caso práctico." },
};
export const isArea = (v: string): v is AreaId => (AREA_IDS as readonly string[]).includes(v);
