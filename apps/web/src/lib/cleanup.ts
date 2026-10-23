import fs from "node:fs/promises";
import path from "node:path";
import { eq, inArray } from "drizzle-orm";
import { schema, workflow as wf } from "@lamina/db";
import { getDb } from "./db";
import { env } from "./env";
import { purgeLogos } from "./branding";

export const presentationDir = (id: string) => path.join(env().DATA_DIR, "presentations", id);

/** Borra una presentación (BD en cascada) y sus archivos (subidas, capturas). */
export async function deletePresentationData(id: string, ownerId?: string) {
  if (ownerId) await wf.deleteIfIdle(getDb(), id, ownerId);
  else await getDb().delete(schema.presentations).where(eq(schema.presentations.id, id));
  await fs.rm(presentationDir(id), { recursive: true, force: true });
}

export async function deleteUserData(userId: string) {
  const db = getDb();
  const rows = await db.select({ id: schema.presentations.id }).from(schema.presentations).where(eq(schema.presentations.ownerId, userId));
  for (const r of rows) await fs.rm(presentationDir(r.id), { recursive: true, force: true });
  if (rows.length) await db.delete(schema.presentations).where(inArray(schema.presentations.id, rows.map((r) => r.id)));
  await purgeLogos("personal", userId).catch(() => {});
  await db.delete(schema.user).where(eq(schema.user.id, userId));
}
