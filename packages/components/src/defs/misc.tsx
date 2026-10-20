import { z } from "zod";
import { Latex, Md } from "@lamina/engine";
import { defineComponent } from "../define";

/* ───── UnitsCallout ───── */
export const UnitsCallout = defineComponent({
  id: "UnitsCallout",
  title: "Magnitudes y unidades",
  purpose: "Tabla compacta de magnitudes con símbolo, nombre y unidad (SI), útil en física y aplicaciones del cálculo.",
  useCases: ["Variables de un problema de física", "Unidades de una razón de cambio", "Constantes"],
  constraints: ["Máx. 5 filas", "unit en LaTeX simple (ej. \\mathrm{m/s^2})"],
  fitsSlots: ["text", "note", "left", "right", "main"],
  schema: z.object({
    rows: z.array(z.object({ symbol: z.string().min(1).max(40), name: z.string().max(80), unit: z.string().max(60) })).min(1).max(5),
    note: z.string().max(200).optional(),
  }),
  examples: [{ name: "cinematica", props: { rows: [{ symbol: "v", name: "velocidad", unit: "\\mathrm{m/s}" }, { symbol: "a", name: "aceleración", unit: "\\mathrm{m/s^2}" }, { symbol: "t", name: "tiempo", unit: "\\mathrm{s}" }], note: "Sistema Internacional (SI)" } }],
  Component: ({ props }) => (
    <div className="lm-units">
      <div className="lm-units-grid">
        {props.rows.map((r, i) => (
          <div key={i} className="lm-units-row"><span className="lm-units-sym"><Latex tex={r.symbol} display={false} /></span><span className="lm-units-name">{r.name}</span><span className="lm-units-unit"><Latex tex={r.unit} display={false} /></span></div>
        ))}
      </div>
      {props.note && <p className="lm-units-note">{props.note}</p>}
    </div>
  ),
});

/* ───── Quote ───── */
export const Quote = defineComponent({
  id: "Quote",
  title: "Cita y fuente",
  purpose: "Cita textual breve o dato con su fuente (autor/obra/URL), para respaldar una afirmación con referencia.",
  useCases: ["Cita de un libro de texto", "Dato histórico con fuente", "Referencia bibliográfica"],
  constraints: ["text ≤ 300 caracteres", "source obligatoria"],
  fitsSlots: ["main", "text", "left", "right", "note"],
  schema: z.object({ text: z.string().min(1).max(500), source: z.string().min(1).max(200), url: z.string().url().max(300).optional() }),
  examples: [{ name: "stewart", props: { text: "La derivada de una función en un punto mide la rapidez con que cambia el valor de la función respecto de su variable.", source: "Stewart, Cálculo de una variable, cap. 2" } }],
  Component: ({ props }) => (
    <blockquote className="lm-quote">
      <Md>{props.text}</Md>
      <footer>— {props.source}{props.url && <span className="lm-quote-url"> · {props.url.replace(/^https?:\/\//, "").slice(0, 60)}</span>}</footer>
    </blockquote>
  ),
});

/* ───── Summary ───── */
export const Summary = defineComponent({
  id: "Summary",
  title: "Resumen / ideas clave",
  purpose: "Cierre con las ideas clave numeradas de la sesión.",
  useCases: ["Último slide de contenido", "Repaso al final de una sección"],
  constraints: ["Máx. 5 puntos, cada uno ≤ 110 caracteres"],
  fitsSlots: ["main", "right", "left"],
  schema: z.object({ heading: z.string().max(80).default("Ideas clave"), points: z.array(z.string().min(1).max(200)).min(1).max(6) }),
  examples: [{ name: "cierre", props: { heading: "Ideas clave", points: ["La derivada es un límite del cociente incremental", "Su valor es la pendiente de la tangente", "Las reglas de derivación evitan usar el límite cada vez"] } }],
  Component: ({ props }) => (
    <section className="lm-summary">
      <h3>{props.heading}</h3>
      <ol>{props.points.map((p, i) => <li key={i}><span className="lm-step-n">{i + 1}</span><Md inline>{p}</Md></li>)}</ol>
    </section>
  ),
});

/* ───── Checkpoint ───── */
export const Checkpoint = defineComponent({
  id: "Checkpoint",
  title: "Pregunta para la clase",
  purpose: "Pregunta de comprobación para el grupo, con pista opcional y respuesta que puede revelarse por pasos.",
  useCases: ["Verificar comprensión", "Pausa activa", "Predicción antes de mostrar el resultado"],
  constraints: ["question ≤ 250 caracteres", "answer opcional ≤ 200 caracteres (se oculta si stepwise y aún no se reveló)"],
  fitsSlots: ["main", "right", "left", "note"],
  schema: z.object({
    question: z.string().min(1).max(400),
    hint: z.string().max(200).optional(),
    answer: z.string().max(260).optional(),
    stepwise: z.boolean().default(false),
  }),
  examples: [{ name: "pregunta", props: { question: "Si $f(x)=x^2$, ¿cuánto vale la pendiente de la tangente en $x=-1$?", hint: "Recuerda que $f'(x)=2x$.", answer: "$f'(-1)=-2$", stepwise: false } }],
  Component: ({ props, ctx }) => {
    const showAns = props.answer && (!props.stepwise || ctx.revealCount == null || ctx.revealCount >= 2);
    return (
      <aside className="lm-checkpoint">
        <span className="lm-label">Para pensar</span>
        <Md className="lm-cp-q">{props.question}</Md>
        {props.hint && <p className="lm-cp-hint"><strong>Pista:</strong> <Md inline>{props.hint}</Md></p>}
        {showAns && <p className="lm-cp-ans"><strong>Respuesta:</strong> <Md inline>{props.answer!}</Md></p>}
      </aside>
    );
  },
});
