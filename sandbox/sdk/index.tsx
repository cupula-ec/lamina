/**
 * @lamina/sdk — API restringida para componentes generados. Es lo ÚNICO (junto con "react") que pueden importar.
 * Todo corre en un iframe sandbox (origen opaco, CSP sin red).
 */
import { createElement } from "react";
import katex from "katex";
export { scaleLinear } from "d3-scale";
export { line, area } from "d3-shape";

export * from "./math";

/** Fórmula KaTeX (la única vía autorizada para inyectar HTML). */
export function Latex({ tex, display = true }: { tex: string; display?: boolean }) {
  const html = katex.renderToString(String(tex).slice(0, 2000), { throwOnError: false, strict: "ignore", trust: false, displayMode: display, output: "htmlAndMathml", maxExpand: 200 });
  return createElement("span", { dangerouslySetInnerHTML: { __html: html } });
}

export const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
export function ticks(min: number, max: number, count = 8): number[] {
  const raw = (max - min) / count, pow = Math.pow(10, Math.floor(Math.log10(raw))), f = raw / pow;
  const step = (f < 1.5 ? 1 : f < 3.5 ? 2 : f < 7.5 ? 5 : 10) * pow;
  const out: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max + step * 1e-9; v += step) out.push(+v.toPrecision(12));
  return out;
}
