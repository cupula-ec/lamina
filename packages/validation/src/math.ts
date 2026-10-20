import { create, all, type MathNode } from "mathjs";

/** mathjs aislado: se compila únicamente AST que pasa la lista blanca; nunca se llama a evaluate sobre texto crudo. */
const math = create(all as any, {});
const FUNCS = new Set([
  "sin", "cos", "tan", "asin", "acos", "atan", "sinh", "cosh", "tanh", "exp", "log", "sqrt", "abs", "cbrt", "sec", "csc", "cot",
  "floor", "ceil", "sign", "log10", "log2", "min", "max", "pow", "nthRoot", "atan2",
]);
const CONSTS = new Set(["pi", "e", "x", "t", "n"]);
const OPS = new Set(["add", "subtract", "multiply", "divide", "pow", "mod", "unaryMinus", "unaryPlus"]);
/** Funciones de álgebra lineal: solo se admiten en modo matricial (el verificador de igualdades, nunca en gráficas). */
const MATRIX_FUNCS = new Set(["det", "inv", "transpose", "trace"]);
/** Marca que latex2expr emite para `A^T`; se sustituye por `transpose(A)` tras el parseo. */
const TRANSPOSE_MARK = "__T";
const IDENT = /^[A-Za-z][A-Za-z0-9_]*$/;

export type SafeOpts = { matrix?: boolean };

/** `vars`: conjunto permitido de símbolos, o "any" (cualquier identificador simple; solo para expresiones producidas por latex2expr). */
export function assertSafeAst(node: MathNode, vars: Set<string> | "any" = new Set(["x"]), opts: SafeOpts = {}): void {
  node.traverse((n: any) => {
    switch (n.type) {
      case "ConstantNode":
        if (typeof n.value !== "number") throw new Error("constante no numérica");
        break;
      case "SymbolNode":
        if (vars === "any" ? !IDENT.test(n.name) && !CONSTS.has(n.name) : !vars.has(n.name) && !CONSTS.has(n.name) && !FUNCS.has(n.name) && !(opts.matrix && MATRIX_FUNCS.has(n.name))) throw new Error(`símbolo no permitido: ${n.name}`);
        break;
      case "OperatorNode":
        if (!OPS.has(n.fn)) throw new Error(`operador no permitido: ${n.op}`);
        break;
      case "FunctionNode":
        if (!(n.fn?.type === "SymbolNode" && (FUNCS.has(n.fn.name) || (opts.matrix && MATRIX_FUNCS.has(n.fn.name))))) throw new Error("función no permitida");
        break;
      case "ArrayNode":
        if (!opts.matrix) throw new Error(`nodo no permitido: ${n.type}`);
        break;
      case "ParenthesisNode":
        break;
      default:
        throw new Error(`nodo no permitido: ${n.type}`);
    }
  });
}

export type Fn = (x: number) => number;

export function parseSafe(expr: string, vars: Set<string> | "any" = new Set(["x"]), opts: SafeOpts = {}): MathNode {
  if (expr.length > (opts.matrix ? 1500 : 300)) throw new Error("expresión demasiado larga");
  const normalized = expr.replace(/\bln\b/g, "log").replace(/\*\*/g, "^");
  let node = math.parse(normalized);
  if (opts.matrix) {
    // transform no desciende a lo que sustituye: se repite hasta que no queden marcas (A^T^T, (A^T)^T…).
    for (let k = 0; k < 6 && normalized.includes(TRANSPOSE_MARK); k++) {
      node = node.transform((n: any) =>
        n.type === "OperatorNode" && n.fn === "pow" && n.args[1]?.type === "SymbolNode" && n.args[1].name === TRANSPOSE_MARK
          ? new math.FunctionNode(new math.SymbolNode("transpose"), [n.args[0]])
          : n);
    }
  }
  assertSafeAst(node, vars, opts);
  return node;
}

export function compileFn(expr: string): Fn {
  const node = parseSafe(expr);
  const code = node.compile();
  return (x: number) => {
    const v = code.evaluate({ x });
    if (typeof v !== "number") throw new Error("la expresión no devuelve un número");
    return v;
  };
}

