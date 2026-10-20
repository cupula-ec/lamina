"use server";
import { headers } from "next/headers";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { schema } from "@lamina/db";
import { getAuth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { CONSENT_VERSION } from "@/lib/consent";

export type ActionResult = { ok: true } | { ok: false; error: string };

const Pw = z.object({ current: z.string().min(1), next: z.string().min(10, "La nueva contraseña debe tener al menos 10 caracteres").max(128) });

export async function changePasswordAction(input: { current: string; next: string }): Promise<ActionResult> {
  const u = await getSessionUser();
  if (!u) return { ok: false, error: "Tu sesión expiró. Vuelve a entrar." };
  const p = Pw.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0]!.message };
  if (p.data.current === p.data.next) return { ok: false, error: "La nueva contraseña debe ser distinta de la actual." };
  try {
    await getAuth().api.changePassword({ body: { currentPassword: p.data.current, newPassword: p.data.next, revokeOtherSessions: true }, headers: await headers() });
  } catch (e) {
    const msg = (e as { body?: { code?: string } })?.body?.code;
    return { ok: false, error: msg === "INVALID_PASSWORD" ? "La contraseña actual no es correcta." : "No se pudo cambiar la contraseña. Revisa los datos." };
  }
  await getDb().update(schema.userProfiles).set({ mustChangePassword: false }).where(eq(schema.userProfiles.userId, u.id));
  return { ok: true };
}

export async function giveConsentAction(): Promise<ActionResult> {
  const u = await getSessionUser();
  if (!u) return { ok: false, error: "Tu sesión expiró. Vuelve a entrar." };
  await getDb().update(schema.userProfiles).set({ consentAt: new Date(), consentVersion: CONSENT_VERSION }).where(eq(schema.userProfiles.userId, u.id));
  return { ok: true };
}

export async function markChangelogSeenAction(): Promise<void> {
  const u = await getSessionUser();
  if (!u) return;
  await getDb().update(schema.userProfiles).set({ changelogSeenAt: new Date() }).where(eq(schema.userProfiles.userId, u.id));
}

/** Eliminación de cuenta y de todos sus datos (cascada en BD; archivos se borran aparte). */
export async function deleteAccountAction(confirmEmail: string): Promise<ActionResult> {
  const u = await getSessionUser();
  if (!u) return { ok: false, error: "Tu sesión expiró." };
  if (confirmEmail.trim().toLowerCase() !== u.email.toLowerCase()) return { ok: false, error: "El correo no coincide." };
  const { deleteUserData } = await import("@/lib/cleanup");
  await deleteUserData(u.id);
  return { ok: true };
}
