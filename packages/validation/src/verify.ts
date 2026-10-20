import { derivativeExpr, freeSymbols, numericEquivalent, numericEquivalentEx, parseSafe } from "./math";
import { latexToExpr, splitTopLevelEquals } from "./latex2expr";
import { convertMath } from "./latexmath";

/** `reason` (solo si unverifiable): por qué no se pudo comprobar; la interfaz lo traduce a una explicación para el docente. */
export type UnverifiableReason = "sin_igualdad" | "sintaxis" | "dimensiones" | "muestreo" | "ecuacion";
export type MathCheck = { status: "verified" | "mismatch" | "unverifiable"; message?: string; reason?: UnverifiableReason };

const clipTxt = (t: string, n: number) => (t.length > n ? `${t.slice(0, n - 1)}…` : t);

export class MathContext {
  /** Mayúsculas = matrices (tema de álgebra lineal); si no, solo con señales explícitas (literales, ^T, det…). */
  matrixCaps = false;
  /** Definiciones f(x)=expr detectadas hasta ahora. */
  defs = new Map<string, string>();
}

/** Intenta interpretar `\frac{d}{dx}(EXPR)`, `\frac{d}{dx}EXPR`, `f'(x)` o `(EXPR)'` como expresión derivada (mathjs). */
function derivativeSide(side: string, ctx: MathContext): string | null | undefined {
  const s = side.trim();
  let m = s.match(/^\\frac\{d\}\{dx\}\s*(.+)$/s) ?? s.match(/^\\dfrac\{d\}\{dx\}\s*(.+)$/s);
  if (m) {
    let inner = m[1]!.trim();
    inner = inner.replace(/^\\left\(|^\(/, "").replace(/\\right\)$|\)$/, "");
    const e = latexToExpr(inner);
    if (!e) return null;
    try { return derivativeExpr(e); } catch { return null; }
  }
  m = s.match(/^([a-zA-Z])'\(x\)$/) ?? s.match(/^([a-zA-Z])'$/);
  if (m) {
    const def = ctx.defs.get(m[1]!);
    if (!def) return null;
    try { return derivativeExpr(def); } catch { return null; }
  }
  m = s.match(/^\\left\((.+)\\right\)'$/s) ?? s.match(/^\((.+)\)'$/s);
  if (m) {
    const e = latexToExpr(m[1]!);
    if (!e) return null;
    try { return derivativeExpr(e); } catch { return null; }
  }
  return undefined; // no es una derivada
}

/** Convierte un lado de la igualdad en expresión mathjs (resolviendo derivadas y funciones definidas). */
function sideToExpr(side: string, ctx: MathContext): string | null {
  const d = derivativeSide(side, ctx);
  if (d !== undefined) return d;
  const fm = side.trim().match(/^([a-zA-Z])\(x\)$/);
  if (fm) return ctx.defs.get(fm[1]!) ?? null;
  return convertMath(side) ?? latexToExpr(side);
}

/** Una identidad tiene las mismas variables a ambos lados; si no (`y-9=6(x-3)`, `2x+3=7`, `det(A−λI)=0`) es una ecuación o relación, no algo que deba cumplirse siempre. */
const sameVariables = (a: string, b: string): boolean => {
  try { const x = freeSymbols(a), y = freeSymbols(b); return x.size === y.size && [...x].every((v) => y.has(v)); } catch { return false; }
};
const loneSymbol = (e: string | null): string | null => (e && /^[A-Za-z][A-Za-z0-9_]*$/.test(e) && !["e", "pi"].includes(e) ? e : null);
const usesSymbol = (e: string, name: string): boolean => { try { return freeSymbols(e).has(name); } catch { return true; } };

/** Compara dos expresiones: el muestreo escalar de siempre (solo x) o el general con variables y matrices. */
function compare(a: string, b: string, ctx: MathContext): { result: "equal" | "different" | "unknown"; reason?: UnverifiableReason } {
  try {
    parseSafe(a); parseSafe(b);
    const r = numericEquivalent(a, b);
    if (r !== "unknown") return { result: r };
  } catch { /* usa matrices o más variables */ }
  return numericEquivalentEx(a, b, { matrixCaps: ctx.matrixCaps });
}

/** Divide por `\neq`/`\ne` de nivel superior (una sola aparición). */
function splitNotEqual(latex: string): [string, string] | null {
  let depth = 0;
  for (let i = 0; i < latex.length; i++) {
    const c = latex[i]!;
    if (c === "{" || c === "(" || c === "[") depth++;
    else if (c === "}" || c === ")" || c === "]") depth--;
    else if (c === "\\" && depth === 0) {
      const m = latex.slice(i).match(/^\\ne(?:q)?(?![A-Za-z])/);
      if (m) return [latex.slice(0, i).trim(), latex.slice(i + m[0].length).trim()];
    }
  }
  return null;
}

