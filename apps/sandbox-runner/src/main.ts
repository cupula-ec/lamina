import http from "node:http";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { BuildInput, type BuildResult } from "@lamina/sandbox-kit/client";
import { Docker, containerConfig } from "./docker";

const TOKEN = process.env.SANDBOX_TOKEN ?? "";
const IMAGE = process.env.SANDBOX_IMAGE ?? "lamina-sandbox:latest";
const RUNTIME = process.env.SANDBOX_RUNTIME || undefined;
const PORT = Number(process.env.PORT ?? 8600);
const TIMEOUT_MS = 60_000;
const MAX_BODY = 160_000;
if (TOKEN.length < 24) throw new Error("SANDBOX_TOKEN requerido (≥ 24 caracteres)");
const docker = new Docker();

// Un solo build a la vez (la máquina es compartida con producción): cola con tope.
let active = 0;
const waiters: (() => void)[] = [];
const MAX_QUEUE = 6;
async function slot<T>(fn: () => Promise<T>): Promise<T> {
  if (active >= 1) {
    if (waiters.length >= MAX_QUEUE) throw Object.assign(new Error("cola llena"), { status: 429 });
    await new Promise<void>((r) => waiters.push(r));
  }
  active++;
  try { return await fn(); } finally { active--; waiters.shift()?.(); }
}

const authOk = (h: string | undefined) => {
  const a = Buffer.from(h ?? ""), b = Buffer.from(`Bearer ${TOKEN}`);
  return a.length === b.length && timingSafeEqual(a, b);
};

async function runContainer(input: unknown): Promise<{ result: Record<string, unknown>; timedOut: boolean; logs: string }> {
  const inputB64 = Buffer.from(JSON.stringify(input)).toString("base64");
  if (inputB64.length > 120_000) throw Object.assign(new Error("entrada demasiado grande"), { status: 413 });
  const nonce = randomBytes(18).toString("hex");
  const id = await docker.create(containerConfig({ image: IMAGE, runtime: RUNTIME, inputB64, nonce }));
  try {
    await docker.start(id);
    const w = await docker.wait(id, TIMEOUT_MS);
    const logs = await docker.logs(id);
    // Solo cuenta la línea con el nonce secreto del contenedor (el código del componente no lo conoce).
    const prefix = `LAMINA_RESULT:${nonce}:`;
    const line = logs.split("\n").reverse().find((l) => l.startsWith(prefix));
    if (!line) return { result: { ok: false, checks: [{ name: "Ejecución en sandbox", ok: false, detail: w.timedOut ? `Tiempo agotado (${TIMEOUT_MS / 1000} s)` : `Sin resultado (exit ${w.exitCode}): ${logs.slice(-300)}` }] }, timedOut: w.timedOut, logs: logs.slice(-1500) };
    return { result: JSON.parse(line.slice(prefix.length)), timedOut: w.timedOut, logs: "" };
  } finally { await docker.remove(id); }
}

const server = http.createServer(async (req, res) => {
  const send = (status: number, body: unknown) => { res.writeHead(status, { "content-type": "application/json" }); res.end(JSON.stringify(body)); };
  try {
    if (req.method === "GET" && req.url === "/health") return send(200, { ok: true, image: await docker.imageExists(IMAGE), runtime: RUNTIME ?? "default" });
    if (!authOk(req.headers.authorization)) return send(401, { error: "no autorizado" });
    if (req.method !== "POST" || !(req.url === "/v1/build" || req.url === "/v1/probe")) return send(404, { error: "no encontrado" });
    const chunks: Buffer[] = []; let n = 0;
    for await (const c of req) { n += (c as Buffer).length; if (n > MAX_BODY) return send(413, { error: "cuerpo demasiado grande" }); chunks.push(c as Buffer); }
    if (req.url === "/v1/probe") {
      const r = await slot(() => runContainer({ mode: "probe" }));
      return send(200, r.result);
    }
    const parsed = BuildInput.safeParse(JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"));
    if (!parsed.success) return send(400, { error: parsed.error.issues[0]?.message ?? "entrada inválida" });
    const r = await slot(() => runContainer(parsed.data));
    const out: BuildResult = { ...(r.result as unknown as BuildResult), timedOut: r.timedOut, logs: r.logs || undefined };
    return send(200, out);
  } catch (e) {
    const status = (e as { status?: number }).status ?? 500;
    console.error("[sandbox-runner]", (e as Error).message);
    return send(status, { error: status === 500 ? "error interno" : (e as Error).message });
  }
});
server.requestTimeout = 150_000;
server.listen(PORT, "0.0.0.0", () => console.log(`[sandbox-runner] :${PORT} imagen=${IMAGE} runtime=${RUNTIME ?? "default"}`));
