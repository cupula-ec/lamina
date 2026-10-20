"use client";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import katex from "katex";
import { Latex, Md } from "@lamina/engine";
import type { Block, ContentDraft, Section } from "@lamina/contracts";

type Warn = ContentDraft["warnings"][number];
import { approveContentAction, regenerateContentAction, restoreContentVersionAction, saveContentAction } from "@/actions/presentations";

type Version = { id: string; n: number; authorKind: string; note: string | null; createdAt: string };
type Source = { id: string; kind: string; origin: string; title: string; url: string | null; status: string; error: string | null };
type Chunk = { id: string; sourceId: string; text: string; page: number | null };

const ORIGIN: Record<string, { label: string; tone: string }> = {
  teacher: { label: "Tu material", tone: "tag-ok" },
  research: { label: "Investigación", tone: "tag-info" },
  generated: { label: "Generado por IA", tone: "tag-mute" },
  edited: { label: "Editado por ti", tone: "tag-warn" },
};
const TYPE_LABEL: Record<string, string> = { text: "Texto", formula: "Fórmula", derivation: "Derivación", example: "Ejemplo resuelto", graphSpec: "Gráfica", table: "Tabla", diagramSpec: "Diagrama", definition: "Definición", theorem: "Teorema" };

const REASON_HELP: Record<string, string> = {
  sin_igualdad: "No es una igualdad que se pueda comparar.",
  sintaxis: "Usa notación que el verificador aún no entiende (límites, integrales, sumatorias…).",
  dimensiones: "No se pueden determinar las dimensiones de las matrices.",
  muestreo: "No hubo suficientes valores de prueba válidos.",
  ecuacion: "Parece una ecuación por resolver, no una identidad.",
};

/** Sustituye el LaTeX de un paso concreto (fórmula, paso de derivación o de ejemplo) por su corrección. */
function replaceLatex(d: ContentDraft, blockId: string, old: string, next: string): boolean {
  for (const s of d.sections) for (const h of s.slidesHint) for (const b of h.blocks) {
    if (b.id !== blockId) continue;
    if (b.type === "formula" && b.latex === old) { b.latex = next; return true; }
    if (b.type === "derivation") { const st = b.steps.find((x) => x.latex === old); if (st) { st.latex = next; return true; } }
    if (b.type === "example") { const st = b.steps.find((x) => x.latex === old); if (st) { st.latex = next; return true; } }
  }
  return false;
}

const uid = () => Math.random().toString(36).slice(2, 8);
function latexError(tex: string): string | null {
  try { katex.renderToString(tex, { throwOnError: true, strict: "ignore", displayMode: true }); return null; } catch (e) { return (e as Error).message.replace(/^KaTeX parse error: /, "").slice(0, 120); }
}

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return <label className="block"><span className="label text-sm">{label}</span>{children}{hint && <span className="hint">{hint}</span>}</label>;
}

function LatexInput({ value, onChange, label = "LaTeX", ro }: { value: string; onChange: (v: string) => void; label?: string; ro: boolean }) {
  const err = useMemo(() => latexError(value), [value]);
  return (
    <div>
      <Field label={label}><input className="field font-mono text-sm" value={value} onChange={(e) => onChange(e.target.value)} readOnly={ro} spellCheck={false} /></Field>
      <div className="mt-1 min-h-10 overflow-x-auto rounded border border-ink/20 bg-paper px-3 py-1 text-lg" aria-live="polite">
        {err ? <span className="err text-sm">LaTeX inválido: {err}</span> : <Latex tex={value} />}
      </div>
    </div>
  );
}

