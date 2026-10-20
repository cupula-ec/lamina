import { z } from "zod";

export const JOB_NAMES = [
  "research",
  "content.generate",
  "design.generate",
  "component.request",
  "polish",
  "render",
] as const;
export const JobName = z.enum(JOB_NAMES);
export type JobName = z.infer<typeof JobName>;

const Uuid = z.string().uuid();

export const ResearchPayload = z.object({ presentationId: Uuid, userId: z.string(), versionBase: z.string().default("0") });
export const ContentGeneratePayload = z.object({
  presentationId: Uuid,
  userId: z.string(),
  baseVersionId: Uuid.nullable(),
  feedback: z.string().max(3000).optional(),
  /** Si se indica, solo se regeneran estas secciones; las demás se conservan tal cual. */
  onlySectionIds: z.array(z.string()).optional(),
});
export const DesignGeneratePayload = z.object({
  presentationId: Uuid,
  userId: z.string(),
  contentVersionId: Uuid,
  baseDeckVersionId: Uuid.nullable(),
  feedback: z.string().max(3000).optional(),
  onlySlideIds: z.array(z.string()).optional(),
});
export const ComponentRequestPayload = z.object({
  presentationId: Uuid,
  userId: z.string(),
  requestId: Uuid,
  purpose: z.string().max(800),
  suggestedName: z.string().max(64),
  slideId: z.string().optional(),
});
export const PolishPayload = z.object({ presentationId: Uuid, userId: z.string(), deckVersionId: Uuid });
export const RenderPayload = z.object({ presentationId: Uuid, deckVersionId: Uuid });

export const JOB_PAYLOADS = {
  research: ResearchPayload,
  "content.generate": ContentGeneratePayload,
  "design.generate": DesignGeneratePayload,
  "component.request": ComponentRequestPayload,
  polish: PolishPayload,
  render: RenderPayload,
} as const;

export const jobSingletonKey = (name: JobName, presentationId: string, base: string) => `${name}:${presentationId}:${base}`;
