import { eq } from "drizzle-orm";
import { schema } from "@lamina/db";
import { Brand } from "@/components/Brand";
import { getDb } from "@/lib/db";
import { mcpEnabled } from "@/lib/mcp-access";
import { requireUser } from "@/lib/session";
import { SCOPE_TEXT } from "../scopes";
import { ConsentForm } from "./form";

export const metadata = { title: "Autorizar acceso" };
export const dynamic = "force-dynamic";

const hostOf = (u: string) => { try { const x = new URL(u); return x.host || x.protocol; } catch { return u.slice(0, 60); } };

export default async function Autorizar({ searchParams }: { searchParams: Promise<{ client_id?: string; scope?: string; redirect_uri?: string }> }) {
  const u = await requireUser();
  const sp = await searchParams;
  const db = getDb();
  const [client] = sp.client_id ? await db.select().from(schema.oauthClient).where(eq(schema.oauthClient.clientId, sp.client_id)) : [];
  const scopes = (sp.scope ?? "").split(/\s+/).filter((s) => Object.hasOwn(SCOPE_TEXT, s));
  const enabled = await mcpEnabled(db);
  const name = client?.name?.trim() || "Una aplicación sin nombre";
  // El código viaja al redirect_uri de ESTA solicitud (parte de la consulta firmada), no a cualquiera de los registrados.
  const dest = sp.redirect_uri ? hostOf(sp.redirect_uri) : null;
  const loopback = !!sp.redirect_uri && (() => { try { return ["127.0.0.1", "localhost", "[::1]"].includes(new URL(sp.redirect_uri!).hostname); } catch { return false; } })();
  return (
    <div className="bg-graph min-h-dvh">
      <div className="mx-auto max-w-lg px-5 py-10">
        <Brand href="/dashboard" />
        <div className="sheet mt-10 p-6 shadow-[6px_6px_0_var(--color-ink)] sm:p-8">
          <h1 className="text-2xl font-bold">¿Autorizar a «{name}»?</h1>
          {!client ? (
            <p role="alert" className="err mt-4">Esta solicitud no es válida o ya expiró. Vuelve a iniciar la conexión desde tu aplicación de IA.</p>
          ) : !enabled ? (
            <p role="alert" className="err mt-4">La conexión con IA está desactivada temporalmente por un administrador.</p>
          ) : (
            <>
              <p className="mt-3">Entrarás como <strong>{u.email}</strong>. Esta aplicación quiere acceder a tus presentaciones de Lámina:</p>
              <ul className="mt-3 list-disc space-y-1 pl-5">{scopes.map((s) => <li key={s}>{SCOPE_TEXT[s]}</li>)}</ul>
              <p className="mt-4 rounded border-2 border-ink p-3 font-bold">No puede aprobar, publicar, compartir ni borrar. Todo lo que envíe te llega como borrador y lo apruebas tú.</p>
              <p className="mt-4 text-sm text-ink-2">
                El nombre lo declara la propia aplicación y no está verificado. Tras autorizar volverás a: <strong className={loopback ? "" : "text-red-700"}>{dest ?? "(la aplicación)"}</strong>
                {dest && !loopback ? " (un sitio web externo, no tu computadora)" : ""}. Si no iniciaste tú esta conexión, cancela.
              </p>
              <ConsentForm />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
