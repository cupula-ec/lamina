"use server";
import { revalidatePath } from "next/cache";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { ACCENT_IDS, DeckDocument, LaminaError, THEME_IDS, formatStylePref } from "@lamina/contracts";
import { hashJson, schema, workflow as wf } from "@lamina/db";
import { enqueue } from "@lamina/jobs";
import { getBoss } from "@/lib/boss";
import { getDb } from "@/lib/db";
import { act, requireOwner } from "@/lib/guard";

const Id = z.string().uuid();
const Style = z.object({ themeId: z.enum(THEME_IDS), accent: z.enum(ACCENT_IDS) });
const touch = (id: string) => { revalidatePath(`/presentations/${id}`, "layout"); revalidatePath("/dashboard"); };

/** Estilo elegido por el docente antes de diseñar: el worker lo respeta y no consulta a la IA. */
export async function setPresentationStyleAction(input: { id: string; themeId: string; accent: string }) {
  return act(async (u) => {
    const id = Id.parse(input.id);
    const p = await requireOwner(id, u.id);
    const s = Style.safeParse(input);
    if (!s.success) throw new LaminaError("invalid_input", "Estilo no válido", 400);
    if (!["draft", "content_review", "content_approved", "failed_recoverable", "quota_wait"].includes(p.stage)) throw new LaminaError("invalid_transition", "El estilo se elige antes de generar el diseño; después cámbialo desde la revisión del diseño.", 409);
    await getDb().update(schema.presentations).set({ themeId: formatStylePref(s.data), updatedAt: new Date() }).where(eq(schema.presentations.id, id));
    touch(id);
  });
}

/**
 * Cambio de estilo sobre un diseño ya generado: NO regenera contenido ni diapositivas. Crea una versión `style`
 * (autor docente, con hash) descendiente de la cabecera, igual que la edición posterior (ADR-010), y re-renderiza todas las capturas.
 */
export async function changeDeckStyleAction(input: { id: string; baseVersionId: string; themeId: string; accent: string }) {
  return act(async (u) => {
    const id = Id.parse(input.id);
    await requireOwner(id, u.id);
    const baseId = Id.parse(input.baseVersionId);
    const s = Style.safeParse(input);
    if (!s.success) throw new LaminaError("invalid_input", "Estilo no válido", 400);
    const db = getDb();
    const row = await db.transaction(async (tx) => {
      const [p] = await tx.select().from(schema.presentations).where(and(eq(schema.presentations.id, id), eq(schema.presentations.ownerId, u.id))).for("update");
      if (!p) throw new LaminaError("not_found", "Presentación no encontrada", 404);
      if (!wf.EDITABLE_STAGES.includes(p.stage as never)) throw new LaminaError("invalid_transition", "Ahora no se puede cambiar el estilo (espera a que termine el proceso o reabre el diseño).", 409);
      if (wf.headDeckVersionId(p) !== baseId) throw new LaminaError("stale_version", "La presentación cambió mientras elegías. Recarga para ver la última versión.", 409);
      const [base] = await tx.select().from(schema.deckVersions).where(eq(schema.deckVersions.id, baseId));
      if (!base) throw new LaminaError("not_found", "Versión no encontrada", 404);
      const prev = DeckDocument.parse(base.deck);
      if (prev.themeId === s.data.themeId && (prev.accent ?? "a") === s.data.accent) throw new LaminaError("invalid_input", "Ese estilo ya está aplicado", 400);
      const deck = DeckDocument.parse({ ...prev, themeId: s.data.themeId, accent: s.data.accent });
      const [{ n } = { n: 0 }] = await tx.select({ n: sql<number>`coalesce(max(${schema.deckVersions.n}),0)::int` }).from(schema.deckVersions).where(eq(schema.deckVersions.presentationId, id));
      const [v] = await tx.insert(schema.deckVersions).values({
        presentationId: id, n: n + 1, deck, sha256: hashJson(deck), contentVersionId: base.contentVersionId, authorKind: "docente", parentId: base.id,
        kind: "style", note: `Estilo cambiado a ${s.data.themeId} (acento ${s.data.accent})`, componentPins: base.componentPins,
      }).returning();
      await tx.update(schema.presentations).set({ ...(p.stage === "design_review" ? { currentDeckVersionId: v!.id } : { finalDeckVersionId: v!.id }), themeId: formatStylePref(s.data), updatedAt: new Date() }).where(eq(schema.presentations.id, id));
      await tx.insert(schema.events).values({ name: "style_changed", userId: u.id, presentationId: id, data: { versionId: v!.id, themeId: s.data.themeId, accent: s.data.accent } });
      return v!;
    });
    await enqueue(await getBoss(), "render", { presentationId: id, deckVersionId: row.id }, { base: row.id }).catch(() => {});
    touch(id);
    return { versionId: row.id };
  });
}
