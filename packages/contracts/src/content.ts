import { z } from "zod";
import { Origin } from "./stage";

/** ContentDraft v1: contenido didáctico tipado y editable, anterior al diseño de slides. */
export const CONTENT_SCHEMA_VERSION = 1 as const;
/** Versiones que ESTE código sabe leer (ver deck.ts). */
export const CONTENT_READABLE_VERSIONS = [1, 2] as const;

const Id = z.string().min(1).max(64);
const SourceRefs = z.array(z.string().max(64)).max(12).default([]);

const base = {
  id: Id,
  origin: Origin.default("generated"),
  sourceRefs: SourceRefs,
};

const Latex = z.string().min(1).max(2000);

export const TextBlock = z.object({ ...base, type: z.literal("text"), md: z.string().min(1).max(4000) });
export const FormulaBlock = z.object({
  ...base,
  type: z.literal("formula"),
  latex: Latex,
  caption: z.string().max(300).optional(),
});
export const DerivationBlock = z.object({
  ...base,
  type: z.literal("derivation"),
  steps: z.array(z.object({ latex: Latex, explanation: z.string().max(600) })).min(1).max(12),
});
export const ExampleBlock = z.object({
  ...base,
  type: z.literal("example"),
  problem: z.string().min(1).max(1500),
  steps: z.array(z.object({ latex: Latex.optional(), text: z.string().max(600) })).min(1).max(12),
  answer: z.string().min(1).max(600),
});
export const GraphSpecBlock = z.object({
  ...base,
  type: z.literal("graphSpec"),
  functions: z.array(z.object({ expr: z.string().min(1).max(200), label: z.string().max(80).optional() })).min(1).max(4),
  domain: z.object({ xMin: z.number(), xMax: z.number() }),
  yDomain: z.object({ yMin: z.number(), yMax: z.number() }).optional(),
  points: z.array(z.object({ x: z.number(), y: z.number().optional(), label: z.string().max(40).optional() })).max(10).default([]),
  tangents: z.array(z.object({ fnIndex: z.number().int().min(0).max(3), at: z.number() })).max(3).default([]),
  caption: z.string().max(300).optional(),
});
export const TableBlock = z.object({
  ...base,
  type: z.literal("table"),
  headers: z.array(z.string().max(120)).min(1).max(8),
  rows: z.array(z.array(z.string().max(200)).max(8)).min(1).max(12),
  caption: z.string().max(300).optional(),
});
export const DiagramSpecBlock = z.object({
  ...base,
  type: z.literal("diagramSpec"),
  kind: z.enum(["vector", "geometry", "generic"]),
  description: z.string().min(1).max(800),
  data: z.record(z.string(), z.unknown()).optional(),
});
export const DefinitionBlock = z.object({
  ...base,
  type: z.literal("definition"),
  term: z.string().min(1).max(120),
  md: z.string().min(1).max(1200),
});
export const TheoremBlock = z.object({
  ...base,
  type: z.literal("theorem"),
  name: z.string().min(1).max(160),
  statement: z.string().min(1).max(1500),
  proofSketch: z.string().max(1500).optional(),
});

/** Bloques pedagógicos de V3 (contenido v2, PLAN-v3 §5.4). Un documento v1 nunca los contiene. */
export const MotivationBlock = z.object({
  ...base,
  type: z.literal("motivation"),
  hook: z.string().min(1).max(300),
  intuition: z.string().min(1).max(700),
  everydayExample: z.string().max(500).optional(),
});
export const ExerciseBlock = z.object({
  ...base,
  type: z.literal("exercise"),
  statement: z.string().min(1).max(1500),
  guidingQuestion: z.string().min(1).max(400),
  hints: z.array(z.string().min(1).max(400)).min(1).max(3),
  steps: z.array(z.object({ do: z.string().min(1).max(500), why: z.string().min(1).max(500), latex: Latex.optional() })).min(1).max(10),
  answer: z.string().min(1).max(600),
  commonMistakes: z.array(z.string().max(300)).max(4).optional(),
});
export const CodeBlock = z.object({
  ...base,
  type: z.literal("code"),
  language: z.string().min(1).max(30),
  source: z.string().min(1).max(3000),
  highlightSteps: z.array(z.object({ lines: z.array(z.number().int().min(1).max(200)).min(1).max(12), note: z.string().max(300).optional() })).max(12).optional(),
});
export const ImageRequestBlock = z.object({
  ...base,
  type: z.literal("imageRequest"),
  query: z.string().min(1).max(200),
  purpose: z.string().min(1).max(300),
  alt: z.string().min(1).max(300),
});
export const ActivityBlock = z.object({
  ...base,
  type: z.literal("activity"),
  kind: z.enum(["debate", "pregunta", "pares", "practica"]),
  prompt: z.string().min(1).max(800),
  minutes: z.number().int().min(1).max(60),
});
export const ClosingBlock = z.object({
  ...base,
  type: z.literal("closing"),
  keyIdeas: z.array(z.string().min(1).max(200)).min(1).max(6),
  questions: z.array(z.string().min(1).max(300)).max(4).optional(),
  nextClass: z.string().max(300).optional(),
  exitTicket: z.string().max(300).optional(),
});

