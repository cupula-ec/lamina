"use client";
import { useState, useTransition } from "react";
import { Callout } from "@/components/ui/Callout";
import { useRouter } from "next/navigation";
import { reopenContentAction, startDesignAction } from "@/actions/presentations";

export function StartDesign({ id }: { id: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="sheet flex flex-wrap items-center justify-between gap-4 p-5">
      <div>
        <p className="font-bold">Contenido aprobado</p>
        <p className="text-ink-2">Siguiente: Lámina diseña las diapositivas con gráficas, derivaciones y ejemplos.</p>
        {error && <Callout tone="bad">{error}</Callout>}
      </div>
      <div className="flex gap-3">
        <button className="btn" disabled={pending} onClick={() => start(async () => { const r = await reopenContentAction({ id }); if (!r.ok) return setError(r.error); router.refresh(); })}>Reabrir contenido</button>
        <button className="btn btn-primary" disabled={pending} onClick={() => start(async () => { const r = await startDesignAction({ id }); if (!r.ok) return setError(r.error); router.push(`/presentations/${id}/preview/design`); })}>{pending ? "Iniciando…" : "Generar el diseño"}</button>
      </div>
    </div>
  );
}
