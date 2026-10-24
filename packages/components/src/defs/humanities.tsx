import { z } from "zod";
import { Md } from "@lamina/engine";
import { defineComponent } from "../define";

const FIT = ["main", "left", "right", "visual", "text"];

/* ───── Timeline ───── */
export const Timeline = defineComponent({
  id: "Timeline",
  title: "Línea de tiempo",
  purpose: "Eventos en orden cronológico sobre una línea horizontal, con fecha, título y detalle breve.",
  useCases: ["Historia de un concepto o corriente", "Etapas de un proceso", "Biografía de un autor"],
  constraints: ["3–6 eventos; date ≤ 14, title ≤ 40, detail ≤ 90 caracteres"],
  fitsSlots: [...FIT, "col1"], areas: ["humanities", "general", "natsci"],
  schema: z.object({ events: z.array(z.object({ date: z.string().min(1).max(14), title: z.string().min(1).max(40), detail: z.string().max(90).optional() })).min(3).max(6) }),
  examples: [{ name: "ilustracion", props: { events: [{ date: "1687", title: "Principia", detail: "Newton publica sus leyes" }, { date: "1751", title: "Enciclopedia", detail: "Diderot y D'Alembert" }, { date: "1789", title: "Revolución francesa", detail: "Derechos del hombre" }] } }],
  Component: ({ props }) => (
    <ol className="lm-timeline">{props.events.map((e, i) => <li key={i} data-up={i % 2 === 0 || undefined}><span className="lm-tl-date">{e.date}</span><span className="lm-tl-dot" aria-hidden="true" /><div className="lm-tl-body"><strong>{e.title}</strong>{e.detail && <p>{e.detail}</p>}</div></li>)}</ol>
  ),
});

