"use server";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { ACCENT_IDS, LaminaError, THEME_IDS, formatStylePref } from "@lamina/contracts";
import { schema, workflow as wf } from "@lamina/db";
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
    const row = await wf.styleChanged(getDb(), id, u.id, { baseVersionId: baseId, themeId: s.data.themeId, accent: s.data.accent });
    await enqueue(await getBoss(), "render", { presentationId: id, deckVersionId: row.id }, { base: row.id }).catch(() => {});
    touch(id);
    return { versionId: row.id };
  });
}
