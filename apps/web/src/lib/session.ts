import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { schema } from "@lamina/db";
import { LaminaError } from "@lamina/contracts";
import { getAuth } from "./auth";
import { getDb } from "./db";

export type SessionUser = { id: string; email: string; name: string; role: string; mustChangePassword: boolean; consentAt: Date | null; onboardedAt: Date | null; image?: string | null };

export async function getSessionUser(): Promise<SessionUser | null> {
  const s = await getAuth().api.getSession({ headers: await headers() });
  if (!s?.user) return null;
  const db = getDb();
  const [p] = await db.select().from(schema.userProfiles).where(eq(schema.userProfiles.userId, s.user.id));
  return {
    id: s.user.id, email: s.user.email, name: s.user.name, role: (s.user as { role?: string }).role ?? "teacher",
    mustChangePassword: p?.mustChangePassword ?? false, consentAt: p?.consentAt ?? null, onboardedAt: p?.onboardedAt ?? null, image: s.user.image,
  };
}

/** Páginas del docente: exige sesión, cambio de clave, consentimiento y onboarding (nombre e institución) hechos. */
export async function requireUser(opts: { allowPending?: boolean } = {}): Promise<SessionUser> {
  const u = await getSessionUser();
  if (!u) redirect("/login");
  if (!opts.allowPending) {
    if (u.mustChangePassword) redirect("/cambiar-clave");
    if (!u.consentAt) redirect("/consentimiento");
    if (!u.onboardedAt) redirect("/bienvenida");
  }
  return u;
}

export async function requireAdmin(): Promise<SessionUser> {
  const u = await requireUser();
  if (u.role !== "admin") redirect("/dashboard");
  return u;
}

/** Para Server Actions / route handlers: lanza LaminaError en lugar de redirigir. */
export async function requireUserApi(): Promise<SessionUser> {
  const u = await getSessionUser();
  if (!u) throw new LaminaError("unauthorized", "Inicia sesión para continuar", 401);
  if (u.mustChangePassword || !u.consentAt) throw new LaminaError("forbidden", "Completa tu primer ingreso (contraseña y consentimiento)", 403);
  return u;
}
export async function requireAdminApi(): Promise<SessionUser> {
  const u = await requireUserApi();
  if (u.role !== "admin") throw new LaminaError("forbidden", "Solo administradores", 403);
  return u;
}
