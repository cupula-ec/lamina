import fs from "node:fs/promises";
import path from "node:path";
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { LaminaError } from "@lamina/contracts";
import { schema } from "@lamina/db";
import { getDb } from "@/lib/db";
import { env } from "@/lib/env";
import { requireOwner } from "@/lib/guard";
import { requireUserApi } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string; deckVersionId: string; slideId: string }> }) {
  try {
    const user = await requireUserApi();
    const { id, deckVersionId, slideId } = await params;
    await requireOwner(id, user.id);
    const [a] = await getDb().select().from(schema.renderArtifacts).where(and(eq(schema.renderArtifacts.presentationId, id), eq(schema.renderArtifacts.deckVersionId, deckVersionId), eq(schema.renderArtifacts.slideId, slideId)));
    if (!a?.path) throw new LaminaError("not_found", "Captura no encontrada", 404);
    const root = path.resolve(env().DATA_DIR);
    const file = path.resolve(a.path);
    if (!file.startsWith(root + path.sep)) throw new LaminaError("forbidden", "Ruta no permitida", 403);
    return new NextResponse(new Uint8Array(await fs.readFile(file)), { headers: { "content-type": "image/png", "cache-control": "private, max-age=300" } });
  } catch (e) {
    if (e instanceof LaminaError) return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json({ error: "error" }, { status: 500 });
  }
}
