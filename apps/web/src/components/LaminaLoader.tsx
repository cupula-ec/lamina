"use client";
import { useEffect, useState } from "react";

const TIPS = [
  "Una buena clase abre con una pregunta, no con una definición.",
  "Un ejercicio con pistas graduales enseña más que la solución a la vista.",
  "Una idea por diapositiva: si hay dos, son dos diapositivas.",
  "Cierra cada clase con un ticket de salida: una pregunta que cada estudiante responde en un minuto.",
  "Las imágenes de apoyo ayudan más cuando explican algo que el texto no puede.",
  "Prepara un ejemplo cotidiano para cada concepto nuevo.",
];

const STEPS: Record<string, string[]> = {
  researching: ["Leyendo tus materiales", "Buscando fuentes", "Redactando el borrador"],
  designing: ["Eligiendo layouts y componentes", "Buscando imágenes", "Verificando fórmulas y desbordes"],
  polishing: ["Ajustando transiciones", "Preparando la aparición progresiva"],
};
const STEP_AT: Record<string, number[]> = { researching: [0, 40, 100], designing: [0, 70, 150], polishing: [0, 10] };

/** «12 de 29 diapositivas listas» → { done, total }. */
export function parseProgress(p?: string | null): { done: number; total: number } | null {
  const m = p?.match(/(\d+)\s+de\s+(\d+)/);
  return m ? { done: Number(m[1]), total: Number(m[2]) } : null;
}

/**
 * Pantalla de carga con la marca Lámina (V3 §5.6): la lámina se va dibujando, las etapas se marcan en vivo, el progreso es real
 * («N de M») y rotan consejos pedagógicos. Con reduced motion queda estática.
 */
export function LaminaLoader({ stage, label, progress, elapsed }: { stage: string; label: string; progress?: string | null; elapsed: number }) {
  const [tip, setTip] = useState(0);
  useEffect(() => { const t = setInterval(() => setTip((x) => (x + 1) % TIPS.length), 9000); return () => clearInterval(t); }, []);
  const steps = STEPS[stage] ?? [];
  const at = STEP_AT[stage] ?? [];
  const current = Math.max(0, at.filter((s) => elapsed >= s).length - 1);
  const pr = parseProgress(progress);
  const pct = pr && pr.total > 0 ? Math.round((pr.done / pr.total) * 100) : null;
  return (
    <div className="lm-loader" role="status" aria-live="polite">
      <svg className="lm-loader-mark" viewBox="0 0 120 90" aria-hidden="true">
        <rect className="lm-loader-sheet lm-loader-s1" x="14" y="14" width="92" height="62" rx="6" />
        <rect className="lm-loader-sheet lm-loader-s2" x="8" y="8" width="92" height="62" rx="6" />
        <g className="lm-loader-lines"><path d="M22 24h44" /><path d="M22 36h60" /><path d="M22 48h52" /><path d="M22 60h30" /></g>
        <path className="lm-loader-curve" d="M62 62q10-30 22-8t14-26" />
      </svg>
      <div>
        <p className="lm-loader-title">{label}… <span>{Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, "0")}</span></p>
        {steps.length > 0 && (
          <ol className="lm-loader-steps">
            {steps.map((s, i) => <li key={s} data-state={i < current ? "done" : i === current ? "now" : "next"}><span aria-hidden="true">{i < current ? "✓" : i === current ? "●" : "○"}</span> {s}</li>)}
          </ol>
        )}
        {pr && (
          <div className="lm-loader-bar" role="progressbar" aria-valuemin={0} aria-valuemax={pr.total} aria-valuenow={pr.done} aria-label="Diapositivas listas">
            <i style={{ width: `${pct}%` }} />
            <span>{pr.done} de {pr.total} diapositivas listas</span>
          </div>
        )}
        <p className="lm-loader-tip" key={tip}><strong>Consejo.</strong> {TIPS[tip]}</p>
      </div>
    </div>
  );
}
