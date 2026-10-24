import { z } from "zod";
import { compileFn2, compileFnOf } from "@lamina/validation/math";
import { defineComponent } from "../define";
import { PLOT_COLORS, fmt, ticks } from "../plot";
import { boundsOf, equalScale, implicitContours, pathOf, sampleParam, toImplicit, type Bounds, type Pt } from "../curves";

const M = { l: 96, r: 48, t: 36, b: 72 };

/** Ejes con rejilla para un encuadre (proporción 1:1 opcional). */
function Frame({ b, W, H, equal = true, children, label }: { b: Bounds; W: number; H: number; equal?: boolean; children: (g: { sx: (x: number) => number; sy: (y: number) => number }) => React.ReactNode; label: string }) {
  const sc = equal ? equalScale(b, W, H, M) : (() => {
    const aw = W - M.l - M.r, ah = H - M.t - M.b;
    return { sx: (x: number) => M.l + ((x - b.xMin) / (b.xMax - b.xMin)) * aw, sy: (y: number) => M.t + ((b.yMax - y) / (b.yMax - b.yMin)) * ah, ox: M.l, oy: M.t, aw, ah };
  })();
  const xt = ticks(b.xMin, b.xMax, 8), yt = ticks(b.yMin, b.yMax, 6);
  const x0 = sc.sx(Math.min(Math.max(0, b.xMin), b.xMax)), y0 = sc.sy(Math.min(Math.max(0, b.yMin), b.yMax));
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>
      <g className="lm-grid">
        {xt.map((t) => <line key={`gx${t}`} x1={sc.sx(t)} x2={sc.sx(t)} y1={sc.oy} y2={sc.oy + sc.ah} />)}
        {yt.map((t) => <line key={`gy${t}`} x1={sc.ox} x2={sc.ox + sc.aw} y1={sc.sy(t)} y2={sc.sy(t)} />)}
      </g>
      <g className="lm-axes"><line x1={sc.ox} x2={sc.ox + sc.aw} y1={y0} y2={y0} /><line x1={x0} x2={x0} y1={sc.oy} y2={sc.oy + sc.ah} /></g>
      <g className="lm-ticks">
        {xt.map((t) => <text key={`tx${t}`} x={sc.sx(t)} y={sc.oy + sc.ah + 38} textAnchor="middle">{fmt(t)}</text>)}
        {yt.map((t) => <text key={`ty${t}`} x={sc.ox - 12} y={sc.sy(t) + 9} textAnchor="end">{fmt(t)}</text>)}
      </g>
      {children({ sx: sc.sx, sy: sc.sy })}
    </svg>
  );
}

const Caption = ({ text }: { text?: string }) => (text ? <figcaption>{text}</figcaption> : null);
const Tag = ({ x, y, text, anchor = "start" }: { x: number; y: number; text: string; anchor?: "start" | "middle" | "end" }) => <text className="lm-plot-label" x={x} y={y} textAnchor={anchor}>{text}</text>;

