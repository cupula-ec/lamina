import { notFound } from "next/navigation";
import { and, eq, gt, isNull } from "drizzle-orm";
import { schema } from "@lamina/db";
import { MaterialDoc } from "@/components/MaterialDoc";
import { getDb } from "@/lib/db";
import { tokenHash } from "@/lib/presentation-view";
import { loadMaterial } from "@/lib/student-material-server";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false } };

/** Documento del alumno para `page.pdf()` del renderer (A4). Mismo token de servicio de un solo uso que /render. */
export default async function MaterialPrintPage({ params, searchParams }: { params: Promise<{ deckVersionId: string }>; searchParams: Promise<{ token?: string }> }) {
  const { deckVersionId } = await params;
  const sp = await searchParams;
  if (!sp.token || !/^[0-9a-f-]{36}$/i.test(deckVersionId)) notFound();
  const db = getDb();
  const used = await db.update(schema.renderTokens).set({ usedAt: new Date() })
    .where(and(eq(schema.renderTokens.tokenHash, tokenHash(sp.token)), eq(schema.renderTokens.deckVersionId, deckVersionId), isNull(schema.renderTokens.usedAt), gt(schema.renderTokens.expiresAt, new Date())))
    .returning({ h: schema.renderTokens.tokenHash });
  if (!used.length) notFound();
  const [dv] = await db.select({ presentationId: schema.deckVersions.presentationId }).from(schema.deckVersions).where(eq(schema.deckVersions.id, deckVersionId));
  if (!dv) notFound();
  const [p] = await db.select().from(schema.presentations).where(eq(schema.presentations.id, dv.presentationId));
  if (!p) notFound();
  const m = await loadMaterial(p, deckVersionId);
  if (!m) notFound();
  const byline = [p.subject, p.period, p.groupName].filter(Boolean).join(" · ");
  return <main className="bg-white"><MaterialDoc m={m.material} byline={byline || undefined} /><div id="mt-ready" data-ready="1" /></main>;
}
