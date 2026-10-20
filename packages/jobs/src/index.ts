import { PgBoss } from "pg-boss";
import { z } from "zod";
import { JOB_PAYLOADS, jobSingletonKey, type JobName, LaminaError } from "@lamina/contracts";

export type Boss = PgBoss;

/** Tiempo máximo (s) de ejecución por job (el timeout real de cada tarea) y reintentos con backoff. */
export const QUEUE_CONFIG: Record<JobName, { expireInSeconds: number; retryLimit: number; policy: "exclusive" | "standard" }> = {
  research: { expireInSeconds: 6 * 60, retryLimit: 2, policy: "exclusive" },
  "content.generate": { expireInSeconds: 12 * 60, retryLimit: 2, policy: "exclusive" },
  "design.generate": { expireInSeconds: 20 * 60, retryLimit: 2, policy: "exclusive" },
  "component.request": { expireInSeconds: 15 * 60, retryLimit: 2, policy: "exclusive" },
  "design.repair": { expireInSeconds: 15 * 60, retryLimit: 1, policy: "exclusive" },
  polish: { expireInSeconds: 8 * 60, retryLimit: 2, policy: "exclusive" },
  render: { expireInSeconds: 5 * 60, retryLimit: 2, policy: "standard" },
};

export async function createBoss(connectionString: string): Promise<Boss> {
  const boss = new PgBoss({ connectionString, schema: "pgboss", max: 5 });
  boss.on("error", (e) => console.error("[pg-boss]", e));
  await boss.start();
  for (const [name, c] of Object.entries(QUEUE_CONFIG)) {
    await boss.createQueue(name, {
      policy: c.policy, expireInSeconds: c.expireInSeconds, retryLimit: c.retryLimit, retryDelay: 20, retryBackoff: true, retryDelayMax: 300,
      deleteAfterSeconds: 3 * 24 * 3600, retentionSeconds: 3 * 24 * 3600,
    });
  }
  return boss;
}

/** Encola validando el payload; la singletonKey `nombre:presentación:base` evita duplicados por doble clic o recarga. */
export async function enqueue<N extends JobName>(boss: Boss, name: N, payload: z.input<(typeof JOB_PAYLOADS)[N]>, opts: { base?: string; startAfter?: Date } = {}) {
  const data = (JOB_PAYLOADS[name] as z.ZodType).parse(payload) as { presentationId: string };
  const key = jobSingletonKey(name, data.presentationId, opts.base ?? "0");
  const id = await boss.send(name, data, { singletonKey: key, startAfter: opts.startAfter });
  if (!id) throw new LaminaError("job_in_progress", "Ya hay un trabajo en curso para esta etapa", 409);
  return id;
}
