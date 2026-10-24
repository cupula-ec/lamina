import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { AiClient, OpenRouterProvider, QuotaWaitError, ProviderError, RateLimiter, assertFreeModel, chainFor, guardedFetch, type ChatRequest, type Provider } from "../src";

const hooks = () => {
  const calls: any[] = [];
  let budget = 1000;
  return { calls, set: (n: number) => (budget = n), h: { onCall: (r: any) => void calls.push(r), consumeBudget: () => budget-- > 0 } };
};
const S = z.object({ a: z.number() });

describe("guard :free", () => {
  it("acepta :free y rechaza modelos de pago", () => {
    expect(() => assertFreeModel("google/gemma-4-31b-it:free")).not.toThrow();
    for (const bad of ["openai/gpt-5", "anthropic/claude-sonnet-5-5", "google/gemma-4-31b-it", "x/y:free:extended", "x/y:nitro", "", "a:free"])
      expect(() => assertFreeModel(bad)).toThrow(/no es :free/);
  });
  it("las cadenas por defecto y las de env pasan el guard; una de pago en env falla", () => {
    expect(() => (["research", "content", "design", "component", "review", "vision"] as const).forEach((r) => chainFor(r, {}))).not.toThrow();
    expect(() => chainFor("content", { LAMINA_MODELS_CONTENT: "openai/gpt-5" })).toThrow();
  });
  it("el fetch protegido bloquea modelos de pago ANTES de salir a la red", async () => {
    const inner = vi.fn(async () => new Response("{}"));
    const f = guardedFetch(inner as any);
    const req = (b: unknown) => f("https://openrouter.ai/api/v1/chat/completions", { method: "POST", body: JSON.stringify(b) });
    await expect(req({ model: "openai/gpt-5", messages: [] })).rejects.toThrow(/no es :free/);
    await expect(req({ model: "google/gemma-4-31b-it:free", models: ["openai/gpt-5"], messages: [] })).rejects.toThrow();
    await expect(req({ model: "google/gemma-4-31b-it:free", plugins: [{ id: "web" }] })).rejects.toThrow();
    expect(inner).not.toHaveBeenCalled();
    await req({ model: "google/gemma-4-31b-it:free", messages: [] });
    expect(inner).toHaveBeenCalledTimes(1);
  });
  it("OpenRouterProvider rechaza un modelo de pago sin hacer fetch", async () => {
    const inner = vi.fn();
    const p = new OpenRouterProvider("k", { fetch: inner as any });
    await expect(p.chat({ role: "content", task: "t", model: "openai/gpt-5", system: "", user: "", json: true })).rejects.toThrow(/no es :free/);
    expect(inner).not.toHaveBeenCalled();
  });
});

