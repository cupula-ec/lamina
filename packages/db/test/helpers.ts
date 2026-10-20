import { createDb, runMigrations, schema } from "../src";
import { sql } from "drizzle-orm";

export const TEST_URL = process.env.TEST_DATABASE_URL ?? "postgres://lamina:lamina@127.0.0.1:55432/lamina_test";

export async function testDb() {
  const admin = createDb(TEST_URL.replace(/\/[^/]+$/, "/postgres"), 1);
  await admin.pool.query("drop database if exists lamina_test with (force)");
  await admin.pool.query("create database lamina_test");
  await admin.pool.end();
  const h = createDb(TEST_URL, 4);
  await runMigrations(h.db);
  return h;
}

let n = 0;
export async function mkUser(db: ReturnType<typeof createDb>["db"]) {
  const id = `u${++n}`;
  await db.insert(schema.user).values({ id, name: id, email: `${id}@t.test` });
  return id;
}
export const _sql = sql;
