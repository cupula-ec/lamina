import { z } from "zod";
import { Md } from "@lamina/engine";
import { defineComponent } from "../define";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/* ───── Image ───── */
export const Image = defineComponent({
  id: "Image",
  title: "Imagen",
  purpose: "Imagen de apoyo guardada en Lámina (nunca una URL externa), con texto alternativo obligatorio, recorte controlado y crédito opcional.",
  useCases: ["Fotografía de un fenómeno o lugar", "Esquema o diagrama real", "Retrato o contexto histórico"],
  constraints: ["assetId = id de una imagen ya guardada (la elige el sistema o el docente)", "alt obligatorio ≤ 300 caracteres", "caption ≤ 160 caracteres"],
  fitsSlots: ["visual", "main", "left", "right", "aside", "side", "col1", "col2", "col3"],
  schema: z.object({
    assetId: z.string().regex(UUID),
    alt: z.string().min(1).max(300),
    fit: z.enum(["cover", "contain"]).default("cover"),
    focal: z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1) }).optional(),
    caption: z.string().max(160).optional(),
    showCredit: z.boolean().default(false),
    /** Texto de crédito (autor · licencia · fuente); se muestra solo con showCredit. */
    credit: z.string().max(200).optional(),
    /** URL resuelta por el servidor al mostrar (firmada, con caducidad); no se guarda en el deck. */
    src: z.string().max(400).regex(/^(\/api\/assets\/[0-9a-f-]{36}(\?[A-Za-z0-9=&_-]+)?|assets\/[A-Za-z0-9._-]{1,80})$/i).optional(),
  }),
  examples: [{ name: "figura", props: { assetId: "00000000-0000-4000-8000-000000000000", alt: "Célula animal vista al microscopio", caption: "Célula animal", fit: "cover", showCredit: false } }],
  Component: ({ props }) => (
    <figure className="lm-image" style={{ ["--lm-img-fit" as string]: props.fit, ...(props.focal ? { ["--lm-img-x" as string]: `${props.focal.x * 100}%`, ["--lm-img-y" as string]: `${props.focal.y * 100}%` } : {}) }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={props.src ?? `/api/assets/${props.assetId}`} alt={props.alt} decoding="async" />
      {(props.caption || (props.showCredit && props.credit)) && (
        <figcaption>
          {props.caption && <Md inline>{props.caption}</Md>}
          {props.showCredit && props.credit && <span className="lm-image-credit">{props.credit}</span>}
        </figcaption>
      )}
    </figure>
  ),
});

/* ───── Exercise ───── */
export const Exercise = defineComponent({
  id: "Exercise",
  title: "Ejercicio guiado",
  purpose: "Ejercicio con enunciado y pregunta guía visibles primero; luego se revelan, una a una, las pistas, los pasos explicados (qué y por qué) y la respuesta al final.",
  useCases: ["Práctica guiada en clase", "Problema con pistas graduales", "Ejercicio con solución explicada"],
  constraints: ["statement ≤ 420 y guidingQuestion ≤ 160 caracteres", "hints 1–3 (≤ 140); steps 1–8 con do y why (≤ 130 cada uno)", "Revelado: necesita build.steps con (hints + steps + 1) pasos que revelen este slot"],
  fitsSlots: ["main", "left", "right", "text"], areas: "all",
  schema: z.object({
    statement: z.string().min(1).max(420), guidingQuestion: z.string().min(1).max(160),
    hints: z.array(z.string().min(1).max(140)).min(1).max(3),
    steps: z.array(z.object({ do: z.string().min(1).max(130), why: z.string().min(1).max(130) })).min(1).max(8),
    answer: z.string().min(1).max(200),
    stepwise: z.boolean().default(true),
  }),
  examples: [{ name: "pilas", props: { statement: "Apilas 1, 2 y 3 (en ese orden) y desapilas una vez. ¿Qué elemento sale?", guidingQuestion: "¿Cuál fue el último en entrar?", hints: ["Una pila es LIFO: último en entrar, primero en salir."], steps: [{ do: "Apila 1, 2 y 3", why: "El 3 queda en el tope" }, { do: "Desapila una vez", why: "Siempre sale el elemento del tope" }], answer: "Sale el 3.", stepwise: true } }],
  Component: ({ props, ctx }) => {
    const total = 1 + props.hints.length + props.steps.length + 1;
    const stage = props.stepwise && ctx.revealCount != null ? Math.min(total - 1, Math.max(0, ctx.revealCount)) : total - 1;
    const hStart = 1, sStart = 1 + props.hints.length, aStage = sStart + props.steps.length;
    return (
      <section className="lm-exercise">
        <p className="lm-ex-statement"><Md inline>{props.statement}</Md></p>
        <p className="lm-ex-guide"><strong>Piensa:</strong> <Md inline>{props.guidingQuestion}</Md></p>
        {props.hints.map((h, i) => stage >= hStart + i && <p key={`h${i}`} className="lm-ex-hint"><span>Pista {i + 1}</span> <Md inline>{h}</Md></p>)}
        <ol className="lm-ex-steps">{props.steps.map((s, i) => stage >= sStart + i && <li key={`s${i}`}><strong><Md inline>{s.do}</Md></strong><em><Md inline>{s.why}</Md></em></li>)}</ol>
        {stage >= aStage && <p className="lm-ex-answer"><span>Respuesta</span> <Md inline>{props.answer}</Md></p>}
      </section>
    );
  },
});