/* ───── ConicFigure ───── */
export const ConicFigure = defineComponent({
  id: "ConicFigure",
  title: "Cónica con elementos notables",
  purpose: "Elipse, parábola o hipérbola con sus focos, vértices, ejes, directriz o asíntotas, dibujada a escala 1:1 a partir de sus parámetros.",
  useCases: ["Definir una elipse con focos y vértices", "Parábola con foco y directriz", "Hipérbola con asíntotas", "Comparar cónicas"],
  constraints: [
    "kind: ellipse | parabola | hyperbola; center = {h, k} (vértice en la parábola)",
    "ellipse/hyperbola: a y b > 0 (a es el semieje a lo largo de x en 'horizontal' y a lo largo de y en 'vertical')",
    "parabola: p ≠ 0 es la distancia vértice–foco; direction up | down | left | right",
    "showFoci/showVertices/showAxes/showDirectrix activan los elementos notables",
  ],
  fitsSlots: ["visual", "main", "right", "left"],
  areas: ["math"],
  schema: z.object({
    kind: z.enum(["ellipse", "parabola", "hyperbola"]),
    center: z.object({ h: z.number(), k: z.number() }).default({ h: 0, k: 0 }),
    a: z.number().positive().max(1000).default(3),
    b: z.number().positive().max(1000).default(2),
    p: z.number().refine((v) => v !== 0, "p ≠ 0").default(1),
    orientation: z.enum(["horizontal", "vertical"]).default("horizontal"),
    direction: z.enum(["up", "down", "left", "right"]).default("up"),
    showFoci: z.boolean().default(true),
    showVertices: z.boolean().default(true),
    showAxes: z.boolean().default(true),
    showDirectrix: z.boolean().default(true),
    caption: z.string().max(200).optional(),
  }),
  examples: [
    { name: "elipse", props: { kind: "ellipse", center: { h: 0, k: 0 }, a: 5, b: 3, p: 1, orientation: "horizontal", direction: "up", showFoci: true, showVertices: true, showAxes: true, showDirectrix: true, caption: "x²/25 + y²/9 = 1" } },
    { name: "parabola", props: { kind: "parabola", center: { h: 0, k: 0 }, a: 3, b: 2, p: 1, orientation: "horizontal", direction: "up", showFoci: true, showVertices: true, showAxes: true, showDirectrix: true, caption: "x² = 4y" } },
  ],
  Component: ({ props, ctx }) => {
    const W = ctx.width, H = ctx.height - (props.caption ? 56 : 0);
    const { h, k } = props.center;
    const a = props.a, b = props.b, p = props.p;
    let curves: Pt[][] = [];
    let foci: Pt[] = [], vertices: Pt[] = [];
    const lines: { p1: Pt; p2: Pt; cls: string; label?: string }[] = [];
    let bounds: Bounds;
    if (props.kind === "ellipse") {
      const pts: Pt[] = Array.from({ length: 121 }, (_, i) => { const t = (2 * Math.PI * i) / 120; return [h + a * Math.cos(t), k + b * Math.sin(t)] as Pt; });
      curves = [pts];
      const c = Math.sqrt(Math.abs(a * a - b * b));
      foci = a >= b ? [[h - c, k], [h + c, k]] : [[h, k - c], [h, k + c]];
      vertices = [[h - a, k], [h + a, k], [h, k - b], [h, k + b]];
      if (props.showAxes) { lines.push({ p1: [h - a * 1.15, k], p2: [h + a * 1.15, k], cls: "lm-secant" }, { p1: [h, k - b * 1.25], p2: [h, k + b * 1.25], cls: "lm-secant" }); }
      bounds = { xMin: h - a * 1.35, xMax: h + a * 1.35, yMin: k - b * 1.45, yMax: k + b * 1.45 };
    } else if (props.kind === "hyperbola") {
      const horiz = props.orientation === "horizontal";
      const c = Math.sqrt(a * a + b * b), ext = (horiz ? b : a) * 2.6;
      const mk = (sign: 1 | -1): Pt[] => Array.from({ length: 97 }, (_, i) => { const t = (-ext + (2 * ext * i) / 96); const w = sign * (horiz ? a : a) * Math.sqrt(1 + (t * t) / ((horiz ? b : b) ** 2)); return (horiz ? [h + w, k + t] : [h + t, k + w]) as Pt; });
      curves = [mk(1), mk(-1)];
      foci = horiz ? [[h - c, k], [h + c, k]] : [[h, k - c], [h, k + c]];
      vertices = horiz ? [[h - a, k], [h + a, k]] : [[h, k - a], [h, k + a]];
      const L = Math.max(a, b) * 3.2;
      if (props.showAxes) {
        const sl = horiz ? b / a : a / b;
        lines.push({ p1: [h - L, k - sl * L], p2: [h + L, k + sl * L], cls: "lm-asymptote" }, { p1: [h - L, k + sl * L], p2: [h + L, k - sl * L], cls: "lm-asymptote" });
      }
      const half = (horiz ? a : b) + L * 0.55, halfY = (horiz ? b : a) + L * 0.55;
      bounds = { xMin: h - Math.max(half, c * 1.3), xMax: h + Math.max(half, c * 1.3), yMin: k - Math.max(halfY, c * 1.3), yMax: k + Math.max(halfY, c * 1.3) };
    } else {
      const ap = Math.abs(p), reach = ap * 4.5, along = (u: number): Pt => {
        const w = (u * u) / (4 * ap);
        return props.direction === "up" ? [h + u, k + w] : props.direction === "down" ? [h + u, k - w] : props.direction === "right" ? [h + w, k + u] : [h - w, k + u];
      };
      curves = [Array.from({ length: 97 }, (_, i) => along(-reach + (2 * reach * i) / 96))];
      const f: Pt = props.direction === "up" ? [h, k + ap] : props.direction === "down" ? [h, k - ap] : props.direction === "right" ? [h + ap, k] : [h - ap, k];
      foci = [f]; vertices = [[h, k]];
      if (props.showDirectrix) {
        const d = reach * 1.15;
        lines.push(props.direction === "up" ? { p1: [h - d, k - ap], p2: [h + d, k - ap], cls: "lm-asymptote", label: "directriz" } : props.direction === "down" ? { p1: [h - d, k + ap], p2: [h + d, k + ap], cls: "lm-asymptote", label: "directriz" } : props.direction === "right" ? { p1: [h - ap, k - d], p2: [h - ap, k + d], cls: "lm-asymptote", label: "directriz" } : { p1: [h + ap, k - d], p2: [h + ap, k + d], cls: "lm-asymptote", label: "directriz" });
      }
      if (props.showAxes) { const d = reach * 1.15; lines.push(props.direction === "up" || props.direction === "down" ? { p1: [h, k - d], p2: [h, k + d], cls: "lm-secant" } : { p1: [h - d, k], p2: [h + d, k], cls: "lm-secant" }); }
      const all = curves[0]!;
      bounds = { xMin: Math.min(h - ap * 2, ...all.map((q) => q[0])) - ap, xMax: Math.max(h + ap * 2, ...all.map((q) => q[0])) + ap, yMin: Math.min(k - ap * 2, ...all.map((q) => q[1])) - ap, yMax: Math.max(k + ap * 2, ...all.map((q) => q[1])) + ap };
    }
    return (
      <figure className="lm-plot">
        <Frame b={bounds} W={W} H={H} label={props.caption ?? `Cónica: ${props.kind}`}>
          {({ sx, sy }) => (
            <>
              <svg x={0} y={0} width={W} height={H} overflow="hidden">
                {lines.map((l, i) => <line key={`l${i}`} className={l.cls} x1={sx(l.p1[0])} y1={sy(l.p1[1])} x2={sx(l.p2[0])} y2={sy(l.p2[1])} />)}
                {curves.map((c, i) => <path key={`c${i}`} className="lm-curve" pathLength={1} stroke={PLOT_COLORS[0]} d={pathOf(c, sx, sy).join(" ")} />)}
              </svg>
              {props.showFoci && foci.map((f, i) => <g key={`f${i}`}><circle className="lm-point" cx={sx(f[0])} cy={sy(f[1])} r={9} /><Tag x={sx(f[0]) + 14} y={sy(f[1]) - 14} text={foci.length > 1 ? `F${i + 1}` : "F"} /></g>)}
              {props.showVertices && vertices.map((v, i) => <circle key={`v${i}`} cx={sx(v[0])} cy={sy(v[1])} r={7} fill="var(--lm-accent2)" />)}
              {lines.filter((l) => l.label).map((l, i) => <Tag key={`t${i}`} x={sx(l.p2[0])} y={sy(l.p2[1]) - 14} text={l.label!} anchor="end" />)}
            </>
          )}
        </Frame>
        <Caption text={props.caption} />
      </figure>
    );
  },
});

