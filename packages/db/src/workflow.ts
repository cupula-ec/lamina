/**
 * Máquina de estados de la presentación. TODAS las transiciones viven aquí:
 * una función por transición, validada en servidor, dentro de una transacción con SELECT … FOR UPDATE.
 */
import { and, eq, sql } from "drizzle-orm";
import { LaminaError, type Stage, type Visibility } from "@lamina/contracts";
import type { Db, Tx } from "./client";
import { approvals, contentVersions, deckVersions, events, presentations } from "./schema";
import { randomBytes } from "node:crypto";
import { sha256Hex } from "./hash";
import { DEFAULT_CONCURRENT_JOBS } from "./quota";

type Pres = typeof presentations.$inferSelect;

export const RUNNING_STAGES: Stage[] = ["researching", "designing", "polishing"];
export type PendingJob = { name: string; payload: Record<string, unknown> };
const RUNNING_FOR: Record<string, Stage> = {
  research: "researching", "content.generate": "researching", "design.generate": "designing", "design.repair": "designing", "component.request": "designing", polish: "polishing",
};

async function lock(tx: Tx, id: string, ownerId?: string): Promise<Pres> {
  const rows = await tx.select().from(presentations).where(eq(presentations.id, id)).for("update");
  const p = rows[0];
  if (!p) throw new LaminaError("not_found", "Presentación no encontrada", 404);
  if (ownerId !== undefined && p.ownerId !== ownerId) throw new LaminaError("not_found", "Presentación no encontrada", 404);
  return p;
}

function expectStage(p: Pres, from: Stage[], action: string) {
  if (!from.includes(p.stage as Stage))
    throw new LaminaError("invalid_transition", `No se puede ${action} desde la etapa "${p.stage}"`, 409, { stage: p.stage, allowed: from });
}

/** Máx. 2 trabajos simultáneos por docente (se cuenta dentro de la transacción que ya bloqueó la presentación). */
async function assertConcurrency(tx: Tx, ownerId: string, exceptId: string) {
  const [{ n } = { n: 0 }] = await tx.select({ n: sql<number>`count(*)::int` }).from(presentations)
    .where(and(eq(presentations.ownerId, ownerId), sql`${presentations.stage} in ('researching','designing','polishing')`, sql`${presentations.id} <> ${exceptId}`));
  if (n >= DEFAULT_CONCURRENT_JOBS) throw new LaminaError("job_in_progress", `Ya tienes ${n} presentaciones procesándose. Espera a que termine alguna.`, 409);
}

async function set(tx: Tx, id: string, patch: Partial<typeof presentations.$inferInsert>) {
  const [row] = await tx.update(presentations).set({ ...patch, updatedAt: new Date() }).where(eq(presentations.id, id)).returning();
  return row!;
}

async function evt(tx: Tx, name: string, p: Pres, data: Record<string, unknown> = {}) {
  await tx.insert(events).values({ name, userId: p.ownerId, presentationId: p.id, data });
}

/* ───── Creación ───── */
export async function createPresentation(
  db: Db,
  ownerId: string,
  input: { title: string; topic: string; level: string; objective: string; language?: string; extraNotes?: string },
) {
  return db.transaction(async (tx) => {
    const [p] = await tx.insert(presentations).values({ ownerId, ...input, language: input.language ?? "es", stage: "draft" }).returning();
    await evt(tx, "presentation_created", p!);
    return p!;
  });
}

/* ───── Contenido ───── */
/** draft | content_review → researching (genera o regenera contenido). */
export function beginContentGeneration(db: Db, id: string, ownerId: string, pending?: PendingJob) {
  return db.transaction(async (tx) => {
    const p = await lock(tx, id, ownerId);
    expectStage(p, ["draft", "content_review"], "generar contenido");
    await assertConcurrency(tx, p.ownerId, id);
    return set(tx, id, { stage: "researching", prevStage: p.stage, lastError: null, resumeAt: null, pendingJob: pending ?? null });
  });
}

