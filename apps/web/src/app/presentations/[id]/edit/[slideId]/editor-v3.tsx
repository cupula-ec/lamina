"use client";
import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CANVAS, SlideThumb, adjustedBox, slotBox } from "@lamina/engine";
import { LAYOUTS, type DeckDocument, type Slide } from "@lamina/contracts";
import { nativeEntry } from "@lamina/components";
import { saveSlideEditAction } from "@/actions/presentations";
import { makeResolver, type ProvisionalClient } from "@/lib/resolver";
import { Callout } from "@/components/ui/Callout";
import { SlideChat } from "../../preview/design/slide-chat";
import { ImagePanel } from "./image-panel";
import { PropsEditor, type Json } from "./editor";

type Batch = { batchId: string; author: string; label: string | null; createdAt: string; ops: number; slides: string[] };
const AUTHOR: Record<string, string> = { ia: "Lámina", mcp: "Tu IA conectada", docente: "Tú" };

/**
 * Editor simplificado (V3 §5.8): se hace clic sobre un elemento de la diapositiva y el panel muestra SOLO sus opciones. Lo técnico
 * (posición, tamaño y escala) queda plegado en «Modo avanzado». Incluye el chat con Lámina y el historial de cambios de la IA.
 */
export function SlideEditorV3({ presentationId: id, baseVersionId, deck, slideIndex, prov, stage, backHref, chatOn, imagesOn }: {
  presentationId: string; baseVersionId: string; deck: DeckDocument; slideIndex: number; prov: ProvisionalClient[]; stage: string; backHref: string; chatOn: boolean; imagesOn: boolean;
}) {
  const router = useRouter();
  const resolver = useMemo(() => makeResolver(prov), [prov]);
  const original = deck.slides[slideIndex]!;
  const [slide, setSlide] = useState<Slide>(original);
  const [sel, setSel] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [pending, start] = useTransition();
  const [batches, setBatches] = useState<Batch[]>([]);
  const [histMsg, setHistMsg] = useState<string | null>(null);
  const spec = LAYOUTS[slide.layout];
  const slots = spec.slots.map((s) => s.name).filter((n) => slide.slots[n]);
  const dirty = JSON.stringify(slide) !== JSON.stringify(original);
  const preview = useMemo<DeckDocument>(() => ({ ...deck, slides: [slide] }), [deck, slide]);
  const ref = sel ? slide.slots[sel] : undefined;
  const entry = ref ? nativeEntry(ref.componentId) : undefined;
  const nameOf = (slot: string) => nativeEntry(slide.slots[slot]!.componentId)?.title ?? slide.slots[slot]!.componentId;
  const isImage = ref?.componentId === "Image" || ref?.componentId === "LabeledDiagram";

  const loadHistory = useCallback(async () => {
    try { const r = await fetch(`/api/presentations/${id}/changes`, { cache: "no-store" }); if (r.ok) setBatches(((await r.json()) as { batches: Batch[] }).batches); } catch { /* informativo */ }
  }, [id]);
  useEffect(() => { void loadHistory(); }, [loadHistory]);

  const setProps = (slot: string, props: Json) => setSlide((s) => ({ ...s, slots: { ...s.slots, [slot]: { ...s.slots[slot]!, props: props as Record<string, unknown> } } }));
  const setAdjust = (slot: string, patch: Partial<{ x: number; y: number; w: number; h: number; fontScale: number }>) => setSlide((s) => {
    const base = slotBox(s.layout, slot);
    const merged = { ...(s.adjust?.[slot] ?? {}), ...patch };
    const nb = adjustedBox(s.layout, slot, merged);
    const cur: Record<string, number | undefined> = { x: nb.x, y: nb.y, w: nb.w, h: nb.h, fontScale: merged.fontScale };
    const clean = Object.fromEntries(Object.entries(cur).filter(([k, v]) => v !== undefined && (k === "fontScale" ? v !== 1 : v !== base[k as "x" | "y" | "w" | "h"])));
    const adjust = { ...(s.adjust ?? {}) };
    if (Object.keys(clean).length) adjust[slot] = clean; else delete adjust[slot];
    const { adjust: _old, ...rest } = s; void _old;
    return Object.keys(adjust).length ? { ...rest, adjust } : rest;
  });
  const save = () => start(async () => {
    setErrors([]);
    const r = await saveSlideEditAction({ id, baseVersionId, slide });
    if (!r.ok) return setErrors([r.error]);
    router.push(backHref); router.refresh();
  });
  const undo = async (batchId: string) => {
    setHistMsg(null);
    const r = await fetch(`/api/presentations/${id}/changes/${batchId}/undo`, { method: "POST" });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return setHistMsg(j.error ?? "No se pudo deshacer.");
    router.refresh(); await loadHistory();
  };
  const range = (slot: string, key: "x" | "y" | "w" | "h", text: string, min: number, max: number) => {
    const b = adjustedBox(slide.layout, slot, slide.adjust?.[slot]);
    return <label className="block text-sm"><span className="label">{text}: {b[key]} px</span><input type="range" className="w-full" min={min} max={max} step={8} value={b[key]} onChange={(e) => setAdjust(slot, { [key]: Number(e.target.value) })} /></label>;
  };

  return (
    <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_24rem]">
      <div className="space-y-4">
        <p className="hint" role="note">Haz clic en un elemento de la diapositiva para editarlo.</p>
        <div className="sheet relative overflow-hidden shadow-[5px_5px_0_var(--color-ink)]">
          <SlideThumb deck={preview} index={0} resolver={resolver} step={slide.build.steps.length} />
          {slots.map((n) => {
            const b = adjustedBox(slide.layout, n, slide.adjust?.[n]);
            const on = sel === n, hv = hover === n;
            return (
              <button key={n} type="button" aria-label={`Editar: ${nameOf(n)}`} aria-pressed={on} onClick={() => setSel(on ? null : n)} onMouseEnter={() => setHover(n)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(n)} onBlur={() => setHover(null)}
                className={`absolute cursor-pointer rounded-sm border-2 transition-colors ${on ? "border-pen bg-pen/10" : hv ? "border-blue bg-blue/10" : "border-transparent"}`}
                style={{ left: `${(b.x / CANVAS.width) * 100}%`, top: `${(b.y / CANVAS.height) * 100}%`, width: `${(b.w / CANVAS.width) * 100}%`, height: `${(b.h / CANVAS.height) * 100}%` }}>
                {(on || hv) && <span className="absolute -top-6 left-0 rounded bg-ink px-2 py-0.5 text-xs font-bold text-paper">{nameOf(n)}</span>}
              </button>
            );
          })}
        </div>
        {errors.length > 0 && <ul role="alert" className="err sheet border-pen p-3">{errors.map((e, i) => <li key={i}>{e}</li>)}</ul>}
        <div className="flex flex-wrap gap-3">
          <button className="btn btn-primary" disabled={!dirty || pending} onClick={save}>Guardar cambios</button>
          <button className="btn" disabled={!dirty || pending} onClick={() => { setSlide(original); setErrors([]); }}>Descartar</button>
          <Link className="btn btn-ghost" href={backHref}>Cancelar</Link>
        </div>
        {stage === "published" && <p className="hint">Esta presentación está publicada: el enlace seguirá mostrando la versión actual hasta que pulses «Publicar cambios».</p>}
        {chatOn && !dirty && <SlideChat key={slide.id} presentationId={id} slideId={slide.id} slideNumber={slideIndex + 1} />}
        {chatOn && dirty && <Callout tone="info">Guarda o descarta tus cambios para pedirle algo a Lámina sobre esta diapositiva.</Callout>}
      </div>

      <aside className="space-y-5 xl:self-start">
        <section className="sheet space-y-4 p-4" aria-live="polite">
          {!ref ? (
            <>
              <h2 className="font-bold">Esta diapositiva</h2>
              <p className="text-ink-2">Elige un elemento en la diapositiva para ver sus opciones.</p>
              <label className="block"><span className="label text-sm">Notas del presentador</span><textarea className="field" rows={4} value={slide.notes} maxLength={2000} onChange={(e) => setSlide((s) => ({ ...s, notes: e.target.value }))} /></label>
            </>
          ) : (
            <>
              <div className="flex items-center justify-between"><h2 className="font-bold">{entry?.title ?? ref.componentId}</h2><button type="button" className="btn btn-ghost btn-sm" onClick={() => setSel(null)}>Cerrar</button></div>
              {entry?.purpose && <p className="hint">{entry.purpose}</p>}
              {isImage && imagesOn && <ImagePanel presentationId={id} slideId={slide.id} slot={sel!} alt={String((ref.props as { alt?: string }).alt ?? "")} disabled={dirty} />}
              <PropsEditor value={ref.props as Json} onChange={(v) => setProps(sel!, v)} path={sel!} />
              <details className="rounded border border-ink/20 p-2">
                <summary className="cursor-pointer font-bold">Modo avanzado: posición y tamaño</summary>
                <div className="mt-3 space-y-2">
                  <p className="hint">Layout: <strong>{spec.purpose}</strong></p>
                  {range(sel!, "x", "Posición horizontal", 0, CANVAS.width - 160)}
                  {range(sel!, "y", "Posición vertical", 0, CANVAS.height - 120)}
                  {range(sel!, "w", "Ancho", 160, CANVAS.width)}
                  {range(sel!, "h", "Alto", 120, CANVAS.height)}
                  <label className="block text-sm"><span className="label">Tamaño del contenido: {Math.round((slide.adjust?.[sel!]?.fontScale ?? 1) * 100)} %</span><input type="range" className="w-full" min={50} max={150} step={5} value={Math.round((slide.adjust?.[sel!]?.fontScale ?? 1) * 100)} onChange={(e) => setAdjust(sel!, { fontScale: Number(e.target.value) / 100 })} /></label>
                  {slide.adjust?.[sel!] && <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSlide((s) => { const a = { ...(s.adjust ?? {}) }; delete a[sel!]; const { adjust: _o, ...rest } = s; void _o; return Object.keys(a).length ? { ...rest, adjust: a } : rest; })}>Restablecer posición</button>}
                </div>
              </details>
            </>
          )}
        </section>
        {batches.length > 0 && (
          <section className="sheet space-y-2 p-4" aria-labelledby="hist-h">
            <h2 id="hist-h" className="font-bold">Qué cambió la IA</h2>
            {histMsg && <p role="alert" className="text-sm text-pen">{histMsg}</p>}
            <ul className="divide-y-2 divide-ink/10 text-sm">
              {batches.filter((b) => b.author !== "docente").map((b) => (
                <li key={b.batchId} className="space-y-1 py-2">
                  <p><strong>{AUTHOR[b.author] ?? b.author}</strong> · {new Date(b.createdAt).toLocaleString("es-EC", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</p>
                  <p className="text-ink-2">{b.label ?? "Cambio"}{b.slides.length ? ` · diapositiva${b.slides.length > 1 ? "s" : ""} ${b.slides.join(", ")}` : ""}</p>
                  <button className="btn btn-sm" disabled={dirty} onClick={() => void undo(b.batchId)}>Deshacer</button>
                </li>
              ))}
            </ul>
          </section>
        )}
      </aside>
    </div>
  );
}
