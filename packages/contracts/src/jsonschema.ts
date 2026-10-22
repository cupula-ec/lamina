import { z } from "zod";
import { ContentDraft } from "./content";
import { DeckDocument } from "./deck";

const toJson = (schema: z.ZodType): Record<string, unknown> => {
  const js = z.toJSONSchema(schema, { unrepresentable: "any", io: "input" }) as Record<string, unknown>;
  delete js.$schema;
  return js;
};

/** JSON Schema del borrador de contenido (para clientes externos, p. ej. MCP). */
export const contentDraftJsonSchema = () => toJson(ContentDraft);
/** JSON Schema del deck declarativo. Las reglas cruzadas (slots por layout, ids únicos) las valida el servidor. */
export const deckJsonSchema = () => toJson(DeckDocument);
