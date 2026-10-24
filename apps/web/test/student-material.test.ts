import { describe, expect, it } from "vitest";
import { ContentDraft } from "@lamina/contracts";
import { buildStudentMaterial } from "../src/lib/student-material";

const c = ContentDraft.parse({
  schemaVersion: 2, meta: { topic: "Pilas", level: "Grado", objective: "Entender pilas" },
  sections: [
    { id: "s1", title: "Qué es una pila", slidesHint: [
      { id: "h1", intent: "Motivación", blocks: [{ id: "b1", type: "motivation", hook: "¿Cómo deshace tu editor?", intuition: "Lo último que hiciste se revierte primero." }] },
      { id: "h2", intent: "Definición", blocks: [{ id: "b2", type: "definition", term: "Pila", md: "Estructura LIFO." }, { id: "b3", type: "imageRequest", query: "pila de platos", purpose: "ilustrar", alt: "Pila de platos" }] },
      { id: "h3", intent: "Práctica", blocks: [{ id: "b4", type: "exercise", statement: "Apila 1, 2, 3 y desapila.", guidingQuestion: "¿Quién entró último?", hints: ["LIFO"], steps: [{ do: "Apila", why: "Entra al tope" }], answer: "3", commonMistakes: ["Confundir con cola"] }] },
    ] },
    { id: "s2", title: "Cierre", slidesHint: [{ id: "h4", intent: "Cierre", blocks: [{ id: "b5", type: "closing", keyIdeas: ["LIFO"], questions: ["¿Dónde la usarías?"] }] }] },
  ],
});

describe("material del alumno", () => {
  const m = buildStudentMaterial(c, { credits: ["Foto — Ana · CC BY · wikimedia", "Foto — Ana · CC BY · wikimedia"] });
  it("arma secciones, conceptos clave y cierre desde el contenido aprobado", () => {
    expect(m.sections.map((s) => s.title)).toEqual(["Qué es una pila"]); // el cierre no es una sección: va al final
    expect(m.keyConcepts).toEqual([{ term: "Pila", md: "Estructura LIFO." }]);
    expect(m.closing).toEqual({ keyIdeas: ["LIFO"], questions: ["¿Dónde la usarías?"] });
  });
  it("el ejercicio muestra enunciado y pistas, y la solución solo va al final", () => {
    const ex = m.sections[0]!.items.find((i) => i.kind === "exercise")!;
    expect(JSON.stringify(ex)).not.toContain('"answer"');
    expect(m.solutions).toHaveLength(1);
    expect(m.solutions[0]).toMatchObject({ n: 1, answer: "3", mistakes: ["Confundir con cola"] });
  });
  it("deduplica créditos y omite imageRequest", () => {
    expect(m.credits).toHaveLength(1);
    expect(JSON.stringify(m.sections)).not.toContain("pila de platos");
  });
});
