import { and, desc, eq, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { LaminaError } from "@lamina/contracts";
import { consumeQuota, flagEnabled, refundQuota, schema } from "@lamina/db";
import { enqueue } from "@lamina/jobs";
import { getBoss } from "@/lib/boss";
import { getDb } from "@/lib/db";
import { requireOwner } from "@/lib/guard";
import { requireUserApi } from "@/lib/session";

export const dynamic = "force-dynamic";
const fail = (e: unknown) => {
  if (e instanceof LaminaError) return NextResponse.json({ error: e.message, code: e.code }, { status: e.status });
  console.error("[chat]", e);
  return NextResponse.json({ error: "No se pudo procesar el pedido." }, { status: 500 });
};

async function gate(id: string) {
  const u = await requireUserApi();
  const p = await requireOwner(id, u.id);
  if (!(await flagEnabled(getDb(), "v3_harness_chat", { userId: u.id, presentationId: p.id }))) throw new LaminaError("forbidden", "El chat con Lámina todavía no está habilitado para tu cuenta.", 403);
  return { u, p };
}

/** Últimos pedidos de la presentación (opcionalmente de una diapositiva), del más reciente al más antiguo. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { p } = await gate((await params).id);
    const slide = new URL(req.url).searchParams.get("slide");
    const rows = await getDb().select().from(schema.chatRuns)
      .where(slide ? and(eq(schema.chatRuns.presentationId, p.id), eq(schema.chatRuns.slideId, slide)) : eq(schema.chatRuns.presentationId, p.id))
      .orderBy(desc(schema.chatRuns.createdAt)).limit(12);
    return NextResponse.json({ runs: rows.map((r) => ({ id: r.id, slideId: r.slideId, message: r.message, status: r.status, summary: r.summary, error: r.error, baseDeckVersionId: r.baseDeckVersionId, newDeckVersionId: r.newDeckVersionId, undone: !!r.undoneAt, createdAt: r.createdAt })) }, { headers: { "cache-control": "no-store" } });
  } catch (e) { return fail(e); }
}

const Body = z.object({ slideId: z.string().min(1).max(64), message: z.string().trim().min(3).max(500) });

/** Pide un cambio sobre una diapositiva: se encola el harness y el resultado queda en chat_runs. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  let taken: string | null = null;
  const db = getDb();
  try {
    const { u, p } = await gate((await params).id);
    const body = Body.safeParse(await req.json().catch(() => null));
    if (!body.success) throw new LaminaError("invalid_input", "Escribe qué quieres cambiar (3 a 500 caracteres).", 400);
    if (!["design_review", "final_review", "private_final", "published"].includes(p.stage)) throw new LaminaError("invalid_transition", "Ahora no se puede editar el diseño.", 409);
    const busy = await db.select({ id: schema.chatRuns.id }).from(schema.chatRuns).where(and(eq(schema.chatRuns.presentationId, p.id), inArray(schema.chatRuns.status, ["pending", "running"]))).limit(1);
    if (busy.length) throw new LaminaError("job_in_progress", "Lámina todavía está trabajando en tu pedido anterior.", 409);
    await consumeQuota(db, u.id, "slide_chat");
    taken = u.id;
    const [row] = await db.insert(schema.chatRuns).values({ presentationId: p.id, userId: u.id, slideId: body.data.slideId, message: body.data.message }).returning({ id: schema.chatRuns.id });
    try { await enqueue(await getBoss(), "slide.chat", { presentationId: p.id, userId: u.id, chatId: row!.id }, { base: row!.id }); }
    catch (e) { await db.update(schema.chatRuns).set({ status: "failed", error: "No se pudo encolar", finishedAt: new Date() }).where(eq(schema.chatRuns.id, row!.id)); throw e; }
    return NextResponse.json({ id: row!.id }, { status: 202 });
  } catch (e) {
    if (taken) await refundQuota(db, taken, "slide_chat").catch(() => {});
    return fail(e);
  }
}
