import type { Db } from "@lamina/db";
import type { RateLimiter } from "./rate-limit";

export const MCP_SCOPES = ["presentations:read", "presentations:write"] as const;
export type McpScope = (typeof MCP_SCOPES)[number];

/** Quién llama: el docente que autorizó, a través de qué cliente y con qué permisos. */
export type McpPrincipal = { userId: string; clientId: string; scopes: string[] };

export type McpDeps = {
  db: Db;
  /** URL pública de la app (para los enlaces que se devuelven a la IA). */
  appUrl: string;
  /** Encola el render de una versión del deck (el renderer detecta problemas). */
  enqueueRender: (presentationId: string, deckVersionId: string) => Promise<void>;
  limiter?: RateLimiter;
};
