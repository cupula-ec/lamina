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

type Node = (x: number, y: number) => number;

function compile(expr: string, vars: Record<string, 0 | 1>): Node {
  if (typeof expr !== "string" || expr.length > 300) throw new Error("expresión inválida");
  const toks = tokenize(expr);
  let p = 0;
  const peek = () => toks[p];
  const isOp = (v: string) => { const t = peek(); return t?.t === "op" && t.v === v; };
  const eat = (v: string) => { if (!isOp(v)) throw new Error(`se esperaba "${v}"`); p++; };

  function parseExpr(): Node {
    let l = parseTerm();
    while (isOp("+") || isOp("-")) { const op = (peek() as { v: string }).v; p++; const r = parseTerm(), a = l; l = op === "+" ? (x, y) => a(x, y) + r(x, y) : (x, y) => a(x, y) - r(x, y); }
    return l;
  }
  function startsPrimary() { const t = peek(); return !!t && (t.t === "num" || t.t === "id" || (t.t === "op" && t.v === "(")); }
  function parseTerm(): Node {
    let l = parseUnary();
    for (;;) {
      if (isOp("*") || isOp("/") || isOp("%")) { const op = (peek() as { v: string }).v; p++; const r = parseUnary(), a = l; l = op === "*" ? (x, y) => a(x, y) * r(x, y) : op === "/" ? (x, y) => a(x, y) / r(x, y) : (x, y) => a(x, y) % r(x, y); }
      else if (startsPrimary()) { const r = parseUnary(), a = l; l = (x, y) => a(x, y) * r(x, y); } // multiplicación implícita: 2x, 2(x+1)
      else return l;
    }
  }
  function parseUnary(): Node {
    if (isOp("-")) { p++; const a = parseUnary(); return (x, y) => -a(x, y); }
    if (isOp("+")) { p++; return parseUnary(); }
    return parsePow();
  }
  function parsePow(): Node {
    const base = parsePrimary();
    if (isOp("^")) { p++; const e = parseUnary(), b = base; return (x, y) => Math.pow(b(x, y), e(x, y)); }
    return base;
  }
  function parsePrimary(): Node {
    const t = peek();
    if (!t) throw new Error("expresión incompleta");
    if (t.t === "num") { p++; const v = t.v; return () => v; }
    if (t.t === "op" && t.v === "(") { p++; const e = parseExpr(); eat(")"); return e; }
    if (t.t === "id") {
      p++;
      if (Object.hasOwn(vars, t.v)) return vars[t.v] === 0 ? (x) => x : (_x, y) => y;
      if (t.v === "pi") return () => Math.PI;
      if (t.v === "e") return () => Math.E;
      const f1 = Object.hasOwn(F1, t.v) ? F1[t.v] : undefined, f2 = Object.hasOwn(F2, t.v) ? F2[t.v] : undefined;
      if (f1 || f2) {
        eat("(");
        const a = parseExpr();
        if (f2) { eat(","); const b = parseExpr(); eat(")"); return (x, y) => f2(a(x, y), b(x, y)); }
        eat(")");
        return (x, y) => f1!(a(x, y));
      }
      throw new Error(`identificador no permitido: ${t.v}`);
    }
    throw new Error("expresión inválida");
  }
  const root = parseExpr();
  if (p < toks.length) throw new Error("sobran símbolos en la expresión");
  return root;
}

/** y = f(x) (también acepta t como variable). */
export function compileFn(expr: string): (x: number) => number {
  const f = compile(expr, { x: 0, t: 0 });
  return (x: number) => f(x, 0);
}

/** f(x, y) para curvas implícitas (elipse, hipérbola…). */
export function compileFn2(expr: string): (x: number, y: number) => number {
  return compile(expr, { x: 0, y: 1 });
}

/** r(θ) para curvas polares: la variable puede llamarse t, theta o th. */
export function compilePolar(expr: string): (theta: number) => number {
  const f = compile(expr, { t: 0, theta: 0, th: 0 });
  return (t: number) => f(t, 0);
}


export type Bounds = { xMin: number; xMax: number; yMin: number; yMax: number };
export type Pt = [number, number];
export type Seg = [number, number, number, number];

/** Contorno f(x, y) = 0 por marching squares: devuelve segmentos [x1, y1, x2, y2] en coordenadas del dominio. */
export function implicitContours(f: (x: number, y: number) => number, b: Bounds, res = 80): Seg[] {
  const n = Math.max(8, Math.min(240, Math.floor(res)));
  const dx = (b.xMax - b.xMin) / n, dy = (b.yMax - b.yMin) / n;
  const v: number[][] = [];
  for (let j = 0; j <= n; j++) { const row: number[] = []; for (let i = 0; i <= n; i++) row.push(f(b.xMin + i * dx, b.yMin + j * dy)); v.push(row); }
  const lerp = (a: number, c: number) => (a === c ? 0.5 : a / (a - c));
  const out: Seg[] = [];
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const a = v[j]![i]!, bb = v[j]![i + 1]!, c = v[j + 1]![i + 1]!, d = v[j + 1]![i]!;
    if (![a, bb, c, d].every(Number.isFinite)) continue;
    const idx = (a > 0 ? 8 : 0) | (bb > 0 ? 4 : 0) | (c > 0 ? 2 : 0) | (d > 0 ? 1 : 0);
    if (idx === 0 || idx === 15) continue;
    const x0 = b.xMin + i * dx, y0 = b.yMin + j * dy;
    const top: Pt = [x0 + lerp(a, bb) * dx, y0], right: Pt = [x0 + dx, y0 + lerp(bb, c) * dy], bottom: Pt = [x0 + lerp(d, c) * dx, y0 + dy], left: Pt = [x0, y0 + lerp(a, d) * dy];
    const seg = (p: Pt, q: Pt) => out.push([p[0], p[1], q[0], q[1]]);
    switch (idx) {
      case 1: case 14: seg(left, bottom); break;
      case 2: case 13: seg(bottom, right); break;
      case 3: case 12: seg(left, right); break;
      case 4: case 11: seg(top, right); break;
      case 5: seg(left, top); seg(bottom, right); break;
      case 6: case 9: seg(top, bottom); break;
      case 7: case 8: seg(left, top); break;
      case 10: seg(top, right); seg(left, bottom); break;
    }
  }
  return out;
}

