import { LIMITS } from "./limits";
import { McpToolError } from "./errors";

const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);

/** Recorre un JSON recibido: profundidad, cantidad de nodos, claves peligrosas y caracteres de control. Lanza invalid_input. */
export function scanJson(value: unknown, what: string) {
  let nodes = 0;
  const walk = (v: unknown, depth: number, path: string) => {
    if (++nodes > LIMITS.maxNodes) throw new McpToolError("payload_too_large", `${what}: demasiados elementos (máximo ${LIMITS.maxNodes}).`);
    if (depth > LIMITS.maxDepth) throw new McpToolError("invalid_input", `${what}: anidación demasiado profunda en ${path || "(raíz)"} (máximo ${LIMITS.maxDepth} niveles).`);
    if (typeof v === "string") {
      if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(v)) throw new McpToolError("invalid_input", `${what}: ${path || "(raíz)"} contiene caracteres de control no permitidos.`);
    } else if (Array.isArray(v)) v.forEach((x, i) => walk(x, depth + 1, `${path}[${i}]`));
    else if (v && typeof v === "object") {
      for (const [k, x] of Object.entries(v)) {
        if (FORBIDDEN_KEYS.has(k)) throw new McpToolError("invalid_input", `${what}: clave no permitida «${k}» en ${path || "(raíz)"}.`);
        walk(x, depth + 1, path ? `${path}.${k}` : k);
      }
    } else if (typeof v === "number" && !Number.isFinite(v)) throw new McpToolError("invalid_input", `${what}: número no finito en ${path}.`);
  };
  walk(value, 0, "");
}

export function jsonBytes(v: unknown): number {
  return Buffer.byteLength(JSON.stringify(v) ?? "", "utf8");
}

export function assertSize(v: unknown, max: number, what: string) {
  const n = jsonBytes(v);
  if (n > max) throw new McpToolError("payload_too_large", `${what} pesa ${Math.round(n / 1024)} KB; el máximo es ${Math.round(max / 1024)} KB.`, { bytes: n, max });
}

/** Claves permitidas: toda clave extra (html, code, script…) se rechaza con un mensaje claro en lugar de descartarse en silencio. */
export function assertKeys(obj: unknown, allowed: readonly string[], where: string) {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return;
  const extra = Object.keys(obj).filter((k) => !allowed.includes(k));
  if (extra.length) throw new McpToolError("invalid_input", `${where}: propiedad${extra.length > 1 ? "es" : ""} no permitida${extra.length > 1 ? "s" : ""}: ${extra.map((k) => `«${k}»`).join(", ")}. Lámina no acepta HTML, código ni campos fuera del esquema (lamina://schemas/deck).`);
}

/** Macros de LaTeX que no tienen cabida en una presentación: enlaces, lectura/escritura, redefiniciones y HTML incrustado. KaTeX ya corre con trust:false; aquí se rechazan de forma explícita. */
const HOSTILE_LATEX = /\\(?:href|url|includegraphics|input|include|write|read|openin|openout|immediate|def|gdef|edef|xdef|let|futurelet|newcommand|renewcommand|providecommand|newenvironment|csname|catcode|expandafter|html[A-Za-z]*|style|class|id|data)(?![A-Za-z])/;

export function assertNoHostileLatex(value: unknown, what: string) {
  const walk = (v: unknown, path: string) => {
    if (typeof v === "string") { const m = HOSTILE_LATEX.exec(v); if (m) throw new McpToolError("validation_failed", `${what}: ${path || "(raíz)"} usa la macro de LaTeX «${m[0]}», que no está permitida (enlaces, lectura/escritura de archivos o redefiniciones).`, { errors: [`${path}: macro no permitida ${m[0]}`] }); }
    else if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${path}[${i}]`));
    else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) walk(x, path ? `${path}.${k}` : k);
  };
  walk(value, "");
}
