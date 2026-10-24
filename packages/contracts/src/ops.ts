import { z } from "zod";
import { ComponentRef, LogoSpec, Slide } from "./deck";
import { Block, SlideHint } from "./content";
import { ACCENT_IDS, THEME_IDS } from "./themes";
import { DeckMotion } from "./motion";

/**
 * Operaciones del workspace (PLAN-v3 §5.0): un único motor de cambios para el editor web, el harness de la IA y el MCP.
 * Cada op es pequeña, atómica por lote, reversible (el motor calcula su inversa) e idempotente por `opId` de lote.
 */
const SlideId = z.string().min(1).max(64);
const Slot = z.string().min(1).max(40);

/* ───── Deck ───── */
export const DeckOp = z.discriminatedUnion("op", [
  /** `afterId`: null = al inicio; ausente = al final. */
  z.object({ op: z.literal("add_slide"), slide: Slide, afterId: SlideId.nullable().optional() }),
  z.object({ op: z.literal("replace_slide"), slideId: SlideId, slide: Slide }),
  z.object({ op: z.literal("remove_slide"), slideId: SlideId }),
  z.object({ op: z.literal("move_slide"), slideId: SlideId, afterId: SlideId.nullable() }),
  z.object({ op: z.literal("set_slot"), slideId: SlideId, slot: Slot, ref: ComponentRef }),
  z.object({ op: z.literal("remove_slot"), slideId: SlideId, slot: Slot }),
  /** Mezcla parcial de props del componente del slot; `unset` borra claves. */
  z.object({ op: z.literal("set_slot_props"), slideId: SlideId, slot: Slot, props: z.record(z.string(), z.unknown()).default({}), unset: z.array(z.string().max(80)).max(40).optional() }),
  z.object({ op: z.literal("set_build"), slideId: SlideId, steps: z.array(z.object({ reveal: z.array(z.string()).min(1) })).max(16) }),
  z.object({ op: z.literal("set_notes"), slideId: SlideId, notes: z.string().max(2000) }),
  z.object({ op: z.literal("set_theme"), themeId: z.enum(THEME_IDS), accent: z.enum(ACCENT_IDS).optional() }),
  /** Logo persistente (deck v2). `null` lo quita. Solo se admite con el flag de escritura v2 (ver `V2_OPS`). */
  z.object({ op: z.literal("set_logo"), logo: LogoSpec.nullable() }),
  /** Motion del deck (deck v2). `null` lo quita (vuelve a las animaciones v2). Solo con el flag de escritura v2. */
  z.object({ op: z.literal("set_motion"), motion: DeckMotion.nullable() }),
]);
export type DeckOp = z.infer<typeof DeckOp>;

/* ───── Contenido ───── */
export const ContentOp = z.discriminatedUnion("op", [
  z.object({ op: z.literal("add_section"), section: z.object({ id: z.string().min(1).max(64), title: z.string().min(1).max(160), slidesHint: z.array(SlideHint).min(1).max(8) }), afterId: z.string().nullable().optional() }),
  z.object({ op: z.literal("edit_section"), sectionId: z.string(), title: z.string().min(1).max(160).optional(), locked: z.boolean().optional() }),
  z.object({ op: z.literal("remove_section"), sectionId: z.string() }),
  z.object({ op: z.literal("add_hint"), sectionId: z.string(), hint: SlideHint, afterId: z.string().nullable().optional() }),
  z.object({ op: z.literal("remove_hint"), hintId: z.string() }),
  z.object({ op: z.literal("add_block"), hintId: z.string(), block: Block, afterId: z.string().nullable().optional() }),
  z.object({ op: z.literal("replace_block"), blockId: z.string(), block: Block }),
  z.object({ op: z.literal("remove_block"), blockId: z.string() }),
  z.object({ op: z.literal("move_block"), blockId: z.string(), toHintId: z.string(), afterId: z.string().nullable().optional() }),
]);
export type ContentOp = z.infer<typeof ContentOp>;

export const WorkspaceOp = z.union([DeckOp, ContentOp]);
export type WorkspaceOp = z.infer<typeof WorkspaceOp>;
export const OP_TARGET = (o: WorkspaceOp): "deck" | "content" =>
  (["add_slide", "replace_slide", "remove_slide", "move_slide", "set_slot", "remove_slot", "set_slot_props", "set_build", "set_notes", "set_theme", "set_logo", "set_motion"] as string[]).includes(o.op) ? "deck" : "content";
/** Ops que producen datos de esquema v2: solo se aplican cuando el llamador tiene el flag de escritura correspondiente. */
export const V2_OPS: readonly string[] = ["set_logo", "set_motion"];

export const OpAuthor = z.enum(["ia", "mcp", "docente", "sistema"]);
export type OpAuthor = z.infer<typeof OpAuthor>;

export type OpIssue = { opIndex?: number; code: string; message: string; slideId?: string; path?: string };
export type ApplyResult =
  | { ok: true; issues: OpIssue[]; newRev: number; appliedOpIds: string[]; batchId: string | null; replayed?: boolean; touchedSlideIds: string[] }
  | { ok: false; issues: OpIssue[]; newRev: number; appliedOpIds: []; error?: "stale_rev"; diff?: SlideDiff[] };
export type SlideDiff = { slideId: string; change: "added" | "removed" | "moved" | "modified" };
