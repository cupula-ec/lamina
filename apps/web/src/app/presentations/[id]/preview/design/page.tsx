import Link from "next/link";
import { notFound } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { schema, usageFor } from "@lamina/db";
import type { SlideIssue } from "@lamina/engine";
import type { Stage } from "@lamina/contracts";
import { AppShell } from "@/components/AppShell";
import { AutoRefresh } from "@/components/AutoRefresh";
import { JobWatcher } from "@/components/JobWatcher";
import { ProgressHeader } from "@/components/ProgressHeader";
import { Callout } from "@/components/ui/Callout";
import { getDb } from "@/lib/db";
import { env } from "@/lib/env";
import { requireOwner } from "@/lib/guard";
import { artifactsFor, deckVersions, loadDeck, polishReport, provisionalForDeck, repairReport } from "@/lib/presentation-view";
import { requireUser } from "@/lib/session";
import { DesignReview } from "./review";
import { StyleChange } from "./style-change";

export const metadata = { title: "Revisar diseño" };
export const dynamic = "force-dynamic";

export default async function DesignPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ v?: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const sp = await searchParams;
  const p = await requireOwner(id, user.id).catch(() => null);
  if (!p) notFound();
  const stage = p.stage as Stage;
  const versions = await deckVersions(p.id);

  const shownId = /^[0-9a-f-]{36}$/i.test(sp.v ?? "") && versions.some((v) => v.id === sp.v) ? sp.v! : (["polishing"].includes(stage) ? p.approvedDeckVersionId : ["final_review", "published", "private_final"].includes(stage) ? p.finalDeckVersionId : p.currentDeckVersionId) ?? p.currentDeckVersionId;
  const cur = await loadDeck(shownId ?? null);
  const arts = await artifactsFor(cur?.row.id ?? null);
  const report = cur ? await repairReport(cur.row.id, arts) : null;
  const polish = cur ? await polishReport(cur.row.id, arts) : null;
  const prov = await provisionalForDeck(p.id, cur?.row.componentPins ?? {});
  const reqs = await getDb().select().from(schema.componentRequests).where(eq(schema.componentRequests.presentationId, p.id)).orderBy(desc(schema.componentRequests.createdAt));
  const waitingRender = !!cur && arts.length < cur.deck.slides.length;
  const activeReq = reqs.some((r) => r.status === "pending" || r.status === "running");

  return (
    <AppShell user={user} wide>
      <AutoRefresh active={waitingRender || activeReq} />
      <ProgressHeader p={p} stage={stage} lead={<>{p.level} · <Link href={`/presentations/${p.id}/preview/information`} className="underline underline-offset-4">Ver contenido</Link></>} />
      <div className="space-y-6">
        {(["designing", "polishing", "quota_wait", "failed_recoverable"] as string[]).includes(stage) && <JobWatcher id={p.id} initial={{ stage, prevStage: p.prevStage, lastError: p.lastError, resumeAt: p.resumeAt?.toISOString() ?? null }} />}
        {!cur && !["designing", "quota_wait", "failed_recoverable"].includes(stage) && (
          <Callout tone="info" title="Aún no hay diseño">Aprueba el contenido y genera el diseño desde <Link className="font-bold underline" href={`/presentations/${p.id}/preview/information`}>Contenido</Link>.</Callout>
        )}
        {cur && ["design_review", "final_review", "private_final", "published"].includes(stage) && cur.row.id === (stage === "design_review" ? p.currentDeckVersionId : p.finalDeckVersionId) && (
          <StyleChange presentationId={p.id} baseVersionId={cur.row.id} current={{ themeId: cur.deck.themeId, accent: cur.deck.accent ?? "a" }} topic={cur.deck.meta.topic} branding={cur.deck.meta.branding ?? null} />
        )}
        {cur && (
          <DesignReview
            presentationId={p.id}
            stage={stage}
            visibility={p.visibility}
            hasUnpublishedChanges={stage === "published" && !!p.finalDeckVersionId && p.finalDeckVersionId !== p.publishedDeckVersionId}
            deckVersionId={cur.row.id}
            deckSha={cur.row.sha256}
            deck={cur.deck}
            isCurrent={cur.row.id === (["final_review", "published", "private_final"].includes(stage) ? p.finalDeckVersionId : stage === "polishing" ? p.approvedDeckVersionId : p.currentDeckVersionId)}
            issues={Object.fromEntries(arts.map((a) => [a.slideId, (a.issues as SlideIssue[]).map((i, index) => ({ ...i, index }))]))}
            rendered={arts.filter((a) => a.path).map((a) => a.slideId)}
            waitingRender={waitingRender}
            quota={await usageFor(getDb(), user.id)}
            repairReport={report}
            polishReport={polish}
            prov={prov}
            requests={reqs.map((r) => ({ id: r.id, name: r.suggestedName, purpose: r.purpose, status: r.status, error: r.error, slideId: r.slideId }))}
            versions={versions.map((v) => ({ ...v, createdAt: v.createdAt.toISOString() }))}
            appUrl={env().APP_URL}
            busy={["designing", "polishing", "quota_wait", "failed_recoverable"].includes(stage)}
          />
        )}
      </div>
    </AppShell>
  );
}
