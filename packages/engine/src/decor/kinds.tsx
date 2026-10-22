import type { ReactNode } from "react";
import { n1, polyline, type Rand } from "./rng";

export type DecorKind = "axes-grid" | "curve-family" | "field-lines" | "iso-grid" | "hex-molecules" | "compass-arcs" | "waves" | "data-dots" | "chalk" | "corner";
export type DecorRole = "cover" | "section" | "closing" | "interior";
export type DecorArgs = { r: Rand; role: DecorRole; w: number; h: number };

const A = "lm-deco-a", B = "lm-deco-b";
const key = (...p: (string | number)[]) => p.join("-");

function Line({ x1, y1, x2, y2, cls = A, sw = 2, dash }: { x1: number; y1: number; x2: number; y2: number; cls?: string; sw?: number; dash?: string }) {
  return <line x1={n1(x1)} y1={n1(y1)} x2={n1(x2)} y2={n1(y2)} className={cls} strokeWidth={sw} strokeDasharray={dash} />;
}

/** Rejilla de ejes con curvas: cuaderno técnico. */
export function axesGrid({ r, role, w, h }: DecorArgs): ReactNode {
  const els: ReactNode[] = [];
  const minor = role === "interior" ? 120 : 60, major = minor * 4;
  for (let x = 0; x <= w; x += minor) els.push(<Line key={key("v", x)} x1={x} y1={0} x2={x} y2={h} sw={x % major === 0 ? 2 : 1} />);
  for (let y = 0; y <= h; y += minor) els.push(<Line key={key("h", y)} x1={0} y1={y} x2={w} y2={y} sw={y % major === 0 ? 2 : 1} />);
  if (role !== "interior") {
    const cx = Math.round(r.range(0.45, 0.7) * w / minor) * minor, cy = Math.round(r.range(0.4, 0.65) * h / minor) * minor;
    els.push(<Line key="ax" x1={cx} y1={0} x2={cx} y2={h} cls={B} sw={3} />, <Line key="ay" x1={0} y1={cy} x2={w} y2={cy} cls={B} sw={3} />);
    for (let t = -12; t <= 12; t++) if (t) {
      els.push(<Line key={key("tx", t)} x1={cx + t * minor} y1={cy - 10} x2={cx + t * minor} y2={cy + 10} cls={B} sw={3} />);
    }
    for (let c = 0; c < 3; c++) {
      const amp = r.range(90, 240), k = r.range(0.004, 0.011), ph = r.range(0, 6.28), kind = r.int(0, 2);
      const pts: [number, number][] = [];
      for (let x = 0; x <= w; x += 16) {
        const u = (x - cx) * k;
        const y = kind === 0 ? Math.sin(u + ph) * amp : kind === 1 ? ((x - cx) ** 2) / (w * 1.3) * (c % 2 ? -1 : 1) * (amp / 120) : Math.sin(u * 0.6 + ph) * Math.cos(u * 1.7) * amp * 0.9;
        pts.push([x, cy - y]);
      }
      els.push(<path key={key("c", c)} d={polyline(pts)} className={c === 0 ? B : A} strokeWidth={c === 0 ? 5 : 3} />);
    }
  }
  return els;
}

/** Familia de curvas (parábolas o senoides escaladas) con una tangente marcada. */
export function curveFamily({ r, role, w, h }: DecorArgs): ReactNode {
  const els: ReactNode[] = [];
  const n = role === "interior" ? 5 : 11, sine = r.chance(0.5);
  const cy = h * r.range(0.45, 0.7), k = r.range(0.0035, 0.007), ph = r.range(0, 3);
  const base = sine ? r.range(14, 22) : r.range(0.0002, 0.0004);
  for (let i = 1; i <= n; i++) {
    const pts: [number, number][] = [];
    for (let x = 0; x <= w; x += 14) {
      const y = sine ? Math.sin(x * k + ph) * base * i * (role === "interior" ? 1.6 : 1) : ((x - w * 0.55) ** 2) * base * i * 0.9 - (role === "interior" ? 0 : 60);
      pts.push([x, sine ? cy - y : cy + 200 - y]);
    }
    els.push(<path key={key("f", i)} d={polyline(pts)} className={i % 4 === 0 ? B : A} strokeWidth={i % 4 === 0 ? 4 : 2} />);
  }
  if (role !== "interior") {
    const px = r.range(0.55, 0.85) * w, py = cy + r.range(-40, 40), sl = r.range(-0.9, 0.9);
    els.push(<Line key="tg" x1={px - 240} y1={py - sl * 240} x2={px + 240} y2={py + sl * 240} cls={B} sw={4} dash="14 10" />, <circle key="tp" cx={n1(px)} cy={n1(py)} r={11} className={B} fill="currentColor" />);
  }
  return els;
}

