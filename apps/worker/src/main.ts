import { eq, lt } from "drizzle-orm";
import { JOB_PAYLOADS } from "@lamina/contracts";
import { createDb, runContext, schema, units, workflow as wf } from "@lamina/db";
import { createBoss, enqueue } from "@lamina/jobs";
import { SearxngProvider, TavilyProvider, defaultImageProviders, type SearchProvider } from "@lamina/research";
import { makeAi } from "./ai";
import type { Ctx } from "./ctx";
import { loadEnv } from "./env";
import { makeFakeProvider } from "./fake-provider";
import { contentGenerate } from "./handlers/content";
import { designGenerate } from "./handlers/design";
import { polish } from "./handlers/polish";
import { designRepair } from "./handlers/repair";
import { research } from "./handlers/research";
import { guarded, jobSignal } from "./run";

const env = loadEnv();
const { db, pool } = createDb(env.DATABASE_URL, 8);
const boss = await createBoss(env.DATABASE_URL);
const search: SearchProvider[] = [];
if (env.SEARXNG_URL) search.push(new SearxngProvider(env.SEARXNG_URL));
if (env.TAVILY_API_KEY) search.push(new TavilyProvider(env.TAVILY_API_KEY));

const ctx: Ctx = {
  env, db, boss, search, images: defaultImageProviders({ searxngUrl: env.SEARXNG_URL, unsplashKey: env.UNSPLASH_ACCESS_KEY, pexelsKey: env.PEXELS_API_KEY }),
  ai: makeAi(env, db, env.LAMINA_AI_PROVIDER === "fake" ? makeFakeProvider() : undefined),
  log: (m, x) => console.log(`[worker] ${new Date().toISOString()} ${m}`, x ?? ""),
};

/** Concurrencia por cola (LAMINA_CONC_<COLA>, p. ej. LAMINA_CONC_DESIGN_REPAIR=2). Cada cola tiene su propio worker: una reparación no espera detrás de un diseño. */
const conc = (name: string, def: number) => ({ localConcurrency: Math.max(1, Number(process.env[`LAMINA_CONC_${name.replace(/\W+/g, "_").toUpperCase()}`]) || def) });
type Job<T> = { data: T; retryCount?: number }[];
await boss.work("research", conc("research", 2), guarded(ctx, "research", research) as (j: Job<any>) => Promise<void>);
await boss.work("content.generate", conc("content.generate", 2), guarded(ctx, "content.generate", contentGenerate as any) as any);
await boss.work("design.generate", conc("design.generate", 1), guarded(ctx, "design.generate", designGenerate as any) as any);
await boss.work("design.repair", conc("design.repair", 1), async (jobs: { data: any; signal?: AbortSignal }[]) => {
  for (const j of jobs) {
    const data = JOB_PAYLOADS["design.repair"].parse(j.data);
    const [cur] = await db.select({ epoch: schema.presentations.cancelEpoch, ownerId: schema.presentations.ownerId }).from(schema.presentations).where(eq(schema.presentations.id, data.presentationId));
    // Con la señal del job: si pg-boss lo expira, la reparación se corta y libera la cola (antes seguía en segundo plano y bloqueaba al siguiente).
    await runContext.run({ presentationId: data.presentationId, epoch: cur?.epoch ?? 0, signal: await jobSignal(ctx, data.presentationId, cur?.ownerId, j.signal) }, () => designRepair(ctx, data));
  }
});
await boss.work("polish", conc("polish", 1), guarded(ctx, "polish", polish as any) as any);
const { registerComponentWorker } = await import("./handlers/component");
await registerComponentWorker(ctx);

/** Reanuda trabajos en espera de cupo cuya hora ya pasó. */
async function resumeDue() {
  for (const { id } of await wf.dueQuotaWaits(db)) {
    try {
      const { pending } = await wf.resumeFromWait(db, id);
      await enqueue(boss, pending.name as any, pending.payload as any, { base: `resume-${Date.now()}` });
      ctx.log(`reanudado ${pending.name}`, { id });
    } catch (e) { ctx.log(`no se pudo reanudar: ${(e as Error).message}`, { id }); }
  }
}

/** Retención: jobs y ai_calls a 90 días. */
async function purge() {
  const cutoff = new Date(Date.now() - 90 * 24 * 3600 * 1000);
  await db.delete(schema.aiCalls).where(lt(schema.aiCalls.createdAt, cutoff));
  await db.delete(schema.jobErrors).where(lt(schema.jobErrors.createdAt, cutoff));
  await db.delete(schema.events).where(lt(schema.events.createdAt, cutoff));
  // Unidades de trabajo de ejecuciones canceladas/abandonadas (solo `clearRun` las borra al terminar bien).
  await db.delete(schema.workUnits).where(lt(schema.workUnits.updatedAt, new Date(Date.now() - 7 * 24 * 3600 * 1000)));
}

/** Unidades `running` con heartbeat vencido (el proceso murió): vuelven a `pending`. */
async function recoverUnits() {
  const n = await units.recoverStaleUnits(db, 180);
  if (n) ctx.log(`${n} unidad(es) de trabajo recuperadas tras reinicio`);
}
void recoverUnits().catch((e) => ctx.log(`recoverUnits: ${e.message}`));
const t4 = setInterval(() => void recoverUnits().catch((e) => ctx.log(`recoverUnits: ${e.message}`)), 60_000);
const t3 = setInterval(() => void wf.failStale(db, 45).then((n) => n && ctx.log(`${n} trabajo(s) atascado(s) marcados como detenidos`)).catch((e) => ctx.log(`failStale: ${e.message}`)), 60_000);
const t1 = setInterval(() => void resumeDue().catch((e) => ctx.log(`resumeDue: ${e.message}`)), 30_000);
const t2 = setInterval(() => void purge().catch((e) => ctx.log(`purge: ${e.message}`)), 6 * 3600_000);
void purge().catch((e) => ctx.log(`purge: ${e.message}`));
ctx.log(`worker listo (IA: ${env.LAMINA_AI_PROVIDER}, búsqueda: ${search.map((s) => s.name).join("+") || "ninguna"})`);

async function shutdown() {
  clearInterval(t1); clearInterval(t2); clearInterval(t3); clearInterval(t4);
  await boss.stop({ graceful: true, timeout: 20_000 }).catch(() => {});
  await pool.end();
  process.exit(0);
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
