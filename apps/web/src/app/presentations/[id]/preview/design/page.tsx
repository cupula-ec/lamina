import Link from "next/link";
import { notFound } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { schema } from "@lamina/db";
import type { Stage } from "@lamina/contracts";
import { AppShell } from "@/components/AppShell";
import { AutoRefresh } from "@/components/AutoRefresh";
import { JobWatcher } from "@/components/JobWatcher";
import { StageBar, StageTag } from "@/components/StageBar";
import { getDb } from "@/lib/db";
import { env } from "@/lib/env";
import { requireOwner } from "@/lib/guard";
import { artifactsFor, deckVersions, loadDeck, provisionalForDeck } from "@/lib/presentation-view";
import { requireUser } from "@/lib/session";
import { STAGE_LABEL, stageTone } from "@/lib/stages";
import { DesignReview } from "./review";

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
  const prov = await provisionalForDeck(p.id, cur?.row.componentPins ?? {});
  const reqs = await getDb().select().from(schema.componentRequests).where(eq(schema.componentRequests.presentationId, p.id)).orderBy(desc(schema.componentRequests.createdAt));
  const waitingRender = !!cur && arts.length < cur.deck.slides.length;
  const activeReq = reqs.some((r) => r.status === "pending" || r.status === "running");

  return (
    <AppShell user={user} wide>
      <AutoRefresh active={waitingRender || activeReq} />
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/dashboard" className="text-sm font-bold underline underline-offset-4">← Mis presentaciones</Link>
          <h1 className="mt-2 text-3xl font-bold">{p.title}</h1>
          <p className="text-ink-2"><Link href={`/presentations/${p.id}/preview/information`} className="underline underline-offset-4">Ver contenido</Link> · {p.level}</p>
        </div>
        <div className="space-y-2 text-right"><StageBar stage={stage} prevStage={p.prevStage} /><StageTag label={STAGE_LABEL[stage]} tone={stageTone(stage)} /></div>
      </div>
      <div className="mt-6 space-y-6">
        {(["designing", "polishing", "quota_wait", "failed_recoverable"] as string[]).includes(stage) && <JobWatcher id={p.id} initial={{ stage, lastError: p.lastError, resumeAt: p.resumeAt?.toISOString() ?? null }} />}
        {!cur && !["designing", "quota_wait", "failed_recoverable"].includes(stage) && (
          <p className="sheet p-5">Aún no hay diseño. Aprueba el contenido y genera el diseño desde <Link className="underline" href={`/presentations/${p.id}/preview/information`}>Contenido</Link>.</p>
        )}
        {cur && (
          <DesignReview
            presentationId={p.id}
            stage={stage}
            visibility={p.visibility}
            deckVersionId={cur.row.id}
            deckSha={cur.row.sha256}
            deck={cur.deck}
            isCurrent={cur.row.id === (["final_review", "published", "private_final"].includes(stage) ? p.finalDeckVersionId : stage === "polishing" ? p.approvedDeckVersionId : p.currentDeckVersionId)}
            issues={Object.fromEntries(arts.map((a) => [a.slideId, a.issues as { slot: string | null; kind: string; severity: string; message: string }[]]))}
            rendered={arts.filter((a) => a.path).map((a) => a.slideId)}
            waitingRender={waitingRender}
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
