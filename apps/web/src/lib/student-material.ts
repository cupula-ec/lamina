import type { Block, ContentDraft } from "@lamina/contracts";

/**
 * Material del alumno (V3 §5.8): se arma DETERMINISTAMENTE desde el contenido aprobado (sin IA): resumen por sección, conceptos clave,
 * ejercicios con pistas, soluciones al final y créditos de imágenes. Es una estructura simple que dibuja la página y el PDF.
 */
export type MaterialItem =
  | { kind: "md"; md: string }
  | { kind: "concept"; term: string; md: string }
  | { kind: "formula"; latex: string; caption?: string }
  | { kind: "steps"; title?: string; steps: { latex?: string; text: string }[] }
  | { kind: "example"; problem: string; steps: { latex?: string; text: string }[]; answer: string }
  | { kind: "motivation"; hook: string; text: string }
  | { kind: "code"; language: string; source: string }
  | { kind: "table"; headers: string[]; rows: string[][] }
  | { kind: "note"; text: string }
  | { kind: "exercise"; n: number; statement: string; question: string; hints: string[] }
  | { kind: "activity"; label: string; prompt: string; minutes: number };
export type Solution = { n: number; statement: string; steps: { do: string; why: string; latex?: string }[]; answer: string; mistakes: string[] };
export type MaterialSection = { id: string; title: string; items: MaterialItem[] };
export type Material = {
  title: string; subtitle: string; sections: MaterialSection[]; keyConcepts: { term: string; md: string }[];
  closing: { keyIdeas: string[]; questions: string[] } | null; solutions: Solution[]; credits: string[];
};

const ACTIVITY: Record<string, string> = { debate: "Debate", pregunta: "Pregunta para la clase", pares: "Trabajo en pares", practica: "Práctica" };

export function buildStudentMaterial(c: ContentDraft, opts: { credits?: string[] } = {}): Material {
  let n = 0;
  const solutions: Solution[] = [];
  const keyConcepts: Material["keyConcepts"] = [];
  let closing: Material["closing"] = null;
  const sections: MaterialSection[] = c.sections.map((s) => {
    const items: MaterialItem[] = [];
    for (const b of s.slidesHint.flatMap((h) => h.blocks) as Block[]) {
      switch (b.type) {
        case "text": items.push({ kind: "md", md: b.md }); break;
        case "definition": items.push({ kind: "concept", term: b.term, md: b.md }); keyConcepts.push({ term: b.term, md: b.md }); break;
        case "theorem": items.push({ kind: "concept", term: b.name, md: b.statement }); keyConcepts.push({ term: b.name, md: b.statement }); break;
        case "formula": items.push({ kind: "formula", latex: b.latex, caption: b.caption }); break;
        case "derivation": items.push({ kind: "steps", title: "Paso a paso", steps: b.steps.map((x) => ({ latex: x.latex, text: x.explanation })) }); break;
        case "example": items.push({ kind: "example", problem: b.problem, steps: b.steps, answer: b.answer }); break;
        case "motivation": items.push({ kind: "motivation", hook: b.hook, text: [b.intuition, b.everydayExample].filter(Boolean).join(" ") }); break;
        case "code": items.push({ kind: "code", language: b.language, source: b.source }); break;
        case "table": items.push({ kind: "table", headers: b.headers, rows: b.rows }); break;
        case "graphSpec": items.push({ kind: "note", text: `Gráfica: ${b.functions.map((f) => f.label ?? f.expr).join(", ")}${b.caption ? `. ${b.caption}` : ""}` }); break;
        case "diagramSpec": items.push({ kind: "note", text: b.description }); break;
        case "exercise": {
          n += 1;
          items.push({ kind: "exercise", n, statement: b.statement, question: b.guidingQuestion, hints: b.hints });
          solutions.push({ n, statement: b.statement, steps: b.steps, answer: b.answer, mistakes: b.commonMistakes ?? [] });
          break;
        }
        case "activity": items.push({ kind: "activity", label: ACTIVITY[b.kind] ?? b.kind, prompt: b.prompt, minutes: b.minutes }); break;
        case "closing": closing = { keyIdeas: b.keyIdeas, questions: b.questions ?? [] }; break;
        case "imageRequest": break;
      }
    }
    return { id: s.id, title: s.title, items };
  }).filter((s) => s.items.length);
  return { title: c.meta.topic, subtitle: `${c.meta.level} · ${c.meta.objective}`, sections, keyConcepts, closing, solutions, credits: [...new Set(opts.credits ?? [])] };
}
