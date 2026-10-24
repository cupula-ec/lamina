import { describe, expect, it } from "vitest";
import { checkComponentSource } from "../src";

const ok = `import React from "react";
import { Latex, compileFn } from "@lamina/sdk";
type Props = { values: number[] };
export default function Component({ props, size }: { props: Props; size: { width: number; height: number } }) {
  const f = compileFn("x^2");
  return <svg width={size.width} height={size.height}><text x={10} y={40} style={{ top: 3 }}>{f(2)}</text><Latex tex="x^2" /></svg>;
}`;

describe("checkComponentSource", () => {
  it("acepta un componente válido", () => expect(checkComponentSource(ok)).toEqual([]));

  const attacks: [string, string][] = [
    ["fetch", `export default function C(){ fetch("https://evil.example"); return <div/>; }`],
    ["import fs", `import fs from "fs"; export default function C(){ return <div/>; }`],
    ["import d3 directo", `import { scaleLinear } from "d3-scale"; export default function C(){ return <div/>; }`],
    ["dynamic import", `export default function C(){ import("x"); return <div/>; }`],
    ["eval", `export default function C(){ eval("1"); return <div/>; }`],
    ["Function ctor", `export default function C(){ new Function("return 1")(); return <div/>; }`],
    ["constructor trick", `export default function C(){ const f = (()=>{}).constructor("return process")(); return <div/>; }`],
    ["globalThis", `export default function C(){ const g = globalThis; return <div/>; }`],
    ["window/document", `export default function C(){ document.cookie; return <div/>; }`],
    ["acceso por cadena", `export default function C(){ const x = (globalThis as any)["fe"+"tch"]; return <div/>; }`],
    ["bracket forbidden", `export default function C(o: any){ return <div>{o["constructor"]}</div>; }`],
    ["dangerouslySetInnerHTML", `export default function C(){ return <div dangerouslySetInnerHTML={{__html:"<img src=x onerror=1>"}}/>; }`],
    ["script tag", `export default function C(){ return <script>1</script>; }`],
    ["iframe", `export default function C(){ return <iframe src="x"/>; }`],
    ["onClick", `export default function C(){ return <div onClick={()=>1}/>; }`],
    ["img tag", `export default function C(){ return <img src="x"/>; }`],
    ["href", `export default function C(){ return <a href="javascript:alert(1)">x</a>; }`],
    ["URL string", `export default function C(){ const u = "https://evil.com"; return <div/>; }`],
    ["setTimeout", `export default function C(){ setTimeout(()=>1,1); return <div/>; }`],
    ["process.env", `export default function C(){ return <div>{process.env.SECRET}</div>; }`],
    ["sin export default", `export function C(){ return <div/>; }`],
    ["spread attrs", `export default function C(p: any){ return <div {...p}/>; }`],
    ["re-export", `export * from "fs"; export default function C(){ return <div/>; }`],
    ["this en modo sloppy", `export default function C(){ const g = (function(this: any){ return this; })(); return <div>{String(g)}</div>; }`],
    ["location.href", `export default function C(o: any){ o.location.href = "x"; return <div/>; }`],
    ["propiedad computada en desestructuración", `export default function C(){ const {["constr"+"uctor"]: F} = (()=>0) as any; return <div/>; }`],
  ];
  it.each(attacks)("bloquea: %s", (_n, src) => expect(checkComponentSource(src).length).toBeGreaterThan(0));

  it("permite nombres de propiedad inocentes (top/left)", () => {
    expect(checkComponentSource(`export default function C(){ const s = { top: 1, left: 2 }; return <div style={s}/>; }`)).toEqual([]);
  });
  it("rechaza fuentes enormes", () => expect(checkComponentSource("x".repeat(50_000)).length).toBe(1));
});

describe("checkComponentSource: nombres locales inofensivos (cónicas y similares)", () => {
  const good: [string, string][] = [
    ["variable origin", `export default function C(){ const origin = { x: 0, y: 0 }; const top = 10; const open = true; return <svg><circle cx={origin.x} cy={origin.y + top} r={open ? 3 : 4}/></svg>; }`],
    ["función replace local", `export default function C(){ const replace = (s: string) => s.length; return <div>{replace("ab")}</div>; }`],
    ["parámetro top y asignación shorthand", `export default function C(){ const f = (top: number) => ({ top }); return <div style={f(3)}/>; }`],
    ["índices aritméticos", `export default function C(){ const v = [1,2,3]; let s = 0; for (let i = 0; i < 2; i++) s += v[i + 1] - v[i]; return <div>{s}</div>; }`],
  ];
  it.each(good)("acepta: %s", (_n, src) => expect(checkComponentSource(src)).toEqual([]));

  const bad: [string, string][] = [
    ["top global", `export default function C(){ const t = top; return <div/>; }`],
    ["top.postMessage", `export default function C(){ top.postMessage("x","*"); return <div/>; }`],
    ["open global", `export default function C(){ open("x"); return <div/>; }`],
    ["new Image global", `export default function C(){ const i = new Image(); return <div/>; }`],
    ["location global", `export default function C(){ location.reload(); return <div/>; }`],
    ["origin global", `export default function C(){ return <div>{origin}</div>; }`],
    ["shorthand de global", `export default function C(){ const o = { top }; return <div/>; }`],
    ["índice con cadena", `export default function C(o: any){ return <div>{o["abc"]}</div>; }`],
    ["índice con concatenación de cadenas", `export default function C(o: any){ return <div>{o["a" + "b"]}</div>; }`],
    ["índice con llamada", `export default function C(o: any, k: any){ return <div>{o[k()]}</div>; }`],
  ];
  it.each(bad)("bloquea: %s", (_n, src) => expect(checkComponentSource(src).length).toBeGreaterThan(0));
});

describe("el ejemplo de cónica del prompt pasa el análisis", () => {
  it("acepta el componente de ejemplo", () => {
    const src = `import React from "react";
import { compileFn2, implicitContours, segmentsPath } from "@lamina/sdk";
type Props = { equation: string; xMax: number; yMax: number };
export default function Component({ props, size }: { props: Props; size: { width: number; height: number } }) {
  const f = compileFn2(props.equation);
  const origin = { x: size.width / 2, y: size.height / 2 };
  const sx = (size.width * 0.42) / props.xMax, sy = (size.height * 0.42) / props.yMax;
  const segs = implicitContours(f, { xMin: -props.xMax, xMax: props.xMax, yMin: -props.yMax, yMax: props.yMax }, 140);
  const d = segmentsPath(segs, (x, y) => [origin.x + x * sx, origin.y - y * sy]);
  return (
    <svg viewBox={"0 0 " + size.width + " " + size.height} width={size.width} height={size.height}>
      <line x1={0} y1={origin.y} x2={size.width} y2={origin.y} stroke="var(--lm-rule)" strokeWidth={2} />
      <path d={d} fill="none" stroke="var(--lm-plot1)" strokeWidth={5} />
    </svg>
  );
}`;
    expect(checkComponentSource(src)).toEqual([]);
  });
});
