import { z } from "zod";

export const JOB_NAMES = [
  "research",
  "content.generate",
  "design.generate",
  "component.request",
  "design.repair",
  "polish",
  "render",
  "export",
  "slide.chat",
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
  /** Componente escrito por una IA externa (MCP): pasa por las MISMAS comprobaciones que uno generado (astcheck, typecheck, sandbox, fixtures). */
  provided: z.object({
    id: z.string().regex(/^[A-Za-z][A-Za-z0-9]{2,40}$/), title: z.string().min(2).max(120), purpose: z.string().min(10).max(600),
    useCases: z.array(z.string().max(200)).min(1).max(4), propsJsonSchema: z.record(z.string(), z.unknown()),
    fixtures: z.array(z.record(z.string(), z.unknown())).min(1).max(3), tsx: z.string().max(40_000),
  }).optional(),
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

/** Chat con Lámina sobre una diapositiva (V3 §5.8): el harness aplica los cambios y deja el resultado en chat_runs. */
export const SlideChatPayload = z.object({ presentationId: Uuid, userId: z.string(), chatId: Uuid });

/** Exportaciones (V3 §5.8): PDF de la presentación, versión offline (ZIP) y PDF del material del alumno. */
export const EXPORT_KINDS = ["pdf", "offline", "student_pdf"] as const;
export const ExportKind = z.enum(EXPORT_KINDS);
export type ExportKind = z.infer<typeof ExportKind>;
export const ExportPayload = z.object({ presentationId: Uuid, userId: z.string(), exportId: Uuid, kind: ExportKind });

export const JOB_PAYLOADS = {
  research: ResearchPayload,
  "content.generate": ContentGeneratePayload,
  "design.generate": DesignGeneratePayload,
  "component.request": ComponentRequestPayload,
  "design.repair": DesignRepairPayload,
  polish: PolishPayload,
  render: RenderPayload,
  export: ExportPayload,
  "slide.chat": SlideChatPayload,
} as const;

export const jobSingletonKey = (name: JobName, presentationId: string, base: string) => `${name}:${presentationId}:${base}`;
