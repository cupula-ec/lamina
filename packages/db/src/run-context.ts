import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Época de cancelación con la que arrancó un trabajo del worker/renderer. `lock()` rechaza toda escritura de un trabajo cuya
 * época ya no coincide con la de la presentación (se canceló mientras corría): así no puede pisar a un trabajo relanzado.
 */
export type RunStore = { presentationId: string; epoch: number };
export const runContext = new AsyncLocalStorage<RunStore>();
