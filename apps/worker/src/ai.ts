import { AiClient, OpenRouterProvider, RateLimiter, type AiHooks, type Provider } from "@lamina/ai";
import { consumeGlobalAiBudget, runSignal, schema, type Db } from "@lamina/db";
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

/** Cada llamada hereda la señal del job (aborto por expiración) y un tope de tiempo por llamada (LAMINA_CALL_TIMEOUT_SECS, 150 s por defecto). */
export function withSignals(inner: Provider, callTimeoutMs: number): Provider {
  return {
    chat(req) {
      const sigs = [req.signal, runSignal(), AbortSignal.timeout(callTimeoutMs)].filter(Boolean) as AbortSignal[];
      return inner.chat({ ...req, signal: AbortSignal.any(sigs) });
    },
  };
}

export function makeAi(env: Env, db: Db, fake?: Provider): AiClient {
  const base = env.LAMINA_AI_PROVIDER === "fake" ? fake! : new OpenRouterProvider(env.OPENROUTER_API_KEY!);
  const provider = withSignals(base, Number(process.env.LAMINA_CALL_TIMEOUT_SECS ?? 150) * 1000);
  return new AiClient({ provider, abortSignal: runSignal, hooks: makeHooks(db, env.AI_DAILY_BUDGET), limiter: env.LAMINA_AI_PROVIDER === "fake" ? undefined : new RateLimiter(18) });
}
