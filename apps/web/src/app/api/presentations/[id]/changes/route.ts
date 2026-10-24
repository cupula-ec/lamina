import { NextResponse } from "next/server";
import { LaminaError } from "@lamina/contracts";
import { flagEnabled, workspace } from "@lamina/db";
import { getDb } from "@/lib/db";
import { requireOwner } from "@/lib/guard";
import { requireUserApi } from "@/lib/session";

export const dynamic = "force-dynamic";

/** «Qué cambió la IA»: lotes recientes del espacio de trabajo (autor, etiqueta y diapositivas tocadas). Solo con el editor simplificado. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const u = await requireUserApi();
    const p = await requireOwner((await params).id, u.id);
    const db = getDb();
    if (!(await flagEnabled(db, "v3_editor", { userId: u.id, presentationId: p.id }))) throw new LaminaError("forbidden", "No habilitado para tu cuenta.", 403);
    const { batches } = await workspace.listBatches(db, p.id, u.id, 15);
    return NextResponse.json({ batches: batches.filter((b) => b.author !== "sistema").slice(0, 8).map((b) => ({ batchId: b.batchId, author: b.author, label: b.label, createdAt: b.createdAt, ops: b.ops, slides: b.slides.map((s) => s.slideId) })) }, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    if (e instanceof LaminaError) return NextResponse.json({ error: e.message, code: e.code }, { status: e.status });
    console.error("[changes]", e);
    return NextResponse.json({ error: "No se pudo leer el historial." }, { status: 500 });
  }
}
