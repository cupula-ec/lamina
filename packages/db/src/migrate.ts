import { migrate } from "drizzle-orm/node-postgres/migrator";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Db } from "./client";

export async function runMigrations(db: Db) {
  const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "../drizzle");
  await migrate(db, { migrationsFolder: dir });
}
