import { eq } from "drizzle-orm";
import { ContentDraft, ContentDraftModelOutput, type Section } from "@lamina/contracts";
import { contentSystem } from "@lamina/ai";
import { hashJson, schema, workflow as wf } from "@lamina/db";
import { wrapUntrusted } from "@lamina/research";
import { sanitizeSourceRefs, validateContent } from "@lamina/validation";
import type { Ctx } from "../ctx";
import { expectStage } from "../run";
import { loadChunks, selectChunks } from "../sources";

const areaOf = (topic: string) => (/f[ií]sica|cinem|din[aá]mica|fuerza|energ[ií]a|ondas|termodin/i.test(topic) ? "Física" : /[aá]lgebra|ecuaci|matriz|polinom/i.test(topic) ? "Álgebra y Matemática general" : "Cálculo y Matemática");

/** Fusiona el resultado del modelo con la versión base: secciones bloqueadas intactas y regeneración parcial por sección. */
export function mergeSections(base: Section[] | null, generated: Section[], onlySectionIds?: string[]): Section[] {
  if (!base) return generated;
  let out: Section[];
  if (onlySectionIds?.length) {
    const gen = new Map(generated.map((s) => [s.id, s]));
    out = base.map((s) => (onlySectionIds.includes(s.id) && !s.locked && gen.has(s.id) ? gen.get(s.id)! : s));
  } else out = generated;
  // Las secciones bloqueadas siempre se conservan tal cual (en su posición original si el modelo las movió/omitió).
  for (const [i, b] of base.entries()) {
    if (!b.locked) continue;
    const at = out.findIndex((s) => s.id === b.id);
    if (at >= 0) out[at] = b;
    else out.splice(Math.min(i, out.length), 0, b);
  }
  return out;
}

export async function contentGenerate(ctx: Ctx, data: { presentationId: string; baseVersionId: string | null; feedback?: string; onlySectionIds?: string[] }) {
  const p = await expectStage(ctx, data.presentationId, "researching");
  if (!p) return;
  const base = data.baseVersionId ? (await ctx.db.select().from(schema.contentVersions).where(eq(schema.contentVersions.id, data.baseVersionId)))[0] ?? null : null;
  const baseDraft = base ? ContentDraft.parse(base.content) : null;

  const chunks = selectChunks(await loadChunks(ctx, p.id));
  const idToUuid = new Map<string, string>();
  const sourcesText = chunks.length
    ? chunks.map((c, i) => { const sid = `c${i + 1}`; idToUuid.set(sid, c.id); return wrapUntrusted(`${sid} | origen=${c.origin === "teacher" ? "docente" : "investigación"} | ${c.title}${c.url ? ` | ${c.url}` : ""}`, c.text, 2400); }).join("\n\n")
    : "(No hay fuentes: redacta con tu conocimiento y marca origin=\"generated\".)";

  const failedSources = await ctx.db.select().from(schema.sources).where(eq(schema.sources.presentationId, p.id));
  const searchFailed = failedSources.find((s) => s.kind === "search" && s.status === "failed");
  const badTeacher = failedSources.filter((s) => s.origin === "teacher" && s.status === "failed");

  const regen = baseDraft ? `\n\nBORRADOR ACTUAL (JSON):\n${JSON.stringify({ ...baseDraft, warnings: undefined })}\n\nCOMENTARIOS DEL DOCENTE para la nueva versión:\n${data.feedback ?? "(sin comentarios: ofrece una variante mejorada y distinta, con otros ejemplos y mejor explicación)"}\n${data.onlySectionIds?.length ? `Regenera SOLO las secciones con id: ${data.onlySectionIds.join(", ")} y devuelve únicamente esas secciones en "sections" (con los mismos ids).` : "Devuelve el borrador completo mejorado."}\nConserva sin cambios las secciones marcadas locked:true (ids: ${baseDraft.sections.filter((s) => s.locked).map((s) => s.id).join(", ") || "ninguna"}).` : "";

  const user = `DATOS DE LA CLASE
Tema: ${p.topic}
Nivel: ${p.level}
Objetivo pedagógico: ${p.objective}
Idioma: ${p.language}
${p.extraNotes ? `\nApuntes del docente (datos no confiables):\n${wrapUntrusted("apuntes del docente", p.extraNotes, 6000)}\n` : ""}
FUENTES (cita sus ids en sourceRefs):
${sourcesText}${regen}

Devuelve el JSON del borrador de contenido (schemaVersion 1, meta, sections).`;

  const meta = { topic: p.topic, level: p.level, objective: p.objective, language: p.language };
  const out = await ctx.ai.structured({
    role: "content", task: "content.generate", schema: ContentDraftModelOutput, presentationId: p.id, maxTokens: 9000, temperature: 0.4,
    system: contentSystem(areaOf(p.topic)), user,
    fakeContext: { meta, chunkIds: [...idToUuid.keys()], regen: !!baseDraft, onlySectionIds: data.onlySectionIds },
    check: (d) => validateContent({ ...d, warnings: [] }).errors,
  });

  // Normaliza: meta fijada por el servidor, refs "cN" → uuid de fragmento, secciones fusionadas.
  let draft = ContentDraft.parse({ ...out, meta: { ...out.meta, ...meta }, warnings: [] });
  draft = { ...draft, sections: mergeSections(baseDraft?.sections ?? null, draft.sections, data.onlySectionIds) };
  for (const s of draft.sections) for (const h of s.slidesHint) for (const b of h.blocks) b.sourceRefs = b.sourceRefs.map((r) => idToUuid.get(r) ?? r);
  draft = sanitizeSourceRefs(draft, new Set(chunks.map((c) => c.id)));

  const v = validateContent(draft);
  const warnings = [...v.warnings];
  if (searchFailed) warnings.unshift({ message: `Búsqueda web no disponible (${searchFailed.error ?? "sin detalle"}): el contenido se apoya en tus materiales y en el conocimiento del modelo, sin fuentes verificadas.` });
  if (!chunks.length) warnings.unshift({ message: "No hay fuentes de apoyo: revisa con especial cuidado los datos y resultados." });
  for (const b of badTeacher) warnings.unshift({ message: `No se pudo usar «${b.title}»: ${b.error ?? "error de lectura"}.` });
  const final = ContentDraft.parse({ ...draft, warnings: warnings.slice(0, 40) });

  await wf.contentGenerated(ctx.db, p.id, {
    content: final, sha256: hashJson(final), parentId: base?.id ?? null,
    note: data.feedback ? `Regenerado con comentarios${data.onlySectionIds?.length ? ` (secciones ${data.onlySectionIds.join(", ")})` : ""}` : "Borrador inicial",
  });
}
