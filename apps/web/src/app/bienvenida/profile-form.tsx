"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { Callout } from "@/components/ui/Callout";
import { useRouter } from "next/navigation";
import { completeOnboardingAction, createOwnInstitutionAction, saveProfileAction } from "@/actions/profile";
import { RESEARCH_CONSENT_TEXT } from "@/lib/consent";

type Inst = { id: string; name: string; short: string };
export type ProfileInitial = {
  fullName: string; institutionId: string | null; logoUrl: string | null;
  subjects?: string[]; career?: string | null; faculty?: string | null; yearsTeaching?: number | null; modality?: string | null; levels?: string[];
  techFamiliarity?: number | null; aiFamiliarity?: number | null; logoCorner?: string | null; logoWhich?: string | null; researchConsent?: boolean;
};
const LEVELS = [["grado", "Grado"], ["posgrado", "Posgrado"], ["tecnologico", "Tecnológico"], ["otro", "Otro"]] as const;
const CORNERS = [["tr", "Arriba a la derecha"], ["tl", "Arriba a la izquierda"], ["br", "Abajo a la derecha"], ["bl", "Abajo a la izquierda"], ["none", "No mostrar logo en las diapositivas"]] as const;
const Scale = ({ id, label, value, onChange }: { id: string; label: string; value: number | null; onChange: (n: number | null) => void }) => (
  <div>
    <label className="label" htmlFor={id}>{label}</label>
    <select id={id} className="field" value={value ?? ""} onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}>
      <option value="">Prefiero no decirlo</option>
      {[["1", "1 · Muy poca"], ["2", "2 · Poca"], ["3", "3 · Media"], ["4", "4 · Buena"], ["5", "5 · Mucha"]].map(([v, t]) => <option key={v} value={v}>{t}</option>)}
    </select>
  </div>
);