/* ───── ExitSlide ───── */
export const ExitSlide = defineComponent({
  id: "ExitSlide",
  title: "Cierre de clase",
  purpose: "Cierre de la sesión: ideas clave, preguntas para pensar, ticket de salida y adelanto de la próxima clase.",
  useCases: ["Última diapositiva de cada clase", "Ticket de salida", "Tarea o próxima sesión"],
  constraints: ["keyIdeas 1–5 (≤ 130 caracteres)", "questions ≤ 3; exitTicket y nextClass ≤ 160"],
  fitsSlots: ["main", "left", "right"], areas: "all",
  schema: z.object({ keyIdeas: z.array(z.string().min(1).max(130)).min(1).max(5), questions: z.array(z.string().min(1).max(160)).max(3).default([]), exitTicket: z.string().max(160).optional(), nextClass: z.string().max(160).optional() }),
  examples: [{ name: "cierre", props: { keyIdeas: ["Una pila es LIFO", "Push agrega y pop quita del tope"], questions: ["¿Dónde usarías una pila?"], exitTicket: "Escribe un ejemplo de la vida diaria que funcione como una pila.", nextClass: "Colas y su diferencia con las pilas" } }],
  Component: ({ props }) => (
    <section className="lm-exit">
      <h3>Ideas clave</h3>
      <ol>{props.keyIdeas.map((k, i) => <li key={i}><span className="lm-step-n">{i + 1}</span><Md inline>{k}</Md></li>)}</ol>
      {props.questions.length > 0 && <div className="lm-exit-q"><h4>Para pensar</h4><ul>{props.questions.map((q, i) => <li key={i}><Md inline>{q}</Md></li>)}</ul></div>}
      <div className="lm-exit-foot">
        {props.exitTicket && <p><strong>Ticket de salida.</strong> <Md inline>{props.exitTicket}</Md></p>}
        {props.nextClass && <p><strong>Próxima clase.</strong> <Md inline>{props.nextClass}</Md></p>}
      </div>
    </section>
  ),
});

/* ───── KeyIdea ───── */
export const KeyIdea = defineComponent({
  id: "KeyIdea",
  title: "Idea clave",
  purpose: "Una sola idea importante, grande y legible, con una línea de apoyo.",
  useCases: ["Mensaje central de una sección", "Definición en una frase", "Conclusión"],
  constraints: ["idea ≤ 160 caracteres; detail ≤ 220"],
  fitsSlots: ["main", "left", "right", "text", "aside"], areas: "all",
  schema: z.object({ idea: z.string().min(1).max(160), detail: z.string().max(220).optional() }),
  examples: [{ name: "idea", props: { idea: "Una pila siempre saca primero lo último que entró.", detail: "Por eso se llama LIFO." } }],
  Component: ({ props }) => (
    <div className="lm-keyidea"><p className="lm-keyidea-main"><Md inline>{props.idea}</Md></p>{props.detail && <p className="lm-keyidea-detail"><Md inline>{props.detail}</Md></p>}</div>
  ),
});

/* ───── Motivation ───── */
export const Motivation = defineComponent({
  id: "Motivation",
  title: "Motivación y contexto",
  purpose: "Antes de un concepto nuevo: por qué importa, la intuición sin formalismo y un ejemplo cotidiano.",
  useCases: ["Abrir un tema", "Conectar con la vida diaria", "Despertar la pregunta antes de la definición"],
  constraints: ["hook ≤ 120; intuition ≤ 300; everydayExample ≤ 240 caracteres"],
  fitsSlots: ["main", "left", "right", "text"], areas: "all",
  schema: z.object({ hook: z.string().min(1).max(120), intuition: z.string().min(1).max(300), everydayExample: z.string().max(240).optional() }),
  examples: [{ name: "deshacer", props: { hook: "¿Cómo sabe tu editor qué deshacer?", intuition: "Lo último que hiciste es lo primero que se revierte.", everydayExample: "Una pila de platos: solo puedes tomar el de arriba." } }],
  Component: ({ props }) => (
    <section className="lm-motiv">
      <h3><Md inline>{props.hook}</Md></h3>
      <p className="lm-motiv-int"><Md inline>{props.intuition}</Md></p>
      {props.everydayExample && <p className="lm-motiv-ex"><span>En la vida diaria</span> <Md inline>{props.everydayExample}</Md></p>}
    </section>
  ),
});
