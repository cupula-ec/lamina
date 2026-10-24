import { createHmac, timingSafeEqual } from "node:crypto";
import { inArray } from "drizzle-orm";
import type { DeckDocument } from "@lamina/contracts";
import { schema } from "@lamina/db";
import { getDb } from "./db";
import { env } from "./env";

/** Componentes que muestran una imagen guardada (props.assetId): todos reciben URL firmada al mostrarse fuera de la sesión del dueño. */
const ASSET_COMPONENTS = new Set(["Image", "LabeledDiagram"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isAssetId = (s: string) => UUID.test(s);

const sig = (id: string, exp: number) => createHmac("sha256", env().BETTER_AUTH_SECRET).update(`asset:${id}:${exp}`).digest("hex");

export function verifyAssetSig(id: string, exp: string | null, s: string | null): boolean {
  if (!exp || !s || !/^\d{1,12}$/.test(exp) || !/^[0-9a-f]{64}$/.test(s)) return false;
  if (Number(exp) * 1000 < Date.now()) return false;
  const want = Buffer.from(sig(id, Number(exp)));
  const got = Buffer.from(s);
  return want.length === got.length && timingSafeEqual(want, got);
}

export const assetHeaders = (cache: string): HeadersInit => ({
  "content-type": "image/webp",
  "x-content-type-options": "nosniff",
  "content-security-policy": "default-src 'none'; sandbox",
  "content-disposition": "inline",
  "cross-origin-resource-policy": "same-origin",
  "cache-control": cache,
});

/**
 * Resuelve las imágenes del deck para quien lo va a mostrar: cada componente Image recibe una URL firmada y con caducidad
 * (el visor ya fue autorizado por la página), SOLO si el asset pertenece al dueño de la presentación; si no, se quita la imagen.
 * No cambia el contenido guardado ni su hash.
 */
export async function withSignedAssets(deck: DeckDocument, ttlSeconds: number, ownerId: string): Promise<DeckDocument> {
  const ids = new Set<string>();
  for (const s of deck.slides) for (const r of Object.values(s.slots)) if (ASSET_COMPONENTS.has(r.componentId) && typeof (r.props as any).assetId === "string" && UUID.test((r.props as any).assetId)) ids.add((r.props as any).assetId.toLowerCase());
  if (!ids.size) return deck;
  const rows = await getDb().select({ id: schema.assets.id, ownerId: schema.assets.ownerId }).from(schema.assets).where(inArray(schema.assets.id, [...ids]));
  const ok = new Set(rows.filter((r) => r.ownerId === ownerId).map((r) => r.id));
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  return {
    ...deck,
    slides: deck.slides.map((s) => ({
      ...s,
      slots: Object.fromEntries(Object.entries(s.slots).map(([k, r]) => {
        if (!ASSET_COMPONENTS.has(r.componentId)) return [k, r];
        const id = String((r.props as any).assetId ?? "").toLowerCase();
        const { src: _drop, ...props } = r.props as Record<string, unknown>;
        return [k, { ...r, props: ok.has(id) ? { ...props, src: `/api/assets/${id}?exp=${exp}&sig=${sig(id, exp)}` } : { ...props, src: "/api/assets/00000000-0000-4000-8000-000000000000" } }];
      })),
    })),
  };
}
