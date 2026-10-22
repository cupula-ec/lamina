import { ENGINE_VERSION, type AccentId, type Branding, type DeckDocument, type LayoutId, type Slide, type ThemeId } from "@lamina/contracts";
import { NATIVE_CATALOG } from "./registry";

const ref = (componentId: string, props: Record<string, unknown>) => {
  const e = NATIVE_CATALOG.find((c) => c.def.id === componentId)!;
  return { componentId, version: e.def.version, props };
};
const slide = (id: string, layout: LayoutId, slots: Record<string, ReturnType<typeof ref>>): Slide => ({ id, layout, slots, notes: "", build: { steps: [] }, transition: "none" });
const hdr = (title: string, kicker?: string) => ref("SectionHeader", { title, ...(kicker ? { kicker } : {}) });

export const SAMPLE_BRANDING: Branding = {
  institution: { name: "Universidad de Ejemplo", short: "UEJ" },
  teacher: "Prof. Mariana Torres",
  subject: "Cálculo I",
  period: "Abr–Ago 2026",
  group: "Grupo 2",
};

const PLOT = { functions: [{ expr: "x^3/3 - x", label: "f(x) = x³/3 − x" }], xDomain: [-2.5, 2.5], yDomain: [-3, 3], points: [{ x: 1.5, fnIndex: 0, label: "a = 1,5" }], tangents: [{ fnIndex: 0, at: 1.5 }] };
const FORMULA = { latex: "f'(a)=\\lim_{h\\to 0}\\frac{f(a+h)-f(a)}{h}", caption: "Definición de derivada", variables: [{ symbol: "h", meaning: "incremento de la variable" }] };

