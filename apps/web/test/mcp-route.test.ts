import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { SignJWT, exportJWK, generateKeyPair } from "jose";
import { eq } from "drizzle-orm";
import { createDb, runMigrations, schema } from "@lamina/db";

const ADMIN_URL = "postgres://lamina:lamina@127.0.0.1:55432/postgres";
const URL_ = "postgres://lamina:lamina@127.0.0.1:55432/lamina_web_mcp_test";
process.env.DATABASE_URL = URL_;
process.env.BETTER_AUTH_SECRET = "x".repeat(40);
process.env.APP_URL = "http://localhost:3100";

let h: ReturnType<typeof createDb>;
const sent: unknown[] = [];
const keys: { priv?: CryptoKey; jwk?: object } = {};

vi.mock("@/lib/db", () => ({ getDb: () => h.db }));
vi.mock("@/lib/boss", () => ({ getBoss: async () => ({ send: async (...a: unknown[]) => { sent.push(a); return "job-1"; } }) }));
vi.mock("@/lib/auth", () => ({
  mcpResource: () => "http://localhost:3100/api/mcp",
  getAuth: () => ({ api: { getJwks: async () => ({ keys: [keys.jwk] }) }, $context: Promise.resolve({ baseURL: "http://localhost:3100/api/auth" }) }),
}));

const route = () => import("../src/app/api/mcp/route");
const access = () => import("../src/lib/mcp-access");

const mint = async (o: { sub: string; azp?: string; scope?: string; aud?: string; exp?: string | number; iss?: string }) =>
  new SignJWT({ scope: o.scope ?? "presentations:read presentations:write offline_access", azp: o.azp ?? "client-1" })
    .setProtectedHeader({ alg: "ES256", kid: "k1" }).setSubject(o.sub).setIssuer(o.iss ?? "http://localhost:3100/api/auth").setAudience(o.aud ?? "http://localhost:3100/api/mcp")
    .setIssuedAt().setExpirationTime(o.exp ?? "10m").sign(keys.priv!);

const mkUser = async (id: string, opts: { banned?: boolean; consent?: boolean } = {}) => {
  await h.db.insert(schema.user).values({ id, name: id, email: `${id}@t.test`, banned: !!opts.banned });
  await h.db.insert(schema.userProfiles).values({ userId: id, consentAt: opts.consent === false ? null : new Date() });
  await h.db.insert(schema.oauthConsent).values({ id: `c-${id}`, clientId: "client-1", userId: id, scopes: ["presentations:read", "presentations:write"] });
};

const callRaw = async (token: string | null, init: { method?: string; headers?: Record<string, string>; body?: string } = {}) =>
  (await route()).POST(new Request("http://localhost:3100/api/mcp", {
    method: init.method ?? "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream", host: "localhost:3100", ...(token ? { authorization: `Bearer ${token}` } : {}), ...init.headers },
    body: init.method === "GET" ? undefined : init.body ?? JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
  }));

const client = async (token: string) => {
  const r = await route();
  const c = new Client({ name: "t", version: "1" });
  await c.connect(new StreamableHTTPClientTransport(new URL("http://localhost:3100/api/mcp"), {
    fetch: async (u, init) => r.POST(new Request(u as string, { ...init, headers: { ...Object.fromEntries(new Headers(init?.headers)), host: "localhost:3100", authorization: `Bearer ${token}` } })),
  }));
  return c;
};
const parse = (r: unknown) => JSON.parse(((r as { content: unknown }).content as { text: string }[])[0]!.text);

beforeAll(async () => {
  const admin = createDb(ADMIN_URL, 1);
  await admin.pool.query("drop database if exists lamina_web_mcp_test with (force)");
  await admin.pool.query("create database lamina_web_mcp_test");
  await admin.pool.end();
  h = createDb(URL_, 4);
  await runMigrations(h.db);
  const kp = await generateKeyPair("ES256");
  keys.priv = kp.privateKey;
  keys.jwk = { ...(await exportJWK(kp.publicKey)), kid: "k1", alg: "ES256", use: "sig" };
  await h.db.insert(schema.oauthClient).values({ id: "oc1", clientId: "client-1", name: "Claude de prueba", redirectUris: ["http://127.0.0.1:9999/cb"] });
  await mkUser("ua"); await mkUser("ub");
});
afterAll(async () => { await h.pool.end(); });
beforeEach(async () => { await (await access()).setMcpEnabled(h.db, true); });

