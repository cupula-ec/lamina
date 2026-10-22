import { z } from "zod";
import { Icon, ICON_NAMES, Md, type IconName } from "@lamina/engine";
import { defineComponent } from "../define";

const WIDE_SLOTS = ["main", "text", "left", "right", "note", "col1", "col2", "col3", "context", "caption", "verdict", "side", "aside", "refs"];

/* ───── Callout ───── */
const CALLOUT: Record<string, { label: string; icon: IconName }> = {
  nota: { label: "Nota", icon: "lupa" },
  atencion: { label: "Atención", icon: "advertencia" },
  idea: { label: "Idea", icon: "lampara" },
  historia: { label: "Historia", icon: "flecha" },
  exito: { label: "Listo", icon: "check" },
};
export const Callout = defineComponent({
  id: "Callout",
  title: "Recuadro destacado",
  purpose: "Recuadro con icono para una nota, advertencia, idea clave o dato histórico breve; también sirve como tarjeta en layouts de varias columnas.",
  useCases: ["Advertir un error frecuente (atencion)", "Dato histórico o contexto (historia)", "Idea clave o truco (idea)", "Observación al margen (nota)", "Tarjeta de una de tres columnas"],
  constraints: ["text ≤ 200 caracteres recomendados (hasta 420)", "title ≤ 60 caracteres", "En columnas angostas usar texto de ≤ 120 caracteres"],
  fitsSlots: WIDE_SLOTS,
  schema: z.object({
    variant: z.enum(["nota", "atencion", "idea", "historia", "exito"]).default("nota"),
    title: z.string().max(80).optional(),
    text: z.string().min(1).max(420),
    icon: z.enum(ICON_NAMES).optional(),
  }),
  examples: [
    { name: "atencion", props: { variant: "atencion", title: "Error frecuente", text: "La derivada de un producto **no** es el producto de las derivadas: $(fg)'\\neq f'g'$." } },
    { name: "historia", props: { variant: "historia", title: "Newton y Leibniz", text: "El cálculo se desarrolló de forma independiente en el siglo XVII; la notación $\\frac{dy}{dx}$ es de Leibniz." } },
  ],
  Component: ({ props, ctx }) => {
    const v = CALLOUT[props.variant]!;
    if (ctx.height < 200) {
      // Franja baja (leyenda, conclusión): icono y texto en una sola fila.
      return (
        <aside className={`lm-callout lm-callout-compact lm-callout-${props.variant}`}>
          <span className="lm-callout-icon"><Icon name={props.icon ?? v.icon} size={30} /></span>
          <div className="lm-callout-line">{props.title && <strong>{props.title}. </strong>}<Md inline>{props.text}</Md></div>
        </aside>
      );
    }
    return (
      <aside className={`lm-callout lm-callout-${props.variant} ${ctx.width < 600 ? "lm-narrow" : ""}`}>
        <div className="lm-callout-head">
          <span className="lm-callout-icon"><Icon name={props.icon ?? v.icon} size={ctx.width < 600 ? 28 : 36} /></span>
          <span className="lm-callout-label">{v.label}</span>
        </div>
        {props.title && <h3 className="lm-callout-title">{props.title}</h3>}
        <Md>{props.text}</Md>
      </aside>
    );
  },
});

