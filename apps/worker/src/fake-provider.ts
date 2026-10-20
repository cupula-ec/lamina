import { FakeProvider } from "@lamina/ai";
import { slidesFromHint } from "@lamina/components";
import type { SlideHint } from "@lamina/contracts";

type Meta = { topic: string; level: string; objective: string; language: string };

/** Borrador de Cálculo determinista, con matemática correcta (los verificadores deben dar el visto bueno). */
export function fakeContent(meta: Meta, chunkIds: string[], regen: boolean, only?: string[]) {
  const ref = chunkIds[0] ? [chunkIds[0]] : [];
  const o = chunkIds[0] ? "research" : "generated";
  const sections = [
    { id: "s1", title: "La idea de derivada", locked: false, slidesHint: [
      { id: "h1", intent: "La derivada como razón de cambio", blocks: [
        { id: "b1", type: "text", origin: o, sourceRefs: ref, md: "- La **derivada** mide qué tan rápido cambia $f(x)$ cuando cambia $x$.\n- Geométricamente es la pendiente de la recta tangente.\n- Físicamente es la velocidad instantánea." },
        { id: "b2", type: "graphSpec", origin: "generated", sourceRefs: [], functions: [{ expr: "x^2", label: "f(x)=x²" }], domain: { xMin: -2, xMax: 3 }, points: [{ x: 1, y: 1, label: "(1, 1)" }], tangents: [{ fnIndex: 0, at: 1 }], caption: "Tangente a f en x = 1" },
      ] },
      { id: "h2", intent: "Definición formal", blocks: [
        { id: "b3", type: "definition", origin: o, sourceRefs: ref, term: "Derivada en un punto", md: "Si el límite existe, $$f'(a)=\\lim_{h\\to 0}\\frac{f(a+h)-f(a)}{h}.$$" },
        { id: "b4", type: "formula", origin: "generated", sourceRefs: [], latex: "f'(a)=\\lim_{h\\to 0}\\frac{f(a+h)-f(a)}{h}", caption: "Cociente incremental" },
      ] },
    ] },
    { id: "s2", title: "Reglas de derivación", locked: false, slidesHint: [
      { id: "h3", intent: "Regla de la potencia", blocks: [{ id: "b5", type: "derivation", origin: "generated", sourceRefs: [], steps: [
        { latex: "f(x)=x^3", explanation: "Función dada" },
        { latex: "\\frac{d}{dx}\\left(x^3\\right) = 3x^2", explanation: "Se baja el exponente y se resta 1" },
        { latex: "= 3x^{2}", explanation: "Resultado" },
      ] }] },
      { id: "h4", intent: "Tabla de derivadas básicas", blocks: [{ id: "b6", type: "table", origin: "generated", sourceRefs: [], headers: ["$f(x)$", "$f'(x)$"], rows: [["$x^n$", "$nx^{n-1}$"], ["$\\sin x$", "$\\cos x$"], ["$e^x$", "$e^x$"], ["$\\ln x$", "$1/x$"]], caption: "Derivadas básicas" }] },
      { id: "h5", intent: "Regla de la cadena", blocks: [{ id: "b7", type: "formula", origin: "generated", sourceRefs: [], latex: "\\frac{d}{dx}f(g(x)) = f'(g(x))\\,g'(x)", caption: "Regla de la cadena" }] },
    ] },
    { id: "s3", title: "Aplicaciones", locked: false, slidesHint: [
      { id: "h6", intent: "Recta tangente a una parábola", blocks: [{ id: "b8", type: "example", origin: "generated", sourceRefs: [], problem: "Halla la recta tangente a $f(x)=x^2$ en $x=3$.", steps: [{ text: "Evaluar la función", latex: "f(3)=9" }, { text: "Derivar", latex: "f'(x)=2x" }, { text: "Pendiente en x = 3", latex: "f'(3)=6" }, { text: "Punto-pendiente", latex: "y-9=6(x-3)" }], answer: "$y=6x-9$" }] },
      { id: "h7", intent: "Máximos y mínimos", blocks: [
        { id: "b9", type: "text", origin: "generated", sourceRefs: [], md: "- Los puntos críticos cumplen $f'(x)=0$.\n- Si $f'$ cambia de signo, hay un extremo local." },
        { id: "b10", type: "graphSpec", origin: "generated", sourceRefs: [], functions: [{ expr: "x^3 - 3x", label: "f(x)=x³−3x" }], domain: { xMin: -2.5, xMax: 2.5 }, points: [{ x: -1, y: 2, label: "máximo" }, { x: 1, y: -2, label: "mínimo" }], tangents: [] },
      ] },
    ] },
    { id: "s4", title: "Resumen y práctica", locked: false, slidesHint: [
      { id: "h8", intent: "Ideas clave", blocks: [{ id: "b11", type: "text", origin: "generated", sourceRefs: [], md: "- La derivada es un límite del cociente incremental.\n- Su valor es la pendiente de la tangente.\n- Las reglas de derivación evitan usar el límite cada vez." }] },
      { id: "h9", intent: "Ejercicio de práctica", blocks: [{ id: "b12", type: "example", origin: "generated", sourceRefs: [], problem: "Deriva $f(x)=x^2+3x$.", steps: [{ text: "Derivada de cada término", latex: "f'(x)=2x+3" }], answer: "$f'(x)=2x+3$" }] },
    ] },
  ];
  let out = sections;
  if (regen) out = sections.map((s, i) => (i === 0 ? { ...s, title: `${s.title} (revisada)` } : s));
  if (only?.length) out = out.filter((s) => only.includes(s.id));
  return { schemaVersion: 1, meta: { topic: meta.topic, level: meta.level, objective: meta.objective, language: meta.language }, sections: out };
}

export function makeFakeProvider() {
  return new FakeProvider({
    "research.queries": (r) => ({ queries: [`${(r.fakeContext as any).topic} explicación`, `${(r.fakeContext as any).topic} ejemplos resueltos`] }),
    "content.generate": (r) => { const c = r.fakeContext as any; return fakeContent(c.meta, c.chunkIds, c.regen, c.onlySectionIds); },
    "design.slide": (r) => { const h = (r.fakeContext as any).hint as SlideHint; return { slide: { ...slidesFromHint(h)[0]!, id: h.id } }; },
    polish: () => ({ slides: [] }),
  });
}
