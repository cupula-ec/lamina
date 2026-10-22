"use client";
import { useEffect, useMemo, useState } from "react";
import { SlideThumb } from "@lamina/engine";
import { nativeResolver } from "@lamina/components";
import { THEMES } from "@lamina/contracts";
import { DEMO_THEMES, demoDeck } from "./demo";

const SLIDES = [
  { label: "Portada con marcas", caption: "Portada: logo de la institución y del docente, datos del curso." },
  { label: "Fórmula y gráfica", caption: "La gráfica se calcula desde la función f(x); no es una imagen." },
] as const;

/** Demo viva de la landing A: diapositivas reales del motor con cambio de tema en vivo. */
export function DemoA() {
  const [ti, setTi] = useState(0);
  const [si, setSi] = useState(1);
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  const theme = DEMO_THEMES[ti]!;
  const deck = useMemo(() => demoDeck(theme.id, theme.accent), [theme]);
  const spec = THEMES[theme.id];

  return (
    <div className="la-demo" id="demo">
      <div className="la-sheet">
        <div className="la-sheet-under" aria-hidden />
        <div className="la-slide-frame" role="img" aria-label={`Diapositiva de ejemplo «${SLIDES[si]!.label}» con el tema ${spec.name}, dibujada por el motor de Lámina`}>
          {ready ? (
            <div key={`${theme.id}-${si}`} className="la-slide-in" aria-hidden>
              <SlideThumb deck={deck} index={si} resolver={nativeResolver} />
            </div>
          ) : <div className="la-skeleton" />}
        </div>
        <p className="la-fig" aria-live="polite">
          <span><b>Fig. {si + 1}</b> &nbsp;{SLIDES[si]!.caption}</span>
          <span className="serif hidden sm:inline" style={{ fontStyle: "italic" }}>{spec.name}</span>
        </p>
      </div>

      <div className="la-ctrl">
        <div className="la-row" role="group" aria-label="Elegir tema">
          <span className="la-row-label" aria-hidden>Tema</span>
          {DEMO_THEMES.map((t, i) => (
            <button key={t.id} type="button" className="la-chip" aria-pressed={i === ti} onClick={() => setTi(i)}>
              <span className="la-dot" style={{ background: i === ti ? "#f0cf7a" : "transparent" }} aria-hidden />{t.label}
            </button>
          ))}
        </div>
        <div className="la-row" role="group" aria-label="Elegir diapositiva">
          <span className="la-row-label" aria-hidden>Diapositiva</span>
          {SLIDES.map((s, i) => (
            <button key={s.label} type="button" className="la-chip" aria-pressed={i === si} onClick={() => setSi(i)}>{s.label}</button>
          ))}
        </div>
      </div>
    </div>
  );
}
