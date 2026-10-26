"use client";
import { useState, useTransition } from "react";
import { Callout } from "@/components/ui/Callout";
import { useRouter } from "next/navigation";
import { promoteComponentAction, rejectComponentAction, syncCommunityComponentAction } from "@/actions/components";

export function ComponentActions({ id }: { id: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const run = (fn: () => Promise<{ ok: boolean; error?: string; data?: { prUrl?: string | null; prError?: string | null } }>) => start(async () => { setErr(null); const r = await fn(); if (!r.ok) return setErr(r.error ?? "Error"); setOk(r.data?.prUrl ? `Aprobado. PR: ${r.data.prUrl}` : r.data?.prError ? `Aprobado y estable. No se pudo abrir el PR automático: ${r.data.prError}` : "Hecho."); router.refresh(); });
  return (
    <div className="space-y-2 text-right">
      <div className="flex gap-2">
        <button className="btn btn-sm btn-primary" disabled={pending} onClick={() => run(() => promoteComponentAction({ id }))}>Aprobar → estable + PR</button>
        <button className="btn btn-sm btn-danger" disabled={pending} onClick={() => run(() => rejectComponentAction({ id }))}>Rechazar</button>
      </div>
      {err && <Callout tone="bad">{err}</Callout>}
      {ok && <p role="status" className="text-sm font-bold text-ok">{ok}</p>}
    </div>
  );
}

/** Estable → nueva versión desde el código vigente en el repositorio (community/components/<Id>/). */
export function SyncComponentButton({ id }: { id: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const run = () => start(async () => {
    setErr(null); setOk(null);
    const r = await syncCommunityComponentAction({ id });
    if (!r.ok) return setErr(r.error);
    setOk(r.data.changed ? `Versión ${r.data.version} creada desde el repositorio.` : `Ya está al día (v${r.data.version}).`);
    router.refresh();
  });
  return (
    <div className="space-y-2 text-right">
      <button className="btn btn-sm" disabled={pending} onClick={run}>{pending ? "Construyendo…" : "Actualizar desde el repositorio"}</button>
      {err && <Callout tone="bad">{err}</Callout>}
      {ok && <p role="status" className="text-sm font-bold text-ok">{ok}</p>}
    </div>
  );
}
