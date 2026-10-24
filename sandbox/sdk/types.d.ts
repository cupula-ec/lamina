declare module "@lamina/sdk" {
  import type { ReactElement } from "react";
  export function compileFn(expr: string): (x: number) => number;
  /** f(x, y) para curvas implícitas (variables x e y). */
  export function compileFn2(expr: string): (x: number, y: number) => number;
  /** r(θ) para curvas polares (variable t, theta o th). */
  export function compilePolar(expr: string): (theta: number) => number;
  export type Bounds = { xMin: number; xMax: number; yMin: number; yMax: number };
  export type Pt = [number, number];
  export type Seg = [number, number, number, number];
  /** Contorno f(x, y) = 0 (marching squares): segmentos [x1, y1, x2, y2] en coordenadas del dominio. */
  export function implicitContours(f: (x: number, y: number) => number, bounds: Bounds, res?: number): Seg[];
  export function parametric(fx: (t: number) => number, fy: (t: number) => number, range: [number, number], n?: number): Pt[];
  export function polar(fr: (theta: number) => number, range: [number, number], n?: number): Pt[];
  /** Trazos SVG: pasa puntos ya en píxeles (linePath) o segmentos del dominio con un mapa a píxeles (segmentsPath). */
  export function linePath(pts: Pt[]): string;
  export function segmentsPath(segs: Seg[], map?: (x: number, y: number) => Pt): string;
  export function ellipsePath(cx: number, cy: number, a: number, b: number, rot?: number): string;
  export function parabolaPath(vx: number, vy: number, p: number, extent: number, orientation?: "vertical" | "horizontal"): string;
  export function hyperbolaPaths(cx: number, cy: number, a: number, b: number, extent: number, orientation?: "horizontal" | "vertical"): [string, string];
  export function arrowPath(x1: number, y1: number, x2: number, y2: number, head?: number): string;
  export function Latex(p: { tex: string; display?: boolean }): ReactElement;
  export function clamp(v: number, a: number, b: number): number;
  export function ticks(min: number, max: number, count?: number): number[];
  export { scaleLinear } from "d3-scale";
  export { line, area } from "d3-shape";
}
