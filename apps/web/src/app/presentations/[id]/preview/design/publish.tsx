"use client";
import { useEffect, useState, useTransition } from "react";
import { Callout } from "@/components/ui/Callout";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { keepPrivateAction, publishAction, publishChangesAction, regenerateShareTokenAction, reopenDesignAction, setVisibilityAction, unpublishAction } from "@/actions/presentations";

export function PublishPanel({ presentationId: id, stage: stageProp, visibility: visibilityProp, appUrl, hasUnpublishedChanges }: { presentationId: string; stage: string; visibility: string; appUrl: string; hasUnpublishedChanges: boolean }) {
  const router = useRouter();
  // Estado local sincronizado con el servidor: la UI refleja el resultado de la acción sin esperar al refresh.
  const [stage, setStage] = useState(stageProp);
  const [visibility, setVisibility] = useState(visibilityProp);
  useEffect(() => { setStage(stageProp); }, [stageProp]);
  useEffect(() => { setVisibility(visibilityProp); }, [visibilityProp]);
  const [vis, setVis] = useState<"link" | "public">(visibilityProp === "public" ? "public" : "link");
  const [copied, setCopied] = useState(false);
  const copy = async (text: string) => {
    try { await navigator.clipboard.writeText(text); toast.success("Enlace copiado"); setCopied(true); setTimeout(() => setCopied(false), 2500); }
    catch { setError("No se pudo copiar; selecciona el enlace y cópialo manualmente."); }
  };
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
      {error && <Callout tone="bad">{error}</Callout>}
      {stage === "final_review" && <p className="hint">La presentación está lista. Puedes publicarla (enlace o pública) o dejarla privada: solo tú la verás.</p>}
      {stage !== "published" && (
        <>
          <fieldset className="space-y-2">
            <legend className="label text-sm">Al publicar</legend>
            <label className="flex items-start gap-2"><input type="radio" name="vis" checked={vis === "link"} onChange={() => setVis("link")} className="mt-1.5" /><span><strong>Con enlace.</strong> Solo quien tenga el enlace; puedes revocarlo.</span></label>
            <label className="flex items-start gap-2"><input type="radio" name="vis" checked={vis === "public"} onChange={() => setVis("public")} className="mt-1.5" /><span><strong>Pública.</strong> Cualquiera con la dirección de la presentación.</span></label>
          </fieldset>
          <div className="flex flex-wrap gap-2">
            <button className="btn btn-primary" disabled={pending} onClick={() => run(() => publishAction({ id, visibility: vis }), (d) => { setShareUrl(d.shareUrl); setStage("published"); setVisibility(vis); })}>Publicar</button>
            {stage === "final_review" && <button className="btn" disabled={pending} onClick={() => run(() => keepPrivateAction({ id }))}>Dejar privada</button>}
            <Link className="btn" href={`/presentations/${id}/view`}>Abrir presentación</Link>
          </div>
          {stage === "final_review" && <button className="btn btn-ghost btn-sm" disabled={pending} onClick={() => run(() => reopenDesignAction({ id }))}>Volver a revisar el diseño</button>}
        </>
      )}
      {stage === "published" && (
        <div className="space-y-3">
          {hasUnpublishedChanges && (
            <div role="status" className="rounded border-2 border-warn p-3 text-sm">
              <p className="font-bold">Hay cambios sin publicar.</p>
              <p className="hint mt-1">El enlace sigue mostrando la versión anterior hasta que publiques los cambios (el enlace y la visibilidad no cambian).</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <button className="btn btn-sm btn-primary" disabled={pending} onClick={() => run(() => publishChangesAction({ id }))}>Publicar cambios</button>
                <Link className="btn btn-sm" href={`/presentations/${id}/view?draft=1`} target="_blank">Ver cambios sin publicar</Link>
              </div>
            </div>
          )}
          <p className="text-sm">Visibilidad actual: <strong>{visibility === "public" ? "pública" : "con enlace"}</strong>.</p>
          <p className="break-all text-sm"><span className="font-bold">Dirección:</span> {visibility === "public" ? <><a className="underline" href={viewUrl}>{viewUrl}</a> <button type="button" className="btn btn-sm" onClick={() => copy(viewUrl)}>Copiar enlace</button> <span role="status" className="hint">{copied ? "Enlace copiado" : ""}</span></> : "el enlace con clave se muestra al publicar o al regenerarlo."}</p>
          {shareUrl && (
            <div className="rounded bg-paper-2 p-3 text-sm">
              <p className="break-all"><span className="font-bold">Enlace para compartir (guárdalo, no se vuelve a mostrar):</span><br />{shareUrl}</p>
              <div className="mt-2 flex items-center gap-3">
                <button type="button" className="btn btn-sm" onClick={() => copy(shareUrl)}>Copiar enlace</button>
                <span role="status" className="hint">{copied ? "Enlace copiado" : ""}</span>
              </div>
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <Link className="btn btn-primary" href={`/presentations/${id}/view`}>Abrir presentación</Link>
            {visibility === "link" && <button className="btn" disabled={pending} onClick={() => run(() => regenerateShareTokenAction({ id }), (d) => setShareUrl(d.shareUrl))}>Regenerar enlace (revoca el anterior)</button>}
            <button className="btn" disabled={pending} onClick={() => { const to = visibility === "public" ? "link" : "public"; run(() => setVisibilityAction({ id, visibility: to }), (d) => { setShareUrl(d.shareUrl ?? null); setVisibility(to); }); }}>{visibility === "public" ? "Cambiar a con enlace" : "Cambiar a pública"}</button>
            <button className="btn btn-danger" disabled={pending} onClick={() => run(() => unpublishAction({ id }), () => { setStage("private_final"); setShareUrl(null); })}>Despublicar</button>
          </div>
        </div>
      )}
    </section>
  );
}
