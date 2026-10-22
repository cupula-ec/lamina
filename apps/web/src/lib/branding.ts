import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { LaminaError, type DeckDocument } from "@lamina/contracts";
import { logoVersion } from "@lamina/db";
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

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const ownedName = (ownerId: string) => new RegExp(`^${escapeRe(ownerId)}-[0-9a-f]{8}\\.png$`);
async function ownedFiles(kind: LogoKind, ownerId: string) {
  const re = ownedName(ownerId);
  const dir = brandingDir(kind);
  const names = (await fs.readdir(dir).catch(() => [] as string[])).filter((n) => re.test(n));
  return Promise.all(names.map(async (n) => ({ name: n, mtime: (await fs.stat(path.join(dir, n)).catch(() => null))?.mtimeMs ?? 0 })));
}

/** Versiones anteriores que se conservan por dueño: los decks guardados siguen apuntando a su `?v=` (ADR-011). */
export const KEEP_OLD_LOGOS = 3;

/**
 * Política de logos mutables (ADR-011): al reemplazar o quitar un logo NO se borra el archivo anterior (las versiones de deck ya
 * guardadas lo referencian por `?v=`). Se conservan las `keep` versiones anteriores más recientes y se purga el resto.
 */
export async function retireLogos(kind: LogoKind, ownerId: string, current: string | null | undefined, keep = KEEP_OLD_LOGOS) {
  const old = (await ownedFiles(kind, ownerId)).filter((f) => f.name !== current).sort((a, b) => b.mtime - a.mtime);
  for (const f of old.slice(keep)) await fs.rm(path.join(brandingDir(kind), f.name), { force: true });
}

/** Borrado definitivo de TODOS los logos de un dueño (institución eliminada o cuenta eliminada). */
export async function purgeLogos(kind: LogoKind, ownerId: string) {
  for (const f of await ownedFiles(kind, ownerId)) await fs.rm(path.join(brandingDir(kind), f.name), { force: true });
}

const builtinRoots = () => [path.join(process.cwd(), "public", "institutions"), path.join(process.cwd(), "apps", "web", "public", "institutions")];

/** Lee un logo ya normalizado; null si no existe. Los recursos `builtin:` salen de `public/institutions` (empaquetados con la web). */
export async function readLogo(kind: LogoKind, stored: string | null | undefined): Promise<Buffer | null> {
  if (!stored) return null;
  const b = BUILTIN.exec(stored);
  try {
    if (b) {
      for (const root of builtinRoots()) {
        try { return await fs.readFile(path.join(root, b[1]!)); } catch { /* siguiente raíz */ }
      }
      return null;
    }
    if (!NAME.test(stored)) return null;
    return await fs.readFile(path.join(brandingDir(kind), stored));
  } catch { return null; }
}

/**
 * Como readLogo, pero respeta `?v=`: si la versión pedida es la vigente (o no se pide) sirve la vigente; si es otra, busca esa
 * versión entre las retenidas del dueño (o los recursos empaquetados). Si ya no existe: null (404; la vista oculta la imagen).
 */
export async function readLogoVersion(kind: LogoKind, ownerId: string, stored: string | null | undefined, v: string | null): Promise<Buffer | null> {
  if (!v || !/^[0-9a-f]{8}$/.test(v) || (stored && logoVersion(stored) === v)) return readLogo(kind, stored);
  for (const f of await ownedFiles(kind, ownerId)) if (logoVersion(f.name) === v) return readLogo(kind, f.name);
  for (const root of builtinRoots()) {
    for (const n of await fs.readdir(root).catch(() => [] as string[])) if (/^[A-Za-z0-9_-]{1,40}\.png$/.test(n) && logoVersion(`builtin:${n}`) === v) return readLogo(kind, `builtin:${n}`);
  }
  return null;
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

const PERSONAL_URL = /^\/api\/branding\/personal\/([A-Za-z0-9_-]{1,64})(\?v=[0-9a-f]{8})?$/;

/**
 * Resuelve las URLs de marca del deck para quien lo va a mostrar. La institución es pública; el logo personal se firma con
 * caducidad (el visor ya fue autorizado por la página) SOLO si pertenece al dueño de la presentación: cualquier otra URL
 * personal (otro usuario, forma no canónica) se descarta. No cambia el contenido guardado ni su hash.
 */
export function withSignedBranding(deck: DeckDocument, ttlSeconds: number, ownerId: string): DeckDocument {
  const b = deck.meta.branding;
  if (!b?.personalLogoUrl) return deck;
  const m = PERSONAL_URL.exec(b.personalLogoUrl);
  const { personalLogoUrl: _drop, ...rest } = b;
  if (!m || m[1] !== ownerId) return { ...deck, meta: { ...deck.meta, branding: rest } };
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const url = `/api/branding/personal/${m[1]}${m[2] ?? ""}${m[2] ? "&" : "?"}exp=${exp}&sig=${sig(m[1]!, exp)}`;
  return { ...deck, meta: { ...deck.meta, branding: { ...rest, personalLogoUrl: url } } };
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
