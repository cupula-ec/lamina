import { z } from "zod";

export const ERROR_CODES = [
  "unauthorized",
  "forbidden",
  "not_found",
  "invalid_input",
  "invalid_transition",
  "stale_version",
  "run_cancelled",
  "quota_exceeded",
  "provider_quota",
  "provider_failed",
  "model_not_free",
  "job_in_progress",
  "extraction_failed",
  "ssrf_blocked",
  "validation_failed",
  "rate_limited",
  "internal",
] as const;
export const ErrorCode = z.enum(ERROR_CODES);
export type ErrorCode = z.infer<typeof ErrorCode>;

export class LaminaError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly status: number = 400,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "LaminaError";
  }
}

export const ApiError = z.object({
  error: z.object({ code: ErrorCode, message: z.string(), details: z.unknown().optional() }),
});
export type ApiError = z.infer<typeof ApiError>;
