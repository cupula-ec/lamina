"use server";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { and, eq, or } from "drizzle-orm";
import { LaminaError } from "@lamina/contracts";
import { schema } from "@lamina/db";
import { getAuth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import type { Result } from "@/lib/guard";
import { OwnInstitutionInput, ProfileInput, slugify } from "@/lib/branding-schemas";
import { RESEARCH_CONSENT_VERSION } from "@/lib/consent";

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
      const [vis] = await db.select({ ok: schema.institutions.id }).from(schema.institutions).where(and(eq(schema.institutions.id, v.data.institutionId), or(eq(schema.institutions.verified, true), eq(schema.institutions.createdBy, u.id))));
      if (!i || (!i.active && cur?.id !== i.id) || (!vis && cur?.id !== i.id)) throw new LaminaError("invalid_input", "Esa institución no está disponible.", 400);
    }
    const d = v.data;
    const [prev] = await db.select({ at: schema.userProfiles.researchConsentAt, w: schema.userProfiles.researchConsentWithdrawnAt }).from(schema.userProfiles).where(eq(schema.userProfiles.userId, u.id));
    const consentPatch = d.researchConsent === undefined ? {}
      : d.researchConsent ? (prev?.at && !prev.w ? {} : { researchConsentAt: new Date(), researchConsentVersion: RESEARCH_CONSENT_VERSION, researchConsentWithdrawnAt: null })
      : (prev?.at && !prev.w ? { researchConsentWithdrawnAt: new Date() } : {});
    const clean = (x: string | null | undefined) => (x === undefined ? undefined : x?.trim() ? x.trim() : null);
    const set = {
      fullName: d.fullName, institutionId: d.institutionId, ...(markOnboarded && !u.onboardedAt ? { onboardedAt: new Date() } : {}),
      ...(d.subjects !== undefined ? { subjects: d.subjects.length ? d.subjects : null } : {}),
      ...(d.career !== undefined ? { career: clean(d.career) } : {}), ...(d.faculty !== undefined ? { faculty: clean(d.faculty) } : {}),
      ...(d.yearsTeaching !== undefined ? { yearsTeaching: d.yearsTeaching } : {}), ...(d.modality !== undefined ? { modality: d.modality } : {}),
      ...(d.levels !== undefined ? { levels: d.levels.length ? d.levels : null } : {}),
      ...(d.techFamiliarity !== undefined ? { techFamiliarity: d.techFamiliarity } : {}), ...(d.aiFamiliarity !== undefined ? { aiFamiliarity: d.aiFamiliarity } : {}),
      ...(d.logoCorner !== undefined ? { logoCorner: d.logoCorner } : {}), ...(d.logoWhich !== undefined ? { logoWhich: d.logoWhich } : {}),
      ...consentPatch,
    };
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

/** «Otra universidad»: el docente crea (o corrige) su institución. Queda sin verificar: solo la ve él hasta que un admin la verifique. */
export async function createOwnInstitutionAction(input: OwnInstitutionInput): Promise<Result<{ id: string }>> {
  try {
    const u = await getSessionUser();
    if (!u) return { ok: false, error: "Tu sesión expiró. Vuelve a entrar." };
    if (u.mustChangePassword || !u.consentAt) return { ok: false, error: "Completa primero la contraseña y el consentimiento." };
    const v = OwnInstitutionInput.safeParse(input);
    if (!v.success) return { ok: false, error: v.error.issues[0]!.message };
    const db = getDb();
    const [mine] = await db.select().from(schema.institutions).where(and(eq(schema.institutions.createdBy, u.id), eq(schema.institutions.verified, false)));
    let id: string;
    if (mine) {
      await db.update(schema.institutions).set({ name: v.data.name, short: v.data.short, primaryColor: v.data.primaryColor, secondaryColor: v.data.secondaryColor, updatedAt: new Date() }).where(eq(schema.institutions.id, mine.id));
      id = mine.id;
    } else {
      const base = slugify(v.data.short);
      let slug = base;
      for (let n = 2; n < 60; n++) {
        const [x] = await db.select({ id: schema.institutions.id }).from(schema.institutions).where(eq(schema.institutions.slug, slug));
        if (!x) break;
        slug = `${base}-${n}`;
      }
      const [row] = await db.insert(schema.institutions).values({ slug, name: v.data.name, short: v.data.short, primaryColor: v.data.primaryColor, secondaryColor: v.data.secondaryColor, active: true, createdBy: u.id, verified: false }).returning({ id: schema.institutions.id });
      id = row!.id;
    }
    await db.insert(schema.userProfiles).values({ userId: u.id, institutionId: id }).onConflictDoUpdate({ target: schema.userProfiles.userId, set: { institutionId: id } });
    revalidatePath("/", "layout");
    return { ok: true, data: { id } };
  } catch (e) {
    console.error("[own-institution]", e);
    return { ok: false, error: "No se pudo crear la institución. Inténtalo de nuevo." };
  }
}
