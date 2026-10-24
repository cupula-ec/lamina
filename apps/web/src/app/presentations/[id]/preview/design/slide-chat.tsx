"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Callout } from "@/components/ui/Callout";

type Run = { id: string; slideId: string; message: string; status: string; summary: string | null; error: string | null; undone: boolean };
const SUGGESTIONS = ["Hazla más visual", "Agrega un ejemplo", "Simplifica el texto", "Agrega una imagen de apoyo", "Hazla más breve"];

/**
 * Chat con Lámina sobre la diapositiva seleccionada (V3 §5.8): un pedido en lenguaje natural → el harness cambia solo esa diapositiva,
 * el resultado queda como versión nueva y se puede deshacer. Muestra el estado real del pedido (se sondea hasta que termina).
 */
export function SlideChat({ presentationId, slideId, slideNumber }: { presentationId: string; slideId: string; slideNumber: number }) {
  const router = useRouter();
  const [runs, setRuns] = useState<Run[]>([]);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wasActive = useRef(false);

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/presentations/${presentationId}/chat?slide=${encodeURIComponent(slideId)}`, { cache: "no-store" });
      if (r.ok) setRuns(((await r.json()) as { runs: Run[] }).runs);
    } catch { /* se reintenta */ }
  }, [presentationId, slideId]);
  useEffect(() => { void load(); }, [load]);
  const active = runs.some((r) => r.status === "pending" || r.status === "running");
  useEffect(() => {
    if (active) { wasActive.current = true; timer.current = setTimeout(() => void load(), 2500); return () => { if (timer.current) clearTimeout(timer.current); }; }
    if (wasActive.current) { wasActive.current = false; router.refresh(); } // terminó: se recarga el diseño con la versión nueva
  }, [active, runs, load, router]);

  async function send(message: string) {
    setError(null); setBusy(true);
    try {
      const r = await fetch(`/api/presentations/${presentationId}/chat`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ slideId, message }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) setError(j.error ?? "No se pudo enviar el pedido.");
      else setText("");
      await load();
    } catch { setError("No hay conexión con el servidor."); }
    finally { setBusy(false); }
  }
  async function undo(id: string) {
    setError(null); setBusy(true);
    try {
      const r = await fetch(`/api/presentations/${presentationId}/chat/${id}/undo`, { method: "POST" });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) setError(j.error ?? "No se pudo deshacer.");
      await load(); router.refresh();
    } catch { setError("No hay conexión con el servidor."); }
    finally { setBusy(false); }
  }

  return (
    <section className="sheet space-y-3 p-4" aria-labelledby="chat-h">
      <h2 id="chat-h" className="font-bold">Pídele un cambio a Lámina <span className="font-normal text-ink-2">(diapositiva {slideNumber})</span></h2>
      <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); if (text.trim().length >= 3) void send(text.trim()); }}>
        <label className="label text-sm" htmlFor="chat-msg">¿Qué quieres cambiar en esta diapositiva?</label>
        <textarea id="chat-msg" className="field" rows={2} maxLength={500} value={text} onChange={(e) => setText(e.target.value)} placeholder="Ej.: agrega un ejemplo cotidiano antes de la fórmula" disabled={busy || active} />
        <div className="flex flex-wrap gap-2">
          {SUGGESTIONS.map((s) => <button key={s} type="button" className="btn btn-sm" disabled={busy || active} onClick={() => setText(s)}>{s}</button>)}
        </div>
        <button type="submit" className="btn btn-primary" disabled={busy || active || text.trim().length < 3}>{active ? "Lámina está trabajando…" : "Enviar pedido"}</button>
      </form>
      {error && <Callout tone="bad">{error}</Callout>}
      {runs.length > 0 && (
        <ul className="divide-y-2 divide-ink/10 text-sm">
          {runs.slice(0, 3).map((r) => (
            <li key={r.id} className="space-y-1 py-2">
              <p className="font-bold">«{r.message}»</p>
              {(r.status === "pending" || r.status === "running") && <p role="status" className="text-ink-2">Lámina está cambiando la diapositiva… suele tardar de uno a tres minutos.</p>}
              {r.status === "done" && <p>{r.summary || "Listo."} {r.undone ? <span className="tag tag-mute">Deshecho</span> : <button className="btn btn-sm" disabled={busy} onClick={() => void undo(r.id)}>Deshacer</button>}</p>}
              {r.status === "noop" && <p className="text-ink-2">{r.summary || "No hizo falta cambiar nada."}</p>}
              {r.status === "failed" && <p className="text-pen">{r.error ?? "No se pudo completar."} Tu diseño no cambió.</p>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
