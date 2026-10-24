import { and, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { LaminaError } from "@lamina/contracts";
import { flagEnabled, schema, workspace } from "@lamina/db";
import { getDb } from "@/lib/db";
import { requireOwner } from "@/lib/guard";
import { requireUserApi } from "@/lib/session";

export const dynamic = "force-dynamic";

/** Deshace el lote de un pedido del chat (vuelve el diseño a como estaba) y lo confirma como versión nueva. */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string; chatId: string }> }) {
  try {
    const u = await requireUserApi();
    const { id, chatId } = await params;
    const p = await requireOwner(id, u.id);
    const db = getDb();
    if (!(await flagEnabled(db, "v3_harness_chat", { userId: u.id, presentationId: p.id }))) throw new LaminaError("forbidden", "No habilitado para tu cuenta.", 403);
    if (!/^[0-9a-f-]{36}$/i.test(chatId)) throw new LaminaError("not_found", "Pedido no encontrado", 404);
    const [run] = await db.select().from(schema.chatRuns).where(eq(schema.chatRuns.id, chatId));
    if (!run || run.presentationId !== p.id) throw new LaminaError("not_found", "Pedido no encontrado", 404);
    if (run.status !== "done" || !run.batchId || run.undoneAt) throw new LaminaError("invalid_transition", "Este cambio ya no se puede deshacer.", 409);
    // Se reclama el deshacer de forma atómica: dos clics simultáneos no aplican las inversas dos veces.
    const claimed = await db.update(schema.chatRuns).set({ undoneAt: new Date() }).where(and(eq(schema.chatRuns.id, run.id), isNull(schema.chatRuns.undoneAt))).returning({ id: schema.chatRuns.id });
    if (!claimed.length) throw new LaminaError("invalid_transition", "Este cambio ya se deshizo.", 409);
    const release = () => db.update(schema.chatRuns).set({ undoneAt: null }).where(eq(schema.chatRuns.id, run.id)).catch(() => {});
    const r = await workspace.undoBatch(db, p.id, run.batchId, "docente", { ownerId: u.id, label: "Deshacer chat" });
    if (!r.ok) { await release(); throw new LaminaError("invalid_transition", r.issues[0]?.code === "undo_conflict" ? r.issues[0].message : "No se pudo deshacer: el diseño cambió después de ese pedido.", 409); }
    try { await workspace.commitCheckpoint(db, p.id, u.id, "docente", "Deshacer cambio del chat"); }
    catch (e) { await workspace.undoBatch(db, p.id, r.batchId!, "sistema", { ownerId: u.id, force: true }).catch(() => {}); await release(); throw e; }
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof LaminaError) return NextResponse.json({ error: e.message, code: e.code }, { status: e.status });
    console.error("[chat undo]", e);
    return NextResponse.json({ error: "No se pudo deshacer." }, { status: 500 });
  }
}
