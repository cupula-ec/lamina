import { z } from "zod";
import { Latex, Md } from "@lamina/engine";
import { defineComponent } from "../define";
import { PLOT_COLORS, PLOT_DASH, autoYRange, derivAt, fmt, sampleFn, sampleSeries, ticks, toPaths } from "../plot";

/* ───── FunctionPlot ───── */
export const FunctionPlot = defineComponent({
  id: "FunctionPlot",
  title: "Gráfica de funciones",
  purpose: "Gráfica 2D de una o varias funciones de x con ejes, rejilla, puntos, asíntotas, sombreado de área, tangentes y secantes.",
  useCases: ["Visualizar f(x)", "Recta tangente/secante en un punto", "Área bajo la curva (integral)", "Comparar f y f'", "Asíntotas y discontinuidades"],
  constraints: [
    "expr en sintaxis mathjs con variable x (ej. 'x^3 - 3x', 'sin(x)/x', 'exp(-x^2)', 'ln(x)'); sin otras variables",
    "Máx. 4 funciones; xDomain obligatorio; yDomain opcional (autoajuste)",
    "Etiqueta (label) corta para cada función si hay más de una",
  ],
  fitsSlots: ["visual", "main", "right", "left"],
  schema: z.object({
    functions: z.array(z.object({ expr: z.string().min(1).max(200), label: z.string().max(60).optional() })).min(1).max(4),
    xDomain: z.tuple([z.number(), z.number()]),
    yDomain: z.tuple([z.number(), z.number()]).optional(),
    points: z.array(z.object({ x: z.number(), y: z.number().optional(), fnIndex: z.number().int().min(0).max(3).default(0), label: z.string().max(40).optional() })).max(8).default([]),
    asymptotes: z.object({ vertical: z.array(z.number()).max(4).default([]), horizontal: z.array(z.number()).max(4).default([]) }).default({ vertical: [], horizontal: [] }),
    shade: z.object({ fnIndex: z.number().int().min(0).max(3).default(0), from: z.number(), to: z.number() }).optional(),
    tangents: z.array(z.object({ fnIndex: z.number().int().min(0).max(3).default(0), at: z.number(), label: z.string().max(40).optional() })).max(3).default([]),
    secants: z.array(z.object({ fnIndex: z.number().int().min(0).max(3).default(0), a: z.number(), b: z.number() })).max(2).default([]),
    caption: z.string().max(200).optional(),
  }).refine((p) => p.xDomain[0] < p.xDomain[1], { message: "xDomain debe ser [min, max] con min < max" }),
  examples: [
    { name: "tangente", props: { functions: [{ expr: "x^2", label: "f(x)=x²" }], xDomain: [-1, 4], points: [{ x: 3, y: 9, label: "(3, 9)" }], tangents: [{ fnIndex: 0, at: 3, label: "y=6x−9" }], asymptotes: { vertical: [], horizontal: [] }, secants: [] } },
    { name: "area", props: { functions: [{ expr: "sin(x)", label: "sen x" }], xDomain: [0, 6.28], shade: { fnIndex: 0, from: 0, to: 3.14 }, points: [], tangents: [], secants: [], asymptotes: { vertical: [], horizontal: [] } } },
  ],
  Component: ({ props, ctx }) => {
    const W = ctx.width, H = ctx.height - (props.caption ? 56 : 0);
    const m = { l: 96, r: 40, t: 28, b: 64 };
    const [x0, x1] = props.xDomain;
    const compiled = props.functions.map((f) => sampleFn(f.expr, x0, x1));
    const series = compiled.map((c) => (c.ok ? sampleSeries(c.f, x0, x1) : []));
    const [y0, y1] = props.yDomain ?? autoYRange(series);
    const sx = (x: number) => m.l + ((x - x0) / (x1 - x0)) * (W - m.l - m.r);
    const sy = (y: number) => H - m.b - ((y - y0) / (y1 - y0)) * (H - m.t - m.b);
    const xt = ticks(x0, x1, 8), yt = ticks(y0, y1, 6);
    const axisX = Math.min(Math.max(0, x0), x1), axisY = Math.min(Math.max(0, y0), y1);
    const clip = `clip-${ctx.slot}`;
    const shade = props.shade && compiled[props.shade.fnIndex]?.ok ? (() => {
      const f = compiled[props.shade.fnIndex]!.f;
      const pts = sampleSeries(f, props.shade.from, props.shade.to, 160).filter((p) => Number.isFinite(p[1]));
      if (pts.length < 2) return null;
      const base = Math.min(Math.max(0, y0), y1);
      return `M${sx(pts[0]![0])},${sy(base)} ` + pts.map((p) => `L${sx(p[0]).toFixed(1)},${sy(p[1]).toFixed(1)}`).join(" ") + ` L${sx(pts[pts.length - 1]![0])},${sy(base)} Z`;
    })() : null;
    const tangentGeo = props.tangents.flatMap((t) => {
      const c = compiled[t.fnIndex]; if (!c?.ok) return [];
      const y = c.f(t.at); const k = derivAt(c.f, t.at); if (!Number.isFinite(y) || !Number.isFinite(k)) return [];
      const line = (x: number) => y + k * (x - t.at); const half = (x1 - x0) * 0.28;
      // recorta el segmento al área visible en Y
      let a = Math.max(x0, t.at - half), b = Math.min(x1, t.at + half);
      if (k !== 0) { const xa = (y0 - y) / k + t.at, xb = (y1 - y) / k + t.at; const lo = Math.min(xa, xb), hi = Math.max(xa, xb); a = Math.max(a, lo); b = Math.min(b, hi); }
      return b > a ? [{ a, b, line, label: t.label, k }] : [];
    });
    const bad = compiled.findIndex((c) => !c.ok);
    return (
      <figure className="lm-plot">
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={props.caption ?? props.functions.map((f) => f.label ?? f.expr).join(", ")}>
          <defs><clipPath id={clip}><rect x={m.l} y={m.t} width={W - m.l - m.r} height={H - m.t - m.b} /></clipPath></defs>
          <g className="lm-grid">
            {xt.map((t) => <line key={`gx${t}`} x1={sx(t)} x2={sx(t)} y1={m.t} y2={H - m.b} />)}
            {yt.map((t) => <line key={`gy${t}`} x1={m.l} x2={W - m.r} y1={sy(t)} y2={sy(t)} />)}
          </g>
          <g className="lm-axes">
            <line x1={m.l} x2={W - m.r} y1={sy(axisY)} y2={sy(axisY)} />
            <line x1={sx(axisX)} x2={sx(axisX)} y1={m.t} y2={H - m.b} />
          </g>
          <g className="lm-ticks">
            {xt.map((t) => <text key={`tx${t}`} x={sx(t)} y={H - m.b + 36} textAnchor="middle">{fmt(t)}</text>)}
            {yt.map((t) => <text key={`ty${t}`} x={m.l - 12} y={sy(t) + 9} textAnchor="end">{fmt(t)}</text>)}
          </g>
          <g clipPath={`url(#${clip})`}>
            {shade && <path d={shade} className="lm-shade" />}
            {props.asymptotes.vertical.map((a, i) => <line key={`av${i}`} className="lm-asymptote" x1={sx(a)} x2={sx(a)} y1={m.t} y2={H - m.b} />)}
            {props.asymptotes.horizontal.map((a, i) => <line key={`ah${i}`} className="lm-asymptote" x1={m.l} x2={W - m.r} y1={sy(a)} y2={sy(a)} />)}
            {series.map((s, i) => toPaths(s, sx, sy, y0, y1).map((d, k) => <path key={`f${i}-${k}`} d={d} className="lm-curve" stroke={PLOT_COLORS[i]} strokeDasharray={PLOT_DASH[i]} />))}
            {props.secants.map((sc, i) => {
              const c = compiled[sc.fnIndex]; if (!c?.ok) return null;
              const ya = c.f(sc.a), yb = c.f(sc.b); if (!Number.isFinite(ya) || !Number.isFinite(yb) || sc.a === sc.b) return null;
              const k = (yb - ya) / (sc.b - sc.a); const line = (x: number) => ya + k * (x - sc.a);
              return <line key={`sc${i}`} className="lm-secant" x1={sx(x0)} y1={sy(line(x0))} x2={sx(x1)} y2={sy(line(x1))} />;
            })}
            {tangentGeo.map((t, i) => <line key={`tg${i}`} className="lm-tangent" x1={sx(t.a)} y1={sy(t.line(t.a))} x2={sx(t.b)} y2={sy(t.line(t.b))} />)}
          </g>
          {tangentGeo.map((t, i) => t.label ? (() => { const lx = Math.min(sx(t.b) - 8, W - m.r - 8), ly = Math.max(sy(t.line(t.b)) - 18, m.t + 30); return <text key={`tl${i}`} className="lm-plot-label" x={lx} y={ly} textAnchor="end">{t.label}</text>; })() : null)}
          {props.points.map((p, i) => {
            const c = compiled[p.fnIndex]; const y = p.y ?? (c?.ok ? c.f(p.x) : NaN); if (!Number.isFinite(y)) return null;
            return (<g key={`p${i}`}><circle className="lm-point" cx={sx(p.x)} cy={sy(y)} r={9} />{p.label && <text className="lm-plot-label" x={sx(p.x) + 16} y={sy(y) - 14}>{p.label}</text>}</g>);
          })}
          {props.functions.length > 1 || props.functions[0]?.label ? (
            <g className="lm-legend" transform={`translate(${m.l + 20},${m.t + 14})`}>
              <rect x={-14} y={-26} width={Math.max(...props.functions.map((f) => (f.label ?? f.expr).length)) * 17 + 100} height={props.functions.length * 40 + 8} rx={8} fill="var(--lm-bg)" opacity={0.92} />
              {props.functions.map((f, i) => (
                <g key={i} transform={`translate(0,${i * 40})`}>
                  <line x1={0} x2={48} y1={0} y2={0} stroke={PLOT_COLORS[i]} strokeWidth={6} strokeDasharray={PLOT_DASH[i]} />
                  <text x={62} y={9}>{f.label ?? f.expr}</text>
                </g>
              ))}
            </g>
          ) : null}
          {bad >= 0 && <text x={W / 2} y={H / 2} textAnchor="middle" className="lm-plot-label" data-lamina-error="props">{`No se pudo evaluar la función ${bad + 1}`}</text>}
        </svg>
        {props.caption && <figcaption>{props.caption}</figcaption>}
      </figure>
    );
  },
});

