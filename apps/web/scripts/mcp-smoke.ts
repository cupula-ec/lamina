/**
 * Prueba de humo del servidor MCP contra un Lámina en marcha (desarrollo): descubrimiento OAuth, registro dinámico, login, consentimiento,
 * PKCE, token, llamadas MCP con el cliente oficial del SDK, refresco y revocación inmediata.
 * Uso: pnpm --filter @lamina/web tsx scripts/mcp-smoke.ts correo clave   (APP_URL por defecto http://localhost:3100)
 */
import { createHash, randomBytes } from "node:crypto";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const BASE = (process.env.APP_URL ?? "http://localhost:3100").replace(/\/$/, "");
const [email, password] = process.argv.slice(2);
if (!email || !password) throw new Error("uso: mcp-smoke <correo> <clave>");
const RES = `${BASE}/api/mcp`;
const REDIRECT = "http://127.0.0.1:9999/callback";
const log = (k: string, v: unknown) => console.log(`\n## ${k}\n${typeof v === "string" ? v : JSON.stringify(v, null, 2)}`);
const b64 = (b: Buffer) => b.toString("base64url");

const prm = await (await fetch(`${BASE}/.well-known/oauth-protected-resource/api/mcp`)).json();
log("1. Metadatos del recurso protegido (RFC 9728)", prm);
const asm = await (await fetch(`${prm.authorization_servers[0].replace("/api/auth", "")}/.well-known/oauth-authorization-server/api/auth`)).json();
log("2. Metadatos del servidor de autorización (RFC 8414)", { issuer: asm.issuer, registration_endpoint: asm.registration_endpoint, code_challenge_methods_supported: asm.code_challenge_methods_supported, grant_types_supported: asm.grant_types_supported, client_id_metadata_document_supported: asm.client_id_metadata_document_supported });

const noTok = await fetch(RES, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
log("3. Sin token", { status: noTok.status, "www-authenticate": noTok.headers.get("www-authenticate") });
const evil = await fetch(RES, { method: "POST", headers: { "content-type": "application/json", origin: "https://evil.example" }, body: "{}" });
log("3b. Origin ajeno", { status: evil.status });

const reg = await (await fetch(asm.registration_endpoint, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({
  client_name: "Cliente de prueba (smoke)", redirect_uris: [REDIRECT], grant_types: ["authorization_code", "refresh_token"], response_types: ["code"], token_endpoint_auth_method: "none", scope: "presentations:read presentations:write offline_access",
}) })).json();
log("4. Registro dinámico de cliente", { client_id: reg.client_id, token_endpoint_auth_method: reg.token_endpoint_auth_method, scope: reg.scope });

const login = await fetch(`${BASE}/api/auth/sign-in/email`, { method: "POST", headers: { "content-type": "application/json", origin: BASE }, body: JSON.stringify({ email, password }) });
if (!login.ok) throw new Error(`login ${login.status}`);
const cookie = login.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");

const verifier = b64(randomBytes(32));
const auth = new URL(asm.authorization_endpoint);
Object.entries({ response_type: "code", client_id: reg.client_id, redirect_uri: REDIRECT, scope: "presentations:read presentations:write offline_access", state: "st1", code_challenge: b64(createHash("sha256").update(verifier).digest()), code_challenge_method: "S256", resource: RES }).forEach(([k, v]) => auth.searchParams.set(k, v));
const a = await fetch(auth, { headers: { cookie, "sec-fetch-mode": "navigate", accept: "text/html" }, redirect: "manual" });
const loc = new URL(a.headers.get("location") ?? ((await a.json().catch(() => ({}))) as { url?: string }).url ?? "/missing", BASE);
log("5. Authorize → pantalla de consentimiento", { status: a.status, path: loc.pathname, scope: loc.searchParams.get("scope") });
const consent = await (await fetch(`${BASE}/api/auth/oauth2/consent`, { method: "POST", headers: { "content-type": "application/json", cookie, origin: BASE }, body: JSON.stringify({ accept: true, oauth_query: loc.search.slice(1) }) })).json();
const back = new URL(consent.url);
log("6. Consentimiento aceptado", { redirect: `${back.origin}${back.pathname}`, hasCode: back.searchParams.has("code"), iss: back.searchParams.get("iss") });

const tok = await (await fetch(asm.token_endpoint, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "authorization_code", code: back.searchParams.get("code")!, redirect_uri: REDIRECT, client_id: reg.client_id, code_verifier: verifier, resource: RES }) })).json();
log("7. Token", { token_type: tok.token_type, expires_in: tok.expires_in, scope: tok.scope, hasRefresh: !!tok.refresh_token });

const connect = async (token: string) => {
  const c = new Client({ name: "smoke", version: "1" });
  await c.connect(new StreamableHTTPClientTransport(new URL(RES), { requestInit: { headers: { Authorization: `Bearer ${token}` } } }));
  return c;
};
const client = await connect(tok.access_token);
log("8. Tools", (await client.listTools()).tools.map((t) => t.name));
log("8b. Resources", (await client.listResources()).resources.map((r) => r.uri));
const created = JSON.parse(((await client.callTool({ name: "create_presentation", arguments: { topic: "La regla de la cadena", level: "Primer ciclo", objective: "Derivar funciones compuestas", subject: "Cálculo I" } })).content as { text: string }[])[0]!.text);
log("9. create_presentation", { id: created.id, stage: created.stage, origin: created.origin, url: created.url });
const draft = JSON.parse(((await client.readResource({ uri: "lamina://schemas/content-draft" })).contents[0] as { text: string }).text);
log("9b. Esquema leído", { required: draft.required });

const ref = await (await fetch(asm.token_endpoint, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: tok.refresh_token, client_id: reg.client_id, resource: RES }) })).json();
log("10. Refresco", { ok: !!ref.access_token, rotated: ref.refresh_token !== tok.refresh_token });

if (process.env.MCP_SMOKE_KEEP) { console.log(JSON.stringify({ token: ref.access_token, presentationId: created.id, clientId: reg.client_id })); process.exit(0); }
const { getDb } = await import("../src/lib/db");
const { revokeConnection } = await import("../src/lib/mcp-access");
const { eq } = await import("drizzle-orm");
const { schema } = await import("@lamina/db");
const [u] = await getDb().select().from(schema.user).where(eq(schema.user.email, email));
await revokeConnection(getDb(), u!.id, reg.client_id);
const after = await fetch(RES, { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream", Authorization: `Bearer ${ref.access_token}` }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }) });
log("11. Tras revocar: el token aún no expiró pero ya no sirve", { status: after.status });
const dead = await (await fetch(asm.token_endpoint, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: ref.refresh_token, client_id: reg.client_id, resource: RES }) })).json();
log("12. Tras revocar: el refresco también falla", { error: dead.error ?? null, gotAccessToken: !!dead.access_token });
process.exit(0);
