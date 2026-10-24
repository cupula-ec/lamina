/**
 * Espacio de trabajo y motor de operaciones (PLAN-v3 §5.0). Un solo motor para el editor web, el harness y el MCP:
 * `applyOps` valida y aplica lotes atómicos con `rev` (control de conflictos), idempotencia por `opId`, deshacer por lote
 * y checkpoints que crean versiones inmutables como hoy (el historial actual sigue siendo el historial).
 */
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import {
  LaminaError, OP_TARGET, V2_OPS, WorkspaceOp, parseContentAny, parseDeckAny,
  type ApplyResult, type OpAuthor, type OpIssue, type SlideDiff, type DeckDocument, type ContentDraft,
} from "@lamina/contracts";
import type { Db, Tx } from "./client";
import { contentVersions, deckVersions, presentations, workUnits, workspaceOps, workspaces } from "./schema";
import { hashJson } from "./hash";
import { applyOpsPure, diffDecks } from "./workspace-core";
import { headDeckVersionId } from "./workflow";
import * as wf from "./workflow";

type Pres = typeof presentations.$inferSelect;
type WsRow = typeof workspaces.$inferSelect;

/** Validación semántica extra (catálogo, fidelidad de fórmulas…) inyectada por quien la tiene; solo recibe lo que cambió. */
export type DeckValidator = (deck: DeckDocument, touchedSlideIds: string[]) => OpIssue[] | Promise<OpIssue[]>;
export type ContentValidator = (content: ContentDraft) => OpIssue[] | Promise<OpIssue[]>;
export type ApplyOpts = {
  opId?: string; dryRun?: boolean; baseRev?: number; label?: string; ownerId?: string;
  /** El llamador tiene el flag de escritura v2 (ops que producen datos de esquema v2, p. ej. set_logo). */
  allowV2?: boolean;
  validateDeck?: DeckValidator; validateContent?: ContentValidator;
};

const headVersions = (p: Pres) => ({
  deckId: headDeckVersionId(p) ?? p.currentDeckVersionId ?? p.finalDeckVersionId ?? null,
  contentId: p.currentContentVersionId ?? null,
});

async function loadPresentation(tx: Tx, id: string, ownerId?: string): Promise<Pres> {
  const [p] = await tx.select().from(presentations).where(eq(presentations.id, id)).for("update");
  if (!p || (ownerId !== undefined && p.ownerId !== ownerId)) throw new LaminaError("not_found", "Presentación no encontrada", 404);
  return p;
}

