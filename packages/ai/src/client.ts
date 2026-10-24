import { z, type ZodType } from "zod";
import { LaminaError } from "@lamina/contracts";
import { chainFor } from "./models";
import { assertFreeModel } from "./guard";
import { ProviderError, QuotaWaitError, type AiHooks, type ChatImage, type Provider, type Role } from "./types";

/** Limitador de ventana deslizante (OpenRouter free = 20 req/min por cuenta). */
export class RateLimiter {
  private stamps: number[] = [];
  constructor(private perMinute = 18, private now: () => number = Date.now, private sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms))) {}
  async acquire(maxWaitMs = 45_000) {
    const start = this.now();
    for (;;) {
      const t = this.now();
      this.stamps = this.stamps.filter((s) => t - s < 60_000);
      if (this.stamps.length < this.perMinute) { this.stamps.push(t); return true; }
      const wait = 60_000 - (t - this.stamps[0]!) + 50;
      if (t - start + wait > maxWaitMs) return false;
      await this.sleep(wait);
    }
  }
}

export type StructuredOpts<T> = {
  role: Role;
  task: string;
  schema: ZodType<T>;
  system: string;
  user: string;
  images?: ChatImage[];
  presentationId?: string;
  maxTokens?: number;
  temperature?: number;
  fakeContext?: unknown;
  signal?: AbortSignal;
  /** Validación semántica adicional; devuelve mensajes de error (vacío = ok). Se usa para la reparación acotada. */
  check?: (value: T) => string[];
};

