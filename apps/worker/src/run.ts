import { LaminaError } from "@lamina/contracts";
import { QuotaWaitError } from "@lamina/ai";
import { runContext, schema, workflow as wf } from "@lamina/db";
import { eq } from "drizzle-orm";
import type { Ctx } from "./ctx";

const RETRYABLE = new Set(["provider_failed", "internal"]);

export const friendly = (e: unknown): string => {
  if (e instanceof LaminaError) return e.message;
  return "Ocurrió un error inesperado al procesar el trabajo. Puedes reintentarlo.";
};

/**
 * Envuelve un handler: cuota agotada → quota_wait con hora de reanudación; error definitivo → failed_recoverable
 * (con mensaje amigable y registro); error transitorio → relanza para que pg-boss reintente con backoff.
 */
export function guarded<P extends { presentationId: string }>(ctx: Ctx, name: string, handler: (ctx: Ctx, data: P) => Promise<void>, retryLimit = 2) {
  return async (jobs: { data: P; retryCount?: number }[]) => {
    for (const job of jobs) {
      const id = job.data.presentationId;
      const [cur] = await ctx.db.select({ epoch: schema.presentations.cancelEpoch }).from(schema.presentations).where(eq(schema.presentations.id, id));
      if (!cur) continue;
      try {
        await runContext.run({ presentationId: id, epoch: cur.epoch }, async () => {
          try {
            await handler(ctx, job.data);
          } catch (e) {
            if (e instanceof QuotaWaitError) {
              ctx.log(`${name}: en espera de cupo hasta ${e.resumeAt.toISOString()}`, { id });
              await wf.enterQuotaWait(ctx.db, id, e.resumeAt, `Los modelos gratuitos están sin cupo ahora. Se reanudará solo a las ${e.resumeAt.toLocaleTimeString("es-EC", { hour: "2-digit", minute: "2-digit", timeZone: "America/Guayaquil" })}.`);
              await ctx.db.insert(schema.events).values({ name: "quota_wait", presentationId: id, data: { job: name } });
              return;
            }
            const code = e instanceof LaminaError ? e.code : "internal";
            if (code === "run_cancelled") throw e;
            ctx.log(`${name}: error ${code}: ${(e as Error).message}`, { id });
            const attempts = (job.retryCount ?? 0) + 1;
            if (RETRYABLE.has(code) && attempts <= retryLimit) throw e;
            await ctx.db.insert(schema.jobErrors).values({ jobName: name, presentationId: id, friendly: friendly(e), detail: String((e as Error).stack ?? e).slice(0, 2000) });
            await wf.failJob(ctx.db, id, friendly(e));
            await ctx.db.insert(schema.events).values({ name: "job_failed", presentationId: id, data: { job: name, code } });
          }
        });
      } catch (e) {
        // Trabajo cancelado por el docente mientras corría: su resultado se descarta sin tocar el estado de la ejecución nueva.
        if (e instanceof LaminaError && e.code === "run_cancelled") { ctx.log(`${name}: descartado (cancelado)`, { id }); continue; }
        throw e;
      }
    }
  };
}

export async function loadPresentation(ctx: Ctx, id: string) {
  const [p] = await ctx.db.select().from(schema.presentations).where(eq(schema.presentations.id, id));
  return p ?? null;
}

/** Los jobs obsoletos (la presentación ya no está en la etapa esperada) se descartan. */
export async function expectStage(ctx: Ctx, id: string, stage: string) {
  const p = await loadPresentation(ctx, id);
  if (!p || p.stage !== stage) return null;
  return p;
}