/** Comprueba que la expresión sea evaluable: devuelve null si ok o el error. */
export function checkExpr(expr: string): string | null {
  try {
    const f = compileFn(expr);
    f(1);
    return null;
  } catch (e) {
    return (e as Error).message.slice(0, 160);
  }
}

export function derivativeExpr(expr: string): string {
  const node = parseSafe(expr);
  const d = math.derivative(node, "x");
  assertSafeAst(d);
  return d.toString();
}

const SAMPLES = [0.37, 0.91, 1.43, 2.07, 2.89, 0.61, 1.77, 3.3, -0.43, -1.21, -2.6];
export type Equivalence = "equal" | "different" | "unknown";

/** Equivalencia numérica por muestreo (≥3 puntos válidos). */
export function numericEquivalent(a: string, b: string): Equivalence {
  let fa: Fn, fb: Fn;
  try {
    fa = compileFn(a);
    fb = compileFn(b);
  } catch {
    return "unknown";
  }
  let valid = 0;
  for (const x of SAMPLES) {
    let va: number, vb: number;
    try {
      va = fa(x);
      vb = fb(x);
    } catch {
      continue;
    }
    if (!Number.isFinite(va) || !Number.isFinite(vb)) continue;
    valid++;
    const tol = 1e-6 * Math.max(1, Math.abs(va), Math.abs(vb));
    if (Math.abs(va - vb) > tol) return "different";
  }
  return valid >= 3 ? "equal" : "unknown";
}