/* ───── StatCard ───── */
const TREND = { up: { label: "En aumento", rot: -45 }, down: { label: "En descenso", rot: 45 }, flat: { label: "Sin cambio", rot: 0 } } as const;
export const StatCard = defineComponent({
  id: "StatCard",
  title: "Cifra destacada",
  purpose: "Una cifra o resultado grande con su unidad, qué mide y una nota breve; para el dato que la clase debe recordar.",
  useCases: ["Resultado numérico final", "Constante o magnitud clave (9,8 m/s²)", "Dato estadístico", "Tarjeta de una de tres columnas"],
  constraints: ["value ≤ 12 caracteres (puede llevar $…$)", "label ≤ 90 caracteres", "note ≤ 160 caracteres"],
  fitsSlots: ["main", "left", "right", "col1", "col2", "col3", "text", "side"],
  schema: z.object({
    value: z.string().min(1).max(16),
    unit: z.string().max(14).optional(),
    label: z.string().min(1).max(100),
    note: z.string().max(200).optional(),
    trend: z.enum(["up", "down", "flat"]).optional(),
  }),
  examples: [
    { name: "gravedad", props: { value: "9,81", unit: "m/s²", label: "Aceleración de la gravedad en la superficie terrestre", note: "Valor estándar al nivel del mar." } },
    { name: "tendencia", props: { value: "+37 %", label: "Crecimiento anual de la muestra", trend: "up" } },
  ],
  Component: ({ props, ctx }) => {
    const len = Math.max(2, props.value.replace(/[$\\{}]/g, "").length + (props.unit ? props.unit.length * 0.4 : 0));
    const size = Math.round(Math.max(88, Math.min(220, ctx.height * 0.4, (ctx.width * 0.86) / (len * 0.6))));
    const t = props.trend ? TREND[props.trend] : null;
    return (
      <div className={`lm-stat ${ctx.width < 600 ? "lm-narrow" : ""}`}>
        <div className="lm-stat-value" style={{ fontSize: size }}>
          <Md inline>{props.value}</Md>{props.unit && <span className="lm-stat-unit">{props.unit}</span>}
        </div>
        <div className="lm-stat-label"><Md inline>{props.label}</Md></div>
        {t && <div className="lm-stat-trend"><span style={{ display: "inline-flex", transform: `rotate(${t.rot}deg)` }}><Icon name="flecha" size={36} /></span>{t.label}</div>}
        {props.note && <Md className="lm-stat-note">{props.note}</Md>}
      </div>
    );
  },
});

/* ───── StepsList ───── */
const stepSizes = (n: number) => (n <= 2 ? [44, 34] : n === 3 ? [42, 34] : n === 4 ? [38, 30] : [34, 28]) as [number, number];
export const StepsList = defineComponent({
  id: "StepsList",
  title: "Pasos en secuencia",
  purpose: "Proceso o método en 2 a 5 pasos numerados, en línea de tiempo horizontal (o vertical en áreas angostas), con título y detalle por paso.",
  useCases: ["Método de resolución", "Demostración por etapas", "Algoritmo o protocolo", "Línea de tiempo"],
  constraints: ["3–5 pasos recomendados", "title ≤ 45 caracteres", "detail ≤ 110 caracteres"],
  fitsSlots: ["steps", "main", "left", "right", "text"],
  schema: z.object({
    steps: z.array(z.object({ title: z.string().min(1).max(80), detail: z.string().max(180).optional() })).min(2).max(5),
    orientation: z.enum(["auto", "horizontal", "vertical"]).default("auto"),
  }),
  examples: [{ name: "metodo", props: { steps: [{ title: "Identificar", detail: "Reconoce la función y la variable de derivación." }, { title: "Aplicar la regla", detail: "Elige potencia, producto o cadena según la forma." }, { title: "Simplificar", detail: "Reduce términos semejantes." }, { title: "Verificar", detail: "Comprueba con un valor numérico." }], orientation: "auto" } }],
  Component: ({ props, ctx }) => {
    const n = props.steps.length;
    const horizontal = props.orientation === "horizontal" || (props.orientation === "auto" && ctx.width >= 1000 && ctx.width / ctx.height > 1.25);
    const [st, sd] = horizontal ? stepSizes(n) : ctx.width < 700 ? [34, 28] : [38, 30];
    const style = { ["--n" as string]: n, ["--st" as string]: `${st}px`, ["--sd" as string]: `${sd}px` } as React.CSSProperties;
    return (
      <ol className={`lm-steps ${horizontal ? "lm-steps-h" : "lm-steps-v"}`} style={style}>
        {props.steps.map((s, i) => (
          <li key={i} className="lm-stepc">
            <div className="lm-stepc-head"><span className="lm-stepc-n">{i + 1}</span>{horizontal && <span className="lm-stepc-line" />}</div>
            <div className="lm-stepc-card">
              <h3 className="lm-stepc-title"><Md inline>{s.title}</Md></h3>
              {s.detail && <div className="lm-stepc-detail"><Md inline>{s.detail}</Md></div>}
            </div>
          </li>
        ))}
      </ol>
    );
  },
});

