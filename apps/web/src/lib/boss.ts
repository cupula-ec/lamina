import { createBoss, type Boss } from "@lamina/jobs";
import { env } from "./env";

const g = globalThis as unknown as { __laminaBoss?: Promise<Boss> };
export function getBoss(): Promise<Boss> {
  g.__laminaBoss ??= createBoss(env().DATABASE_URL);
  return g.__laminaBoss;
}
