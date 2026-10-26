"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ContentDraft, DeckDocument, LaminaError, Slide, normalizeDraftMath, type Block } from "@lamina/contracts";
import { validateDeckAgainstCatalog } from "@lamina/components";
import { consumeQuota, hashJson, refundQuota, schema, workflow as wf, type QuotaKind } from "@lamina/db";
import { enqueue } from "@lamina/jobs";
import { validateContent } from "@lamina/validation";
import { and, eq, sql } from "drizzle-orm";
import { getBoss } from "@/lib/boss";
import { getDb } from "@/lib/db";
import { act, requireOwner } from "@/lib/guard";
import { deletePresentationData } from "@/lib/cleanup";
import { catalogLookupFor, loadContent, loadDeck } from "@/lib/presentation-view";
import { env } from "@/lib/env";

const Id = z.string().uuid();
const Feedback = z.string().trim().max(3000).optional();
const touch = (id: string) => { revalidatePath(`/presentations/${id}`, "layout"); revalidatePath("/dashboard"); };

/** Encola tras cambiar de etapa; si falla el encolado, la presentación pasa a failed_recoverable (reintentable). */
async function kick(id: string, name: "content.generate" | "design.generate" | "design.repair" | "polish", payload: Record<string, unknown>, base: string) {
  try { await enqueue(await getBoss(), name, payload as never, { base }); }
  catch (e) {
    console.error("[enqueue]", name, e);
    await wf.failJob(getDb(), id, "No se pudo encolar el trabajo. Reintenta.");
    throw e;
  }
}

async function withQuota<T>(userId: string, kind: QuotaKind, fn: () => Promise<T>): Promise<T> {
  const db = getDb();
  await consumeQuota(db, userId, kind);
  try { return await fn(); } catch (e) { await refundQuota(db, userId, kind).catch(() => {}); throw e; }
}

/* ───────── Contenido ───────── */
const stableJson = (b: unknown) => hashJson(b);

export async function saveContentAction(input: { id: string; baseVersionId: string; content: unknown }) {
  return act(async (u) => {
    const id = Id.parse(input.id);
    await requireOwner(id, u.id);
    const parsed = ContentDraft.safeParse(input.content);
    if (!parsed.success) throw new LaminaError("invalid_input", `Contenido inválido: ${parsed.error.issues[0]?.path.join(".")} ${parsed.error.issues[0]?.message}`, 400);
    const base = await loadContent(input.baseVersionId);
    if (!base) throw new LaminaError("not_found", "Versión base no encontrada", 404);
    // Marca como "edited" lo que el docente cambió respecto a la versión base.
    const before = new Map<string, string>();
    for (const s of normalizeDraftMath(base.draft).sections) for (const h of s.slidesHint) for (const b of h.blocks) before.set(b.id, stableJson({ ...b, origin: undefined, sourceRefs: undefined }));
    const draft = normalizeDraftMath(structuredClone(parsed.data));
    for (const s of draft.sections) for (const h of s.slidesHint) for (const b of h.blocks as Block[]) {
      const prev = before.get(b.id);
      if (prev === undefined) b.origin = "teacher";
      else if (prev !== stableJson({ ...b, origin: undefined, sourceRefs: undefined })) b.origin = "edited";
    }
    const v = validateContent(draft, parsed.data.warnings);
    if (v.errors.length) throw new LaminaError("validation_failed", `Corrige antes de guardar: ${v.errors.slice(0, 3).join(" · ")}`, 422, v.errors);
    const final = ContentDraft.parse({ ...draft, warnings: v.warnings, verification: v.stats });
    const row = await wf.saveTeacherContent(getDb(), id, u.id, { content: final, sha256: hashJson(final), baseVersionId: input.baseVersionId, note: "Edición del docente" });
    touch(id);
    return { versionId: row.id, sha256: row.sha256 };
  });
}