/** (x(t), y(t)) para t en [t0, t1]; descarta puntos no finitos. */
export function parametric(fx: (t: number) => number, fy: (t: number) => number, range: [number, number], n = 240): Pt[] {
  const pts: Pt[] = [];
  const m = Math.max(2, Math.min(2000, Math.floor(n)));
  for (let i = 0; i <= m; i++) { const t = range[0] + ((range[1] - range[0]) * i) / m; const x = fx(t), y = fy(t); if (Number.isFinite(x) && Number.isFinite(y)) pts.push([x, y]); }
  return pts;
}

/** Curva polar r(θ) → puntos cartesianos. */
export function polar(fr: (theta: number) => number, range: [number, number], n = 360): Pt[] {
  return parametric((t) => fr(t) * Math.cos(t), (t) => fr(t) * Math.sin(t), range, n);
}

const f2 = (v: number) => (Math.round(v * 100) / 100).toString();
/** Polilínea SVG a partir de puntos ya en píxeles. */
export function linePath(pts: Pt[]): string {
  return pts.filter((p) => Number.isFinite(p[0]) && Number.isFinite(p[1])).map((p, i) => `${i ? "L" : "M"}${f2(p[0])} ${f2(p[1])}`).join(" ");
}
/** Segmentos [x1, y1, x2, y2] → trazo SVG (aplica `map` a cada punto para pasar del dominio a píxeles). */
export function segmentsPath(segs: Seg[], map: (x: number, y: number) => Pt = (x, y) => [x, y]): string {
  return segs.map((s) => { const a = map(s[0], s[1]), c = map(s[2], s[3]); return `M${f2(a[0])} ${f2(a[1])} L${f2(c[0])} ${f2(c[1])}`; }).join(" ");
}
/** Elipse como trazo SVG (semiejes a y b, giro opcional en radianes), en las mismas unidades que cx, cy. */
export function ellipsePath(cx: number, cy: number, a: number, b: number, rot = 0): string {
  const pts: Pt[] = [];
  for (let i = 0; i <= 96; i++) { const t = (2 * Math.PI * i) / 96; const x = a * Math.cos(t), y = b * Math.sin(t); pts.push([cx + x * Math.cos(rot) - y * Math.sin(rot), cy + x * Math.sin(rot) + y * Math.cos(rot)]); }
  return linePath(pts) + " Z";
}
/** Parábola y = x²/(4p) (vertical) o x = y²/(4p) (horizontal) con vértice (vx, vy); `extent` = alcance en el eje de la abertura. */
export function parabolaPath(vx: number, vy: number, p: number, extent: number, orientation: "vertical" | "horizontal" = "vertical"): string {
  if (!p || !Number.isFinite(p)) return "";
  const pts: Pt[] = [];
  const s = Math.sqrt(Math.abs(4 * p * extent)) || 1;
  for (let i = -48; i <= 48; i++) { const u = (s * i) / 48; const w = (u * u) / (4 * p); pts.push(orientation === "vertical" ? [vx + u, vy + w] : [vx + w, vy + u]); }
  return linePath(pts);
}
/** Las dos ramas de una hipérbola x²/a² − y²/b² = 1 (horizontal) o y²/a² − x²/b² = 1 (vertical) centrada en (cx, cy). */
export function hyperbolaPaths(cx: number, cy: number, a: number, b: number, extent: number, orientation: "horizontal" | "vertical" = "horizontal"): [string, string] {
  if (!a || !b) return ["", ""];
  const mk = (sign: 1 | -1) => {
    const pts: Pt[] = [];
    for (let i = -48; i <= 48; i++) { const t = (extent * i) / 48; const w = sign * a * Math.sqrt(1 + (t * t) / (b * b)); pts.push(orientation === "horizontal" ? [cx + w, cy + t] : [cx + t, cy + w]); }
    return linePath(pts);
  };
  return [mk(1), mk(-1)];
}
/** Flecha de (x1, y1) a (x2, y2) como trazo SVG (cuerpo + cabeza de `head` unidades). */
export function arrowPath(x1: number, y1: number, x2: number, y2: number, head = 10): string {
  const ang = Math.atan2(y2 - y1, x2 - x1), k = Math.PI / 7;
  const h = (da: number): Pt => [x2 - head * Math.cos(ang + da), y2 - head * Math.sin(ang + da)];
  const a = h(k), c = h(-k);
  return `M${f2(x1)} ${f2(y1)} L${f2(x2)} ${f2(y2)} M${f2(a[0])} ${f2(a[1])} L${f2(x2)} ${f2(y2)} L${f2(c[0])} ${f2(c[1])}`;
}
