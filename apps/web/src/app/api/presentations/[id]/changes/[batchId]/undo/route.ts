import { NextResponse } from "next/server";
import { LaminaError } from "@lamina/contracts";
import { flagEnabled, workspace } from "@lamina/db";
import { getDb } from "@/lib/db";
import { requireOwner } from "@/lib/guard";
import { requireUserApi } from "@/lib/session";

export const dynamic = "force-dynamic";

/** Deshace un lote del historial (IA o IA externa) y lo confirma como versión nueva. Se rechaza si después se editó la misma diapositiva. */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string; batchId: string }> }) {
  try {
    const u = await requireUserApi();
    const { id, batchId } = await params;
    const p = await requireOwner(id, u.id);
    const db = getDb();
    if (!(await flagEnabled(db, "v3_editor", { userId: u.id, presentationId: p.id }))) throw new LaminaError("forbidden", "No habilitado para tu cuenta.", 403);
    if (!/^[0-9a-f-]{36}$/i.test(batchId)) throw new LaminaError("not_found", "Cambio no encontrado", 404);
    const w = await workspace.getWorkspace(db, p.id, u.id);
    if (w.dirty) throw new LaminaError("invalid_transition", "Hay cambios sin confirmar; confírmalos antes de deshacer.", 409);
    const r = await workspace.undoBatch(db, p.id, batchId, "docente", { ownerId: u.id, label: "Deshacer desde el historial" });
    if (!r.ok) throw new LaminaError("invalid_transition", r.issues[0]?.message ?? "No se pudo deshacer.", 409);
    try { await workspace.commitCheckpoint(db, p.id, u.id, "docente", "Deshacer desde el historial"); }
    catch (e) { await workspace.undoBatch(db, p.id, r.batchId!, "sistema", { ownerId: u.id, force: true }).catch(() => {}); throw e; }
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof LaminaError) return NextResponse.json({ error: e.message, code: e.code }, { status: e.status });
    console.error("[changes undo]", e);
    return NextResponse.json({ error: "No se pudo deshacer." }, { status: 500 });
  }
}
