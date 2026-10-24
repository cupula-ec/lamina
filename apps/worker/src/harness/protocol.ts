import { z } from "zod";
import { ComponentRef, Slide } from "@lamina/contracts";

/**
 * Protocolo del harness (V3 §5.2). OpenRouter con modelos free no tiene tool-calling nativo: en cada turno el modelo devuelve
 * `{ "thought"?: string, "action": { "tool": "<nombre>", "args": {...} } }` y se valida con una unión discriminada por herramienta.
 */
const Slot = z.string().min(1).max(40);
const SlideId = z.string().min(1).max(64);

export const TOOL_ARGS = {
  read_slide: z.object({ id: SlideId.optional() }),
  read_content_section: z.object({ hintId: z.string().min(1).max(64).optional() }),
  list_components: z.object({ area: z.string().max(20).optional() }),
  edit_slot: z.object({ slot: Slot, component: ComponentRef.optional(), props: z.record(z.string(), z.unknown()).optional(), unset: z.array(z.string().max(80)).max(40).optional() })
    .refine((a) => a.component || a.props || a.unset, { message: "indica component (sustituye el componente) o props/unset (cambia solo esas props)" }),
  remove_slot: z.object({ slot: Slot }),
  replace_slide: z.object({ slide: Slide }),
  set_build: z.object({ steps: z.array(z.object({ reveal: z.array(z.string()).min(1) })).max(16) }),
  search_images: z.object({ query: z.string().min(2).max(160) }),
  use_image: z.object({ resultId: z.string().min(1).max(200), slot: Slot, alt: z.string().min(1).max(300) }),
  validate: z.object({}),
  done: z.object({ summary: z.string().max(400).default("") }),
} as const;
export type ToolName = keyof typeof TOOL_ARGS;
export const TOOL_NAMES = Object.keys(TOOL_ARGS) as ToolName[];

/** Unión discriminada por herramienta (la forma exacta que se le pide al modelo). */
export const Action = z.object({
  thought: z.string().max(600).optional(),
  action: z.discriminatedUnion("tool", (Object.entries(TOOL_ARGS) as [ToolName, z.ZodType][]).map(([tool, args]) => z.object({ tool: z.literal(tool), args })) as unknown as [z.ZodObject<{ tool: z.ZodLiteral<ToolName>; args: z.ZodType }>, ...z.ZodObject<{ tool: z.ZodLiteral<ToolName>; args: z.ZodType }>[]]),
});
export type ActionT = z.infer<typeof Action>;

export const TOOL_DOC = `HERRAMIENTAS (una por turno):
- read_slide {id?}: JSON de la diapositiva (por defecto la tuya), sus problemas de render y un resumen de las vecinas.
- read_content_section {hintId?}: bloques de contenido aprobado de esta diapositiva (la fuente de verdad: no inventes datos).
- list_components {area?}: catálogo resumido de componentes (id, versión, propósito, slots donde encaja).
- edit_slot {slot, component?, props?, unset?}: sustituye el componente del slot (component = {componentId, version, props}) o cambia solo algunas props (props/unset).
- remove_slot {slot}: vacía un slot opcional.
- replace_slide {slide}: reemplaza la diapositiva completa (mismo id). Úsalo solo si cambias de layout.
- set_build {steps}: pasos de aparición progresiva [{reveal:[slots]}].
- search_images {query} / use_image {resultId, slot, alt}: busca imágenes y coloca una en el slot (como componente Image).
- validate {}: comprueba la diapositiva con el catálogo y las fórmulas del contenido SIN cerrar.
- done {summary}: cierra y aplica los cambios (solo si validate pasó).`;
