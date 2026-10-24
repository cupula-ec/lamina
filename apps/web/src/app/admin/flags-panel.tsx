"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Callout } from "@/components/ui/Callout";
import { setFlagAction } from "@/actions/flags";

export type FlagRow = { name: string; label: string; what: string; mode: "off" | "testers" | "volunteers" | "all"; testers: string[]; volunteers: string[] };
const MODES: [FlagRow["mode"], string][] = [["off", "Apagado"], ["testers", "Solo cuentas de prueba"], ["volunteers", "Pruebas + voluntarios"], ["all", "Todos"]];

function Row({ f }: { f: FlagRow }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [mode, setMode] = useState(f.mode);
  const [testers, setTesters] = useState(f.testers.join("\n"));
  const [vols, setVols] = useState(f.volunteers.join("\n"));
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const save = () => start(async () => {
    setMsg(null);
    const r = await setFlagAction({ name: f.name, mode, testers, volunteers: vols });
    if (!r.ok) return setMsg({ ok: false, text: r.error });
    setMsg({ ok: true, text: r.data.unknown.length ? `Guardado. Sin cuenta: ${r.data.unknown.join(", ")}` : "Guardado" });
    router.refresh();
  });
  return (
    <li className="space-y-2 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2"><p className="font-bold">{f.label} <code className="text-xs font-normal text-ink-2">{f.name}</code></p><span className={`tag ${f.mode === "all" ? "tag-ok" : f.mode === "off" ? "tag-mute" : "tag-warn"}`}>{MODES.find((m) => m[0] === f.mode)![1]}</span></div>
      <p className="text-sm text-ink-2">{f.what}</p>
      <div className="grid gap-2 md:grid-cols-3">
        <label className="block text-sm"><span className="label">Alcance</span><select className="field" value={mode} onChange={(e) => setMode(e.target.value as FlagRow["mode"])}>{MODES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
        <label className="block text-sm"><span className="label">Cuentas de prueba (correos)</span><textarea className="field" rows={2} value={testers} onChange={(e) => setTesters(e.target.value)} /></label>
        <label className="block text-sm"><span className="label">Docentes voluntarios (correos)</span><textarea className="field" rows={2} value={vols} onChange={(e) => setVols(e.target.value)} /></label>
      </div>
      <div className="flex flex-wrap items-center gap-3"><button className="btn btn-sm" disabled={pending} onClick={save}>{pending ? "Guardando…" : "Guardar"}</button>{msg && <span role="status" className={`text-sm ${msg.ok ? "text-ok" : "text-pen"}`}>{msg.text}</span>}</div>
    </li>
  );
}

export function FlagsAdmin({ rows }: { rows: FlagRow[] }) {
  return (
    <div className="space-y-4">
      <Callout tone="info" title="Despliegue gradual de V3">Activa cada función en tres pasos: cuentas de prueba, docentes voluntarios y todos. «Apagado» corta la función en segundos, sin deploy. Antes de activar un flag que escribe datos nuevos, el código que los lee debe estar desplegado en web, worker y renderer.</Callout>
      <ul className="sheet divide-y-2 divide-ink/15">{rows.map((f) => <Row key={f.name} f={f} />)}</ul>
    </div>
  );
}