/**
 * Verifica una cadena de igualdades `A = B = C` (o `A \\neq B`). `prevRhs` permite continuar desde el paso anterior ("= …").
 * Devuelve resultados por eslabón y la última expresión (para encadenar pasos). Las definiciones (`f(x)=…`, `m = 2ab`) no son
 * comprobables ni dudosas: no generan resultado.
 */
export function verifyChain(latex: string, ctx: MathContext, prevRhs?: string | null): { checks: MathCheck[]; last: string | null } {
  const ne = splitTopLevelEquals(latex).length < 2 ? splitNotEqual(latex) : null;
  if (ne) {
    const [l, r] = ne;
    const a = sideToExpr(l, ctx), b = sideToExpr(r, ctx);
    if (!a || !b) return { checks: [{ status: "unverifiable", reason: "sintaxis" }], last: null };
    const c = compare(a, b, ctx);
    if (c.result === "different") return { checks: [{ status: "verified" }], last: null };
    if (c.result === "equal") return { checks: [{ status: "mismatch", message: `se afirma «${clipTxt(l, 80)}» ≠ «${clipTxt(r, 80)}», pero ambos lados coinciden numéricamente` }], last: null };
    return { checks: [{ status: "unverifiable", reason: c.reason ?? "muestreo" }], last: null };
  }
  let parts = splitTopLevelEquals(latex);
  const checks: MathCheck[] = [];
  let startsWithEq = false;
  if (parts[0] === "" && parts.length > 1) { parts = parts.slice(1); startsWithEq = true; }
  if (parts.length < 2 && !(startsWithEq && parts.length >= 1)) return { checks: [{ status: "unverifiable", reason: "sin_igualdad" }], last: null };

  let prev: string | null | undefined = startsWithEq ? prevRhs ?? null : undefined;
  let prevRaw: string | undefined;
  let first = true;
  let defIntro = false; // el eslabón siguiente a «f(x) =» introduce el nombre: no es una comprobación
  for (const p of parts) {
    // Definición f(x) = expr (se registra para los pasos siguientes)
    const dm = p.trim().match(/^([a-zA-Z])\(x\)$/);
    const isDef = first && !startsWithEq && !!dm && !ctx.defs.has(dm[1]!) && !!parts[1];
    const expr = sideToExpr(p, ctx);
    const skip = defIntro || (first === false && prevRaw !== undefined && isDefinitionLink(prevRaw, prev ?? null, p, expr, ctx));
    defIntro = false;
    if (prev !== undefined && !skip) {
      if (prev == null || expr == null) checks.push({ status: "unverifiable", reason: "sintaxis" });
      else {
        const r = compare(prev, expr, ctx);
        if (r.result === "equal") checks.push({ status: "verified" });
        else if (r.result === "different") {
          if (!sameVariables(prev, expr)) checks.push({ status: "unverifiable", reason: "ecuacion" });
          else checks.push({ status: "mismatch", message: `no coincide numéricamente: «${clipTxt(prevRaw ?? prev, 80)}» ≠ «${clipTxt(p, 80)}»${/[A-Z]/.test(prev + expr) ? " (si solo vale bajo ciertas condiciones, como matrices diagonales o invertibles, puedes aprobarlo)" : ""}` });
        } else checks.push({ status: "unverifiable", reason: r.reason ?? "muestreo" });
      }
    }
    if (isDef) {
      const rhs = latexToExpr(parts[1]!);
      if (rhs) ctx.defs.set(dm![1]!, rhs);
    }
    defIntro = isDef;
    first = false;
    prev = expr;
    prevRaw = p;
  }
  return { checks, last: prev ?? null };
}

/** `f(x) = …` aún sin definir, o `m = 2ab` (símbolo suelto que no aparece al otro lado): introduce un nombre, no afirma una igualdad. */
function isDefinitionLink(leftRaw: string, left: string | null, rightRaw: string, right: string | null, ctx: MathContext): boolean {
  if (/^[a-zA-Z]\(x\)$/.test(leftRaw.trim()) && !ctx.defs.has(leftRaw.trim()[0]!)) return true;
  const l = loneSymbol(left), r = loneSymbol(right);
  if (l && right && !usesSymbol(right, l)) return true;
  if (r && left && !usesSymbol(left, r)) return true;
  void rightRaw;
  return false;
}