function BlockEditor({ b, onChange, ro }: { b: Block; onChange: (b: Block) => void; ro: boolean }) {
  const set = <K extends string>(k: K, v: unknown) => onChange({ ...b, [k]: v } as Block);
  const inp = (k: string, label: string, opts: { area?: boolean; hint?: string } = {}) => (
    <Field label={label} hint={opts.hint}>
      {opts.area ? <textarea className="field" value={(b as any)[k] ?? ""} onChange={(e) => set(k, e.target.value)} readOnly={ro} /> : <input className="field" value={(b as any)[k] ?? ""} onChange={(e) => set(k, e.target.value || undefined)} readOnly={ro} />}
    </Field>
  );
  const num = (v: string) => (v === "" || Number.isNaN(Number(v)) ? 0 : Number(v));
  switch (b.type) {
    case "text":
      return <div className="space-y-2">{inp("md", "Texto (Markdown, fórmulas con $…$)", { area: true })}<div className="rounded border border-ink/20 bg-paper p-3 text-[0.97rem] [&_li]:ml-5 [&_li]:list-disc"><Md>{b.md}</Md></div></div>;
    case "formula":
      return <div className="space-y-2"><LatexInput value={b.latex} onChange={(v) => set("latex", v)} ro={ro} />{inp("caption", "Leyenda (opcional)")}</div>;
    case "definition":
      return <div className="space-y-2">{inp("term", "Término")}{inp("md", "Definición (Markdown)", { area: true })}<div className="rounded border border-ink/20 bg-paper p-3"><Md>{b.md}</Md></div></div>;
    case "theorem":
      return <div className="space-y-2">{inp("name", "Nombre")}{inp("statement", "Enunciado", { area: true })}{inp("proofSketch", "Idea de la demostración (opcional)", { area: true })}</div>;
    case "derivation":
      return (
        <div className="space-y-3">
          {b.steps.map((s, i) => (
            <div key={i} className="space-y-1 border-l-4 border-mark pl-3">
              <div className="flex items-center justify-between"><span className="font-bold text-sm">Paso {i + 1}</span>{!ro && <button type="button" className="btn btn-ghost btn-sm" onClick={() => set("steps", b.steps.filter((_, j) => j !== i))} disabled={b.steps.length <= 1}>Quitar</button>}</div>
              <LatexInput value={s.latex} onChange={(v) => set("steps", b.steps.map((x, j) => (j === i ? { ...x, latex: v } : x)))} ro={ro} />
              <Field label="Explicación"><input className="field" value={s.explanation} onChange={(e) => set("steps", b.steps.map((x, j) => (j === i ? { ...x, explanation: e.target.value } : x)))} readOnly={ro} /></Field>
            </div>
          ))}
          {!ro && b.steps.length < 12 && <button type="button" className="btn btn-sm" onClick={() => set("steps", [...b.steps, { latex: "= ", explanation: "" }])}>Añadir paso</button>}
        </div>
      );
    case "example":
      return (
        <div className="space-y-3">
          {inp("problem", "Problema", { area: true })}
          {b.steps.map((s, i) => (
            <div key={i} className="space-y-1 border-l-4 border-mark pl-3">
              <div className="flex items-center justify-between"><span className="font-bold text-sm">Paso {i + 1}</span>{!ro && <button type="button" className="btn btn-ghost btn-sm" onClick={() => set("steps", b.steps.filter((_, j) => j !== i))} disabled={b.steps.length <= 1}>Quitar</button>}</div>
              <Field label="Qué se hace"><input className="field" value={s.text} onChange={(e) => set("steps", b.steps.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))} readOnly={ro} /></Field>
              <LatexInput label="Fórmula del paso (opcional)" value={s.latex ?? ""} onChange={(v) => set("steps", b.steps.map((x, j) => (j === i ? { ...x, latex: v || undefined } : x)))} ro={ro} />
            </div>
          ))}
          {!ro && b.steps.length < 12 && <button type="button" className="btn btn-sm" onClick={() => set("steps", [...b.steps, { text: "" }])}>Añadir paso</button>}
          {inp("answer", "Respuesta")}
        </div>
      );
    case "graphSpec":
      return (
        <div className="space-y-3">
          {b.functions.map((f, i) => (
            <div key={i} className="grid gap-2 sm:grid-cols-[2fr_1fr_auto]">
              <Field label={`Función ${i + 1}: expresión en x`} hint="Ej.: x^3 - 3x, sin(x), exp(-x^2), ln(x)"><input className="field font-mono text-sm" value={f.expr} onChange={(e) => set("functions", b.functions.map((x, j) => (j === i ? { ...x, expr: e.target.value } : x)))} readOnly={ro} /></Field>
              <Field label="Etiqueta"><input className="field" value={f.label ?? ""} onChange={(e) => set("functions", b.functions.map((x, j) => (j === i ? { ...x, label: e.target.value || undefined } : x)))} readOnly={ro} /></Field>
              {!ro && <button type="button" className="btn btn-ghost btn-sm self-end" onClick={() => set("functions", b.functions.filter((_, j) => j !== i))} disabled={b.functions.length <= 1}>Quitar</button>}
            </div>
          ))}
          {!ro && b.functions.length < 4 && <button type="button" className="btn btn-sm" onClick={() => set("functions", [...b.functions, { expr: "x" }])}>Añadir función</button>}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Field label="x mínimo"><input className="field" type="number" step="any" value={b.domain.xMin} onChange={(e) => set("domain", { ...b.domain, xMin: num(e.target.value) })} readOnly={ro} /></Field>
            <Field label="x máximo"><input className="field" type="number" step="any" value={b.domain.xMax} onChange={(e) => set("domain", { ...b.domain, xMax: num(e.target.value) })} readOnly={ro} /></Field>
          </div>
          <Field label="Tangentes en x = (separadas por coma)"><input className="field" value={b.tangents.map((t) => t.at).join(", ")} onChange={(e) => set("tangents", e.target.value.split(",").map((s) => s.trim()).filter((s) => s !== "" && !Number.isNaN(Number(s))).slice(0, 3).map((s) => ({ fnIndex: 0, at: Number(s) })))} readOnly={ro} /></Field>
          {inp("caption", "Leyenda (opcional)")}
        </div>
      );
    case "table":
      return (
        <div className="space-y-2 overflow-x-auto">
          <table className="w-full min-w-[28rem] border-collapse text-sm">
            <thead><tr>{b.headers.map((h, i) => <th key={i}><input aria-label={`Encabezado ${i + 1}`} className="field !min-h-9 font-bold" value={h} onChange={(e) => set("headers", b.headers.map((x, j) => (j === i ? e.target.value : x)))} readOnly={ro} /></th>)}</tr></thead>
            <tbody>{b.rows.map((r, ri) => <tr key={ri}>{r.map((c, ci) => <td key={ci}><input aria-label={`Fila ${ri + 1} columna ${ci + 1}`} className="field !min-h-9" value={c} onChange={(e) => set("rows", b.rows.map((x, j) => (j === ri ? x.map((y, k) => (k === ci ? e.target.value : y)) : x)))} readOnly={ro} /></td>)}</tr>)}</tbody>
          </table>
          {!ro && <div className="flex gap-2"><button type="button" className="btn btn-sm" onClick={() => set("rows", [...b.rows, b.headers.map(() => "")])} disabled={b.rows.length >= 12}>Añadir fila</button><button type="button" className="btn btn-ghost btn-sm" onClick={() => set("rows", b.rows.slice(0, -1))} disabled={b.rows.length <= 1}>Quitar última fila</button></div>}
          {inp("caption", "Leyenda (opcional)")}
        </div>
      );
    case "diagramSpec":
      return (
        <div className="space-y-2">
          <Field label="Tipo"><select className="field" value={b.kind} onChange={(e) => set("kind", e.target.value)} disabled={ro}><option value="vector">Vectores</option><option value="geometry">Geometría</option><option value="generic">Genérico</option></select></Field>
          {inp("description", "Descripción", { area: true })}
          <Field label="Datos (JSON, opcional)" hint="Si los datos no son válidos, el diseño usará una descripción en texto."><textarea className="field font-mono text-xs" value={b.data ? JSON.stringify(b.data, null, 1) : ""} onChange={(e) => { try { set("data", e.target.value.trim() ? JSON.parse(e.target.value) : undefined); } catch { /* se ignora hasta que sea JSON válido */ } }} readOnly={ro} /></Field>
        </div>
      );
  }
}