/* ───── Table ───── */
export const Table = defineComponent({
  id: "Table",
  title: "Tabla",
  purpose: "Tabla de datos o valores (p. ej. tabla de valores de una función, comparación de reglas). Celdas admiten Markdown inline y $LaTeX$.",
  useCases: ["Tabla de valores x, f(x)", "Resumen de reglas de derivación", "Magnitudes y unidades"],
  constraints: ["Máx. 6 columnas y 10 filas", "Celdas ≤ 60 caracteres"],
  fitsSlots: ["visual", "main", "right", "left"],
  schema: z.object({
    headers: z.array(z.string().max(80)).min(1).max(6),
    rows: z.array(z.array(z.string().max(120)).max(6)).min(1).max(12),
    caption: z.string().max(200).optional(),
    highlightRow: z.number().int().min(0).optional(),
  }).refine((t) => t.rows.every((r) => r.length === t.headers.length), { message: "cada fila debe tener tantas celdas como encabezados" }),
  examples: [{ name: "valores", props: { headers: ["$x$", "$f(x)=x^2$", "$f'(x)=2x$"], rows: [["1", "1", "2"], ["2", "4", "4"], ["3", "9", "6"]], caption: "Valores de f y f′" } }],
  Component: ({ props }) => {
    const n = props.rows.length;
    const size = n <= 5 ? "lg" : n <= 8 ? "md" : "sm";
    return (
      <figure className={`lm-table-wrap lm-table-${size}`}>
        <table className="lm-table">
          <thead><tr>{props.headers.map((h, i) => <th key={i}><Md inline>{h}</Md></th>)}</tr></thead>
          <tbody>{props.rows.map((r, i) => <tr key={i} className={props.highlightRow === i ? "lm-hl" : ""}>{r.map((c, j) => <td key={j}><Md inline>{c}</Md></td>)}</tr>)}</tbody>
        </table>
        {props.caption && <figcaption>{props.caption}</figcaption>}
      </figure>
    );
  },
});

