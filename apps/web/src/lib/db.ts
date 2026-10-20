import { createDb, type Db } from "@lamina/db";
import { env } from "./env";

const g = globalThis as unknown as { __laminaDb?: ReturnType<typeof createDb> };
export function getDb(): Db {
  if (!g.__laminaDb) g.__laminaDb = createDb(env().DATABASE_URL, 10);
  return g.__laminaDb.db;
}
