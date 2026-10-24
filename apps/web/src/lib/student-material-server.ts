import { eq, inArray } from "drizzle-orm";
import { ContentDraft } from "@lamina/contracts";
import { schema } from "@lamina/db";
import { getDb } from "./db";
import { buildStudentMaterial } from "./student-material";

/** Material del alumno de una presentación (contenido aprobado) con los créditos de las imágenes usadas en el diseño dado. */
export async function loadMaterial(p: { id: string; approvedContentVersionId: string | null }, deckVersionId: string | null) {
  if (!p.approvedContentVersionId) return null;
  const db = getDb();
  const [cv] = await db.select().from(schema.contentVersions).where(eq(schema.contentVersions.id, p.approvedContentVersionId));
  if (!cv) return null;
  const content = ContentDraft.parse(cv.content);
  const ids = new Set<string>();
  if (deckVersionId) {
    const [dv] = await db.select({ deck: schema.deckVersions.deck }).from(schema.deckVersions).where(eq(schema.deckVersions.id, deckVersionId));
    for (const s of (dv?.deck as { slides?: { slots?: Record<string, { componentId?: string; props?: { assetId?: string } }> }[] } | undefined)?.slides ?? [])
      for (const r of Object.values(s.slots ?? {})) if ((r.componentId === "Image" || r.componentId === "LabeledDiagram") && r.props?.assetId) ids.add(r.props.assetId);
  }
  const assets = ids.size ? await db.select().from(schema.assets).where(inArray(schema.assets.id, [...ids])) : [];
  const credits = assets.filter((a) => a.provider && a.provider !== "upload").map((a) => [a.alt, [a.author ?? "Autor no indicado", a.license ?? "licencia no indicada", a.provider].join(" · "), a.pageUrl].filter(Boolean).join(" — "));
  return { material: buildStudentMaterial(content, { credits }), updatedAt: cv.createdAt };
}