describe("transporte HTTP y OAuth del recurso", () => {
  it("sin token: 401 con desafío RFC 6750 + RFC 9728 (sin error)", async () => {
    const r = await callRaw(null);
    expect(r.status).toBe(401);
    const w = r.headers.get("www-authenticate")!;
    expect(w).toContain('resource_metadata="http://localhost:3100/.well-known/oauth-protected-resource/api/mcp"');
    expect(w).not.toContain("error=");
    expect(w).toContain("scope=");
  });

  it("Origin ajeno, Origin null y Host ajeno se rechazan (DNS rebinding)", async () => {
    const t = await mint({ sub: "ua" });
    expect((await callRaw(t, { headers: { origin: "https://evil.example" } })).status).toBe(403);
    expect((await callRaw(t, { headers: { origin: "null" } })).status).toBe(403);
    expect((await callRaw(t, { headers: { host: "evil.example" } })).status).toBe(403);
    expect((await callRaw(t, { headers: { origin: "http://localhost:3100" } })).status).toBe(200);
  });

  it("token inválido: expirado, audiencia ajena, emisor ajeno, firma ajena", async () => {
    for (const t of [
      await mint({ sub: "ua", exp: Math.floor(Date.now() / 1000) - 120 }),
      await mint({ sub: "ua", aud: "http://localhost:3100/api/otra" }),
      await mint({ sub: "ua", iss: "https://otro.example" }),
      "no.es.un-jwt",
      await (async () => { const kp = await generateKeyPair("ES256"); return new SignJWT({ scope: "presentations:read", azp: "client-1" }).setProtectedHeader({ alg: "ES256", kid: "k1" }).setSubject("ua").setIssuer("http://localhost:3100/api/auth").setAudience("http://localhost:3100/api/mcp").setExpirationTime("5m").sign(kp.privateKey); })(),
    ]) {
      const r = await callRaw(t);
      expect(r.status).toBe(401);
      expect(r.headers.get("www-authenticate")).toContain('error="invalid_token"');
    }
  });

  it("scope insuficiente: 403 insufficient_scope", async () => {
    const r = await callRaw(await mint({ sub: "ua", scope: "offline_access profile" }));
    expect(r.status).toBe(403);
    expect(r.headers.get("www-authenticate")).toContain('error="insufficient_scope"');
  });

  it("cliente SDK sobre HTTP: initialize, tools, resources y llamadas; registra el último uso", async () => {
    const c = await client(await mint({ sub: "ua" }));
    expect((await c.listTools()).tools).toHaveLength(7);
    expect((await c.listResources()).resources.length).toBeGreaterThanOrEqual(6);
    const cr = parse(await c.callTool({ name: "create_presentation", arguments: { topic: "Límites", level: "U1", objective: "Calcular límites" } }));
    expect(cr).toMatchObject({ stage: "draft", origin: "mcp" });
    const [use] = await h.db.select().from(schema.mcpConnections).where(eq(schema.mcpConnections.userId, "ua"));
    expect(use!.calls).toBeGreaterThan(0);
    expect(use!.lastUsedAt).toBeTruthy();
    const list = await (await access()).listConnections(h.db, "ua");
    expect(list[0]).toMatchObject({ clientId: "client-1", name: "Claude de prueba", host: "127.0.0.1:9999" });
    await c.close();
  });

  it("con solo presentations:read las herramientas de escritura fallan", async () => {
    const c = await client(await mint({ sub: "ua", scope: "presentations:read" }));
    const r = await c.callTool({ name: "create_presentation", arguments: { topic: "A", level: "B", objective: "C" } });
    expect(r.isError).toBe(true);
    expect(parse(r).error.code).toBe("insufficient_scope");
    expect(parse(await c.callTool({ name: "list_presentations", arguments: {} })).presentations).toBeTruthy();
  });

  it("aislamiento entre cuentas A y B a través de HTTP", async () => {
    const ca = await client(await mint({ sub: "ua" }));
    const id = parse(await ca.callTool({ name: "create_presentation", arguments: { topic: "Privada de A", level: "U", objective: "o" } })).id;
    const cb = await client(await mint({ sub: "ub" }));
    expect(parse(await cb.callTool({ name: "get_presentation", arguments: { id } })).error.code).toBe("not_found");
    const titles = parse(await cb.callTool({ name: "list_presentations", arguments: {} })).presentations.map((p: { title: string }) => p.title);
    expect(titles).not.toContain("Privada de A");
  });

  it("revocación inmediata: el JWT sigue vigente pero deja de servir; también cuenta bloqueada o sin consentimiento", async () => {
    await mkUser("ur");
    const t = await mint({ sub: "ur" });
    expect((await callRaw(t)).status).toBe(200);
    await (await access()).revokeConnection(h.db, "ur", "client-1");
    const r = await callRaw(t);
    expect(r.status).toBe(401);
    const [ev] = await h.db.select().from(schema.events).where(eq(schema.events.name, "mcp.connection_revoked"));
    expect(ev!.userId).toBe("ur");
    await mkUser("ubanned", { banned: true });
    expect((await callRaw(await mint({ sub: "ubanned" }))).status).toBe(401);
    await mkUser("unocons", { consent: false });
    expect((await callRaw(await mint({ sub: "unocons" }))).status).toBe(401);
    await h.db.update(schema.oauthClient).set({ disabled: true }).where(eq(schema.oauthClient.clientId, "client-1"));
    expect((await callRaw(await mint({ sub: "ua" }))).status).toBe(401);
    await h.db.update(schema.oauthClient).set({ disabled: false }).where(eq(schema.oauthClient.clientId, "client-1"));
  });

  it("revocar borra también los tokens de refresco (no se puede renovar)", async () => {
    await mkUser("urf");
    await h.db.insert(schema.oauthRefreshToken).values({ id: "rt1", token: "hash1", clientId: "client-1", userId: "urf", scopes: ["presentations:read"], expiresAt: new Date(Date.now() + 1e6), createdAt: new Date() });
    await (await access()).revokeConnection(h.db, "urf", "client-1");
    const [rt] = await h.db.select().from(schema.oauthRefreshToken).where(eq(schema.oauthRefreshToken.id, "rt1"));
    expect(rt!.revoked).toBeTruthy();
  });

  it("el administrador puede desactivar el MCP globalmente (503) y reactivarlo", async () => {
    const t = await mint({ sub: "ua" });
    await (await access()).setMcpEnabled(h.db, false);
    expect((await callRaw(t)).status).toBe(503);
    await (await access()).setMcpEnabled(h.db, true);
    expect((await callRaw(t)).status).toBe(200);
  });

  it("solo POST; payload gigante → 413; JSON inválido → error JSON-RPC", async () => {
    const t = await mint({ sub: "ua" });
    expect((await callRaw(t, { method: "GET" })).status).toBe(405);
    expect((await (await route()).DELETE(new Request("http://localhost:3100/api/mcp", { method: "DELETE", headers: { host: "localhost:3100", authorization: `Bearer ${t}` } }))).status).toBe(405);
    expect((await callRaw(t, { headers: { "content-length": "5000000" } })).status).toBe(413);
    const bad = await callRaw(t, { body: "{no es json" });
    expect(bad.status).toBe(400);
  });

  it("un envío de deck por HTTP encola el render con el singleton de la versión", async () => {
    const c = await client(await mint({ sub: "ua" }));
    const id = parse(await c.callTool({ name: "create_presentation", arguments: { topic: "T", level: "U", objective: "o" } })).id;
    const r = parse(await c.callTool({ name: "submit_deck", arguments: { id, deck: {}, baseVersionId: null } }));
    expect(["invalid_transition", "validation_failed"]).toContain(r.error.code);
    expect(sent).toHaveLength(0);
  });
});

describe("originProblem", () => {
  it("exige HTTPS en producción", async () => {
    const { originProblem } = await access();
    const h = new Headers({ host: "lamina.cupula.com.ec", "x-forwarded-proto": "http" });
    expect(originProblem(h, "https://lamina.cupula.com.ec", "production")).toBe("Se requiere HTTPS");
    expect(originProblem(new Headers({ host: "lamina.cupula.com.ec", "x-forwarded-proto": "https" }), "https://lamina.cupula.com.ec", "production")).toBeNull();
    expect(originProblem(new Headers({ host: "localhost:3100" }), "https://lamina.cupula.com.ec", "production")).toBe("Host no permitido");
    expect(originProblem(new Headers({ host: "lamina.cupula.com.ec", "x-forwarded-proto": "https", origin: "https://otro.com" }), "https://lamina.cupula.com.ec", "production")).toBe("Origin no permitido");
  });
});