/* ───── ImplicitPlot ───── */
export const ImplicitPlot = defineComponent({
  id: "ImplicitPlot",
  title: "Curva implícita f(x, y) = 0",
  purpose: "Dibuja cualquier curva dada por una ecuación en x e y (circunferencias, cónicas rotadas, lemniscatas) por contornos.",
  useCases: ["Circunferencia x²+y²=r²", "Cónica general", "Curvas de nivel simples", "Lugares geométricos"],
  constraints: ["equation en sintaxis mathjs con variables x e y; admite 'lado = lado' (ej. 'x^2/4 + y^2/9 = 1')", "xDomain y yDomain obligatorios", "Máx. 3 curvas"],
  fitsSlots: ["visual", "main", "right", "left"],
  areas: ["math"],
  schema: z.object({
    curves: z.array(z.object({ equation: z.string().min(1).max(200), label: z.string().max(60).optional() })).min(1).max(3),
    xDomain: z.tuple([z.number(), z.number()]),
    yDomain: z.tuple([z.number(), z.number()]),
    points: z.array(z.object({ x: z.number(), y: z.number(), label: z.string().max(40).optional() })).max(8).default([]),
    caption: z.string().max(200).optional(),
  }).refine((p) => p.xDomain[0] < p.xDomain[1] && p.yDomain[0] < p.yDomain[1], { message: "los dominios deben ser [min, max] con min < max" }),
  examples: [{ name: "circunferencia", props: { curves: [{ equation: "x^2 + y^2 = 9", label: "x²+y²=9" }], xDomain: [-5, 5], yDomain: [-4, 4], points: [{ x: 3, y: 0, label: "(3, 0)" }] } }],
  Component: ({ props, ctx }) => {
    const W = ctx.width, H = ctx.height - (props.caption ? 56 : 0);
    const b: Bounds = { xMin: props.xDomain[0], xMax: props.xDomain[1], yMin: props.yDomain[0], yMax: props.yDomain[1] };
    const compiled = props.curves.map((c) => { try { const f = compileFn2(toImplicit(c.equation)); f(b.xMin, b.yMin); return f; } catch { return null; } });
    const bad = compiled.findIndex((f) => !f);
    return (
      <figure className="lm-plot">
        <Frame b={b} W={W} H={H} label={props.caption ?? props.curves.map((c) => c.label ?? c.equation).join(", ")}>
          {({ sx, sy }) => (
            <>
              {compiled.map((f, i) => f ? <path key={`c${i}`} className="lm-curve" pathLength={1} stroke={PLOT_COLORS[i]} d={implicitContours(f, b, 110).map((s) => `M${sx(s[0]).toFixed(1)},${sy(s[1]).toFixed(1)}L${sx(s[2]).toFixed(1)},${sy(s[3]).toFixed(1)}`).join("")} /> : null)}
              {props.points.map((p, i) => <g key={`p${i}`}><circle className="lm-point" cx={sx(p.x)} cy={sy(p.y)} r={9} />{p.label && <Tag x={sx(p.x) + 16} y={sy(p.y) - 14} text={p.label} />}</g>)}
              {props.curves.length > 1 && props.curves.map((c, i) => <g key={`lg${i}`} transform={`translate(${M.l + 24},${M.t + 30 + i * 40})`}><line x1={0} x2={48} y1={0} y2={0} stroke={PLOT_COLORS[i]} strokeWidth={6} /><text x={62} y={9} className="lm-plot-label">{c.label ?? c.equation}</text></g>)}
              {bad >= 0 && <text x={W / 2} y={H / 2} textAnchor="middle" className="lm-plot-label" data-lamina-error="props">{`No se pudo evaluar la ecuación ${bad + 1}`}</text>}
            </>
          )}
        </Frame>
        <Caption text={props.caption} />
      </figure>
    );
  },
});

