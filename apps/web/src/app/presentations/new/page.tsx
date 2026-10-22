import Link from "next/link";
import { Plug, Wand2 } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
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
      <PageHeader back={{ href: "/dashboard", label: "Mis presentaciones" }} title="Nueva presentación" lead="Dos pasos cortos. Todo se puede ajustar después, y nada avanza sin tu aprobación." />
      <div className="grid max-w-3xl gap-4 sm:grid-cols-2" role="group" aria-label="Cómo crear la presentación">
        <div className="sheet card-hard border-blue p-4" aria-current="true">
          <p className="flex items-center gap-2 font-bold"><Wand2 size={18} aria-hidden />Con Lámina</p>
          <p className="mt-1 text-sm text-ink-2">Cuéntanos el tema y, si quieres, sube tus materiales. Lámina investiga y redacta.</p>
        </div>
        <Link href="/conectar" className="sheet block p-4 no-underline hover:bg-paper-2">
          <p className="flex items-center gap-2 font-bold"><Plug size={18} aria-hidden />Crear con mi IA</p>
          <p className="mt-1 text-sm text-ink-2">Pídele la presentación a Claude u otra IA conectada a tu cuenta. <span className="font-bold underline underline-offset-4">Conectar</span></p>
        </Link>
      </div>
      <NewForm consentText={CONSENT_TEXT} />
    </AppShell>
  );
}
