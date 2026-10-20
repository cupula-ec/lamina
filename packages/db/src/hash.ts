import { createHash } from "node:crypto";
import { canonicalJson } from "@lamina/contracts";

export const sha256Hex = (s: string) => createHash("sha256").update(s).digest("hex");
export const hashJson = (v: unknown) => sha256Hex(canonicalJson(v));
