import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { requireUser } from "@/lib/session";
import { CONSENT_TEXT } from "@/lib/consent";
import { NewForm } from "./form";

export const metadata = { title: "Nueva presentación" };
export const dynamic = "force-dynamic";

export default async function NewPresentation() {
  const user = await requireUser();
  return (
    <AppShell user={user}>
      <Link href="/dashboard" className="text-sm font-bold underline underline-offset-4">← Mis presentaciones</Link>
      <h1 className="mt-3 text-3xl font-bold">Nueva presentación</h1>
      <p className="mt-1 max-w-[60ch] text-ink-2">Dos pasos cortos. Todo se puede ajustar después, y nada avanza sin tu aprobación.</p>
      <NewForm consentText={CONSENT_TEXT} />
    </AppShell>
  );
}
