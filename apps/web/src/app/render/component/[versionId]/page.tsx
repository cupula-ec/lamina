import { notFound } from "next/navigation";
import { and, eq, gt, isNull } from "drizzle-orm";
import { schema } from "@lamina/db";
import { getDb } from "@/lib/db";
import { tokenHash } from "@/lib/presentation-view";
import { ComponentPreview } from "./client";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false } };

/** Vista previa de un componente provisional (primer fixture, 988×750) para capturas. Mismo token de un solo uso que /render/<deck>. */
export default async function Page({ params, searchParams }: { params: Promise<{ versionId: string }>; searchParams: Promise<{ token?: string }> }) {
  const { versionId } = await params;
  const { token } = await searchParams;
  if (!token || !/^[0-9a-f-]{36}$/i.test(versionId)) notFound();
  const db = getDb();
  const used = await db.update(schema.renderTokens).set({ usedAt: new Date() })
    .where(and(eq(schema.renderTokens.tokenHash, tokenHash(token)), eq(schema.renderTokens.deckVersionId, versionId), isNull(schema.renderTokens.usedAt), gt(schema.renderTokens.expiresAt, new Date())))
    .returning({ h: schema.renderTokens.tokenHash });
  if (!used.length) notFound();
  const [v] = await db.select().from(schema.componentVersions).where(eq(schema.componentVersions.id, versionId));
  if (!v) notFound();
  const examples = ((v.manifest as { examples?: { props: unknown }[] }).examples ?? []);
  return <ComponentPreview bundle={v.bundle} props={examples[0]?.props ?? {}} />;
}
