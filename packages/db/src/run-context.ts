import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Época de cancelación con la que arrancó un trabajo del worker/renderer. `lock()` rechaza toda escritura de un trabajo cuya
 * época ya no coincide con la de la presentación (se canceló mientras corría): así no puede pisar a un trabajo relanzado.
 */
export type RunStore = { presentationId: string; epoch: number; /** Se aborta cuando pg-boss expira el handler: el trabajo debe soltar todo y no seguir en segundo plano. */ signal?: AbortSignal };
export const runContext = new AsyncLocalStorage<RunStore>();

/** Señal de aborto del job en curso (si la hay). */
export const runSignal = (): AbortSignal | undefined => runContext.getStore()?.signal;
/** Lanza si el job fue abortado (expiración/cierre): se llama entre unidades de trabajo para no dejar handlers zombis. */
export function throwIfAborted() {
  const s = runSignal();
  if (s?.aborted) throw Object.assign(new Error("job abortado"), { name: "JobAbortedError" });
}
