import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { LaminaError } from "@lamina/contracts";
import { NATIVE_CATALOG, deckValidatorFor, jsonSchemaToZod } from "@lamina/components";
import { flagEnabled, schema, tryConsumeQuota, workspace } from "@lamina/db";
import { defaultImageProviders, fetchAndIngestImage, ingestImage, searchImages, writeAssetFile, type IngestedImage } from "@lamina/research";
import { getDb } from "@/lib/db";
import { env } from "@/lib/env";
import { requireOwner } from "@/lib/guard";
import { requireUserApi } from "@/lib/session";
import { provisionalFor } from "@/lib/presentation-view";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const fail = (e: unknown) => {
  if (e instanceof LaminaError) return NextResponse.json({ error: e.message, code: e.code }, { status: e.status });
  console.error("[images]", e);
  return NextResponse.json({ error: "No se pudo procesar la imagen." }, { status: 500 });
};

async function gate(id: string) {
  const u = await requireUserApi();
  const p = await requireOwner(id, u.id);
  if (!(await flagEnabled(getDb(), "v3_images", { userId: u.id, presentationId: p.id }))) throw new LaminaError("forbidden", "Las imágenes todavía no están habilitadas para tu cuenta.", 403);
  return { u, p };
}

/** Busca imágenes alternativas (bancos libres y web); cada búsqueda consume cuota de imágenes. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { u } = await gate((await params).id);
    const q = (new URL(req.url).searchParams.get("q") ?? "").trim().slice(0, 200);
    if (q.length < 2) throw new LaminaError("invalid_input", "Escribe qué imagen buscas.", 400);
    if (!(await tryConsumeQuota(getDb(), u.id, "image"))) throw new LaminaError("quota_exceeded", "Alcanzaste el límite diario de búsquedas de imágenes.", 429);
    const e = env();
    const { results } = await searchImages(defaultImageProviders({ searxngUrl: e.SEARXNG_URL, unsplashKey: e.UNSPLASH_ACCESS_KEY, pexelsKey: e.PEXELS_API_KEY }), q, { max: 12 });
    return NextResponse.json({ results }, { headers: { "cache-control": "no-store" } });
  } catch (e) { return fail(e); }
}

const UseBody = z.object({
  slideId: z.string().min(1).max(64), slot: z.string().min(1).max(40), alt: z.string().min(1).max(300),
  url: z.string().url().max(2000),
  meta: z.object({ provider: z.string().max(40).optional(), pageUrl: z.string().max(500).optional(), author: z.string().max(200).optional(), license: z.string().max(120).optional(), licenseUrl: z.string().max(300).optional() }).default({}),
});
const RemoveBody = z.object({ slideId: z.string().min(1).max(64), slot: z.string().min(1).max(40) });

async function saveAsset(p: { id: string; ownerId: string }, img: IngestedImage, origin: "upload" | "search", alt: string, meta: z.infer<typeof UseBody>["meta"] = {}) {
  await writeAssetFile(env().DATA_DIR, img);
  const db = getDb();
  const [dup] = await db.select().from(schema.assets).where(and(eq(schema.assets.presentationId, p.id), eq(schema.assets.sha256, img.sha256))).limit(1);
  if (dup) return dup;
  const [row] = await db.insert(schema.assets).values({
    ownerId: p.ownerId, presentationId: p.id, sha256: img.sha256, mime: img.mime, width: img.width, height: img.height, bytes: img.data.length, origin,
    provider: meta.provider, pageUrl: meta.pageUrl, author: meta.author, license: meta.license, licenseUrl: meta.licenseUrl, alt,
  }).returning();
  return row!;
}

/** El diseño solo se toca en las etapas editables y sin cambios pendientes de otros (no se confirma trabajo ajeno ni se deja un lote a medias). */
async function editableWorkspace(p: { id: string; ownerId: string; stage: string }) {
  if (!["design_review", "final_review", "private_final", "published"].includes(p.stage)) throw new LaminaError("invalid_transition", "Ahora no se puede editar el diseño.", 409);
  const w = await workspace.getWorkspace(getDb(), p.id, p.ownerId);
  if (w.dirty) throw new LaminaError("invalid_transition", "Hay cambios sin confirmar en esta presentación (por ejemplo de tu IA conectada). Confírmalos o descártalos antes de cambiar la imagen.", 409);
}

