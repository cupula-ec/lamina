"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Callout } from "@/components/ui/Callout";
import { revokeMyConnectionAction } from "@/actions/mcp";

type Item = { clientId: string; name: string; host: string | null; scopes: string[]; authorizedAt: string | null; lastUsedAt: string | null; calls: number };
const fmt = (s: string | null) => (s ? new Date(s).toLocaleString("es-EC", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—");

export function Connections({ items }: { items: Item[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  if (!items.length) return <p className="mt-2 text-ink-2">Aún no has autorizado ninguna aplicación. Cuando lo hagas aparecerá aquí.</p>;
  return (
    <div>
      {err && <Callout tone="bad" className="mt-2">{err}</Callout>}
      <ul className="mt-3 divide-y-2 divide-ink/15">
        {items.map((c) => (
          <li key={c.clientId} className="flex flex-wrap items-start justify-between gap-3 py-3">
            <div className="min-w-0">
              <p className="font-bold">{c.name}{c.host && <span className="font-normal text-ink-2"> · {c.host}</span>}</p>
              <p className="text-sm text-ink-2">Autorizada: {fmt(c.authorizedAt)} · Último uso: {fmt(c.lastUsedAt)} · {c.calls} llamadas</p>
              <ul className="mt-1 list-disc pl-5 text-sm">{c.scopes.map((s) => <li key={s}>{s}</li>)}</ul>
            </div>
            <button
              className="btn btn-sm btn-danger" disabled={pending}
              onClick={() => { if (!confirm(`¿Revocar el acceso de «${c.name}»? Dejará de funcionar de inmediato.`)) return; start(async () => { setErr(null); const r = await revokeMyConnectionAction({ clientId: c.clientId }); if (!r.ok) return setErr(r.error); toast.success(`Acceso de «${c.name}» revocado.`); router.refresh(); }); }}
            >Revocar</button>
          </li>
        ))}
      </ul>
    </div>
  );
}
