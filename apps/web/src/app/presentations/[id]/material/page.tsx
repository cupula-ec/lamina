import { timingSafeEqual } from "node:crypto";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { flagEnabled, schema } from "@lamina/db";
import { MaterialDoc } from "@/components/MaterialDoc";
import { getDb } from "@/lib/db";
import { tokenHash } from "@/lib/presentation-view";
import { getSessionUser } from "@/lib/session";
import { loadMaterial } from "@/lib/student-material-server";

export const dynamic = "force-dynamic";
export async function generateMetadata() { return { title: "Material de estudio", robots: { index: false, follow: false }, referrer: "no-referrer" as const }; }
const eqHex = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

/**
 * Material del alumno (V3 §5.8). Misma autorización que el visor: el dueño; o presentación publicada + pública; o publicada + enlace con token.
 * Cualquier otro caso es 404. Solo existe con el flag `v3_student_material` del dueño.
 */
export default async function MaterialPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ t?: string; print?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const db = getDb();
  const [p] = await db.select().from(schema.presentations).where(eq(schema.presentations.id, id));
  if (!p) notFound();
  const user = await getSessionUser();
  const isOwner = !!user && user.id === p.ownerId && !user.mustChangePassword;
  const published = p.stage === "published" && !!p.publishedDeckVersionId;
  let allowed = isOwner;
  if (!allowed && published && p.visibility === "public") allowed = true;
  if (!allowed && published && p.visibility === "link" && sp.t && p.shareTokenHash) allowed = eqHex(tokenHash(sp.t), p.shareTokenHash);
  if (!allowed || !(await flagEnabled(db, "v3_student_material", { userId: p.ownerId, presentationId: p.id }))) notFound();
  const m = await loadMaterial(p, published && !isOwner ? p.publishedDeckVersionId : (p.finalDeckVersionId ?? p.currentDeckVersionId));
  if (!m) notFound();
  const byline = [p.subject, p.period, p.groupName].filter(Boolean).join(" · ");
  return <main className="min-h-dvh bg-white"><MaterialDoc m={m.material} byline={byline || undefined} /></main>;
}
