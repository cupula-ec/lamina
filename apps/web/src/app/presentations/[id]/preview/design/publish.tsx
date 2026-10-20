"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { keepPrivateAction, publishAction, regenerateShareTokenAction, reopenDesignAction, setVisibilityAction, unpublishAction } from "@/actions/presentations";

export function PublishPanel({ presentationId: id, stage, visibility, appUrl }: { presentationId: string; stage: string; visibility: string; appUrl: string }) {
  const router = useRouter();
  const [vis, setVis] = useState<"link" | "public">(visibility === "public" ? "public" : "link");
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<{ ok: boolean; error?: string; data?: any }>, after?: (d: any) => void) => start(async () => {
    setError(null); const r = await fn(); if (!r.ok) return setError(r.error ?? "Error"); after?.(r.data); router.refresh();
  });
  const viewUrl = `${appUrl}/presentations/${id}/view`;

  return (
    <section className="sheet space-y-4 p-4" aria-labelledby="pub">
      <h2 id="pub" className="font-bold">{stage === "published" ? "Publicada" : stage === "private_final" ? "Lista y privada" : "Revisión final"}</h2>
      {error && <p role="alert" className="err">{error}</p>}
      {stage === "final_review" && <p className="hint">La presentación está lista. Puedes publicarla (enlace o pública) o dejarla privada: solo tú la verás.</p>}
      {stage !== "published" && (
        <>
          <fieldset className="space-y-2">
            <legend className="label text-sm">Al publicar</legend>
            <label className="flex items-start gap-2"><input type="radio" name="vis" checked={vis === "link"} onChange={() => setVis("link")} className="mt-1.5" /><span><strong>Con enlace.</strong> Solo quien tenga el enlace; puedes revocarlo.</span></label>
            <label className="flex items-start gap-2"><input type="radio" name="vis" checked={vis === "public"} onChange={() => setVis("public")} className="mt-1.5" /><span><strong>Pública.</strong> Cualquiera con la dirección de la presentación.</span></label>
          </fieldset>
          <div className="flex flex-wrap gap-2">
            <button className="btn btn-primary" disabled={pending} onClick={() => run(() => publishAction({ id, visibility: vis }), (d) => setShareUrl(d.shareUrl))}>Publicar</button>
            {stage === "final_review" && <button className="btn" disabled={pending} onClick={() => run(() => keepPrivateAction({ id }))}>Dejar privada</button>}
            <Link className="btn" href={`/presentations/${id}/view`}>Abrir presentación</Link>
          </div>
          {stage === "final_review" && <button className="btn btn-ghost btn-sm" disabled={pending} onClick={() => run(() => reopenDesignAction({ id }))}>Volver a revisar el diseño</button>}
        </>
      )}
      {stage === "published" && (
        <div className="space-y-3">
          <p className="text-sm">Visibilidad actual: <strong>{visibility === "public" ? "pública" : "con enlace"}</strong>.</p>
          <p className="break-all text-sm"><span className="font-bold">Dirección:</span> {visibility === "public" ? <a className="underline" href={viewUrl}>{viewUrl}</a> : "el enlace con clave se muestra al publicar o al regenerarlo."}</p>
          {shareUrl && <p className="break-all rounded bg-paper-2 p-3 text-sm"><span className="font-bold">Enlace para compartir (guárdalo, no se vuelve a mostrar):</span><br />{shareUrl}</p>}
          <div className="flex flex-wrap gap-2">
            <Link className="btn btn-primary" href={`/presentations/${id}/view`}>Abrir presentación</Link>
            {visibility === "link" && <button className="btn" disabled={pending} onClick={() => run(() => regenerateShareTokenAction({ id }), (d) => setShareUrl(d.shareUrl))}>Regenerar enlace (revoca el anterior)</button>}
            <button className="btn" disabled={pending} onClick={() => run(() => setVisibilityAction({ id, visibility: visibility === "public" ? "link" : "public" }), (d) => setShareUrl(d.shareUrl))}>Cambiar a {visibility === "public" ? "enlace" : "pública"}</button>
            <button className="btn btn-danger" disabled={pending} onClick={() => run(() => unpublishAction({ id }))}>Despublicar</button>
          </div>
        </div>
      )}
    </section>
  );
}
