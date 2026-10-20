import { AiClient, OpenRouterProvider, RateLimiter, type AiHooks, type Provider } from "@lamina/ai";
import { consumeGlobalAiBudget, schema, type Db } from "@lamina/db";
import type { Env } from "./env";

export function makeHooks(db: Db, budget: number): AiHooks {
  return {
    async onCall(r) {
      await db.insert(schema.aiCalls).values({
        role: r.role, model: r.model, presentationId: r.presentationId, latencyMs: r.latencyMs, promptTokens: r.promptTokens,
        completionTokens: r.completionTokens, result: r.result, error: r.error,
      }).catch(() => {});
    },
    consumeBudget: () => consumeGlobalAiBudget(db, budget),
  };
}

export function makeAi(env: Env, db: Db, fake?: Provider): AiClient {
  const provider = env.LAMINA_AI_PROVIDER === "fake" ? fake! : new OpenRouterProvider(env.OPENROUTER_API_KEY!);
  return new AiClient({ provider, hooks: makeHooks(db, env.AI_DAILY_BUDGET), limiter: env.LAMINA_AI_PROVIDER === "fake" ? undefined : new RateLimiter(18) });
}
