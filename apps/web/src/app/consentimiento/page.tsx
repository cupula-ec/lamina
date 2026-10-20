import { redirect } from "next/navigation";
import { Brand } from "@/components/Brand";
import { requireUser } from "@/lib/session";
import { CONSENT_TEXT } from "@/lib/consent";
import { ConsentForm } from "./form";

export const metadata = { title: "Antes de empezar" };
export const dynamic = "force-dynamic";

export default async function Page() {
  const u = await requireUser({ allowPending: true });
  if (u.mustChangePassword) redirect("/cambiar-clave");
  if (u.consentAt) redirect("/dashboard");
  return (
    <div className="bg-graph min-h-dvh">
      <div className="mx-auto max-w-xl px-5 py-10">
        <Brand href="/consentimiento" />
        <div className="sheet mt-10 p-6 shadow-[6px_6px_0_var(--color-ink)] sm:p-8">
          <h1 className="text-2xl font-bold">Antes de empezar: tus datos y la IA</h1>
          <p className="mt-3 text-ink-2">Lámina usa modelos de IA gratuitos de terceros. Esto es lo que debes saber:</p>
          <ul className="mt-3 list-disc space-y-2 pl-5">
            <li>El tema, tus apuntes, los archivos que subas y las páginas que Lámina consulte se envían a esos proveedores.</li>
            <li>Ellos pueden <strong>retener esos textos</strong> y usarlos según sus propias políticas.</li>
            <li>Por eso no subas datos personales de estudiantes ni material confidencial.</li>
            <li>Tú revisas y apruebas todo antes de proyectarlo. Más detalle en la <a className="underline" href="/privacidad" target="_blank">política de privacidad</a>.</li>
          </ul>
          <ConsentForm text={CONSENT_TEXT} />
        </div>
      </div>
    </div>
  );
}
