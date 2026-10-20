import { z } from "zod";

const E = z.object({
  DATABASE_URL: z.string().url(),
  DATA_DIR: z.string().default("./data"),
  LAMINA_AI_PROVIDER: z.enum(["openrouter", "fake"]).default("openrouter"),
  OPENROUTER_API_KEY: z.string().optional(),
  SEARXNG_URL: z.string().url().optional(),
  TAVILY_API_KEY: z.string().optional(),
  /** Presupuesto global diario de llamadas IA (≈ 80 % del cupo free verificado: 1000/día). */
  AI_DAILY_BUDGET: z.coerce.number().default(800),
  /** Servicio de renderizado (capturas/detección de problemas) y sandbox de componentes. */
  RENDERER_URL: z.string().url().optional(),
  RENDER_SERVICE_TOKEN: z.string().optional(),
  SANDBOX_URL: z.string().url().optional(),
  SANDBOX_TOKEN: z.string().optional(),
  APP_URL: z.string().url().default("http://localhost:3100"),
});
export type Env = z.infer<typeof E>;
export function loadEnv(): Env {
  const r = E.safeParse(process.env);
  if (!r.success) throw new Error(`Configuración del worker inválida: ${r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`);
  if (r.data.LAMINA_AI_PROVIDER === "openrouter" && !r.data.OPENROUTER_API_KEY) throw new Error("OPENROUTER_API_KEY requerido (o LAMINA_AI_PROVIDER=fake)");
  return r.data;
}
