import Link from "next/link";
import { notFound } from "next/navigation";
import { flagEnabled, workflow as wf } from "@lamina/db";
import type { Stage } from "@lamina/contracts";
import { AppShell } from "@/components/AppShell";
import { requireOwner } from "@/lib/guard";
import { loadDeck, provisionalForDeck } from "@/lib/presentation-view";
import { requireUser } from "@/lib/session";
import { STAGE_LABEL } from "@/lib/stages";
import { getDb } from "@/lib/db";
import { SlideEditor } from "./editor";
import { SlideEditorV3 } from "./editor-v3";

export const metadata = { title: "Editar diapositiva" };
export const dynamic = "force-dynamic";

export default async function EditSlidePage({ params }: { params: Promise<{ id: string; slideId: string }> }) {
  const user = await requireUser();
  const { id, slideId: raw } = await params;
  const slideId = decodeURIComponent(raw);
  const p = await requireOwner(id, user.id).catch(() => null);
  if (!p) notFound();
  const stage = p.stage as Stage;
  const back = `/presentations/${p.id}/preview/design`;
  if (!wf.EDITABLE_STAGES.includes(stage)) {
    return (
      <AppShell user={user}>
        <p className="sheet p-5">Ahora no se puede editar esta presentación (etapa: {STAGE_LABEL[stage]}). <Link className="underline" href={back}>Volver</Link></p>
      </AppShell>
    );
  }
  const ctx = { userId: user.id, presentationId: p.id };
  const [v3, chatOn, imagesOn] = await Promise.all([flagEnabled(getDb(), "v3_editor", ctx), flagEnabled(getDb(), "v3_harness_chat", ctx), flagEnabled(getDb(), "v3_images", ctx)]);
  const headId = wf.headDeckVersionId(p);
  const dv = await loadDeck(headId ?? null);
  const index = dv ? dv.deck.slides.findIndex((s) => s.id === slideId) : -1;
  if (!dv || index < 0) notFound();
  const prov = await provisionalForDeck(p.id, dv.row.componentPins);
  return (
    <AppShell user={user} wide>
      <Link href={back} className="text-sm font-bold underline underline-offset-4">← Volver a la presentación</Link>
      <h1 className="mt-2 text-3xl font-bold">Editar diapositiva {index + 1} de {dv.deck.slides.length}</h1>
      <p className="text-ink-2">{p.title}{stage === "published" ? " · Publicada: los cambios se publican cuando tú lo decidas." : ""}</p>
      <div className="mt-6">
        {v3 ? <SlideEditorV3 presentationId={p.id} baseVersionId={dv.row.id} deck={dv.deck} slideIndex={index} prov={prov} stage={stage} backHref={back} chatOn={chatOn} imagesOn={imagesOn} />
          : <SlideEditor presentationId={p.id} baseVersionId={dv.row.id} deck={dv.deck} slideIndex={index} prov={prov} stage={stage} backHref={back} />}
      </div>
    </AppShell>
  );
}
