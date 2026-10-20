import type { Block, ContentDraft, ContentWarning, VerificationStats } from "@lamina/contracts";
import { checkLatex } from "./latex";
import { checkExpr } from "./math";
import { latexToExpr } from "./latex2expr";
import { MathContext, verifyChain, type UnverifiableReason } from "./verify";

export type ContentValidation = { errors: string[]; warnings: ContentWarning[]; stats: VerificationStats };

const REASON_TEXT: Record<UnverifiableReason, string> = {
  sin_igualdad: "No es una igualdad que se pueda comparar.",
  sintaxis: "Usa notación que el verificador aún no entiende (límites, integrales, sumatorias…).",
  dimensiones: "No se pueden determinar las dimensiones de las matrices.",
  muestreo: "No hubo suficientes valores de prueba válidos.",
  ecuacion: "Parece una ecuación por resolver, no una identidad.",
};
const clip = (t: string, n: number) => (t.length > n ? `${t.slice(0, n - 1)}…` : t);

/** Elimina referencias a fuentes inexistentes (la IA a veces inventa ids). */
export function sanitizeSourceRefs(draft: ContentDraft, validChunkIds: Set<string>): ContentDraft {
  const d = structuredClone(draft);
  for (const s of d.sections) for (const h of s.slidesHint) for (const b of h.blocks) b.sourceRefs = b.sourceRefs.filter((r) => validChunkIds.has(r));
  return d;
}

function latexOf(b: Block): { where: string; latex: string }[] {
  switch (b.type) {
    case "formula": return [{ where: "latex", latex: b.latex }];
    case "derivation": return b.steps.map((s, i) => ({ where: `paso ${i + 1}`, latex: s.latex }));
    case "example": return b.steps.flatMap((s, i) => (s.latex ? [{ where: `paso ${i + 1}`, latex: s.latex }] : []));
    default: return [];
  }
}

/**
 * Errores = fuerzan reparación; warnings = visibles al docente. `prior`: avisos de la versión que se está editando; un paso dudoso
 * que el docente ya aprobó (mismo bloque, tipo y LaTeX) conserva su aprobación.
 */
export function validateContent(draft: ContentDraft, prior: ContentWarning[] = []): ContentValidation {
  const errors: string[] = [];
  const warnings: ContentValidation["warnings"] = [];
  const stats: VerificationStats = { verified: 0, approved: 0, review: 0 };
  // En un tema de álgebra lineal las mayúsculas (A, B…) son matrices; en otros (física: R, V, I) son escalares.
  const matrixCaps = /matri|lineal|vector|determinante|autovalor|eigen|transformaci/i.test(`${draft.meta.topic} ${draft.meta.objective}`);
  const approved = new Set(prior.filter((w) => w.status === "approved" && w.kind && w.latex).map((w) => `${w.blockId}|${w.kind}|${w.latex}`));
  const flag = (blockId: string, kind: "mismatch" | "unverifiable", latex: string, message: string, reason?: UnverifiableReason) => {
    const ok = approved.has(`${blockId}|${kind}|${clip(latex, 600)}`);
    warnings.push({ blockId, message: clip(message, 400), kind, latex: clip(latex, 600), ...(reason ? { reason } : {}), status: ok ? "approved" : "pending" });
    if (ok) stats.approved++; else stats.review++;
  };
  const ids = new Set<string>();
  const dup = (id: string) => { if (ids.has(id)) errors.push(`id repetido: ${id}`); ids.add(id); };
  for (const s of draft.sections) {
    dup(s.id);
    for (const h of s.slidesHint) {
      dup(h.id);
      // Las definiciones f(x)=… son locales a cada diapositiva: no se arrastran entre ejemplos.
      const ctx = new MathContext();
      ctx.matrixCaps = matrixCaps;
      for (const b of h.blocks) {
        dup(b.id);
        for (const { where, latex } of latexOf(b)) {
          const err = checkLatex(latex);
          if (err) errors.push(`bloque ${b.id} (${where}): LaTeX inválido: ${err}`);
        }
        if (b.type === "graphSpec") {
          if (!(b.domain.xMin < b.domain.xMax)) errors.push(`bloque ${b.id}: domain.xMin debe ser menor que xMax`);
          if (b.yDomain && !(b.yDomain.yMin < b.yDomain.yMax)) errors.push(`bloque ${b.id}: yDomain.yMin debe ser menor que yMax`);
          b.functions.forEach((f, i) => {
            const e = checkExpr(f.expr);
            if (e) errors.push(`bloque ${b.id}: functions[${i}].expr «${f.expr}» no es una expresión válida en x (${e})`);
          });
          b.tangents.forEach((t) => { if (t.fnIndex >= b.functions.length) errors.push(`bloque ${b.id}: tangente con fnIndex fuera de rango`); });
        }
        if (b.type === "table") {
          b.rows.forEach((r, i) => { if (r.length !== b.headers.length) errors.push(`bloque ${b.id}: la fila ${i + 1} tiene ${r.length} celdas y hay ${b.headers.length} encabezados`); });
        }
        if (b.type === "example") {
          for (const m of b.problem.matchAll(/\$([a-zA-Z])\(x\)\s*=\s*([^$]+)\$/g)) {
            const e = latexToExpr(m[2]!);
            if (e) ctx.defs.set(m[1]!, e);
          }
        }
        // Verificación matemática determinista: un resultado por paso (fórmula, paso de derivación o de ejemplo)
        if (b.type === "formula" || b.type === "derivation" || b.type === "example") {
          let last: string | null = null;
          for (const { latex } of latexOf(b)) {
            if (checkLatex(latex)) continue;
            const r = verifyChain(latex, ctx, last);
            last = r.last;
            if (!r.checks.length) continue; // definición: no afirma nada comprobable
            const mism = r.checks.find((c) => c.status === "mismatch");
            if (mism) { flag(b.id, "mismatch", latex, `Posible error matemático: ${mism.message}`); continue; }
            const unv = r.checks.find((c) => c.status === "unverifiable");
            if (!unv) { stats.verified++; continue; }
            flag(b.id, "unverifiable", latex, `No se pudo verificar automáticamente: «${clip(latex, 100)}». ${REASON_TEXT[unv.reason ?? "muestreo"]}`, unv.reason ?? "muestreo");
          }
        }
      }
    }
  }
  return { errors, warnings, stats };
}

/** Aplica los warnings al borrador (reemplaza los previos). */
export function withWarnings(draft: ContentDraft, v: ContentValidation): ContentDraft {
  return { ...draft, warnings: v.warnings, verification: v.stats };
}
