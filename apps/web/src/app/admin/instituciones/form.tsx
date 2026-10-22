"use client";
import { useState, useTransition } from "react";
import { Callout } from "@/components/ui/Callout";
import { useRouter } from "next/navigation";
import { BRAND_MIN_CONTRAST, BRAND_THEMES, brandColorFor, contrastRatio } from "@lamina/contracts";
import { createInstitutionAction, deleteInstitutionAction, setInstitutionActiveAction, updateInstitutionAction } from "@/actions/institutions";

type Item = { id: string; name: string; short: string; slug: string; primaryColor: string | null; secondaryColor: string | null; active: boolean; logoUrl: string | null; users: number };
const HEX = /^#[0-9a-fA-F]{6}$/;
const FALLBACK = "#003976";

/** Aviso si el color principal no contrasta lo suficiente con el fondo del tema institucional (allí se usaría el acento del tema). */
function ContrastWarning({ color }: { color: string }) {
  const bg = BRAND_THEMES["institucional-sobrio"]!.bg;
  if (!HEX.test(color) || brandColorFor("institucional-sobrio", color) !== undefined) return null;
  return <p role="note" className="hint sm:col-span-2 font-bold">Este color tiene poco contraste con el fondo del tema institucional ({contrastRatio(color, bg).toFixed(1)}:1; se pide al menos {BRAND_MIN_CONTRAST}:1). En las presentaciones se usará el acento del tema en lugar de este color; el logo y los textos de la institución no cambian. Prueba con un tono más oscuro.</p>;
}

function CoverPreview({ name, short, primary, secondary, logoUrl }: { name: string; short: string; primary: string; secondary: string; logoUrl: string | null }) {
  const p = HEX.test(primary) ? primary : FALLBACK;
  const s = HEX.test(secondary) ? secondary : p;
  return (
    <div className="aspect-video w-full max-w-sm overflow-hidden rounded border-2 border-ink bg-white p-3 text-[10px] shadow-[3px_3px_0_var(--color-ink)]" role="img" aria-label={`Vista previa de la carátula con la marca de ${name || "la institución"}`}>
      <div className="flex items-center justify-between">
        {logoUrl ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={logoUrl} alt="" className="h-6 max-w-[45%] object-contain object-left" /> : <span className="font-bold" style={{ color: p }}>{short || "SIGLA"}</span>}
        <span className="rounded border border-dashed border-ink/40 px-1.5 py-0.5 text-ink-2">tu logo</span>
      </div>
      <div className="mt-3 h-1 w-12" style={{ background: s }} />
      <p className="mt-2 text-sm font-bold" style={{ color: p }}>Título de la presentación</p>
      <p className="text-ink-2">Subtítulo · Nivel</p>
      <p className="mt-3 text-ink-2">Docente · Materia · Período · Grupo</p>
      <p className="mt-2 text-right font-bold" style={{ color: p }}>{short}</p>
    </div>
  );
}

