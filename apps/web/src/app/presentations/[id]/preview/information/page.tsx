import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { JobWatcher } from "@/components/JobWatcher";
import { ProgressHeader } from "@/components/ProgressHeader";
import { Callout } from "@/components/ui/Callout";
import { buildBranding } from "@lamina/db";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { requireOwner } from "@/lib/guard";
import { contentVersions, loadContent, sourcesFor } from "@/lib/presentation-view";
import { isStyleProposal, parseStylePref, proposeStyle, type Stage } from "@lamina/contracts";
import { ContentEditor } from "./editor";
import { StartDesign } from "./start-design";
import { StyleProposal } from "./style-proposal";

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
  const savedStyle = parseStylePref(p.themeId);
  const chosenStyle = isStyleProposal(p.themeId) ? null : savedStyle; // la propuesta de la IA no se presenta como elección
  const showStyle = !!cur && ["content_review", "content_approved"].includes(stage);
  const branding = showStyle ? await buildBranding(getDb(), p).catch(() => null) : null;
  const showEditor = !!cur && ["content_review", "content_approved"].includes(stage) || (!!cur && (stage === "quota_wait" || stage === "failed_recoverable"));

  return (
    <AppShell user={user} wide>
      <ProgressHeader p={p} stage={stage} lead={`${p.level} · ${p.objective}`} />
      <div className="space-y-6">
        {(stage === "researching" || stage === "quota_wait" || stage === "failed_recoverable") && (
          <JobWatcher id={p.id} initial={{ stage: p.stage, prevStage: p.prevStage, lastError: p.lastError, resumeAt: p.resumeAt?.toISOString() ?? null }} />
        )}
        {stage === "draft" && p.origin === "mcp" && <Callout tone="info" title="Creada desde tu IA conectada">Está esperando que la IA envíe el contenido; cuando lo haga aparecerá aquí para que lo revises y apruebes.</Callout>}
        {stage === "draft" && p.origin !== "mcp" && <Callout tone="warn" title="La presentación no ha arrancado">Si esta pantalla no avanza en un minuto, <Link href="/presentations/new" className="font-bold underline">vuelve a crearla</Link>.</Callout>}

        {showStyle && cur && (
          <StyleProposal
            presentationId={p.id}
            initial={savedStyle ?? proposeStyle({ subject: p.subject ?? undefined, topic: cur.draft.meta.topic, level: cur.draft.meta.level, objective: cur.draft.meta.objective })}
            chosen={!!chosenStyle}
            topic={cur.draft.meta.topic}
            branding={branding}
            readOnly={stage !== "content_review" && stage !== "content_approved"}
          />
        )}

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
          <Callout tone="ok" title="El contenido está aprobado"><Link className="btn btn-primary mt-2" href={`/presentations/${p.id}/preview/design`}>Ir al diseño</Link></Callout>
        )}
      </div>
    </AppShell>
  );
}
