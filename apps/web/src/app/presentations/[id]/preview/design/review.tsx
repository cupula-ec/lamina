"use client";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { SlideThumb, SlideView, CANVAS } from "@lamina/engine";
import type { DeckDocument } from "@lamina/contracts";
import {
  approveDesignAction, regenerateDesignAction, reopenDesignAction, requestComponentAction, startPolishAction,
} from "@/actions/presentations";
import { makeResolver, type ProvisionalClient } from "@/lib/resolver";
import { PublishPanel } from "./publish";

type Issue = { slot: string | null; kind: string; severity: string; message: string };
type Version = { id: string; n: number; authorKind: string; kind: string; note: string | null; createdAt: string };
type Req = { id: string; name: string; purpose: string; status: string; error: string | null; slideId: string | null };

const KIND: Record<string, string> = { overflow: "Desborde", small_text: "Texto pequeño", katex_error: "Fórmula con error", empty_slot: "Área vacía", component_error: "Componente caído" };

export function DesignReview(props: {
  presentationId: string; stage: string; visibility: string; deckVersionId: string; deckSha: string; deck: DeckDocument; isCurrent: boolean;
  issues: Record<string, Issue[]>; rendered: string[]; waitingRender: boolean; prov: ProvisionalClient[]; requests: Req[]; versions: Version[]; appUrl: string; busy: boolean;
}) {
  const { presentationId: id, stage, deck } = props;
  const router = useRouter();
  const resolver = useMemo(() => makeResolver(props.prov), [props.prov]);
  const [sel, setSel] = useState(0);
  const [step, setStep] = useState<number | "max">("max");
  const [checked, setChecked] = useState<string[]>([]);
  const [fb, setFb] = useState("");
  const [cname, setCname] = useState("");
  const [cpurpose, setCpurpose] = useState("");
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const slide = deck.slides[Math.min(sel, deck.slides.length - 1)]!;
  const steps = slide.build.steps.length;
  const shownStep = step === "max" ? steps : Math.min(step, steps);
  const all = props.issues;
  const errCount = Object.values(all).flat().filter((i) => i.severity === "error").length;
  const warnCount = Object.values(all).flat().filter((i) => i.severity === "warning").length;
  const reviewable = stage === "design_review" && props.isCurrent && !props.busy;
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, ok?: string) => start(async () => { setError(null); setNotice(null); const r = await fn(); if (!r.ok) return setError(r.error ?? "Error"); if (ok) setNotice(ok); router.refresh(); });

  const scope = checked.length ? checked : [];
  const regen = (withText: boolean) => run(async () => { const r = await regenerateDesignAction({ id, feedback: withText ? fb : undefined, slideIds: scope }); if (r.ok) { setFb(""); setChecked([]); } return r; }, "Regenerando… verás la nueva versión en unos minutos.");

  return (
    <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_24rem]">
      <div className="space-y-5">
        {!props.isCurrent && <p className="sheet border-warn p-3 font-bold text-warn">Estás viendo una versión anterior (solo lectura). <Link className="underline" href={`/presentations/${id}/preview/design`}>Volver a la vigente</Link></p>}
        {error && <p role="alert" className="err sheet border-pen p-3">{error}</p>}
        {notice && <p role="status" className="sheet p-3 font-bold text-ok">{notice}</p>}

        <div className="sheet overflow-hidden shadow-[5px_5px_0_var(--color-ink)]">
          <SlideThumb key={`${slide.id}-${shownStep}-${props.deckVersionId}`} deck={deck} index={sel} resolver={resolver} step={shownStep} />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button className="btn btn-sm" onClick={() => { setSel(Math.max(0, sel - 1)); setStep("max"); }} disabled={sel === 0} aria-label="Diapositiva anterior">‹</button>
            <span className="font-bold" aria-live="polite">Diapositiva {sel + 1} de {deck.slides.length}</span>
            <button className="btn btn-sm" onClick={() => { setSel(Math.min(deck.slides.length - 1, sel + 1)); setStep("max"); }} disabled={sel >= deck.slides.length - 1} aria-label="Diapositiva siguiente">›</button>
          </div>
          {steps > 0 && (
            <label className="flex items-center gap-2 text-sm"><span className="font-bold">Aparición por pasos</span>
              <input type="range" min={0} max={steps} value={shownStep} onChange={(e) => setStep(Number(e.target.value))} aria-valuetext={`paso ${shownStep} de ${steps}`} /> <span>{shownStep}/{steps}</span>
            </label>
          )}
          <Link className="btn btn-sm" href={`/presentations/${id}/view`} target="_blank">Probar en pantalla completa</Link>
        </div>

        <section className="sheet p-4" aria-labelledby="det">
          <h2 id="det" className="font-bold">Diapositiva {sel + 1}: detalles</h2>
          {slide.rationale && <p className="mt-1 text-sm"><span className="font-bold">Por qué este diseño:</span> {slide.rationale}</p>}
          <p className="mt-1 text-sm"><span className="font-bold">Componentes:</span> {Object.entries(slide.slots).map(([k, r]) => `${r.componentId} (${k})`).join(" · ")}</p>
          {slide.notes && <p className="mt-1 text-sm"><span className="font-bold">Notas del presentador:</span> {slide.notes}</p>}
          <div className="mt-3">
            {props.waitingRender && !props.issues[slide.id] ? <p className="hint" role="status">Revisando esta diapositiva en el renderer…</p>
              : (all[slide.id] ?? []).length === 0 ? <p className="text-sm font-bold text-ok">✓ Sin problemas detectados en esta diapositiva.</p>
              : <ul className="space-y-1">{all[slide.id]!.map((i, k) => <li key={k} className="text-sm"><span className={`tag ${i.severity === "error" ? "tag-bad" : "tag-warn"}`}>{KIND[i.kind] ?? i.kind}</span> {i.slot && <span className="font-bold">({i.slot})</span>} {i.message}</li>)}</ul>}
            {props.rendered.includes(slide.id) && <a className="mt-2 inline-block text-sm underline" target="_blank" href={`/api/presentations/${id}/renders/${props.deckVersionId}/${encodeURIComponent(slide.id)}`}>Ver captura del renderer</a>}
          </div>
        </section>

        <section aria-labelledby="thumbs">
          <h2 id="thumbs" className="mb-2 font-bold">Todas las diapositivas {props.waitingRender ? <span className="tag tag-info ml-2">revisión automática en curso</span> : <span className={`tag ml-2 ${errCount ? "tag-bad" : "tag-ok"}`}>{errCount} errores · {warnCount} avisos</span>}</h2>
          <ol className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5">
            {deck.slides.map((s, i) => {
              const iss = all[s.id] ?? [];
              const e = iss.filter((x) => x.severity === "error").length, w = iss.length - e;
              return (
                <li key={s.id} className={`rounded-md border-2 p-1 ${i === sel ? "border-blue bg-paper-2" : "border-ink/30"}`}>
                  <button type="button" className="block w-full text-left" onClick={() => { setSel(i); setStep("max"); }} aria-label={`Ir a la diapositiva ${i + 1}`} aria-current={i === sel}>
                    <SlideThumb deck={deck} index={i} resolver={resolver} step={s.build.steps.length} />
                  </button>
                  <div className="mt-1 flex items-center justify-between gap-1 px-1 text-xs">
                    <span className="font-bold">{i + 1}</span>
                    {e > 0 && <span className="tag tag-bad">{e} error{e > 1 ? "es" : ""}</span>}
                    {e === 0 && w > 0 && <span className="tag tag-warn">{w} aviso{w > 1 ? "s" : ""}</span>}
                    {reviewable && <label className="flex items-center gap-1"><input type="checkbox" checked={checked.includes(s.id)} onChange={(ev) => setChecked(ev.target.checked ? [...checked, s.id] : checked.filter((x) => x !== s.id))} />cambiar</label>}
                  </div>
                </li>
              );
            })}
          </ol>
        </section>
      </div>

      <aside className="space-y-6 xl:sticky xl:top-4 xl:self-start">
        {stage === "design_review" && props.isCurrent && (
          <>
            <section className="sheet p-4" aria-labelledby="aprob">
              <h2 id="aprob" className="font-bold">Aprobar el diseño</h2>
              <p className="hint mt-1">{errCount ? `Hay ${errCount} problema(s) marcados como error. Puedes pedir cambios o aprobar igualmente.` : "Si el diseño te convence, apruébalo para pasar al pulido final."}</p>
              <button className="btn btn-primary mt-3 w-full" disabled={pending || props.busy || props.waitingRender} onClick={() => run(() => approveDesignAction({ id, versionId: props.deckVersionId, sha256: props.deckSha }))}>Aprobar diseño</button>
              {props.waitingRender && <p className="hint mt-2">Espera a que termine la revisión automática.</p>}
            </section>
            <section className="sheet p-4" aria-labelledby="cambios">
              <h2 id="cambios" className="font-bold">Pedir cambios</h2>
              <p className="hint mt-1">{checked.length ? `Se regenerarán solo las ${checked.length} diapositivas marcadas («cambiar»). Las demás se conservan.` : "Sin marcar diapositivas, se regenera todo el diseño. Marca «cambiar» en las miniaturas para limitarlo."}</p>
              <label className="label mt-3 text-sm" htmlFor="dfb">Comentarios</label>
              <textarea id="dfb" className="field" value={fb} onChange={(e) => setFb(e.target.value)} maxLength={3000} placeholder="Ej.: más grande la gráfica; muestra la derivación paso a paso" />
              <div className="mt-3 flex flex-wrap gap-2">
                <button className="btn btn-sm btn-mark" disabled={pending || !fb.trim()} onClick={() => regen(true)}>Regenerar con comentarios</button>
                <button className="btn btn-sm" disabled={pending} onClick={() => regen(false)}>Regenerar sin comentarios</button>
              </div>
            </section>
            <section className="sheet p-4" aria-labelledby="comp">
              <h2 id="comp" className="font-bold">¿Falta un componente visual?</h2>
              <p className="hint mt-1">Si ningún componente del catálogo sirve (p. ej. una recta numérica o un diagrama de fases), pide uno nuevo. Estará disponible solo en esta presentación como «provisional», hasta que un administrador lo revise.</p>
              <label className="label mt-3 text-sm" htmlFor="cn">Nombre (sin espacios)</label>
              <input id="cn" className="field" value={cname} onChange={(e) => setCname(e.target.value.replace(/[^A-Za-z0-9]/g, ""))} maxLength={40} placeholder="RectaNumerica" />
              <label className="label mt-3 text-sm" htmlFor="cp">¿Qué debe mostrar?</label>
              <textarea id="cp" className="field" value={cpurpose} onChange={(e) => setCpurpose(e.target.value)} maxLength={800} placeholder="Una recta numérica con intervalos abiertos/cerrados marcados, para explicar dominios" />
              <button className="btn btn-sm mt-3" disabled={pending || cname.length < 3 || cpurpose.trim().length < 15} onClick={() => run(async () => { const r = await requestComponentAction({ id, name: cname, purpose: cpurpose, slideId: slide.id }); if (r.ok) { setCname(""); setCpurpose(""); } return r; }, "Solicitud enviada. El especialista la está construyendo en un entorno aislado.")}>Pedir componente</button>
            </section>
          </>
        )}
        {props.requests.length > 0 && (
          <section className="sheet p-4" aria-labelledby="reqs">
            <h2 id="reqs" className="font-bold">Componentes solicitados</h2>
            <ul className="mt-2 space-y-2 text-sm">
              {props.requests.map((r) => (
                <li key={r.id}>
                  <span className="font-bold">{r.name}</span>{" "}
                  <span className={`tag ${r.status === "done" ? "tag-ok" : r.status === "failed" ? "tag-bad" : "tag-info"}`}>{{ pending: "En cola", running: "Construyendo", done: "Listo (provisional)", failed: "No se pudo" }[r.status] ?? r.status}</span>
                  {r.error && <p className="text-ink-2">{r.error}</p>}
                </li>
              ))}
            </ul>
          </section>
        )}
        {stage === "design_approved" && (
          <section className="sheet p-4"><h2 className="font-bold">Diseño aprobado</h2>
            <p className="hint mt-1">Siguiente: un pulido final de transiciones y aparición de elementos (no cambia el contenido).</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button className="btn btn-primary" disabled={pending} onClick={() => run(() => startPolishAction({ id }))}>Pulir y continuar</button>
              <button className="btn" disabled={pending} onClick={() => run(() => reopenDesignAction({ id }))}>Reabrir diseño</button>
            </div>
          </section>
        )}
        {["final_review", "published", "private_final"].includes(stage) && <PublishPanel presentationId={id} stage={stage} visibility={props.visibility} appUrl={props.appUrl} />}
        <section className="sheet p-4" aria-labelledby="dh">
          <h2 id="dh" className="font-bold">Historial de versiones</h2>
          <ol className="mt-2 space-y-2 text-sm">
            {props.versions.map((v) => (
              <li key={v.id} className={v.id === props.deckVersionId ? "font-bold" : ""}>
                v{v.n} · {v.kind === "polish" ? "pulido" : "diseño"} · {v.authorKind === "ia" ? "IA" : "Tú"} · {new Date(v.createdAt).toLocaleString("es-EC", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                {v.note && <span className="block font-normal text-ink-2">{v.note}</span>}
                {v.id !== props.deckVersionId && <Link className="btn btn-ghost btn-sm" href={`/presentations/${id}/preview/design?v=${v.id}`}>Ver</Link>}
              </li>
            ))}
          </ol>
        </section>
      </aside>
    </div>
  );
}

void SlideView; void CANVAS;
