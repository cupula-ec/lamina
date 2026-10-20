/**
 * @lamina/sdk — API restringida para componentes generados. Es lo ÚNICO (junto con "react") que pueden importar.
 * Todo corre en un iframe sandbox (origen opaco, CSP sin red).
 */
import { createElement } from "react";
import katex from "katex";
export { scaleLinear } from "d3-scale";
export { line, area } from "d3-shape";

// ───── compileFn: evaluador de expresiones en x SIN eval ni mathjs (parser de precedencia con lista blanca) ─────
const F1: Record<string, (a: number) => number> = {
  sin: Math.sin, cos: Math.cos, tan: Math.tan, asin: Math.asin, acos: Math.acos, atan: Math.atan, sinh: Math.sinh, cosh: Math.cosh, tanh: Math.tanh,
  exp: Math.exp, log: Math.log, ln: Math.log, sqrt: Math.sqrt, abs: Math.abs, cbrt: Math.cbrt, sec: (a) => 1 / Math.cos(a), csc: (a) => 1 / Math.sin(a), cot: (a) => 1 / Math.tan(a),
  floor: Math.floor, ceil: Math.ceil, sign: Math.sign, log10: Math.log10, log2: Math.log2,
};
const F2: Record<string, (a: number, b: number) => number> = { pow: Math.pow, min: Math.min, max: Math.max, atan2: Math.atan2 };
type Tok = { t: "num"; v: number } | { t: "id"; v: string } | { t: "op"; v: string };

function tokenize(src: string): Tok[] {
  const out: Tok[] = [];
  const re = /\s*(?:(\d+\.?\d*(?:[eE][+-]?\d+)?|\.\d+)|([A-Za-z_]\w*)|(\*\*|[-+*/^%(),]))/y;
  let i = 0;
  while (i < src.length) {
    if (/^\s+$/.test(src.slice(i))) break;
    re.lastIndex = i;
    const m = re.exec(src);
    if (!m) throw new Error("carácter no permitido en la expresión");
    if (m[1] !== undefined) out.push({ t: "num", v: Number(m[1]) });
    else if (m[2] !== undefined) out.push({ t: "id", v: m[2] });
    else out.push({ t: "op", v: m[3] === "**" ? "^" : m[3]! });
    i = re.lastIndex;
  }
  return out;
}

type Node = (x: number) => number;

export function compileFn(expr: string): (x: number) => number {
  if (typeof expr !== "string" || expr.length > 300) throw new Error("expresión inválida");
  const toks = tokenize(expr);
  let p = 0;
  const peek = () => toks[p];
  const isOp = (v: string) => { const t = peek(); return t?.t === "op" && t.v === v; };
  const eat = (v: string) => { if (!isOp(v)) throw new Error(`se esperaba "${v}"`); p++; };

  function parseExpr(): Node {
    let l = parseTerm();
    while (isOp("+") || isOp("-")) { const op = (peek() as { v: string }).v; p++; const r = parseTerm(), a = l; l = op === "+" ? (x) => a(x) + r(x) : (x) => a(x) - r(x); }
    return l;
  }
  function startsPrimary() { const t = peek(); return !!t && (t.t === "num" || t.t === "id" || (t.t === "op" && t.v === "(")); }
  function parseTerm(): Node {
    let l = parseUnary();
    for (;;) {
      if (isOp("*") || isOp("/") || isOp("%")) { const op = (peek() as { v: string }).v; p++; const r = parseUnary(), a = l; l = op === "*" ? (x) => a(x) * r(x) : op === "/" ? (x) => a(x) / r(x) : (x) => a(x) % r(x); }
      else if (startsPrimary()) { const r = parseUnary(), a = l; l = (x) => a(x) * r(x); } // multiplicación implícita: 2x, 2(x+1)
      else return l;
    }
  }
  function parseUnary(): Node {
    if (isOp("-")) { p++; const a = parseUnary(); return (x) => -a(x); }
    if (isOp("+")) { p++; return parseUnary(); }
    return parsePow();
  }
  function parsePow(): Node {
    const base = parsePrimary();
    if (isOp("^")) { p++; const e = parseUnary(), b = base; return (x) => Math.pow(b(x), e(x)); }
    return base;
  }
  function parsePrimary(): Node {
    const t = peek();
    if (!t) throw new Error("expresión incompleta");
    if (t.t === "num") { p++; const v = t.v; return () => v; }
    if (t.t === "op" && t.v === "(") { p++; const e = parseExpr(); eat(")"); return e; }
    if (t.t === "id") {
      p++;
      if (t.v === "x" || t.v === "t") return (x) => x;
      if (t.v === "pi") return () => Math.PI;
      if (t.v === "e") return () => Math.E;
      const f1 = F1[t.v], f2 = F2[t.v];
      if (f1 || f2) {
        eat("(");
        const a = parseExpr();
        if (f2) { eat(","); const b = parseExpr(); eat(")"); return (x) => f2(a(x), b(x)); }
        eat(")");
        return (x) => f1!(a(x));
      }
      throw new Error(`identificador no permitido: ${t.v}`);
    }
    throw new Error("expresión inválida");
  }
  const root = parseExpr();
  if (p < toks.length) throw new Error("sobran símbolos en la expresión");
  return (x: number) => root(x);
}

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