/** Líneas de campo entre dos polos con circunferencias equipotenciales. */
export function fieldLines({ r, role, w, h }: DecorArgs): ReactNode {
  const els: ReactNode[] = [];
  const cx = w * r.range(0.55, 0.72), cy = h * r.range(0.4, 0.6), d = r.range(150, 230);
  const p1: [number, number] = [cx - d, cy], p2: [number, number] = [cx + d, cy];
  const n = role === "interior" ? 6 : 14;
  for (let i = 0; i < n; i++) {
    const off = ((i - (n - 1) / 2) / n) * (role === "interior" ? 900 : 1500);
    els.push(<path key={key("l", i)} d={`M${n1(p1[0])},${n1(p1[1])} Q${n1(cx)},${n1(cy + off)} ${n1(p2[0])},${n1(p2[1])}`} className={i % 5 === 0 ? B : A} strokeWidth={i % 5 === 0 ? 4 : 2} />);
  }
  for (let i = 1; i <= (role === "interior" ? 3 : 6); i++) {
    els.push(<circle key={key("a", i)} cx={n1(p1[0])} cy={n1(p1[1])} r={i * 46} className={A} strokeWidth={2} strokeDasharray="6 10" />, <circle key={key("b", i)} cx={n1(p2[0])} cy={n1(p2[1])} r={i * 46} className={A} strokeWidth={2} strokeDasharray="6 10" />);
  }
  els.push(<circle key="p1" cx={n1(p1[0])} cy={n1(p1[1])} r={16} className={B} fill="currentColor" />, <circle key="p2" cx={n1(p2[0])} cy={n1(p2[1])} r={16} className={A} fill="currentColor" />);
  return els;
}

/** Cuadrícula isométrica. */
export function isoGrid({ r, role, w, h }: DecorArgs): ReactNode {
  const els: ReactNode[] = [];
  const s = role === "interior" ? 110 : 72, t = Math.tan(Math.PI / 6), off = r.int(0, 3) * 12;
  for (let x = -off; x <= w; x += s) els.push(<Line key={key("v", x)} x1={x} y1={0} x2={x} y2={h} sw={1.5} />);
  for (let c = -h / t; c <= w; c += s * 1.1547) {
    els.push(<Line key={key("p", Math.round(c))} x1={c} y1={0} x2={c + h / t} y2={h} sw={1.5} />, <Line key={key("q", Math.round(c))} x1={c + h / t} y1={0} x2={c} y2={h} sw={1.5} />);
  }
  if (role !== "interior") {
    const cx = Math.round(r.range(0.55, 0.8) * w / s) * s, cy = Math.round(r.range(0.3, 0.6) * h / s) * s;
    const hexP = [0, 1, 2, 3, 4, 5].map((i): [number, number] => [cx + Math.cos(Math.PI / 3 * i + Math.PI / 6) * s * 1.7, cy + Math.sin(Math.PI / 3 * i + Math.PI / 6) * s * 1.7]);
    els.push(<path key="cube" d={`${polyline(hexP)} Z`} className={B} strokeWidth={4} />);
  }
  return els;
}

