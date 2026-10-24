import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { LIMITS, createLaminaMcpServer } from "@lamina/mcp";
import { flagEnabled } from "@lamina/db";
import { defaultImageProviders } from "@lamina/research";
import { enqueue } from "@lamina/jobs";
import { getAuth, mcpResource } from "@/lib/auth";
import { getBoss } from "@/lib/boss";
import { getDb } from "@/lib/db";
import { env } from "@/lib/env";
import { McpAuthError, mcpEnabled, originProblem, touchConnection, verifyMcpToken } from "@/lib/mcp-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const metadataUrl = () => `${env().APP_URL.replace(/\/$/, "")}/.well-known/oauth-protected-resource/api/mcp`;
const SCOPE = "presentations:read presentations:write";

const rpcError = (status: number, code: number, message: string, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify({ jsonrpc: "2.0", error: { code, message }, id: null }), { status, headers: { "content-type": "application/json", "cache-control": "no-store", ...headers } });

/** Sin credenciales el desafío no lleva `error` (RFC 6750 §3.1); con token inválido o sin permiso sí. */
const challenge = (e: McpAuthError | null) =>
  rpcError(e?.status ?? 401, -32001, e?.message ?? "Falta el token de acceso (Authorization: Bearer).", {
    "www-authenticate": `Bearer ${e ? `error="${e.code}", ` : ""}scope="${SCOPE}", resource_metadata="${metadataUrl()}"`,
  });

let jwksCache: { at: number; keys: Awaited<ReturnType<ReturnType<typeof getAuth>["api"]["getJwks"]>> } | null = null;
async function jwks() {
  if (!jwksCache || Date.now() - jwksCache.at > 30_000) jwksCache = { at: Date.now(), keys: await getAuth().api.getJwks() };
  return jwksCache.keys;
}

async function handle(request: Request): Promise<Response> {
  const db = getDb();
  const e = env();
  const bad = originProblem(request.headers, e.APP_URL);
  if (bad) return rpcError(403, -32003, bad);
  if (!(await mcpEnabled(db))) return rpcError(503, -32004, "El servidor MCP de Lámina está desactivado por un administrador.");
  if (request.method !== "POST") return rpcError(405, -32000, "Método no permitido: este servidor solo acepta POST (sin sesiones ni streams del servidor).", { allow: "POST" });
  if (Number(request.headers.get("content-length") ?? 0) > LIMITS.maxRequestBytes) return rpcError(413, -32600, "La petición es demasiado grande.");

  const m = /^Bearer\s+(\S+)$/i.exec(request.headers.get("authorization") ?? "");
  if (!m) return challenge(null);
  let principal;
  try {
    principal = await verifyMcpToken(db, m[1]!, { jwks: (await jwks()) as never, issuer: (await getAuth().$context).baseURL, audience: mcpResource() });
  } catch (err) {
    if (err instanceof McpAuthError) return challenge(err);
    console.error("[mcp] verificación", err);
    return rpcError(500, -32603, "Error interno");
  }
  await touchConnection(db, principal.userId, principal.clientId).catch(() => {});

  const v2 = await flagEnabled(db, "v3_mcp2", { userId: principal.userId });
  const server = createLaminaMcpServer({
    db, appUrl: e.APP_URL.replace(/\/$/, ""), v2,
    images: v2 ? { providers: defaultImageProviders({ searxngUrl: e.SEARXNG_URL, unsplashKey: e.UNSPLASH_ACCESS_KEY, pexelsKey: e.PEXELS_API_KEY }), dataDir: e.DATA_DIR } : undefined,
    enqueueComponent: async (payload) => { await enqueue(await getBoss(), "component.request", payload as never, { base: payload.requestId }); },
    enqueueRender: async (presentationId, deckVersionId) => { await enqueue(await getBoss(), "render", { presentationId, deckVersionId }, { base: deckVersionId }); },
  }, principal);
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true, maxRequestBodySize: LIMITS.maxRequestBytes });
  await server.connect(transport);
  try {
    return await transport.handleRequest(request);
  } finally {
    transport.close().catch(() => {});
  }
}

export const POST = handle;
export const GET = handle;
export const DELETE = handle;
