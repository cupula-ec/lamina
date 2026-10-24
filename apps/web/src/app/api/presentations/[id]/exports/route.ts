import { desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { ExportKind, LaminaError } from "@lamina/contracts";
import { consumeQuota, flagEnabled, refundQuota, schema } from "@lamina/db";
import { enqueue } from "@lamina/jobs";
import { getBoss } from "@/lib/boss";
import { getDb } from "@/lib/db";
import { requireOwner } from "@/lib/guard";
import { requireUserApi } from "@/lib/session";

export const dynamic = "force-dynamic";
const fail = (e: unknown) => {
  if (e instanceof LaminaError) return NextResponse.json({ error: e.message, code: e.code }, { status: e.status });
  console.error("[exports]", e);
  return NextResponse.json({ error: "No se pudo procesar la exportación." }, { status: 500 });
};

/** Exportaciones de la presentación (las más recientes primero). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const u = await requireUserApi();
    const p = await requireOwner((await params).id, u.id);
    const rows = await getDb().select({ id: schema.exportsTable.id, kind: schema.exportsTable.kind, status: schema.exportsTable.status, bytes: schema.exportsTable.bytes, error: schema.exportsTable.error, createdAt: schema.exportsTable.createdAt })
      .from(schema.exportsTable).where(eq(schema.exportsTable.presentationId, p.id)).orderBy(desc(schema.exportsTable.createdAt)).limit(10);
    return NextResponse.json({ exports: rows }, { headers: { "cache-control": "no-store" } });
  } catch (e) { return fail(e); }
}

/** Pide una exportación del diseño vigente: se genera en el renderer y se descarga cuando esté lista. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  let taken: string | null = null;
  const db = getDb();
  try {
    const u = await requireUserApi();
    const p = await requireOwner((await params).id, u.id);
    if (!(await flagEnabled(db, "v3_exports", { userId: u.id, presentationId: p.id }))) throw new LaminaError("forbidden", "La exportación todavía no está habilitada para tu cuenta.", 403);
    const kind = ExportKind.safeParse((await req.json().catch(() => ({}))).kind);
    if (!kind.success) throw new LaminaError("invalid_input", "Tipo de exportación no válido.", 400);
    if (kind.data === "student_pdf" && !(await flagEnabled(db, "v3_student_material", { userId: u.id, presentationId: p.id }))) throw new LaminaError("forbidden", "El material del alumno todavía no está habilitado para tu cuenta.", 403);
    const deckId = p.finalDeckVersionId ?? p.currentDeckVersionId;
    if (!deckId) throw new LaminaError("invalid_transition", "Todavía no hay un diseño para exportar.", 409);
    await consumeQuota(db, u.id, "export");
    taken = u.id;
    const [row] = await db.insert(schema.exportsTable).values({ presentationId: p.id, userId: u.id, kind: kind.data, deckVersionId: deckId }).returning({ id: schema.exportsTable.id });
    try { await enqueue(await getBoss(), "export", { presentationId: p.id, userId: u.id, exportId: row!.id, kind: kind.data }, { base: row!.id }); }
    catch (e) { await db.update(schema.exportsTable).set({ status: "failed", error: "No se pudo encolar" }).where(eq(schema.exportsTable.id, row!.id)); throw e; }
    return NextResponse.json({ id: row!.id }, { status: 202 });
  } catch (e) {
    if (taken) await refundQuota(db, taken, "export").catch(() => {});
    return fail(e);
  }
}