/* ───── ParametricPlot ───── */
export const ParametricPlot = defineComponent({
  id: "ParametricPlot",
  title: "Curva paramétrica",
  purpose: "Curva (x(t), y(t)) con marcadores en valores de t y encuadre automático a escala 1:1.",
  useCases: ["Circunferencia/elipse paramétrica", "Cicloide, espiral", "Trayectoria de un proyectil"],
  constraints: ["x e y son expresiones mathjs en la variable t", "tRange = [t0, t1] con t0 < t1", "Máx. 3 curvas; markers: valores de t a marcar"],
  fitsSlots: ["visual", "main", "right", "left"],
  areas: ["math"],
  schema: z.object({
    curves: z.array(z.object({ x: z.string().min(1).max(200), y: z.string().min(1).max(200), label: z.string().max(60).optional() })).min(1).max(3),
    tRange: z.tuple([z.number(), z.number()]),
    markers: z.array(z.object({ t: z.number(), label: z.string().max(40).optional(), curve: z.number().int().min(0).max(2).default(0) })).max(8).default([]),
    caption: z.string().max(200).optional(),
  }).refine((p) => p.tRange[0] < p.tRange[1], { message: "tRange debe ser [t0, t1] con t0 < t1" }),
  examples: [{ name: "espiral", props: { curves: [{ x: "t cos(t)", y: "t sin(t)", label: "espiral" }], tRange: [0, 12], markers: [{ t: 6.28, label: "t=2π", curve: 0 }] } }],
  Component: ({ props, ctx }) => {
    const W = ctx.width, H = ctx.height - (props.caption ? 56 : 0);
    const fns = props.curves.map((c) => { try { const fx = compileFnOf(c.x, "t"), fy = compileFnOf(c.y, "t"); fx(props.tRange[0]); fy(props.tRange[0]); return { fx, fy }; } catch { return null; } });
    const series = fns.map((f) => (f ? sampleParam(f.fx, f.fy, props.tRange, 480) : []));
    const b = boundsOf(series.flat());
    const bad = fns.findIndex((f) => !f);
    return (
      <figure className="lm-plot">
        <Frame b={b} W={W} H={H} label={props.caption ?? props.curves.map((c) => c.label ?? `(${c.x}, ${c.y})`).join(", ")}>
          {({ sx, sy }) => (
            <>
              {series.map((s, i) => <path key={`c${i}`} className="lm-curve" pathLength={1} stroke={PLOT_COLORS[i]} d={pathOf(s, sx, sy).join(" ")} />)}
              {props.markers.map((m, i) => { const f = fns[m.curve]; if (!f) return null; let x = NaN, y = NaN; try { x = f.fx(m.t); y = f.fy(m.t); } catch { /* ignorar */ } if (!Number.isFinite(x) || !Number.isFinite(y)) return null; return <g key={`m${i}`}><circle className="lm-point" cx={sx(x)} cy={sy(y)} r={9} />{m.label && <Tag x={sx(x) + 16} y={sy(y) - 14} text={m.label} />}</g>; })}
              {bad >= 0 && <text x={W / 2} y={H / 2} textAnchor="middle" className="lm-plot-label" data-lamina-error="props">{`No se pudo evaluar la curva ${bad + 1}`}</text>}
            </>
          )}
        </Frame>
        <Caption text={props.caption} />
      </figure>
    );
  },
});

