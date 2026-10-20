import { assertFreeModel } from "./guard";
import type { Role } from "./types";

/**
 * Cadena de fallback por rol (modelos `:free` de OpenRouter verificados el 19 oct 2026, ver ADR-001).
 * Se puede sobrescribir con LAMINA_MODELS_<ROL>=id1,id2,…
 */
export const DEFAULT_CHAINS: Record<Role, string[]> = {
  research: ["google/gemma-4-26b-a4b-it:free", "nvidia/nemotron-3-super-120b-a12b:free", "minimax/minimax-m3.1-flash:free"],
  content: ["nvidia/nemotron-3-super-120b-a12b:free", "google/gemma-4-31b-it:free", "minimax/minimax-m3.1-flash:free", "nvidia/nemotron-3-ultra-550b-a55b:free"],
  design: ["google/gemma-4-31b-it:free", "nvidia/nemotron-3-super-120b-a12b:free", "minimax/minimax-m3.1-flash:free", "nvidia/nemotron-3-ultra-550b-a55b:free"],
  component: ["nvidia/nemotron-3-super-120b-a12b:free", "poolside/laguna-s-2.1:free", "cohere/north-mini-code:free", "nvidia/nemotron-3-ultra-550b-a55b:free"],
  review: ["google/gemma-4-26b-a4b-it:free", "nvidia/nemotron-3-super-120b-a12b:free"],
};

export function chainFor(role: Role, env: Record<string, string | undefined> = process.env): string[] {
  const raw = env[`LAMINA_MODELS_${role.toUpperCase()}`];
  const chain = raw ? raw.split(",").map((s) => s.trim()).filter(Boolean) : DEFAULT_CHAINS[role];
  chain.forEach(assertFreeModel);
  return chain;
}
