"use client";
import { useId, useMemo } from "react";
import { SlideThumb } from "@lamina/engine";
import { nativeResolver, previewDeck } from "@lamina/components";
import { ACCENT_IDS, THEME_IDS, THEMES, type AccentId, type Branding, type StyleChoice, type ThemeId } from "@lamina/contracts";

/** Selector de estilo: galería de temas con vista previa real del motor (portada + diapositiva con fórmula y gráfica) y variantes de acento. */
export function ThemePicker({ value, onChange, topic, branding, disabled }: {
  value: StyleChoice;
  onChange: (v: StyleChoice) => void;
  topic?: string;
  branding?: Branding | null;
  disabled?: boolean;
}) {
  const uid = useId();
  const decks = useMemo(() => Object.fromEntries(THEME_IDS.map((t) => [t, previewDeck({ themeId: t, topic, branding })])) as Record<ThemeId, ReturnType<typeof previewDeck>>, [topic, branding]);
  const current = useMemo(() => previewDeck({ themeId: value.themeId, accent: value.accent, topic, branding }), [value.themeId, value.accent, topic, branding]);
  const spec = THEMES[value.themeId];

  return (
    <div className="space-y-5" data-theme-picker>
      <div className="grid gap-4 lg:grid-cols-2" aria-live="polite">
        {[0, 1].map((i) => (
          <figure key={i} className="m-0">
            <SlideThumb deck={current} index={i} resolver={nativeResolver} className="!rounded-md ring-2 ring-ink/80" />
            <figcaption className="hint mt-1">{i === 0 ? "Portada" : "Diapositiva con fórmula y gráfica"}</figcaption>
          </figure>
        ))}
      </div>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-xl">
          <p className="font-display text-xl font-bold">{spec.name}</p>
          <p className="text-ink-2">{spec.description}</p>
          <p className="hint mt-1">Ideal para: {spec.area}. Tipografías: {spec.fonts.display === spec.fonts.body ? spec.fonts.display : `${spec.fonts.display} y ${spec.fonts.body}`}.</p>
        </div>
        <fieldset disabled={disabled} className="min-w-0">
          <legend className="label">Variante de color</legend>
          <div className="flex flex-wrap gap-2">
            {ACCENT_IDS.map((a, k) => (
              <label key={a} className={`inline-flex cursor-pointer items-center gap-2 rounded-md border-2 px-3 py-1.5 font-bold has-[:checked]:bg-mark has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-blue ${value.accent === a ? "border-ink" : "border-ink/40"}`}>
                <input type="radio" className="sr-only" name={`${uid}-accent`} checked={value.accent === a} onChange={() => onChange({ themeId: value.themeId, accent: a as AccentId })} />
                <Swatch themeId={value.themeId} accent={a} />
                {spec.accents[k]}
              </label>
            ))}
          </div>
        </fieldset>
      </div>

      <fieldset disabled={disabled}>
        <legend className="label">Elige un estilo</legend>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {THEME_IDS.map((t) => (
            <label key={t} className={`group block cursor-pointer rounded-lg border-2 bg-white p-2 transition has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-blue ${value.themeId === t ? "border-ink shadow-[4px_4px_0_var(--color-ink)]" : "border-ink/30 hover:border-ink"}`}>
              <input type="radio" className="sr-only" name={`${uid}-theme`} checked={value.themeId === t} onChange={() => onChange({ themeId: t, accent: value.accent })} />
              <SlideThumb deck={decks[t]} index={0} resolver={nativeResolver} />
              <span className="mt-2 flex items-center justify-between gap-2">
                <span className="font-bold">{THEMES[t].name}</span>
                <span className="tag tag-mute">{THEMES[t].mode === "dark" ? "Oscuro" : "Claro"}</span>
              </span>
              <span className="hint block">{THEMES[t].mood}</span>
            </label>
          ))}
        </div>
      </fieldset>
    </div>
  );
}

function Swatch({ themeId, accent }: { themeId: ThemeId; accent: AccentId }) {
  return (
    <span data-theme={themeId} data-accent={accent} aria-hidden className="inline-flex overflow-hidden rounded-full border-2 border-ink/70">
      <span className="h-5 w-5" style={{ background: "var(--lm-accent)" }} />
      <span className="h-5 w-5" style={{ background: "var(--lm-accent2)" }} />
    </span>
  );
}
