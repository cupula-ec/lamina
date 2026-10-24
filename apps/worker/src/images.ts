import { and, eq } from "drizzle-orm";
import type { ImageBlockInfo } from "@lamina/components";
import { schema, tryConsumeQuota } from "@lamina/db";
import { fetchAndIngestImage, pickBestImage, searchImages, writeAssetFile, type ImageResult } from "@lamina/research";
import type { Ctx } from "./ctx";

/** Resultado de resolver un `imageRequest`: el asset ya guardado localmente (nunca una URL externa). */
export type ResolvedImage = ImageBlockInfo;

const creditOf = (r: Pick<ImageResult, "author" | "license" | "provider">) => [r.author ?? "Autor no indicado", r.license ?? "licencia no indicada", r.provider].join(" · ").slice(0, 200);

/**
 * Busca, descarga con safeFetch, re-codifica y guarda una imagen para un `imageRequest`. Devuelve null si no hay proveedores,
 * se agotó la cuota o ningún candidato pasó la ingesta: la diapositiva se diseña sin imagen y no falla.
 */
export async function resolveImage(ctx: Ctx, p: { id: string; ownerId: string }, req: { id: string; query: string; alt: string }): Promise<ResolvedImage | null> {
  if (!ctx.images?.length) return null;
  if (!(await tryConsumeQuota(ctx.db, p.ownerId, "image"))) return null;
  let results: ImageResult[];
  try { results = (await searchImages(ctx.images, req.query, { max: 12 })).results; } catch (e) { ctx.log(`images: búsqueda fallida (${(e as Error).message})`); return null; }
  const tried = new Set<string>();
  for (let n = 0; n < 3; n++) {
    const pick = pickBestImage(results.filter((r) => !tried.has(r.id)));
    if (!pick) break;
    tried.add(pick.id);
    try {
      const img = await fetchAndIngestImage(pick.url);
      await writeAssetFile(ctx.env.DATA_DIR, img);
      const [dup] = await ctx.db.select().from(schema.assets).where(and(eq(schema.assets.presentationId, p.id), eq(schema.assets.sha256, img.sha256))).limit(1);
      const row = dup ?? (await ctx.db.insert(schema.assets).values({
        ownerId: p.ownerId, presentationId: p.id, sha256: img.sha256, mime: img.mime, width: img.width, height: img.height, bytes: img.data.length, origin: "search",
        provider: pick.provider, pageUrl: pick.pageUrl.slice(0, 500), author: pick.author?.slice(0, 200), license: pick.license?.slice(0, 120), licenseUrl: pick.licenseUrl?.slice(0, 300), alt: req.alt.slice(0, 300),
      }).returning())[0]!;
      return { assetId: row.id, alt: req.alt, credit: creditOf(pick) };
    } catch (e) { ctx.log(`images: descartada ${pick.provider} (${(e as Error).message})`); }
  }
  return null;
}
