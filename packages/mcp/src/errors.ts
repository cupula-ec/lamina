import { LaminaError } from "@lamina/contracts";

/** Error de herramienta con código estable y mensaje accionable en español (la IA externa lo lee y corrige). */
export class McpToolError extends Error {
  constructor(public readonly code: string, message: string, public readonly details?: unknown) {
    super(message);
    this.name = "McpToolError";
  }
}

export function toToolError(e: unknown): McpToolError {
  if (e instanceof McpToolError) return e;
  if (e instanceof LaminaError) return new McpToolError(e.code, e.message, e.details);
  console.error("[mcp]", e);
  return new McpToolError("internal", "Error interno de Lámina. Inténtalo de nuevo en unos minutos.");
}
