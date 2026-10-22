"use client";
import { authorLabel } from "@/lib/stages";
import { Callout } from "@/components/ui/Callout";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { SlideThumb, CANVAS, describeIssue, type SlideIssue } from "@lamina/engine";
import type { DeckDocument } from "@lamina/contracts";
import {
  approveDesignAction, ignoreIssueAction, regenerateDesignAction, reopenDesignAction, repairDesignAction, requestComponentAction, startPolishAction,
} from "@/actions/presentations";
import { makeResolver, type ProvisionalClient } from "@/lib/resolver";
import { PublishPanel } from "./publish";

type Issue = SlideIssue & { index: number };
type Version = { id: string; n: number; authorKind: string; kind: string; note: string | null; createdAt: string };
type Req = { id: string; name: string; purpose: string; status: string; error: string | null; slideId: string | null };

const KIND: Record<string, string> = { overflow: "Se sale", small_text: "Texto pequeño", katex_error: "Fórmula con error", empty_slot: "Área vacía", component_error: "Componente caído" };
const VERSION_KIND: Record<string, string> = { polish: "pulido", repair: "corrección automática", edit: "edición manual", design: "diseño", style: "cambio de estilo" };
const active = (iss: Issue[]) => iss.filter((i) => !i.ignored);

export function DesignReview(props: {
  presentationId: string; stage: string; visibility: string; hasUnpublishedChanges: boolean; deckVersionId: string; deckSha: string; deck: DeckDocument; isCurrent: boolean;
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
  const slideErrs = (sid: string) => active(all[sid] ?? []).filter((i) => i.severity === "error").length;
  const slideWarns = (sid: string) => active(all[sid] ?? []).filter((i) => i.severity === "warning").length;
  const errSlides = deck.slides.filter((s) => slideErrs(s.id) > 0).map((s) => s.id);
  const warnSlides = deck.slides.filter((s) => slideWarns(s.id) > 0).map((s) => s.id);
  const errCount = Object.values(all).flatMap(active).filter((i) => i.severity === "error").length;
  const reviewable = stage === "design_review" && props.isCurrent && !props.busy;
  const repairing = stage === "designing";
  const [onlyProblems, setOnlyProblems] = useState(false);
  const [confirmApprove, setConfirmApprove] = useState(false);
  const [focusIssue, setFocusIssue] = useState<number | null>(null);
  const goTo = (i: number) => { setSel(i); setStep("max"); setFocusIssue(null); };
  const jump = (dir: 1 | -1) => {
    const idx = deck.slides.map((s, i) => (slideErrs(s.id) > 0 ? i : -1)).filter((i) => i >= 0);
    if (!idx.length) return;
    const next = dir === 1 ? idx.find((i) => i > sel) ?? idx[0]! : [...idx].reverse().find((i) => i < sel) ?? idx[idx.length - 1]!;
    goTo(next);
  };
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, ok?: string) => start(async () => { setError(null); setNotice(null); const r = await fn(); if (!r.ok) return setError(r.error ?? "Error"); if (ok) setNotice(ok); router.refresh(); });

  const scope = checked.length ? checked : [];
  const regen = (withText: boolean) => run(async () => { const r = await regenerateDesignAction({ id, feedback: withText ? fb : undefined, slideIds: scope }); if (r.ok) { setFb(""); setChecked([]); } return r; }, "Regenerando… verás la nueva versión en unos minutos.");

  const repair = (slideIds?: string[]) => run(() => repairDesignAction({ id, slideIds }), "Corrigiendo… verás la versión corregida en unos minutos.");
  const ignore = (slideId: string, index: number, ignored: boolean) => run(() => ignoreIssueAction({ id, deckVersionId: props.deckVersionId, slideId, index, ignored }));
  const slideIssues = all[slide.id] ?? [];
  const marked = slideIssues.find((i) => i.index === focusIssue && i.bbox);

  return (
    <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_24rem]">
      <div className="space-y-5">
        {!props.isCurrent && <Callout tone="warn" title="Estás viendo una versión anterior (solo lectura)"><Link className="font-bold underline" href={`/presentations/${id}/preview/design`}>Volver a la vigente</Link></Callout>}
        {repairing && <Callout tone="info">Corrigiendo automáticamente los problemas detectados… esta pantalla se actualiza sola.</Callout>}
        {error && <Callout tone="bad">{error}</Callout>}
        {notice && <Callout tone="ok">{notice}</Callout>}

        <div className="sheet relative overflow-hidden shadow-[5px_5px_0_var(--color-ink)]">
          <SlideThumb key={`${slide.id}-${shownStep}-${props.deckVersionId}`} deck={deck} index={sel} resolver={resolver} step={shownStep} />
          {marked?.bbox && (
            <div aria-hidden className="pointer-events-none absolute rounded-sm border-4 border-pen bg-pen/15"
              style={{ left: `${(marked.bbox.x / CANVAS.width) * 100}%`, top: `${(marked.bbox.y / CANVAS.height) * 100}%`, width: `${(marked.bbox.w / CANVAS.width) * 100}%`, height: `${(marked.bbox.h / CANVAS.height) * 100}%` }} />
          )}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button className="btn btn-sm" onClick={() => goTo(Math.max(0, sel - 1))} disabled={sel === 0} aria-label="Diapositiva anterior">‹</button>
            <span className="font-bold" aria-live="polite">Diapositiva {sel + 1} de {deck.slides.length}</span>
            <button className="btn btn-sm" onClick={() => goTo(Math.min(deck.slides.length - 1, sel + 1))} disabled={sel >= deck.slides.length - 1} aria-label="Diapositiva siguiente">›</button>
          </div>
          {steps > 0 && (
            <label className="flex items-center gap-2 text-sm"><span className="font-bold">Aparición por pasos</span>
              <input type="range" min={0} max={steps} value={shownStep} onChange={(e) => setStep(Number(e.target.value))} aria-valuetext={`paso ${shownStep} de ${steps}`} /> <span>{shownStep}/{steps}</span>
            </label>
          )}
          <div className="flex flex-wrap gap-2">
            {["design_review", "final_review", "private_final", "published"].includes(stage) && props.isCurrent && !props.busy && (
              <Link className="btn btn-sm btn-mark" href={`/presentations/${id}/edit/${encodeURIComponent(slide.id)}`}>Editar diapositiva</Link>
            )}
            <Link className="btn btn-sm" href={`/presentations/${id}/view${stage === "published" && props.hasUnpublishedChanges ? "?draft=1" : ""}`} target="_blank">Probar en pantalla completa</Link>
          </div>
        </div>

        <section className="sheet p-4" aria-labelledby="det">
          <h2 id="det" className="font-bold">Diapositiva {sel + 1}: detalles</h2>
          {slide.rationale && <p className="mt-1 text-sm"><span className="font-bold">Por qué este diseño:</span> {slide.rationale}</p>}
          <p className="mt-1 text-sm"><span className="font-bold">Componentes:</span> {Object.entries(slide.slots).map(([k, r]) => `${r.componentId} (${k})`).join(" · ")}</p>
          {slide.notes && <p className="mt-1 text-sm"><span className="font-bold">Notas del presentador:</span> {slide.notes}</p>}
          <div className="mt-3">
            {props.waitingRender && !props.issues[slide.id] ? <p className="hint" role="status">Revisando esta diapositiva…</p>
              : slideIssues.length === 0 ? <p className="text-sm font-bold text-ok">✓ Sin problemas detectados en esta diapositiva.</p>
              : (
                <ul className="space-y-3">
                  {slideIssues.map((i) => {
                    const d = describeIssue(i);
                    return (
                      <li key={i.index} className={`rounded border-2 p-3 text-sm ${i.ignored ? "border-ink/20 opacity-60" : i.severity === "error" ? "border-pen" : "border-warn"}`}>
                        <p><span className={`tag ${i.severity === "error" ? "tag-bad" : "tag-warn"}`}>{KIND[i.kind] ?? i.kind}</span> {d.text}{i.ignored && <span className="tag tag-mute ml-2">ignorado</span>}</p>
                        {d.detail && <details className="mt-1"><summary className="cursor-pointer text-ink-2">Detalles técnicos</summary><p className="mt-1 text-ink-2">{d.detail}</p></details>}
                        <div className="mt-2 flex flex-wrap gap-2">
                          {i.bbox && <button type="button" className="btn btn-sm" aria-pressed={focusIssue === i.index} onClick={() => setFocusIssue(focusIssue === i.index ? null : i.index)}>{focusIssue === i.index ? "Ocultar marca" : "Ver dónde está"}</button>}
                          {reviewable && i.severity === "error" && !i.ignored && <button type="button" className="btn btn-sm btn-mark" disabled={pending} onClick={() => repair([slide.id])}>Corregir automáticamente</button>}
                          {(reviewable || stage === "final_review") && <button type="button" className="btn btn-sm btn-ghost" disabled={pending} onClick={() => ignore(slide.id, i.index, !i.ignored)}>{i.ignored ? "Dejar de ignorar" : "Ignorar"}</button>}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
          </div>
        </section>

        <section aria-labelledby="thumbs">
          <h2 id="thumbs" className="mb-2 font-bold">Todas las diapositivas {props.waitingRender ? <span className="tag tag-info ml-2">revisión automática en curso</span> : <span className={`tag ml-2 ${errSlides.length ? "tag-bad" : warnSlides.length ? "tag-warn" : "tag-ok"}`} title={`${errCount} problema(s) marcados como error en total`}>{errSlides.length ? `${errSlides.length} diapositiva${errSlides.length > 1 ? "s" : ""} con errores` : "Sin errores"} · {warnSlides.length} con avisos</span>}</h2>
          <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
            <label className="flex items-center gap-1"><input type="checkbox" checked={onlyProblems} onChange={(e) => setOnlyProblems(e.target.checked)} />Mostrar solo con problemas</label>
            <button type="button" className="btn btn-sm" disabled={!errSlides.length} onClick={() => jump(-1)}>‹ Error anterior</button>
            <button type="button" className="btn btn-sm" disabled={!errSlides.length} onClick={() => jump(1)}>Siguiente error ›</button>
            {reviewable && (
              <>
                <button type="button" className="btn btn-sm" disabled={!errSlides.length} onClick={() => setChecked(errSlides)}>Seleccionar con errores</button>
                <button type="button" className="btn btn-sm" disabled={!warnSlides.length} onClick={() => setChecked(warnSlides)}>Seleccionar con avisos</button>
                <button type="button" className="btn btn-sm btn-ghost" disabled={!checked.length} onClick={() => setChecked([])}>Limpiar selección</button>
              </>
            )}
          </div>
          <ol className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5">
            {deck.slides.map((s, i) => {
              const e = slideErrs(s.id), w = slideWarns(s.id);
              if (onlyProblems && e + w === 0) return null;
              return (
                <li key={s.id} className={`rounded-md border-2 p-1 ${i === sel ? "border-blue bg-paper-2" : "border-ink/30"}`}>
                  <button type="button" className="block w-full text-left" onClick={() => goTo(i)} aria-label={`Ir a la diapositiva ${i + 1}`} aria-current={i === sel}>
                    <SlideThumb deck={deck} index={i} resolver={resolver} step={s.build.steps.length} />
                  </button>
                  <div className="mt-1 flex items-center justify-between gap-1 px-1 text-xs">
                    <span className="font-bold">{i + 1}</span>
                    <span className="flex flex-wrap gap-1">
                      {e > 0 && <span className="tag tag-bad">{e} error{e > 1 ? "es" : ""}</span>}
                      {w > 0 && <span className="tag tag-warn">{w} aviso{w > 1 ? "s" : ""}</span>}
                    </span>
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
              <h2 id="aprob" className="font-bold">{errCount ? "Corregir y aprobar" : "Aprobar el diseño"}</h2>
              {errCount ? (
                <>
                  <p className="hint mt-1">Quedan {errCount} problema(s) marcados como error en {errSlides.length} diapositiva(s). Lo recomendable es corregirlos antes de aprobar.</p>
                  <button className="btn btn-primary mt-3 w-full" disabled={pending || props.busy || props.waitingRender} onClick={() => repair(undefined)}>Corregir errores</button>
                  {!confirmApprove ? (
                    <button className="btn btn-ghost btn-sm mt-2 w-full" disabled={pending || props.busy || props.waitingRender} onClick={() => setConfirmApprove(true)}>Aprobar de todos modos</button>
                  ) : (
                    <div role="alertdialog" aria-label="Confirmar aprobación con errores" className="mt-3 rounded border-2 border-pen p-3 text-sm">
                      <p className="font-bold">¿Aprobar con {errCount} error(es) pendiente(s)?</p>
                      <p className="hint mt-1">La presentación final podría tener contenido cortado. Puedes ignorar errores concretos si no te importan.</p>
                      <div className="mt-2 flex gap-2">
                        <button className="btn btn-sm btn-danger" disabled={pending} onClick={() => run(() => approveDesignAction({ id, versionId: props.deckVersionId, sha256: props.deckSha }))}>Sí, aprobar con errores</button>
                        <button className="btn btn-sm" onClick={() => setConfirmApprove(false)}>Cancelar</button>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <>
                  <p className="hint mt-1">Si el diseño te convence, apruébalo para pasar al pulido final.</p>
                  <button className="btn btn-primary mt-3 w-full" disabled={pending || props.busy || props.waitingRender} onClick={() => run(() => approveDesignAction({ id, versionId: props.deckVersionId, sha256: props.deckSha }))}>Aprobar diseño</button>
                </>
              )}
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
              <p className="hint mt-1">Si ningún componente del catálogo sirve (p. ej. una recta numérica o un diagrama de fases), pide uno nuevo. Estará disponible solo en esta presentación como «provisional», hasta que un administrador lo revise. Selecciona primero la diapositiva (de contenido) donde lo quieres usar: <strong>diapositiva {sel + 1}</strong>.</p>
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
        {["final_review", "published", "private_final"].includes(stage) && <PublishPanel presentationId={id} stage={stage} visibility={props.visibility} appUrl={props.appUrl} hasUnpublishedChanges={props.hasUnpublishedChanges} />}
        <section className="sheet p-4" aria-labelledby="dh">
          <h2 id="dh" className="font-bold">Historial de versiones</h2>
          <ol className="mt-2 space-y-2 text-sm">
            {props.versions.map((v) => (
              <li key={v.id} className={v.id === props.deckVersionId ? "font-bold" : ""}>
                v{v.n} · {VERSION_KIND[v.kind] ?? "diseño"} · {authorLabel(v.authorKind)} · {new Date(v.createdAt).toLocaleString("es-EC", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
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

