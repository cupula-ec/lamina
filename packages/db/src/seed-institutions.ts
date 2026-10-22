import type { Db } from "./client";
import { institutions } from "./schema";

/**
 * Instituciones iniciales. El logo es un recurso empaquetado con la web (`apps/web/public/institutions/`),
 * referenciado como `builtin:<archivo>`; el administrador puede reemplazarlo desde el panel.
 * Fuente del logo y la paleta de UPS: https://www.ups.edu.ec (logoupscolor.svg; azul #003976, dorado #FCC000).
 */
export const SEED_INSTITUTIONS = [
  { slug: "ups", name: "Universidad Politécnica Salesiana", short: "UPS", logoPath: "builtin:ups.png", logoMime: "image/png", primaryColor: "#003976", secondaryColor: "#FCC000" },
] as const;

/** Idempotente: no sobrescribe lo que el administrador ya haya editado. */
export async function seedInstitutions(db: Db) {
  for (const i of SEED_INSTITUTIONS) await db.insert(institutions).values({ ...i }).onConflictDoNothing({ target: institutions.slug });
}
