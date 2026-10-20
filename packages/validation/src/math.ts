import { create, all, type MathNode } from "mathjs";

/** mathjs aislado: se compila únicamente AST que pasa la lista blanca; nunca se llama a evaluate sobre texto crudo. */
const math = create(all as any, {});
const FUNCS = new Set([
  "sin", "cos", "tan", "asin", "acos", "atan", "sinh", "cosh", "tanh", "exp", "log", "sqrt", "abs", "cbrt", "sec", "csc", "cot",
  "floor", "ceil", "sign", "log10", "log2", "min", "max", "pow", "nthRoot", "atan2",
]);
const CONSTS = new Set(["pi", "e", "x", "t", "n"]);
const OPS = new Set(["add", "subtract", "multiply", "divide", "pow", "mod", "unaryMinus", "unaryPlus"]);

export function assertSafeAst(node: MathNode, vars: Set<string> = new Set(["x"])): void {
  node.traverse((n: any) => {
    switch (n.type) {
      case "ConstantNode":
        if (typeof n.value !== "number") throw new Error("constante no numérica");
        break;
      case "SymbolNode":
        if (!vars.has(n.name) && !CONSTS.has(n.name) && !FUNCS.has(n.name)) throw new Error(`símbolo no permitido: ${n.name}`);
        break;
      case "OperatorNode":
        if (!OPS.has(n.fn)) throw new Error(`operador no permitido: ${n.op}`);
        break;
      case "FunctionNode":
        if (!(n.fn?.type === "SymbolNode" && FUNCS.has(n.fn.name))) throw new Error("función no permitida");
        break;
      case "ParenthesisNode":
        break;
      default:
        throw new Error(`nodo no permitido: ${n.type}`);
    }
  });
}

export type Fn = (x: number) => number;

export function parseSafe(expr: string, vars: Set<string> = new Set(["x"])): MathNode {
  if (expr.length > 300) throw new Error("expresión demasiado larga");
  const normalized = expr.replace(/\bln\b/g, "log").replace(/\*\*/g, "^");
  const node = math.parse(normalized);
  assertSafeAst(node, vars);
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

const SAMPLES = [0.37, 0.91, 1.43, 2.07, 2.89, 0.61, 1.77, 3.3];
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
