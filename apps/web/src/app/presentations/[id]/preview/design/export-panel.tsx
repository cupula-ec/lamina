"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Callout } from "@/components/ui/Callout";

type Item = { id: string; kind: string; status: string; bytes: number | null; error: string | null };
const LABEL: Record<string, string> = { pdf: "PDF de la presentación", offline: "Versión offline (ZIP)", student_pdf: "Material del alumno (PDF)" };
const mb = (b: number | null) => (b ? `${(b / 1048576).toFixed(1)} MB` : "");

/** Exporta el diseño vigente (PDF y, más adelante, versión offline). La generación corre en segundo plano; se sondea el estado. */
export function ExportPanel({ presentationId, kinds = ["pdf"], materialUrl }: { presentationId: string; kinds?: string[]; materialUrl?: string }) {
  const [items, setItems] = useState<Item[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busyKind, setBusyKind] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/presentations/${presentationId}/exports`, { cache: "no-store" });
      if (r.ok) setItems((await r.json()).exports as Item[]);
    } catch { /* se reintenta en el siguiente ciclo */ }
  }, [presentationId]);
  useEffect(() => { void load(); }, [load]);
  const active = items.some((i) => i.status === "pending" || i.status === "running");
  useEffect(() => {
    if (!active) return;
    timer.current = setTimeout(() => void load(), 2500);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [active, items, load]);

  async function request(kind: string) {
    setError(null); setBusyKind(kind);
    try {
      const r = await fetch(`/api/presentations/${presentationId}/exports`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) setError(j.error ?? "No se pudo iniciar la exportación.");
      await load();
    } catch { setError("No hay conexión con el servidor."); }
    finally { setBusyKind(null); }
  }

  return (
    <section className="sheet space-y-3 p-4" aria-labelledby="exp">
      <h2 id="exp" className="font-bold">Descargar</h2>
      <p className="hint">Exporta la versión vigente del diseño para usarla sin conexión o imprimirla.</p>
      {error && <Callout tone="bad">{error}</Callout>}
      <div className="flex flex-wrap gap-2">
        {kinds.map((k) => <button key={k} className="btn" disabled={busyKind === k || active} onClick={() => void request(k)}>{busyKind === k ? "Pidiendo…" : `Generar ${LABEL[k] ?? k}`}</button>)}
      </div>
      {materialUrl && <p className="text-sm"><a className="underline" href={materialUrl} target="_blank" rel="noreferrer">Ver el material del alumno en pantalla</a> (se comparte con el mismo enlace de la presentación publicada).</p>}
      {active && <p role="status" className="text-sm font-bold">Generando el archivo… puede tardar un minuto.</p>}
      {items.length > 0 && (
        <ul className="divide-y-2 divide-ink/10 text-sm">
          {items.slice(0, 4).map((i) => (
            <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span>{LABEL[i.kind] ?? i.kind} <span className="text-ink-2">{mb(i.bytes)}</span></span>
              {i.status === "done" ? <a className="btn btn-sm btn-primary" href={`/api/exports/${i.id}?download=1`}>Descargar</a>
                : i.status === "failed" ? <span className="tag tag-bad">{i.error ?? "Falló"}</span>
                : <span className="tag tag-mute">{i.status === "running" ? "Generando…" : "En cola"}</span>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
