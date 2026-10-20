import { z } from "zod";

/** Etapas del workflow de una presentación. Las transiciones viven solo en `packages/db/src/workflow.ts`. */
export const STAGES = [
  "draft",
  "researching",
  "content_review",
  "content_approved",
  "designing",
  "design_review",
  "design_approved",
  "polishing",
  "final_review",
  "published",
  "private_final",
  "failed_recoverable",
  "quota_wait",
] as const;
export const Stage = z.enum(STAGES);
export type Stage = z.infer<typeof Stage>;

export const Visibility = z.enum(["private", "link", "public"]);
export type Visibility = z.infer<typeof Visibility>;

export const Origin = z.enum(["teacher", "research", "generated", "edited"]);
export type Origin = z.infer<typeof Origin>;