export async function restoreContentVersionAction(input: { id: string; versionId: string }) {
  return act(async (u) => {
    const id = Id.parse(input.id);
    const p = await requireOwner(id, u.id);
    const old = await loadContent(Id.parse(input.versionId));
    if (!old || old.row.presentationId !== id) throw new LaminaError("not_found", "Versión no encontrada", 404);
    if (!p.currentContentVersionId) throw new LaminaError("invalid_transition", "No hay versión vigente", 409);
    const row = await wf.saveTeacherContent(getDb(), id, u.id, { content: old.draft, sha256: hashJson(old.draft), baseVersionId: p.currentContentVersionId, note: `Restaurada desde la versión ${old.row.n}` });
    touch(id);
    return { versionId: row.id };
  });
}

export async function approveContentAction(input: { id: string; versionId: string; sha256: string }) {
  return act(async (u) => {
    const id = Id.parse(input.id);
    await wf.approveContent(getDb(), id, u.id, Id.parse(input.versionId), input.sha256);
    touch(id);
  });
}

export async function reopenContentAction(input: { id: string }) {
  return act(async (u) => { await wf.reopenContent(getDb(), Id.parse(input.id), u.id); touch(input.id); });
}

export async function regenerateContentAction(input: { id: string; feedback?: string; sectionIds?: string[] }) {
  return act(async (u) => {
    const id = Id.parse(input.id);
    const p = await requireOwner(id, u.id);
    const feedback = Feedback.parse(input.feedback) || undefined;
    if (!p.currentContentVersionId) throw new LaminaError("invalid_transition", "No hay contenido que regenerar", 409);
    await withQuota(u.id, "content_regen", async () => {
      const payload = { presentationId: id, userId: u.id, baseVersionId: p.currentContentVersionId, feedback, onlySectionIds: input.sectionIds?.length ? input.sectionIds : undefined };
      await wf.beginContentGeneration(getDb(), id, u.id, { name: "content.generate", payload });
      if (feedback) await getDb().insert(schema.feedback).values({ presentationId: id, stage: "content", versionId: p.currentContentVersionId, scope: input.sectionIds?.join(",") || null, text: feedback, userId: u.id });
      await kick(id, "content.generate", payload, `${p.currentContentVersionId}:${Date.now()}`);
    });
    touch(id);
  });
}

/* ───────── Diseño ───────── */
export async function startDesignAction(input: { id: string }) {
  return act(async (u) => {
    const id = Id.parse(input.id);
    const p = await requireOwner(id, u.id);
    if (!p.approvedContentVersionId) throw new LaminaError("invalid_transition", "Primero aprueba el contenido", 409);
    const payload = { presentationId: id, userId: u.id, contentVersionId: p.approvedContentVersionId, baseDeckVersionId: null };
    await wf.beginDesign(getDb(), id, u.id, { name: "design.generate", payload });
    await kick(id, "design.generate", payload, `${p.approvedContentVersionId}:init`);
    touch(id);
  });
}

export async function regenerateDesignAction(input: { id: string; feedback?: string; slideIds?: string[] }) {
  return act(async (u) => {
    const id = Id.parse(input.id);
    const p = await requireOwner(id, u.id);
    const feedback = Feedback.parse(input.feedback) || undefined;
    if (!p.currentDeckVersionId || !p.approvedContentVersionId) throw new LaminaError("invalid_transition", "No hay diseño que regenerar", 409);
    await withQuota(u.id, "design_regen", async () => {
      const payload = { presentationId: id, userId: u.id, contentVersionId: p.approvedContentVersionId!, baseDeckVersionId: p.currentDeckVersionId, feedback, onlySlideIds: input.slideIds?.length ? input.slideIds : undefined };
      await wf.beginDesign(getDb(), id, u.id, { name: "design.generate", payload });
      if (feedback) await getDb().insert(schema.feedback).values({ presentationId: id, stage: "design", versionId: p.currentDeckVersionId, scope: input.slideIds?.join(",") || null, text: feedback, userId: u.id });
      await kick(id, "design.generate", payload, `${p.currentDeckVersionId}:${Date.now()}`);
    });
    touch(id);
  });
}

