import type { Stage } from "@lamina/contracts";

export const STAGE_LABEL: Record<Stage, string> = {
  draft: "Borrador",
  researching: "Investigando y redactando",
  content_review: "Revisa el contenido",
  content_approved: "Contenido aprobado",
  designing: "Diseñando las diapositivas",
  design_review: "Revisa el diseño",
  design_approved: "Diseño aprobado",
  polishing: "Puliendo la presentación",
  final_review: "Revisión final",
  published: "Publicada",
  private_final: "Lista (privada)",
  failed_recoverable: "Detenida por un error",
  quota_wait: "En espera de cupo de IA",
};

export const RUNNING: Stage[] = ["researching", "designing", "polishing"];
export const isRunning = (s: string) => (RUNNING as string[]).includes(s);

/** Fase visible en la barra: 0 contenido · 1 diseño · 2 publicar. */
export function phaseOf(stage: string, prevStage?: string | null): 0 | 1 | 2 {
  const s = (stage === "failed_recoverable" || stage === "quota_wait" ? prevStage ?? "draft" : stage) as Stage;
  if (["draft", "researching", "content_review", "content_approved"].includes(s)) return stage === "designing" ? 1 : 0;
  if (["designing", "design_review", "design_approved"].includes(s)) return 1;
  return 2;
}

export function pageFor(id: string, stage: string, pendingName?: string | null): string {
  if (stage === "failed_recoverable" || stage === "quota_wait") {
    if (pendingName === "design.generate" || pendingName === "component.request") return `/presentations/${id}/preview/design`;
    if (pendingName === "polish") return `/presentations/${id}/preview/design`;
    return `/presentations/${id}/preview/information`;
  }
  if (["draft", "researching", "content_review", "content_approved"].includes(stage)) return `/presentations/${id}/preview/information`;
  return `/presentations/${id}/preview/design`;
}

export function nextAction(stage: string): string {
  switch (stage) {
    case "content_review": return "Revisar y aprobar el contenido";
    case "content_approved": return "Generar el diseño";
    case "design_review": return "Revisar y aprobar el diseño";
    case "design_approved": return "Pulir y publicar";
    case "final_review": return "Publicar o dejar privada";
    case "published": return "Abrir la presentación";
    case "private_final": return "Abrir o publicar";
    case "failed_recoverable": return "Reintentar";
    case "quota_wait": return "Esperando cupo";
    default: return "Ver progreso";
  }
}

export function stageTone(stage: string): "ok" | "warn" | "bad" | "info" | "mute" {
  if (stage === "failed_recoverable") return "bad";
  if (stage === "quota_wait") return "warn";
  if (isRunning(stage)) return "info";
  if (stage === "published") return "ok";
  if (stage === "content_review" || stage === "design_review" || stage === "final_review") return "warn";
  return "mute";
}

/** Quién creó una versión: IA de Lámina, el docente o una IA externa conectada por MCP. */
export const authorLabel = (kind: string) => (kind === "ia" ? "IA" : kind === "mcp" ? "Creado por IA externa (MCP)" : "Tú");
