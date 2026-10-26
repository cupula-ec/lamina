import { createBoss, type Boss } from "@lamina/jobs";
import { env } from "./env";

const g = globalThis as unknown as { __laminaBoss?: Promise<Boss> };
export function getBoss(): Promise<Boss> {
  // Si el arranque falla no se cachea la promesa rechazada: el siguiente intento reconecta en vez de fallar hasta reiniciar.
  g.__laminaBoss ??= createBoss(env().DATABASE_URL).catch((e) => { g.__laminaBoss = undefined; throw e; });
  return g.__laminaBoss;
}
