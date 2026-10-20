import { z } from "zod";

export const COMPONENT_SCHEMA_VERSION = 1 as const;
export const ComponentStatus = z.enum(["stable", "provisional", "rejected", "deprecated"]);
export type ComponentStatus = z.infer<typeof ComponentStatus>;
export const ComponentRuntime = z.enum(["native", "sandboxed"]);
export type ComponentRuntime = z.infer<typeof ComponentRuntime>;

export const ComponentManifest = z.object({
  schemaVersion: z.literal(COMPONENT_SCHEMA_VERSION).default(COMPONENT_SCHEMA_VERSION),
  id: z.string().min(1).max(64).regex(/^[A-Za-z][A-Za-z0-9_-]*$/),
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  title: z.string().max(120),
  purpose: z.string().min(1).max(600),
  useCases: z.array(z.string().max(300)).min(1).max(8),
  /** JSON Schema de las props (derivado de Zod para componentes nativos). */
  propsJsonSchema: z.record(z.string(), z.unknown()),
  constraints: z.array(z.string().max(300)).default([]),
  examples: z.array(z.object({ name: z.string(), props: z.record(z.string(), z.unknown()) })).min(1),
  status: ComponentStatus,
  /** "global" para el catálogo estable; id de presentación para provisionales. */
  scope: z.union([z.literal("global"), z.string().uuid()]),
  runtime: ComponentRuntime,
  bundleHash: z.string().optional(),
  /** Layout recomendado/ranuras donde encaja. */
  fitsSlots: z.array(z.string()).default([]),
});
export type ComponentManifest = z.infer<typeof ComponentManifest>;