export async function addContentVersion(
  tx: Tx,
  presentationId: string,
  v: { content: unknown; sha256: string; authorKind: "ia" | "docente"; parentId: string | null; note?: string },
) {
  const [{ n } = { n: 0 }] = await tx
    .select({ n: sql<number>`coalesce(max(${contentVersions.n}),0)::int` })
    .from(contentVersions)
    .where(eq(contentVersions.presentationId, presentationId));
  const [row] = await tx.insert(contentVersions).values({ presentationId, n: n + 1, ...v }).returning();
  return row!;
}

/** researching → content_review: registra la versión generada por la IA. */
export function contentGenerated(db: Db, id: string, v: { content: unknown; sha256: string; parentId: string | null; note?: string }) {
  return db.transaction(async (tx) => {
    const p = await lock(tx, id);
    expectStage(p, ["researching"], "publicar el borrador de contenido");
    const row = await addContentVersion(tx, id, { ...v, authorKind: "ia" });
    await set(tx, id, { stage: "content_review", currentContentVersionId: row.id, approvedContentVersionId: null, lastError: null, prevStage: null });
    await evt(tx, "content_generated", p, { versionId: row.id });
    return row;
  });
}

/** El docente guarda una edición manual: nueva versión (nunca sobrescribe). Solo en content_review. */
export function saveTeacherContent(db: Db, id: string, ownerId: string, v: { content: unknown; sha256: string; baseVersionId: string; note?: string }) {
  return db.transaction(async (tx) => {
    const p = await lock(tx, id, ownerId);
    expectStage(p, ["content_review"], "editar el contenido");
    if (p.currentContentVersionId !== v.baseVersionId)
      throw new LaminaError("stale_version", "El contenido cambió; recarga antes de guardar", 409);
    const row = await addContentVersion(tx, id, { content: v.content, sha256: v.sha256, authorKind: "docente", parentId: v.baseVersionId, note: v.note });
    await set(tx, id, { currentContentVersionId: row.id });
    return row;
  });
}

/** content_review → content_approved. La aprobación referencia versionId + sha256. */
export function approveContent(db: Db, id: string, ownerId: string, versionId: string, sha256: string) {
  return db.transaction(async (tx) => {
    const p = await lock(tx, id, ownerId);
    expectStage(p, ["content_review"], "aprobar el contenido");
    if (p.currentContentVersionId !== versionId) throw new LaminaError("stale_version", "Solo puede aprobarse la versión vigente", 409);
    const [v] = await tx.select().from(contentVersions).where(and(eq(contentVersions.id, versionId), eq(contentVersions.presentationId, id)));
    if (!v || v.sha256 !== sha256) throw new LaminaError("stale_version", "El hash no coincide con la versión", 409);
    await tx.insert(approvals).values({ presentationId: id, kind: "content", versionId, sha256, userId: ownerId });
    await evt(tx, "content_approved", p, { versionId });
    return set(tx, id, { stage: "content_approved", approvedContentVersionId: versionId });
  });
}

/** Reabre el contenido (descarta el avance de diseño no publicado). */
export function reopenContent(db: Db, id: string, ownerId: string) {
  return db.transaction(async (tx) => {
    const p = await lock(tx, id, ownerId);
    expectStage(p, ["content_approved", "design_review", "design_approved"], "reabrir el contenido");
    return set(tx, id, { stage: "content_review", approvedContentVersionId: null, approvedDeckVersionId: null, currentDeckVersionId: null, finalDeckVersionId: null });
  });
}

/* ───── Diseño ───── */
/** content_approved | design_review → designing. Exige contenido aprobado. */
export function beginDesign(db: Db, id: string, ownerId: string, pending?: PendingJob, expectCurrentDeckVersionId?: string) {
  return db.transaction(async (tx) => {
    const p = await lock(tx, id, ownerId);
    expectStage(p, ["content_approved", "design_review"], "generar el diseño");
    if (expectCurrentDeckVersionId && p.currentDeckVersionId !== expectCurrentDeckVersionId) throw new LaminaError("stale_version", "El diseño cambió mientras tanto. Recarga la página.", 409);
    if (!p.approvedContentVersionId) throw new LaminaError("invalid_transition", "El contenido no está aprobado", 409);
    await assertConcurrency(tx, p.ownerId, id);
    return set(tx, id, { stage: "designing", prevStage: p.stage, lastError: null, resumeAt: null, pendingJob: pending ?? null });
  });
}

