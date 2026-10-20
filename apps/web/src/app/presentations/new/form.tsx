"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

const LEVELS = ["Bachillerato", "Primer ciclo universitario", "Universidad (ciclos intermedios)", "Posgrado"];

export function NewForm({ consentText }: { consentText: string }) {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2>(1);
  const [f, setF] = useState({ topic: "", level: LEVELS[1]!, objective: "", notes: "", urls: "" });
  const [files, setFiles] = useState<File[]>([]);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  const step1Ok = f.topic.trim().length >= 3 && f.objective.trim().length >= 5;
  const hasMaterials = files.length > 0 || f.notes.trim() !== "" || f.urls.trim() !== "";

  async function submit() {
    setBusy(true); setError(null);
    const fd = new FormData();
    for (const [k, v] of Object.entries(f)) fd.set(k, v);
    for (const file of files) fd.append("files", file);
    if (consent) fd.set("consent", "on");
    try {
      const r = await fetch("/api/presentations", { method: "POST", body: fd });
      const j = await r.json();
      if (!r.ok) { setError(j.error ?? "No se pudo crear la presentación."); setBusy(false); return; }
      router.push(`/presentations/${j.id}/preview/information`);
    } catch { setError("No hay conexión con el servidor. Inténtalo de nuevo."); setBusy(false); }
  }

  return (
    <div className="mt-8 max-w-2xl">
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
          <div>
            <label className="label" htmlFor="objective">¿Qué deben lograr tus estudiantes?</label>
            <textarea id="objective" className="field" value={f.objective} onChange={set("objective")} maxLength={600} placeholder="Ej.: Calcular derivadas de funciones compuestas e interpretarlas como pendientes" required />
            <p className="hint mt-1">Una o dos frases. Cuanto más concreto, mejor el resultado.</p>
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
            <input id="files" className="field" type="file" multiple accept=".pdf,.docx,.txt,.md,.markdown" onChange={(e) => setFiles(Array.from(e.target.files ?? []).slice(0, 3))} />
            <p className="hint mt-1">Hasta 3 archivos de 20 MB. Los PDF escaneados (imágenes) no se pueden leer: esta versión no hace OCR.</p>
          </div>
          {hasMaterials && (
            <label className="flex items-start gap-3 rounded-md border-2 border-ink bg-paper-2 p-4">
              <input type="checkbox" className="mt-1.5 h-5 w-5 accent-[var(--color-blue)]" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
              <span><strong>Aviso de privacidad.</strong> {consentText}</span>
            </label>
          )}
          {error && <p role="alert" className="err">{error}</p>}
          <div className="flex flex-wrap gap-3">
            <button type="button" className="btn" onClick={() => setStep(1)} disabled={busy}>Atrás</button>
            <button className="btn btn-primary" disabled={busy || (hasMaterials && !consent)}>{busy ? "Creando…" : "Crear y empezar a investigar"}</button>
          </div>
        </form>
      )}
    </div>
  );
}