/** Hexágonos moleculares con átomos y enlaces. */
export function hexMolecules({ r, role, w, h }: DecorArgs): ReactNode {
  const els: ReactNode[] = [];
  const R = role === "interior" ? 74 : 56, dx = Math.sqrt(3) * R, dy = R * 1.5;
  for (let row = -1; row * dy < h + R; row++) {
    for (let col = -1; col * dx < w + dx; col++) {
      const cx = col * dx + (row % 2 ? dx / 2 : 0), cy = row * dy;
      if (!r.chance(role === "interior" ? 0.22 : 0.33)) continue;
      const pts = [0, 1, 2, 3, 4, 5].map((i): [number, number] => [cx + Math.cos(Math.PI / 3 * i + Math.PI / 6) * R, cy + Math.sin(Math.PI / 3 * i + Math.PI / 6) * R]);
      els.push(<path key={key("h", row, col)} d={`${polyline(pts)} Z`} className={r.chance(0.2) ? B : A} strokeWidth={r.chance(0.2) ? 4 : 2.5} />);
      if (r.chance(0.5)) {
        const v = pts[r.int(0, 5)]!;
        els.push(<circle key={key("a", row, col)} cx={n1(v[0])} cy={n1(v[1])} r={role === "interior" ? 8 : 11} className={B} fill="currentColor" />);
        if (r.chance(0.5)) {
          const ang = Math.atan2(v[1] - cy, v[0] - cx);
          els.push(<Line key={key("b", row, col)} x1={v[0]} y1={v[1]} x2={v[0] + Math.cos(ang) * R * 0.7} y2={v[1] + Math.sin(ang) * R * 0.7} cls={B} sw={3} />);
        }
      }
    }
  }
  return els;
}

/** Trazos de compás: arcos concéntricos, radios y marcas de construcción. */
export function compassArcs({ r, role, w, h }: DecorArgs): ReactNode {
  const els: ReactNode[] = [];
  const cx = w * r.range(0.62, 0.8), cy = h * r.range(0.35, 0.65);
  const n = role === "interior" ? 4 : 8;
  const arc = (rad: number, a0: number, a1: number) => `M${n1(cx + Math.cos(a0) * rad)},${n1(cy + Math.sin(a0) * rad)} A${n1(rad)},${n1(rad)} 0 ${a1 - a0 > Math.PI ? 1 : 0} 1 ${n1(cx + Math.cos(a1) * rad)},${n1(cy + Math.sin(a1) * rad)}`;
  for (let i = 1; i <= n; i++) {
    const a0 = r.range(0, 6.28), span = r.range(1.0, 3.6);
    els.push(<path key={key("r", i)} d={arc(110 + i * 86, a0, a0 + span)} className={i % 3 === 0 ? B : A} strokeWidth={i % 3 === 0 ? 4 : 2.5} />);
  }
  const rays = role === "interior" ? 2 : 5;
  for (let i = 0; i < rays; i++) {
    const a = r.range(0, 6.28), rad = 110 + n * 86;
    els.push(<Line key={key("ray", i)} x1={cx} y1={cy} x2={cx + Math.cos(a) * rad} y2={cy + Math.sin(a) * rad} sw={1.5} dash="10 12" />);
    for (let k = 1; k <= n; k++) els.push(<circle key={key("t", i, k)} cx={n1(cx + Math.cos(a) * (110 + k * 86))} cy={n1(cy + Math.sin(a) * (110 + k * 86))} r={5} className={B} fill="currentColor" />);
  }
  els.push(<circle key="c" cx={n1(cx)} cy={n1(cy)} r={9} className={B} fill="currentColor" />);
  return els;
}

/** Ondas apiladas. */
export function waves({ r, role, w, h }: DecorArgs): ReactNode {
  const els: ReactNode[] = [];
  const n = role === "interior" ? 4 : 9, y0 = h * (role === "interior" ? 0.78 : r.range(0.35, 0.5));
  for (let i = 0; i < n; i++) {
    const amp = r.range(18, 54), lam = r.range(260, 520), ph = r.range(0, 6.28), gap = role === "interior" ? 40 : 54;
    const pts: [number, number][] = [];
    for (let x = 0; x <= w; x += 12) pts.push([x, y0 + i * gap + Math.sin((x / lam) * 6.2832 + ph) * amp]);
    els.push(<path key={key("w", i)} d={polyline(pts)} className={i % 3 === 0 ? B : A} strokeWidth={i % 3 === 0 ? 4 : 2.5} />);
  }
  return els;
}

