"use client";
import { useMemo, useState } from "react";
import katex from "katex";
import { Latex, Md } from "@lamina/engine";
import type { Block, ContentDraft } from "@lamina/contracts";
import { applyInstruction, hasMatrix, parseMatrices, resize, serializeMatrices, type Piece } from "@/lib/matrix-latex";

export type Warn = ContentDraft["warnings"][number];


export type Version = { id: string; n: number; authorKind: string; note: string | null; createdAt: string };
export type Source = { id: string; kind: string; origin: string; title: string; url: string | null; status: string; error: string | null };
export type Chunk = { id: string; sourceId: string; text: string; page: number | null };

export const ORIGIN: Record<string, { label: string; tone: string }> = {
  teacher: { label: "Tu material", tone: "tag-ok" },
  research: { label: "Investigación", tone: "tag-info" },
  generated: { label: "Generado por IA", tone: "tag-mute" },
  edited: { label: "Editado por ti", tone: "tag-warn" },
};
export const TYPE_LABEL: Record<string, string> = { text: "Texto", formula: "Fórmula", derivation: "Derivación", example: "Ejemplo resuelto", graphSpec: "Gráfica", table: "Tabla", diagramSpec: "Diagrama", definition: "Definición", theorem: "Teorema", motivation: "Motivación", exercise: "Ejercicio", code: "Código", imageRequest: "Imagen", activity: "Actividad", closing: "Cierre de clase" };

export const REASON_HELP: Record<string, string> = {
  sin_igualdad: "No es una igualdad que se pueda comparar.",
  sintaxis: "Usa notación que el verificador aún no entiende (límites, integrales, sumatorias…).",
  dimensiones: "No se pueden determinar las dimensiones de las matrices.",
  muestreo: "No hubo suficientes valores de prueba válidos.",
  ecuacion: "Parece una ecuación por resolver, no una identidad.",
};

/** Sustituye el LaTeX de un paso concreto (fórmula, paso de derivación o de ejemplo) por su corrección. */
export function replaceLatex(d: ContentDraft, blockId: string, old: string, next: string): boolean {
  for (const s of d.sections) for (const h of s.slidesHint) for (const b of h.blocks) {
    if (b.id !== blockId) continue;
    if (b.type === "formula" && b.latex === old) { b.latex = next; return true; }
    if (b.type === "derivation") { const st = b.steps.find((x) => x.latex === old); if (st) { st.latex = next; return true; } }
    if (b.type === "example") { const st = b.steps.find((x) => x.latex === old); if (st) { st.latex = next; return true; } }
  }
  return false;
}

export const uid = () => Math.random().toString(36).slice(2, 8);
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

