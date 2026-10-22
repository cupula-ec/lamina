import { redirect } from "next/navigation";
import { Brand } from "@/components/Brand";
import { getSessionUser } from "@/lib/session";
import { env } from "@/lib/env";
import { LoginForm } from "./form";

export const metadata = { title: "Entrar" };
export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; sig?: string }> }) {
  const u = await getSessionUser();
  const sp = await searchParams;
  if (u && !sp.sig) redirect("/dashboard");
  const e = env();
  return (
    <div className="bg-graph min-h-dvh">
      <div className="mx-auto max-w-md px-5 py-10">
        <Brand />
        <div className="sheet mt-10 p-6 card-hard sm:p-8">
          <h1 className="text-2xl font-bold">Entrar a Lámina</h1>
          <LoginForm google={!!e.GOOGLE_CLIENT_ID} keycloak={!!e.KEYCLOAK_CLIENT_ID} initialError={sp.error} />
        </div>
        <p className="mt-6 text-sm text-ink-2">
          ¿Aún no tienes acceso? Lámina funciona por invitación. Escríbenos desde <a className="underline underline-offset-4" href="https://systems.cupula.com.ec">systems.cupula.com.ec</a>.
        </p>
      </div>
    </div>
  );
}