export async function addDeckVersion(
  tx: Tx,
  presentationId: string,
  v: {
    deck: unknown; sha256: string; contentVersionId: string; authorKind: "ia" | "docente"; parentId: string | null;
    kind?: "design" | "polish" | "repair" | "edit"; note?: string; componentPins?: Record<string, { version: string; bundleHash?: string }>; issues?: unknown[];
  },
) {
  const [{ n } = { n: 0 }] = await tx
    .select({ n: sql<number>`coalesce(max(${deckVersions.n}),0)::int` })
    .from(deckVersions)
    .where(eq(deckVersions.presentationId, presentationId));
  const [row] = await tx.insert(deckVersions).values({ presentationId, n: n + 1, ...v }).returning();
  return row!;
}

/** designing → design_review. */
export function designGenerated(db: Db, id: string, v: Omit<Parameters<typeof addDeckVersion>[2], "authorKind" | "kind">) {
  return db.transaction(async (tx) => {
    const p = await lock(tx, id);
    expectStage(p, ["designing"], "publicar el diseño");
    if (v.contentVersionId !== p.approvedContentVersionId) throw new LaminaError("stale_version", "El diseño no corresponde al contenido aprobado", 409);
    const row = await addDeckVersion(tx, id, { ...v, authorKind: "ia", kind: "design" });
    await set(tx, id, { stage: "design_review", currentDeckVersionId: row.id, approvedDeckVersionId: null, prevStage: null, lastError: null });
    await evt(tx, "design_generated", p, { versionId: row.id });
    return row;
  });
}

/** designing → designing: guarda el borrador (aún sin revisión del docente) y lo deja como versión vigente mientras se verifica/repara. */
export function designDrafted(db: Db, id: string, v: Omit<Parameters<typeof addDeckVersion>[2], "authorKind" | "kind">) {
  return db.transaction(async (tx) => {
    const p = await lock(tx, id);
    expectStage(p, ["designing"], "guardar el borrador del diseño");
    if (v.contentVersionId !== p.approvedContentVersionId) throw new LaminaError("stale_version", "El diseño no corresponde al contenido aprobado", 409);
    const row = await addDeckVersion(tx, id, { ...v, authorKind: "ia", kind: "design" });
    await set(tx, id, { currentDeckVersionId: row.id, approvedDeckVersionId: null, lastError: null, pendingJob: null });
    await evt(tx, "design_generated", p, { versionId: row.id });
    return row;
  });
}

/** designing → designing: versión corregida automáticamente (descendiente de la vigente). */
export function designRepaired(db: Db, id: string, v: { baseVersionId: string; deck: unknown; sha256: string; note: string }) {
  return db.transaction(async (tx) => {
    const p = await lock(tx, id);
    expectStage(p, ["designing"], "guardar la reparación");
    if (p.currentDeckVersionId !== v.baseVersionId) throw new LaminaError("stale_version", "La versión base cambió", 409);
    const [base] = await tx.select().from(deckVersions).where(eq(deckVersions.id, v.baseVersionId));
    const row = await addDeckVersion(tx, id, {
      deck: v.deck, sha256: v.sha256, contentVersionId: base!.contentVersionId, authorKind: "ia", parentId: base!.id,
      kind: "repair", note: v.note, componentPins: base!.componentPins,
    });
    await set(tx, id, { currentDeckVersionId: row.id, lastError: null });
    await evt(tx, "design_repaired", p, { versionId: row.id });
    return row;
  });
}

/** designing → design_review sobre la versión vigente (idempotente: ignora si la etapa o la versión ya cambiaron). */
export function designFinish(db: Db, id: string, versionId: string) {
  return db.transaction(async (tx) => {
    const p = await lock(tx, id);
    if (p.stage !== "designing" || p.currentDeckVersionId !== versionId) return null;
    await evt(tx, "design_ready", p, { versionId });
    return set(tx, id, { stage: "design_review", prevStage: null, pendingJob: null, lastError: null, resumeAt: null });
  });
}

