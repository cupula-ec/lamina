import { ContentDraft } from "@lamina/contracts";
import { validateContent, withWarnings } from "@lamina/validation";
import { assertNoHostileLatex, assertSize, scanJson } from "./safety";
import { LIMITS } from "./limits";
import { McpToolError } from "./errors";

const fmt = (issues: { path: PropertyKey[]; message: string }[]) => issues.slice(0, 15).map((i) => `${i.path.map(String).join(".") || "(raíz)"}: ${i.message}`);

/** Borrador recibido de una IA externa: esquema Zod + verificación matemática (KaTeX, mathjs, derivadas). Los avisos no bloquean; los errores sí. */
export function checkContentDraft(raw: unknown, prior: ContentDraft["warnings"] = []) {
  scanJson(raw, "El borrador");
  assertSize(raw, LIMITS.maxDraftBytes, "El borrador");
  assertNoHostileLatex(raw, "El borrador");
  const parsed = ContentDraft.safeParse(raw);
  if (!parsed.success) throw new McpToolError("validation_failed", "El borrador no cumple el esquema (lamina://schemas/content-draft).", { errors: fmt(parsed.error.issues) });
  const v = validateContent(parsed.data, prior);
  if (v.errors.length) throw new McpToolError("validation_failed", `El borrador tiene ${v.errors.length} error(es) que debes corregir antes de enviarlo.`, { errors: v.errors.slice(0, 25) });
  return { draft: withWarnings(parsed.data, v), validation: v };
}
