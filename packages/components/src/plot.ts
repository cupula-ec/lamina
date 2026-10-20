import { compileFn } from "@lamina/validation/math";

export function niceStep(range: number, target = 8): number {
  const raw = range / target;
  const pow = Math.pow(10, Math.floor(Math.log10(raw)));
  const f = raw / pow;
  return (f < 1.5 ? 1 : f < 3.5 ? 2 : f < 7.5 ? 5 : 10) * pow;
}
export function ticks(min: number, max: number, target = 8): number[] {
  const step = niceStep(max - min, target);
  const out: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max + step * 1e-9; v += step) out.push(Math.abs(v) < step * 1e-9 ? 0 : +v.toPrecision(12));
  return out;
}
export const fmt = (v: number) => (Math.abs(v) >= 1e4 || (Math.abs(v) < 1e-3 && v !== 0) ? v.toExponential(1) : String(+v.toFixed(4)));

export type Sampled = { pts: ([number, number] | null)[]; ymin: number; ymax: number };

export function sampleFn(expr: string, x0: number, x1: number, n = 480): { f: (x: number) => number; ok: boolean } {
  try {
    const f = compileFn(expr);
    f(x0);
    return { f, ok: true };
  } catch {
    return { f: () => NaN, ok: false };
  }
}

export function sampleSeries(f: (x: number) => number, x0: number, x1: number, n = 480): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i <= n; i++) {
    const x = x0 + ((x1 - x0) * i) / n;
    let y = NaN;
    try { y = f(x); } catch { /* fuera de dominio */ }
    out.push([x, Number.isFinite(y) ? y : NaN]);
  }
  return out;
}

/** Rango Y robusto (percentiles 4–96) para no distorsionar la escala con asíntotas. */
export function autoYRange(series: [number, number][][]): [number, number] {
  const ys = series.flat().map((p) => p[1]).filter(Number.isFinite).sort((a, b) => a - b);
  if (!ys.length) return [-1, 1];
  const lo = ys[Math.floor(ys.length * 0.04)]!, hi = ys[Math.min(ys.length - 1, Math.floor(ys.length * 0.96))]!;
  let a = Math.min(lo, 0), b = Math.max(hi, 0);
  if (lo > 0 && lo < (hi - lo) * 0.4) a = 0; else a = Math.min(lo, a === 0 ? lo : a);
  if (b - a < 1e-9) { a -= 1; b += 1; }
  const pad = (b - a) * 0.08;
  return [a - pad, b + pad];
}

export function derivAt(f: (x: number) => number, x: number): number {
  const h = 1e-5 * Math.max(1, Math.abs(x));
  return (f(x + h) - f(x - h)) / (2 * h);
}

/** Convierte puntos a segmentos de path, cortando en NaN, fuera de rango y saltos grandes (asíntotas). */
export function toPaths(pts: [number, number][], sx: (x: number) => number, sy: (y: number) => number, ymin: number, ymax: number): string[] {
  const paths: string[] = [];
  let cur = "";
  let prev: [number, number] | null = null;
  const span = ymax - ymin;
  for (const p of pts) {
    const ok = Number.isFinite(p[1]) && p[1] >= ymin - span * 0.5 && p[1] <= ymax + span * 0.5;
    const jump = prev && Math.abs(p[1] - prev[1]) > span * 0.9;
    if (!ok || jump) { if (cur) paths.push(cur); cur = ""; prev = null; if (!ok) continue; }
    cur += `${cur ? "L" : "M"}${sx(p[0]).toFixed(1)},${sy(p[1]).toFixed(1)}`;
    prev = p;
  }
  if (cur) paths.push(cur);
  return paths;
}

export const PLOT_COLORS = ["var(--lm-plot1)", "var(--lm-plot2)", "var(--lm-plot3)", "var(--lm-plot4)"];
export const PLOT_DASH = ["", "14 8", "4 8", "20 6 4 6"];
