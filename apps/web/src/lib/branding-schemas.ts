import { z } from "zod";

const optional = (max: number, label: string) =>
  z.string().trim().max(max, `${label}: máximo ${max} caracteres`).optional().transform((s) => (s ? s : null));

const Scale5 = z.number().int().min(1).max(5);
/** Perfil docente V3 (§5.9): todo opcional. `undefined` = no tocar lo ya guardado; `null` = borrar. */
export const ProfileV3 = z.object({
  subjects: z.array(z.string().trim().min(1).max(80)).max(10, "Máximo 10 materias").optional(),
  career: z.string().trim().max(160).nullable().optional(),
  faculty: z.string().trim().max(160).nullable().optional(),
  yearsTeaching: z.number().int().min(0).max(70).nullable().optional(),
  modality: z.enum(["presencial", "virtual", "hibrida"]).nullable().optional(),
  levels: z.array(z.enum(["grado", "posgrado", "tecnologico", "otro"])).max(4).optional(),
  techFamiliarity: Scale5.nullable().optional(),
  aiFamiliarity: Scale5.nullable().optional(),
  logoCorner: z.enum(["tl", "tr", "bl", "br", "none"]).nullable().optional(),
  logoWhich: z.enum(["institution", "personal", "both"]).nullable().optional(),
  /** Consentimiento de investigación: true = acepta (o mantiene), false = retira. undefined = no tocar. */
  researchConsent: z.boolean().optional(),
});
export type ProfileV3 = z.infer<typeof ProfileV3>;

export const ProfileInput = z.object({
  fullName: z.string().trim().min(3, "Escribe tu nombre completo (mínimo 3 caracteres)").max(120, "El nombre es demasiado largo (máximo 120 caracteres)"),
  institutionId: z.string().uuid("Institución no válida").nullable(),
}).extend(ProfileV3.shape);
export type ProfileInput = z.infer<typeof ProfileInput>;

/** Materia, período y grupo: opcionales; vacío = null (se omite en la carátula). */
export const MetaFields = z.object({
  subject: optional(160, "Materia"),
  period: optional(80, "Período"),
  group: optional(80, "Grupo"),
});
export type MetaFields = z.infer<typeof MetaFields>;

const Hex = z.string().trim().regex(/^#[0-9a-fA-F]{6}$/, "El color debe ser #RRGGBB");

export const InstitutionInput = z.object({
  name: z.string().trim().min(3, "Escribe el nombre de la institución").max(160),
  short: z.string().trim().min(1, "Escribe la sigla").max(24, "La sigla admite máximo 24 caracteres"),
  primaryColor: Hex.nullable(),
  secondaryColor: Hex.nullable(),
  active: z.boolean().default(true),
});
export type InstitutionInput = z.infer<typeof InstitutionInput>;

/** «Otra universidad»: la crea el docente; queda sin verificar y no se lista a otros hasta que un admin la verifique. */
export const OwnInstitutionInput = InstitutionInput.omit({ active: true });
export type OwnInstitutionInput = z.infer<typeof OwnInstitutionInput>;

export const slugify = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "institucion";