/** Corrección puntual manual (misma canalización que la automática): re-envía a reparar solo las diapositivas con errores. */
export async function repairDesignAction(input: { id: string; slideIds?: string[] }) {
  return act(async (u) => {
    const id = Id.parse(input.id);
    const p = await requireOwner(id, u.id);
    if (p.stage !== "design_review" || !p.currentDeckVersionId) throw new LaminaError("invalid_transition", "Solo puedes corregir mientras revisas el diseño", 409);
    const arts = await getDb().select().from(schema.renderArtifacts).where(eq(schema.renderArtifacts.deckVersionId, p.currentDeckVersionId));
    const only = input.slideIds?.length ? z.array(z.string().max(64)).max(100).parse(input.slideIds) : undefined;
    const hasErrors = arts.some((a) => a.path && (!only || only.includes(a.slideId)) && (a.issues as { severity: string; ignored?: boolean }[]).some((i) => i.severity === "error" && !i.ignored));
    if (!hasErrors) throw new LaminaError("invalid_transition", "No hay errores pendientes que corregir", 409);
    const payload = { presentationId: id, userId: u.id, deckVersionId: p.currentDeckVersionId, attempt: 0, slideIds: only };
    // Cuenta como una regeneración de diseño (el cupo de IA gratuita es compartido); se devuelve si falla.
    await withQuota(u.id, "design_regen", async () => {
      await wf.beginDesign(getDb(), id, u.id, { name: "design.repair", payload }, p.currentDeckVersionId!);
      await kick(id, "design.repair", payload, `${p.currentDeckVersionId}:manual:${Date.now()}`);
    });
    touch(id);
  });
}

/** Marca/desmarca un problema como ignorado (no cuenta como pendiente ni bloquea la aprobación). */
export async function ignoreIssueAction(input: { id: string; deckVersionId: string; slideId: string; index: number; ignored: boolean }) {
  return act(async (u) => {
    const id = Id.parse(input.id);
    const p = await requireOwner(id, u.id);
    if (!["design_review", "final_review"].includes(p.stage)) throw new LaminaError("invalid_transition", "Ya no puedes cambiar los problemas de esta versión", 409);
    const db = getDb();
    const where = and(eq(schema.renderArtifacts.presentationId, id), eq(schema.renderArtifacts.deckVersionId, Id.parse(input.deckVersionId)), eq(schema.renderArtifacts.slideId, input.slideId));
    const [a] = await db.select().from(schema.renderArtifacts).where(where);
    const list = (a?.issues ?? []) as Record<string, unknown>[];
    if (!a || !list[input.index]) throw new LaminaError("not_found", "Problema no encontrado", 404);
    const next = list.map((i, k) => (k === input.index ? { ...i, ignored: input.ignored || undefined } : i));
    await db.update(schema.renderArtifacts).set({ issues: next }).where(where);
    touch(id);
  });
}

export async function approveDesignAction(input: { id: string; versionId: string; sha256: string }) {
  return act(async (u) => { await wf.approveDesign(getDb(), Id.parse(input.id), u.id, Id.parse(input.versionId), input.sha256); touch(input.id); });
}
export async function reopenDesignAction(input: { id: string }) {
  return act(async (u) => { await wf.reopenDesign(getDb(), Id.parse(input.id), u.id); touch(input.id); });
}

export async function startPolishAction(input: { id: string }) {
  return act(async (u) => {
    const id = Id.parse(input.id);
    const p = await requireOwner(id, u.id);
    if (!p.approvedDeckVersionId) throw new LaminaError("invalid_transition", "Primero aprueba el diseño", 409);
    const payload = { presentationId: id, userId: u.id, deckVersionId: p.approvedDeckVersionId };
    await wf.beginPolish(getDb(), id, u.id, { name: "polish", payload });
    await kick(id, "polish", payload, p.approvedDeckVersionId);
    touch(id);
  });
}

export async function skipPolishAction(input: { id: string }) {
  return act(async (u) => { await wf.skipPolish(getDb(), Id.parse(input.id), u.id); touch(input.id); });
}

