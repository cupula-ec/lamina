"use server";
import { revalidatePath } from "next/cache";
import { inArray } from "drizzle-orm";
import { z } from "zod";
import { LaminaError } from "@lamina/contracts";
import { FLAG_NAMES, schema, setFlag } from "@lamina/db";
import { getDb } from "@/lib/db";
import { type Result } from "@/lib/guard";
import { requireAdminApi } from "@/lib/session";

const Emails = z.string().max(4000).transform((s) => [...new Set(s.split(/[\s,;]+/).map((x) => x.trim().toLowerCase()).filter(Boolean))]).pipe(z.array(z.string().email()).max(200));
const Input = z.object({ name: z.enum(FLAG_NAMES), mode: z.enum(["off", "testers", "volunteers", "all"]), testers: Emails, volunteers: Emails });

/** Cambia un flag V3 (despliegue gradual: pruebas → voluntarios → todos; `off` lo apaga sin deploy). Solo administradores. */
export async function setFlagAction(input: unknown): Promise<Result<{ unknown: string[] }>> {
  try {
    await requireAdminApi();
    const v = Input.parse(input);
    const db = getDb();
    const emails = [...new Set([...v.testers, ...v.volunteers])];
    const rows = emails.length ? await db.select({ id: schema.user.id, email: schema.user.email }).from(schema.user).where(inArray(schema.user.email, emails)) : [];
    const id = new Map(rows.map((r) => [r.email.toLowerCase(), r.id]));
    const ids = (list: string[]) => list.flatMap((e) => (id.has(e) ? [id.get(e)!] : []));
    await setFlag(db, v.name, { mode: v.mode, testers: ids(v.testers), volunteers: ids(v.volunteers) });
    revalidatePath("/admin");
    return { ok: true, data: { unknown: emails.filter((e) => !id.has(e)) } };
  } catch (e) {
    if (e instanceof LaminaError) return { ok: false, error: e.message, code: e.code };
    if (e instanceof z.ZodError) return { ok: false, error: e.issues[0]?.message ?? "Datos inválidos" };
    console.error("[admin-flags]", e);
    return { ok: false, error: "Error inesperado" };
  }
}
