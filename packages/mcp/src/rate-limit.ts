import { McpToolError } from "./errors";

/** Ventana deslizante en memoria por clave (token). Una instancia del servidor; ver docs/known-limitations.md. */
export class RateLimiter {
  private hits = new Map<string, number[]>();
  constructor(private readonly max: number, private readonly windowMs = 60_000, private readonly now: () => number = Date.now) {}

  hit(key: string) {
    const t = this.now();
    const recent = (this.hits.get(key) ?? []).filter((x) => t - x < this.windowMs);
    if (recent.length >= this.max) {
      this.hits.set(key, recent);
      const retryAfterSeconds = Math.max(1, Math.ceil((this.windowMs - (t - recent[0]!)) / 1000));
      throw new McpToolError("rate_limited", `Demasiadas llamadas: máximo ${this.max} por minuto. Espera ${retryAfterSeconds} s y reintenta.`, { retryAfterSeconds });
    }
    recent.push(t);
    this.hits.set(key, recent);
    if (this.hits.size > 5000) for (const [k, v] of this.hits) if (!v.some((x) => t - x < this.windowMs)) this.hits.delete(k);
  }
}
