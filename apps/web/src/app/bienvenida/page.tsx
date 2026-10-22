import { redirect } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { personalLogoUrl, schema } from "@lamina/db";
import { Brand } from "@/components/Brand";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { ProfileForm } from "./profile-form";

export const metadata = { title: "Bienvenida" };
export const dynamic = "force-dynamic";

export default async function Page() {
  const u = await requireUser({ allowPending: true });
  if (u.mustChangePassword) redirect("/cambiar-clave");
  if (!u.consentAt) redirect("/consentimiento");
  if (u.onboardedAt) redirect("/dashboard");
  const db = getDb();
  const [p] = await db.select().from(schema.userProfiles).where(eq(schema.userProfiles.userId, u.id));
  const institutions = await db.select({ id: schema.institutions.id, name: schema.institutions.name, short: schema.institutions.short }).from(schema.institutions).where(eq(schema.institutions.active, true)).orderBy(asc(schema.institutions.name));
  return (
    <div className="bg-graph min-h-dvh">
      <div className="mx-auto max-w-xl px-5 py-10">
        <Brand href="/bienvenida" />
        <div className="sheet mt-10 p-6 shadow-[6px_6px_0_var(--color-ink)] sm:p-8">
          <h1 className="text-2xl font-bold">Bienvenido a Lámina</h1>
          <p className="mt-2 text-ink-2">Un último paso: cuéntanos cómo quieres aparecer en tus presentaciones. Podrás cambiarlo cuando quieras en «Mi cuenta».</p>
          <ProfileForm mode="onboarding" institutions={institutions} initial={{ fullName: p?.fullName ?? u.name, institutionId: p?.institutionId ?? null, logoUrl: personalLogoUrl(u.id, p?.personalLogoPath ?? null) ?? null }} />
        </div>
      </div>
    </div>
  );
}