/** Dispersión de puntos con tendencia e histograma. */
export function dataDots({ r, role, w, h }: DecorArgs): ReactNode {
  const els: ReactNode[] = [];
  const x0 = w * 0.42, x1 = w - 120, y0 = h - 160, y1 = 160, N = role === "interior" ? 18 : 46;
  const slope = r.range(0.55, 0.95);
  if (role !== "interior") {
    const bars = 10, bw = (x1 - x0) / bars;
    for (let i = 0; i < bars; i++) {
      const bh = Math.exp(-(((i - bars / 2) / 2.6) ** 2)) * 280 + r.range(10, 50);
      els.push(<rect key={key("b", i)} x={n1(x0 + i * bw + 6)} y={n1(h - 40 - bh)} width={n1(bw - 12)} height={n1(bh)} className={A} strokeWidth={2} />);
    }
  }
  for (let i = 0; i < N; i++) {
    const t = r.next(), x = x0 + t * (x1 - x0), y = y0 - (t * slope * (y0 - y1)) + r.range(-1, 1) * 110;
    els.push(<circle key={key("p", i)} cx={n1(x)} cy={n1(y)} r={role === "interior" ? 6 : 9} className={i % 7 === 0 ? B : A} fill="currentColor" />);
  }
  els.push(<Line key="trend" x1={x0} y1={y0} x2={x1} y2={y0 - slope * (y0 - y1)} cls={B} sw={4} dash="16 10" />);
  return els;
}

/** Trazos a mano alzada con polvo de tiza. */
export function chalk({ r, role, w, h }: DecorArgs): ReactNode {
  const els: ReactNode[] = [];
  const wob = (x1: number, y1: number, x2: number, y2: number) => {
    const pts: [number, number][] = [];
    const steps = 14;
    for (let i = 0; i <= steps; i++) pts.push([x1 + ((x2 - x1) * i) / steps + r.range(-4, 4), y1 + ((y2 - y1) * i) / steps + r.range(-4, 4)]);
    return polyline(pts);
  };
  const n = role === "interior" ? 3 : 7;
  for (let i = 0; i < n; i++) {
    const x = r.range(0.45, 0.95) * w, y = r.range(0.1, 0.9) * h, len = r.range(120, 360), a = r.range(0, 3.14);
    els.push(<path key={key("s", i)} d={wob(x, y, x + Math.cos(a) * len, y + Math.sin(a) * len)} className={i % 3 === 0 ? B : A} strokeWidth={5} strokeLinecap="round" />);
  }
  if (role !== "interior") {
    const cx = w * r.range(0.65, 0.85), cy = h * r.range(0.3, 0.6), rad = r.range(110, 190);
    const pts: [number, number][] = [];
    for (let a = 0; a <= 6.4; a += 0.2) pts.push([cx + Math.cos(a) * rad + r.range(-5, 5), cy + Math.sin(a) * rad + r.range(-5, 5)]);
    els.push(<path key="circle" d={polyline(pts)} className={B} strokeWidth={5} strokeLinecap="round" />);
  }
  for (let i = 0; i < (role === "interior" ? 14 : 40); i++) els.push(<circle key={key("d", i)} cx={n1(r.range(0, w))} cy={n1(r.range(0, h))} r={n1(r.range(1.5, 4))} className={A} fill="currentColor" />);
  return els;
}

/** Esquinas con filetes: ornamento sobrio. */
export function corner({ r, role, w, h }: DecorArgs): ReactNode {
  const els: ReactNode[] = [];
  const m = role === "interior" ? 40 : 64, L = role === "interior" ? 90 : 180;
  const bracket = (k: string, x: number, y: number, sx: number, sy: number) => {
    els.push(<path key={k} d={`M${n1(x + sx * L)},${n1(y)} L${n1(x)},${n1(y)} L${n1(x)},${n1(y + sy * L)}`} className={A} strokeWidth={role === "interior" ? 3 : 5} />);
    const ticks = r.int(2, 4);
    for (let i = 1; i <= ticks; i++) els.push(<Line key={`${k}-t${i}`} x1={x + sx * i * 28} y1={y + sy * 14} x2={x + sx * i * 28} y2={y + sy * 30} sw={3} cls={B} />);
  };
  bracket("tl", m, m, 1, 1);
  bracket("br", w - m, h - m, -1, -1);
  if (role !== "interior") {
    els.push(<Line key="rule" x1={m} y1={h - m - 44} x2={w * 0.38} y2={h - m - 44} cls={B} sw={3} />, <Line key="rule2" x1={m} y1={h - m - 32} x2={w * 0.38} y2={h - m - 32} sw={1.5} />);
  }
  return els;
}

export const DECOR_KINDS: Record<DecorKind, (a: DecorArgs) => ReactNode> = {
  "axes-grid": axesGrid, "curve-family": curveFamily, "field-lines": fieldLines, "iso-grid": isoGrid, "hex-molecules": hexMolecules,
  "compass-arcs": compassArcs, waves, "data-dots": dataDots, chalk, corner,
};
