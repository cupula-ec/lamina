"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CopyBox } from "./copy";

const TABS = [
  { id: "code", label: "Claude Code" },
  { id: "desktop", label: "Claude Desktop" },
  { id: "web", label: "claude.ai" },
  { id: "codex", label: "App de ChatGPT / Codex" },
  { id: "chatgpt", label: "ChatGPT web" },
  { id: "other", label: "Otra IA" },
] as const;

export function ConnectGuide({ url, connected }: { url: string; connected: boolean }) {
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("code");
  return (
    <div>
      <div role="tablist" aria-label="Tu aplicación de IA" className="flex flex-wrap gap-1 border-b-2 border-ink">
        {TABS.map((t) => (
          <button key={t.id} role="tab" id={`tab-${t.id}`} aria-selected={tab === t.id} aria-controls={`panel-${t.id}`} tabIndex={tab === t.id ? 0 : -1} type="button"
            onClick={() => setTab(t.id)}
            onKeyDown={(e) => { const i = TABS.findIndex((x) => x.id === tab); if (e.key === "ArrowRight") setTab(TABS[(i + 1) % TABS.length]!.id); if (e.key === "ArrowLeft") setTab(TABS[(i + TABS.length - 1) % TABS.length]!.id); }}
            className={`-mb-0.5 min-h-11 rounded-t-md border-2 border-b-0 px-4 font-bold ${tab === t.id ? "border-ink bg-mark" : "border-transparent hover:bg-paper-2"}`}>{t.label}</button>
        ))}
      </div>
      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} className="pt-4">
        {tab === "code" && (<>
          <ol className="list-decimal space-y-3 pl-5">
            <li>Pega este comando en tu terminal:<CopyBox label="Comando para Claude Code" value={`claude mcp add --transport http lamina ${url}`} /></li>
            <li>Dentro de Claude Code escribe <code>/mcp</code>, elige <em>lamina</em> y <em>Authenticate</em>.</li>
            <li>Se abrirá Lámina en tu navegador: revisa los permisos y pulsa <strong>Autorizar</strong>.</li>
          </ol>
        </>)}
        {tab === "desktop" && (
          <ol className="list-decimal space-y-3 pl-5">
            <li>Abre <strong>Ajustes → Conectores → Añadir conector personalizado</strong>.</li>
            <li>Pega la dirección del servidor:<CopyBox label="Dirección del servidor" value={url} /></li>
            <li>Pulsa conectar y autoriza el acceso cuando se abra Lámina.</li>
          </ol>
        )}
        {tab === "web" && (
          <ol className="list-decimal space-y-3 pl-5">
            <li>En claude.ai abre <strong>Configuración → Conectores → Añadir conector personalizado</strong>.</li>
            <li>Pega la dirección del servidor:<CopyBox label="Dirección del servidor (claude.ai)" value={url} /></li>
            <li>Autoriza el acceso cuando se abra Lámina.</li>
          </ol>
        )}
        {tab === "codex" && (
          <div className="space-y-5">
            <div>
              <h3 className="font-bold">En la app de ChatGPT (incluye Codex)</h3>
              <ol className="mt-2 list-decimal space-y-3 pl-5">
                <li>Abre <strong>Configuración → Servidores MCP → Añadir servidor</strong>.</li>
                <li>Pon el nombre «lamina», elige <strong>HTTP transmitible (Streamable HTTP)</strong> y pega la dirección:<CopyBox label="Dirección del servidor (app de ChatGPT)" value={url} /></li>
                <li>Guarda, pulsa <strong>Reiniciar</strong> y luego <strong>Autenticar</strong> en la lista. Se abrirá Lámina: revisa los permisos y pulsa <strong>Autorizar</strong>.</li>
                <li>Comprueba escribiendo <code>/mcp</code> en el cuadro de mensaje.</li>
              </ol>
            </div>
            <div>
              <h3 className="font-bold">En la terminal (Codex CLI)</h3>
              <ol className="mt-2 list-decimal space-y-3 pl-5">
                <li>Añade Lámina:<CopyBox label="Comando para Codex" value={`codex mcp add lamina --url ${url}`} /></li>
                <li>Inicia sesión:<CopyBox label="Comando de inicio de sesión de Codex" value="codex mcp login lamina" /></li>
              </ol>
              <p className="mt-2 text-sm text-ink-2">La app y la terminal comparten la configuración: lo que añadas en una aparece en la otra. Los nombres del menú pueden variar según la versión.</p>
            </div>
          </div>
        )}
        {tab === "chatgpt" && (
          <div className="space-y-3">
            <ol className="list-decimal space-y-3 pl-5">
              <li>En ChatGPT (navegador) activa el <strong>modo desarrollador</strong>: Configuración → Aplicaciones y conectores → Ajustes avanzados. Depende de tu plan y los nombres del menú cambian.</li>
              <li>Crea un conector nuevo, ponle el nombre «Lámina», pega la dirección y elige autenticación <strong>OAuth</strong>:<CopyBox label="Dirección del servidor (ChatGPT)" value={url} /></li>
              <li>Deja vacíos el ID y el secreto del cliente, y autoriza en Lámina. Después activa el conector en la conversación donde lo quieras usar.</li>
            </ol>
            <p className="text-sm text-ink-2">Los conectores personalizados de ChatGPT no están verificados; Lámina te mostrará de dónde viene la solicitud antes de autorizar.</p>
          </div>
        )}
        {tab === "other" && (
          <div className="space-y-2">
            <p className="max-w-[62ch]">Cualquier cliente compatible con <strong>MCP por HTTP</strong> con inicio de sesión OAuth sirve. Usa esta dirección:</p>
            <CopyBox label="Dirección del servidor MCP" value={url} />
          </div>
        )}
      </div>
      <Status connected={connected} />
    </div>
  );
}

/** Espera la autorización: consulta el servidor cada 4 s (hasta 5 min) y avisa en cuanto aparece la conexión. */
function Status({ connected }: { connected: boolean }) {
  const router = useRouter();
  const was = useRef(connected);
  const [waiting, setWaiting] = useState(false);
  useEffect(() => {
    if (!waiting || connected) return;
    const t = setInterval(() => router.refresh(), 4000);
    const stop = setTimeout(() => setWaiting(false), 5 * 60_000);
    return () => { clearInterval(t); clearTimeout(stop); };
  }, [waiting, connected, router]);
  useEffect(() => {
    if (connected && !was.current) { toast.success("¡Conectada! Ya puedes pedirle una presentación a tu IA."); setWaiting(false); }
    was.current = connected;
  }, [connected]);
  return (
    <div className="mt-5 flex flex-wrap items-center gap-3 rounded-md border-2 border-ink bg-paper-2 p-3" role="status" aria-live="polite">
      {connected ? <span className="tag tag-ok">Conectada</span> : waiting ? <span className="tag tag-info">Esperando tu autorización…</span> : <span className="tag tag-mute">Sin conectar</span>}
      {!connected && !waiting && <button type="button" className="btn btn-sm" onClick={() => setWaiting(true)}>Ya lo hice: comprobar conexión</button>}
      {!connected && waiting && <button type="button" className="btn btn-sm btn-ghost" onClick={() => setWaiting(false)}>Dejar de esperar</button>}
    </div>
  );
}