/* ───── ComparisonTable ───── */
export const ComparisonTable = defineComponent({
  id: "ComparisonTable",
  title: "Tabla comparativa A frente a B",
  purpose: "Compara dos alternativas con cabeceras de color y una fila por criterio; admite resaltar la opción ganadora.",
  useCases: ["Derivada frente a integral", "Método A frente a método B", "Ventajas y limitaciones", "Antes y después"],
  constraints: ["1–6 filas (3–5 ideal)", "Celdas ≤ 90 caracteres", "Cabeceras ≤ 40 caracteres"],
  fitsSlots: ["main", "left", "right"],
  schema: z.object({
    leftTitle: z.string().min(1).max(60),
    rightTitle: z.string().min(1).max(60),
    rows: z.array(z.object({ criterion: z.string().max(60).optional(), left: z.string().min(1).max(160), right: z.string().min(1).max(160) })).min(1).max(6),
    winner: z.enum(["left", "right", "none"]).default("none"),
  }),
  examples: [{ name: "derivada-integral", props: { leftTitle: "Derivada", rightTitle: "Integral", rows: [{ criterion: "Mide", left: "Razón de cambio instantánea", right: "Acumulación sobre un intervalo" }, { criterion: "Geometría", left: "Pendiente de la tangente", right: "Área bajo la curva" }, { criterion: "Notación", left: "$\\frac{df}{dx}$", right: "$\\int f\\,dx$" }], winner: "none" } }],
  Component: ({ props, ctx }) => {
    const hasCrit = props.rows.some((r) => r.criterion);
    const n = props.rows.length;
    const cs = n <= 3 ? 40 : n === 4 ? 36 : n === 5 ? 33 : 30;
    const style = { ["--cs" as string]: `${ctx.width < 900 ? cs - 4 : cs}px`, ["--ch" as string]: `${n <= 4 ? 40 : 34}px` } as React.CSSProperties;
    return (
      <div className="lm-cmp" style={style}>
        <table>
          <thead><tr>{hasCrit && <th className="lm-cmp-crit" />}<th className="lm-cmp-a">{props.leftTitle}</th><th className="lm-cmp-b">{props.rightTitle}</th></tr></thead>
          <tbody>
            {props.rows.map((r, i) => (
              <tr key={i}>
                {hasCrit && <td className="lm-cmp-crit">{r.criterion ?? ""}</td>}
                <td className={props.winner === "left" ? "lm-cmp-win" : ""}><Md inline>{r.left}</Md></td>
                <td className={props.winner === "right" ? "lm-cmp-win" : ""}><Md inline>{r.right}</Md></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  },
});

/* ───── IconBullets ───── */
export const IconBullets = defineComponent({
  id: "IconBullets",
  title: "Lista con iconos",
  purpose: "Lista de 1 a 5 ideas, cada una con un icono (lupa, lámpara, advertencia, check, flecha, integral, vector, función), título y texto breve.",
  useCases: ["Ideas clave con iconografía", "Pasos o características", "Resumen visual lateral"],
  constraints: ["Máx. 5 ítems (3–4 ideal)", "title ≤ 50 caracteres", "text ≤ 100 caracteres"],
  fitsSlots: ["main", "left", "right", "text", "col1", "col2", "col3", "context", "aside", "side", "note"],
  schema: z.object({
    items: z.array(z.object({ icon: z.enum(ICON_NAMES).default("check"), title: z.string().min(1).max(90), text: z.string().max(160).optional() })).min(1).max(5),
  }),
  examples: [{ name: "ideas", props: { items: [{ icon: "funcion", title: "Una función por tramos", text: "Se deriva cada tramo por separado." }, { icon: "lupa", title: "Revisar los extremos", text: "Comprueba continuidad y derivabilidad." }, { icon: "advertencia", title: "Cuidado con los signos", text: "Un error de signo cambia la concavidad." }] } }],
  Component: ({ props, ctx }) => {
    const n = props.items.length;
    const narrow = ctx.width < 700;
    const [it, ix] = narrow ? [34, 28] : n <= 3 ? [42, 34] : n === 4 ? [38, 30] : [34, 28];
    return (
      <ul className="lm-iconb" style={{ ["--it" as string]: `${it}px`, ["--ix" as string]: `${ix}px` } as React.CSSProperties}>
        {props.items.map((x, i) => (
          <li key={i}>
            <span className="lm-iconb-ico"><Icon name={x.icon} size={44} /></span>
            <div><div className="lm-iconb-title"><Md inline>{x.title}</Md></div>{x.text && <div className="lm-iconb-text"><Md inline>{x.text}</Md></div>}</div>
          </li>
        ))}
      </ul>
    );
  },
});

/* ───── SectionNumber ───── */
export const SectionNumber = defineComponent({
  id: "SectionNumber",
  title: "Número de sección",
  purpose: "Separador de sección con un número grande, título y subtítulo; alternativa más expresiva a SectionHeader en el layout 'section'.",
  useCases: ["Inicio de la sección 2", "Separador numerado entre bloques de la clase"],
  constraints: ["number de 1 o 2 caracteres", "title ≤ 60 caracteres", "Usar solo en el slot main del layout 'section'"],
  fitsSlots: ["main"],
  schema: z.object({ number: z.string().min(1).max(2), title: z.string().min(1).max(110), subtitle: z.string().max(140).optional() }),
  examples: [{ name: "seccion", props: { number: "2", title: "Reglas de derivación", subtitle: "Potencia, producto, cociente y cadena" } }],
  Component: ({ props }) => (
    <div className="lm-secnum">
      <span className="lm-secnum-n" aria-hidden="true">{props.number}</span>
      <div className="lm-secnum-body">
        <h2>{props.title}</h2>
        {props.subtitle && <p className="lm-secnum-sub">{props.subtitle}</p>}
      </div>
    </div>
  ),
});

/* ───── AgendaItem ───── */
export const AgendaItem = defineComponent({
  id: "AgendaItem",
  title: "Agenda con progreso",
  purpose: "Índice u objetivos de la clase: lista numerada de puntos con estado (hecho, actual, pendiente) y barra de progreso.",
  useCases: ["Agenda al inicio de la clase", "Objetivos de aprendizaje", "Recordatorio de dónde vamos entre secciones"],
  constraints: ["2–7 puntos (4–5 ideal)", "title ≤ 60 caracteres", "detail ≤ 80 caracteres", "Al inicio todos 'todo'; marca 'current' solo al volver a mostrarla"],
  fitsSlots: ["main", "left", "right", "text", "side"],
  schema: z.object({
    items: z.array(z.object({ title: z.string().min(1).max(100), detail: z.string().max(120).optional(), state: z.enum(["done", "current", "todo"]).default("todo") })).min(2).max(7),
  }),
  examples: [{ name: "clase", props: { items: [{ title: "La derivada como pendiente", state: "done" }, { title: "Reglas de derivación", detail: "Potencia, producto y cadena", state: "current" }, { title: "Aplicaciones: optimización", state: "todo" }, { title: "Práctica guiada", state: "todo" }] } }],
  Component: ({ props, ctx }) => {
    const n = props.items.length;
    const anyDetail = props.items.some((i) => i.detail);
    const ag = (anyDetail ? (n <= 4 ? 40 : n <= 5 ? 36 : 32) : n <= 4 ? 44 : n === 5 ? 40 : n === 6 ? 36 : 33) - (ctx.width < 700 ? 6 : 0);
    const used = props.items.some((i) => i.state !== "todo");
    const done = props.items.filter((i) => i.state === "done").length + (props.items.some((i) => i.state === "current") ? 0.5 : 0);
    return (
      <div className="lm-agenda" style={{ ["--ag" as string]: `${ag}px` } as React.CSSProperties}>
        {used && <div className="lm-agenda-bar" role="progressbar" aria-valuenow={Math.round((done / n) * 100)} aria-valuemin={0} aria-valuemax={100}><i style={{ width: `${Math.round((done / n) * 100)}%` }} /></div>}
        <ol>
          {props.items.map((it, i) => (
            <li key={i} data-state={it.state}>
              <span className="lm-agenda-n">{it.state === "done" ? <Icon name="check" size={32} /> : i + 1}</span>
              <span><Md inline>{it.title}</Md>{it.detail && <span className="lm-agenda-detail">{it.detail}</span>}</span>
            </li>
          ))}
        </ol>
      </div>
    );
  },
});
