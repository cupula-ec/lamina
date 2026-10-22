import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { Branding } from "@lamina/contracts";
import type { Db } from "./client";
import { institutions, user, userProfiles } from "./schema";

const ver = (path: string) => createHash("sha1").update(path).digest("hex").slice(0, 8);
const HEX = /^#[0-9a-fA-F]{6}$/;

/** URL interna (nunca de disco) del logo de una institución; la versión cambia al reemplazar el archivo. */
export const institutionLogoUrl = (i: { id: string; logoPath: string | null }) => (i.logoPath ? `/api/branding/institution/${i.id}?v=${ver(i.logoPath)}` : undefined);
export const personalLogoUrl = (userId: string, logoPath: string | null) => (logoPath ? `/api/branding/personal/${userId}?v=${ver(logoPath)}` : undefined);

const clean = (s: string | null | undefined) => (s?.trim() ? s.trim() : undefined);

/** Normaliza un campo opcional de texto: vacío → null. */
export const optionalText = (s: string | null | undefined) => clean(s) ?? null;

/**
 * Marca institucional + datos del docente para `deck.meta.branding`. Todo opcional: lo vacío se omite.
 * Una institución desactivada deja de ofrecerse en los listados, pero se respeta para quien ya la tiene.
 */
export async function buildBranding(db: Db, pres: { ownerId: string; subject?: string | null; period?: string | null; groupName?: string | null }): Promise<Branding> {
  const [row] = await db.select({ u: user, p: userProfiles, i: institutions }).from(user)
    .leftJoin(userProfiles, eq(userProfiles.userId, user.id))
    .leftJoin(institutions, eq(institutions.id, userProfiles.institutionId))
    .where(eq(user.id, pres.ownerId));
  const inst = row?.i;
  const logoUrl = inst ? institutionLogoUrl(inst) : undefined;
  const out: Branding = {
    ...(inst ? {
      institution: {
        name: inst.name, short: inst.short, ...(logoUrl ? { logoUrl } : {}),
        ...(inst.primaryColor && HEX.test(inst.primaryColor) ? { colors: { primary: inst.primaryColor, ...(inst.secondaryColor && HEX.test(inst.secondaryColor) ? { secondary: inst.secondaryColor } : {}) } } : {}),
        ...(inst.fontId ? { fontId: inst.fontId } : {}),
      },
    } : {}),
    ...(row?.p?.personalLogoPath ? { personalLogoUrl: personalLogoUrl(pres.ownerId, row.p.personalLogoPath) } : {}),
    ...(clean(row?.p?.fullName ?? row?.u.name) ? { teacher: clean(row?.p?.fullName ?? row?.u.name)!.slice(0, 160) } : {}),
    ...(clean(pres.subject) ? { subject: clean(pres.subject)!.slice(0, 160) } : {}),
    ...(clean(pres.period) ? { period: clean(pres.period)!.slice(0, 80) } : {}),
    ...(clean(pres.groupName) ? { group: clean(pres.groupName)!.slice(0, 80) } : {}),
  };
  return Branding.parse(out);
}
