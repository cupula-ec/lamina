"use server";
import { revalidatePath } from "next/cache";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { LaminaError } from "@lamina/contracts";
import { schema } from "@lamina/db";
import { getDb } from "@/lib/db";
import { requireAdminApi } from "@/lib/session";
import type { Result } from "@/lib/guard";
import { InstitutionInput, slugify } from "@/lib/branding-schemas";
import { purgeLogos } from "@/lib/branding";

async function adm<T>(fn: () => Promise<T>): Promise<Result<T>> {
  try { await requireAdminApi(); const data = await fn(); revalidatePath("/admin/instituciones"); return { ok: true, data }; }
  catch (e) {
    if (e instanceof LaminaError) return { ok: false, error: e.message, code: e.code };
    if (e instanceof z.ZodError) return { ok: false, error: e.issues[0]?.message ?? "Datos inválidos" };
    console.error("[institutions]", e);
    return { ok: false, error: "Error inesperado" };
  }
}

const Id = z.string().uuid();

async function uniqueSlug(base: string) {
  const db = getDb();
  for (let n = 0; n < 50; n++) {
    const slug = n === 0 ? base : `${base}-${n + 1}`;
    const [x] = await db.select({ id: schema.institutions.id }).from(schema.institutions).where(eq(schema.institutions.slug, slug));
    if (!x) return slug;
  }
  throw new LaminaError("invalid_transition", "No se pudo generar un identificador único", 409);
}

export async function createInstitutionAction(input: InstitutionInput) {
  return adm(async () => {
    const v = InstitutionInput.parse(input);
    const [row] = await getDb().insert(schema.institutions).values({ slug: await uniqueSlug(slugify(v.short)), name: v.name, short: v.short, primaryColor: v.primaryColor, secondaryColor: v.secondaryColor, active: v.active }).returning({ id: schema.institutions.id });
    return { id: row!.id };
  });
}

export async function updateInstitutionAction(input: { id: string } & InstitutionInput) {
  return adm(async () => {
    const id = Id.parse(input.id);
    const v = InstitutionInput.parse(input);
    const r = await getDb().update(schema.institutions).set({ name: v.name, short: v.short, primaryColor: v.primaryColor, secondaryColor: v.secondaryColor, active: v.active, updatedAt: new Date() }).where(eq(schema.institutions.id, id)).returning({ id: schema.institutions.id });
    if (!r.length) throw new LaminaError("not_found", "Institución no encontrada", 404);
  });
}

export async function setInstitutionActiveAction(input: { id: string; active: boolean }) {
  return adm(async () => {
    const r = await getDb().update(schema.institutions).set({ active: z.boolean().parse(input.active), updatedAt: new Date() }).where(eq(schema.institutions.id, Id.parse(input.id))).returning({ id: schema.institutions.id });
    if (!r.length) throw new LaminaError("not_found", "Institución no encontrada", 404);
  });
}

/** No se borra una institución con docentes asignados: se desactiva. */
export async function deleteInstitutionAction(input: { id: string }) {
  return adm(async () => {
    const id = Id.parse(input.id);
    const db = getDb();
    const [{ n } = { n: 0 }] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.userProfiles).where(eq(schema.userProfiles.institutionId, id));
    if (n > 0) throw new LaminaError("invalid_transition", `Hay ${n} docente(s) con esta institución. Desactívala en lugar de borrarla.`, 409);
    const [row] = await db.delete(schema.institutions).where(eq(schema.institutions.id, id)).returning({ logoPath: schema.institutions.logoPath });
    if (!row) throw new LaminaError("not_found", "Institución no encontrada", 404);
    await purgeLogos("institution", id);
  });
}