/* ───── PolarPlot ───── */
export const PolarPlot = defineComponent({
  id: "PolarPlot",
  title: "Curva polar r(θ)",
  purpose: "Gráfica en coordenadas polares con rejilla radial y angular (rosas, cardioides, espirales).",
  useCases: ["Cardioide r = 1 + cos θ", "Rosa de n pétalos", "Espiral de Arquímedes"],
  constraints: ["r en sintaxis mathjs con la variable theta (ej. '1 + cos(theta)', '2 sin(3 theta)')", "thetaRange = [a, b] en radianes; Máx. 3 curvas"],
  fitsSlots: ["visual", "main", "right", "left"],
  areas: ["math"],
  schema: z.object({
    curves: z.array(z.object({ r: z.string().min(1).max(200), label: z.string().max(60).optional() })).min(1).max(3),
    thetaRange: z.tuple([z.number(), z.number()]).default([0, 6.2832]),
    caption: z.string().max(200).optional(),
  }).refine((p) => p.thetaRange[0] < p.thetaRange[1], { message: "thetaRange debe ser [a, b] con a < b" }),
  examples: [{ name: "cardioide", props: { curves: [{ r: "1 + cos(theta)", label: "r = 1 + cos θ" }], thetaRange: [0, 6.2832] } }],
  Component: ({ props, ctx }) => {
    const W = ctx.width, H = ctx.height - (props.caption ? 56 : 0);
    const fns = props.curves.map((c) => { try { const fr = compileFnOf(c.r, "theta"); fr(props.thetaRange[0]); return fr; } catch { return null; } });
    const series = fns.map((fr) => (fr ? sampleParam((t) => fr(t) * Math.cos(t), (t) => fr(t) * Math.sin(t), props.thetaRange, 600) : []));
    const b0 = boundsOf(series.flat(), 0.12);
    const R = Math.max(Math.abs(b0.xMin), Math.abs(b0.xMax), Math.abs(b0.yMin), Math.abs(b0.yMax));
    const b: Bounds = { xMin: -R, xMax: R, yMin: -R, yMax: R };
    const rings = ticks(0, R, 4).filter((v) => v > 0);
    const bad = fns.findIndex((f) => !f);
    return (
      <figure className="lm-plot">
        <Frame b={b} W={W} H={H} label={props.caption ?? props.curves.map((c) => c.label ?? c.r).join(", ")}>
          {({ sx, sy }) => (
            <>
              <g className="lm-grid">
                {rings.map((r) => <circle key={`r${r}`} cx={sx(0)} cy={sy(0)} r={Math.abs(sx(r) - sx(0))} fill="none" />)}
                {[0, 30, 60, 90, 120, 150].map((d) => { const a = (d * Math.PI) / 180; return <line key={`a${d}`} x1={sx(-R * Math.cos(a))} y1={sy(-R * Math.sin(a))} x2={sx(R * Math.cos(a))} y2={sy(R * Math.sin(a))} />; })}
              </g>
              {series.map((s, i) => <path key={`c${i}`} className="lm-curve" pathLength={1} stroke={PLOT_COLORS[i]} d={pathOf(s, sx, sy).join(" ")} />)}
              {props.curves.length > 1 && props.curves.map((c, i) => <g key={`lg${i}`} transform={`translate(${M.l + 24},${M.t + 30 + i * 40})`}><line x1={0} x2={48} y1={0} y2={0} stroke={PLOT_COLORS[i]} strokeWidth={6} /><text x={62} y={9} className="lm-plot-label">{c.label ?? c.r}</text></g>)}
              {bad >= 0 && <text x={W / 2} y={H / 2} textAnchor="middle" className="lm-plot-label" data-lamina-error="props">{`No se pudo evaluar la curva ${bad + 1}`}</text>}
            </>
          )}
        </Frame>
        <Caption text={props.caption} />
      </figure>
    );
  },
});

