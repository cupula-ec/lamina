import { and, eq, gt, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { DeckDocument } from "@lamina/contracts";
import { schema } from "@lamina/db";
import { getDb } from "@/lib/db";
import { provisionalForDeck, tokenHash } from "@/lib/presentation-view";
import { withSignedBranding } from "@/lib/branding";
import { withSignedAssets } from "@/lib/assets";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Datos del deck para la exportación offline (solo el renderer). Igual que las páginas de captura: exige un token de servicio de un
 * solo uso (render_tokens) y devuelve el deck con las URLs de marca e imágenes ya firmadas para que el renderer las descargue.
 */
export async function GET(req: Request, { params }: { params: Promise<{ deckVersionId: string }> }) {
  const { deckVersionId } = await params;
  const token = new URL(req.url).searchParams.get("token");
  if (!token || !/^[0-9a-f-]{36}$/i.test(deckVersionId)) return new NextResponse("No encontrado", { status: 404 });
  const db = getDb();
  const used = await db.update(schema.renderTokens).set({ usedAt: new Date() })
    .where(and(eq(schema.renderTokens.tokenHash, tokenHash(token)), eq(schema.renderTokens.deckVersionId, deckVersionId), isNull(schema.renderTokens.usedAt), gt(schema.renderTokens.expiresAt, new Date())))
    .returning({ h: schema.renderTokens.tokenHash });
  if (!used.length) return new NextResponse("No encontrado", { status: 404 });
  const [dv] = await db.select().from(schema.deckVersions).where(eq(schema.deckVersions.id, deckVersionId));
  if (!dv) return new NextResponse("No encontrado", { status: 404 });
  const [pres] = await db.select({ ownerId: schema.presentations.ownerId }).from(schema.presentations).where(eq(schema.presentations.id, dv.presentationId));
  if (!pres) return new NextResponse("No encontrado", { status: 404 });
  const deck = DeckDocument.parse(dv.deck);
  const prov = await provisionalForDeck(dv.presentationId, dv.componentPins);
  const signed = await withSignedAssets(withSignedBranding(deck, 600, pres.ownerId), 600, pres.ownerId);
  return NextResponse.json({ deck: signed, prov }, { headers: { "cache-control": "no-store" } });
}
