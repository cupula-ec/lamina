import { eq } from "drizzle-orm";
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
    const r = await workspace.undoBatch(db, p.id, run.batchId, "docente", { ownerId: u.id, label: "Deshacer chat" });
    if (!r.ok) throw new LaminaError("invalid_transition", "No se pudo deshacer: el diseño cambió después de ese pedido.", 409);
    await workspace.commitCheckpoint(db, p.id, u.id, "docente", "Deshacer cambio del chat");
    await db.update(schema.chatRuns).set({ undoneAt: new Date() }).where(eq(schema.chatRuns.id, run.id));
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof LaminaError) return NextResponse.json({ error: e.message, code: e.code }, { status: e.status });
    console.error("[chat undo]", e);
    return NextResponse.json({ error: "No se pudo deshacer." }, { status: 500 });
  }
}
