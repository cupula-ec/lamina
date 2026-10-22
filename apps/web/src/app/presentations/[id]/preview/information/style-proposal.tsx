"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { SlideThumb } from "@lamina/engine";
import { nativeResolver, previewDeck } from "@lamina/components";
import { THEMES, type Branding, type StyleChoice } from "@lamina/contracts";
import { setPresentationStyleAction } from "@/actions/style";
import { ThemePicker } from "@/components/ThemePicker";

/** «Estilo propuesto» antes de generar el diseño: miniatura real de la portada y galería para cambiarlo. */
export function StyleProposal({ presentationId, initial, chosen, topic, branding, readOnly }: {
  presentationId: string; initial: StyleChoice; chosen: boolean; topic: string; branding?: Branding | null; readOnly?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saved, setSaved] = useState<StyleChoice>(initial);
  const [value, setValue] = useState<StyleChoice>(initial);
  const [isChosen, setChosen] = useState(chosen);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const spec = THEMES[saved.themeId];
  const deck = previewDeck({ themeId: saved.themeId, accent: saved.accent, topic, branding });

  return (
    <section className="sheet p-5" aria-labelledby="style-h">
      <div className="flex flex-wrap items-center gap-5">
        <div className="w-full max-w-xs shrink-0"><SlideThumb deck={deck} index={0} resolver={nativeResolver} className="ring-2 ring-ink/70" /></div>
        <div className="min-w-0 flex-1">
          <h2 id="style-h" className="text-xl font-bold">{isChosen ? "Estilo elegido" : "Estilo propuesto"}: {spec.name}</h2>
          <p className="text-ink-2">{spec.description}</p>
          <p className="hint mt-1">
            {isChosen ? "Lámina usará este estilo al diseñar." : "Es una sugerencia según la materia: Lámina puede ajustarla al diseñar. Si eliges uno aquí, se respeta tal cual."} Podrás cambiarlo después sin regenerar el contenido.
          </p>
          {!readOnly && !open && <button type="button" className="btn btn-sm mt-3" onClick={() => setOpen(true)}>Cambiar estilo</button>}
        </div>
      </div>

      {open && (
        <div className="mt-5 border-t-2 border-ink/20 pt-5">
          <ThemePicker value={value} onChange={setValue} topic={topic} branding={branding} disabled={pending} />
          {error && <p className="err mt-3" role="alert">{error}</p>}
          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="button" className="btn btn-primary" disabled={pending}
              onClick={() => start(async () => {
                setError(null);
                const r = await setPresentationStyleAction({ id: presentationId, ...value });
                if (!r.ok) return setError(r.error);
                setSaved(value); setChosen(true); setOpen(false); router.refresh();
              })}
            >{pending ? "Guardando…" : "Usar este estilo"}</button>
            <button type="button" className="btn" disabled={pending} onClick={() => { setValue(saved); setOpen(false); setError(null); }}>Cancelar</button>
          </div>
        </div>
      )}
    </section>
  );
}
