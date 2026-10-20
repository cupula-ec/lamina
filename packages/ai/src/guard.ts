import { LaminaError } from "@lamina/contracts";

const FREE_RE = /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+(?:-[A-Za-z0-9._]+)*:free$/;

/** Guard duro: gasto IA = 0 USD. Solo se aceptan ids que terminen en ":free". */
export function isFreeModel(id: string): boolean {
  return typeof id === "string" && id.length < 120 && FREE_RE.test(id);
}
export function assertFreeModel(id: string): void {
  if (!isFreeModel(id)) throw new LaminaError("model_not_free", `Modelo rechazado (no es :free): ${String(id).slice(0, 80)}`, 500);
}

/** fetch envuelto que inspecciona el cuerpo de cada petición a OpenRouter antes de enviarla. */
export function guardedFetch(inner: typeof fetch = fetch): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.includes("openrouter.ai") && /\/chat\/completions|\/completions|\/responses/.test(url)) {
      let body: any;
      try {
        body = typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
      } catch {
        throw new LaminaError("model_not_free", "Cuerpo de petición ilegible: bloqueado por el guard :free", 500);
      }
      if (!body) throw new LaminaError("model_not_free", "Petición sin cuerpo: bloqueada por el guard :free", 500);
      assertFreeModel(body.model);
      if (body.models !== undefined || body.route !== undefined || body.plugins !== undefined)
        throw new LaminaError("model_not_free", "Parámetros de enrutado/plugins no permitidos (podrían generar coste)", 500);
    }
    return inner(input as any, init);
  }) as typeof fetch;
}
