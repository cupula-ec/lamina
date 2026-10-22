import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { LaminaError, type DeckDocument } from "@lamina/contracts";
import { env } from "./env";

const NAME = /^[A-Za-z0-9_-]{1,80}\.png$/;
const BUILTIN = /^builtin:([A-Za-z0-9_-]{1,40}\.png)$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (s: string) => UUID.test(s);
export const isUserId = (s: string) => /^[A-Za-z0-9_-]{1,64}$/.test(s);

export type LogoKind = "institution" | "personal";
const brandingDir = (kind: LogoKind) => path.join(path.resolve(env().DATA_DIR), "branding", kind);

/** Nombre de archivo único por subida: `<dueño>-<aleatorio>.png`. Cambia al reemplazar, lo que invalida cachés. */
export const newLogoName = (ownerId: string) => `${ownerId}-${randomBytes(4).toString("hex")}.png`;

export async function saveLogo(kind: LogoKind, name: string, png: Buffer) {
  if (!NAME.test(name)) throw new LaminaError("invalid_input", "Nombre de archivo no válido", 400);
  const dir = brandingDir(kind);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, name), png, { mode: 0o600 });
}

export async function removeLogo(kind: LogoKind, name: string | null | undefined) {
  if (!name || BUILTIN.test(name) || !NAME.test(name)) return;
  await fs.rm(path.join(brandingDir(kind), name), { force: true });
}

/** Lee un logo ya normalizado; null si no existe. Los recursos `builtin:` salen de `public/institutions` (empaquetados con la web). */
export async function readLogo(kind: LogoKind, stored: string | null | undefined): Promise<Buffer | null> {
  if (!stored) return null;
  const b = BUILTIN.exec(stored);
  try {
    if (b) {
      for (const root of [path.join(process.cwd(), "public", "institutions"), path.join(process.cwd(), "apps", "web", "public", "institutions")]) {
        try { return await fs.readFile(path.join(root, b[1]!)); } catch { /* siguiente raíz */ }
      }
      return null;
    }
    if (!NAME.test(stored)) return null;
    return await fs.readFile(path.join(brandingDir(kind), stored));
  } catch { return null; }
}

/** Cabeceras fijas para servir un logo: tipo fijo, sin sniffing, sin capacidad de ejecutar nada. */
export function logoHeaders(cache: string): HeadersInit {
  return {
    "content-type": "image/png",
    "x-content-type-options": "nosniff",
    "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
    "content-disposition": "inline",
    "cross-origin-resource-policy": "same-origin",
    "cache-control": cache,
  };
}

/* ───── URLs firmadas del logo personal (para visores sin sesión: enlace/público y renderer) ───── */
const sig = (userId: string, exp: number) => createHmac("sha256", env().BETTER_AUTH_SECRET).update(`logo:personal:${userId}:${exp}`).digest("hex");

export function verifyPersonalSig(userId: string, exp: string | null, s: string | null): boolean {
  if (!exp || !s || !/^\d{1,12}$/.test(exp) || !/^[0-9a-f]{64}$/.test(s)) return false;
  if (Number(exp) * 1000 < Date.now()) return false;
  const want = Buffer.from(sig(userId, Number(exp)));
  const got = Buffer.from(s);
  return want.length === got.length && timingSafeEqual(want, got);
}

/**
 * Resuelve las URLs de marca del deck para quien lo va a mostrar. La institución es pública; el logo personal se firma con
 * caducidad (el visor ya fue autorizado por la página). No cambia el contenido guardado ni su hash.
 */
export function withSignedBranding(deck: DeckDocument, ttlSeconds: number): DeckDocument {
  const b = deck.meta.branding;
  const m = b?.personalLogoUrl ? /^\/api\/branding\/personal\/([A-Za-z0-9_-]{1,64})(\?.*)?$/.exec(b.personalLogoUrl) : null;
  if (!b || !m) return deck;
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const base = m[2] ?? "";
  const url = `/api/branding/personal/${m[1]}${base ? `${base}&` : "?"}exp=${exp}&sig=${sig(m[1]!, exp)}`;
  return { ...deck, meta: { ...deck.meta, branding: { ...b, personalLogoUrl: url } } };
}

/* ───── Entrada de subida: límite duro de bytes antes de parsear ───── */
export async function readLogoUpload(req: Request, max = 1024 * 1024): Promise<Buffer> {
  const ctype = req.headers.get("content-type") ?? "";
  if (!/^multipart\/form-data/i.test(ctype)) throw new LaminaError("invalid_input", "Sube el logo como archivo.", 415);
  const declared = Number(req.headers.get("content-length") ?? 0);
  const cap = max + 64 * 1024;
  if (declared > cap) throw new LaminaError("invalid_input", "El logo supera 1 MB.", 413);
  if (!req.body) throw new LaminaError("invalid_input", "Sube el logo como archivo.", 400);
  const chunks: Uint8Array[] = [];
  let total = 0;
  const reader = req.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > cap) { await reader.cancel().catch(() => {}); throw new LaminaError("invalid_input", "El logo supera 1 MB.", 413); }
    chunks.push(value);
  }
  const form = await new Request("http://local/", { method: "POST", headers: { "content-type": ctype }, body: Buffer.concat(chunks) }).formData().catch(() => null);
  const file = form?.get("logo");
  if (!(file instanceof File)) throw new LaminaError("invalid_input", "Falta el archivo del logo.", 400);
  if (file.size > max) throw new LaminaError("invalid_input", "El logo supera 1 MB.", 413);
  return Buffer.from(await file.arrayBuffer());
}

/* ───── Límite de subidas por usuario (en memoria; suficiente para una sola instancia) ───── */
const hits = new Map<string, number[]>();
export function rateLimitUpload(key: string, max = 12, windowMs = 3_600_000) {
  const now = Date.now();
  const list = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (list.length >= max) throw new LaminaError("rate_limited", "Demasiados intentos de subida. Espera un rato e inténtalo de nuevo.", 429);
  list.push(now);
  hits.set(key, list);
}
