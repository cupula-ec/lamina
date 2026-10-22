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
 * Edición posterior de Materia, Período y Grupo. No regenera contenido ni diseño. Si ya hay un diseño editable, la presentación y la
 * versión nueva (autor docente, marca/datos refrescados) se guardan en UNA transacción: si la versión está obsoleta no se aplica nada.
 * Se re-renderiza solo la portada, salvo que cambie la institución (nombre/sigla/logo/colores): entonces, todas las diapositivas.
 * En etapas no editables (generando/puliendo) solo se guardan los datos: la portada los tomará en la próxima versión editable.
 * Devuelve `coverUpdated` para que la UI no prometa lo que no ocurrió.
 */
export async function updatePresentationMetaAction(input: { id: string; subject?: string; period?: string; group?: string }) {
  return act(async (u): Promise<{ coverUpdated: boolean }> => {
    const id = z.string().uuid().parse(input.id);
    const p = await requireOwner(id, u.id);
    const f = MetaFields.safeParse(input);
    if (!f.success) throw new LaminaError("invalid_input", f.error.issues[0]!.message, 400);
    const db = getDb();
    const meta = { subject: f.data.subject, period: f.data.period, groupName: f.data.group };
    const touch = () => { revalidatePath(`/presentations/${id}`, "layout"); revalidatePath("/dashboard"); };

    const headId = wf.EDITABLE_STAGES.includes(p.stage as never) ? wf.headDeckVersionId(p) : null;
    const base = headId ? await loadDeck(headId) : null;
    if (!headId || !base) {
      await db.update(schema.presentations).set({ ...meta, updatedAt: new Date() }).where(eq(schema.presentations.id, id));
      touch();
      return { coverUpdated: false };
    }
    const branding = await buildBranding(db, { ownerId: p.ownerId, ...meta });
    if (hashJson(base.deck.meta.branding ?? null) === hashJson(branding)) {
      await db.update(schema.presentations).set({ ...meta, updatedAt: new Date() }).where(eq(schema.presentations.id, id));
      touch();
      return { coverUpdated: false };
    }
    const deck = { ...base.deck, meta: { ...base.deck.meta, branding } };
    const row = await wf.saveEditedDeck(db, id, u.id, { baseVersionId: headId, deck, sha256: hashJson(deck), note: "Datos de la carátula actualizados", meta });
    const institutionChanged = hashJson(base.deck.meta.branding?.institution ?? null) !== hashJson(branding.institution ?? null);
    if (!institutionChanged) {
      const cover = deck.slides[0]!.id;
      const arts = await db.select().from(schema.renderArtifacts).where(eq(schema.renderArtifacts.deckVersionId, headId));
      const keep = arts.filter((a) => a.slideId !== cover);
      if (keep.length) await db.insert(schema.renderArtifacts).values(keep.map((a) => ({ presentationId: id, deckVersionId: row.id, slideId: a.slideId, path: a.path, issues: a.issues }))).onConflictDoNothing();
    }
    await enqueue(await getBoss(), "render", { presentationId: id, deckVersionId: row.id }, { base: row.id }).catch(() => {});
    touch();
    return { coverUpdated: true };
  });
}