describe("AiClient", () => {
  const mk = (chat: Provider["chat"], chain = ["a/m1:free", "b/m2:free"]) => {
    const hk = hooks();
    const client = new AiClient({ provider: { chat }, hooks: hk.h, chains: { content: chain } });
    return { client, hk };
  };
  const run = (c: AiClient) => c.structured({ role: "content", task: "t", schema: S, system: "s", user: "u" });

  it("devuelve JSON válido (también dentro de fences)", async () => {
    const { client, hk } = mk(async () => ({ text: "```json\n{\"a\":1}\n```" }));
    expect(await run(client)).toEqual({ a: 1 });
    expect(hk.calls[0].result).toBe("ok");
  });
  it("repara una vez con los errores concretos y luego pasa al siguiente modelo", async () => {
    const seen: ChatRequest[] = [];
    const { client, hk } = mk(async (r) => {
      seen.push(r);
      if (r.model === "a/m1:free") return { text: "{\"a\":\"x\"}" };
      return { text: "{\"a\":2}" };
    });
    expect(await run(client)).toEqual({ a: 2 });
    expect(seen.map((r) => r.model)).toEqual(["a/m1:free", "a/m1:free", "b/m2:free"]);
    expect(seen[1]!.user).toContain("NO era válida");
    expect(hk.calls.map((c) => c.result)).toEqual(["invalid", "invalid", "ok"]);
  });
  it("429 por minuto → cooldown y fallback; todos en 429 → QuotaWaitError con hora de reanudación", async () => {
    const { client } = mk(async () => { throw new ProviderError("rate", "slow", 429, 30_000); });
    const err = await run(client).catch((e) => e);
    expect(err).toBeInstanceOf(QuotaWaitError);
    expect(err.resumeAt.getTime()).toBeGreaterThan(Date.now());
    // segundo intento inmediato: ni siquiera llama al proveedor (cooldown)
    const spy = vi.fn(async () => ({ text: "{\"a\":1}" }));
    const c2 = new AiClient({ provider: { chat: spy }, hooks: hooks().h, chains: { content: ["a/m1:free"] } });
    (c2 as any).cooldown.set("a/m1:free", Date.now() + 60_000);
    await expect(run(c2)).rejects.toBeInstanceOf(QuotaWaitError);
    expect(spy).not.toHaveBeenCalled();
  });
  it("cupo diario → QuotaWaitError inmediato (sin probar más modelos)", async () => {
    const chat = vi.fn(async () => { throw new ProviderError("quota", "daily", 429, undefined, new Date(Date.now() + 1e6)); });
    const { client } = mk(chat);
    await expect(run(client)).rejects.toBeInstanceOf(QuotaWaitError);
    expect(chat).toHaveBeenCalledTimes(1);
  });
  it("presupuesto global agotado → QuotaWaitError sin llamar al proveedor", async () => {
    const chat = vi.fn(async () => ({ text: "{\"a\":1}" }));
    const { client, hk } = mk(chat);
    hk.set(0);
    await expect(run(client)).rejects.toBeInstanceOf(QuotaWaitError);
    expect(chat).not.toHaveBeenCalled();
  });
  it("todo inválido → provider_failed (no bucle infinito)", async () => {
    const chat = vi.fn(async () => ({ text: "nada" }));
    const { client } = mk(chat);
    await expect(run(client)).rejects.toMatchObject({ code: "provider_failed" });
    expect(chat).toHaveBeenCalledTimes(4); // 2 modelos × (intento + reparación)
  });
  it("check semántico dispara la reparación", async () => {
    let n = 0;
    const { client } = mk(async () => ({ text: JSON.stringify({ a: ++n }) }));
    const v = await client.structured({ role: "content", task: "t", schema: S, system: "", user: "", check: (x) => (x.a < 2 ? ["a debe ser >= 2"] : []) });
    expect(v.a).toBe(2);
  });
});

describe("RateLimiter", () => {
  it("bloquea al llegar al tope por minuto", async () => {
    let t = 0;
    const l = new RateLimiter(2, () => t, async (ms) => { t += ms; });
    expect(await l.acquire(1000)).toBe(true);
    expect(await l.acquire(1000)).toBe(true);
    expect(await l.acquire(1000)).toBe(false);
    expect(await l.acquire(70_000)).toBe(true);
  });
});

import { extractJson, repairJson } from "../src/client";
describe("reparación de JSON", () => {
  it("recorta prosa, fences y cierra salida truncada", () => {
    expect(extractJson('Claro, aquí tienes:\n```json\n{"a":1,"b":[1,2,]}\n```\nListo.')).toEqual({ a: 1, b: [1, 2] });
    expect(extractJson('{"a":{"b":[1,2')).toEqual({ a: { b: [1, 2] } });
    expect(extractJson('{"a":"hola')).toEqual({ a: "hola" });
    expect(extractJson('We are given {"a": "x}"} and more {"z":1}')).toEqual({ a: "x}" });
    expect(extractJson('{“a”: 1}')).toEqual({ a: 1 });
  });
  it("sin JSON lanza", () => {
    expect(() => extractJson("We are giving you the answer in English")).toThrow();
    expect(repairJson("nada")).toBe("nada");
  });
});
