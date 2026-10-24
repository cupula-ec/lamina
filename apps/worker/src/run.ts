import { LaminaError } from "@lamina/contracts";
import { QuotaWaitError } from "@lamina/ai";
import { flagEnabled, runContext, schema, workflow as wf } from "@lamina/db";
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
/**
 * Señal de aborto del job SOLO con jobs durables activos (v3_durable_jobs): sin reanudación, cortar un handler largo perdería el
 * trabajo en cada reintento (con v2 el handler seguía en segundo plano y terminaba entregando). Se decide por presentación.
 */
export async function jobSignal(ctx: Ctx, presentationId: string, ownerId: string | undefined, signal: AbortSignal | undefined) {
  if (!signal || !ownerId) return undefined;
  return (await flagEnabled(ctx.db, "v3_durable_jobs", { userId: ownerId, presentationId })) ? signal : undefined;
}

export function guarded<P extends { presentationId: string }>(ctx: Ctx, name: string, handler: (ctx: Ctx, data: P) => Promise<void>, retryLimit = 2) {
  return async (jobs: { data: P; retryCount?: number; signal?: AbortSignal }[]) => {
    for (const job of jobs) {
      const id = job.data.presentationId;
      const [cur] = await ctx.db.select({ epoch: schema.presentations.cancelEpoch, ownerId: schema.presentations.ownerId }).from(schema.presentations).where(eq(schema.presentations.id, id));
      if (!cur) continue;
      const signal = await jobSignal(ctx, id, cur.ownerId, job.signal);
      try {
        await runContext.run({ presentationId: id, epoch: cur.epoch, signal }, async () => {
          try {
            await handler(ctx, job.data);
          } catch (e) {
            if (e instanceof QuotaWaitError) {
              ctx.log(`${name}: en espera de cupo hasta ${e.resumeAt.toISOString()}`, { id });
              await wf.enterQuotaWait(ctx.db, id, e.resumeAt, `Los modelos gratuitos están sin cupo ahora. Se reanudará solo a las ${e.resumeAt.toLocaleTimeString("es-EC", { hour: "2-digit", minute: "2-digit", timeZone: "America/Guayaquil" })}.`);
              await ctx.db.insert(schema.events).values({ name: "quota_wait", presentationId: id, data: { job: name } });
              return;
            }
            // pg-boss expiró el handler (timeout/cierre): suelta todo; el reintento reanuda desde las unidades ya terminadas.
            // Solo cuenta como aborto del job la señal del propio job (un timeout de llamada es un fallo del modelo, no del job).
            if (signal?.aborted) {
              const attempts = (job.retryCount ?? 0) + 1;
              if (attempts > retryLimit) {
                ctx.log(`${name}: abortado en el último intento`, { id });
                await wf.failJob(ctx.db, id, "El trabajo tardó más de lo permitido y se detuvo. Las diapositivas ya generadas se conservan: puedes reintentar.");
                await ctx.db.insert(schema.events).values({ name: "job_failed", presentationId: id, data: { job: name, code: "timeout" } });
              } else ctx.log(`${name}: abortado por expiración/cierre; pg-boss lo reintenta y se reanuda`, { id });
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
