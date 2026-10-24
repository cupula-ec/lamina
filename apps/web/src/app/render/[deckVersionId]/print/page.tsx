import { notFound } from "next/navigation";
import { and, eq, gt, isNull } from "drizzle-orm";
import { DeckDocument } from "@lamina/contracts";
import { schema } from "@lamina/db";
import { getDb } from "@/lib/db";
import { provisionalForDeck, tokenHash } from "@/lib/presentation-view";
import { withSignedBranding } from "@/lib/branding";
import { PrintClient } from "./client";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false } };

/** Todas las diapositivas en su paso final, una por página 1920×1080, para `page.pdf()` del renderer. Mismo token de servicio de un solo uso que /render. */
export default async function PrintPage({ params, searchParams }: { params: Promise<{ deckVersionId: string }>; searchParams: Promise<{ token?: string }> }) {
  const { deckVersionId } = await params;
  const sp = await searchParams;
  if (!sp.token || !/^[0-9a-f-]{36}$/i.test(deckVersionId)) notFound();
  const db = getDb();
  const used = await db.update(schema.renderTokens).set({ usedAt: new Date() })
    .where(and(eq(schema.renderTokens.tokenHash, tokenHash(sp.token)), eq(schema.renderTokens.deckVersionId, deckVersionId), isNull(schema.renderTokens.usedAt), gt(schema.renderTokens.expiresAt, new Date())))
    .returning({ h: schema.renderTokens.tokenHash });
  if (!used.length) notFound();
  const [dv] = await db.select().from(schema.deckVersions).where(eq(schema.deckVersions.id, deckVersionId));
  if (!dv) notFound();
  const deck = DeckDocument.parse(dv.deck);
  const [pres] = await db.select({ ownerId: schema.presentations.ownerId }).from(schema.presentations).where(eq(schema.presentations.id, dv.presentationId));
  if (!pres) notFound();
  const prov = await provisionalForDeck(dv.presentationId, dv.componentPins);
  return <PrintClient deck={withSignedBranding(deck, 900, pres.ownerId)} prov={prov} />;
}
