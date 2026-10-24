import Link from "next/link";
import { asc, sql } from "drizzle-orm";
import { institutionLogoUrl, schema } from "@lamina/db";
import { AppShell } from "@/components/AppShell";
import { getDb } from "@/lib/db";
import { requireAdmin } from "@/lib/session";
import { InstitutionsPanel } from "./form";

export const metadata = { title: "Instituciones" };
export const dynamic = "force-dynamic";

export default async function Instituciones() {
  const user = await requireAdmin();
  const db = getDb();
  const rows = await db.select().from(schema.institutions).orderBy(asc(schema.institutions.name));
  const counts = await db.select({ id: schema.userProfiles.institutionId, n: sql<number>`count(*)::int` }).from(schema.userProfiles).where(sql`${schema.userProfiles.institutionId} is not null`).groupBy(schema.userProfiles.institutionId);
  const nBy = new Map(counts.map((c) => [c.id, c.n]));
  return (
    <AppShell user={user}>
      <Link href="/admin" className="text-sm font-bold underline underline-offset-4">← Administración</Link>
      <h1 className="mt-3 text-3xl font-bold">Instituciones</h1>
      <p className="mt-1 max-w-[65ch] text-ink-2">Las instituciones activas aparecen en el listado de los docentes y su logo y colores se usan en la carátula de las presentaciones.</p>
      <div className="mt-6">
        <InstitutionsPanel items={rows.map((i) => ({ id: i.id, name: i.name, short: i.short, slug: i.slug, primaryColor: i.primaryColor, secondaryColor: i.secondaryColor, active: i.active, logoUrl: institutionLogoUrl(i) ?? null, users: nBy.get(i.id) ?? 0, verified: i.verified }))} />
      </div>
    </AppShell>
  );
}