/* ───── ConceptMap ───── */
export const ConceptMap = defineComponent({
  id: "ConceptMap",
  title: "Mapa conceptual",
  purpose: "Concepto central con ramas que se abren a su alrededor (y subconceptos opcionales).",
  useCases: ["Organizar los conceptos de un tema", "Relacionar teorías o factores", "Resumen visual"],
  constraints: ["center ≤ 36 caracteres; 3–6 ramas (label ≤ 30), cada una con hasta 2 hijos (≤ 26)"],
  fitsSlots: FIT, areas: ["humanities", "general", "natsci", "programming"],
  schema: z.object({ center: z.string().min(1).max(36), branches: z.array(z.object({ label: z.string().min(1).max(30), children: z.array(z.string().min(1).max(26)).max(2).default([]) })).min(3).max(6) }),
  examples: [{ name: "evaluacion", props: { center: "Evaluación", branches: [{ label: "Diagnóstica", children: ["Al inicio"] }, { label: "Formativa", children: ["Durante", "Retroalimenta"] }, { label: "Sumativa", children: ["Al final"] }] } }],
  Component: ({ props, ctx }) => {
    const W = ctx.width, H = ctx.height, cx = W / 2, cy = H / 2, n = props.branches.length, Rx = W * 0.3, Ry = H * 0.3;
    return (
      <svg className="lm-cmap" width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Mapa conceptual de ${props.center}`}>
        {props.branches.map((b, i) => {
          const a = (2 * Math.PI * i) / n - Math.PI / 2, x = cx + Rx * Math.cos(a), y = cy + Ry * Math.sin(a), side = Math.cos(a) >= 0 ? 1 : -1;
          return (
            <g key={i}>
              <line className="lm-flow-edge" x1={cx} y1={cy} x2={x} y2={y} />
              {b.children.map((c, k) => { const tx = x + side * 190, ty = y + (k - (b.children.length - 1) / 2) * 70; return <g key={k}><line className="lm-flow-edge" x1={x} y1={y} x2={tx} y2={ty} strokeWidth={2.5} /><text className="lm-cmap-leaf" x={tx + side * 12} y={ty + 8} textAnchor={side > 0 ? "start" : "end"}>{c}</text></g>; })}
              <rect className="lm-cmap-branch" x={x - 118} y={y - 34} width={236} height={68} rx={34} /><text className="lm-cmap-label" x={x} y={y + 9} textAnchor="middle">{b.label}</text>
            </g>
          );
        })}
        <ellipse className="lm-cmap-center" cx={cx} cy={cy} rx={170} ry={62} /><text className="lm-cmap-centertext" x={cx} y={cy + 11} textAnchor="middle">{props.center}</text>
      </svg>
    );
  },
});

/* ───── QuoteSource ───── */
export const QuoteSource = defineComponent({
  id: "QuoteSource",
  title: "Cita con autor y obra",
  purpose: "Cita textual destacada con su autor, obra y año.",
  useCases: ["Fragmento de un texto fuente", "Declaración de un pensador", "Cita para analizar en clase"],
  constraints: ["text ≤ 300; author ≤ 60; work ≤ 90; year ≤ 10 caracteres"],
  fitsSlots: FIT, areas: ["humanities", "general"],
  schema: z.object({ text: z.string().min(1).max(300), author: z.string().min(1).max(60), work: z.string().max(90).optional(), year: z.string().max(10).optional() }),
  examples: [{ name: "freire", props: { text: "Nadie educa a nadie, nadie se educa a sí mismo, los hombres se educan entre sí.", author: "Paulo Freire", work: "Pedagogía del oprimido", year: "1970" } }],
  Component: ({ props }) => (
    <figure className="lm-qs"><blockquote><Md inline>{props.text}</Md></blockquote><figcaption><strong>{props.author}</strong>{props.work && <em>, {props.work}</em>}{props.year && <span> ({props.year})</span>}</figcaption></figure>
  ),
});

/* ───── CaseStudy ───── */
export const CaseStudy = defineComponent({
  id: "CaseStudy",
  title: "Estudio de caso",
  purpose: "Un caso breve con su contexto, los datos relevantes y la pregunta que la clase debe responder.",
  useCases: ["Caso jurídico o clínico", "Situación de aula", "Problema de gestión"],
  constraints: ["title ≤ 60; context ≤ 320; points 2–4 (≤ 110); question ≤ 180 caracteres"],
  fitsSlots: FIT, areas: ["humanities", "general"],
  schema: z.object({ title: z.string().min(1).max(60), context: z.string().min(1).max(320), points: z.array(z.string().min(1).max(110)).min(2).max(4), question: z.string().min(1).max(180) }),
  examples: [{ name: "aula", props: { title: "El grupo que no participa", context: "En un curso de 35 estudiantes, solo cinco intervienen en las discusiones. La docente prueba trabajo en parejas.", points: ["Cursos grandes", "Poca confianza para hablar", "Evaluación por participación"], question: "¿Qué estrategia aumentaría la participación sin presionar?" } }],
  Component: ({ props }) => (
    <section className="lm-case"><h3>{props.title}</h3><p><Md inline>{props.context}</Md></p><ul>{props.points.map((p, i) => <li key={i}><Md inline>{p}</Md></li>)}</ul><p className="lm-case-q"><strong>Pregunta.</strong> <Md inline>{props.question}</Md></p></section>
  ),
});

/* ───── ClassActivity ───── */
const KIND_LABEL = { debate: "Debate", pregunta: "Pregunta para la clase", pares: "Trabajo en pares", practica: "Práctica" } as const;
export const ClassActivity = defineComponent({
  id: "ClassActivity",
  title: "Actividad de clase",
  purpose: "Dinámica para hacer en el aula (debate, pregunta, pares o práctica) con consigna, pasos y tiempo sugerido.",
  useCases: ["Debate de 10 minutos", "Pensar–compartir en parejas", "Práctica breve"],
  constraints: ["prompt ≤ 260; steps ≤ 3 (≤ 100); minutes 1–60"],
  fitsSlots: FIT, areas: "all",
  schema: z.object({ kind: z.enum(["debate", "pregunta", "pares", "practica"]), prompt: z.string().min(1).max(260), steps: z.array(z.string().min(1).max(100)).max(3).default([]), minutes: z.number().int().min(1).max(60) }),
  examples: [{ name: "pares", props: { kind: "pares", prompt: "Expliquen a su compañero, con sus palabras, qué es una pila.", steps: ["Uno explica (1 min)", "El otro repite lo entendido", "Intercambian roles"], minutes: 5 } }],
  Component: ({ props }) => (
    <section className="lm-activity"><header><span>{KIND_LABEL[props.kind]}</span><b>{props.minutes} min</b></header><p><Md inline>{props.prompt}</Md></p>{props.steps.length > 0 && <ol>{props.steps.map((s, i) => <li key={i}><Md inline>{s}</Md></li>)}</ol>}</section>
  ),
});