export function approveDesign(db: Db, id: string, ownerId: string, versionId: string, sha256: string) {
  return db.transaction(async (tx) => {
    const p = await lock(tx, id, ownerId);
    expectStage(p, ["design_review"], "aprobar el diseño");
    if (p.currentDeckVersionId !== versionId) throw new LaminaError("stale_version", "Solo puede aprobarse la versión vigente", 409);
    const [v] = await tx.select().from(deckVersions).where(and(eq(deckVersions.id, versionId), eq(deckVersions.presentationId, id)));
    if (!v || v.sha256 !== sha256) throw new LaminaError("stale_version", "El hash no coincide con la versión", 409);
    await tx.insert(approvals).values({ presentationId: id, kind: "design", versionId, sha256, userId: ownerId });
    await evt(tx, "design_approved", p, { versionId });
    return set(tx, id, { stage: "design_approved", approvedDeckVersionId: versionId });
  });
}

export function reopenDesign(db: Db, id: string, ownerId: string) {
  return db.transaction(async (tx) => {
    const p = await lock(tx, id, ownerId);
    expectStage(p, ["design_approved", "final_review"], "reabrir el diseño");
    return set(tx, id, { stage: "design_review", approvedDeckVersionId: null, finalDeckVersionId: null });
  });
}

/* ───── Pulido y publicación ───── */
export function beginPolish(db: Db, id: string, ownerId: string, pending?: PendingJob) {
  return db.transaction(async (tx) => {
    const p = await lock(tx, id, ownerId);
    expectStage(p, ["design_approved"], "pulir la presentación");
    if (!p.approvedDeckVersionId) throw new LaminaError("invalid_transition", "El diseño no está aprobado", 409);
    await assertConcurrency(tx, p.ownerId, id);
    return set(tx, id, { stage: "polishing", prevStage: p.stage, lastError: null, resumeAt: null, pendingJob: pending ?? null });
  });
}

/** polishing → final_review. La versión pulida debe descender de la aprobada. */
export function polishGenerated(db: Db, id: string, v: { deck: unknown; sha256: string; componentPins?: Record<string, { version: string; bundleHash?: string }>; note?: string }) {
  return db.transaction(async (tx) => {
    const p = await lock(tx, id);
    expectStage(p, ["polishing"], "publicar el pulido");
    const [base] = await tx.select().from(deckVersions).where(eq(deckVersions.id, p.approvedDeckVersionId!));
    const row = await addDeckVersion(tx, id, {
      deck: v.deck, sha256: v.sha256, contentVersionId: base!.contentVersionId, authorKind: "ia", parentId: base!.id,
      kind: "polish", note: v.note, componentPins: v.componentPins ?? base!.componentPins,
    });
    await set(tx, id, { stage: "final_review", finalDeckVersionId: row.id, prevStage: null, lastError: null });
    return row;
  });
}

/** Etapas en las que el docente puede editar diapositivas a mano, y cuál es su versión de cabecera. */
export const EDITABLE_STAGES: Stage[] = ["design_review", "final_review", "private_final", "published"];
export const headDeckVersionId = (p: Pick<Pres, "stage" | "currentDeckVersionId" | "finalDeckVersionId">) =>
  p.stage === "design_review" ? p.currentDeckVersionId : p.finalDeckVersionId;

/**
 * Edición manual de una diapositiva: crea una versión `edit` (autor docente) descendiente de la cabecera.
 * En diseño pasa a ser la vigente; en final/privada/publicada pasa a ser la final. Lo publicado no cambia hasta `publishChanges`.
 */
export function saveEditedDeck(db: Db, id: string, ownerId: string, v: { baseVersionId: string; deck: unknown; sha256: string; note: string }) {
  return db.transaction(async (tx) => {
    const p = await lock(tx, id, ownerId);
    expectStage(p, EDITABLE_STAGES, "editar la diapositiva");
    if (headDeckVersionId(p) !== v.baseVersionId) throw new LaminaError("stale_version", "La presentación cambió mientras editabas. Recarga para ver la última versión.", 409);
    const [base] = await tx.select().from(deckVersions).where(eq(deckVersions.id, v.baseVersionId));
    const row = await addDeckVersion(tx, id, {
      deck: v.deck, sha256: v.sha256, contentVersionId: base!.contentVersionId, authorKind: "docente", parentId: base!.id,
      kind: "edit", note: v.note, componentPins: base!.componentPins,
    });
    await set(tx, id, p.stage === "design_review" ? { currentDeckVersionId: row.id } : { finalDeckVersionId: row.id });
    await evt(tx, "slide_edited", p, { versionId: row.id });
    return row;
  });
}

