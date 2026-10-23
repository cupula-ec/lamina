"use client";
import { authorLabel } from "@/lib/stages";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Latex } from "@lamina/engine";
import type { ContentDraft, Section } from "@lamina/contracts";
import { Callout } from "@/components/ui/Callout";
import { QuotaNote, type QuotaUse } from "@/components/QuotaNote";
import { approveContentAction, regenerateContentAction, restoreContentVersionAction, saveContentAction } from "@/actions/presentations";
import { BlockEditor, FixForm, ORIGIN, REASON_HELP, TYPE_LABEL, newBlock, replaceLatex, uid, type Chunk, type Source, type Version, type Warn } from "./blocks";


export function ContentEditor({ presentationId, stage, versionId, sha256, versionN, initial, versions, sources, chunks, readOnly, quota }: {
  quota?: QuotaUse;
  presentationId: string; stage: string; versionId: string; sha256: string; versionN: number; initial: ContentDraft; versions: Version[]; sources: Source[]; chunks: Chunk[]; readOnly: boolean;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<ContentDraft>(initial);
  const [dirty, setDirty] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [feedback, setFeedback] = useState("");
  const [pick, setPick] = useState<string[]>([]);
  const [open, setOpen] = useState<string | null>(null);

  const chunkMap = useMemo(() => new Map(chunks.map((c) => [c.id, c])), [chunks]);
  const srcMap = useMemo(() => new Map(sources.map((s) => [s.id, s])), [sources]);
  const warnByBlock = useMemo(() => { const m = new Map<string, Warn[]>(); for (const w of draft.warnings) if (w.blockId) m.set(w.blockId, [...(m.get(w.blockId) ?? []), w]); return m; }, [draft.warnings]);
  const general = draft.warnings.filter((w) => !w.kind);
  const cards = useMemo(() => draft.warnings.map((w, i) => ({ w, i })).filter(({ w }) => w.kind && w.status !== "approved"), [draft.warnings]);
  const approvedCount = draft.warnings.filter((w) => w.kind && w.status === "approved").length;
  const [card, setCard] = useState(0);
  const [fixing, setFixing] = useState<string | null>(null);
  const cur = cards[Math.min(card, cards.length - 1)];
  const ro = readOnly || pending;

  const mut = (fn: (d: ContentDraft) => void) => { const d = structuredClone(draft); fn(d); setDraft(d); setDirty(true); setNotice(null); };
  const updSection = (si: number, patch: Partial<Section>) => mut((d) => Object.assign(d.sections[si]!, patch));

  const run = (fn: () => Promise<{ ok: boolean; error?: string } | void>) => start(async () => { setError(null); const r = await fn(); if (r && !r.ok) setError(r.error ?? "Error"); });
  const save = () => run(async () => {
    const r = await saveContentAction({ id: presentationId, baseVersionId: versionId, content: draft });
    if (!r.ok) return r;
    setDirty(false); setNotice("Cambios guardados como una nueva versión."); router.refresh();
  });
  const setWarnStatus = (i: number, status: "approved" | "pending") => mut((d) => { d.warnings[i]!.status = status; });
  const applyFix = (i: number, w: Warn, latex: string) => mut((d) => { if (w.blockId && w.latex && replaceLatex(d, w.blockId, w.latex, latex)) d.warnings.splice(i, 1); });
  const saveAndApprove = () => run(async () => {
    const r = await saveContentAction({ id: presentationId, baseVersionId: versionId, content: draft });
    if (!r.ok) return r;
    const a = await approveContentAction({ id: presentationId, versionId: (r.data as { versionId: string }).versionId, sha256: (r.data as { sha256: string }).sha256 });
    if (!a.ok) return a;
    setDirty(false); toast.success("Contenido aprobado."); router.refresh();
  });
  const approve = () => run(async () => { const r = await approveContentAction({ id: presentationId, versionId, sha256 }); if (!r.ok) return r; toast.success("Contenido aprobado."); router.refresh(); });
  const regenerate = (withFeedback: boolean) => run(async () => {
    const r = await regenerateContentAction({ id: presentationId, feedback: withFeedback ? feedback : undefined, sectionIds: pick });
    if (!r.ok) return r; setFeedback(""); setPick([]); toast.success("Pedimos una nueva versión; puede tardar unos minutos."); router.refresh();
  });
  const restore = (vid: string) => run(async () => { const r = await restoreContentVersionAction({ id: presentationId, versionId: vid }); if (!r.ok) return r; router.refresh(); });

  const total = draft.sections.reduce((n, s) => n + s.slidesHint.length, 0);

  return (
    <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="space-y-6">
        <div className="sheet sticky top-14 z-20 flex flex-wrap items-center justify-between gap-3 p-4 shadow-[0_3px_0_var(--color-ink)] lg:top-0">
          <div>
            <p className="font-bold">Versión {versionN} · {draft.sections.length} secciones · {total} diapositivas previstas</p>
            <p className="hint">{readOnly ? "Contenido aprobado (solo lectura)." : dirty ? "Tienes cambios sin guardar." : "Revisa, edita lo que haga falta y aprueba para pasar al diseño."}</p>
          </div>
          {!readOnly && (
            <div className="flex flex-wrap gap-3">
              <button className="btn" onClick={save} disabled={!dirty || pending}>Guardar cambios</button>
              {dirty && <button className="btn btn-primary" onClick={saveAndApprove} disabled={pending}>Guardar y aprobar contenido</button>}
              {!dirty && <button className="btn btn-primary" onClick={approve} disabled={pending}>Aprobar contenido</button>}
            </div>
          )}
        </div>
        {error && <Callout tone="bad">{error}</Callout>}
        {notice && <Callout tone="ok">{notice}</Callout>}

        {(draft.warnings.length > 0 || (draft.verification?.verified ?? 0) > 0) && (
          <section className="sheet border-warn p-4" aria-labelledby="avisos">
            <h2 id="avisos" className="font-bold">Avisos de verificación</h2>
            <p className="mt-1 text-sm" role="status">
              <span className="font-bold text-ok">{draft.verification?.verified ?? 0} verificados automáticamente</span>
              {" · "}<span className={`font-bold ${cards.length ? "text-warn" : "text-ok"}`}>{cards.length} necesitan revisión</span>
              {approvedCount > 0 && <> · {approvedCount} revisados por ti</>}
            </p>
            {general.length > 0 && <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">{general.map((w, i) => <li key={i}>{w.message}</li>)}</ul>}
            {cur && (
              <article className="mt-3 rounded-md border-2 border-warn p-4" aria-label={`Verificación ${Math.min(card, cards.length - 1) + 1} de ${cards.length}`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-bold">Verificación {Math.min(card, cards.length - 1) + 1} de {cards.length}</h3>
                  <div className="flex gap-1">
                    <button type="button" className="btn btn-ghost btn-sm" disabled={cards.length < 2} onClick={() => { setCard((Math.min(card, cards.length - 1) - 1 + cards.length) % cards.length); setFixing(null); }}>‹ Anterior</button>
                    <button type="button" className="btn btn-ghost btn-sm" disabled={cards.length < 2} onClick={() => { setCard((Math.min(card, cards.length - 1) + 1) % cards.length); setFixing(null); }}>Siguiente ›</button>
                  </div>
                </div>
                <p className="mt-2 text-sm">{cur.w.kind === "mismatch" ? "El verificador encontró una posible inconsistencia en este paso:" : "La presentación usará esta fórmula y no se pudo comprobar sola:"}</p>
                {cur.w.latex && <div className="my-2 overflow-x-auto rounded border border-ink/20 bg-paper px-3 py-2 text-lg"><Latex tex={cur.w.latex} /></div>}
                <p className="text-sm text-ink-2">{cur.w.kind === "mismatch" ? cur.w.message.replace(/^Posible error matemático: /, "") : cur.w.reason ? REASON_HELP[cur.w.reason] : cur.w.message}</p>
                {!readOnly && (fixing === `${cur.i}` ? (
                  <FixForm key={cur.i} initial={cur.w.latex ?? ""} disabled={pending} onCancel={() => setFixing(null)} onApply={(l) => { applyFix(cur.i, cur.w, l); setFixing(null); }} />
                ) : (
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <p className="w-full text-sm font-bold">¿La fórmula es correcta?</p>
                    <button type="button" className="btn btn-sm btn-primary" disabled={pending} onClick={() => setWarnStatus(cur.i, "approved")}>Sí, aprobar</button>
                    <button type="button" className="btn btn-sm" disabled={pending} onClick={() => setFixing(`${cur.i}`)}>No, corregir</button>
                    {cur.w.blockId && <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setOpen(cur.w.blockId!); document.getElementById(`blk-${cur.w.blockId}`)?.scrollIntoView({ behavior: "smooth", block: "center" }); }}>Ver en el contenido</button>}
                  </div>
                ))}
              </article>
            )}
            {!cur && draft.warnings.some((w) => w.kind) && <p className="mt-2 text-sm font-bold text-ok">✓ Revisaste todos los pasos dudosos.</p>}
            {dirty && (cards.length > 0 || approvedCount > 0) && <p className="hint mt-2">Tus revisiones se guardan junto con los demás cambios.</p>}
          </section>
        )}

        {draft.sections.map((s, si) => (
          <section key={s.id} className="sheet" aria-labelledby={`sec-${s.id}`}>
            <div className="flex flex-wrap items-center gap-3 border-b-2 border-ink bg-paper-2 p-3">
              <span className="font-display text-lg font-bold">{si + 1}.</span>
              <input id={`sec-${s.id}`} aria-label={`Título de la sección ${si + 1}`} className="field !min-h-10 flex-1 font-bold" value={s.title} onChange={(e) => updSection(si, { title: e.target.value })} readOnly={ro} />
              <label className="flex items-center gap-2 text-sm font-bold"><input type="checkbox" className="h-4 w-4 accent-[var(--color-blue)]" checked={s.locked} onChange={(e) => updSection(si, { locked: e.target.checked })} disabled={ro} />Conservar al regenerar</label>
              {!readOnly && <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4" checked={pick.includes(s.id)} onChange={(e) => setPick(e.target.checked ? [...pick, s.id] : pick.filter((x) => x !== s.id))} />Regenerar solo esta</label>}
            </div>
            <div className="divide-y-2 divide-ink/10">
              {s.slidesHint.map((h, hi) => (
                <div key={h.id} className="space-y-4 p-4">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="tag tag-mute">Diapositiva {hi + 1}</span>
                    <input aria-label="Título de la diapositiva" className="field !min-h-10 flex-1 font-bold" value={h.intent} onChange={(e) => mut((d) => { d.sections[si]!.slidesHint[hi]!.intent = e.target.value; })} readOnly={ro} />
                    {!readOnly && <button type="button" className="btn btn-ghost btn-sm" onClick={() => mut((d) => { d.sections[si]!.slidesHint.splice(hi, 1); })} disabled={s.slidesHint.length <= 1}>Quitar diapositiva</button>}
                  </div>
                  {h.blocks.map((b, bi) => {
                    const warnsAll = warnByBlock.get(b.id) ?? [];
                    const warns = warnsAll.filter((w) => w.status !== "approved");
                    const reviewed = warnsAll.length - warns.length;
                    const refs = b.sourceRefs.map((r) => { const c = chunkMap.get(r); return c ? { c, s: srcMap.get(c.sourceId) } : null; }).filter(Boolean) as { c: Chunk; s: Source | undefined }[];
                    const o = ORIGIN[b.origin] ?? ORIGIN.generated!;
                    const isOpen = open === b.id;
                    return (
                      <article key={b.id} id={`blk-${b.id}`} className="rounded-md border-2 border-ink/70 p-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <button type="button" className="font-bold underline-offset-4 hover:underline" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : b.id)}>{TYPE_LABEL[b.type]} {isOpen ? "▾" : "▸"}</button>
                          <span className={`tag ${o.tone}`}>{o.label}</span>
                          {refs.map(({ c, s: src }, i) => <span key={i} className="tag tag-info" title={c.text}>Fuente: {(src?.title ?? "—").slice(0, 28)}</span>)}
                          {warns.length > 0 && (
                            <span className="tag tag-warn">⚠ {warns.length} por revisar
                              <button type="button" className="ml-2 font-bold underline" onClick={() => { const ci = cards.findIndex((c) => c.w.blockId === b.id); if (ci >= 0) { setCard(ci); setFixing(null); } document.getElementById("avisos")?.scrollIntoView({ behavior: "smooth", block: "start" }); }}>Revisar</button>
                            </span>
                          )}
                          {reviewed > 0 && <span className="tag tag-ok">✓ revisado</span>}
                          {!readOnly && (
                            <span className="ml-auto flex gap-1">
                              <button type="button" className="btn btn-ghost btn-sm" aria-label="Subir bloque" disabled={bi === 0} onClick={() => mut((d) => { const a = d.sections[si]!.slidesHint[hi]!.blocks; [a[bi - 1], a[bi]] = [a[bi]!, a[bi - 1]!]; })}>↑</button>
                              <button type="button" className="btn btn-ghost btn-sm" aria-label="Bajar bloque" disabled={bi === h.blocks.length - 1} onClick={() => mut((d) => { const a = d.sections[si]!.slidesHint[hi]!.blocks; [a[bi + 1], a[bi]] = [a[bi]!, a[bi + 1]!]; })}>↓</button>
                              <button type="button" className="btn btn-ghost btn-sm" disabled={h.blocks.length <= 1} onClick={() => mut((d) => { d.sections[si]!.slidesHint[hi]!.blocks.splice(bi, 1); })}>Quitar</button>
                            </span>
                          )}
                        </div>
                        {isOpen && (
                          <div className="mt-3 space-y-3">
                            <BlockEditor b={b} ro={ro} onChange={(nb) => mut((d) => { d.sections[si]!.slidesHint[hi]!.blocks[bi] = nb; })} />
                            {refs.length > 0 && <div className="rounded bg-paper-2 p-3 text-sm"><p className="font-bold">Fragmentos de fuente que respaldan este bloque</p>{refs.map(({ c, s: src }, i) => <blockquote key={i} className="mt-2 border-l-4 border-blue pl-3"><span className="font-bold">{src?.title}</span>{src?.url && <> · <a className="underline" href={src.url} target="_blank" rel="noreferrer noopener">abrir</a></>}{c.page ? ` · p. ${c.page}` : ""}<br />{c.text}</blockquote>)}</div>}
                          </div>
                        )}
                      </article>
                    );
                  })}
                  {!readOnly && (
                    <div className="flex flex-wrap gap-2">
                      {(["text", "formula", "definition"] as const).map((t) => <button key={t} type="button" className="btn btn-sm" onClick={() => mut((d) => { d.sections[si]!.slidesHint[hi]!.blocks.push(newBlock(t)); })} disabled={h.blocks.length >= 8}>+ {TYPE_LABEL[t]}</button>)}
                    </div>
                  )}
                </div>
              ))}
              {!readOnly && <div className="p-3"><button type="button" className="btn btn-sm" onClick={() => mut((d) => { d.sections[si]!.slidesHint.push({ id: `h${uid()}`, intent: "Nueva diapositiva", blocks: [newBlock("text")] }); })} disabled={s.slidesHint.length >= 8}>+ Añadir diapositiva</button></div>}
            </div>
          </section>
        ))}
      </div>

      <aside className="space-y-6 xl:sticky xl:top-4 xl:max-h-[calc(100dvh-2rem)] xl:self-start xl:overflow-y-auto">
        <nav className="sheet p-4" aria-labelledby="indice">
          <h2 id="indice" className="font-bold">Índice</h2>
          <ol className="mt-2 space-y-1 text-sm">
            {draft.sections.map((s, i) => (
              <li key={s.id}><a href={`#sec-${s.id}`} className="flex gap-2 underline-offset-4 hover:underline"><span className="font-bold">{i + 1}.</span><span className="truncate">{s.title || "Sin título"}</span><span className="ml-auto text-ink-2">{s.slidesHint.length}</span></a></li>
            ))}
          </ol>
        </nav>
        {!readOnly && (
          <section className="sheet p-4" aria-labelledby="regen">
            <h2 id="regen" className="font-bold">Pedir una nueva versión</h2>
            <p className="hint mt-1">Se crea una versión nueva; la actual no se pierde. Las secciones marcadas «Conservar» no cambian{pick.length ? ` y solo se regeneran las ${pick.length} que marcaste` : ""}.</p>
            <label className="label mt-3 text-sm" htmlFor="fb">Comentarios (opcional)</label>
            <textarea id="fb" className="field" value={feedback} onChange={(e) => setFeedback(e.target.value)} maxLength={3000} placeholder="Ej.: agrega un ejemplo con la regla de la cadena; el nivel es más básico" />
            <div className="mt-3 flex flex-wrap gap-2">
              <button className="btn btn-sm btn-mark" disabled={pending || !feedback.trim() || dirty} onClick={() => regenerate(true)}>Regenerar con comentarios</button>
              <button className="btn btn-sm" disabled={pending || dirty} onClick={() => regenerate(false)}>Regenerar sin comentarios</button>
            </div>
            <QuotaNote q={quota} what="regeneraciones de contenido" />
            {dirty && <p className="hint mt-2">Guarda tus cambios antes de regenerar.</p>}
          </section>
        )}
        <section className="sheet p-4" aria-labelledby="fuentes">
          <h2 id="fuentes" className="font-bold">Fuentes ({sources.filter((s) => s.status === "ok").length})</h2>
          <ul className="mt-2 space-y-2 text-sm">
            {sources.length === 0 && <li className="text-ink-2">No hay fuentes. El contenido se basa en el conocimiento del modelo; revísalo con cuidado.</li>}
            {sources.map((s) => (
              <li key={s.id}>
                <span className={`tag ${s.status === "ok" ? "tag-ok" : "tag-bad"}`}>{s.status === "ok" ? "Usada" : "No disponible"}</span>{" "}
                <span className="font-bold">{s.title}</span> <span className="text-ink-2">({s.origin === "teacher" ? "tuya" : "investigación"})</span>
                {s.url && <> · <a className="underline" href={s.url} target="_blank" rel="noreferrer noopener">abrir</a></>}
                {s.error && <p className="text-pen">{s.error}</p>}
              </li>
            ))}
          </ul>
        </section>
        <section className="sheet p-4" aria-labelledby="hist">
          <h2 id="hist" className="font-bold">Historial de versiones</h2>
          <ol className="mt-2 space-y-2 text-sm">
            {versions.map((v) => (
              <li key={v.id} className={v.id === versionId ? "font-bold" : ""}>
                v{v.n} · {authorLabel(v.authorKind)} · {new Date(v.createdAt).toLocaleString("es-EC", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}{v.id === versionId && " (vigente)"}
                {v.note && <span className="block font-normal text-ink-2">{v.note}</span>}
                {!readOnly && v.id !== versionId && <button className="btn btn-ghost btn-sm" disabled={pending || dirty} onClick={() => restore(v.id)}>Restaurar como nueva versión</button>}
              </li>
            ))}
          </ol>
        </section>
        {stage === "quota_wait" && null}
      </aside>
    </div>
  );
}