function FixForm({ initial, disabled, onApply, onCancel }: { initial: string; disabled: boolean; onApply: (latex: string) => void; onCancel: () => void }) {
  const [v, setV] = useState(initial);
  const err = useMemo(() => latexError(v), [v]);
  return (
    <div className="mt-3 space-y-2">
      <LatexInput label="Escribe la fórmula correcta" value={v} onChange={setV} ro={false} />
      <div className="flex gap-2">
        <button type="button" className="btn btn-sm btn-primary" disabled={disabled || !!err || !v.trim() || v === initial} onClick={() => onApply(v)}>Aplicar corrección</button>
        <button type="button" className="btn btn-sm" onClick={onCancel}>Cancelar</button>
      </div>
    </div>
  );
}

const newBlock = (type: "text" | "formula" | "definition"): Block =>
  type === "text" ? { id: `b${uid()}`, type, md: "Nuevo texto", origin: "teacher", sourceRefs: [] }
  : type === "formula" ? { id: `b${uid()}`, type, latex: "x^2", origin: "teacher", sourceRefs: [] }
  : { id: `b${uid()}`, type, term: "Término", md: "Definición", origin: "teacher", sourceRefs: [] };

export function ContentEditor({ presentationId, stage, versionId, sha256, versionN, initial, versions, sources, chunks, readOnly }: {
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
    setDirty(false); router.refresh();
  });
  const approve = () => run(async () => { const r = await approveContentAction({ id: presentationId, versionId, sha256 }); if (!r.ok) return r; router.refresh(); });
  const regenerate = (withFeedback: boolean) => run(async () => {
    const r = await regenerateContentAction({ id: presentationId, feedback: withFeedback ? feedback : undefined, sectionIds: pick });
    if (!r.ok) return r; setFeedback(""); setPick([]); router.refresh();
  });
  const restore = (vid: string) => run(async () => { const r = await restoreContentVersionAction({ id: presentationId, versionId: vid }); if (!r.ok) return r; router.refresh(); });

  const total = draft.sections.reduce((n, s) => n + s.slidesHint.length, 0);

  return (
    <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="space-y-6">
        <div className="sheet flex flex-wrap items-center justify-between gap-3 p-4">
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
        {error && <p role="alert" className="err sheet border-pen p-3">{error}</p>}
        {notice && <p role="status" className="sheet p-3 text-ok font-bold">{notice}</p>}

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
                          {warns.length > 0 && <span className="tag tag-warn">{warns.length} por revisar</span>}
                          {reviewed > 0 && <span className="tag tag-ok">✓ revisado</span>}
                          {!readOnly && (
                            <span className="ml-auto flex gap-1">
                              <button type="button" className="btn btn-ghost btn-sm" aria-label="Subir bloque" disabled={bi === 0} onClick={() => mut((d) => { const a = d.sections[si]!.slidesHint[hi]!.blocks; [a[bi - 1], a[bi]] = [a[bi]!, a[bi - 1]!]; })}>↑</button>
                              <button type="button" className="btn btn-ghost btn-sm" aria-label="Bajar bloque" disabled={bi === h.blocks.length - 1} onClick={() => mut((d) => { const a = d.sections[si]!.slidesHint[hi]!.blocks; [a[bi + 1], a[bi]] = [a[bi]!, a[bi + 1]!]; })}>↓</button>
                              <button type="button" className="btn btn-ghost btn-sm" disabled={h.blocks.length <= 1} onClick={() => mut((d) => { d.sections[si]!.slidesHint[hi]!.blocks.splice(bi, 1); })}>Quitar</button>
                            </span>
                          )}
                        </div>
                        {warns.map((w, i) => <p key={i} className="mt-2 text-sm font-bold text-warn">⚠ {w.message}</p>)}
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

      <aside className="space-y-6 xl:sticky xl:top-4 xl:self-start">
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
                v{v.n} · {v.authorKind === "ia" ? "IA" : "Tú"} · {new Date(v.createdAt).toLocaleString("es-EC", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}{v.id === versionId && " (vigente)"}
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
