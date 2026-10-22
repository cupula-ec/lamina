export const ROLES = ["research", "content", "design", "component", "review", "vision"] as const;
export type Role = (typeof ROLES)[number];

/** Imagen adjunta (solo roles con visión). Nunca se registra ni se guarda. */
export type ChatImage = { mime: "image/png" | "image/jpeg"; base64: string };

export type ChatRequest = {
  role: Role;
  /** Etiqueta de tarea (p. ej. "content.generate"); la usa el proveedor fake y el registro. */
  task: string;
  model: string;
  system: string;
  user: string;
  json: boolean;
  images?: ChatImage[];
  maxTokens?: number;
  temperature?: number;
  signal?: AbortSignal;
  /** Solo para el proveedor fake: entrada estructurada para generar una respuesta determinista. */
  fakeContext?: unknown;
};
export type ChatResult = { text: string; promptTokens?: number; completionTokens?: number; respondedModel?: string };
export interface Provider {
  chat(req: ChatRequest): Promise<ChatResult>;
}

export type ProviderErrorKind = "rate" | "quota" | "unavailable" | "auth" | "bad_request";
export class ProviderError extends Error {
  constructor(
    public readonly kind: ProviderErrorKind,
    message: string,
    public readonly status?: number,
    public readonly retryAfterMs?: number,
    public readonly resumeAt?: Date,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}

/** Todos los modelos candidatos están sin cupo ahora mismo: el job debe pasar a quota_wait. */
export class QuotaWaitError extends Error {
  constructor(message: string, public readonly resumeAt: Date) {
    super(message);
    this.name = "QuotaWaitError";
  }
}

export type CallRecord = {
  role: Role;
  model: string;
  presentationId?: string;
  latencyMs: number;
  promptTokens?: number;
  completionTokens?: number;
  result: "ok" | "error" | "quota" | "invalid";
  error?: string;
};
export interface AiHooks {
  onCall(rec: CallRecord): void | Promise<void>;
  /** Devuelve false si el presupuesto global diario se agotó. */
  consumeBudget(): boolean | Promise<boolean>;
}
