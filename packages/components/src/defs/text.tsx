import { z } from "zod";
import { Icon, Latex, Md, type IconName } from "@lamina/engine";
import { defineComponent } from "../define";

/* ───── Title ───── */
export const Title = defineComponent({
  id: "Title",
  title: "Portada",
  purpose: "Portada de la presentación: título, subtítulo y autoría. Siempre el primer slide (layout 'title' o 'cover-branded'; en este último el docente, la materia y las marcas los pone el layout).",
  useCases: ["Primer slide con tema, nivel y docente"],
  constraints: ["Título ≤ 90 caracteres", "Usar solo en el slot main de los layouts 'title' y 'cover-branded'"],
  fitsSlots: ["main"],
  schema: z.object({
    title: z.string().min(1).max(110),
    subtitle: z.string().max(160).optional(),
    author: z.string().max(100).optional(),
    date: z.string().max(40).optional(),
  }),
  examples: [{ name: "calculo", props: { title: "La derivada: razón de cambio instantánea", subtitle: "Cálculo diferencial · Primer ciclo", author: "Prof. Mariana Torres", date: "Octubre 2026" } }],
  Component: ({ props }) => (
    <div className="lm-title-slide">
      <h1>{props.title}</h1>
      {props.subtitle && <p className="lm-subtitle">{props.subtitle}</p>}
      <div className="lm-rule" />
      {(props.author || props.date) && <p className="lm-byline">{[props.author, props.date].filter(Boolean).join(" · ")}</p>}
    </div>
  ),
});

/* ───── SectionHeader ───── */
export const SectionHeader = defineComponent({
  id: "SectionHeader",
  title: "Encabezado de sección / título de slide",
  purpose: "Título de un slide (compacto, en el slot title) o separador de sección grande (slot main del layout 'section').",
  useCases: ["Título de cada slide de contenido", "Separador entre secciones"],
  constraints: ["Título ≤ 80 caracteres", "kicker ≤ 40 caracteres (p. ej. 'Sección 2')"],
  fitsSlots: ["title", "main"],
  schema: z.object({ title: z.string().min(1).max(110), kicker: z.string().max(60).optional() }),
  examples: [{ name: "slide", props: { title: "Definición formal de la derivada", kicker: "Sección 1" } }],
  Component: ({ props, ctx }) => {
    const compact = ctx.height < 300;
    return (
      <header className={compact ? "lm-header lm-header-compact" : "lm-header lm-header-large"}>
        {props.kicker && <span className="lm-kicker">{props.kicker}</span>}
        <h2>{props.title}</h2>
        {!compact && <div className="lm-rule" />}
      </header>
    );
  },
});

/* ───── BulletPoints ───── */
export const BulletPoints = defineComponent({
  id: "BulletPoints",
  title: "Lista de puntos",
  purpose: "Lista breve de ideas clave (Markdown inline y $LaTeX$ permitidos), con subpuntos opcionales.",
  useCases: ["Ideas clave de un concepto", "Pasos de un procedimiento (ordered)", "Condiciones o propiedades"],
  constraints: ["Máx. 6 ítems recomendados (8 duro)", "Cada ítem ≤ 110 caracteres", "Subpuntos ≤ 3 por ítem"],
  fitsSlots: ["main", "left", "right", "text", "note", "col1", "col2", "col3", "context", "caption", "aside", "side", "refs"],
  schema: z.object({
    items: z.array(z.object({ text: z.string().min(1).max(200), sub: z.array(z.string().max(140)).max(3).optional() })).min(1).max(8),
    ordered: z.boolean().default(false),
  }),
  examples: [{ name: "propiedades", props: { items: [{ text: "$(f+g)'=f'+g'$ (linealidad)" }, { text: "Regla del producto: $(fg)'=f'g+fg'$", sub: ["No es el producto de las derivadas"] }, { text: "Regla de la cadena para composiciones" }], ordered: false } }],
  Component: ({ props, ctx }) => {
    const n = props.items.length + props.items.reduce((a, i) => a + (i.sub?.length ?? 0), 0);
    const size = n <= 4 ? "lg" : n <= 6 ? "md" : "sm";
    const L = props.ordered ? "ol" : "ul";
    return (
      <L className={`lm-bullets lm-bullets-${size} ${ctx.width < 800 ? "lm-narrow" : ""}`}>
        {props.items.map((it, i) => (
          <li key={i}>
            <Md inline>{it.text}</Md>
            {it.sub && <ul>{it.sub.map((s, j) => <li key={j}><Md inline>{s}</Md></li>)}</ul>}
          </li>
        ))}
      </L>
    );
  },
});

