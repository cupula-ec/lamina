"use server";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { LaminaError } from "@lamina/contracts";
import { buildBranding, hashJson, schema, workflow as wf } from "@lamina/db";
import { enqueue } from "@lamina/jobs";
import { getBoss } from "@/lib/boss";
import { getDb } from "@/lib/db";
import { act, requireOwner } from "@/lib/guard";
import { loadDeck } from "@/lib/presentation-view";
import { MetaFields } from "@/lib/branding-schemas";

/**
 * Edición posterior de Materia, Período y Grupo. No regenera contenido ni diseño: actualiza la presentación y, si ya hay un
 * diseño editable, crea una versión nueva (autor docente) con la marca/datos refrescados y re-renderiza solo la carátula.
 */
export async function updatePresentationMetaAction(input: { id: string; subject?: string; period?: string; group?: string }) {
  return act(async (u) => {
    const id = z.string().uuid().parse(input.id);
    const p = await requireOwner(id, u.id);
    const f = MetaFields.safeParse(input);
    if (!f.success) throw new LaminaError("invalid_input", f.error.issues[0]!.message, 400);
    const db = getDb();
    await db.update(schema.presentations).set({ subject: f.data.subject, period: f.data.period, groupName: f.data.group, updatedAt: new Date() }).where(eq(schema.presentations.id, id));

    const headId = wf.EDITABLE_STAGES.includes(p.stage as never) ? wf.headDeckVersionId(p) : null;
    const base = headId ? await loadDeck(headId) : null;
    if (headId && base) {
      const branding = await buildBranding(db, { ownerId: p.ownerId, subject: f.data.subject, period: f.data.period, groupName: f.data.group });
      if (hashJson(base.deck.meta.branding ?? null) !== hashJson(branding)) {
        const deck = { ...base.deck, meta: { ...base.deck.meta, branding } };
        const row = await wf.saveEditedDeck(db, id, u.id, { baseVersionId: headId, deck, sha256: hashJson(deck), note: "Datos de la carátula actualizados" });
        const cover = deck.slides[0]!.id;
        const arts = await db.select().from(schema.renderArtifacts).where(eq(schema.renderArtifacts.deckVersionId, headId));
        const keep = arts.filter((a) => a.slideId !== cover);
        if (keep.length) await db.insert(schema.renderArtifacts).values(keep.map((a) => ({ presentationId: id, deckVersionId: row.id, slideId: a.slideId, path: a.path, issues: a.issues }))).onConflictDoNothing();
        await enqueue(await getBoss(), "render", { presentationId: id, deckVersionId: row.id }, { base: row.id }).catch(() => {});
      }
    }
    revalidatePath(`/presentations/${id}`, "layout");
    revalidatePath("/dashboard");
  });
}
