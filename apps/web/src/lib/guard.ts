import { and, eq } from "drizzle-orm";
import { LaminaError } from "@lamina/contracts";
import { schema } from "@lamina/db";
import { getDb } from "./db";
import { requireUserApi, type SessionUser } from "./session";

export type Result<T = undefined> = { ok: true; data: T } | { ok: false; error: string; code?: string };

/** Envuelve una Server Action: autentica, convierte LaminaError en resultado y oculta errores internos. */
export async function act<T>(fn: (user: SessionUser) => Promise<T>): Promise<Result<T>> {
  try {
    const user = await requireUserApi();
    return { ok: true, data: await fn(user) };
  } catch (e) {
    if (e instanceof LaminaError) return { ok: false, error: e.message, code: e.code };
    console.error("[action]", e);
    return { ok: false, error: "Ocurrió un error inesperado. Inténtalo de nuevo." };
  }
}

/** Autorización por dueño en cada consulta: presentaciones ajenas son indistinguibles de inexistentes. */
export async function requireOwner(id: string, userId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new LaminaError("not_found", "Presentación no encontrada", 404);
  const [p] = await getDb().select().from(schema.presentations).where(and(eq(schema.presentations.id, id), eq(schema.presentations.ownerId, userId)));
  if (!p) throw new LaminaError("not_found", "Presentación no encontrada", 404);
  return p;
}
