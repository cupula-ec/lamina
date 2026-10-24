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
  /** MCP v2 (flag v3_mcp2 del docente): herramientas incrementales sobre el workspace, imágenes y componentes propuestos. */
  v2?: boolean;
  /** Búsqueda e ingesta de imágenes (V3 §5.5); ausente = las herramientas de imágenes responden que no están disponibles. */
  images?: { providers: import("@lamina/research").ImageProvider[]; dataDir: string };
  /** Pone en cola la construcción de un componente propuesto por la IA externa. */
  enqueueComponent?: (payload: { presentationId: string; userId: string; requestId: string; purpose: string; suggestedName: string; provided: unknown }) => Promise<void>;
};
