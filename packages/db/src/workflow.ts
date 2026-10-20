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

type Pres = typeof presentations.$inferSelect;

export const RUNNING_STAGES: Stage[] = ["researching", "designing", "polishing"];

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
export function beginContentGeneration(db: Db, id: string, ownerId: string) {
  return db.transaction(async (tx) => {
    const p = await lock(tx, id, ownerId);
    expectStage(p, ["draft", "content_review"], "generar contenido");
    return set(tx, id, { stage: "researching", prevStage: p.stage, lastError: null, resumeAt: null });
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
export function beginDesign(db: Db, id: string, ownerId: string) {
  return db.transaction(async (tx) => {
    const p = await lock(tx, id, ownerId);
    expectStage(p, ["content_approved", "design_review"], "generar el diseño");
    if (!p.approvedContentVersionId) throw new LaminaError("invalid_transition", "El contenido no está aprobado", 409);
    return set(tx, id, { stage: "designing", prevStage: p.stage, lastError: null, resumeAt: null });
  });
}

export async function addDeckVersion(
  tx: Tx,
  presentationId: string,
  v: {
    deck: unknown; sha256: string; contentVersionId: string; authorKind: "ia" | "docente"; parentId: string | null;
    kind?: "design" | "polish"; note?: string; componentPins?: Record<string, { version: string; bundleHash?: string }>; issues?: unknown[];
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
export function beginPolish(db: Db, id: string, ownerId: string) {
  return db.transaction(async (tx) => {
    const p = await lock(tx, id, ownerId);
    expectStage(p, ["design_approved"], "pulir la presentación");
    if (!p.approvedDeckVersionId) throw new LaminaError("invalid_transition", "El diseño no está aprobado", 409);
    return set(tx, id, { stage: "polishing", prevStage: p.stage, lastError: null, resumeAt: null });
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
    await tx.insert(approvals).values({ presentationId: id, kind: "final", versionId: p.finalDeckVersionId, sha256: "", userId: ownerId });
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

/** failed_recoverable | quota_wait → etapa previa. El llamador vuelve a encolar el job. */
export function retryFromFailure(db: Db, id: string, ownerId?: string) {
  return db.transaction(async (tx) => {
    const p = await lock(tx, id, ownerId);
    expectStage(p, ["failed_recoverable", "quota_wait"], "reintentar");
    if (!p.prevStage) throw new LaminaError("invalid_transition", "No hay etapa previa", 409);
    return set(tx, id, { stage: p.prevStage, lastError: null, resumeAt: null });
  });
}

export async function getPresentationFor(db: Db, id: string, ownerId: string) {
  const [p] = await db.select().from(presentations).where(and(eq(presentations.id, id), eq(presentations.ownerId, ownerId)));
  if (!p) throw new LaminaError("not_found", "Presentación no encontrada", 404);
  return p;
}