/* ───────── Verificación con varias variables y matrices ───────── */
export type SymKind = "scalar" | "matrix" | "vector";
/** Convención de latex2expr: mayúscula = matriz (I identidad, O nula), `vec_u` = vector columna, minúscula = escalar. */
export function symbolKind(name: string, matrixCaps = true): SymKind {
  if (name.startsWith("vec_")) return "vector";
  return matrixCaps && /^[A-Z]/.test(name) ? "matrix" : "scalar";
}
/** Señales explícitas de que la expresión es matricial (aunque el tema no lo sea). */
const MATRIX_SIGNAL = /\[|transpose|\bdet\b|\btrace\b|vec_/;

/** Símbolos libres de una expresión (sin funciones ni constantes). */
export function freeSymbols(expr: string): Set<string> {
  const out = new Set<string>();
  const node = parseSafe(expr, "any", { matrix: true });
  node.traverse((n: any, path: string, parent: any) => {
    if (n.type !== "SymbolNode") return;
    if (parent?.type === "FunctionNode" && path === "fn") return;
    if (n.name === "pi" || n.name === "e" || FUNCS.has(n.name) || MATRIX_FUNCS.has(n.name)) return;
    out.add(n.name);
  });
  return out;
}

/** Formas (filas×columnas) de los literales matriciales; null si alguno no es rectangular. */
function literalShapes(expr: string): [number, number][] | null {
  const shapes: [number, number][] = [];
  let ok = true;
  const node = parseSafe(expr, "any", { matrix: true });
  const walk = (n: any, inside: boolean) => {
    if (n.type === "ArrayNode" && !inside) {
      const rows = n.items.length, cols = n.items[0]?.type === "ArrayNode" ? n.items[0].items.length : -1;
      if (cols < 1 || n.items.some((r: any) => r.type !== "ArrayNode" || r.items.length !== cols)) ok = false;
      else shapes.push([rows, cols]);
      return;
    }
    n.forEach((c: any) => walk(c, inside));
  };
  walk(node, false);
  return ok ? shapes : null;
}

function rng(seed: number) {
  return () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

const toNumbers = (v: any): number | number[][] | null => {
  const a = v && typeof v === "object" && typeof v.toArray === "function" ? v.toArray() : v;
  if (typeof a === "number") return Number.isFinite(a) ? a : null;
  if (Array.isArray(a)) {
    const rows = a.map((r: any) => (Array.isArray(r) ? r : [r]));
    return rows.every((r: any[]) => r.every((x) => typeof x === "number" && Number.isFinite(x))) ? rows : null;
  }
  return null; // complejos, funciones, etc.
};

function sameValue(a: number | number[][], b: number | number[][]): boolean | null {
  if (typeof a === "number" && typeof b === "number") return Math.abs(a - b) <= 1e-6 * Math.max(1, Math.abs(a), Math.abs(b));
  if (typeof a === "number" || typeof b === "number") return null; // escalar frente a matriz: no comparable
  if (a.length !== b.length || a[0]!.length !== b[0]!.length) return null;
  for (let i = 0; i < a.length; i++) for (let j = 0; j < a[0]!.length; j++) {
    const x = a[i]![j]!, y = b[i]![j]!;
    if (Math.abs(x - y) > 1e-6 * Math.max(1, Math.abs(x), Math.abs(y))) return false;
  }
  return true;
}

export type EquivalenceEx = { result: Equivalence; reason?: "dimensiones" | "sintaxis" | "muestreo" };

/**
 * Equivalencia numérica con varias variables escalares y matrices (símbolos en mayúscula).
 * Las matrices simbólicas se muestrean con enteros aleatorios; si no hay literales que fijen la dimensión se prueba en 2×2 y 3×3
 * y solo se concluye si ambas coinciden (una igualdad que depende de la dimensión queda «no verificable», no «incorrecta»).
 */
export function numericEquivalentEx(a: string, b: string, opts: { matrixCaps?: boolean } = {}): EquivalenceEx {
  const caps = !!opts.matrixCaps || MATRIX_SIGNAL.test(a + b);
  let na: MathNode, nb: MathNode, syms: Map<string, SymKind>, shapes: [number, number][];
  try {
    na = parseSafe(a, "any", { matrix: true });
    nb = parseSafe(b, "any", { matrix: true });
    syms = new Map([...freeSymbols(a), ...freeSymbols(b)].map((s) => [s, symbolKind(s, caps)]));
    const sa = literalShapes(a), sb = literalShapes(b);
    if (!sa || !sb) return { result: "unknown", reason: "dimensiones" };
    shapes = [...sa, ...sb];
  } catch { return { result: "unknown", reason: "sintaxis" }; }
  const hasMat = [...syms.values()].some((k) => k !== "scalar");
  let sizes: number[];
  if (shapes.length) {
    const k = shapes[0]![0];
    if (shapes.some(([r, c]) => r !== k || c !== k)) { if (hasMat) return { result: "unknown", reason: "dimensiones" }; sizes = [3]; }
    else sizes = [k];
  } else sizes = hasMat ? [2, 3] : [3];
  const ca = na.compile(), cb = nb.compile();
  const rand = rng(20261020);
  const perSize: Equivalence[] = [];
  for (const n of sizes) {
    let valid = 0, diff = false;
    const tries = syms.size ? 8 : 1;
    for (let t = 0; t < tries; t++) {
      const scope: Record<string, unknown> = {};
      for (const [name, kind] of syms) {
        if (caps && name === "I") scope[name] = math.identity(n);
        else if (caps && name === "O") scope[name] = math.zeros(n, n);
        else if (kind === "scalar") scope[name] = (Math.floor(rand() * 9) - 4 || 5) / 2 + 0.25;
        else scope[name] = math.matrix(Array.from({ length: n }, () => Array.from({ length: kind === "vector" ? 1 : n }, () => Math.floor(rand() * 7) - 3)));
      }
      let va: number | number[][] | null, vb: number | number[][] | null;
      try { va = toNumbers(ca.evaluate({ ...scope })); vb = toNumbers(cb.evaluate({ ...scope })); } catch { continue; }
      if (va === null || vb === null) continue;
      const same = sameValue(va, vb);
      if (same === null) continue;
      valid++;
      if (!same) { diff = true; break; }
    }
    perSize.push(diff ? "different" : valid >= Math.min(3, syms.size ? 3 : 1) ? "equal" : "unknown");
  }
  if (perSize.every((r) => r === "equal")) return { result: "equal" };
  if (perSize.every((r) => r === "different")) return { result: "different" };
  return { result: "unknown", reason: perSize.includes("unknown") ? "muestreo" : "dimensiones" };
}