/* ───────── Edición manual de diapositivas ───────── */
/** Guarda la edición de UNA diapositiva como versión nueva (autor docente) y re-renderiza solo esa diapositiva. */
export async function saveSlideEditAction(input: { id: string; baseVersionId: string; slide: unknown }) {
  return act(async (u) => {
    const id = Id.parse(input.id);
    const p = await requireOwner(id, u.id);
    if (!wf.EDITABLE_STAGES.includes(p.stage as never)) throw new LaminaError("invalid_transition", "Ahora no se puede editar la presentación (espera a que termine el proceso o reabre el diseño).", 409);
    const baseId = Id.parse(input.baseVersionId);
    if (wf.headDeckVersionId(p) !== baseId) throw new LaminaError("stale_version", "La presentación cambió mientras editabas. Recarga para ver la última versión.", 409);
    const base = await loadDeck(baseId);
    if (!base) throw new LaminaError("not_found", "Versión no encontrada", 404);
    const slide = Slide.safeParse(input.slide);
    if (!slide.success) throw new LaminaError("validation_failed", `Diapositiva inválida: ${slide.error.issues[0]?.path.join(".")} ${slide.error.issues[0]?.message}`, 422);
    const idx = base.deck.slides.findIndex((s) => s.id === slide.data.id);
    if (idx < 0) throw new LaminaError("not_found", "Diapositiva no encontrada", 404);
    if (hashJson(base.deck.slides[idx]) === hashJson(slide.data)) throw new LaminaError("invalid_input", "No hay cambios que guardar", 400);
    const deck = { ...base.deck, slides: base.deck.slides.map((s, i) => (i === idx ? slide.data : s)) };
    const v = validateDeckAgainstCatalog(deck, await catalogLookupFor(id, base.row.componentPins));
    if (!v.ok) throw new LaminaError("validation_failed", `Corrige antes de guardar: ${v.errors.slice(0, 3).join(" · ")}`, 422, v.errors);
    const row = await wf.saveEditedDeck(getDb(), id, u.id, { baseVersionId: baseId, deck: v.deck, sha256: hashJson(v.deck), note: `Edición manual de la diapositiva ${idx + 1}` });
    // Las demás diapositivas conservan captura y problemas; solo se re-renderiza la editada.
    const arts = await getDb().select().from(schema.renderArtifacts).where(eq(schema.renderArtifacts.deckVersionId, baseId));
    const keep = arts.filter((a) => a.slideId !== slide.data.id);
    if (keep.length) await getDb().insert(schema.renderArtifacts).values(keep.map((a) => ({ presentationId: id, deckVersionId: row.id, slideId: a.slideId, path: a.path, issues: a.issues }))).onConflictDoNothing();
    await enqueue(await getBoss(), "render", { presentationId: id, deckVersionId: row.id }, { base: row.id }).catch(() => {});
    touch(id);
    return { versionId: row.id };
  });
}

/** Publica los cambios hechos después de publicar (mismo enlace y visibilidad). */
export async function publishChangesAction(input: { id: string }) {
  return act(async (u) => { await wf.publishChanges(getDb(), Id.parse(input.id), u.id); touch(input.id); });
}

/* ───────── Componentes nuevos ───────── */
export async function requestComponentAction(input: { id: string; name: string; purpose: string; slideId?: string }) {
  return act(async (u) => {
    const id = Id.parse(input.id);
    const p = await requireOwner(id, u.id);
    if (p.stage !== "design_review") throw new LaminaError("invalid_transition", "Puedes pedir un componente mientras revisas el diseño", 409);
    const name = z.string().regex(/^[A-Za-z][A-Za-z0-9]{2,40}$/, "Nombre en PascalCase (letras y números, sin espacios)").parse(input.name);
    const purpose = z.string().trim().min(15, "Describe el componente (mínimo 15 caracteres)").max(800).parse(input.purpose);
    return withQuota(u.id, "component_request", async () => {
      const [r] = await getDb().insert(schema.componentRequests).values({ presentationId: id, userId: u.id, purpose, suggestedName: name, slideId: input.slideId }).returning();
      await enqueue(await getBoss(), "component.request", { presentationId: id, userId: u.id, requestId: r!.id, purpose, suggestedName: name, slideId: input.slideId }, { base: r!.id });
      touch(id);
      return { requestId: r!.id };
    });
  });
}