/** published → published: el snapshot público pasa a ser la última versión final (mismo enlace y visibilidad). */
export function publishChanges(db: Db, id: string, ownerId: string) {
  return db.transaction(async (tx) => {
    const p = await lock(tx, id, ownerId);
    expectStage(p, ["published"], "publicar los cambios");
    if (!p.finalDeckVersionId || p.finalDeckVersionId === p.publishedDeckVersionId) throw new LaminaError("invalid_transition", "No hay cambios por publicar", 409);
    const [fv] = await tx.select().from(deckVersions).where(eq(deckVersions.id, p.finalDeckVersionId));
    await tx.insert(approvals).values({ presentationId: id, kind: "final", versionId: p.finalDeckVersionId, sha256: fv!.sha256, userId: ownerId });
    await evt(tx, "published_changes", p, { versionId: p.finalDeckVersionId });
    return set(tx, id, { publishedDeckVersionId: p.finalDeckVersionId });
  });
}

function newToken() {
  return randomBytes(24).toString("base64url");
}

/** final_review | private_final → published. Fija el snapshot inmutable. Devuelve el token (solo si visibility=link). */
export function publish(db: Db, id: string, ownerId: string, visibility: Exclude<Visibility, "private">) {
  return db.transaction(async (tx) => {
    const p = await lock(tx, id, ownerId);
    expectStage(p, ["final_review", "private_final"], "publicar");
    if (!p.finalDeckVersionId) throw new LaminaError("invalid_transition", "No hay versión final", 409);
    const token = visibility === "link" ? newToken() : null;
    const [fv] = await tx.select().from(deckVersions).where(eq(deckVersions.id, p.finalDeckVersionId));
    await tx.insert(approvals).values({ presentationId: id, kind: "final", versionId: p.finalDeckVersionId, sha256: fv!.sha256, userId: ownerId });
    await evt(tx, "published", p, { visibility });
    const row = await set(tx, id, {
      stage: "published", visibility, publishedDeckVersionId: p.finalDeckVersionId, shareTokenHash: token ? sha256Hex(token) : null,
    });
    return { presentation: row, token };
  });
}

/** final_review → private_final. */
export function keepPrivate(db: Db, id: string, ownerId: string) {
  return db.transaction(async (tx) => {
    const p = await lock(tx, id, ownerId);
    expectStage(p, ["final_review"], "dejar privada");
    return set(tx, id, { stage: "private_final", visibility: "private", shareTokenHash: null });
  });
}

/** published → private_final. Revoca enlace y snapshot público. */
export function unpublish(db: Db, id: string, ownerId: string) {
  return db.transaction(async (tx) => {
    const p = await lock(tx, id, ownerId);
    expectStage(p, ["published"], "despublicar");
    return set(tx, id, { stage: "private_final", visibility: "private", shareTokenHash: null, publishedDeckVersionId: null });
  });
}

/** Regenera/revoca el enlace compartido (solo publicada con visibility=link). */
export function regenerateShareToken(db: Db, id: string, ownerId: string) {
  return db.transaction(async (tx) => {
    const p = await lock(tx, id, ownerId);
    expectStage(p, ["published"], "regenerar el enlace");
    if (p.visibility !== "link") throw new LaminaError("invalid_transition", "La presentación no se comparte por enlace", 409);
    const token = newToken();
    await set(tx, id, { shareTokenHash: sha256Hex(token) });
    return token;
  });
}

/** Cambia la visibilidad de una presentación ya publicada. */
export function setVisibility(db: Db, id: string, ownerId: string, visibility: Exclude<Visibility, "private">) {
  return db.transaction(async (tx) => {
    const p = await lock(tx, id, ownerId);
    expectStage(p, ["published"], "cambiar la visibilidad");
    const token = visibility === "link" ? newToken() : null;
    const row = await set(tx, id, { visibility, shareTokenHash: token ? sha256Hex(token) : null });
    return { presentation: row, token };
  });
}