/** Una diapositiva de ejemplo por layout (galería, pruebas de render y de contraste). Contenido sobrio y dentro de los límites de cada componente. */
export function sampleSlides(topic = "La derivada"): Record<LayoutId, Slide> {
  return {
    title: slide("s-title", "title", { main: ref("Title", { title: topic, subtitle: "Cálculo diferencial · Primer ciclo", author: "Prof. Mariana Torres", date: "Octubre 2026" }) }),
    "cover-branded": slide("s-cover", "cover-branded", { main: ref("Title", { title: topic, subtitle: "Cálculo diferencial · Primer ciclo" }) }),
    section: slide("s-section", "section", { main: ref("SectionNumber", { number: "2", title: "Reglas de derivación", subtitle: "Potencia, producto, cociente y cadena" }) }),
    "title-content": slide("s-tc", "title-content", { title: hdr("Derivar por definición", "Paso a paso"), main: ref("Derivation", { steps: [{ latex: "f(x)=x^3", explanation: "Función dada" }, { latex: "f'(x)=\\lim_{h\\to0}\\frac{(x+h)^3-x^3}{h}", explanation: "Por definición" }, { latex: "f'(x)=3x^2", explanation: "Se simplifica y se toma el límite" }], stepwise: false }) }),
    "two-column": slide("s-2c", "two-column", { title: hdr("Fórmula y gráfica"), left: ref("FormulaHighlight", FORMULA), right: ref("FunctionPlot", PLOT) }),
    "split-visual": slide("s-sv", "split-visual", {
      title: hdr("La derivada como pendiente", "Cálculo diferencial"),
      text: ref("Definition", { kind: "definicion", name: "Derivada", statement: "$$f'(a)=\\lim_{h\\to 0}\\frac{f(a+h)-f(a)}{h}$$", note: "Pendiente de la tangente en $(a,f(a))$." }),
      visual: ref("FunctionPlot", PLOT),
    }),
    "formula-focus": slide("s-ff", "formula-focus", { title: hdr("Regla de la cadena"), main: ref("FormulaHighlight", { latex: "\\frac{d}{dx}f(g(x)) = f'(g(x))\\,g'(x)", caption: "Derivada de una composición" }), note: ref("BulletPoints", { items: [{ text: "Deriva la función externa evaluada en la interna" }, { text: "Multiplica por la derivada de la interna" }], ordered: false }) }),
    "hero-formula": slide("s-hf", "hero-formula", { title: hdr("La identidad más famosa"), main: ref("FormulaHighlight", { latex: "e^{i\\pi}+1=0", caption: "Identidad de Euler" }), context: ref("IconBullets", { items: [{ icon: "funcion", title: "Une cinco constantes fundamentales" }, { icon: "lampara", title: "Se deduce de la fórmula de Euler" }] }) }),
    "full-visual": slide("s-fv", "full-visual", { visual: ref("FunctionPlot", { ...PLOT, tangents: [{ fnIndex: 0, at: 0.5 }], points: [{ x: 0.5, fnIndex: 0, label: "a = 0,5" }] }), title: hdr("Curva y tangente"), caption: ref("Callout", { variant: "nota", text: "La tangente aproxima la curva cerca del punto de tangencia." }) }),
    "three-column": slide("s-3c", "three-column", {
      title: hdr("Tres reglas básicas"),
      col1: ref("Callout", { variant: "idea", title: "Potencia", text: "$(x^n)'=nx^{n-1}$" }),
      col2: ref("Callout", { variant: "nota", title: "Producto", text: "$(fg)'=f'g+fg'$" }),
      col3: ref("Callout", { variant: "atencion", title: "Cociente", text: "$(f/g)'=\\frac{f'g-fg'}{g^2}$ con $g\\neq 0$" }),
    }),
    "steps-timeline": slide("s-st", "steps-timeline", { title: hdr("Método de derivación"), steps: ref("StepsList", { steps: [{ title: "Identificar", detail: "Reconoce la forma de la función." }, { title: "Elegir la regla", detail: "Potencia, producto o cadena." }, { title: "Derivar", detail: "Aplica la regla término a término." }, { title: "Simplificar", detail: "Reduce y verifica con un valor." }], orientation: "auto" }), note: ref("Callout", { variant: "nota", text: "Verifica siempre con un valor numérico sencillo." }) }),
    comparison: slide("s-cmp", "comparison", { title: hdr("Derivada frente a integral"), main: ref("ComparisonTable", { leftTitle: "Derivada", rightTitle: "Integral", rows: [{ criterion: "Mide", left: "Razón de cambio instantánea", right: "Acumulación sobre un intervalo" }, { criterion: "Geometría", left: "Pendiente de la tangente", right: "Área bajo la curva" }, { criterion: "Notación", left: "$\\frac{df}{dx}$", right: "$\\int f\\,dx$" }], winner: "none" }), verdict: ref("Callout", { variant: "idea", text: "Son operaciones inversas: el teorema fundamental del cálculo las conecta." }) }),
    "big-number": slide("s-bn", "big-number", { title: hdr("Un valor para recordar"), main: ref("StatCard", { value: "9,81", unit: "m/s²", label: "Aceleración de la gravedad", note: "Valor estándar al nivel del mar." }), text: ref("BulletPoints", { items: [{ text: "Es la segunda derivada de la posición en caída libre" }, { text: "Varía levemente con la latitud y la altura" }], ordered: false }) }),
    "quote-source": slide("s-qs", "quote-source", { main: ref("Quote", { text: "La derivada de una función en un punto mide la rapidez con que cambia el valor de la función respecto de su variable.", source: "Stewart, Cálculo de una variable, cap. 2" }), note: ref("Callout", { variant: "historia", text: "Leibniz y Newton formalizaron esta idea en el siglo XVII." }) }),
    agenda: slide("s-ag", "agenda", { title: hdr("Agenda de la clase"), main: ref("AgendaItem", { items: [{ title: "La derivada como pendiente", state: "done" }, { title: "Reglas de derivación", detail: "Potencia, producto y cadena", state: "current" }, { title: "Aplicaciones: optimización", state: "todo" }, { title: "Práctica guiada", state: "todo" }] }), side: ref("Callout", { variant: "idea", title: "Objetivo", text: "Derivar funciones polinómicas y compuestas con seguridad." }) }),
    closing: slide("s-cl", "closing", { title: hdr("Para cerrar"), main: ref("Summary", { heading: "Ideas clave", points: ["La derivada es un límite del cociente incremental", "Su valor es la pendiente de la tangente", "Las reglas de derivación evitan usar el límite cada vez"] }), refs: ref("BulletPoints", { items: [{ text: "Stewart, J. Cálculo de una variable" }, { text: "Apuntes de la clase" }], ordered: false }) }),
    "sidebar-notes": slide("s-sb", "sidebar-notes", { title: hdr("Derivar un polinomio"), main: ref("Derivation", { steps: [{ latex: "f(x)=3x^4-2x+5", explanation: "Función dada" }, { latex: "f'(x)=12x^3-2", explanation: "Regla de la potencia término a término" }], stepwise: false }), aside: ref("Callout", { variant: "atencion", title: "Ojo", text: "La derivada de una constante es $0$." }) }),
  };
}

/** Deck de 2 diapositivas para previsualizar un estilo: portada con marcas e interior con fórmula y gráfica. */
export function previewDeck(opts: { themeId: ThemeId; accent?: AccentId; topic?: string; branding?: Branding | null }): DeckDocument {
  const s = sampleSlides(opts.topic);
  const branding = opts.branding === null ? undefined : (opts.branding ?? SAMPLE_BRANDING);
  return {
    schemaVersion: 1, engineVersion: ENGINE_VERSION, themeId: opts.themeId, ...(opts.accent ? { accent: opts.accent } : {}),
    meta: { title: opts.topic ?? "La derivada", topic: opts.topic ?? "La derivada", level: "Universidad", language: "es", ...(branding ? { branding } : {}) },
    slides: [s["cover-branded"], s["two-column"]],
  };
}

/** Deck con todos los layouts (galería y pruebas de render/contraste). */
export function galleryDeck(opts: { themeId: ThemeId; accent?: AccentId }): DeckDocument {
  const s = sampleSlides();
  return {
    schemaVersion: 1, engineVersion: ENGINE_VERSION, themeId: opts.themeId, ...(opts.accent ? { accent: opts.accent } : {}),
    meta: { title: "La derivada", topic: "La derivada", level: "Universidad", language: "es", branding: SAMPLE_BRANDING },
    slides: Object.values(s),
  };
}