export function BlockEditor({ b, onChange, ro }: { b: Block; onChange: (b: Block) => void; ro: boolean }) {
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

const SNIPPETS: [string, string][] = [["Fracción", "\\frac{a}{b}"], ["Potencia", "x^{2}"], ["Raíz", "\\sqrt{x}"], ["Sumatoria", "\\sum_{i=1}^{n} a_i"], ["Matriz 2×2", "\\begin{pmatrix}0 & 0 \\\\ 0 & 0\\end{pmatrix}"]];

/** Corrección de una fórmula: editor visual de celdas para matrices y plantillas; el LaTeX queda como modo avanzado. */
export function FixForm({ initial, disabled, onApply, onCancel }: { initial: string; disabled: boolean; onApply: (latex: string) => void; onCancel: () => void }) {
  const [v, setV] = useState(initial);
  const [advanced, setAdvanced] = useState(!hasMatrix(initial));
  const err = useMemo(() => latexError(v), [v]);
  const pieces = useMemo(() => parseMatrices(v), [v]);
  const update = (next: Piece[]) => setV(serializeMatrices(next));
  const [cmd, setCmd] = useState("");
  const [cmdMsg, setCmdMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const runCmd = () => {
    const r = applyInstruction(v, cmd);
    if (r.ok) { setV(r.latex); setCmd(""); setCmdMsg({ ok: true, text: `Listo: ${r.summary}. Revisa el resultado y aplica la corrección.` }); }
    else setCmdMsg({ ok: false, text: r.error });
  };
  const setPiece = (i: number, p: Piece) => update(pieces.map((x, j) => (j === i ? p : x)));
  return (
    <div className="mt-3 space-y-3">
      <p className="text-sm font-bold">Corrige la fórmula</p>
      <form className="space-y-1" onSubmit={(e) => { e.preventDefault(); if (cmd.trim()) runCmd(); }}>
        <label className="label text-sm" htmlFor="nl-fix">O descríbelo con tus palabras</label>
        <div className="flex flex-wrap gap-2">
          <input id="nl-fix" className="field !min-h-10 min-w-0 flex-1" value={cmd} onChange={(e) => setCmd(e.target.value)} placeholder="Ej.: cambia a12 por a13 · cambia fila 2 columna 1 por 5 · agrega una fila" />
          <button type="submit" className="btn btn-sm" disabled={!cmd.trim()}>Aplicar cambio</button>
        </div>
        {cmdMsg && <p role="status" className={`text-sm ${cmdMsg.ok ? "text-ok" : "text-pen"}`}>{cmdMsg.text}</p>}
      </form>
      {!advanced && (
        <div className="space-y-3">
          <p className="hint">Edita las celdas directamente. Puedes escribir números o expresiones como a_{"{12}"}.</p>
          <div className="flex flex-wrap items-center gap-3">
            {pieces.map((p, i) => p.t === "text" ? (
              p.v.trim() || i === 0 ? <input key={i} aria-label="Texto entre matrices" className="field !min-h-10 w-28 font-mono text-sm" value={p.v} onChange={(e) => setPiece(i, { t: "text", v: e.target.value })} spellCheck={false} /> : null
            ) : (
              <div key={i} className="rounded border-2 border-ink/30 p-2">
                <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${p.rows[0]!.length}, minmax(3.5rem, 1fr))` }}>
                  {p.rows.flatMap((row, r) => row.map((cell, c) => (
                    <input key={`${r}-${c}`} aria-label={`Fila ${r + 1}, columna ${c + 1}`} className="field !min-h-9 px-1 text-center font-mono text-sm" value={cell} spellCheck={false}
                      onChange={(e) => setPiece(i, { ...p, rows: p.rows.map((rr, ri) => rr.map((cc, ci) => (ri === r && ci === c ? e.target.value : cc))) })} />
                  )))}
                </div>
                <div className="mt-2 flex flex-wrap gap-1 text-xs">
                  <button type="button" className="btn btn-sm btn-ghost" onClick={() => setPiece(i, { ...p, rows: resize(p.rows, p.rows.length + 1, p.rows[0]!.length) })}>+ fila</button>
                  <button type="button" className="btn btn-sm btn-ghost" disabled={p.rows.length < 2} onClick={() => setPiece(i, { ...p, rows: resize(p.rows, p.rows.length - 1, p.rows[0]!.length) })}>− fila</button>
                  <button type="button" className="btn btn-sm btn-ghost" onClick={() => setPiece(i, { ...p, rows: resize(p.rows, p.rows.length, p.rows[0]!.length + 1) })}>+ columna</button>
                  <button type="button" className="btn btn-sm btn-ghost" disabled={p.rows[0]!.length < 2} onClick={() => setPiece(i, { ...p, rows: resize(p.rows, p.rows.length, p.rows[0]!.length - 1) })}>− columna</button>
                </div>
              </div>
            ))}
          </div>
          <div className="min-h-10 overflow-x-auto rounded border border-ink/20 bg-paper px-3 py-1 text-lg" aria-live="polite">{err ? <span className="err text-sm">No se puede dibujar: {err}</span> : <Latex tex={v} />}</div>
        </div>
      )}
      {advanced && (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-1" aria-label="Plantillas">
            {SNIPPETS.map(([label, tex]) => <button key={label} type="button" className="btn btn-sm btn-ghost" onClick={() => setV((cur) => `${cur}${cur && !/[\s=(+\-]$/.test(cur) ? " " : ""}${tex}`)}>+ {label}</button>)}
          </div>
          <LatexInput label="Fórmula (modo avanzado, LaTeX)" value={v} onChange={setV} ro={false} />
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn btn-sm btn-primary" disabled={disabled || !!err || !v.trim() || v === initial} onClick={() => onApply(v)}>Aplicar corrección</button>
        <button type="button" className="btn btn-sm" onClick={onCancel}>Cancelar</button>
        {(advanced ? hasMatrix(v) : true) && <button type="button" className="btn btn-sm btn-ghost" onClick={() => setAdvanced((x) => !x)}>{advanced ? "Usar editor visual" : "Modo avanzado (LaTeX)"}</button>}
      </div>
    </div>
  );
}

export const newBlock = (type: "text" | "formula" | "definition"): Block =>
  type === "text" ? { id: `b${uid()}`, type, md: "Nuevo texto", origin: "teacher", sourceRefs: [] }
  : type === "formula" ? { id: `b${uid()}`, type, latex: "x^2", origin: "teacher", sourceRefs: [] }
  : { id: `b${uid()}`, type, term: "Término", md: "Definición", origin: "teacher", sourceRefs: [] };
