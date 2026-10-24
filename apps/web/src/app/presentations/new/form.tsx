"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Callout } from "@/components/ui/Callout";
import { QuotaNote, type QuotaUse } from "@/components/QuotaNote";
import { AREA_IDS, AREA_LABELS, LENGTHS, LENGTH_IDS, type AreaId, type LengthId } from "@lamina/contracts";
import { checklist, isArea, quality, TEMPLATES } from "@/lib/request-quality";

const LEVELS = ["Bachillerato", "Primer ciclo universitario", "Universidad (ciclos intermedios)", "Posgrado"];

const TONE = { basic: "text-pen", good: "text-warn", excellent: "text-ok" } as const;

/** Panel lateral que se va marcando en vivo (V3 §5.8): qué conviene decir, por qué ayuda y cuánto cuesta. */
function RequestPanel({ items, q }: { items: ReturnType<typeof checklist>; q: ReturnType<typeof quality> }) {
  return (
    <aside className="sheet h-fit p-4 lg:sticky lg:top-4" aria-label="Guía para pedir una buena presentación">
      <p className="font-bold">Calidad del pedido: <span className={TONE[q.level]}>{q.label}</span></p>
      <div className="mt-2 h-2 w-full overflow-hidden rounded bg-ink/10" role="progressbar" aria-valuemin={0} aria-valuemax={q.total} aria-valuenow={q.done} aria-label="Avance de la guía"><div className="h-full bg-blue transition-[width]" style={{ width: `${(q.done / q.total) * 100}%` }} /></div>
      <ul className="mt-3 space-y-2.5 text-sm">
        {items.map((i) => (
          <li key={i.id} className="flex gap-2">
            <span aria-hidden className={`mt-0.5 inline-block h-4 w-4 shrink-0 rounded-full border-2 border-ink text-center text-[10px] leading-3 ${i.done ? "bg-ok text-white" : "bg-white"}`}>{i.done ? "✓" : ""}</span>
            <span><strong>{i.label}</strong><span className="sr-only">{i.done ? " (listo)" : " (pendiente)"}</span><br /><span className="text-ink-2">{i.why}</span>{i.cost && <><br /><span className="text-ink-2 italic">{i.cost}</span></>}</span>
          </li>
        ))}
      </ul>
    </aside>
  );
}

