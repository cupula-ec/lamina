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
  ];
  it.each(attacks)("bloquea: %s", (_n, src) => expect(checkComponentSource(src).length).toBeGreaterThan(0));

  it("permite nombres de propiedad inocentes (top/left)", () => {
    expect(checkComponentSource(`export default function C(){ const s = { top: 1, left: 2 }; return <div style={s}/>; }`)).toEqual([]);
  });
  it("rechaza fuentes enormes", () => expect(checkComponentSource("x".repeat(50_000)).length).toBe(1));
});
