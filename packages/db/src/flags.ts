import { eq, sql } from "drizzle-orm";
import type { Db } from "./client";
import { appSettings } from "./schema";

/** Flags de V3 (PLAN-v3 §4). Todo flag nace apagado: sin configuración = comportamiento v2. */
export const FLAG_NAMES = [
  "v3_durable_jobs", "v3_workspace", "v3_areas", "v3_pedagogy", "v3_images", "v3_motion", "v3_logo",
  "v3_editor", "v3_harness_repair", "v3_harness_chat", "v3_harness_design", "v3_mcp2", "v3_student_material", "v3_exports", "v3_research_consent",
] as const;
export type FlagName = (typeof FLAG_NAMES)[number];

/** off: nadie · testers: cuentas de prueba · volunteers: testers + voluntarios · all: todos. `users`/`presentations` son overrides explícitos. */
export type FlagMode = "off" | "testers" | "volunteers" | "all";
export type FlagRule = { mode: FlagMode; testers?: string[]; volunteers?: string[]; users?: Record<string, boolean>; presentations?: Record<string, boolean> };
export type FlagConfig = Partial<Record<FlagName, FlagRule>>;

export const FLAGS_KEY = "v3_flags";

/** Resolución pura: `off` apaga todo; si no, override por presentación > override por usuario > modo global. */
export function resolveFlag(cfg: FlagConfig | null | undefined, name: FlagName, ctx: { userId?: string; presentationId?: string } = {}): boolean {
  const r = cfg?.[name];
  if (!r || r.mode === "off") return false; // `off` es el interruptor general: apaga también los overrides
  if (ctx.presentationId && r.presentations && ctx.presentationId in r.presentations) return !!r.presentations[ctx.presentationId];
  if (ctx.userId && r.users && ctx.userId in r.users) return !!r.users[ctx.userId];
  switch (r.mode) {
    case "all": return true;
    case "volunteers": return !!ctx.userId && !!(r.testers?.includes(ctx.userId) || r.volunteers?.includes(ctx.userId));
    case "testers": return !!ctx.userId && !!r.testers?.includes(ctx.userId);
    default: return false;
  }
}

let cache: { at: number; cfg: FlagConfig } | null = null;
const TTL_MS = 15_000;

/** Lee la configuración (caché corta: apagar un flag surte efecto en segundos, sin deploy). */
export async function loadFlags(db: Db, force = false): Promise<FlagConfig> {
  const now = Date.now();
  if (!force && cache && now - cache.at < TTL_MS) return cache.cfg;
  const [row] = await db.select().from(appSettings).where(eq(appSettings.key, FLAGS_KEY));
  const cfg = (row?.value ?? {}) as FlagConfig;
  cache = { at: now, cfg };
  return cfg;
}

export async function flagEnabled(db: Db, name: FlagName, ctx: { userId?: string; presentationId?: string } = {}): Promise<boolean> {
  try { return resolveFlag(await loadFlags(db), name, ctx); } catch { return false; }
}

/** Atómico en SQL (mezcla jsonb): dos cambios simultáneos de flags distintos no se pisan. */
export async function setFlag(db: Db, name: FlagName, rule: FlagRule): Promise<void> {
  const patch = JSON.stringify({ [name]: rule });
  await db.insert(appSettings).values({ key: FLAGS_KEY, value: { [name]: rule } })
    .onConflictDoUpdate({ target: appSettings.key, set: { value: sql`${appSettings.value} || ${patch}::jsonb`, updatedAt: new Date() } });
  cache = null;
}
