import { Check, X } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Callout } from "@/components/ui/Callout";
import { PageHeader } from "@/components/ui/PageHeader";
import { getDb } from "@/lib/db";
import { env } from "@/lib/env";
import { listConnections, mcpEnabled } from "@/lib/mcp-access";
import { requireUser } from "@/lib/session";
import { SCOPE_TEXT } from "../cuenta/conectar/scopes";
import { Connections } from "./connections";
import { ConnectGuide } from "./guide";

export const metadata = { title: "Conectar con IA" };
export const dynamic = "force-dynamic";

const CAN = ["Ver solo tus presentaciones y en qué etapa están", "Crear borradores", "Enviar contenido y diseños para que los revises"];
const CANNOT = ["Aprobar, publicar, compartir o borrar nada", "Ver las presentaciones de otras personas", "Ejecutar código en Lámina: todo lo que envía se valida"];

export default async function Conectar() {
  const u = await requireUser();
  const db = getDb();
  const url = `${env().APP_URL.replace(/\/$/, "")}/api/mcp`;
  const [enabled, items] = await Promise.all([mcpEnabled(db), listConnections(db, u.id)]);
  return (
    <AppShell user={u}>
      <PageHeader title="Conectar con IA" lead={<>Conecta una IA potente (por ejemplo Claude) a tu cuenta para que redacte y proponga el diseño usando los componentes, estilos y verificación matemática de Lámina. <strong>Ella no publica nada</strong>: lo que envía llega como borrador y tú revisas y apruebas.</>} />
      {!enabled && <Callout tone="warn" className="mb-6" title="Función desactivada temporalmente">Un administrador la desactivó. Tus conexiones siguen guardadas, pero no funcionarán hasta que se active.</Callout>}

      <div className="grid max-w-4xl gap-8">
        <section className="sheet card-feature p-5 sm:p-6" aria-labelledby="cx">
          <h2 id="cx" className="font-display text-xl font-bold">1. Conecta tu IA</h2>
          <p className="mb-4 mt-1 text-ink-2">Elige la aplicación que usas y sigue los pasos.</p>
          <ConnectGuide url={url} connected={items.length > 0} />
        </section>

        <section className="sheet p-5 sm:p-6" aria-labelledby="pr">
          <h2 id="pr" className="font-display text-xl font-bold">2. Pídele una presentación</h2>
          <p className="mt-1 text-ink-2">Ya conectada, escribe algo así en tu IA:</p>
          <blockquote className="mt-3 max-w-[64ch] border-l-4 border-ink bg-paper-2 p-4 font-display">«Usa Lámina para crear una presentación de Cálculo I sobre la regla de la cadena para primer ciclo. Lee primero la guía de autoría.»</blockquote>
          <p className="mt-3 text-sm text-ink-2">La presentación aparecerá en <strong>Mis presentaciones</strong> como «Desde tu IA», lista para que la revises.</p>
        </section>

        <section className="sheet p-5 sm:p-6" aria-labelledby="ap">
          <h2 id="ap" className="font-display text-xl font-bold">Aplicaciones autorizadas</h2>
          <Connections items={items.map((c) => ({ clientId: c.clientId, name: c.name, host: c.host, scopes: c.scopes.map((s) => SCOPE_TEXT[s] ?? s), authorizedAt: c.authorizedAt?.toISOString() ?? null, lastUsedAt: c.lastUsedAt?.toISOString() ?? null, calls: c.calls }))} />
        </section>

        <section className="sheet p-5 sm:p-6" aria-labelledby="pv">
          <h2 id="pv" className="font-display text-xl font-bold">Qué puede y qué no puede hacer</h2>
          <div className="mt-3 grid gap-5 sm:grid-cols-2">
            <ul className="space-y-2">{CAN.map((t) => <li key={t} className="flex gap-2"><Check size={18} className="mt-0.5 flex-none text-ok" aria-label="Puede" />{t}</li>)}</ul>
            <ul className="space-y-2">{CANNOT.map((t) => <li key={t} className="flex gap-2"><X size={18} className="mt-0.5 flex-none text-pen" aria-label="No puede" />{t}</li>)}</ul>
          </div>
          <ul className="mt-4 max-w-[68ch] list-disc space-y-1 pl-5 text-sm text-ink-2">
            <li>Lo que la IA lea de tus presentaciones lo procesa su proveedor (por ejemplo Anthropic) según sus condiciones; Lámina no le envía tus archivos subidos.</li>
            <li>El gasto de IA lo asume tu cuenta con ese proveedor; Lámina no usa su cupo gratuito para esto.</li>
            <li>Puedes revocar el acceso en cualquier momento y se corta de inmediato. Lo que envíe aparece como «Creado por IA externa».</li>
          </ul>
        </section>
      </div>
    </AppShell>
  );
}
