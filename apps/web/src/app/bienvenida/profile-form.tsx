"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { completeOnboardingAction, saveProfileAction } from "@/actions/profile";

type Inst = { id: string; name: string; short: string };

export function ProfileForm({ mode, institutions, initial }: { mode: "onboarding" | "account"; institutions: Inst[]; initial: { fullName: string; institutionId: string | null; logoUrl: string | null } }) {
  const router = useRouter();
  const [fullName, setFullName] = useState(initial.fullName);
  const [institutionId, setInstitutionId] = useState(initial.institutionId ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [logoUrl, setLogoUrl] = useState(initial.logoUrl);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pending, start] = useTransition();
  const nameOk = fullName.trim().length >= 3;

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
        const input = { fullName, institutionId: institutionId || null };
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
        <select id="institution" className="field" value={institutionId} onChange={(e) => setInstitutionId(e.target.value)}>
          <option value="">Ninguna / otra</option>
          {institutions.map((i) => <option key={i.id} value={i.id}>{i.name} ({i.short})</option>)}
        </select>
        <p className="hint mt-1">Su logo y sigla se usan en la carátula si no subes un logo propio, y junto al tuyo si lo subes.</p>
      </div>
      <div>
        <label className="label" htmlFor="logo">Logo personal (opcional)</label>
        {logoUrl && !file && (
          <div className="mb-2 flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={logoUrl} alt="Tu logo actual" className="h-14 max-w-48 rounded border-2 border-ink bg-white object-contain p-1" />
            <button type="button" className="btn btn-sm btn-danger" onClick={() => void removeLogo()} disabled={busy}>Quitar logo</button>
          </div>
        )}
        <input id="logo" className="field" type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml,.png,.jpg,.jpeg,.webp,.svg" onChange={(e) => {
          const f = e.target.files?.[0] ?? null;
          if (f && f.size > 1024 * 1024) { setError("El logo supera 1 MB."); e.target.value = ""; setFile(null); return; }
          setError(null); setFile(f);
        }} />
        <p className="hint mt-1">Tu logo se mostrará junto al de tu institución en las carátulas. PNG, JPEG, WebP o SVG, hasta 1 MB. Se convierte a PNG por seguridad.</p>
      </div>
      {error && <p role="alert" className="err">{error}</p>}
      {msg && <p role="status" className="font-bold text-ok">{msg}</p>}
      <button className="btn btn-primary" disabled={!nameOk || busy || pending}>{busy || pending ? "Guardando…" : mode === "onboarding" ? "Guardar y continuar" : "Guardar cambios"}</button>
    </form>
  );
}
