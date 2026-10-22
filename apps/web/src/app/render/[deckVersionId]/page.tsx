import { notFound } from "next/navigation";
import { and, eq, gt, isNull } from "drizzle-orm";
import { DeckDocument } from "@lamina/contracts";
import { hashJson, schema } from "@lamina/db";
import { getDb } from "@/lib/db";
import { provisionalForDeck, tokenHash } from "@/lib/presentation-view";
import { withSignedBranding } from "@/lib/branding";
import { RenderClient } from "./client";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false } };

/**
 * Página de captura para el renderer. NO usa cookies de usuario: exige un token de servicio de un solo uso
 * emitido por el propio renderer (tabla render_tokens, caducidad corta).
 */
export default async function RenderPage({ params, searchParams }: { params: Promise<{ deckVersionId: string }>; searchParams: Promise<{ token?: string; slide?: string; step?: string }> }) {
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
  const prov = await provisionalForDeck(dv.presentationId, dv.componentPins);
  const idx = Math.max(0, Math.min(deck.slides.length - 1, Number(sp.slide ?? 0) || 0));
  const step = sp.step === "max" ? deck.slides[idx]!.build.steps.length : Math.max(0, Number(sp.step ?? 0) || 0);
  return <RenderClient deck={withSignedBranding(deck, 600)} index={idx} step={step} prov={prov} deckHash={hashJson(deck)} storedHash={dv.sha256} />;
}