/* ───── Comparison (TwoColumn) ───── */
const Col = z.object({ heading: z.string().max(80).optional(), md: z.string().min(1).max(700) });
export const TwoColumn = defineComponent({
  id: "TwoColumn",
  title: "Comparación en dos columnas",
  purpose: "Dos bloques de texto Markdown con encabezado, para contrastar ideas (p. ej. antes/después, derivada vs. integral).",
  useCases: ["Comparar dos conceptos", "Ventajas/limitaciones", "Pregunta y respuesta"],
  constraints: ["Cada columna ≤ 450 caracteres", "Úsalo en slot main (no dentro de two-column)"],
  fitsSlots: ["main"],
  schema: z.object({ left: Col, right: Col }),
  examples: [{ name: "comparar", props: { left: { heading: "Derivada", md: "Mide la **razón de cambio** instantánea de $f$." }, right: { heading: "Integral", md: "Mide la **acumulación** de $f$ sobre un intervalo." } } }],
  Component: ({ props }) => (
    <div className="lm-twocol">
      {[props.left, props.right].map((c, i) => (
        <section key={i} className="lm-panel">
          {c.heading && <h3>{c.heading}</h3>}
          <Md>{c.md}</Md>
        </section>
      ))}
    </div>
  ),
});

/* ───── Definition / Theorem ───── */
export const Definition = defineComponent({
  id: "Definition",
  title: "Definición / Teorema",
  purpose: "Enunciado formal destacado: definición, teorema, propiedad o lema, con nombre y nota opcional.",
  useCases: ["Definir un concepto", "Enunciar un teorema (con hipótesis)", "Resaltar una propiedad"],
  constraints: ["statement ≤ 500 caracteres; fórmulas con $…$ o $$…$$", "note ≤ 200 caracteres"],
  fitsSlots: ["main", "text", "left", "right", "note", "col1", "col2", "col3", "context", "aside", "side", "verdict"],
  schema: z.object({
    kind: z.enum(["definicion", "teorema", "propiedad", "lema", "corolario"]).default("definicion"),
    name: z.string().max(120).optional(),
    statement: z.string().min(1).max(700),
    note: z.string().max(260).optional(),
  }),
  examples: [{ name: "derivada", props: { kind: "definicion", name: "Derivada en un punto", statement: "Si el límite existe, la derivada de $f$ en $a$ es $$f'(a)=\\lim_{h\\to 0}\\frac{f(a+h)-f(a)}{h}.$$", note: "Interpretación: pendiente de la recta tangente en $(a,f(a))$." } }],
  Component: ({ props }) => {
    const label = { definicion: "Definición", teorema: "Teorema", propiedad: "Propiedad", lema: "Lema", corolario: "Corolario" }[props.kind];
    const icon: IconName = { definicion: "lupa", teorema: "check", propiedad: "funcion", lema: "vector", corolario: "flecha" }[props.kind] as IconName;
    return (
      <article className={`lm-definition lm-def-${props.kind}`}>
        <div className="lm-def-head"><Icon name={icon} size={34} /><span className="lm-def-kind">{label}</span>{props.name && <span className="lm-def-name">{props.name}</span>}</div>
        <Md>{props.statement}</Md>
        {props.note && <Md className="lm-def-note">{props.note}</Md>}
      </article>
    );
  },
});

/* ───── FormulaHighlight ───── */
export const FormulaHighlight = defineComponent({
  id: "FormulaHighlight",
  title: "Fórmula destacada",
  purpose: "Una fórmula protagonista grande y centrada, con leyenda y significado de variables.",
  useCases: ["Fórmula clave del tema", "Regla (potencia, cadena, producto)", "Ley física"],
  constraints: ["latex ≤ 300 caracteres, una sola fórmula", "Máx. 5 variables"],
  fitsSlots: ["main", "left", "right", "visual"],
  schema: z.object({
    latex: z.string().min(1).max(600),
    caption: z.string().max(200).optional(),
    variables: z.array(z.object({ symbol: z.string().max(40), meaning: z.string().max(120) })).max(5).optional(),
  }),
  examples: [{ name: "cadena", props: { latex: "\\frac{d}{dx}f(g(x)) = f'(g(x))\\,g'(x)", caption: "Regla de la cadena", variables: [{ symbol: "f", meaning: "función externa" }, { symbol: "g", meaning: "función interna" }] } }],
  Component: ({ props, ctx }) => {
    // Tamaño según el ancho del área y la longitud de la fórmula (las órdenes TeX cuentan como un símbolo): cabe sin cortarse en columnas angostas.
    const symbols = Math.max(4, props.latex.replace(/\\[a-zA-Z]+/g, "x").replace(/[{}\s]/g, "").length);
    const hero = ctx.layout === "hero-formula";
    const base = hero ? 132 : ctx.width >= 1500 ? 76 : ctx.width >= 900 ? 64 : 52;
    const size = Math.round(Math.max(36, Math.min(base, (ctx.width * 0.8) / (symbols * 0.5))));
    const pad = ctx.width < 1000 ? "28px 28px" : undefined;
    return (
    <figure className="lm-formula">
      <div className="lm-formula-box" style={{ fontSize: size, padding: pad }}><Latex tex={props.latex} /></div>
      {props.caption && <figcaption>{props.caption}</figcaption>}
      {props.variables && (
        <dl className="lm-vars">
          {props.variables.map((v, i) => (<div key={i}><dt><Latex tex={v.symbol} display={false} /></dt><dd>{v.meaning}</dd></div>))}
        </dl>
      )}
    </figure>
    );
  },
});

