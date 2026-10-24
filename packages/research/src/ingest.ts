import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { LaminaError } from "@lamina/contracts";
import { IMAGE_ALLOWED_TYPES, safeFetch, type SafeFetchOptions } from "./ssrf";

export const IMAGE_MAX_BYTES = 8 * 1024 * 1024;
export const IMAGE_MAX_INPUT_PIXELS = 40_000_000;
export const IMAGE_MAX_SIDE = 2400;
export const IMAGE_MIN_SIDE = 200;
const IMAGE_TIMEOUT_S = 15;

export type IngestedImage = { data: Buffer; width: number; height: number; sha256: string; mime: "image/webp" };

const bad = (msg: string, status = 422) => new LaminaError("extraction_failed", msg, status);

/**
 * Re-codifica SIEMPRE a webp (sin EXIF ni cola de bytes: elimina polyglots), con tope de píxeles de entrada, de lado de salida y de tiempo.
 * El tipo real lo decide sharp, nunca el Content-Type. SVG se rechaza (puede ser activo).
 */
export async function ingestImage(input: Buffer): Promise<IngestedImage> {
  if (!input.length) throw bad("La imagen está vacía.");
  if (input.length > IMAGE_MAX_BYTES) throw bad("La imagen supera el tamaño máximo.", 413);
  try {
    const opts = { limitInputPixels: IMAGE_MAX_INPUT_PIXELS, failOn: "error" as const, pages: 1 };
    const meta = await sharp(input, opts).metadata();
    if (!meta.format || !["jpeg", "png", "webp", "gif", "heif", "avif"].includes(meta.format)) throw bad("Formato de imagen no admitido.", 415);
    if (!meta.width || !meta.height) throw bad("No se pudo leer la imagen.");
    if (Math.min(meta.width, meta.height) < IMAGE_MIN_SIDE) throw bad("La imagen es demasiado pequeña.");
    const { data, info } = await sharp(input, opts).timeout({ seconds: IMAGE_TIMEOUT_S }).rotate().resize({ width: IMAGE_MAX_SIDE, height: IMAGE_MAX_SIDE, fit: "inside", withoutEnlargement: true }).webp({ quality: 82 }).toBuffer({ resolveWithObject: true });
    return { data, width: info.width, height: info.height, sha256: createHash("sha256").update(data).digest("hex"), mime: "image/webp" };
  } catch (e) {
    if (e instanceof LaminaError) throw e;
    throw bad("La imagen está dañada o no es válida.");
  }
}

/** Descarga con safeFetch (SSRF, redirecciones revalidadas, 8 MB) y la pasa por la ingesta. */
export async function fetchAndIngestImage(url: string, opts: Pick<SafeFetchOptions, "ipBlocked" | "timeoutMs" | "allowedPorts"> = {}): Promise<IngestedImage> {
  const doc = await safeFetch(url, { ...opts, maxBytes: IMAGE_MAX_BYTES, allowedTypes: IMAGE_ALLOWED_TYPES, accept: "image/webp,image/png,image/jpeg,image/*;q=0.5" });
  if (/svg/i.test(doc.contentType)) throw bad("Formato de imagen no admitido.", 415);
  return ingestImage(doc.body);
}

/** Ruta de un asset en disco: `<DATA_DIR>/assets/<sha256>.webp` (deduplicado por hash). */
export const assetPath = (dataDir: string, sha256: string) => {
  if (!/^[0-9a-f]{64}$/.test(sha256)) throw new Error("sha256 inválido");
  return path.join(dataDir, "assets", `${sha256}.webp`);
};

export async function writeAssetFile(dataDir: string, img: IngestedImage): Promise<string> {
  const file = assetPath(dataDir, img.sha256);
  await fs.mkdir(path.dirname(file), { recursive: true });
  try { await fs.access(file); } catch { await fs.writeFile(file, img.data, { flag: "wx" }).catch((e) => { if (e.code !== "EEXIST") throw e; }); }
  return file;
}
