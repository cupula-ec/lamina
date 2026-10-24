import { eq } from "drizzle-orm";
import { ContentDraft, DeckDocument, type SlideHint } from "@lamina/contracts";
import { QuotaWaitError } from "@lamina/ai";
import { flagEnabled, schema, workflow as wf, workspace } from "@lamina/db";
import { deckValidatorFor } from "@lamina/components";
import { enqueue } from "@lamina/jobs";
import type { Ctx } from "../ctx";
import { loadProvisional, lookupFor, manifestsFor } from "../catalog";
import { runHarness } from "../harness";
import { harnessImageTools } from "../images";
import { ownsHint } from "./design";

type StoredIssue = { slot: string | null; kind: string; severity: string; message: string; detail?: string; ignored?: boolean };
const short = (s: string) => s.slice(0, 300);

/**
 * «Chat con Lámina» sobre una diapositiva (V3 §5.8): el harness (herramientas pequeñas, solo esa diapositiva) aplica la orden del docente
 * como UN lote de ops (deshacer por lote), se confirma como versión nueva del diseño y se vuelve a renderizar. Todo o nada.
 */
export async function slideChat(ctx: Ctx, data: { presentationId: string; userId: string; chatId: string }, signal?: AbortSignal) {
  const db = ctx.db;
  const [run] = await db.select().from(schema.chatRuns).where(eq(schema.chatRuns.id, data.chatId));
  if (!run || run.presentationId !== data.presentationId || run.status === "done" || run.status === "noop" || run.status === "failed") return;
  const finish = (status: "done" | "noop" | "failed", extra: Partial<typeof schema.chatRuns.$inferInsert> = {}) =>
    db.update(schema.chatRuns).set({ status, finishedAt: new Date(), ...extra }).where(eq(schema.chatRuns.id, run.id));
  await db.update(schema.chatRuns).set({ status: "running" }).where(eq(schema.chatRuns.id, run.id));
  try {
    const [p] = await db.select().from(schema.presentations).where(eq(schema.presentations.id, data.presentationId));
    if (!p || p.ownerId !== data.userId) return void (await finish("failed", { error: "Presentación no encontrada." }));
    const headId = wf.headDeckVersionId(p);
    if (!wf.EDITABLE_STAGES.includes(p.stage as never) || !headId || !p.approvedContentVersionId) return void (await finish("failed", { error: "Ahora no se puede editar el diseño (espera a que termine el trabajo en curso)." }));
    const [dv] = await db.select().from(schema.deckVersions).where(eq(schema.deckVersions.id, headId));
    const deck = DeckDocument.parse(dv!.deck);
    if (!deck.slides.some((s) => s.id === run.slideId)) return void (await finish("failed", { error: "Esa diapositiva ya no existe." }));
    const [cv] = await db.select().from(schema.contentVersions).where(eq(schema.contentVersions.id, p.approvedContentVersionId));
    const hints: SlideHint[] = cv ? ContentDraft.parse(cv.content).sections.flatMap((s) => s.slidesHint) : [];
    const hint = hints.find((h) => ownsHint(h.id, run.slideId));
    const arts = await db.select().from(schema.renderArtifacts).where(eq(schema.renderArtifacts.deckVersionId, headId));
    const issues = ((arts.find((a) => a.slideId === run.slideId)?.issues ?? []) as StoredIssue[]).filter((i) => !i.ignored);
    const prov = await loadProvisional(ctx, p.id);
    const on = (await Promise.all((["v3_images", "v3_areas", "v3_pedagogy"] as const).map(async (f) => ((await flagEnabled(db, f, { userId: p.ownerId, presentationId: p.id })) ? f : null)))).filter((f): f is NonNullable<typeof f> => !!f);
    const lookup = lookupFor(prov);

    const ws = await workspace.getWorkspace(db, p.id, p.ownerId);
    const r = await runHarness({
      ctx, presentationId: p.id, ownerId: p.ownerId, deck, slideId: run.slideId, hint, manifests: manifestsFor(prov, on), lookup, signal,
      goal: `Pedido del docente para esta diapositiva: «${run.message}». Cumple el pedido sin perder el contenido ni las fórmulas; si es ambiguo, haz lo más razonable.`,
      issues: issues.map((i) => ({ slot: i.slot, kind: i.kind, severity: i.severity, message: i.message, detail: i.detail })),
      images: on.includes("v3_images") ? harnessImageTools(ctx, p) : undefined,
    });
    if (!r.ok) return void (await finish("failed", { error: r.reason === "sin cupo de IA ahora" ? "Los modelos gratuitos están sin cupo ahora; inténtalo en unos minutos." : "No pude completar ese cambio. Prueba con un pedido más concreto (por ejemplo: «agrega un ejemplo», «acorta el texto»).", steps: r.steps, calls: r.calls }));
    if (!r.ops.length) return void (await finish("noop", { summary: short(r.summary || "No hizo falta cambiar nada."), steps: r.steps, calls: r.calls }));

    const applied = await workspace.applyOps(db, p.id, r.ops, "ia", { ownerId: p.ownerId, baseRev: ws.rev, label: short(`Chat: ${run.message}`), validateDeck: deckValidatorFor(lookup), allowV2: deck.schemaVersion === 2 });
    if (!applied.ok) return void (await finish("failed", { error: "El cambio no pasó las validaciones del diseño; no se aplicó nada.", summary: short(applied.issues.map((i) => i.message).join("; ")), steps: r.steps, calls: r.calls }));
    const cp = await workspace.commitCheckpoint(db, p.id, p.ownerId, "ia", short(`Chat con Lámina: ${run.message}`));
    const versionId = cp.deckVersionId;
    if (versionId) await enqueue(ctx.boss, "render", { presentationId: p.id, deckVersionId: versionId }, { base: versionId }).catch(() => {});
    await finish("done", { summary: short(r.summary), baseDeckVersionId: headId, newDeckVersionId: versionId, batchId: applied.batchId, steps: r.steps, calls: r.calls });
  } catch (e) {
    if (e instanceof QuotaWaitError) return void (await finish("failed", { error: "Los modelos gratuitos están sin cupo ahora; inténtalo en unos minutos." }));
    ctx.log(`chat: error ${(e as Error).message}`, { id: data.presentationId });
    await finish("failed", { error: "Ocurrió un error inesperado. Tu diseño no cambió." }).catch(() => {});
  }
}
