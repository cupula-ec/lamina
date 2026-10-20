import { z } from "zod";

export const JOB_NAMES = [
  "research",
  "content.generate",
  "design.generate",
  "component.request",
  "design.repair",
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
/** Reparación puntual: corrige solo las diapositivas con errores visuales detectados por el renderer. */
export const DesignRepairPayload = z.object({
  presentationId: Uuid,
  userId: z.string(),
  deckVersionId: Uuid,
  attempt: z.number().int().min(0).max(5).default(0),
  /** Si se indica, solo estas diapositivas (reparación manual). */
  slideIds: z.array(z.string()).optional(),
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
export const RenderPayload = z
  .object({
    presentationId: Uuid, deckVersionId: Uuid.optional(), componentVersionId: Uuid.optional(),
    /** "repair": al terminar el render se decide si hay que reparar o cerrar el diseño (etapa designing). */
    then: z.enum(["none", "repair"]).default("none"),
    attempt: z.number().int().min(0).max(5).default(0),
    /** Reparación manual: las pasadas siguientes se limitan a estas diapositivas. */
    slideIds: z.array(z.string().max(64)).max(100).optional(),
  })
  .refine((p) => !!p.deckVersionId !== !!p.componentVersionId, { message: "indica deckVersionId o componentVersionId" });

export const JOB_PAYLOADS = {
  research: ResearchPayload,
  "content.generate": ContentGeneratePayload,
  "design.generate": DesignGeneratePayload,
  "component.request": ComponentRequestPayload,
  "design.repair": DesignRepairPayload,
  polish: PolishPayload,
  render: RenderPayload,
} as const;

export const jobSingletonKey = (name: JobName, presentationId: string, base: string) => `${name}:${presentationId}:${base}`;
