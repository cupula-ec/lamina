import type { Block, ContentDraft } from "@lamina/contracts";
import { checkLatex } from "./latex";
import { checkExpr } from "./math";
import { MathContext, verifyChain } from "./verify";

export type ContentValidation = { errors: string[]; warnings: { blockId?: string; message: string }[] };

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

/** Errores = fuerzan reparación; warnings = visibles al docente. */
export function validateContent(draft: ContentDraft): ContentValidation {
  const errors: string[] = [];
  const warnings: ContentValidation["warnings"] = [];
  const ids = new Set<string>();
  const dup = (id: string) => { if (ids.has(id)) errors.push(`id repetido: ${id}`); ids.add(id); };
  const ctx = new MathContext();

  for (const s of draft.sections) {
    dup(s.id);
    for (const h of s.slidesHint) {
      dup(h.id);
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
        // Verificación matemática determinista
        if (b.type === "formula" || b.type === "derivation" || b.type === "example") {
          let last: string | null = null;
          let any = false, bad = false, unv = 0, total = 0;
          for (const { latex } of latexOf(b)) {
            if (checkLatex(latex)) continue;
            const r = verifyChain(latex, ctx, last);
            last = r.last;
            for (const c of r.checks) {
              total++;
              if (c.status === "mismatch") { bad = true; warnings.push({ blockId: b.id, message: `Posible error matemático: ${c.message}` }); }
              else if (c.status === "verified") any = true;
              else unv++;
            }
          }
          if (!bad && !any && total > 0) warnings.push({ blockId: b.id, message: "No se pudo verificar automáticamente este resultado; revísalo." });
          else if (!bad && any && unv > 0) warnings.push({ blockId: b.id, message: "Algunos pasos no pudieron verificarse automáticamente; revísalos." });
        }
      }
    }
  }
  return { errors, warnings };
}

/** Aplica los warnings al borrador (reemplaza los previos). */
export function withWarnings(draft: ContentDraft, v: ContentValidation): ContentDraft {
  return { ...draft, warnings: v.warnings };
}
