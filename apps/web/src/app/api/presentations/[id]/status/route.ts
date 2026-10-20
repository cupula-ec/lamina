import { NextResponse } from "next/server";
import { LaminaError } from "@lamina/contracts";
import { requireUserApi } from "@/lib/session";
import { requireOwner } from "@/lib/guard";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUserApi();
    const p = await requireOwner((await params).id, user.id);
    return NextResponse.json({
      stage: p.stage, lastError: p.lastError, resumeAt: p.resumeAt, updatedAt: p.updatedAt,
      currentContentVersionId: p.currentContentVersionId, currentDeckVersionId: p.currentDeckVersionId, finalDeckVersionId: p.finalDeckVersionId,
    }, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    if (e instanceof LaminaError) return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json({ error: "error" }, { status: 500 });
  }
}
