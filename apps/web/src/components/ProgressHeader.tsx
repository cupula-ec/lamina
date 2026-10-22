import { MetaEditor } from "./MetaEditor";
import { StageBar, StageTag } from "./StageBar";
import { PageHeader } from "./ui/PageHeader";
import { STAGE_LABEL, stageTone } from "@/lib/stages";
import type { Stage } from "@lamina/contracts";

type P = { id: string; title: string; level: string; subject: string | null; period: string | null; groupName: string | null; prevStage: string | null };

/** Cabecera común de las pantallas de revisión: título, datos de carátula y etapa. */
export function ProgressHeader({ p, stage, lead }: { p: P; stage: Stage; lead: React.ReactNode }) {
  return (
    <PageHeader back={{ href: "/dashboard", label: "Mis presentaciones" }} title={p.title} lead={lead} actions={<StageTag label={STAGE_LABEL[stage]} tone={stageTone(stage)} />}>
      <div className="mt-4 flex flex-wrap items-start justify-between gap-x-8 gap-y-3 rounded-lg border-2 border-ink bg-white p-4">
        <StageBar stage={stage} prevStage={p.prevStage} />
        <MetaEditor presentationId={p.id} initial={{ subject: p.subject ?? "", period: p.period ?? "", group: p.groupName ?? "" }} />
      </div>
    </PageHeader>
  );
}
