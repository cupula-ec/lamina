import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { JobWatcher } from "@/components/JobWatcher";
import { StageBar, StageTag } from "@/components/StageBar";
import { requireUser } from "@/lib/session";
import { requireOwner } from "@/lib/guard";
import { contentVersions, loadContent, sourcesFor } from "@/lib/presentation-view";
import { STAGE_LABEL, stageTone } from "@/lib/stages";
import type { Stage } from "@lamina/contracts";
import { ContentEditor } from "./editor";
import { StartDesign } from "./start-design";

export const metadata = { title: "Revisar contenido" };
export const dynamic = "force-dynamic";

export default async function InformationPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const p = await requireOwner(id, user.id).catch(() => null);
  if (!p) notFound();
  const stage = p.stage as Stage;
  const cur = await loadContent(p.currentContentVersionId);
  const versions = await contentVersions(p.id);
  const { sources, chunks } = await sourcesFor(p.id);
  const showEditor = !!cur && ["content_review", "content_approved"].includes(stage) || (!!cur && (stage === "quota_wait" || stage === "failed_recoverable"));

  return (
    <AppShell user={user} wide>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/dashboard" className="text-sm font-bold underline underline-offset-4">← Mis presentaciones</Link>
          <h1 className="mt-2 text-3xl font-bold">{p.title}</h1>
          <p className="text-ink-2">{p.level} · {p.objective}</p>
        </div>
        <div className="space-y-2 text-right">
          <StageBar stage={stage} prevStage={p.prevStage} />
          <StageTag label={STAGE_LABEL[stage]} tone={stageTone(stage)} />
        </div>
      </div>

      <div className="mt-6 space-y-6">
        {(stage === "researching" || stage === "quota_wait" || stage === "failed_recoverable") && (
          <JobWatcher id={p.id} initial={{ stage: p.stage, prevStage: p.prevStage, lastError: p.lastError, resumeAt: p.resumeAt?.toISOString() ?? null }} />
        )}
        {stage === "draft" && <p className="sheet p-5">La presentación está lista para empezar. Si esta pantalla no avanza, vuelve a <Link href="/presentations/new" className="underline">crearla</Link>.</p>}

        {showEditor && cur && (
          <ContentEditor
            presentationId={p.id}
            stage={stage}
            versionId={cur.row.id}
            sha256={cur.row.sha256}
            versionN={cur.row.n}
            initial={cur.draft}
            versions={versions.map((v) => ({ ...v, createdAt: v.createdAt.toISOString() }))}
            sources={sources.map((s) => ({ id: s.id, kind: s.kind, origin: s.origin, title: s.title, url: s.url, status: s.status, error: s.error }))}
            chunks={chunks.map((c) => ({ id: c.id, sourceId: c.sourceId, text: c.text.slice(0, 600), page: c.page }))}
            readOnly={stage !== "content_review"}
          />
        )}
        {stage === "content_approved" && <StartDesign id={p.id} />}
        {["designing", "design_review", "design_approved", "polishing", "final_review", "published", "private_final"].includes(stage) && (
          <p className="sheet p-5">El contenido está aprobado. <Link className="btn btn-primary ml-3" href={`/presentations/${p.id}/preview/design`}>Ir al diseño</Link></p>
        )}
      </div>
    </AppShell>
  );
}