/* ───── VectorDiagram ───── */
export const VectorDiagram = defineComponent({
  id: "VectorDiagram",
  title: "Diagrama de vectores 2D",
  purpose: "Vectores 2D con origen, etiqueta, componentes opcionales y resultante (física: fuerzas, velocidades; álgebra lineal).",
  useCases: ["Suma de vectores", "Descomposición en componentes", "Fuerzas sobre un cuerpo"],
  constraints: ["Máx. 5 vectores; coordenadas en las mismas unidades", "label corto, admite LaTeX simple sin $ (ej. \\vec{F}_1)"],
  fitsSlots: ["visual", "main", "right", "left"],
  schema: z.object({
    vectors: z.array(z.object({ x: z.number(), y: z.number(), label: z.string().max(30).optional(), origin: z.tuple([z.number(), z.number()]).default([0, 0]), color: z.number().int().min(0).max(3).default(0) })).min(1).max(5),
    showComponents: z.boolean().default(false),
    showResultant: z.boolean().default(false),
    resultantLabel: z.string().max(30).optional(),
    caption: z.string().max(200).optional(),
  }),
  examples: [{ name: "suma", props: { vectors: [{ x: 4, y: 1, label: "\\vec{a}", origin: [0, 0], color: 0 }, { x: 1, y: 3, label: "\\vec{b}", origin: [4, 1], color: 1 }], showComponents: false, showResultant: true, resultantLabel: "\\vec{a}+\\vec{b}" } }],
  Component: ({ props, ctx }) => {
    const W = ctx.width, H = ctx.height - (props.caption ? 56 : 0), pad = 90;
    const vs = props.vectors.map((v) => ({ ...v, ex: v.origin[0] + v.x, ey: v.origin[1] + v.y }));
    const sum = props.showResultant ? { x: props.vectors.reduce((a, v) => a + v.x, 0), y: props.vectors.reduce((a, v) => a + v.y, 0) } : null;
    const xs = [0, ...vs.flatMap((v) => [v.origin[0], v.ex]), ...(sum ? [sum.x] : [])];
    const ys = [0, ...vs.flatMap((v) => [v.origin[1], v.ey]), ...(sum ? [sum.y] : [])];
    const xmin = Math.min(...xs), xmax = Math.max(...xs), ymin = Math.min(...ys), ymax = Math.max(...ys);
    const rx = Math.max(xmax - xmin, 1), ry = Math.max(ymax - ymin, 1);
    const k = Math.min((W - 2 * pad) / rx, (H - 2 * pad) / ry);
    const ox = (W - rx * k) / 2 - xmin * k, oy = (H + ry * k) / 2 + ymin * k;
    const X = (x: number) => ox + x * k, Y = (y: number) => oy - y * k;
    const arrow = (x1: number, y1: number, x2: number, y2: number, cls: string, key: string, label?: string, dash?: string) => {
      const a = Math.atan2(y2 - y1, x2 - x1), s = 20;
      const p = `${x2},${y2} ${x2 - s * Math.cos(a - 0.4)},${y2 - s * Math.sin(a - 0.4)} ${x2 - s * Math.cos(a + 0.4)},${y2 - s * Math.sin(a + 0.4)}`;
      return (<g key={key} className={cls}><line x1={x1} y1={y1} x2={x2 - 12 * Math.cos(a)} y2={y2 - 12 * Math.sin(a)} strokeDasharray={dash} /><polygon points={p} />
        {label && <foreignObject x={(x1 + x2) / 2 - 90} y={(y1 + y2) / 2 - 56} width={180} height={50}><div className="lm-vec-label" data-lm-allow-small><Latex tex={label} display={false} /></div></foreignObject>}</g>);
    };
    return (
      <figure className="lm-plot lm-vectors">
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={props.caption ?? "Diagrama de vectores"}>
          <g className="lm-axes"><line x1={pad / 2} x2={W - pad / 2} y1={Y(0)} y2={Y(0)} /><line x1={X(0)} x2={X(0)} y1={pad / 2} y2={H - pad / 2} /></g>
          {vs.map((v, i) => (
            <g key={i}>
              {props.showComponents && <>
                <line className="lm-proj" x1={X(v.origin[0])} y1={Y(v.origin[1])} x2={X(v.ex)} y2={Y(v.origin[1])} />
                <line className="lm-proj" x1={X(v.ex)} y1={Y(v.origin[1])} x2={X(v.ex)} y2={Y(v.ey)} />
              </>}
              {arrow(X(v.origin[0]), Y(v.origin[1]), X(v.ex), Y(v.ey), `lm-vec lm-vec-c${v.color}`, `v${i}`, v.label)}
            </g>
          ))}
          {sum && arrow(X(0), Y(0), X(sum.x), Y(sum.y), "lm-vec lm-vec-result", "res", props.resultantLabel ?? "\\vec{R}", "10 6")}
        </svg>
        {props.caption && <figcaption>{props.caption}</figcaption>}
      </figure>
    );
  },
});