export function NewForm({ consentText, quota, features = { areas: false, length: false } }: { consentText: string; quota?: QuotaUse; features?: { areas: boolean; length: boolean } }) {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2>(1);
  const [f, setF] = useState({ topic: "", level: LEVELS[1]!, objective: "", subject: "", period: "", group: "", notes: "", urls: "", area: "", length: "medium", prior: "", examples: "", avoid: "" });
  const [files, setFiles] = useState<File[]>([]);
  const [fileNote, setFileNote] = useState<string | null>(null);
  const addFiles = (picked: File[]) => {
    const MAX_MB = 20;
    const ok = picked.filter((x) => x.size <= MAX_MB * 1048576);
    const notes: string[] = [];
    if (ok.length < picked.length) notes.push(`Se omitieron archivos de más de ${MAX_MB} MB.`);
    const room = 3 - files.length;
    if (ok.length > room) notes.push(`Máximo 3 archivos: solo se añadieron ${Math.max(room, 0)}.`);
    setFileNote(notes.join(" ") || null);
    setFiles([...files, ...ok.slice(0, Math.max(room, 0))]);
  };
  const [consent, setConsent] = useState(false);
  const [consentOcr, setConsentOcr] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  const step1Ok = f.topic.trim().length >= 3 && f.objective.trim().length >= 5;
  const hasPdf = files.some((x) => /\.pdf$/i.test(x.name));
  const hasMaterials = files.length > 0 || f.notes.trim() !== "" || f.urls.trim() !== "";
  const req = { objective: f.objective, level: f.level, prior: f.prior, examples: f.examples, avoid: f.avoid, materials: hasMaterials };
  const items = checklist(req), q = quality(req);
  const tpl = TEMPLATES[(isArea(f.area) ? f.area : "general") as AreaId];

  async function submit() {
    setBusy(true); setError(null);
    const fd = new FormData();
    for (const [k, v] of Object.entries(f)) { if ((k === "area" && !features.areas) || (k === "length" && !features.length)) continue; fd.set(k, v); }
    for (const file of files) fd.append("files", file);
    if (consent) fd.set("consent", "on");
    if (consent && hasPdf && consentOcr) fd.set("consent_ocr_vision", "on");
    try {
      const r = await fetch("/api/presentations", { method: "POST", body: fd });
      const j = await r.json();
      if (!r.ok) { setError(j.error ?? "No se pudo crear la presentación."); setBusy(false); return; }
      toast.success("Presentación creada. Lámina empieza a investigar.");
      router.push(`/presentations/${j.id}/preview/information`);
    } catch { setError("No hay conexión con el servidor. Inténtalo de nuevo."); setBusy(false); }
  }

  return (
    <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,42rem)_20rem]">
     <div>
      <p className="mb-4 font-bold" aria-live="polite">Paso {step} de 2: {step === 1 ? "¿Qué vas a enseñar?" : "Materiales (opcional)"}</p>
      {step === 1 && (
        <form className="sheet space-y-5 p-6" onSubmit={(e) => { e.preventDefault(); if (step1Ok) setStep(2); }}>
          <div>
            <label className="label" htmlFor="topic">Tema</label>
            <input id="topic" className="field" value={f.topic} onChange={set("topic")} maxLength={200} placeholder="Ej.: La derivada y la regla de la cadena" required autoFocus />
          </div>
          <div>
            <label className="label" htmlFor="level">Nivel</label>
            <select id="level" className="field" value={f.level} onChange={set("level")}>{LEVELS.map((l) => <option key={l}>{l}</option>)}</select>
          </div>
          <div className="grid gap-5 sm:grid-cols-3">
            <div>
              <label className="label" htmlFor="subject">Materia <span className="font-normal text-ink-2">(opcional)</span></label>
              <input id="subject" className="field" value={f.subject} onChange={set("subject")} maxLength={160} placeholder="Ej.: Cálculo I" />
            </div>
            <div>
              <label className="label" htmlFor="period">Período <span className="font-normal text-ink-2">(opcional)</span></label>
              <input id="period" className="field" value={f.period} onChange={set("period")} maxLength={80} placeholder="Ej.: Abr–Ago 2026" />
            </div>
            <div>
              <label className="label" htmlFor="group">Grupo <span className="font-normal text-ink-2">(opcional)</span></label>
              <input id="group" className="field" value={f.group} onChange={set("group")} maxLength={80} placeholder="Ej.: Grupo 2" />
            </div>
          </div>
          <p className="hint -mt-2">Aparecen en la carátula junto a tu nombre. Si los dejas vacíos, se omiten.</p>
          <div>
            <label className="label" htmlFor="objective">¿Qué deben lograr tus estudiantes?</label>
            <textarea id="objective" className="field" value={f.objective} onChange={set("objective")} maxLength={600} placeholder={tpl.objective} required />
            <p className="hint mt-1">Una o dos frases. Cuanto más concreto, mejor el resultado. <button type="button" className="font-bold underline underline-offset-4" onClick={() => setF({ ...f, objective: f.objective || tpl.objective, prior: f.prior || tpl.prior, examples: f.examples || tpl.examples })}>Usar un ejemplo como punto de partida</button></p>
          </div>
          {features.areas && (
            <div>
              <label className="label" htmlFor="area">Área <span className="font-normal text-ink-2">(opcional)</span></label>
              <select id="area" className="field" value={f.area} onChange={set("area")}>
                <option value="">Detectar automáticamente</option>
                {AREA_IDS.map((a) => <option key={a} value={a}>{AREA_LABELS[a]}</option>)}
              </select>
              <p className="hint mt-1">Define el tipo de ejemplos, ejercicios y componentes. Si dudas, déjalo en automático.</p>
            </div>
          )}
          {features.length && (
            <fieldset>
              <legend className="label">¿Cuántas diapositivas?</legend>
              <div className="grid gap-3 sm:grid-cols-3">
                {LENGTH_IDS.map((id) => (
                  <label key={id} className={`cursor-pointer rounded-md border-2 p-3 ${f.length === id ? "border-blue bg-paper-2" : "border-ink/30"}`}>
                    <input type="radio" name="length" className="sr-only" value={id} checked={f.length === id} onChange={() => setF({ ...f, length: id as LengthId })} />
                    <span className="block font-bold">{LENGTHS[id].label} · ~{LENGTHS[id].approx}</span>
                    <span className="block text-sm text-ink-2">{LENGTHS[id].minutes}</span>
                    <span className="block text-sm text-ink-2">{LENGTHS[id].blurb}</span>
                  </label>
                ))}
              </div>
              <p className="hint mt-1">Lámina decide el número exacto dentro del rango.</p>
            </fieldset>
          )}
          <div>
            <label className="label" htmlFor="prior">¿Qué saben ya tus estudiantes? <span className="font-normal text-ink-2">(opcional)</span></label>
            <textarea id="prior" className="field" value={f.prior} onChange={set("prior")} maxLength={600} rows={2} placeholder={tpl.prior} />
          </div>
          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="examples">Ejemplos que quieres ver <span className="font-normal text-ink-2">(opcional)</span></label>
              <textarea id="examples" className="field" value={f.examples} onChange={set("examples")} maxLength={600} rows={2} placeholder={tpl.examples} />
            </div>
            <div>
              <label className="label" htmlFor="avoid">Qué evitar <span className="font-normal text-ink-2">(opcional)</span></label>
              <textarea id="avoid" className="field" value={f.avoid} onChange={set("avoid")} maxLength={600} rows={2} placeholder="Ej.: no uses la notación de Leibniz; sin demostraciones largas" />
            </div>
          </div>
          <button className="btn btn-primary" disabled={!step1Ok}>Continuar</button>
        </form>
      )}
      {step === 2 && (
        <form className="sheet space-y-5 p-6" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
          <p className="max-w-[60ch] text-ink-2">Si no subes nada, Lámina investiga el tema por su cuenta. Si aportas materiales, los usa como fuente principal.</p>
          <div>
            <label className="label" htmlFor="notes">Apuntes (Markdown o texto)</label>
            <textarea id="notes" className="field" value={f.notes} onChange={set("notes")} maxLength={20000} placeholder="Pega aquí tus notas de clase…" />
          </div>
          <div>
            <label className="label" htmlFor="urls">Enlaces de fuentes públicas</label>
            <textarea id="urls" className="field" value={f.urls} onChange={set("urls")} placeholder={"Uno por línea (máximo 5)\nhttps://…"} />
          </div>
          <div>
            <label className="label" htmlFor="files">Archivos: PDF, DOCX, TXT o MD</label>
            {files.length > 0 && (
              <ul className="mb-2 space-y-2" aria-label="Archivos adjuntos">
                {files.map((file, i) => (
                  <li key={`${file.name}-${i}`} className="flex items-center justify-between gap-3 rounded border-2 border-ink/30 px-3 py-2 text-sm">
                    <span className="min-w-0 truncate"><strong>{file.name}</strong> <span className="text-ink-2">· {(file.size / 1048576).toFixed(1)} MB</span></span>
                    <button type="button" className="btn btn-sm btn-ghost" aria-label={`Quitar ${file.name}`} onClick={() => setFiles((cur) => cur.filter((_, j) => j !== i))}>Quitar</button>
                  </li>
                ))}
              </ul>
            )}
            {fileNote && <p role="alert" className="mb-2 text-sm font-bold text-pen">{fileNote}</p>}
            {files.length < 3 && (
              <input id="files" key={files.length} className="field" type="file" multiple accept=".pdf,.docx,.txt,.md,.markdown" aria-label={files.length ? "Añadir otro archivo" : "Elegir archivos"} onChange={(e) => addFiles(Array.from(e.target.files ?? []))} />
            )}
            <p className="hint mt-1">Hasta 3 archivos de 20 MB. Si un PDF es un escaneo, Lámina reconoce su texto con OCR (hasta 40 páginas por documento); puede contener errores, revísalo.</p>
          </div>
          {hasMaterials && (
            <label className="flex items-start gap-3 rounded-md border-2 border-ink bg-paper-2 p-4">
              <input type="checkbox" className="mt-1.5 h-5 w-5 accent-[var(--color-blue)]" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
              <span><strong>Aviso de privacidad.</strong> {consentText}</span>
            </label>
          )}
          {hasPdf && (
            <label className="flex items-start gap-3 rounded-md border-2 border-ink bg-paper-2 p-4">
              <input type="checkbox" name="consent_ocr_vision" className="mt-1.5 h-5 w-5 accent-[var(--color-blue)]" checked={consentOcr} onChange={(e) => setConsentOcr(e.target.checked)} />
              <span>
                <strong>Permito enviar imágenes de páginas con fórmulas a la IA</strong> <span className="text-ink-2">(opcional)</span>.
                <span className="hint mt-1 block">Si tu PDF es un escaneo, el texto se lee en nuestro servidor. Si marcas esta casilla, las páginas que tengan fórmulas o salgan borrosas se enviarán como imagen a un proveedor de IA gratuito que puede retenerla, para transcribir las fórmulas con más precisión. Si no la marcas, solo se usa el OCR local y las fórmulas pueden salir con errores.</span>
              </span>
            </label>
          )}
          {error && <Callout tone="bad">{error}</Callout>}
          <div className="flex flex-wrap gap-3">
            <button type="button" className="btn" onClick={() => setStep(1)} disabled={busy}>Atrás</button>
            <button className="btn btn-primary" disabled={busy || (hasMaterials && !consent)}>{busy ? "Creando…" : "Crear y empezar a investigar"}</button>
          </div>
          <QuotaNote q={quota} what="presentaciones nuevas" />
        </form>
      )}
     </div>
     <RequestPanel items={items} q={q} />
    </div>
  );
}
