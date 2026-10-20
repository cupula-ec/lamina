declare module "@lamina/sdk" {
  import type { ReactElement } from "react";
  export function compileFn(expr: string): (x: number) => number;
  export function Latex(p: { tex: string; display?: boolean }): ReactElement;
  export function clamp(v: number, a: number, b: number): number;
  export function ticks(min: number, max: number, count?: number): number[];
  export { scaleLinear } from "d3-scale";
  export { line, area } from "d3-shape";
}
