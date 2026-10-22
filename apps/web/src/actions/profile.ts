"use server";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { LaminaError } from "@lamina/contracts";
import { schema } from "@lamina/db";
import { getAuth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import type { Result } from "@/lib/guard";
import { ProfileInput } from "@/lib/branding-schemas";

async function save(input: unknown, markOnboarded: boolean): Promise<Result> {
  try {
    const u = await getSessionUser();
    if (!u) return { ok: false, error: "Tu sesión expiró. Vuelve a entrar." };
    if (u.mustChangePassword || !u.consentAt) return { ok: false, error: "Completa primero la contraseña y el consentimiento." };
    const v = ProfileInput.safeParse(input);
    if (!v.success) return { ok: false, error: v.error.issues[0]!.message };
    const db = getDb();
    if (v.data.institutionId) {
      const [i] = await db.select({ id: schema.institutions.id, active: schema.institutions.active }).from(schema.institutions).where(eq(schema.institutions.id, v.data.institutionId));
      const [cur] = await db.select({ id: schema.userProfiles.institutionId }).from(schema.userProfiles).where(eq(schema.userProfiles.userId, u.id));
      if (!i || (!i.active && cur?.id !== i.id)) throw new LaminaError("invalid_input", "Esa institución no está disponible.", 400);
    }
    const set = { fullName: v.data.fullName, institutionId: v.data.institutionId, ...(markOnboarded && !u.onboardedAt ? { onboardedAt: new Date() } : {}) };
    await db.insert(schema.userProfiles).values({ userId: u.id, ...set }).onConflictDoUpdate({ target: schema.userProfiles.userId, set });
    // user.name alimenta el autor de las presentaciones; se sincroniza vía Better Auth para refrescar la sesión.
    if (v.data.fullName !== u.name) await getAuth().api.updateUser({ body: { name: v.data.fullName }, headers: await headers() });
    revalidatePath("/", "layout");
    return { ok: true, data: undefined };
  } catch (e) {
    if (e instanceof LaminaError) return { ok: false, error: e.message, code: e.code };
    console.error("[profile]", e);
    return { ok: false, error: "No se pudo guardar. Inténtalo de nuevo." };
  }
}

/** Onboarding: guarda nombre e institución y lo marca como hecho. */
export async function completeOnboardingAction(input: ProfileInput): Promise<Result> { return save(input, true); }
/** Edición posterior desde /cuenta. */
export async function saveProfileAction(input: ProfileInput): Promise<Result> { return save(input, true); }