/* ───── StatChart ───── */
const quantile = (s: number[], q: number) => { const i = (s.length - 1) * q, lo = Math.floor(i), hi = Math.ceil(i); return s[lo]! + (s[hi]! - s[lo]!) * (i - lo); };

export const StatChart = defineComponent({
  id: "StatChart",
  title: "Gráfico estadístico",
  purpose: "Histograma, diagrama de caja o dispersión (con recta de regresión) a partir de datos numéricos.",
  useCases: ["Distribución de notas", "Comparar grupos con cajas", "Correlación entre dos variables"],
  constraints: ["histogram: values (hasta 300) y bins 3–20", "box: groups = [{label, values}] (hasta 5 grupos)", "scatter: points = [{x, y}] (hasta 60); regression añade la recta de mínimos cuadrados"],
  fitsSlots: ["visual", "main", "right", "left"],
  areas: ["math", "natsci"],
  schema: z.object({
    kind: z.enum(["histogram", "box", "scatter"]),
    values: z.array(z.number()).max(300).default([]),
    bins: z.number().int().min(3).max(20).default(8),
    groups: z.array(z.object({ label: z.string().max(40), values: z.array(z.number()).min(1).max(300) })).max(5).default([]),
    points: z.array(z.object({ x: z.number(), y: z.number() })).max(60).default([]),
    regression: z.boolean().default(false),
    xLabel: z.string().max(60).optional(),
    yLabel: z.string().max(60).optional(),
    caption: z.string().max(200).optional(),
  }),
  examples: [
    { name: "histograma", props: { kind: "histogram", values: [4, 5, 5, 6, 6, 6, 7, 7, 7, 7, 8, 8, 8, 9, 9, 10], bins: 6, groups: [], points: [], regression: false, xLabel: "Nota" } },
    { name: "dispersion", props: { kind: "scatter", values: [], bins: 8, groups: [], points: [{ x: 1, y: 2 }, { x: 2, y: 3.1 }, { x: 3, y: 3.9 }, { x: 4, y: 5.2 }, { x: 5, y: 5.8 }], regression: true, xLabel: "Horas de estudio", yLabel: "Nota" } },
  ],
  Component: ({ props, ctx }) => {
    const W = ctx.width, H = ctx.height - (props.caption ? 56 : 0);
    const aw = W - M.l - M.r, ah = H - M.t - M.b;
    let body: React.ReactNode = <text x={W / 2} y={H / 2} textAnchor="middle" className="lm-plot-label" data-lamina-error="props">Sin datos para graficar</text>;
    let xt: { v: number; at: number }[] = [], yt: { v: number; at: number }[] = [];
    if (props.kind === "histogram" && props.values.length) {
      const lo = Math.min(...props.values), hi = Math.max(...props.values), span = hi - lo || 1, w = span / props.bins;
      const counts = Array.from({ length: props.bins }, () => 0);
      for (const v of props.values) counts[Math.min(props.bins - 1, Math.floor((v - lo) / w))]!++;
      const cmax = Math.max(...counts);
      const sy = (c: number) => M.t + ah - (c / cmax) * ah;
      body = <>{counts.map((c, i) => <rect key={i} className="lm-bar" x={M.l + (i * aw) / props.bins + 3} y={sy(c)} width={aw / props.bins - 6} height={M.t + ah - sy(c)} fill={PLOT_COLORS[0]} />)}</>;
      xt = Array.from({ length: props.bins + 1 }, (_, i) => ({ v: lo + i * w, at: M.l + (i * aw) / props.bins }));
      yt = ticks(0, cmax, 5).map((v) => ({ v, at: sy(v) }));
    } else if (props.kind === "box" && props.groups.length) {
      const all = props.groups.flatMap((g) => g.values), lo = Math.min(...all), hi = Math.max(...all), span = hi - lo || 1;
      const sy = (v: number) => M.t + ah - ((v - lo) / span) * ah * 0.92 - ah * 0.04;
      const slot = aw / props.groups.length;
      body = <>{props.groups.map((g, i) => {
        const s = [...g.values].sort((a, b) => a - b), q1 = quantile(s, 0.25), q2 = quantile(s, 0.5), q3 = quantile(s, 0.75), cx = M.l + slot * (i + 0.5), bw = Math.min(slot * 0.5, 160);
        return (
          <g key={i} stroke="var(--lm-ink)" strokeWidth={3}>
            <line x1={cx} x2={cx} y1={sy(s[0]!)} y2={sy(q1)} /><line x1={cx} x2={cx} y1={sy(q3)} y2={sy(s[s.length - 1]!)} />
            <line x1={cx - bw / 4} x2={cx + bw / 4} y1={sy(s[0]!)} y2={sy(s[0]!)} /><line x1={cx - bw / 4} x2={cx + bw / 4} y1={sy(s[s.length - 1]!)} y2={sy(s[s.length - 1]!)} />
            <rect x={cx - bw / 2} y={sy(q3)} width={bw} height={Math.max(2, sy(q1) - sy(q3))} fill={PLOT_COLORS[i % 4]} fillOpacity={0.35} />
            <line x1={cx - bw / 2} x2={cx + bw / 2} y1={sy(q2)} y2={sy(q2)} strokeWidth={6} />
          </g>
        );
      })}</>;
      xt = props.groups.map((g, i) => ({ v: NaN, at: M.l + slot * (i + 0.5), ...({ label: g.label } as object) }));
      yt = ticks(lo, hi, 5).map((v) => ({ v, at: sy(v) }));
    } else if (props.kind === "scatter" && props.points.length) {
      const xs = props.points.map((p) => p.x), ys = props.points.map((p) => p.y);
      const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys), px = (x1 - x0 || 1) * 0.08, py = (y1 - y0 || 1) * 0.08;
      const sx = (x: number) => M.l + ((x - (x0 - px)) / (x1 - x0 + 2 * px)) * aw, sy = (y: number) => M.t + ah - ((y - (y0 - py)) / (y1 - y0 + 2 * py)) * ah;
      const n = xs.length, mx = xs.reduce((a, b) => a + b, 0) / n, my = ys.reduce((a, b) => a + b, 0) / n;
      const sxx = xs.reduce((a, x) => a + (x - mx) ** 2, 0), sxy = xs.reduce((a, x, i) => a + (x - mx) * (ys[i]! - my), 0);
      const slope = sxx ? sxy / sxx : 0, icpt = my - slope * mx;
      body = <>{props.regression && sxx > 0 && <line className="lm-tangent" x1={sx(x0 - px)} y1={sy(icpt + slope * (x0 - px))} x2={sx(x1 + px)} y2={sy(icpt + slope * (x1 + px))} />}{props.points.map((p, i) => <circle key={i} className="lm-point" cx={sx(p.x)} cy={sy(p.y)} r={9} />)}</>;
      xt = ticks(x0 - px, x1 + px, 7).map((v) => ({ v, at: sx(v) }));
      yt = ticks(y0 - py, y1 + py, 6).map((v) => ({ v, at: sy(v) }));
    }
    const labels = props.kind === "box" ? props.groups.map((g) => g.label) : [];
    return (
      <figure className="lm-plot">
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={props.caption ?? `Gráfico estadístico: ${props.kind}`}>
          <g className="lm-grid">{yt.map((t, i) => <line key={`gy${i}`} x1={M.l} x2={W - M.r} y1={t.at} y2={t.at} />)}</g>
          <g className="lm-axes"><line x1={M.l} x2={W - M.r} y1={M.t + ah} y2={M.t + ah} /><line x1={M.l} x2={M.l} y1={M.t} y2={M.t + ah} /></g>
          <g className="lm-ticks">
            {xt.map((t, i) => <text key={`tx${i}`} x={t.at} y={M.t + ah + 38} textAnchor="middle">{props.kind === "box" ? labels[i] : fmt(t.v)}</text>)}
            {yt.map((t, i) => <text key={`ty${i}`} x={M.l - 12} y={t.at + 9} textAnchor="end">{fmt(t.v)}</text>)}
          </g>
          {body}
          {props.xLabel && <text className="lm-plot-label" x={M.l + aw / 2} y={H - 12} textAnchor="middle">{props.xLabel}</text>}
          {props.yLabel && <text className="lm-plot-label" transform={`translate(30,${M.t + ah / 2}) rotate(-90)`} textAnchor="middle">{props.yLabel}</text>}
        </svg>
        <Caption text={props.caption} />
      </figure>
    );
  },
});
