import { assertFreeModel, guardedFetch } from "./guard";
import { ProviderError, type ChatRequest, type ChatResult, type Provider } from "./types";

const nextUtcMidnight = () => {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1, 0, 5, 0));
};

export class OpenRouterProvider implements Provider {
  private f: typeof fetch;
  constructor(
    private apiKey: string,
    private opts: { baseUrl?: string; referer?: string; title?: string; fetch?: typeof fetch; timeoutMs?: number } = {},
  ) {
    this.f = guardedFetch(opts.fetch ?? fetch);
  }

  async chat(req: ChatRequest): Promise<ChatResult> {
    assertFreeModel(req.model);
    const body: Record<string, unknown> = {
      model: req.model,
      messages: [
        { role: "system", content: req.system },
        { role: "user", content: req.images?.length
          ? [{ type: "text", text: req.user }, ...req.images.map((i) => ({ type: "image_url", image_url: { url: `data:${i.mime};base64,${i.base64}` } }))]
          : req.user },
      ],
      temperature: req.temperature ?? 0.3,
      max_tokens: req.maxTokens ?? 6000,
    };
    if (req.json) body.response_format = { type: "json_object" };
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), this.opts.timeoutMs ?? 120_000);
    req.signal?.addEventListener("abort", () => ctrl.abort());
    let res: Response;
    try {
      res = await this.f(`${this.opts.baseUrl ?? "https://openrouter.ai/api/v1"}/chat/completions`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.apiKey}`,
          "content-type": "application/json",
          "http-referer": this.opts.referer ?? "https://lamina.cupula.com.ec",
          "x-title": this.opts.title ?? "Lamina",
        },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
    } catch (e) {
      if ((e as any)?.code === "model_not_free") throw e;
      throw new ProviderError("unavailable", `red/timeout: ${(e as Error).message}`);
    } finally {
      clearTimeout(timer);
    }
    const raw = await res.text();
    let json: any;
    try { json = JSON.parse(raw); } catch { json = undefined; }
    const msg: string = json?.error?.message ?? raw.slice(0, 300);
    if (!res.ok) {
      if (res.status === 429) {
        const reset = Number(res.headers.get("x-ratelimit-reset"));
        const ra = Number(res.headers.get("retry-after"));
        const daily = /per-day|per day|daily/i.test(msg) || /free-models-per-day/i.test(raw);
        if (daily) throw new ProviderError("quota", "Cupo diario de modelos gratuitos agotado", 429, undefined, nextUtcMidnight());
        const retryAfterMs = ra > 0 ? ra * 1000 : reset > Date.now() ? reset - Date.now() : 60_000;
        throw new ProviderError("rate", msg, 429, retryAfterMs);
      }
      if (res.status === 401 || res.status === 402 || res.status === 403) throw new ProviderError("auth", msg, res.status);
      if (res.status === 400 || res.status === 422) throw new ProviderError("bad_request", msg, res.status);
      throw new ProviderError("unavailable", msg, res.status);
    }
    const choice = json?.choices?.[0];
    // Proveedores gratuitos a veces devuelven 200 con error embebido.
    if (json?.error) throw new ProviderError(json.error.code === 429 ? "rate" : "unavailable", msg, json.error.code, 60_000);
    const text: string = choice?.message?.content ?? "";
    if (!text.trim()) throw new ProviderError("unavailable", "respuesta vacía", 200);
    return { text, promptTokens: json?.usage?.prompt_tokens, completionTokens: json?.usage?.completion_tokens, respondedModel: typeof json?.model === "string" ? json.model : undefined };
  }
}
