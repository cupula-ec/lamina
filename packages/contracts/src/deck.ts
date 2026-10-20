import { z } from "zod";
import { LAYOUT_IDS, LAYOUTS, type LayoutId } from "./layouts";

/** DeckDocument v1: declarativo. Sin HTML ni scripts; texto = Markdown que se sanea al renderizar. */
export const DECK_SCHEMA_VERSION = 1 as const;
export const ENGINE_VERSION = "1.0.0";

export const ComponentRef = z.object({
  componentId: z.string().min(1).max(64).regex(/^[A-Za-z][A-Za-z0-9_-]*$/),
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  props: z.record(z.string(), z.unknown()),
});
export type ComponentRef = z.infer<typeof ComponentRef>;

export const Transition = z.enum(["none", "fade", "slide", "zoom"]);
export type Transition = z.infer<typeof Transition>;

export const Build = z.object({
  /** Cada paso revela los slots indicados; los slots que no aparecen en ningún paso son visibles desde el inicio. */
  steps: z.array(z.object({ reveal: z.array(z.string()).min(1) })).max(8).default([]),
});
export type Build = z.infer<typeof Build>;

/** Ajuste manual de un slot (edición posterior a la aprobación). */
export const SlotAdjust = z.object({
  x: z.number().int().min(0).max(1920).optional(),
  y: z.number().int().min(0).max(1080).optional(),
  w: z.number().int().min(160).max(1920).optional(),
  h: z.number().int().min(120).max(1080).optional(),
  /** Escala del contenido del slot (0.5 = mitad, 1.5 = +50 %). */
  fontScale: z.number().min(0.5).max(1.5).optional(),
});
export type SlotAdjust = z.infer<typeof SlotAdjust>;

export const Slide = z.object({
  id: z.string().min(1).max(64),
  layout: z.enum(LAYOUT_IDS),
  slots: z.record(z.string(), ComponentRef),
  notes: z.string().max(2000).default(""),
  build: Build.default({ steps: [] }),
  transition: Transition.default("fade"),
  /** Justificación registrada por la IA de diseño (qué comunica el slide y por qué esos componentes). */
  rationale: z.string().max(600).optional(),
  /** Ajustes manuales de posición, tamaño y escala por slot; ausente = geometría del layout. */
  adjust: z.record(z.string(), SlotAdjust).optional(),
});
export type Slide = z.infer<typeof Slide>;

export const DeckMeta = z.object({
  title: z.string().min(1).max(200),
  topic: z.string().max(200),
  level: z.string().max(120),
  language: z.string().min(2).max(8).default("es"),
  author: z.string().max(120).optional(),
});

export const DeckDocument = z
  .object({
    schemaVersion: z.literal(DECK_SCHEMA_VERSION),
    engineVersion: z.string(),
    themeId: z.string().min(1).max(40).default("lamina-claro"),
    meta: DeckMeta,
    slides: z.array(Slide).min(1).max(60),
  })
  .superRefine((deck, ctx) => {
    const seen = new Set<string>();
    deck.slides.forEach((s, i) => {
      if (seen.has(s.id)) ctx.addIssue({ code: "custom", path: ["slides", i, "id"], message: `id de slide repetido: ${s.id}` });
      seen.add(s.id);
      const spec = LAYOUTS[s.layout as LayoutId];
      const names = new Set<string>(spec.slots.map((x) => x.name));
      for (const slot of spec.slots) {
        if (slot.required && !s.slots[slot.name])
          ctx.addIssue({ code: "custom", path: ["slides", i, "slots", slot.name], message: `falta el slot obligatorio "${slot.name}" del layout ${s.layout}` });
      }
      for (const k of Object.keys(s.slots)) {
        if (!names.has(k)) ctx.addIssue({ code: "custom", path: ["slides", i, "slots", k], message: `slot "${k}" no existe en el layout ${s.layout}` });
      }
      for (const [k, a] of Object.entries(s.adjust ?? {})) {
        if (!names.has(k)) ctx.addIssue({ code: "custom", path: ["slides", i, "adjust", k], message: `ajuste de un slot inexistente: ${k}` });
        else if (a.w !== undefined && a.x !== undefined && a.x + a.w > 1920) ctx.addIssue({ code: "custom", path: ["slides", i, "adjust", k], message: `el slot "${k}" se sale del lienzo (ancho)` });
        else if (a.h !== undefined && a.y !== undefined && a.y + a.h > 1080) ctx.addIssue({ code: "custom", path: ["slides", i, "adjust", k], message: `el slot "${k}" se sale del lienzo (alto)` });
      }
      s.build.steps.forEach((st, j) =>
        st.reveal.forEach((r) => {
          if (!s.slots[r]) ctx.addIssue({ code: "custom", path: ["slides", i, "build", "steps", j], message: `build revela un slot inexistente: ${r}` });
        }),
      );
    });
  });
export type DeckDocument = z.infer<typeof DeckDocument>;

/** Variante que produce la IA de diseño (el engine/meta los fija el servidor). */
export const DeckSlidesModelOutput = z.object({ slides: z.array(Slide).min(1).max(60) });