/* ───── GeometryFigure ───── */
export const GeometryFigure = defineComponent({
  id: "GeometryFigure",
  title: "Figura geométrica",
  purpose: "Figura con puntos, segmentos, círculos, polígonos y ángulos marcados, con etiquetas (geometría, trigonometría, aplicaciones).",
  useCases: ["Triángulo con ángulos y lados", "Círculo con radio y cuerda", "Figura de un problema de optimización"],
  constraints: ["Puntos con id único (A, B, C…) y coordenadas en las mismas unidades", "Máx. 8 puntos, 8 segmentos, 3 círculos, 3 ángulos"],
  fitsSlots: ["visual", "main", "right", "left"],
  schema: z.object({
    points: z.array(z.object({ id: z.string().min(1).max(8), x: z.number(), y: z.number(), label: z.string().max(20).optional() })).min(1).max(8),
    segments: z.array(z.object({ from: z.string(), to: z.string(), label: z.string().max(30).optional(), dashed: z.boolean().default(false) })).max(8).default([]),
    circles: z.array(z.object({ center: z.string(), radius: z.number().positive(), label: z.string().max(30).optional() })).max(3).default([]),
    angles: z.array(z.object({ vertex: z.string(), from: z.string(), to: z.string(), label: z.string().max(20).optional() })).max(3).default([]),
    polygon: z.array(z.string()).max(8).optional(),
    caption: z.string().max(200).optional(),
  }).refine((g) => {
    const ids = new Set(g.points.map((p) => p.id));
    return ids.size === g.points.length && g.segments.every((s) => ids.has(s.from) && ids.has(s.to)) && g.circles.every((c) => ids.has(c.center)) && g.angles.every((a) => ids.has(a.vertex) && ids.has(a.from) && ids.has(a.to)) && (g.polygon ?? []).every((p) => ids.has(p));
  }, { message: "ids de puntos repetidos o referencias a puntos inexistentes" }),
  examples: [{ name: "triangulo", props: { points: [{ id: "A", x: 0, y: 0, label: "A" }, { id: "B", x: 6, y: 0, label: "B" }, { id: "C", x: 6, y: 4, label: "C" }], segments: [{ from: "A", to: "B", label: "6", dashed: false }, { from: "B", to: "C", label: "4", dashed: false }, { from: "A", to: "C", label: "c", dashed: false }], circles: [], angles: [{ vertex: "A", from: "B", to: "C", label: "θ" }], polygon: ["A", "B", "C"] } }],
  Component: ({ props, ctx }) => {
    const W = ctx.width, H = ctx.height - (props.caption ? 56 : 0), pad = 110;
    const P = Object.fromEntries(props.points.map((p) => [p.id, p]));
    const cs = props.circles.map((c) => ({ ...c, cx: P[c.center]!.x, cy: P[c.center]!.y }));
    const xs = [...props.points.map((p) => p.x), ...cs.flatMap((c) => [c.cx - c.radius, c.cx + c.radius])];
    const ys = [...props.points.map((p) => p.y), ...cs.flatMap((c) => [c.cy - c.radius, c.cy + c.radius])];
    const xmin = Math.min(...xs), xmax = Math.max(...xs), ymin = Math.min(...ys), ymax = Math.max(...ys);
    const rx = Math.max(xmax - xmin, 1e-6), ry = Math.max(ymax - ymin, 1e-6);
    const k = Math.min((W - 2 * pad) / rx, (H - 2 * pad) / ry);
    const ox = (W - rx * k) / 2 - xmin * k, oy = (H + ry * k) / 2 + ymin * k;
    const X = (x: number) => ox + x * k, Y = (y: number) => oy - y * k;
    const cx = (xmin + xmax) / 2, cy = (ymin + ymax) / 2;
    return (
      <figure className="lm-plot lm-geometry">
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={props.caption ?? "Figura geométrica"}>
          {props.polygon && props.polygon.length > 2 && <polygon className="lm-poly" points={props.polygon.map((id) => `${X(P[id]!.x)},${Y(P[id]!.y)}`).join(" ")} />}
          {cs.map((c, i) => <g key={`c${i}`}><circle className="lm-circle" cx={X(c.cx)} cy={Y(c.cy)} r={c.radius * k} />{c.label && <text className="lm-plot-label" x={X(c.cx) + 12} y={Y(c.cy) - 12}>{c.label}</text>}</g>)}
          {props.segments.map((s, i) => {
            const a = P[s.from]!, b = P[s.to]!;
            const mx = (X(a.x) + X(b.x)) / 2, my = (Y(a.y) + Y(b.y)) / 2;
            const dx = X(b.x) - X(a.x), dy = Y(b.y) - Y(a.y), len = Math.hypot(dx, dy) || 1;
            // desplazar la etiqueta hacia fuera del centro de la figura
            let nx = -dy / len, ny = dx / len; if ((mx - X(cx)) * nx + (my - Y(cy)) * ny < 0) { nx = -nx; ny = -ny; }
            return (<g key={`s${i}`}><line className="lm-seg" x1={X(a.x)} y1={Y(a.y)} x2={X(b.x)} y2={Y(b.y)} strokeDasharray={s.dashed ? "12 8" : undefined} />
              {s.label && <text className="lm-plot-label" x={mx + nx * 34} y={my + ny * 34 + 9} textAnchor="middle">{s.label}</text>}</g>);
          })}
          {props.angles.map((a, i) => {
            const v = P[a.vertex]!, p1 = P[a.from]!, p2 = P[a.to]!;
            const a1 = Math.atan2(-(p1.y - v.y), p1.x - v.x), a2 = Math.atan2(-(p2.y - v.y), p2.x - v.x);
            const r = 58; let d = a2 - a1; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
            const x1 = X(v.x) + r * Math.cos(a1), y1 = Y(v.y) + r * Math.sin(a1), x2 = X(v.x) + r * Math.cos(a2), y2 = Y(v.y) + r * Math.sin(a2);
            const am = a1 + d / 2;
            return (<g key={`a${i}`}><path className="lm-angle" d={`M${x1},${y1} A${r},${r} 0 0 ${d > 0 ? 1 : 0} ${x2},${y2}`} />
              {a.label && <text className="lm-plot-label" x={X(v.x) + (r + 28) * Math.cos(am)} y={Y(v.y) + (r + 28) * Math.sin(am) + 9} textAnchor="middle">{a.label}</text>}</g>);
          })}
          {props.points.map((p) => (
            <g key={p.id}><circle className="lm-point" cx={X(p.x)} cy={Y(p.y)} r={9} />
              <text className="lm-plot-label lm-pt-name" x={X(p.x) + (p.x >= cx ? 18 : -18)} y={Y(p.y) + (p.y >= cy ? -16 : 34)} textAnchor={p.x >= cx ? "start" : "end"}>{p.label ?? p.id}</text></g>
          ))}
        </svg>
        {props.caption && <figcaption>{props.caption}</figcaption>}
      </figure>
    );
  },
});
