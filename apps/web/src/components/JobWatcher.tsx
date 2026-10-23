"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { Callout } from "@/components/ui/Callout";
import { useRouter } from "next/navigation";
import { cancelPendingAction, cancelRunningAction, retryAction } from "@/actions/presentations";
import { STAGE_LABEL, isRunning } from "@/lib/stages";
import { toast } from "sonner";
import { askNotifyPermission, notifyDone } from "@/lib/notify";

const HINT: Record<string, string> = {
  researching: "Estamos leyendo tus materiales, buscando fuentes y redactando el borrador. Suele tardar entre 1 y 4 minutos; puedes cerrar esta página y volver.",
  designing: "Eligiendo layouts y componentes para cada diapositiva y verificando las fórmulas. Suele tardar entre 2 y 6 minutos.",
  polishing: "Ajustando transiciones y la aparición progresiva de elementos. Unos segundos.",
};

/** Segundos tras los cuales avisamos de que el trabajo tarda más de lo normal (≈ 1,5× el máximo anunciado). */
const SLOW_AFTER: Record<string, number> = { researching: 6 * 60, designing: 9 * 60, polishing: 3 * 60 };
const DONE_MSG: Record<string, [string, string]> = {
  researching: ["Tu borrador está listo", "Revisa el contenido y apruébalo para continuar."],
  designing: ["Tu diseño está listo", "Revisa las diapositivas y apruébalas."],
  polishing: ["Tu presentación está lista", "Ya puedes publicarla."],
};

type Status = { stage: string; lastError: string | null; resumeAt: string | null; prevStage?: string | null; progress?: string | null };

