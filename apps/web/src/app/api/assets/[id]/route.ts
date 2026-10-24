import fs from "node:fs/promises";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { schema } from "@lamina/db";
import { assetPath } from "@lamina/research";
import { getDb } from "@/lib/db";
import { env } from "@/lib/env";
import { getSessionUser } from "@/lib/session";
import { assetHeaders, isAssetId, verifyAssetSig } from "@/lib/assets";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const notFound = () => new NextResponse("No encontrado", { status: 404 });

/**
 * La imagen la ve su dueño (sesión) o quien reciba una URL firmada y con caducidad, emitida por las páginas ya autorizadas
 * (visor, renderer). Cualquier otro caso es 404, igual que si no existiera. El contenido es inmutable (direccionado por hash).
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isAssetId(id)) return notFound();
  const q = new URL(req.url).searchParams;
  const signed = verifyAssetSig(id.toLowerCase(), q.get("exp"), q.get("sig"));
  const [a] = await getDb().select().from(schema.assets).where(eq(schema.assets.id, id.toLowerCase()));
  if (!a) return notFound();
  if (!signed) {
    const me = await getSessionUser();
    if (!me || me.id !== a.ownerId) return notFound();
  }
  const buf = await fs.readFile(assetPath(env().DATA_DIR, a.sha256)).catch(() => null);
  if (!buf) return notFound();
  return new NextResponse(new Uint8Array(buf), { headers: assetHeaders(signed ? "private, max-age=300" : "private, max-age=3600") });
}
