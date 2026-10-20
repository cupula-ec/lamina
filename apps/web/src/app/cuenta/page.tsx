import { AppShell } from "@/components/AppShell";
import { requireUser } from "@/lib/session";
import { DeleteAccount } from "./delete";
import { PasswordForm } from "./password";

export const metadata = { title: "Mi cuenta" };
export const dynamic = "force-dynamic";

export default async function Cuenta() {
  const u = await requireUser();
  return (
    <AppShell user={u}>
      <h1 className="text-3xl font-bold">Mi cuenta</h1>
      <p className="mt-1 text-ink-2">{u.name} · {u.email}</p>
      <div className="mt-8 grid max-w-3xl gap-8">
        <section className="sheet p-5"><h2 className="text-xl font-bold">Cambiar contraseña</h2><PasswordForm /></section>
        <section className="sheet border-pen p-5"><h2 className="text-xl font-bold text-pen">Eliminar mi cuenta</h2>
          <p className="mt-2 max-w-[60ch]">Se borrarán tu cuenta, todas tus presentaciones con sus versiones, fuentes, archivos subidos y capturas. No se puede deshacer.</p>
          <DeleteAccount email={u.email} /></section>
      </div>
    </AppShell>
  );
}
