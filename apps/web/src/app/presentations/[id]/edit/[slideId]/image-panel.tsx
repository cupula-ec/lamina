"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Callout } from "@/components/ui/Callout";

type Result = { id: string; thumbUrl: string; url: string; pageUrl: string; provider: string; title?: string; author?: string; license?: string; licenseUrl?: string; width?: number; height?: number };

/**
 * Controles de una imagen (V3 §5.5): buscar otra (con alternativas), subir la propia o quitarla. Cada acción confirma una versión nueva
 * del diseño (por eso se pide guardar o descartar antes los cambios locales del editor).
 */
export function ImagePanel({ presentationId, slideId, slot, alt, disabled }: { presentationId: string; slideId: string; slot: string; alt: string; disabled: boolean }) {
  const router = useRouter();
  const [q, setQ] = useState(alt);
  const [results, setResults] = useState<Result[] | null>(null);
  const [newAlt, setNewAlt] = useState(alt);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const base = `/api/presentations/${presentationId}/images`;

  const call = async (fn: () => Promise<Response>, ok?: (j: any) => void) => {
    setError(null); setBusy(true);
    try {
      const r = await fn();
      const j = await r.json().catch(() => ({}));
      if (!r.ok) setError(j.error ?? "No se pudo completar la acción.");
      else { ok?.(j); }
    } catch { setError("No hay conexión con el servidor."); }
    finally { setBusy(false); }
  };
  const search = () => call(() => fetch(`${base}?q=${encodeURIComponent(q)}`, { cache: "no-store" }), (j) => setResults(j.results as Result[]));
  const use = (r: Result) => call(() => fetch(base, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ slideId, slot, alt: newAlt || alt, url: r.url, meta: { provider: r.provider, pageUrl: r.pageUrl, author: r.author, license: r.license, licenseUrl: r.licenseUrl } }) }), () => { setResults(null); router.refresh(); });
  const upload = () => {
    const f = file.current?.files?.[0];
    if (!f) return setError("Elige un archivo de imagen.");
    const fd = new FormData(); fd.set("file", f); fd.set("slideId", slideId); fd.set("slot", slot); fd.set("alt", newAlt || alt);
    return call(() => fetch(base, { method: "POST", body: fd }), () => router.refresh());
  };
  const remove = () => call(() => fetch(base, { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ slideId, slot }) }), () => router.refresh());

  return (
    <div className="space-y-3 rounded border-2 border-ink/20 p-3" aria-label="Imagen">
      {disabled && <Callout tone="info">Guarda o descarta tus cambios antes de cambiar la imagen.</Callout>}
      {error && <Callout tone="bad">{error}</Callout>}
      <label className="block text-sm"><span className="label">Texto alternativo de la nueva imagen</span><input className="field" value={newAlt} maxLength={300} onChange={(e) => setNewAlt(e.target.value)} /></label>
      <form className="flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); void search(); }}>
        <label className="min-w-0 flex-1"><span className="sr-only">Buscar imagen</span><input className="field" value={q} maxLength={160} placeholder="Qué imagen buscar" onChange={(e) => setQ(e.target.value)} /></label>
        <button className="btn btn-sm" type="submit" disabled={disabled || busy || q.trim().length < 2}>{busy ? "Buscando…" : results ? "Ver otras" : "Buscar otra"}</button>
      </form>
      {results && (results.length ? (
        <ul className="grid grid-cols-2 gap-2" aria-label="Resultados">
          {results.slice(0, 8).map((r) => (
            <li key={r.id} className="space-y-1 rounded border border-ink/20 p-1">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={r.thumbUrl} alt={r.title ?? "Resultado de búsqueda"} className="h-20 w-full rounded object-cover" loading="lazy" referrerPolicy="no-referrer" />
              <p className="truncate text-xs text-ink-2">{r.provider}{r.license ? ` · ${r.license}` : ""}</p>
              <button className="btn btn-sm w-full" disabled={disabled || busy} onClick={() => void use(r)}>Usar esta</button>
            </li>
          ))}
        </ul>
      ) : <p className="hint">Sin resultados: prueba con otras palabras.</p>)}
      <div className="flex flex-wrap items-center gap-2">
        <input ref={file} type="file" accept="image/png,image/jpeg,image/webp,image/gif" aria-label="Subir mi imagen" className="text-sm" />
        <button className="btn btn-sm" disabled={disabled || busy} onClick={() => void upload()}>Subir la mía</button>
        <button className="btn btn-sm btn-ghost" disabled={disabled || busy} onClick={() => void remove()}>Quitar imagen</button>
      </div>
    </div>
  );
}