export const Block = z.discriminatedUnion("type", [
  TextBlock,
  FormulaBlock,
  DerivationBlock,
  ExampleBlock,
  GraphSpecBlock,
  TableBlock,
  DiagramSpecBlock,
  DefinitionBlock,
  TheoremBlock,
  MotivationBlock,
  ExerciseBlock,
  CodeBlock,
  ImageRequestBlock,
  ActivityBlock,
  ClosingBlock,
]);
export type Block = z.infer<typeof Block>;
export type BlockType = Block["type"];

export const SlideHint = z.object({
  id: Id,
  intent: z.string().min(1).max(300),
  blocks: z.array(Block).min(1).max(8),
});
export type SlideHint = z.infer<typeof SlideHint>;

export const Section = z.object({
  id: Id,
  title: z.string().min(1).max(160),
  locked: z.boolean().default(false),
  slidesHint: z.array(SlideHint).min(1).max(8),
});
export type Section = z.infer<typeof Section>;

export const ContentMeta = z.object({
  topic: z.string().min(1).max(200),
  level: z.string().min(1).max(120),
  objective: z.string().min(1).max(600),
  language: z.string().min(2).max(8).default("es"),
  /** V3: área y cantidad pedidas (AREA_IDS / LENGTH_IDS). Ausentes = comportamiento v2. */
  area: z.string().max(20).optional(),
  length: z.string().max(10).optional(),
});
export type ContentMeta = z.infer<typeof ContentMeta>;

/** Aviso de verificación. Con `kind` es un paso matemático concreto que el docente puede aprobar o corregir; sin `kind`, un aviso general. */
export const ContentWarning = z.object({
  blockId: Id.optional(),
  message: z.string().max(400),
  kind: z.enum(["mismatch", "unverifiable"]).optional(),
  /** LaTeX del paso dudoso (para mostrarlo y para reconocer la misma duda tras editar). */
  latex: z.string().max(600).optional(),
  reason: z.enum(["sin_igualdad", "sintaxis", "dimensiones", "muestreo", "ecuacion"]).optional(),
  status: z.enum(["pending", "approved"]).optional(),
});
export type ContentWarning = z.infer<typeof ContentWarning>;

/** Resumen de la verificación matemática automática. */
export const VerificationStats = z.object({ verified: z.number().int().min(0), approved: z.number().int().min(0), review: z.number().int().min(0) });
export type VerificationStats = z.infer<typeof VerificationStats>;

export const ContentDraft = z.object({
  schemaVersion: z.union([z.literal(1), z.literal(2)]),
  meta: ContentMeta,
  sections: z.array(Section).min(1).max(12),
  /** Avisos de verificación (fórmulas no comprobables, fuentes débiles, etc.). */
  warnings: z.array(ContentWarning).default([]),
  verification: VerificationStats.optional(),
});
export type ContentDraft = z.infer<typeof ContentDraft>;

/** Variante que se pide al modelo: sin warnings (los añade el validador). */
export const ContentDraftModelOutput = ContentDraft.omit({ warnings: true, verification: true }).extend({ schemaVersion: z.union([z.literal(1), z.literal(2)]) });

/** Lector tolerante: acepta v1 y v2. */
export function parseContentAny(raw: unknown): ContentDraft {
  return ContentDraft.parse(raw);
}