export function ProfileForm({ mode, institutions, initial }: { mode: "onboarding" | "account"; institutions: Inst[]; initial: ProfileInitial }) {
  const router = useRouter();
  const [fullName, setFullName] = useState(initial.fullName);
  const [institutionId, setInstitutionId] = useState(initial.institutionId ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [logoUrl, setLogoUrl] = useState(initial.logoUrl);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pending, start] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  useEffect(() => {
    if (!file) { setPreview(null); return; }
    const u = URL.createObjectURL(file);
    setPreview(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);
  const clearFile = () => { setFile(null); setError(null); if (inputRef.current) inputRef.current.value = ""; };
  const nameOk = fullName.trim().length >= 3;
  const [subjects, setSubjects] = useState((initial.subjects ?? []).join(", "));
  const [career, setCareer] = useState(initial.career ?? "");
  const [faculty, setFaculty] = useState(initial.faculty ?? "");
  const [years, setYears] = useState(initial.yearsTeaching == null ? "" : String(initial.yearsTeaching));
  const [modality, setModality] = useState(initial.modality ?? "");
  const [levels, setLevels] = useState<string[]>(initial.levels ?? []);
  const [tech, setTech] = useState<number | null>(initial.techFamiliarity ?? null);
  const [ai, setAi] = useState<number | null>(initial.aiFamiliarity ?? null);
  const [corner, setCorner] = useState(initial.logoCorner ?? "tr");
  const [which, setWhich] = useState(initial.logoWhich ?? "both");
  const [research, setResearch] = useState(initial.researchConsent ?? false);
  // «Otra universidad»: se crea una institución propia (sin verificar) en lugar de elegir de la lista.
  const [other, setOther] = useState(false);
  const [oName, setOName] = useState("");
  const [oShort, setOShort] = useState("");
  const [oPrimary, setOPrimary] = useState("#1f4e79");
  const [oLogo, setOLogo] = useState<File | null>(null);

  async function upload(f: File): Promise<string | null> {
    const fd = new FormData();
    fd.set("logo", f);
    const r = await fetch("/api/branding/personal", { method: "POST", body: fd });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { setError(j.error ?? "No se pudo subir el logo."); return null; }
    return j.url as string;
  }

  function submit() {
    setError(null); setMsg(null); setBusy(true);
    start(async () => {
      try {
        if (file) {
          const url = await upload(file);
          if (!url) return;
          setLogoUrl(url); setFile(null);
        }
        let instId: string | null = institutionId || null;
        if (other) {
          if (oName.trim().length < 3 || !oShort.trim()) return setError("Escribe el nombre y la sigla de tu institución.");
          const r0 = await createOwnInstitutionAction({ name: oName, short: oShort, primaryColor: oPrimary, secondaryColor: null });
          if (!r0.ok) return setError(r0.error);
          instId = r0.data.id;
          if (oLogo) {
            const fd = new FormData(); fd.set("logo", oLogo);
            const rl = await fetch(`/api/branding/institution/${instId}`, { method: "POST", body: fd });
            if (!rl.ok) return setError((await rl.json().catch(() => ({}))).error ?? "No se pudo subir el logo de la institución.");
          }
        }
        const input = {
          fullName, institutionId: instId,
          subjects: subjects.split(",").map((x) => x.trim()).filter(Boolean).slice(0, 10),
          career: career || null, faculty: faculty || null, yearsTeaching: years === "" ? null : Math.max(0, Math.min(70, Number(years) || 0)),
          modality: (modality || null) as "presencial" | "virtual" | "hibrida" | null, levels: levels as ("grado" | "posgrado" | "tecnologico" | "otro")[],
          techFamiliarity: tech, aiFamiliarity: ai, logoCorner: corner as "tl", logoWhich: which as "both", researchConsent: research,
        };
        const r = await (mode === "onboarding" ? completeOnboardingAction(input) : saveProfileAction(input));
        if (!r.ok) return setError(r.error);
        if (mode === "onboarding") { router.replace("/dashboard"); router.refresh(); }
        else { setMsg("Cambios guardados."); router.refresh(); }
      } catch { setError("No hay conexión con el servidor. Inténtalo de nuevo."); }
      finally { setBusy(false); }
    });
  }

  async function removeLogo() {
    setError(null); setMsg(null); setBusy(true);
    try {
      const r = await fetch("/api/branding/personal", { method: "DELETE" });
      if (!r.ok) return setError("No se pudo quitar el logo.");
      setLogoUrl(null); setFile(null); setMsg("Logo quitado."); router.refresh();
    } catch { setError("No hay conexión con el servidor."); }
    finally { setBusy(false); }
  }

  return (
    <form className="mt-6 space-y-5" onSubmit={(e) => { e.preventDefault(); if (nameOk) submit(); }}>
      <div>
        <label className="label" htmlFor="fullName">Nombre completo</label>
        <input id="fullName" className="field" value={fullName} onChange={(e) => setFullName(e.target.value)} minLength={3} maxLength={120} autoComplete="name" placeholder="Ej.: María Fernanda López Pérez" required autoFocus={mode === "onboarding"} />
        <p className="hint mt-1">Aparece como autor en la carátula de tus presentaciones.</p>
      </div>
      <div>
        <label className="label" htmlFor="institution">Institución</label>
        <select id="institution" className="field" value={other ? "__other" : institutionId} onChange={(e) => { const v = e.target.value; setOther(v === "__other"); setInstitutionId(v === "__other" ? "" : v); }}>
          <option value="">Ninguna</option>
          {institutions.map((i) => <option key={i.id} value={i.id}>{i.name} ({i.short})</option>)}
          <option value="__other">Mi universidad no está en la lista…</option>
        </select>
        {other && (
          <fieldset className="mt-3 grid gap-3 rounded border-2 border-ink p-3">
            <legend className="px-1 text-sm font-bold">Tu institución</legend>
            <div><label className="label" htmlFor="oName">Nombre completo</label><input id="oName" className="field" value={oName} onChange={(e) => setOName(e.target.value)} maxLength={160} placeholder="Ej.: Universidad Técnica de Ambato" /></div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div><label className="label" htmlFor="oShort">Sigla</label><input id="oShort" className="field" value={oShort} onChange={(e) => setOShort(e.target.value)} maxLength={24} placeholder="UTA" /></div>
              <div><label className="label" htmlFor="oColor">Color principal</label><input id="oColor" className="field h-11 p-1" type="color" value={oPrimary} onChange={(e) => setOPrimary(e.target.value)} /></div>
            </div>
            <div><label className="label" htmlFor="oLogo">Logo (opcional)</label><input id="oLogo" className="field" type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" onChange={(e) => setOLogo(e.target.files?.[0] ?? null)} /></div>
            <p className="hint">Un administrador la revisará. Mientras tanto solo tú la ves y se usa en tus presentaciones.</p>
          </fieldset>
        )}
        <p className="hint mt-1">Su logo y sigla se usan en la carátula si no subes un logo propio, y junto al tuyo si lo subes.</p>
      </div>
      <div>
        <label className="label" htmlFor="logo">Logo personal (opcional)</label>
        {logoUrl && !file && (
          <div className="mb-2 flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={logoUrl} alt="Tu logo actual" className="h-14 max-w-48 rounded border-2 border-ink bg-white object-contain p-1" />
            <button type="button" className="btn btn-sm" onClick={() => inputRef.current?.click()} disabled={busy}>Reemplazar</button>
            <button type="button" className="btn btn-sm btn-danger" onClick={() => void removeLogo()} disabled={busy}>Quitar logo</button>
          </div>
        )}
        {file && preview && (
          <div className="mb-2 flex flex-wrap items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={preview} alt="Vista previa del logo nuevo" className="h-14 max-w-48 rounded border-2 border-ink bg-white object-contain p-1" />
            <span className="text-sm"><strong>{file.name}</strong> · se aplicará al guardar</span>
            <button type="button" className="btn btn-sm" onClick={clearFile}>Deshacer selección</button>
          </div>
        )}
        <input id="logo" ref={inputRef} className="field" type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml,.png,.jpg,.jpeg,.webp,.svg" onChange={(e) => {
          const f = e.target.files?.[0] ?? null;
          if (f && f.size > 1024 * 1024) { setError("El logo supera 1 MB."); e.target.value = ""; setFile(null); return; }
          setError(null); setFile(f);
        }} />
        <p className="hint mt-1">{logoUrl || file ? "Se usa tu logo personal en tus carátulas." : "Sin logo personal, las carátulas usan solo el de tu institución (si la eliges)."} Tu logo se mostrará junto al de tu institución en las carátulas. PNG, JPEG, WebP o SVG, hasta 1 MB. Se convierte a PNG por seguridad.</p>
      </div>
      <fieldset className="grid gap-3 rounded border-2 border-ink p-3">
        <legend className="px-1 text-sm font-bold">Logo en las diapositivas</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          <div><label className="label" htmlFor="corner">Esquina</label>
            <select id="corner" className="field" value={corner} onChange={(e) => setCorner(e.target.value)}>{CORNERS.map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select></div>
          <div><label className="label" htmlFor="which">Qué logo</label>
            <select id="which" className="field" value={which} onChange={(e) => setWhich(e.target.value)}>
              <option value="both">Institución y personal</option><option value="institution">Solo el de la institución</option><option value="personal">Solo el personal</option>
            </select></div>
        </div>
        <p className="hint">Pequeño en las diapositivas y más grande en la portada. Podrás cambiarlo en cada presentación.</p>
      </fieldset>
      <details className="rounded border-2 border-ink p-3" open={mode === "account"}>
        <summary className="cursor-pointer font-bold">Sobre tu docencia (opcional)</summary>
        <div className="mt-3 grid gap-3">
          <div><label className="label" htmlFor="subjects">Materias que dictas</label>
            <input id="subjects" className="field" value={subjects} onChange={(e) => setSubjects(e.target.value)} placeholder="Cálculo I, Programación, Pedagogía (separadas por comas)" />
            <p className="hint mt-1">Lámina las usa para proponer el área de tus presentaciones.</p></div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div><label className="label" htmlFor="career">Carrera</label><input id="career" className="field" value={career} onChange={(e) => setCareer(e.target.value)} maxLength={160} /></div>
            <div><label className="label" htmlFor="faculty">Facultad</label><input id="faculty" className="field" value={faculty} onChange={(e) => setFaculty(e.target.value)} maxLength={160} /></div>
            <div><label className="label" htmlFor="years">Años de experiencia docente</label><input id="years" className="field" inputMode="numeric" value={years} onChange={(e) => setYears(e.target.value.replace(/\D/g, "").slice(0, 2))} /></div>
            <div><label className="label" htmlFor="modality">Modalidad</label>
              <select id="modality" className="field" value={modality} onChange={(e) => setModality(e.target.value)}><option value="">—</option><option value="presencial">Presencial</option><option value="virtual">Virtual</option><option value="hibrida">Híbrida</option></select></div>
            <Scale id="tech" label="Familiaridad con la tecnología" value={tech} onChange={setTech} />
            <Scale id="ai" label="Familiaridad con IA" value={ai} onChange={setAi} />
          </div>
          <fieldset><legend className="label">Nivel en el que enseñas</legend>
            <div className="flex flex-wrap gap-3">{LEVELS.map(([v, t]) => (
              <label key={v} className="flex items-center gap-2"><input type="checkbox" checked={levels.includes(v)} onChange={(e) => setLevels(e.target.checked ? [...levels, v] : levels.filter((x) => x !== v))} />{t}</label>
            ))}</div></fieldset>
          <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={research} onChange={(e) => setResearch(e.target.checked)} /><span><strong>Participar en la investigación (opcional).</strong> {RESEARCH_CONSENT_TEXT}</span></label>
        </div>
      </details>
      {error && <Callout tone="bad">{error}</Callout>}
      {msg && <p role="status" className="font-bold text-ok">{msg}</p>}
      <button className="btn btn-primary" disabled={!nameOk || busy || pending}>{busy || pending ? "Guardando…" : mode === "onboarding" ? "Guardar y continuar" : "Guardar cambios"}</button>
    </form>
  );
}