/* ───── Fallos y cuota ───── */
export function failJob(db: Db, id: string, friendly: string) {
  return db.transaction(async (tx) => {
    const p = await lock(tx, id);
    if (!RUNNING_STAGES.includes(p.stage as Stage)) return p;
    return set(tx, id, { stage: "failed_recoverable", lastError: friendly });
  });
}

export function enterQuotaWait(db: Db, id: string, resumeAt: Date, friendly: string) {
  return db.transaction(async (tx) => {
    const p = await lock(tx, id);
    if (!RUNNING_STAGES.includes(p.stage as Stage)) return p;
    return set(tx, id, { stage: "quota_wait", resumeAt, lastError: friendly });
  });
}

/** failed_recoverable | quota_wait → vuelve a la etapa en ejecución del job pendiente. El llamador re-encola `pending`. */
export function resumeFromWait(db: Db, id: string, ownerId?: string) {
  return db.transaction(async (tx) => {
    const p = await lock(tx, id, ownerId);
    expectStage(p, ["failed_recoverable", "quota_wait"], "reintentar");
    const pending = p.pendingJob;
    const stage = pending ? RUNNING_FOR[pending.name] : undefined;
    if (!pending || !stage) throw new LaminaError("invalid_transition", "No hay un trabajo que reanudar", 409);
    const row = await set(tx, id, { stage, lastError: null, resumeAt: null });
    return { presentation: row, pending };
  });
}

/** Abandona un trabajo detenido/en espera y vuelve a la versión anterior (para poder seguir editando y aprobando). */
export function cancelPending(db: Db, id: string, ownerId: string) {
  return db.transaction(async (tx) => {
    const p = await lock(tx, id, ownerId);
    expectStage(p, ["failed_recoverable", "quota_wait"], "cancelar el trabajo");
    const back = p.prevStage === "content_review" || p.prevStage === "design_review" || p.prevStage === "design_approved" ? p.prevStage : p.prevStage === "content_approved" ? "content_approved" : p.prevStage === "draft" ? null : null;
    if (!back) throw new LaminaError("invalid_transition", "No hay una versión anterior a la que volver; elimina la presentación o reintenta.", 409);
    return set(tx, id, { stage: back, lastError: null, resumeAt: null, pendingJob: null });
  });
}

/** Etapas en ejecución atascadas (el job murió o expiró): pasan a failed_recoverable para que el docente pueda reintentar o cancelar. */
export async function failStale(db: Db, maxMinutes: number, now = new Date()) {
  const cutoff = new Date(now.getTime() - maxMinutes * 60_000);
  const rows = await db.select({ id: presentations.id, stage: presentations.stage, current: presentations.currentDeckVersionId }).from(presentations).where(and(sql`${presentations.stage} in ('researching','designing','polishing')`, sql`${presentations.updatedAt} < ${cutoff}`));
  for (const r of rows) {
    // Un borrador de diseño ya guardado no se pierde si el renderer/reparación no respondió: se entrega tal cual.
    if (r.stage === "designing" && r.current && (await designFinish(db, r.id, r.current))) continue;
    await failJob(db, r.id, "El trabajo tardó demasiado y se detuvo. Tu avance está guardado: puedes reintentar o volver a la versión anterior.");
  }
  return rows.length;
}

/** Presentaciones en espera de cupo cuya hora de reanudación ya pasó. */
export async function dueQuotaWaits(db: Db, now = new Date()) {
  return db.select({ id: presentations.id }).from(presentations).where(and(eq(presentations.stage, "quota_wait"), sql`${presentations.resumeAt} <= ${now}`));
}

export async function getPresentationFor(db: Db, id: string, ownerId: string) {
  const [p] = await db.select().from(presentations).where(and(eq(presentations.id, id), eq(presentations.ownerId, ownerId)));
  if (!p) throw new LaminaError("not_found", "Presentación no encontrada", 404);
  return p;
}
