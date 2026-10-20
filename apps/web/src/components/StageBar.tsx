import { phaseOf } from "@/lib/stages";

const STEPS = ["Contenido", "Diseño", "Publicación"];

export function StageBar({ stage, prevStage }: { stage: string; prevStage?: string | null }) {
  const phase = phaseOf(stage, prevStage);
  const done = stage === "published" || stage === "private_final";
  return (
    <ol className="flex flex-wrap items-center gap-x-2 gap-y-1" aria-label="Etapas de la presentación">
      {STEPS.map((s, i) => {
        const state = done || i < phase ? "done" : i === phase ? "current" : "todo";
        return (
          <li key={s} className="flex items-center gap-2" aria-current={state === "current" ? "step" : undefined}>
            <span className={`inline-flex h-7 w-7 items-center justify-center rounded-full border-2 border-ink text-sm font-bold ${state === "done" ? "bg-ink text-paper" : state === "current" ? "bg-mark" : "bg-paper"}`}>{state === "done" ? "✓" : i + 1}</span>
            <span className={`font-bold ${state === "todo" ? "text-ink-2" : ""}`}>{s}</span>
            {i < STEPS.length - 1 && <span aria-hidden className="mx-1 h-0.5 w-8 bg-ink/40" />}
          </li>
        );
      })}
    </ol>
  );
}

export function StageTag({ label, tone }: { label: string; tone: "ok" | "warn" | "bad" | "info" | "mute" }) {
  return <span className={`tag tag-${tone}`}>{label}</span>;
}