/** Fila bloqueada del workspace; se crea de forma perezosa desde la versión vigente y se re-basa si no hay cambios sin confirmar. */
async function lockedWorkspace(tx: Tx, p: Pres): Promise<WsRow> {
  const { deckId, contentId } = headVersions(p);
  const load = async () => {
    const [dv] = deckId ? await tx.select().from(deckVersions).where(eq(deckVersions.id, deckId)) : [];
    const [cv] = contentId ? await tx.select().from(contentVersions).where(eq(contentVersions.id, contentId)) : [];
    return { deck: dv ? parseDeckAny(dv.deck) : null, content: cv ? parseContentAny(cv.content) : null };
  };
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${"ws:" + p.id}))`);
  let [ws] = await tx.select().from(workspaces).where(eq(workspaces.presentationId, p.id)).for("update");
  if (!ws) {
    const st = await load();
    [ws] = await tx.insert(workspaces).values({ presentationId: p.id, deck: st.deck, content: st.content, baseDeckVersionId: deckId, baseContentVersionId: contentId }).returning();
    return ws!;
  }
  if (!ws.dirty && (ws.baseDeckVersionId !== deckId || ws.baseContentVersionId !== contentId)) {
    const st = await load();
    [ws] = await tx.update(workspaces).set({ deck: st.deck, content: st.content, baseDeckVersionId: deckId, baseContentVersionId: contentId, rev: ws.rev + 1, updatedAt: new Date() }).where(eq(workspaces.id, ws.id)).returning();
  }
  return ws!;
}

/** ¿Las diapositivas están siendo generadas ahora mismo por un job? (durante `designing` solo se admiten ops que no las toquen). */
async function busySlides(tx: Tx, presentationId: string, slideIds: string[]): Promise<string[]> {
  if (!slideIds.length) return [];
  const rows = await tx.select({ ref: workUnits.ref }).from(workUnits).where(and(eq(workUnits.presentationId, presentationId), eq(workUnits.kind, "slide"), sql`${workUnits.state} <> 'done'`));
  return slideIds.filter((id) => rows.some((r) => id === r.ref || id.startsWith(`${r.ref}-`)));
}

const CONTENT_STAGES: string[] = ["draft", "content_review"];
const DECK_STAGES: string[] = ["content_approved", "design_review", "designing", "final_review", "private_final", "published"];

const kindOf = (op: WorkspaceOp): SlideDiff["change"] => (op.op === "add_slide" ? "added" : op.op === "remove_slide" ? "removed" : op.op === "move_slide" ? "moved" : "modified");
const slideOf = (op: WorkspaceOp): string | null => ("slideId" in op ? op.slideId : op.op === "add_slide" ? op.slide.id : null);

export async function getWorkspace(db: Db, presentationId: string, ownerId?: string) {
  return db.transaction(async (tx) => {
    const p = await loadPresentation(tx, presentationId, ownerId);
    return lockedWorkspace(tx, p);
  });
}

export async function applyOps(db: Db, presentationId: string, rawOps: unknown[], author: OpAuthor, opts: ApplyOpts = {}): Promise<ApplyResult> {
  const parsed = rawOps.map((o) => WorkspaceOp.safeParse(o));
  const bad = parsed.flatMap((r, i) => (r.success ? [] : [{ opIndex: i, code: "invalid_op", message: r.error.issues.slice(0, 3).map((x) => `${x.path.join(".")}: ${x.message}`).join("; ") } as OpIssue]));
  if (bad.length) return { ok: false, issues: bad, newRev: -1, appliedOpIds: [] };
  const ops = parsed.map((r) => (r as { data: WorkspaceOp }).data);
  if (!ops.length) return { ok: false, issues: [{ code: "empty", message: "El lote no trae operaciones" }], newRev: -1, appliedOpIds: [] };
  if (!opts.allowV2) {
    const v2 = ops.map((o, i) => (V2_OPS.includes(o.op) ? i : -1)).filter((i) => i >= 0);
    if (v2.length) return { ok: false, issues: v2.map((opIndex) => ({ opIndex, code: "feature_off", message: "Esta operación todavía no está habilitada para tu cuenta" })), newRev: -1, appliedOpIds: [] };
  }
  if (ops.length > 100) return { ok: false, issues: [{ code: "too_many", message: "Máximo 100 operaciones por lote" }], newRev: -1, appliedOpIds: [] };

  return db.transaction(async (tx): Promise<ApplyResult> => {
    const p = await loadPresentation(tx, presentationId, opts.ownerId);
    const ws = await lockedWorkspace(tx, p);

    if (opts.opId) {
      const prev = await tx.select().from(workspaceOps).where(and(eq(workspaceOps.workspaceId, ws.id), sql`starts_with(${workspaceOps.opId}, ${opts.opId + ":"})`)).orderBy(asc(workspaceOps.idx));
      if (prev.length) return { ok: true, issues: [], newRev: prev[0]!.rev, appliedOpIds: prev.map((r) => r.opId), batchId: prev[0]!.batchId, replayed: true, touchedSlideIds: [] };
    }
    if (opts.baseRev !== undefined && opts.baseRev !== ws.rev) {
      const since = await tx.select().from(workspaceOps).where(and(eq(workspaceOps.workspaceId, ws.id), sql`${workspaceOps.rev} > ${opts.baseRev}`));
      const seen = new Map<string, SlideDiff>();
      for (const r of since) { const o = r.op as WorkspaceOp; const sid = slideOf(o); if (sid) seen.set(sid, { slideId: sid, change: kindOf(o) }); }
      return { ok: false, issues: [{ code: "stale_rev", message: `El espacio de trabajo avanzó (rev ${ws.rev}, tú partías de ${opts.baseRev}). Vuelve a leer y reintenta.` }], newRev: ws.rev, appliedOpIds: [], error: "stale_rev", diff: [...seen.values()] };
    }

    // Etapa: el contenido solo se edita en draft/content_review y el diseño desde content_approved. Fuera de ahí `commitCheckpoint` no podría
    // confirmarlo y el espacio de trabajo quedaría con cambios imposibles de confirmar (que bloquearían los siguientes).
    const wrong = ops.map((o, opIndex) => ({ o, opIndex })).filter(({ o }) => (OP_TARGET(o) === "content" ? !CONTENT_STAGES.includes(p.stage) : !DECK_STAGES.includes(p.stage)));
    if (wrong.length) return { ok: false, issues: wrong.map(({ o, opIndex }) => ({ opIndex, code: "wrong_stage", message: OP_TARGET(o) === "content" ? "El contenido ya está aprobado: ya no se edita desde aquí." : "Todavía no se puede editar el diseño: espera a que el docente apruebe el contenido." })), newRev: ws.rev, appliedOpIds: [] };

    const res = applyOpsPure({ deck: ws.deck ? parseDeckAny(ws.deck) : null, content: ws.content ? parseContentAny(ws.content) : null }, ops);
    if (!res.ok) return { ok: false, issues: res.issues, newRev: ws.rev, appliedOpIds: [] };
    if (p.stage === "designing") {
      const busy = await busySlides(tx, presentationId, res.touchedSlideIds);
      if (busy.length) return { ok: false, issues: busy.map((slideId) => ({ code: "slide_busy", slideId, message: `La diapositiva «${slideId}» se está generando ahora; espera a que termine o edita otra.` })), newRev: ws.rev, appliedOpIds: [] };
    }
    const extra: OpIssue[] = [];
    if (res.state.deck && opts.validateDeck && res.touchedSlideIds.length) extra.push(...(await opts.validateDeck(res.state.deck, res.touchedSlideIds)));
    if (res.state.content && opts.validateContent && ops.some((o) => OP_TARGET(o) === "content")) extra.push(...(await opts.validateContent(res.state.content)));
    if (extra.length) return { ok: false, issues: extra, newRev: ws.rev, appliedOpIds: [] };

    if (opts.dryRun) return { ok: true, issues: [], newRev: ws.rev, appliedOpIds: [], batchId: null, touchedSlideIds: res.touchedSlideIds };

    const newRev = ws.rev + 1;
    const batchId = randomUUID();
    const base = opts.opId ?? `auto-${batchId}`;
    await tx.update(workspaces).set({ deck: res.state.deck, content: res.state.content, rev: newRev, dirty: true, updatedAt: new Date() }).where(eq(workspaces.id, ws.id));
    const rows = ops.map((op, idx) => ({ workspaceId: ws.id, rev: newRev, idx, opId: `${base}:${idx}`, author, op, inverse: res.inverses[idx]!, batchId, label: opts.label ?? null }));
    await tx.insert(workspaceOps).values(rows);
    return { ok: true, issues: [], newRev, appliedOpIds: rows.map((r) => r.opId), batchId, touchedSlideIds: res.touchedSlideIds };
  });
}

/** Deshace un lote completo aplicando las inversas en orden inverso como un lote nuevo (deshacer el deshacer = rehacer). */
export async function undoBatch(db: Db, presentationId: string, batchId: string, author: OpAuthor, opts: Pick<ApplyOpts, "ownerId" | "validateDeck" | "label"> & { force?: boolean } = {}): Promise<ApplyResult> {
  const ws = await getWorkspace(db, presentationId, opts.ownerId);
  const rows = await db.select().from(workspaceOps).where(and(eq(workspaceOps.workspaceId, ws.id), eq(workspaceOps.batchId, batchId))).orderBy(desc(workspaceOps.idx));
  if (!rows.length) return { ok: false, issues: [{ code: "not_found", message: "No existe ese lote de cambios" }], newRev: ws.rev, appliedOpIds: [] };
  // No se pisa trabajo posterior: si otro lote tocó las mismas diapositivas después, deshacer sobrescribiría esa edición.
  if (!opts.force) {
    const mine = new Set(rows.map((r) => slideOf(r.op as WorkspaceOp)).filter((x): x is string => !!x));
    const batchRev = rows[0]!.rev;
    const later = await db.select().from(workspaceOps).where(and(eq(workspaceOps.workspaceId, ws.id), sql`${workspaceOps.rev} > ${batchRev}`));
    const clash = [...new Set(later.filter((r) => r.batchId !== batchId).map((r) => slideOf(r.op as WorkspaceOp)).filter((x): x is string => !!x && mine.has(x)))];
    if (clash.length) return { ok: false, issues: [{ code: "undo_conflict", message: `No se puede deshacer: después de ese cambio se editó ${clash.length > 1 ? "las diapositivas" : "la diapositiva"} ${clash.join(", ")}.` }], newRev: ws.rev, appliedOpIds: [] };
  }
  // Las inversas solo revierten cambios ya aplicados (también los de esquema v2): no requieren el flag de escritura.
  return applyOps(db, presentationId, rows.map((r) => r.inverse), author, { ownerId: opts.ownerId, validateDeck: opts.validateDeck, allowV2: true, label: opts.label ?? "Deshacer" });
}

/** Historial de lotes («qué cambió la IA»), el más reciente primero, con las diapositivas que tocó cada uno. */
export async function listBatches(db: Db, presentationId: string, ownerId?: string, limit = 50) {
  const ws = await getWorkspace(db, presentationId, ownerId);
  const rows = await db.select().from(workspaceOps).where(eq(workspaceOps.workspaceId, ws.id)).orderBy(desc(workspaceOps.rev), asc(workspaceOps.idx)).limit(limit * 20);
  const by = new Map<string, { batchId: string; rev: number; author: string; label: string | null; createdAt: Date; ops: number; slides: SlideDiff[] }>();
  for (const r of rows) {
    const b = by.get(r.batchId) ?? { batchId: r.batchId, rev: r.rev, author: r.author, label: r.label, createdAt: r.createdAt, ops: 0, slides: [] };
    b.ops++;
    const o = r.op as WorkspaceOp; const sid = slideOf(o);
    if (sid && !b.slides.some((x) => x.slideId === sid)) b.slides.push({ slideId: sid, change: kindOf(o) });
    by.set(r.batchId, b);
  }
  return { rev: ws.rev, batches: [...by.values()].slice(0, limit) };
}

/** Diferencia entre el workspace y la última versión confirmada (qué hay sin confirmar). */
export async function pendingDiff(db: Db, presentationId: string, ownerId?: string): Promise<SlideDiff[]> {
  const ws = await getWorkspace(db, presentationId, ownerId);
  if (!ws.dirty || !ws.deck) return [];
  const [dv] = ws.baseDeckVersionId ? await db.select().from(deckVersions).where(eq(deckVersions.id, ws.baseDeckVersionId)) : [];
  return diffDecks(dv ? parseDeckAny(dv.deck) : null, parseDeckAny(ws.deck));
}

/** Checkpoint: convierte lo pendiente del workspace en versiones inmutables (deck y/o contenido), como hoy. */
export async function commitCheckpoint(db: Db, presentationId: string, ownerId: string, author: OpAuthor, label: string) {
  return db.transaction(async (tx) => {
    const p = await loadPresentation(tx, presentationId, ownerId);
    const ws = await lockedWorkspace(tx, p);
    if (!ws.dirty) return { committed: false as const, deckVersionId: null, contentVersionId: null, rev: ws.rev };
    const authorKind = author === "ia" || author === "mcp" || author === "docente" ? author : "ia";
    let contentVersionId: string | null = null;
    let deckVersionId: string | null = null;
    const baseC = ws.baseContentVersionId;
    if (ws.content) {
      const [cv] = baseC ? await tx.select().from(contentVersions).where(eq(contentVersions.id, baseC)) : [];
      if (!cv || hashJson(parseContentAny(cv.content)) !== hashJson(parseContentAny(ws.content))) {
        const row = await wf.checkpointContent(tx, presentationId, { content: ws.content, sha256: hashJson(ws.content), baseVersionId: baseC, authorKind, note: label });
        contentVersionId = row.id;
      }
    }
    if (ws.deck) {
      const baseD = ws.baseDeckVersionId;
      const [dv] = baseD ? await tx.select().from(deckVersions).where(eq(deckVersions.id, baseD)) : [];
      if (!dv || hashJson(parseDeckAny(dv.deck)) !== hashJson(parseDeckAny(ws.deck))) {
        const row = await wf.checkpointDeck(tx, presentationId, { deck: ws.deck, sha256: hashJson(ws.deck), baseVersionId: baseD, authorKind, note: label, allowSchemaV2: true });
        deckVersionId = row.id;
      }
    }
    const [after] = await tx.select().from(presentations).where(eq(presentations.id, presentationId));
    const h = headVersions(after!);
    await tx.update(workspaces).set({ dirty: false, baseDeckVersionId: h.deckId, baseContentVersionId: h.contentId, updatedAt: new Date() }).where(eq(workspaces.id, ws.id));
    return { committed: true as const, deckVersionId, contentVersionId, rev: ws.rev };
  });
}

export async function workspaceRevs(db: Db, presentationIds: string[]) {
  if (!presentationIds.length) return [];
  return db.select({ presentationId: workspaces.presentationId, rev: workspaces.rev, dirty: workspaces.dirty }).from(workspaces).where(inArray(workspaces.presentationId, presentationIds));
}
