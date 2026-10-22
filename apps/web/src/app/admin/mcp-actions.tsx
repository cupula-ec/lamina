"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { revokeConnectionAdminAction, setMcpEnabledAction } from "@/actions/mcp";

type Item = { userId: string; email: string; clientId: string; name: string; host: string | null; authorizedAt: string | null; lastUsedAt: string | null; calls: number };
const fmt = (s: string | null) => (s ? new Date(s).toLocaleString("es-EC", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—");

export function McpAdminControls({ enabled, items }: { enabled: boolean; items: Item[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) => start(async () => { setErr(null); const r = await fn(); if (!r.ok) return setErr(r.error ?? "Error"); router.refresh(); });
  return (
    <div className="space-y-8">
      <section className="sheet p-5" aria-labelledby="mcp-g">
        <h2 id="mcp-g" className="text-xl font-bold">Servidor MCP</h2>
        <p className="mt-1 max-w-[65ch] text-ink-2">Permite que los docentes conecten una IA externa (Claude, etc.) para crear borradores. Al desactivarlo, todas las conexiones dejan de responder de inmediato; no se borran.</p>
        <p className="mt-3">Estado: <span className={`tag ${enabled ? "tag-ok" : "tag-bad"}`}>{enabled ? "Activo" : "Desactivado"}</span></p>
        <button className="btn mt-3" disabled={pending} onClick={() => { if (enabled && !confirm("¿Desactivar el MCP para todos los docentes?")) return; run(() => setMcpEnabledAction({ enabled: !enabled })); }}>{enabled ? "Desactivar MCP" : "Activar MCP"}</button>
        {err && <p role="alert" className="err mt-3">{err}</p>}
      </section>
      <section aria-labelledby="mcp-c">
        <h2 id="mcp-c" className="text-xl font-bold">Conexiones ({items.length})</h2>
        <ul className="sheet mt-3 divide-y-2 divide-ink/15">
          {items.map((c) => (
            <li key={`${c.userId}:${c.clientId}`} className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div>
                <p className="font-bold">{c.name}{c.host && <span className="font-normal text-ink-2"> · {c.host}</span>}</p>
                <p className="text-sm text-ink-2">{c.email} · Autorizada {fmt(c.authorizedAt)} · Último uso {fmt(c.lastUsedAt)} · {c.calls} llamadas</p>
              </div>
              <button className="btn btn-sm" disabled={pending} onClick={() => { if (confirm(`¿Revocar la conexión de ${c.email} con «${c.name}»?`)) run(() => revokeConnectionAdminAction({ userId: c.userId, clientId: c.clientId })); }}>Revocar</button>
            </li>
          ))}
          {items.length === 0 && <li className="p-4 text-ink-2">Ninguna conexión.</li>}
        </ul>
      </section>
    </div>
  );
}
