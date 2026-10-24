"use client";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CANVAS, Latex, SlideThumb, adjustedBox, slotBox } from "@lamina/engine";
import { LAYOUTS, type DeckDocument, type Slide } from "@lamina/contracts";
import { saveSlideEditAction } from "@/actions/presentations";
import { makeResolver, type ProvisionalClient } from "@/lib/resolver";

export type Json = string | number | boolean | null | Json[] | { [k: string]: Json };
const LONG_KEYS = /^(md|text|explanation|problem|answer|statement|proofSketch|description|caption|note|body|subtitle)$/i;
const LATEX_KEYS = /(^|_)(latex|tex)$/i;

const label = (k: string) => k.replace(/([A-Z])/g, " $1").replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());

/** Editor genérico de las props de un componente a partir de la forma de sus valores; el servidor valida contra el esquema real. */
export function PropsEditor({ value, onChange, path = "" }: { value: Json; onChange: (v: Json) => void; path?: string }) {
  if (Array.isArray(value)) {
    return (
      <div className="space-y-2">
        {value.map((item, i) => (
          <div key={i} className="rounded border border-ink/20 p-2">
            <div className="mb-1 flex items-center justify-between text-xs font-bold"><span>{i + 1}</span><button type="button" className="btn btn-ghost btn-sm" onClick={() => onChange(value.filter((_, j) => j !== i))}>Quitar</button></div>
            <PropsEditor value={item} onChange={(nv) => onChange(value.map((x, j) => (j === i ? nv : x)))} path={path} />
          </div>
        ))}
        {value.length > 0 && <button type="button" className="btn btn-sm" onClick={() => onChange([...value, structuredClone(value[value.length - 1]!)])}>Añadir (copia del último)</button>}
      </div>
    );
  }
  if (value && typeof value === "object") {
    return (
      <div className="space-y-3">
        {Object.entries(value).map(([k, v]) => (
          <div key={k}>
            {typeof v === "object" && v !== null ? <fieldset className="rounded border border-ink/20 p-2"><legend className="px-1 text-sm font-bold">{label(k)}</legend><PropsEditor value={v} onChange={(nv) => onChange({ ...value, [k]: nv })} path={k} /></fieldset>
              : <PropsEditor value={v} onChange={(nv) => onChange({ ...value, [k]: nv })} path={k} />}
          </div>
        ))}
      </div>
    );
  }
  const name = path.split(".").pop() ?? "";
  const id = `f-${Math.abs([...path + String(typeof value)].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7))}`;
  if (typeof value === "boolean") return <label className="flex items-center gap-2 text-sm font-bold"><input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} />{label(name || "Opción")}</label>;
  if (typeof value === "number") return <label className="block"><span className="label text-sm">{label(name || "Número")}</span><input className="field" type="number" step="any" value={value} onChange={(e) => onChange(e.target.value === "" || Number.isNaN(Number(e.target.value)) ? value : Number(e.target.value))} /></label>;
  const s = typeof value === "string" ? value : "";
  const isLatex = LATEX_KEYS.test(name);
  return (
    <label className="block" htmlFor={id}>
      <span className="label text-sm">{label(name || "Texto")}</span>
      {isLatex || !(LONG_KEYS.test(name) || s.length > 70) ? <input id={id} className={`field ${isLatex ? "font-mono text-sm" : ""}`} value={s} onChange={(e) => onChange(e.target.value)} spellCheck={!isLatex} />
        : <textarea id={id} className="field" rows={Math.min(8, Math.max(3, Math.ceil(s.length / 60)))} value={s} onChange={(e) => onChange(e.target.value)} />}
      {isLatex && s && <span className="mt-1 block overflow-x-auto rounded border border-ink/20 bg-paper px-3 py-1 text-lg"><Latex tex={s} /></span>}
    </label>
  );
}

