import { personalLogoUrl, schema } from "@lamina/db";
import type { ProfileInitial } from "./profile-form";

/** Valores iniciales del formulario de perfil a partir de la fila (null = sin perfil todavía). */
export function profileInitial(u: { id: string; name: string }, p: typeof schema.userProfiles.$inferSelect | undefined): ProfileInitial {
  return {
    fullName: p?.fullName ?? u.name, institutionId: p?.institutionId ?? null, logoUrl: personalLogoUrl(u.id, p?.personalLogoPath ?? null) ?? null,
    subjects: p?.subjects ?? [], career: p?.career, faculty: p?.faculty, yearsTeaching: p?.yearsTeaching, modality: p?.modality, levels: p?.levels ?? [],
    techFamiliarity: p?.techFamiliarity, aiFamiliarity: p?.aiFamiliarity, logoCorner: p?.logoCorner, logoWhich: p?.logoWhich,
    researchConsent: !!p?.researchConsentAt && !p?.researchConsentWithdrawnAt,
  };
}
