import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { personalLogoUrl, schema } from "@lamina/db";
import { AppShell } from "@/components/AppShell";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { ProfileForm } from "../bienvenida/profile-form";
import { DeleteAccount } from "./delete";
import { PasswordForm } from "./password";

export const metadata = { title: "Mi cuenta" };
export const dynamic = "force-dynamic";

export default async function Cuenta() {
  const u = await requireUser();
  const db = getDb();
  const [p] = await db.select().from(schema.userProfiles).where(eq(schema.userProfiles.userId, u.id));
  const institutions = await db.select({ id: schema.institutions.id, name: schema.institutions.name, short: schema.institutions.short, active: schema.institutions.active }).from(schema.institutions).orderBy(asc(schema.institutions.name));
  const visible = institutions.filter((i) => i.active || i.id === p?.institutionId);
  return (
    <AppShell user={u}>
      <h1 className="text-3xl font-bold">Mi cuenta</h1>
      <p className="mt-1 text-ink-2">{u.name} · {u.email}</p>
      <div className="mt-8 grid max-w-3xl gap-8">
        <section className="sheet p-5"><h2 className="text-xl font-bold">Tu perfil y marca</h2>
          <p className="mt-1 max-w-[60ch] text-ink-2">Tu logo se mostrará junto al de tu institución en las carátulas de las presentaciones nuevas. Las ya diseñadas se actualizan al editar sus datos de carátula.</p>
          <ProfileForm mode="account" institutions={visible} initial={{ fullName: p?.fullName ?? u.name, institutionId: p?.institutionId ?? null, logoUrl: personalLogoUrl(u.id, p?.personalLogoPath ?? null) ?? null }} /></section>
        <section className="sheet p-5"><h2 className="text-xl font-bold">Conectar con IA</h2>
          <p className="mt-1 max-w-[60ch] text-ink-2">Usa una IA potente (como Claude) para redactar y diseñar presentaciones en tu cuenta. Tú sigues aprobando todo en Lámina.</p>
          <Link href="/cuenta/conectar" className="btn mt-3 inline-block">Conectar con IA</Link></section>
        <section className="sheet p-5"><h2 className="text-xl font-bold">Cambiar contraseña</h2><PasswordForm /></section>
        <section className="sheet border-pen p-5"><h2 className="text-xl font-bold text-pen">Eliminar mi cuenta</h2>
          <p className="mt-2 max-w-[60ch]">Se borrarán tu cuenta, todas tus presentaciones con sus versiones, fuentes, archivos subidos y capturas. No se puede deshacer.</p>
          <DeleteAccount email={u.email} /></section>
      </div>
    </AppShell>
  );
}
