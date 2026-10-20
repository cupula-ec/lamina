import { redirect } from "next/navigation";
import { Brand } from "@/components/Brand";
import { requireUser } from "@/lib/session";
import { ChangePasswordForm } from "./form";

export const metadata = { title: "Crea tu contraseña" };
export const dynamic = "force-dynamic";

export default async function Page() {
  const u = await requireUser({ allowPending: true });
  if (!u.mustChangePassword) redirect("/dashboard");
  return (
    <div className="bg-graph min-h-dvh">
      <div className="mx-auto max-w-md px-5 py-10">
        <Brand href="/cambiar-clave" />
        <div className="sheet mt-10 p-6 shadow-[6px_6px_0_var(--color-ink)] sm:p-8">
          <h1 className="text-2xl font-bold">Crea tu contraseña</h1>
          <p className="mt-2 text-ink-2">Ingresaste con una contraseña temporal. Elige una propia para continuar (mínimo 10 caracteres).</p>
          <ChangePasswordForm />
        </div>
      </div>
    </div>
  );
}
