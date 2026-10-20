"use server";
import { randomBytes } from "node:crypto";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { LaminaError } from "@lamina/contracts";
import { QUOTA_KINDS, schema } from "@lamina/db";
import { adminCreate, getAuth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { sendWelcomeMail } from "@/lib/mail";
import { requireAdminApi } from "@/lib/session";
import type { Result } from "@/lib/guard";
import { deleteUserData } from "@/lib/cleanup";

async function adm<T>(fn: () => Promise<T>): Promise<Result<T>> {
  try { await requireAdminApi(); return { ok: true, data: await fn() }; }
  catch (e) {
    if (e instanceof LaminaError) return { ok: false, error: e.message, code: e.code };
    if (e instanceof z.ZodError) return { ok: false, error: e.issues[0]?.message ?? "Datos inválidos" };
    console.error("[admin]", e);
    return { ok: false, error: "Error inesperado" };
  }
}

const tempPassword = () => `${randomBytes(9).toString("base64url")}-${Math.floor(10 + Math.random() * 89)}`;

export async function createTeacherAction(input: { email: string; name: string }) {
  return adm(async () => {
    const v = z.object({ email: z.string().trim().toLowerCase().email("Correo inválido").max(200), name: z.string().trim().min(2, "Escribe el nombre").max(120) }).parse(input);
    const password = tempPassword();
    let userId: string;
    try {
      const res = await adminCreate.run({ allowed: true }, async () => getAuth().api.createUser({ body: { email: v.email, password, name: v.name, role: "teacher" as "admin" } }));
      userId = res.user.id;
    } catch (e) {
      if (/exist/i.test(String((e as Error).message) + JSON.stringify((e as { body?: unknown }).body ?? ""))) throw new LaminaError("invalid_input", "Ya existe una cuenta con ese correo", 409);
      throw e;
    }
    await getDb().insert(schema.userProfiles).values({ userId, mustChangePassword: true }).onConflictDoUpdate({ target: schema.userProfiles.userId, set: { mustChangePassword: true } });
    let mailed = true;
    try { const r = await sendWelcomeMail(v.email, v.name, password); if ((r as { dev?: boolean })?.dev) mailed = false; } catch (e) { mailed = false; console.error("[mail]", (e as Error).message); }
    revalidatePath("/admin");
    // Si el correo falló, el admin recibe la clave temporal para entregarla por otro medio (solo en este momento).
    return { mailed, tempPassword: mailed ? null : password };
  });
}

export async function resetTeacherPasswordAction(input: { userId: string }) {
  return adm(async () => {
    const [u] = await getDb().select().from(schema.user).where(eq(schema.user.id, z.string().parse(input.userId)));
    if (!u) throw new LaminaError("not_found", "Usuario no encontrado", 404);
    const password = tempPassword();
    await getAuth().api.setUserPassword({ body: { userId: u.id, newPassword: password }, headers: await headers() });
    await getAuth().api.revokeUserSessions({ body: { userId: u.id }, headers: await headers() });
    await getDb().update(schema.userProfiles).set({ mustChangePassword: true }).where(eq(schema.userProfiles.userId, u.id));
    let mailed = true;
    try { const r = await sendWelcomeMail(u.email, u.name, password); if ((r as { dev?: boolean })?.dev) mailed = false; } catch { mailed = false; }
    revalidatePath("/admin");
    return { mailed, tempPassword: mailed ? null : password };
  });
}

export async function banUserAction(input: { userId: string; ban: boolean }) {
  return adm(async () => {
    const id = z.string().parse(input.userId);
    if (input.ban) await getAuth().api.banUser({ body: { userId: id, banReason: "Bloqueado por un administrador" }, headers: await headers() });
    else await getAuth().api.unbanUser({ body: { userId: id }, headers: await headers() });
    revalidatePath("/admin");
  });
}

export async function setQuotaAction(input: { userId: string; kind: string; limit: number | null }) {
  return adm(async () => {
    const kind = z.enum(QUOTA_KINDS).parse(input.kind);
    const [p] = await getDb().select().from(schema.userProfiles).where(eq(schema.userProfiles.userId, input.userId));
    if (!p) throw new LaminaError("not_found", "Usuario no encontrado", 404);
    const q = { ...p.quotaOverrides };
    if (input.limit === null) delete q[kind]; else q[kind] = z.number().int().min(0).max(1000).parse(input.limit);
    await getDb().update(schema.userProfiles).set({ quotaOverrides: q }).where(eq(schema.userProfiles.userId, input.userId));
    revalidatePath("/admin");
  });
}

export async function deleteUserAction(input: { userId: string; confirmEmail: string }) {
  return adm(async () => {
    const [u] = await getDb().select().from(schema.user).where(eq(schema.user.id, input.userId));
    if (!u || u.email !== input.confirmEmail.trim().toLowerCase()) throw new LaminaError("invalid_input", "El correo de confirmación no coincide", 400);
    if (u.role === "admin") throw new LaminaError("forbidden", "No se puede eliminar a un administrador desde aquí", 403);
    await deleteUserData(u.id);
    revalidatePath("/admin");
  });
}
