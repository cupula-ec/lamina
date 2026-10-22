"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { THEMES, type Branding, type StyleChoice } from "@lamina/contracts";
import { changeDeckStyleAction } from "@/actions/style";
import { ThemePicker } from "@/components/ThemePicker";

/** Cambio de estilo sobre el diseño actual: no regenera contenido, crea una versión «estilo» y vuelve a dibujar las capturas. */
export function StyleChange({ presentationId, baseVersionId, current, topic, branding }: { presentationId: string; baseVersionId: string; current: StyleChoice; topic: string; branding?: Branding | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState<StyleChoice>(current);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const same = value.themeId === current.themeId && value.accent === current.accent;
  return (
    <section className="sheet p-4" aria-label="Estilo visual">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p><strong>Estilo:</strong> {THEMES[current.themeId].name} · {THEMES[current.themeId].accents[["a", "b", "c"].indexOf(current.accent)]}</p>
        {!open && <button type="button" className="btn btn-sm" onClick={() => setOpen(true)}>Cambiar estilo</button>}
      </div>
      {open && (
        <div className="mt-4 border-t-2 border-ink/20 pt-4">
          <p className="hint mb-3">El contenido y las diapositivas no cambian: solo la apariencia. Se crea una versión nueva y se vuelven a dibujar las capturas.</p>
          <ThemePicker value={value} onChange={setValue} topic={topic} branding={branding} disabled={pending} />
          {error && <p className="err mt-3" role="alert">{error}</p>}
          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="button" className="btn btn-primary" disabled={pending || same}
              onClick={() => start(async () => {
                setError(null);
                const r = await changeDeckStyleAction({ id: presentationId, baseVersionId, ...value });
                if (!r.ok) return setError(r.error);
                setOpen(false); router.refresh();
              })}
            >{pending ? "Aplicando…" : "Aplicar estilo"}</button>
            <button type="button" className="btn" disabled={pending} onClick={() => { setValue(current); setOpen(false); setError(null); }}>Cancelar</button>
          </div>
        </div>
      )}
    </section>
  );
}