/** Primer objeto/arreglo JSON equilibrado del texto (respeta cadenas y escapes). null si no hay o quedó abierto (salida truncada). */
function balancedSlice(t: string): string | null {
  const start = t.search(/[\[{]/);
  if (start < 0) return null;
  const stack: string[] = [];
  let inStr = false;
  let esc = false;
  for (let i = start; i < t.length; i++) {
    const c = t[i]!;
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === "{") stack.push("}");
    else if (c === "[") stack.push("]");
    else if (c === "}" || c === "]") {
      if (stack.pop() !== c) return null;
      if (!stack.length) return t.slice(start, i + 1);
    }
  }
  return null;
}

/** Quita comas finales y normaliza comillas tipográficas SOLO fuera de cadenas (una sola pasada, lineal). */
function tidyOutsideStrings(t: string): string {
  let out = "";
  let inStr = false;
  let smart = false; // la cadena se abrió con comilla tipográfica: se cierra con ” (o con ")
  let esc = false;
  for (let i = 0; i < t.length; i++) {
    let c = t[i]!;
    if (inStr) {
      if (esc) { esc = false; out += c; continue; }
      if (c === "\\") { esc = true; out += c; continue; }
      if (c === '"' || (smart && c === "\u201d")) { inStr = false; smart = false; out += '"'; continue; }
      out += c;
      continue;
    }
    if (c === "\u201c" || c === "\u201d") { smart = true; inStr = true; out += '"'; continue; }
    if (c === '"') { inStr = true; out += c; continue; }
    if (c === ",") {
      let j = i + 1;
      while (j < t.length && /\s/.test(t[j]!)) j++;
      if (t[j] === "}" || t[j] === "]") continue;
    }
    out += c;
  }
  return out;
}

/**
 * Extrae el JSON de la respuesta de un modelo: prosa alrededor, fences, comas finales y comillas tipográficas.
 * Un JSON ya válido NO se toca. Una salida truncada (estructura abierta) NO se «cierra»: lanza para que cuente como
 * respuesta inválida y se pida de nuevo (cerrarla aceptaría texto cortado a media frase como si estuviera completo).
 */
export function extractJson(text: string): unknown {
  let t = text.trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence && /[\[{]/.test(fence[1]!)) t = fence[1]!.trim();
  const slice = balancedSlice(t) ?? balancedSlice(text);
  if (!slice) throw new SyntaxError("sin un objeto JSON completo (¿respuesta truncada o en prosa?)");
  try { return JSON.parse(slice); } catch { /* se intenta ordenar fuera de cadenas */ }
  return JSON.parse(tidyOutsideStrings(slice));
}

export function schemaPrompt(schema: ZodType): string {
  const js = z.toJSONSchema(schema, { unrepresentable: "any", io: "input" }) as Record<string, unknown>;
  delete js.$schema;
  return JSON.stringify(js);
}

export class AiClient {
  private cooldown = new Map<string, number>();
  constructor(
    private deps: {
      provider: Provider;
      hooks: AiHooks;
      limiter?: RateLimiter;
      chains?: Partial<Record<Role, string[]>>;
      now?: () => number;
      /** Señal de aborto del trabajo en curso: si está abortada se corta SIN envenenar los cooldowns de los modelos. */
      abortSignal?: () => AbortSignal | undefined;
    },
  ) {}

  private now() { return this.deps.now?.() ?? Date.now(); }
  private throwIfAborted(o?: { signal?: AbortSignal }) {
    if (o?.signal?.aborted || this.deps.abortSignal?.()?.aborted) throw Object.assign(new Error("job abortado"), { name: "JobAbortedError" });
  }
  chain(role: Role) { return this.deps.chains?.[role] ?? chainFor(role); }

  async structured<T>(o: StructuredOpts<T>): Promise<T> {
    const chain = this.chain(o.role);
    chain.forEach(assertFreeModel);
    const limiter = this.deps.limiter;
    const fullSystem = `${o.system}\n\nResponde ÚNICAMENTE con un objeto JSON válido (sin texto adicional, sin Markdown) que cumpla este JSON Schema:\n${schemaPrompt(o.schema)}`;
    let earliest = Infinity;
    let lastErr = "";
    let tried = 0;
    let sawInvalid = false;

    for (const model of chain) {
      this.throwIfAborted(o);
      const cd = this.cooldown.get(model) ?? 0;
      if (cd > this.now()) { earliest = Math.min(earliest, cd); continue; }
      if (limiter && !(await limiter.acquire())) { earliest = Math.min(earliest, this.now() + 30_000); continue; }
      if (!(await this.deps.hooks.consumeBudget())) {
        const d = new Date(this.now());
        throw new QuotaWaitError("Presupuesto diario de IA agotado", new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1, 0, 5)));
      }
      tried++;
      let user = o.user;
      for (let attempt = 0; attempt < 2; attempt++) {
        const t0 = this.now();
        try {
          const r = await this.deps.provider.chat({
            role: o.role, task: o.task, model, system: fullSystem, user, json: true, images: o.images,
            maxTokens: o.maxTokens, temperature: o.temperature, signal: o.signal, fakeContext: o.fakeContext,
          });
          let parsed: T | undefined;
          let problems: string[] = [];
          try {
            const res = o.schema.safeParse(extractJson(r.text));
            if (res.success) {
              parsed = res.data;
              problems = o.check?.(parsed) ?? [];
            } else {
              problems = res.error.issues.slice(0, 8).map((i) => `${i.path.join(".") || "(raíz)"}: ${i.message}`);
            }
          } catch (e) {
            problems = [`JSON ilegible: ${(e as Error).message}`];
          }
          const ok = parsed !== undefined && problems.length === 0;
          await this.deps.hooks.onCall({
            role: o.role, model, presentationId: o.presentationId, latencyMs: this.now() - t0,
            promptTokens: r.promptTokens, completionTokens: r.completionTokens,
            result: ok ? "ok" : "invalid", error: ok ? (r.respondedModel && r.respondedModel !== model ? `resp:${r.respondedModel}` : undefined) : problems.join(" | ").slice(0, 400),
          });
          if (ok) return parsed as T;
          lastErr = problems.join("; ");
          sawInvalid = true;
          // Reparación acotada: una sola vez, con los errores concretos.
          user = `${o.user}\n\nTu respuesta anterior NO era válida. Corrige estos problemas y vuelve a responder el JSON completo:\n- ${problems.join("\n- ")}\n\nRespuesta anterior (recortada):\n${r.text.slice(0, 3000)}`;
          if (!(await this.deps.hooks.consumeBudget())) break;
        } catch (e) {
          if (e instanceof LaminaError) throw e;
          if (!(e instanceof ProviderError)) throw e;
          this.throwIfAborted(o); // el corte vino del job (expiración), no del modelo: no se registra ni se enfría
          await this.deps.hooks.onCall({
            role: o.role, model, presentationId: o.presentationId, latencyMs: this.now() - t0,
            result: e.kind === "rate" || e.kind === "quota" ? "quota" : "error", error: `${e.kind}: ${e.message}`.slice(0, 300),
          });
          lastErr = e.message;
          if (e.kind === "quota") throw new QuotaWaitError(e.message, e.resumeAt ?? new Date(this.now() + 3600_000));
          if (e.kind === "auth") throw new LaminaError("provider_failed", "Proveedor de IA rechazó las credenciales", 502);
          const wait = e.kind === "rate" ? e.retryAfterMs ?? 60_000 : 10 * 60_000;
          this.cooldown.set(model, this.now() + wait);
          earliest = Math.min(earliest, this.now() + wait);
          break; // siguiente modelo
        }
      }
    }
    if (!sawInvalid && earliest !== Infinity) throw new QuotaWaitError("Los modelos gratuitos están en espera por límite de uso o indisponibilidad", new Date(earliest));
    throw new LaminaError("provider_failed", `La IA no produjo una respuesta válida: ${lastErr}`.slice(0, 500), 502);
  }
}
