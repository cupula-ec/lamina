import { z } from "zod";

const Env = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().url(),
  APP_URL: z.string().url().default("http://localhost:3100"),
  BETTER_AUTH_SECRET: z.string().min(32),
  /** Correos con rol admin (Keycloak). Separados por coma. */
  ADMIN_EMAILS: z.string().default("esteban.morocho@cupula.com.ec"),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  KEYCLOAK_ISSUER: z.string().url().default("https://auth.cupula.com.ec/realms/cupula"),
  KEYCLOAK_CLIENT_ID: z.string().optional(),
  KEYCLOAK_CLIENT_SECRET: z.string().optional(),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().default(2525),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  MAIL_FROM: z.string().default("Lámina <noreply@cupula.com.ec>"),
  /** Directorio de datos (subidas, capturas). */
  DATA_DIR: z.string().default("./data"),
  /** Token compartido web↔renderer para los endpoints /api/render/*. */
  RENDER_SERVICE_TOKEN: z.string().min(24).optional(),
  CHANGELOG_DIR: z.string().optional(),
  /** Búsqueda de imágenes para reemplazar una imagen desde el editor (V3 §5.5). Todo opcional. */
  SEARXNG_URL: z.string().url().optional(),
  UNSPLASH_ACCESS_KEY: z.string().optional(),
  PEXELS_API_KEY: z.string().optional(),
});
export type Env = z.infer<typeof Env>;

let cached: Env | undefined;
export function env(): Env {
  if (!cached) {
    const r = Env.safeParse(process.env);
    if (!r.success) throw new Error(`Configuración inválida: ${r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`);
    cached = r.data;
  }
  return cached;
}
export const adminEmails = () => env().ADMIN_EMAILS.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
