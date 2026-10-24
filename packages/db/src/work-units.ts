import { and, eq, inArray, lt, sql } from "drizzle-orm";
import { createHash } from "node:crypto";
import type { Db } from "./client";
import { workUnits } from "./schema";

export type UnitKind = "slide" | "component" | "block" | "image";

/** runKey: misma ejecución lógica (entradas + época de cancelación) ⇒ un reintento reanuda; entradas nuevas ⇒ ejecución nueva. */
export const runKeyOf = (parts: unknown[]) => createHash("sha256").update(JSON.stringify(parts)).digest("hex").slice(0, 32);

export type UnitScope = { presentationId: string; runKey: string; kind: UnitKind };

/** Resultados ya terminados de una ejecución (ref → result). Es lo único que un reinicio NO repite. */
export async function doneUnits(db: Db, s: UnitScope): Promise<Map<string, unknown>> {
  const rows = await db.select({ ref: workUnits.ref, result: workUnits.result }).from(workUnits)
    .where(and(eq(workUnits.presentationId, s.presentationId), eq(workUnits.runKey, s.runKey), eq(workUnits.kind, s.kind), eq(workUnits.state, "done")));
  return new Map(rows.map((r) => [r.ref, r.result]));
}

export async function startUnit(db: Db, s: UnitScope, ref: string, jobId?: string) {
  await db.insert(workUnits).values({ ...s, ref, jobId, state: "running", attempts: 1, heartbeatAt: new Date() })
    .onConflictDoUpdate({
      target: [workUnits.presentationId, workUnits.runKey, workUnits.kind, workUnits.ref],
      set: { state: "running", jobId: jobId ?? null, attempts: sql`${workUnits.attempts} + 1`, heartbeatAt: new Date(), error: null, updatedAt: new Date() },
    });
}

export async function heartbeatUnits(db: Db, s: UnitScope) {
  await db.update(workUnits).set({ heartbeatAt: new Date() })
    .where(and(eq(workUnits.presentationId, s.presentationId), eq(workUnits.runKey, s.runKey), eq(workUnits.state, "running")));
}

export async function finishUnit(db: Db, s: UnitScope, ref: string, result: unknown) {
  await db.update(workUnits).set({ state: "done", result: result as never, error: null, heartbeatAt: new Date(), updatedAt: new Date() })
    .where(and(eq(workUnits.presentationId, s.presentationId), eq(workUnits.runKey, s.runKey), eq(workUnits.kind, s.kind), eq(workUnits.ref, ref)));
}

export async function failUnit(db: Db, s: UnitScope, ref: string, error: string, state: "failed" | "quota_wait" = "failed") {
  await db.update(workUnits).set({ state, error: error.slice(0, 500), updatedAt: new Date() })
    .where(and(eq(workUnits.presentationId, s.presentationId), eq(workUnits.runKey, s.runKey), eq(workUnits.kind, s.kind), eq(workUnits.ref, ref)));
}

/** Al terminar la ejecución el resultado ya vive en la versión guardada: las unidades se descartan (la siguiente ejecución parte de cero). */
export async function clearRun(db: Db, s: Omit<UnitScope, "kind">) {
  await db.delete(workUnits).where(and(eq(workUnits.presentationId, s.presentationId), eq(workUnits.runKey, s.runKey)));
}

/** Unidades `running` con el heartbeat vencido (el proceso murió): vuelven a `pending`. Devuelve cuántas. */
export async function recoverStaleUnits(db: Db, staleSecs = 180): Promise<number> {
  const cutoff = new Date(Date.now() - staleSecs * 1000);
  const r = await db.update(workUnits).set({ state: "pending", updatedAt: new Date() })
    .where(and(eq(workUnits.state, "running"), lt(workUnits.heartbeatAt, cutoff))).returning({ id: workUnits.id });
  return r.length;
}

export async function unitCounts(db: Db, presentationId: string, runKey: string) {
  const rows = await db.select({ state: workUnits.state, n: sql<number>`count(*)::int` }).from(workUnits)
    .where(and(eq(workUnits.presentationId, presentationId), eq(workUnits.runKey, runKey))).groupBy(workUnits.state);
  const c: Record<string, number> = {};
  for (const r of rows) c[r.state] = r.n;
  return c;
}

/** Progreso visible por presentación: unidades de la ejecución más reciente que sigue abierta. */
export async function latestProgress(db: Db, presentationId: string): Promise<{ done: number; total: number; quotaWait: number; failed: number } | null> {
  const rows = await db.select({ runKey: workUnits.runKey, state: workUnits.state, at: workUnits.updatedAt }).from(workUnits)
    .where(and(eq(workUnits.presentationId, presentationId), inArray(workUnits.kind, ["slide", "component", "image"])));
  if (!rows.length) return null;
  const latest = rows.reduce((a, b) => (b.at > a.at ? b : a));
  const mine = rows.filter((r) => r.runKey === latest.runKey);
  return { done: mine.filter((r) => r.state === "done").length, total: mine.length, quotaWait: mine.filter((r) => r.state === "quota_wait").length, failed: mine.filter((r) => r.state === "failed").length };
}
