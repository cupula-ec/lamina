"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updatePresentationMetaAction } from "@/actions/branding";

export function MetaEditor({ presentationId, initial }: { presentationId: string; initial: { subject: string; period: string; group: string } }) {
  const router = useRouter();
  const [f, setF] = useState(initial);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });
  const summary = [initial.subject, initial.period, initial.group].filter(Boolean).join(" · ");
  return (
    <details className="mt-2 max-w-2xl">
      <summary className="cursor-pointer text-sm font-bold underline underline-offset-4">Datos de la carátula{summary ? `: ${summary}` : " (materia, período, grupo)"}</summary>
      <form className="sheet mt-2 grid gap-3 p-4 sm:grid-cols-3" onSubmit={(e) => { e.preventDefault(); setMsg(null); setErr(null); start(async () => { const r = await updatePresentationMetaAction({ id: presentationId, ...f }); if (!r.ok) return setErr(r.error); setMsg("Guardado. La carátula se actualiza sin regenerar el contenido."); router.refresh(); }); }}>
        <div><label className="label text-sm" htmlFor="m-subject">Materia</label><input id="m-subject" className="field" value={f.subject} onChange={set("subject")} maxLength={160} placeholder="Ej.: Cálculo I" /></div>
        <div><label className="label text-sm" htmlFor="m-period">Período</label><input id="m-period" className="field" value={f.period} onChange={set("period")} maxLength={80} placeholder="Ej.: Abr–Ago 2026" /></div>
        <div><label className="label text-sm" htmlFor="m-group">Grupo</label><input id="m-group" className="field" value={f.group} onChange={set("group")} maxLength={80} placeholder="Ej.: Grupo 2" /></div>
        <div className="sm:col-span-3">
          {msg && <p role="status" className="mb-2 font-bold text-ok">{msg}</p>}{err && <p role="alert" className="err mb-2">{err}</p>}
          <button className="btn btn-sm" disabled={pending}>{pending ? "Guardando…" : "Guardar datos"}</button>
        </div>
      </form>
    </details>
  );
}