/** Muestra el estado real del trabajo y refresca la página cuando cambia la etapa (sobrevive a recargas). */
export function JobWatcher({ id, initial }: { id: string; initial: Status }) {
  const router = useRouter();
  const [st, setSt] = useState<Status>(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [elapsed, setElapsed] = useState(0);
  const stageRef = useRef(initial.stage);
  const cancelledRef = useRef(false);
  const active = isRunning(st.stage) || st.stage === "quota_wait";

  const [session, setSession] = useState<"ok" | "expired" | "blocked">("ok");
  const [perm, setPerm] = useState<string>("granted");
  useEffect(() => { setPerm(typeof Notification === "undefined" ? "unsupported" : Notification.permission); }, []);

  useEffect(() => {
    if (!active) return;
    let es: EventSource | null = null;
    let poll: ReturnType<typeof setInterval> | null = null;
    let stopped = false;
    const apply = (j: Status) => {
      setSt(j); setSession("ok");
      if (j.stage !== stageRef.current) {
        const prev = stageRef.current; stageRef.current = j.stage;
        const done = DONE_MSG[prev];
        if (cancelledRef.current) { cancelledRef.current = false; }
        else if (done && !isRunning(j.stage) && j.stage !== "quota_wait" && j.stage !== "failed_recoverable") {
          toast.success(done[0]); notifyDone(done[0], done[1], window.location.pathname);
        } else if (j.stage === "failed_recoverable") { toast.error("El trabajo se detuvo"); notifyDone("El trabajo se detuvo", j.lastError ?? "Revisa el error y reintenta.", window.location.pathname); }
        router.refresh();
      }
    };
    const check = async () => {
      try {
        const r = await fetch(`/api/presentations/${id}/status`, { cache: "no-store" });
        if (r.status === 401) { setSession("expired"); return false; }
        if (r.status === 403) { setSession("blocked"); return false; }
        if (r.ok) apply((await r.json()) as Status);
      } catch { /* red intermitente: se reintenta */ }
      return true;
    };
    const startPolling = () => { if (!poll && !stopped) poll = setInterval(() => { void check().then((ok) => { if (!ok && poll) { clearInterval(poll); poll = null; } }); }, 2500); };
    if (typeof EventSource === "undefined") startPolling();
    else {
      es = new EventSource(`/api/presentations/${id}/events`);
      es.addEventListener("status", (ev) => apply(JSON.parse((ev as MessageEvent).data) as Status));
      es.addEventListener("fail", () => { es?.close(); void check().then((ok) => { if (ok) startPolling(); }); });
      // EventSource reintenta solo; si el servidor responde 401/403 la conexión muere y lo detectamos con una petición normal.
      es.onerror = () => { void check().then((ok) => { if (!ok) { es?.close(); return; } if (es?.readyState === EventSource.CLOSED) startPolling(); }); };
    }
    const e = setInterval(() => setElapsed((x) => x + 1), 1000);
    return () => { stopped = true; es?.close(); if (poll) clearInterval(poll); clearInterval(e); };
  }, [active, id, router]);

  const cancel = () => start(async () => { setError(null); const r = await cancelPendingAction({ id }); if (!r.ok) return setError(r.error); router.refresh(); });
  const canCancel = ["content_review", "design_review", "design_approved", "content_approved"].includes(st.prevStage ?? "");
  const [confirmCancel, setConfirmCancel] = useState(false);
  const cancelRun = () => start(async () => { setError(null); cancelledRef.current = true; const r = await cancelRunningAction({ id }); if (!r.ok) { cancelledRef.current = false; return setError(r.error); } setConfirmCancel(false); router.refresh(); });
  const retry = () => start(async () => { setError(null); const r = await retryAction({ id }); if (!r.ok) return setError(r.error); router.refresh(); });

  if (session !== "ok" && active)
    return (
      <div role="alert" className="sheet border-pen p-5">
        <p className="font-bold text-pen">{session === "expired" ? "Tu sesión expiró" : "No se puede seguir el trabajo"}</p>
        <p className="mt-1">{session === "expired" ? "El trabajo sigue en curso en el servidor, pero esta página ya no puede consultarlo. Inicia sesión de nuevo para ver el resultado; no pierdes nada." : "Completa tu primer ingreso (contraseña y consentimiento) para continuar."}</p>
        <div className="mt-4"><a className="btn btn-primary" href={session === "expired" ? `/login?next=${encodeURIComponent(window.location.pathname)}` : "/bienvenida"}>{session === "expired" ? "Iniciar sesión" : "Ir a mi primer ingreso"}</a></div>
      </div>
    );
  if (st.stage === "failed_recoverable")
    return (
      <div role="alert" className="sheet border-pen p-5">
        <p className="font-bold text-pen">El trabajo se detuvo</p>
        <p className="mt-1">{st.lastError ?? "Ocurrió un error."} Tu avance está guardado.</p>
        {error && <Callout tone="bad">{error}</Callout>}
        <div className="mt-4 flex flex-wrap gap-3"><button className="btn btn-primary" disabled={pending} onClick={retry}>{pending ? "Reintentando…" : "Reintentar"}</button>{canCancel && <button className="btn" disabled={pending} onClick={cancel}>Volver a la versión anterior</button>}</div>
      </div>
    );
  if (st.stage === "quota_wait")
    return (
      <div role="status" className="sheet p-5">
        <p className="font-bold text-warn">En espera de cupo de IA</p>
        <p className="mt-1">{st.lastError ?? "Los modelos gratuitos alcanzaron su límite."} {st.resumeAt && <>Se reanudará automáticamente hacia las <strong>{new Date(st.resumeAt).toLocaleTimeString("es-EC", { hour: "2-digit", minute: "2-digit" })}</strong>.</>}</p>
        <p className="hint mt-1">No pierdes nada: puedes cerrar la página. También puedes intentar ahora.</p>
        {error && <Callout tone="bad">{error}</Callout>}
        <div className="mt-4 flex flex-wrap gap-3"><button className="btn" disabled={pending} onClick={retry}>Intentar ahora</button>{canCancel && <button className="btn" disabled={pending} onClick={cancel}>Cancelar y volver a la versión anterior</button>}</div>
      </div>
    );
  if (isRunning(st.stage))
    return (
      <div role="status" aria-live="polite" className="sheet p-5">
        <p className="flex items-center gap-3 font-bold"><span aria-hidden className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-ink border-t-transparent" />{STAGE_LABEL[st.stage as keyof typeof STAGE_LABEL]}… <span className="font-normal text-ink-2">{Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, "0")}</span></p>
        {st.progress && <p className="mt-2 font-bold">{st.progress}</p>}
        <p className="hint mt-2 max-w-[62ch]">{HINT[st.stage]}</p>
        {elapsed > (SLOW_AFTER[st.stage] ?? Infinity) && (
          <p role="status" className="mt-3 rounded border-2 border-warn p-3 text-sm"><strong>Está tardando más de lo esperado.</strong> Puede ser que los modelos gratuitos estén saturados. Tu avance está guardado: puedes cerrar la página y volver; si pasa de 45 minutos se detiene solo y podrás reintentar.</p>
        )}
        {error && <Callout tone="bad">{error}</Callout>}
        {confirmCancel ? (
          <div className="mt-3 rounded border-2 border-ink p-3 text-sm" role="alertdialog" aria-label="Cancelar trabajo">
            <p className="font-bold">¿Cancelar este trabajo?</p>
            <p className="text-ink-2">Lo ya guardado no se pierde. {["content_review", "design_review", "design_approved", "content_approved"].includes(st.prevStage ?? "") ? "Volverás a la versión anterior." : "Podrás reintentarlo o eliminar la presentación."}</p>
            <div className="mt-2 flex gap-2"><button className="btn btn-sm btn-primary" disabled={pending} onClick={cancelRun}>Sí, cancelar</button><button className="btn btn-sm" onClick={() => setConfirmCancel(false)}>Seguir esperando</button></div>
          </div>
        ) : <button type="button" className="btn btn-sm btn-ghost mt-3" onClick={() => setConfirmCancel(true)}>Cancelar trabajo</button>}
        {perm === "default" && <button type="button" className="btn btn-sm mt-3" onClick={() => { void askNotifyPermission().then(() => setPerm(Notification.permission)); }}>Avisarme cuando termine</button>}
      </div>
    );
  return null;
}
