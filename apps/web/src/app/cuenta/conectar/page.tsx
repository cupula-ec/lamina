import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { getDb } from "@/lib/db";
import { env } from "@/lib/env";
import { listConnections, mcpEnabled } from "@/lib/mcp-access";
import { requireUser } from "@/lib/session";
import { Connections } from "./connections";
import { CopyBox } from "./copy";
import { SCOPE_TEXT } from "./scopes";

export const metadata = { title: "Conectar con IA" };
export const dynamic = "force-dynamic";

export default async function Conectar() {
  const u = await requireUser();
  const db = getDb();
  const url = `${env().APP_URL.replace(/\/$/, "")}/api/mcp`;
  const [enabled, items] = await Promise.all([mcpEnabled(db), listConnections(db, u.id)]);
  return (
    <AppShell user={u}>
      <Link href="/cuenta" className="text-sm font-bold underline underline-offset-4">← Mi cuenta</Link>
      <h1 className="mt-3 text-3xl font-bold">Conectar con IA</h1>
      <p className="mt-2 max-w-[68ch] text-ink-2">
        Si usas una IA potente (por ejemplo Claude), puedes conectarla a tu cuenta para que redacte el contenido y proponga el diseño de una presentación usando los
        componentes, estilos y verificación matemática de Lámina. Ella no publica nada: lo que envía llega como borrador a tu lista y <strong>tú revisas y apruebas</strong> en Lámina, como siempre.
      </p>
      {!enabled && <p role="status" className="sheet mt-5 border-pen p-4 font-bold">Esta función está desactivada temporalmente por un administrador. Tus conexiones siguen guardadas, pero no funcionarán hasta que se active.</p>}

      <div className="mt-8 grid max-w-4xl gap-8">
        <section className="sheet p-5" aria-labelledby="cx">
          <h2 id="cx" className="text-xl font-bold">1. Conectar</h2>
          <p className="mt-1 text-ink-2">Dirección del servidor MCP de Lámina:</p>
          <CopyBox label="Dirección del servidor" value={url} />
          <p className="mt-4 font-bold">En Claude Code (terminal):</p>
          <CopyBox label="Comando para Claude Code" value={`claude mcp add --transport http lamina ${url}`} />
          <p className="mt-2 text-sm text-ink-2">Luego, dentro de Claude Code escribe <code>/mcp</code>, elige <em>lamina</em> y <em>Authenticate</em>: se abrirá Lámina en tu navegador para que autorices el acceso con tu cuenta.</p>
          <p className="mt-4 font-bold">En Claude Desktop o claude.ai:</p>
          <p className="text-sm text-ink-2">Ajustes → Conectores → Añadir conector personalizado, y pega la dirección de arriba.</p>
          <p className="mt-4 font-bold">Ejemplo de petición:</p>
          <p className="text-sm text-ink-2">«Usa Lámina para crear una presentación de Cálculo I sobre la regla de la cadena para primer ciclo. Lee primero la guía de autoría.»</p>
        </section>

        <section className="sheet p-5" aria-labelledby="ap">
          <h2 id="ap" className="text-xl font-bold">2. Aplicaciones autorizadas</h2>
          <Connections items={items.map((c) => ({ clientId: c.clientId, name: c.name, host: c.host, scopes: c.scopes.map((s) => SCOPE_TEXT[s] ?? s), authorizedAt: c.authorizedAt?.toISOString() ?? null, lastUsedAt: c.lastUsedAt?.toISOString() ?? null, calls: c.calls }))} />
        </section>

        <section className="sheet p-5" aria-labelledby="pv">
          <h2 id="pv" className="text-xl font-bold">Qué puede y qué no puede hacer</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 max-w-[68ch]">
            <li>Puede ver <strong>solo tus</strong> presentaciones, crear borradores y enviar contenido y diseños.</li>
            <li><strong>No puede</strong> aprobar, publicar, compartir ni borrar nada. Eso lo haces tú en Lámina.</li>
            <li>No puede ejecutar código en Lámina: solo usa los componentes del catálogo y todo lo que envía se valida.</li>
            <li>Lo que la IA lea de tus presentaciones lo procesa su proveedor (por ejemplo Anthropic) según sus propias condiciones; Lámina no le envía tus archivos subidos.</li>
            <li>El gasto de IA lo asume tu cuenta con ese proveedor; Lámina no usa su cupo gratuito para esto.</li>
            <li>Puedes revocar el acceso en cualquier momento; se corta de inmediato. Las versiones enviadas por una IA aparecen como «Creado por IA externa (MCP)».</li>
          </ul>
        </section>
      </div>
    </AppShell>
  );
}
