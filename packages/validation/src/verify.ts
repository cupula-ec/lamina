import { derivativeExpr, numericEquivalent } from "./math";
import { latexToExpr, splitTopLevelEquals } from "./latex2expr";

export type MathCheck = { status: "verified" | "mismatch" | "unverifiable"; message?: string };

export class MathContext {
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
  return latexToExpr(side);
}

/**
 * Verifica una cadena de igualdades `A = B = C`. `prevRhs` permite continuar desde el paso anterior ("= …").
 * Devuelve resultados por eslabón y la última expresión (para encadenar pasos).
 */
export function verifyChain(latex: string, ctx: MathContext, prevRhs?: string | null): { checks: MathCheck[]; last: string | null } {
  let parts = splitTopLevelEquals(latex);
  const checks: MathCheck[] = [];
  let startsWithEq = false;
  if (parts[0] === "" && parts.length > 1) { parts = parts.slice(1); startsWithEq = true; }
  if (parts.length < 2 && !(startsWithEq && parts.length >= 1)) return { checks: [{ status: "unverifiable" }], last: null };

  let prev: string | null | undefined = startsWithEq ? prevRhs ?? null : undefined;
  let prevRaw: string | undefined;
  let first = true;
  for (const p of parts) {
    const expr = sideToExpr(p, ctx);
    if (prev !== undefined) {
      if (prev == null || expr == null) checks.push({ status: "unverifiable" });
      else {
        const r = numericEquivalent(prev, expr);
        checks.push(r === "equal" ? { status: "verified" } : r === "different" ? { status: "mismatch", message: `no coincide numéricamente: «${prevRaw ?? prev}» ≠ «${p}»` } : { status: "unverifiable" });
      }
    }
    // Definición f(x) = expr
    if (first && !startsWithEq) {
      const dm = p.trim().match(/^([a-zA-Z])\(x\)$/);
      if (dm && parts[1]) {
        const rhs = latexToExpr(parts[1]);
        if (rhs) ctx.defs.set(dm[1]!, rhs);
      }
    }
    first = false;
    prev = expr;
    prevRaw = p;
  }
  return { checks, last: prev ?? null };
}
