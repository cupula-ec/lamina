import { and, eq, sql } from "drizzle-orm";
import { LaminaError } from "@lamina/contracts";
import type { Db } from "./client";
import { usageCounters, userProfiles } from "./schema";

export const QUOTA_KINDS = ["presentation_new", "content_regen", "design_regen", "component_request", "ocr_vision_page", "mcp_call", "mcp_submit", "export", "image"] as const;
export type QuotaKind = (typeof QUOTA_KINDS)[number];

export const DEFAULT_QUOTAS: Record<QuotaKind, number> = {
  presentation_new: 5,
  content_regen: 10,
  design_regen: 10,
  component_request: 3,
  ocr_vision_page: 30,
  mcp_call: 500,
  mcp_submit: 40,
  export: 20,
  image: 40,
};
export const DEFAULT_CONCURRENT_JOBS = 2;

export const today = (d = new Date()) => d.toISOString().slice(0, 10);

export async function limitFor(db: Db, userId: string, kind: QuotaKind): Promise<number> {
  const [p] = await db.select({ q: userProfiles.quotaOverrides }).from(userProfiles).where(eq(userProfiles.userId, userId));
  return p?.q?.[kind] ?? DEFAULT_QUOTAS[kind];
}

/** Consume 1 unidad de cuota diaria de forma atómica; lanza quota_exceeded si se supera el límite. */
export async function consumeQuota(db: Db, userId: string, kind: QuotaKind, now = new Date()) {
  const limit = await limitFor(db, userId, kind);
  if (limit <= 0) throw new LaminaError("quota_exceeded", "Tu cuota para esta acción está en 0. Contacta a un administrador.", 429, { kind, limit });
  const day = today(now);
  const scope = `u:${userId}`;
  const res = await db.execute(sql`
    insert into usage_counters (scope, kind, day, count) values (${scope}, ${kind}, ${day}, 1)
    on conflict (scope, kind, day) do update set count = usage_counters.count + 1
    where usage_counters.count < ${limit}
    returning count`);
  if (res.rows.length === 0)
    throw new LaminaError("quota_exceeded", `Alcanzaste el límite diario (${limit}) para esta acción. Se renueva a medianoche UTC.`, 429, { kind, limit });
}

/** Como consumeQuota pero devuelve false (sin lanzar) si no hay cupo: para degradar en vez de fallar. */
export async function tryConsumeQuota(db: Db, userId: string, kind: QuotaKind, now = new Date()): Promise<boolean> {
  try {
    await consumeQuota(db, userId, kind, now);
    return true;
  } catch (e) {
    if (e instanceof LaminaError && e.code === "quota_exceeded") return false;
    throw e;
  }
}

/** Devuelve la unidad consumida (p. ej. si el job nunca se encoló). */
export async function refundQuota(db: Db, userId: string, kind: QuotaKind, now = new Date()) {
  await db.update(usageCounters)
    .set({ count: sql`greatest(${usageCounters.count} - 1, 0)` })
    .where(and(eq(usageCounters.scope, `u:${userId}`), eq(usageCounters.kind, kind), eq(usageCounters.day, today(now))));
}

export async function usageFor(db: Db, userId: string, now = new Date()) {
  const rows = await db.select().from(usageCounters).where(and(eq(usageCounters.scope, `u:${userId}`), eq(usageCounters.day, today(now))));
  const out = {} as Record<QuotaKind, { used: number; limit: number }>;
  for (const k of QUOTA_KINDS) out[k] = { used: rows.find((r) => r.kind === k)?.count ?? 0, limit: await limitFor(db, userId, k) };
  return out;
}

/** Presupuesto global diario de llamadas IA. */
export async function consumeGlobalAiBudget(db: Db, limit: number, now = new Date()): Promise<boolean> {
  if (limit <= 0) return false;
  const res = await db.execute(sql`
    insert into usage_counters (scope, kind, day, count) values ('global', 'ai_call', ${today(now)}, 1)
    on conflict (scope, kind, day) do update set count = usage_counters.count + 1
    where usage_counters.count < ${limit}
    returning count`);
  return res.rows.length > 0;
}
