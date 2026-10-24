import { z } from "zod";
import { defineComponent } from "../define";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/* ───── LabeledDiagram ───── */
export const LabeledDiagram = defineComponent({
  id: "LabeledDiagram",
  title: "Diagrama rotulado",
  purpose: "Imagen con marcadores numerados sobre sus partes y una leyenda con el nombre de cada parte.",
  useCases: ["Partes de una célula o un órgano", "Esquema de un equipo de laboratorio", "Mapa con puntos de interés"],
  constraints: ["assetId = imagen ya guardada; alt obligatorio", "markers 2–8: n (1–9), x e y entre 0 y 1 (fracción de la imagen), label ≤ 40 caracteres"],
  fitsSlots: ["visual", "main", "left", "right"], areas: ["natsci", "general", "humanities"],
  schema: z.object({
    assetId: z.string().regex(UUID), alt: z.string().min(1).max(300),
    markers: z.array(z.object({ n: z.number().int().min(1).max(9), x: z.number().min(0).max(1), y: z.number().min(0).max(1), label: z.string().min(1).max(40) })).min(2).max(8),
    src: z.string().max(400).regex(/^(\/api\/assets\/[0-9a-f-]{36}(\?[A-Za-z0-9=&_-]+)?|assets\/[A-Za-z0-9._-]{1,80})$/i).optional(),
  }),
  examples: [{ name: "celula", props: { assetId: "00000000-0000-4000-8000-000000000000", alt: "Célula animal al microscopio", markers: [{ n: 1, x: 0.5, y: 0.45, label: "Núcleo" }, { n: 2, x: 0.2, y: 0.3, label: "Membrana" }] } }],
  Component: ({ props }) => (
    <div className="lm-labeled">
      <div className="lm-labeled-img">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={props.src ?? `/api/assets/${props.assetId}`} alt={props.alt} decoding="async" />
        {props.markers.map((m) => <span key={`${m.n}${m.label}`} className="lm-marker" style={{ left: `${m.x * 100}%`, top: `${m.y * 100}%` }} aria-hidden="true">{m.n}</span>)}
      </div>
      <ol className="lm-labeled-legend">{props.markers.map((m) => <li key={`${m.n}${m.label}`}><b>{m.n}</b> {m.label}</li>)}</ol>
    </div>
  ),
});

/* ───── ProcessCycle ───── */
export const ProcessCycle = defineComponent({
  id: "ProcessCycle",
  title: "Ciclo o proceso por etapas",
  purpose: "Etapas dispuestas en círculo (ciclo) o en secuencia, con flechas entre ellas.",
  useCases: ["Ciclo del agua o del carbono", "Etapas de la mitosis", "Método científico"],
  constraints: ["3–8 etapas (label ≤ 28, detail ≤ 70); cyclic=true cierra el ciclo"],
  fitsSlots: ["visual", "main", "left", "right"], areas: ["natsci", "general", "humanities"],
  schema: z.object({ stages: z.array(z.object({ label: z.string().min(1).max(28), detail: z.string().max(70).optional() })).min(3).max(8), cyclic: z.boolean().default(true), center: z.string().max(30).optional() }),
  examples: [{ name: "agua", props: { stages: [{ label: "Evaporación", detail: "El sol calienta el agua" }, { label: "Condensación", detail: "El vapor forma nubes" }, { label: "Precipitación", detail: "Cae lluvia o nieve" }, { label: "Escorrentía", detail: "El agua vuelve al mar" }], cyclic: true, center: "Ciclo del agua" } }],
  Component: ({ props, ctx }) => {
    const W = ctx.width, H = ctx.height, n = props.stages.length;
    if (!props.cyclic) {
      const w = (W - 40 - (n - 1) * 36) / n;
      return (
        <div className="lm-seq" style={{ ["--n" as string]: n }}>{props.stages.map((s, i) => <div key={i} className="lm-seq-step" style={{ width: w }}><span className="lm-step-n">{i + 1}</span><strong>{s.label}</strong>{s.detail && <p>{s.detail}</p>}{i < n - 1 && <i aria-hidden="true">→</i>}</div>)}</div>
      );
    }
    const R = Math.min(W, H) / 2 - 130, cx = W / 2, cy = H / 2;
    const pts = props.stages.map((_, i) => { const a = (2 * Math.PI * i) / n - Math.PI / 2; return { x: cx + R * Math.cos(a), y: cy + R * Math.sin(a), a }; });
    return (
      <svg className="lm-cycle" width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Ciclo: ${props.stages.map((s) => s.label).join(" → ")}`}>
        <defs><marker id="ah-cy" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="9" markerHeight="9" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="var(--lm-accent)" /></marker></defs>
        {pts.map((p, i) => { const q = pts[(i + 1) % n]!, a1 = p.a + 0.26, a2 = q.a - 0.26 + (i === n - 1 ? 2 * Math.PI : 0); return <path key={`a${i}`} className="lm-cycle-arc" d={`M${cx + R * Math.cos(a1)},${cy + R * Math.sin(a1)} A${R},${R} 0 0 1 ${cx + R * Math.cos(a2)},${cy + R * Math.sin(a2)}`} markerEnd="url(#ah-cy)" />; })}
        {props.center && <text className="lm-cmap-centertext" x={cx} y={cy + 10} textAnchor="middle">{props.center}</text>}
        {pts.map((p, i) => <g key={i}><circle className="lm-cycle-dot" cx={p.x} cy={p.y} r={46} /><text className="lm-cycle-n" x={p.x} y={p.y + 12} textAnchor="middle">{i + 1}</text><text className="lm-cycle-label" x={p.x} y={p.y + (Math.sin(p.a) >= 0 ? 88 : -66)} textAnchor="middle">{props.stages[i]!.label}</text>{props.stages[i]!.detail && <text className="lm-cycle-detail" x={p.x} y={p.y + (Math.sin(p.a) >= 0 ? 124 : -30)} textAnchor="middle">{props.stages[i]!.detail}</text>}</g>)}
      </svg>
    );
  },
});
