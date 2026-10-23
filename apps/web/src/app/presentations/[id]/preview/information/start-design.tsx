"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { Callout } from "@/components/ui/Callout";
import { useRouter } from "next/navigation";
import { reopenContentAction, startDesignAction } from "@/actions/presentations";

export function StartDesign({ id }: { id: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);
  // Al aprobar el contenido la siguiente acción queda a la vista (la página es larga): se desplaza hasta ella una sola vez.
  useEffect(() => { box.current?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "center" }); }, []);
  return (
    <div ref={box} role="region" aria-label="Siguiente paso: diseño" className="sheet sticky bottom-4 z-10 flex flex-wrap items-center justify-between gap-4 border-ink p-5 shadow-[5px_5px_0_var(--color-ink)]">
      <div>
        <p className="font-bold">Contenido aprobado</p>
        <p className="text-ink-2">Siguiente: Lámina diseña las diapositivas con gráficas, derivaciones y ejemplos.</p>
        {error && <Callout tone="bad">{error}</Callout>}
      </div>
      <div className="flex gap-3">
        <button className="btn" disabled={pending} onClick={() => start(async () => { const r = await reopenContentAction({ id }); if (!r.ok) return setError(r.error); router.refresh(); })}>Reabrir contenido</button>
        <button className="btn btn-primary" disabled={pending} onClick={() => start(async () => { const r = await startDesignAction({ id }); if (!r.ok) return setError(r.error); router.push(`/presentations/${id}/preview/design`); })}>{pending ? "Iniciando…" : "Continuar al diseño"}</button>
      </div>
    </div>
  );
}
