"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cancelPendingAction, retryAction } from "@/actions/presentations";
import { STAGE_LABEL, isRunning } from "@/lib/stages";

const HINT: Record<string, string> = {
  researching: "Estamos leyendo tus materiales, buscando fuentes y redactando el borrador. Suele tardar entre 1 y 4 minutos; puedes cerrar esta página y volver.",
  designing: "Eligiendo layouts y componentes para cada diapositiva y verificando las fórmulas. Suele tardar entre 2 y 6 minutos.",
  polishing: "Ajustando transiciones y la aparición progresiva de elementos. Unos segundos.",
};

type Status = { stage: string; lastError: string | null; resumeAt: string | null; prevStage?: string | null };

/** Muestra el estado real del trabajo y refresca la página cuando cambia la etapa (sobrevive a recargas). */
export function JobWatcher({ id, initial }: { id: string; initial: Status }) {
  const router = useRouter();
  const [st, setSt] = useState<Status>(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [elapsed, setElapsed] = useState(0);
  const stageRef = useRef(initial.stage);
  const active = isRunning(st.stage) || st.stage === "quota_wait";

  useEffect(() => {
    if (!active) return;
    const t = setInterval(async () => {
      try {
        const r = await fetch(`/api/presentations/${id}/status`, { cache: "no-store" });
        if (!r.ok) return;
        const j = (await r.json()) as Status;
        setSt(j);
        if (j.stage !== stageRef.current) { stageRef.current = j.stage; router.refresh(); }
      } catch { /* red intermitente: se reintenta */ }
    }, 2500);
    const e = setInterval(() => setElapsed((x) => x + 1), 1000);
    return () => { clearInterval(t); clearInterval(e); };
  }, [active, id, router]);

  const cancel = () => start(async () => { setError(null); const r = await cancelPendingAction({ id }); if (!r.ok) return setError(r.error); router.refresh(); });
  const canCancel = ["content_review", "design_review", "design_approved", "content_approved"].includes(st.prevStage ?? "");
  const retry = () => start(async () => { setError(null); const r = await retryAction({ id }); if (!r.ok) return setError(r.error); router.refresh(); });

  if (st.stage === "failed_recoverable")
    return (
      <div role="alert" className="sheet border-pen p-5">
        <p className="font-bold text-pen">El trabajo se detuvo</p>
        <p className="mt-1">{st.lastError ?? "Ocurrió un error."} Tu avance está guardado.</p>
        {error && <p className="err mt-2">{error}</p>}
        <div className="mt-4 flex flex-wrap gap-3"><button className="btn btn-primary" disabled={pending} onClick={retry}>{pending ? "Reintentando…" : "Reintentar"}</button>{canCancel && <button className="btn" disabled={pending} onClick={cancel}>Volver a la versión anterior</button>}</div>
      </div>
    );
  if (st.stage === "quota_wait")
    return (
      <div role="status" className="sheet p-5">
        <p className="font-bold text-warn">En espera de cupo de IA</p>
        <p className="mt-1">{st.lastError ?? "Los modelos gratuitos alcanzaron su límite."} {st.resumeAt && <>Se reanudará automáticamente hacia las <strong>{new Date(st.resumeAt).toLocaleTimeString("es-EC", { hour: "2-digit", minute: "2-digit" })}</strong>.</>}</p>
        <p className="hint mt-1">No pierdes nada: puedes cerrar la página. También puedes intentar ahora.</p>
        {error && <p className="err mt-2">{error}</p>}
        <div className="mt-4 flex flex-wrap gap-3"><button className="btn" disabled={pending} onClick={retry}>Intentar ahora</button>{canCancel && <button className="btn" disabled={pending} onClick={cancel}>Cancelar y volver a la versión anterior</button>}</div>
      </div>
    );
  if (isRunning(st.stage))
    return (
      <div role="status" aria-live="polite" className="sheet p-5">
        <p className="flex items-center gap-3 font-bold"><span aria-hidden className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-ink border-t-transparent" />{STAGE_LABEL[st.stage as keyof typeof STAGE_LABEL]}… <span className="font-normal text-ink-2">{Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, "0")}</span></p>
        <p className="hint mt-2 max-w-[62ch]">{HINT[st.stage]}</p>
      </div>
    );
  return null;
}
