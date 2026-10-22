import { z } from "zod";

const optional = (max: number, label: string) =>
  z.string().trim().max(max, `${label}: máximo ${max} caracteres`).optional().transform((s) => (s ? s : null));

export const ProfileInput = z.object({
  fullName: z.string().trim().min(3, "Escribe tu nombre completo (mínimo 3 caracteres)").max(120, "El nombre es demasiado largo (máximo 120 caracteres)"),
  institutionId: z.string().uuid("Institución no válida").nullable(),
});
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

export const slugify = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "institucion";
