import { describe, expect, it, vi } from "vitest";
import { AiClient, DEFAULT_CHAINS, OpenRouterProvider, VISION_TASK, VisionPage, chainFor, isFreeModel, visionSystem, type ChatRequest, type Provider } from "../src";

const hooks = () => { const calls: any[] = []; return { calls, h: { onCall: (r: any) => void calls.push(r), consumeBudget: () => true } }; };
const IMG = { mime: "image/png" as const, base64: "iVBORsecreto" };
const ok = () => new Response(JSON.stringify({ choices: [{ message: { content: "{}" } }] }), { status: 200, headers: { "content-type": "application/json" } });

describe("rol vision", () => {
  it("todos los modelos por defecto son :free y el guard aplica a las sobrescrituras", () => {
    expect(DEFAULT_CHAINS.vision.length).toBeGreaterThan(0);
    expect(DEFAULT_CHAINS.vision.every(isFreeModel)).toBe(true);
    expect(() => chainFor("vision", { LAMINA_MODELS_VISION: "openai/gpt-5" })).toThrow(/no es :free/);
    expect(chainFor("vision", { LAMINA_MODELS_VISION: "google/gemma-4-31b-it:free" })).toEqual(["google/gemma-4-31b-it:free"]);
  });

  it("el prompt está versionado y declara la imagen como no confiable", () => {
    expect(VISION_TASK).toMatch(/^ocr\.vision\.ocr-vision-v\d+$/);
    expect(visionSystem()).toMatch(/NO confiable/);
    expect(visionSystem()).toMatch(/\[ilegible\]/);
    expect(visionSystem()).toMatch(/KaTeX/);
  });

  it("el cliente reenvía la imagen al proveedor y no la registra en ai_calls", async () => {
    const seen: ChatRequest[] = [];
    const provider: Provider = { chat: async (r) => { seen.push(r); return { text: JSON.stringify({ text_md: "hola", formulas: [] }) }; } };
    const { calls, h } = hooks();
    const out = await new AiClient({ provider, hooks: h }).structured({ role: "vision", task: VISION_TASK, schema: VisionPage, system: visionSystem(), user: "pág 1", images: [IMG] });
    expect(out).toEqual({ text_md: "hola", formulas: [] });
    expect(seen[0]!.images).toEqual([IMG]);
    expect(seen[0]!.model).toMatch(/:free$/);
    expect(JSON.stringify(calls)).not.toMatch(/iVBORsecreto/);
  });

  it("OpenRouter recibe la imagen como image_url (data URL) y un modelo de pago se bloquea antes de enviar", async () => {
    const fetchMock = vi.fn(async (_u: any, _i: any) => ok());
    const p = new OpenRouterProvider("k", { fetch: fetchMock as any });
    await p.chat({ role: "vision", task: "t", model: "google/gemma-4-31b-it:free", system: "s", user: "u", json: true, images: [IMG] });
    const body = JSON.parse(fetchMock.mock.calls[0]![1].body);
    expect(body.messages[1].content).toEqual([{ type: "text", text: "u" }, { type: "image_url", image_url: { url: "data:image/png;base64,iVBORsecreto" } }]);
    await expect(p.chat({ role: "vision", task: "t", model: "openai/gpt-5", system: "s", user: "u", json: true, images: [IMG] })).rejects.toThrow(/no es :free/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("sin imágenes, el mensaje de usuario sigue siendo texto plano (roles existentes intactos)", async () => {
    const fetchMock = vi.fn(async (_u: any, _i: any) => ok());
    await new OpenRouterProvider("k", { fetch: fetchMock as any }).chat({ role: "content", task: "t", model: "google/gemma-4-31b-it:free", system: "s", user: "u", json: true });
    expect(JSON.parse(fetchMock.mock.calls[0]![1].body).messages[1]).toEqual({ role: "user", content: "u" });
  });

  it("la salida del modelo se valida con Zod (formulas por defecto vacías, texto acotado)", () => {
    expect(VisionPage.parse({ text_md: "x" }).formulas).toEqual([]);
    expect(VisionPage.safeParse({ text_md: "x".repeat(30_000) }).success).toBe(false);
    expect(VisionPage.safeParse({ text_md: "x", formulas: [{ latex: "" }] }).success).toBe(false);
  });
});