/** Aplica un cambio y lo confirma como versión; si la confirmación falla, el lote se deshace (todo o nada). */
async function applyAndCommit(p: { id: string; ownerId: string }, ops: unknown[], label: string) {
  const db = getDb();
  const r = await workspace.applyOps(db, p.id, ops, "docente", { ownerId: p.ownerId, validateDeck: await validatorFor(p.id), label });
  if (!r.ok) throw new LaminaError("invalid_input", r.issues.map((i) => i.message).join("; ") || "No se pudo aplicar el cambio.", 409);
  try { await workspace.commitCheckpoint(db, p.id, p.ownerId, "docente", label); }
  catch (e) { await workspace.undoBatch(db, p.id, r.batchId!, "sistema", { ownerId: p.ownerId, force: true }).catch(() => {}); throw e; }
}

/** Pone la imagen en el slot (como Image) y confirma el cambio como versión nueva del diseño. */
async function placeImage(p: { id: string; ownerId: string }, slideId: string, slot: string, assetId: string, alt: string, credit: string | undefined) {
  const image = NATIVE_CATALOG.find((c) => c.def.id === "Image")!;
  const ref = { componentId: "Image", version: image.def.version, props: { assetId, alt, fit: "cover", showCredit: false, ...(credit ? { credit } : {}) } };
  await applyAndCommit(p, [{ op: "set_slot", slideId, slot, ref }], "Imagen reemplazada");
}

/** Validador con los componentes provisionales de la presentación (una diapositiva que ya tiene uno no debe fallar al poner o quitar una imagen). */
async function validatorFor(presentationId: string) {
  const prov = await provisionalFor(presentationId);
  const map = new Map(prov.map((c) => { let propsSchema; try { propsSchema = jsonSchemaToZod(c.propsJsonSchema); } catch { propsSchema = undefined; } return [`${c.id}@${c.version}`, { propsSchema, status: "provisional" }] as const; }));
  return deckValidatorFor((ref) => map.get(`${ref.componentId}@${ref.version}`));
}

const creditOf = (m: z.infer<typeof UseBody>["meta"]) => [m.author ?? "Autor no indicado", m.license ?? "licencia no indicada", m.provider].filter(Boolean).join(" · ").slice(0, 200);

/**
 * Pone una imagen en una diapositiva:
 *  - JSON `{ slideId, slot, alt, url, meta }`: descarga la elegida de la búsqueda (pasa por safeFetch y la ingesta);
 *  - multipart `file` + `slideId`, `slot`, `alt`: sube la propia (máx. 8 MB, se re-codifica).
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { u, p } = await gate((await params).id);
    await editableWorkspace(p);
    if (!(await tryConsumeQuota(getDb(), u.id, "image"))) throw new LaminaError("quota_exceeded", "Alcanzaste el límite diario de imágenes.", 429);
    if (Number(req.headers.get("content-length") ?? 0) > 9 * 1024 * 1024) throw new LaminaError("invalid_input", "La imagen supera 8 MB.", 413);
    const ct = req.headers.get("content-type") ?? "";
    if (ct.startsWith("multipart/form-data")) {
      const fd = await req.formData();
      const file = fd.get("file");
      const body = RemoveBody.extend({ alt: z.string().min(1).max(300) }).safeParse({ slideId: fd.get("slideId"), slot: fd.get("slot"), alt: fd.get("alt") });
      if (!(file instanceof File) || !body.success) throw new LaminaError("invalid_input", "Falta el archivo, la diapositiva o el texto alternativo.", 400);
      if (file.size > 8 * 1024 * 1024) throw new LaminaError("invalid_input", "La imagen supera 8 MB.", 413);
      const asset = await saveAsset(p, await ingestImage(Buffer.from(await file.arrayBuffer())), "upload", body.data.alt);
      await placeImage(p, body.data.slideId, body.data.slot, asset.id, body.data.alt, undefined);
      return NextResponse.json({ assetId: asset.id });
    }
    const body = UseBody.safeParse(await req.json().catch(() => null));
    if (!body.success) throw new LaminaError("invalid_input", "Datos de imagen no válidos.", 400);
    const asset = await saveAsset(p, await fetchAndIngestImage(body.data.url), "search", body.data.alt, body.data.meta);
    await placeImage(p, body.data.slideId, body.data.slot, asset.id, body.data.alt, creditOf(body.data.meta));
    return NextResponse.json({ assetId: asset.id });
  } catch (e) { return fail(e); }
}

/** Quita la imagen de una diapositiva (si el layout exige ese slot, devuelve el motivo y no cambia nada). */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { p } = await gate((await params).id);
    const body = RemoveBody.safeParse(await req.json().catch(() => null));
    if (!body.success) throw new LaminaError("invalid_input", "Datos no válidos.", 400);
    await editableWorkspace(p);
    await applyAndCommit(p, [{ op: "remove_slot", slideId: body.data.slideId, slot: body.data.slot }], "Imagen quitada");
    return NextResponse.json({ ok: true });
  } catch (e) { return fail(e); }
}