export function SlideEditor({ presentationId: id, baseVersionId, deck, slideIndex, prov, stage, backHref }: {
  presentationId: string; baseVersionId: string; deck: DeckDocument; slideIndex: number; prov: ProvisionalClient[]; stage: string; backHref: string;
}) {
  const router = useRouter();
  const resolver = useMemo(() => makeResolver(prov), [prov]);
  const original = deck.slides[slideIndex]!;
  const [slide, setSlide] = useState<Slide>(original);
  const [tab, setTab] = useState<"contenido" | "diseno">("contenido");
  const [showAreas, setShowAreas] = useState(true);
  const [focus, setFocus] = useState<string | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [pending, start] = useTransition();
  const spec = LAYOUTS[slide.layout];
  const slots = spec.slots.map((s) => s.name).filter((n) => slide.slots[n]);
  const dirty = JSON.stringify(slide) !== JSON.stringify(original);
  const preview = useMemo<DeckDocument>(() => ({ ...deck, slides: [slide] }), [deck, slide]);

  const setProps = (slot: string, props: Json) => setSlide((s) => ({ ...s, slots: { ...s.slots, [slot]: { ...s.slots[slot]!, props: props as Record<string, unknown> } } }));
  const setAdjust = (slot: string, patch: Partial<{ x: number; y: number; w: number; h: number; fontScale: number }>) => setSlide((s) => {
    const base = slotBox(s.layout, slot);
    const merged = { ...(s.adjust?.[slot] ?? {}), ...patch };
    // La caja se normaliza al lienzo (misma regla que la vista previa y el servidor): los controles nunca guardan valores que se rechazarían.
    const nb = adjustedBox(s.layout, slot, merged);
    const cur: Record<string, number | undefined> = { x: nb.x, y: nb.y, w: nb.w, h: nb.h, fontScale: merged.fontScale };
    const clean = Object.fromEntries(Object.entries(cur).filter(([k, v]) => v !== undefined && (k === "fontScale" ? v !== 1 : v !== base[k as "x" | "y" | "w" | "h"])));
    const adjust = { ...(s.adjust ?? {}) };
    if (Object.keys(clean).length) adjust[slot] = clean; else delete adjust[slot];
    const { adjust: _old, ...rest } = s;
    void _old;
    return Object.keys(adjust).length ? { ...rest, adjust } : rest;
  });

  const save = () => start(async () => {
    setErrors([]);
    const r = await saveSlideEditAction({ id, baseVersionId, slide });
    if (!r.ok) return setErrors([r.error]);
    router.push(`${backHref}`);
    router.refresh();
  });

  const range = (slot: string, key: "x" | "y" | "w" | "h", text: string, min: number, max: number) => {
    const b = adjustedBox(slide.layout, slot, slide.adjust?.[slot]);
    return (
      <label className="block text-sm"><span className="label">{text}: {b[key]} px</span>
        <input type="range" className="w-full" min={min} max={max} step={8} value={b[key]} onChange={(e) => setAdjust(slot, { [key]: Number(e.target.value) })} onFocus={() => setFocus(slot)} /></label>
    );
  };

  return (
    <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_26rem]">
      <div className="space-y-4">
        <div className="sheet relative overflow-hidden shadow-[5px_5px_0_var(--color-ink)]">
          <SlideThumb deck={preview} index={0} resolver={resolver} step={slide.build.steps.length} />
          {showAreas && slots.map((n) => {
            const b = adjustedBox(slide.layout, n, slide.adjust?.[n]);
            return <div key={n} aria-hidden className={`pointer-events-none absolute border-2 border-dashed ${focus === n ? "border-pen bg-pen/10" : "border-blue/50"}`} style={{ left: `${(b.x / CANVAS.width) * 100}%`, top: `${(b.y / CANVAS.height) * 100}%`, width: `${(b.w / CANVAS.width) * 100}%`, height: `${(b.h / CANVAS.height) * 100}%` }} />;
          })}
        </div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={showAreas} onChange={(e) => setShowAreas(e.target.checked)} />Mostrar las áreas de cada elemento</label>
        <p className="hint">La vista previa se actualiza al instante. Los cambios se guardan como una versión nueva (queda en el historial) y se vuelve a revisar solo esta diapositiva.</p>
        {errors.length > 0 && <ul role="alert" className="err sheet border-pen p-3">{errors.map((e, i) => <li key={i}>{e}</li>)}</ul>}
        <div className="flex flex-wrap gap-3">
          <button className="btn btn-primary" disabled={!dirty || pending} onClick={save}>Guardar como nueva versión</button>
          <button className="btn" disabled={!dirty || pending} onClick={() => { setSlide(original); setErrors([]); }}>Descartar cambios</button>
          <Link className="btn btn-ghost" href={backHref}>Cancelar</Link>
        </div>
        {stage === "published" && <p className="hint">Esta presentación está publicada: el enlace seguirá mostrando la versión actual hasta que pulses «Publicar cambios».</p>}
      </div>

      <aside className="sheet p-4 xl:self-start">
        <div role="tablist" aria-label="Qué quieres editar" className="mb-4 flex gap-2">
          <button role="tab" aria-selected={tab === "contenido"} className={`btn btn-sm ${tab === "contenido" ? "btn-primary" : ""}`} onClick={() => setTab("contenido")}>Editar contenido</button>
          <button role="tab" aria-selected={tab === "diseno"} className={`btn btn-sm ${tab === "diseno" ? "btn-primary" : ""}`} onClick={() => setTab("diseno")}>Editar diseño</button>
        </div>
        {tab === "contenido" ? (
          <div className="space-y-5">
            {slots.map((n) => (
              <section key={n} aria-label={`Contenido: ${n}`} onFocus={() => setFocus(n)}>
                <h2 className="mb-2 font-bold">{slide.slots[n]!.componentId} <span className="font-normal text-ink-2">({n})</span></h2>
                <PropsEditor value={slide.slots[n]!.props as Json} onChange={(v) => setProps(n, v)} path={n} />
              </section>
            ))}
            <label className="block"><span className="label text-sm">Notas del presentador</span><textarea className="field" rows={3} value={slide.notes} maxLength={2000} onChange={(e) => setSlide((s) => ({ ...s, notes: e.target.value }))} /></label>
          </div>
        ) : (
          <div className="space-y-5">
            <p className="hint">Layout: <strong>{spec.purpose}</strong>. Mueve y cambia el tamaño de cada elemento dentro del lienzo; el tamaño del contenido lo hace más grande o más pequeño dentro de su área.</p>
            {slots.map((n) => {
              const adj = slide.adjust?.[n];
              return (
                <section key={n} aria-label={`Diseño: ${n}`} className="space-y-2 border-t-2 border-ink/10 pt-3" onFocus={() => setFocus(n)}>
                  <h2 className="flex items-center justify-between font-bold"><span>{slide.slots[n]!.componentId} <span className="font-normal text-ink-2">({n})</span></span>{adj && <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSlide((s) => { const a = { ...(s.adjust ?? {}) }; delete a[n]; const { adjust: _o, ...rest } = s; void _o; return Object.keys(a).length ? { ...rest, adjust: a } : rest; })}>Restablecer</button>}</h2>
                  {range(n, "x", "Posición horizontal", 0, CANVAS.width - 160)}
                  {range(n, "y", "Posición vertical", 0, CANVAS.height - 120)}
                  {range(n, "w", "Ancho", 160, CANVAS.width)}
                  {range(n, "h", "Alto", 120, CANVAS.height)}
                  <label className="block text-sm"><span className="label">Tamaño del contenido: {Math.round((adj?.fontScale ?? 1) * 100)} %</span>
                    <input type="range" className="w-full" min={50} max={150} step={5} value={Math.round((adj?.fontScale ?? 1) * 100)} onChange={(e) => setAdjust(n, { fontScale: Number(e.target.value) / 100 })} onFocus={() => setFocus(n)} /></label>
                </section>
              );
            })}
          </div>
        )}
      </aside>
    </div>
  );
}