/* ───────── Publicación ───────── */
export async function publishAction(input: { id: string; visibility: "link" | "public" }) {
  return act(async (u) => {
    const r = await wf.publish(getDb(), Id.parse(input.id), u.id, z.enum(["link", "public"]).parse(input.visibility));
    touch(input.id);
    return { url: `${env().APP_URL}/presentations/${input.id}/view`, token: r.token, shareUrl: r.token ? `${env().APP_URL}/presentations/${input.id}/view?t=${r.token}` : null };
  });
}
export async function keepPrivateAction(input: { id: string }) {
  return act(async (u) => { await wf.keepPrivate(getDb(), Id.parse(input.id), u.id); touch(input.id); });
}
export async function unpublishAction(input: { id: string }) {
  return act(async (u) => { await wf.unpublish(getDb(), Id.parse(input.id), u.id); touch(input.id); });
}
export async function regenerateShareTokenAction(input: { id: string }) {
  return act(async (u) => {
    const token = await wf.regenerateShareToken(getDb(), Id.parse(input.id), u.id);
    touch(input.id);
    return { shareUrl: `${env().APP_URL}/presentations/${input.id}/view?t=${token}` };
  });
}
export async function setVisibilityAction(input: { id: string; visibility: "link" | "public" }) {
  return act(async (u) => {
    const r = await wf.setVisibility(getDb(), Id.parse(input.id), u.id, z.enum(["link", "public"]).parse(input.visibility));
    touch(input.id);
    return { shareUrl: r.token ? `${env().APP_URL}/presentations/${input.id}/view?t=${r.token}` : null };
  });
}

/* ───────── Fallos, cuota y borrado ───────── */
export async function retryAction(input: { id: string }) {
  return act(async (u) => {
    const id = Id.parse(input.id);
    const { pending } = await wf.resumeFromWait(getDb(), id, u.id);
    try { await enqueue(await getBoss(), pending.name as never, pending.payload as never, { base: `retry-${Date.now()}` }); }
    catch (e) { console.error("[enqueue]", pending.name, e); await wf.failJob(getDb(), id, "No se pudo encolar el trabajo. Reintenta."); throw e; }
    touch(id);
  });
}

export async function cancelPendingAction(input: { id: string }) {
  return act(async (u) => { await wf.cancelPending(getDb(), Id.parse(input.id), u.id); touch(input.id); });
}

/** Cancela en pg-boss los jobs pendientes o activos de la presentación (evita reintentos y trabajo encolado inútil). Mejor esfuerzo. */
async function cancelQueuedJobs(presentationId: string) {
  const rows = await getDb().execute(sql`select id, name from pgboss.job where data->>'presentationId' = ${presentationId} and state in ('created','retry','active')`);
  const byName = new Map<string, string[]>();
  for (const r of rows.rows as { id: string; name: string }[]) byName.set(r.name, [...(byName.get(r.name) ?? []), r.id]);
  if (!byName.size) return;
  const boss = await getBoss();
  for (const [name, ids] of byName) await boss.cancel(name, ids).catch((e) => console.error("[cancel]", name, (e as Error).message));
}

export async function cancelRunningAction(input: { id: string }) {
  return act(async (u) => {
    const id = Id.parse(input.id);
    await wf.cancelRunning(getDb(), id, u.id);
    await cancelQueuedJobs(id).catch((e) => console.error("[cancel]", (e as Error).message));
    touch(id);
  });
}

export async function duplicatePresentationAction(input: { id: string }) {
  return act(async (u) => {
    const id = Id.parse(input.id);
    await requireOwner(id, u.id);
    const copy = await withQuota(u.id, "presentation_new", () => wf.duplicatePresentation(getDb(), id, u.id));
    revalidatePath("/dashboard");
    return { id: copy.id };
  });
}

export async function deletePresentationAction(input: { id: string }) {
  return act(async (u) => {
    const id = Id.parse(input.id);
    await requireOwner(id, u.id);
    await deletePresentationData(id, u.id);
    await cancelQueuedJobs(id).catch(() => {}); // renders o reanudaciones que hubieran quedado en cola
    revalidatePath("/dashboard");
  });
}

export async function renamePresentationAction(input: { id: string; title: string }) {
  return act(async (u) => {
    const id = Id.parse(input.id);
    await requireOwner(id, u.id);
    await getDb().update(schema.presentations).set({ title: z.string().trim().min(1).max(200).parse(input.title) }).where(eq(schema.presentations.id, id));
    touch(id);
  });
}
