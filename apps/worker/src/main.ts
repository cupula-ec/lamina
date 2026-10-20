import { lt } from "drizzle-orm";
import { createDb, schema, workflow as wf } from "@lamina/db";
import { createBoss, enqueue } from "@lamina/jobs";
import { SearxngProvider, TavilyProvider, type SearchProvider } from "@lamina/research";
import { makeAi } from "./ai";
import type { Ctx } from "./ctx";
import { loadEnv } from "./env";
import { makeFakeProvider } from "./fake-provider";
import { contentGenerate } from "./handlers/content";
import { designGenerate } from "./handlers/design";
import { polish } from "./handlers/polish";
import { research } from "./handlers/research";
import { guarded } from "./run";

const env = loadEnv();
const { db, pool } = createDb(env.DATABASE_URL, 8);
const boss = await createBoss(env.DATABASE_URL);
const search: SearchProvider[] = [];
if (env.SEARXNG_URL) search.push(new SearxngProvider(env.SEARXNG_URL));
if (env.TAVILY_API_KEY) search.push(new TavilyProvider(env.TAVILY_API_KEY));

const ctx: Ctx = {
  env, db, boss, search,
  ai: makeAi(env, db, env.LAMINA_AI_PROVIDER === "fake" ? makeFakeProvider() : undefined),
  log: (m, x) => console.log(`[worker] ${new Date().toISOString()} ${m}`, x ?? ""),
};

type Job<T> = { data: T; retryCount?: number }[];
await boss.work("research", { localConcurrency: 2 }, guarded(ctx, "research", research) as (j: Job<any>) => Promise<void>);
await boss.work("content.generate", { localConcurrency: 2 }, guarded(ctx, "content.generate", contentGenerate as any) as any);
await boss.work("design.generate", { localConcurrency: 1 }, guarded(ctx, "design.generate", designGenerate as any) as any);
await boss.work("polish", { localConcurrency: 1 }, guarded(ctx, "polish", polish as any) as any);
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
}

const t3 = setInterval(() => void wf.failStale(db, 45).then((n) => n && ctx.log(`${n} trabajo(s) atascado(s) marcados como detenidos`)).catch((e) => ctx.log(`failStale: ${e.message}`)), 60_000);
const t1 = setInterval(() => void resumeDue().catch((e) => ctx.log(`resumeDue: ${e.message}`)), 30_000);
const t2 = setInterval(() => void purge().catch((e) => ctx.log(`purge: ${e.message}`)), 6 * 3600_000);
void purge();
ctx.log(`worker listo (IA: ${env.LAMINA_AI_PROVIDER}, búsqueda: ${search.map((s) => s.name).join("+") || "ninguna"})`);

async function shutdown() {
  clearInterval(t1); clearInterval(t2); clearInterval(t3);
  await boss.stop({ graceful: true, timeout: 20_000 }).catch(() => {});
  await pool.end();
  process.exit(0);
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