function Row({ item, onDone }: { item: Item; onDone: () => void }) {
  const [f, setF] = useState({ name: item.name, short: item.short, primaryColor: item.primaryColor ?? "", secondaryColor: item.secondaryColor ?? "" });
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [logo, setLogo] = useState(item.logoUrl);
  const [pending, start] = useTransition();
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, ok: string) => start(async () => { setErr(null); setMsg(null); const r = await fn(); if (!r.ok) return setErr(r.error ?? "Error"); setMsg(ok); onDone(); });

  async function upload(file: File | undefined) {
    if (!file) return;
    setErr(null); setMsg(null);
    if (file.size > 1024 * 1024) return setErr("El logo supera 1 MB.");
    const fd = new FormData(); fd.set("logo", file);
    const r = await fetch(`/api/branding/institution/${item.id}`, { method: "POST", body: fd });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return setErr(j.error ?? "No se pudo subir el logo.");
    setLogo(j.url); setMsg("Logo actualizado."); onDone();
  }
  async function removeLogo() {
    setErr(null); setMsg(null);
    const r = await fetch(`/api/branding/institution/${item.id}`, { method: "DELETE" });
    if (!r.ok) return setErr("No se pudo quitar el logo.");
    setLogo(null); setMsg("Logo quitado."); onDone();
  }

  return (
    <li className="p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="font-bold">{item.name} <span className="font-normal text-ink-2">· {item.short}</span></p>
        <p className="flex flex-wrap gap-2 text-xs"><span className={`tag ${item.active ? "tag-ok" : "tag-mute"}`}>{item.active ? "Activa" : "Desactivada"}</span><span className="tag tag-mute">{item.users} docentes</span></p>
      </div>
      <div className="mt-4 grid gap-6 lg:grid-cols-[1fr_auto]">
        <form className="grid gap-3 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); run(() => updateInstitutionAction({ id: item.id, name: f.name, short: f.short, primaryColor: f.primaryColor.trim() || null, secondaryColor: f.secondaryColor.trim() || null, active: item.active }), "Cambios guardados."); }}>
          <div className="sm:col-span-2"><label className="label text-sm" htmlFor={`n-${item.id}`}>Nombre</label><input id={`n-${item.id}`} className="field" value={f.name} onChange={set("name")} maxLength={160} required /></div>
          <div><label className="label text-sm" htmlFor={`s-${item.id}`}>Sigla</label><input id={`s-${item.id}`} className="field" value={f.short} onChange={set("short")} maxLength={24} required /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label text-sm" htmlFor={`p-${item.id}`}>Color principal</label><input id={`p-${item.id}`} className="field" value={f.primaryColor} onChange={set("primaryColor")} placeholder="#003976" maxLength={7} /></div>
            <div><label className="label text-sm" htmlFor={`c-${item.id}`}>Color secundario</label><input id={`c-${item.id}`} className="field" value={f.secondaryColor} onChange={set("secondaryColor")} placeholder="#FCC000" maxLength={7} /></div>
          </div>
          <ContrastWarning color={f.primaryColor.trim()} />
          <div className="sm:col-span-2">
            <label className="label text-sm" htmlFor={`l-${item.id}`}>Logo (PNG, JPEG, WebP o SVG; máx. 1 MB)</label>
            <input id={`l-${item.id}`} className="field" type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml,.png,.jpg,.jpeg,.webp,.svg" onChange={(e) => { void upload(e.target.files?.[0]); e.target.value = ""; }} />
          </div>
          <div className="flex flex-wrap gap-2 sm:col-span-2">
            <button className="btn btn-sm btn-primary" disabled={pending}>Guardar</button>
            {logo && <button type="button" className="btn btn-sm" onClick={() => void removeLogo()}>Quitar logo</button>}
            <button type="button" className="btn btn-sm" disabled={pending} onClick={() => run(() => setInstitutionActiveAction({ id: item.id, active: !item.active }), item.active ? "Desactivada." : "Activada.")}>{item.active ? "Desactivar" : "Activar"}</button>
            <button type="button" className="btn btn-sm btn-danger" disabled={pending || item.users > 0} title={item.users > 0 ? "Tiene docentes asignados: desactívala" : undefined} onClick={() => { if (confirm(`¿Eliminar ${item.name}? No se puede deshacer.`)) run(() => deleteInstitutionAction({ id: item.id }), "Eliminada."); }}>Eliminar</button>
          </div>
          {msg && <p role="status" className="font-bold text-ok sm:col-span-2">{msg}</p>}
          {err && <Callout tone="bad">{err}</Callout>}
        </form>
        <CoverPreview name={f.name} short={f.short} primary={f.primaryColor} secondary={f.secondaryColor} logoUrl={logo} />
      </div>
    </li>
  );
}

export function InstitutionsPanel({ items }: { items: Item[] }) {
  const router = useRouter();
  const [f, setF] = useState({ name: "", short: "", primaryColor: "", secondaryColor: "" });
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });
  return (
    <div className="space-y-8">
      <section className="sheet p-5" aria-labelledby="nueva">
        <h2 id="nueva" className="text-xl font-bold">Nueva institución</h2>
        <form className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1fr_auto]" onSubmit={(e) => { e.preventDefault(); start(async () => { setErr(null); setMsg(null); const r = await createInstitutionAction({ name: f.name, short: f.short, primaryColor: f.primaryColor.trim() || null, secondaryColor: f.secondaryColor.trim() || null, active: true }); if (!r.ok) return setErr(r.error); setMsg("Institución creada. Ahora puedes subirle el logo."); setF({ name: "", short: "", primaryColor: "", secondaryColor: "" }); router.refresh(); }); }}>
          <div><label className="label text-sm" htmlFor="in-name">Nombre</label><input id="in-name" className="field" value={f.name} onChange={set("name")} maxLength={160} required /></div>
          <div><label className="label text-sm" htmlFor="in-short">Sigla</label><input id="in-short" className="field" value={f.short} onChange={set("short")} maxLength={24} required /></div>
          <div><label className="label text-sm" htmlFor="in-p">Color principal</label><input id="in-p" className="field" value={f.primaryColor} onChange={set("primaryColor")} placeholder="#003976" maxLength={7} /></div>
          <div><label className="label text-sm" htmlFor="in-s">Color secundario</label><input id="in-s" className="field" value={f.secondaryColor} onChange={set("secondaryColor")} placeholder="#FCC000" maxLength={7} /></div>
          <button className="btn btn-primary self-end" disabled={pending}>Crear</button>
          <ContrastWarning color={f.primaryColor.trim()} />
        </form>
        {msg && <p role="status" className="mt-3 font-bold text-ok">{msg}</p>}
        {err && <Callout tone="bad">{err}</Callout>}
      </section>
      <section aria-labelledby="lista">
        <h2 id="lista" className="text-xl font-bold">Instituciones ({items.length})</h2>
        <ul className="sheet mt-3 divide-y-2 divide-ink/15">
          {items.map((i) => <Row key={i.id} item={i} onDone={() => router.refresh()} />)}
          {items.length === 0 && <li className="p-4 text-ink-2">Aún no hay instituciones.</li>}
        </ul>
      </section>
    </div>
  );
}