/* ───── Derivation ───── */
export const Derivation = defineComponent({
  id: "Derivation",
  title: "Derivación paso a paso",
  purpose: "Cadena de pasos algebraicos/cálculo, cada uno con su fórmula y la justificación. Admite aparición progresiva (stepwise).",
  useCases: ["Deducir una fórmula", "Demostración corta", "Resolver una derivada con justificación por paso"],
  constraints: ["Máx. 6 pasos visibles cómodos (hasta 8)", "explanation ≤ 110 caracteres", "Con stepwise=true el slot debe aparecer en build.steps tantas veces como pasos"],
  fitsSlots: ["main", "left", "right", "visual"],
  schema: z.object({
    steps: z.array(z.object({ latex: z.string().min(1).max(400), explanation: z.string().max(220) })).min(1).max(8),
    stepwise: z.boolean().default(false),
  }),
  examples: [{ name: "potencia", props: { steps: [{ latex: "f(x)=x^3", explanation: "Función dada" }, { latex: "f'(x)=\\lim_{h\\to0}\\frac{(x+h)^3-x^3}{h}", explanation: "Por definición" }, { latex: "f'(x)=3x^2", explanation: "Se simplifica y se toma el límite" }], stepwise: false } }],
  Component: ({ props, ctx }) => {
    const shown = props.stepwise && ctx.revealCount != null ? props.steps.slice(0, ctx.revealCount) : props.steps;
    const n = props.steps.length;
    return (
      <ol className={`lm-derivation ${n > 5 ? "lm-dense" : ""}`}>
        {shown.map((s, i) => (
          <li key={i} className="lm-step">
            <span className="lm-step-n">{i + 1}</span>
            <div className="lm-step-math"><Latex tex={s.latex} /></div>
            {s.explanation && <div className="lm-step-why">{s.explanation}</div>}
          </li>
        ))}
      </ol>
    );
  },
});

/* ───── WorkedExample ───── */
export const WorkedExample = defineComponent({
  id: "WorkedExample",
  title: "Ejemplo resuelto",
  purpose: "Problema → pasos de resolución → respuesta final destacada. Admite aparición progresiva.",
  useCases: ["Ejemplo numérico", "Problema de aplicación (física, optimización)", "Resolución guiada"],
  constraints: ["problem ≤ 300 caracteres", "Máx. 5 pasos (hasta 8)", "answer ≤ 160 caracteres"],
  fitsSlots: ["main", "left", "right"],
  schema: z.object({
    problem: z.string().min(1).max(500),
    steps: z.array(z.object({ latex: z.string().max(300).optional(), text: z.string().max(260) })).min(1).max(8),
    answer: z.string().min(1).max(260),
    stepwise: z.boolean().default(false),
  }),
  examples: [{ name: "tangente", props: { problem: "Halla la recta tangente a $f(x)=x^2$ en $x=3$.", steps: [{ text: "Evaluar: $f(3)=9$", latex: "f(3)=9" }, { text: "Derivar: $f'(x)=2x$, luego $f'(3)=6$" }, { text: "Ecuación punto-pendiente", latex: "y-9=6(x-3)" }], answer: "$y = 6x - 9$" } }],
  Component: ({ props, ctx }) => {
    const total = props.steps.length + 2; // problema + pasos + respuesta
    const shownSteps = props.stepwise && ctx.revealCount != null ? props.steps.slice(0, Math.max(0, ctx.revealCount - 1)) : props.steps;
    const showAnswer = !(props.stepwise && ctx.revealCount != null) || ctx.revealCount >= props.steps.length + 1;
    return (
      <div className={`lm-example ${total > 6 ? "lm-dense" : ""}`}>
        <section className="lm-ex-problem"><span className="lm-label">Problema</span><Md>{props.problem}</Md></section>
        <ol className="lm-ex-steps">
          {shownSteps.map((s, i) => (
            <li key={i}><span className="lm-step-n">{i + 1}</span><div><Md inline>{s.text}</Md>{s.latex && <div className="lm-step-math"><Latex tex={s.latex} /></div>}</div></li>
          ))}
        </ol>
        {showAnswer && <section className="lm-ex-answer"><span className="lm-label">Respuesta</span><Md inline>{props.answer}</Md></section>}
      </div>
    );
  },
});
