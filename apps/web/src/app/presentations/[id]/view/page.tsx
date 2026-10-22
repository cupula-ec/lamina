import { timingSafeEqual } from "node:crypto";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { schema } from "@lamina/db";
import { getDb } from "@/lib/db";
import { loadDeck, provisionalForDeck, tokenHash } from "@/lib/presentation-view";
import { getSessionUser } from "@/lib/session";
import { withSignedBranding } from "@/lib/branding";
import { ViewClient } from "./client";

export const dynamic = "force-dynamic";
export async function generateMetadata() { return { title: "Presentación", robots: { index: false, follow: false }, referrer: "no-referrer" as const }; }

const eqHex = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

/**
 * Autorización en servidor (el UUID no es un secreto): dueño; o publicada + pública; o publicada + enlace con token vigente.
 * Cualquier otro caso es 404 (no revela si existe).
 */
export default async function ViewPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ t?: string; presenter?: string; draft?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [p] = await getDb().select().from(schema.presentations).where(eq(schema.presentations.id, id));
  if (!p) notFound();
  const user = await getSessionUser();
  const isOwner = !!user && user.id === p.ownerId && !user.mustChangePassword;
  const published = p.stage === "published" && !!p.publishedDeckVersionId;
  let allowed = false;
  if (isOwner) allowed = true;
  else if (published && p.visibility === "public") allowed = true;
  else if (published && p.visibility === "link" && sp.t && p.shareTokenHash) allowed = eqHex(tokenHash(sp.t), p.shareTokenHash);
  if (!allowed) notFound();

  // El dueño puede previsualizar con ?draft=1 los cambios aún no publicados.
  const showDraft = isOwner && sp.draft === "1";
  const deckId = published && !showDraft ? p.publishedDeckVersionId : (p.finalDeckVersionId ?? p.approvedDeckVersionId ?? p.currentDeckVersionId);
  const dv = await loadDeck(deckId ?? null);
  if (!dv) notFound();
  const prov = await provisionalForDeck(p.id, dv.row.componentPins);
  return <ViewClient deck={withSignedBranding(dv.deck, 6 * 3600, p.ownerId)} prov={prov} presenter={sp.presenter === "1" && isOwner} channelKey={`${p.id}:${dv.row.sha256.slice(0, 12)}`} preview={!published || showDraft} backHref={isOwner ? `/presentations/${p.id}/preview/design` : null} />;
}
