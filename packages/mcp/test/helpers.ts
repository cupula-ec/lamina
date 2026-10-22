import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createDb, runMigrations, schema, workflow as wf, hashJson } from "@lamina/db";
import { deckFromContent } from "@lamina/components";
import type { ContentDraft } from "@lamina/contracts";
import { createLaminaMcpServer, RateLimiter, type McpDeps, type McpPrincipal } from "../src";

const BASE = process.env.TEST_DATABASE_URL ?? "postgres://lamina:lamina@127.0.0.1:55432/lamina_test";

export async function testDb(name: string) {
  const admin = createDb(BASE.replace(/\/[^/]+$/, "/postgres"), 1);
  await admin.pool.query(`drop database if exists ${name} with (force)`);
  await admin.pool.query(`create database ${name}`);
  await admin.pool.end();
  const h = createDb(BASE.replace(/\/[^/]+$/, `/${name}`), 4);
  await runMigrations(h.db);
  return h;
}

let n = 0;
export async function mkUser(db: ReturnType<typeof createDb>["db"], quota: Record<string, number> = {}) {
  const id = `mu${++n}`;
  await db.insert(schema.user).values({ id, name: `Docente ${id}`, email: `${id}@t.test` });
  await db.insert(schema.userProfiles).values({ userId: id, consentAt: new Date(), quotaOverrides: quota });
  return id;
}

export const SCOPES = ["presentations:read", "presentations:write"];

export async function connect(db: ReturnType<typeof createDb>["db"], who: Partial<McpPrincipal> & { userId: string }, extra: Partial<McpDeps> = {}) {
  const renders: [string, string][] = [];
  const deps: McpDeps = { db, appUrl: "http://localhost:3100", enqueueRender: async (p, d) => { renders.push([p, d]); }, limiter: new RateLimiter(1000), ...extra };
  const server = createLaminaMcpServer(deps, { clientId: "cli-test", scopes: SCOPES, ...who });
  const [a, b] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test", version: "0" });
  await Promise.all([server.connect(a), client.connect(b)]);
  const call = async (name: string, args: Record<string, unknown>) => {
    const r = await client.callTool({ name, arguments: args });
    const t = (r.content as { text: string }[])[0]!.text;
    let data: any; try { data = JSON.parse(t); } catch { data = { error: { code: "mcp_invalid_input", message: t } }; }
    return { isError: !!r.isError, data };
  };
  return { client, call, renders, close: () => client.close() };
}

export const DRAFT: ContentDraft = {
  schemaVersion: 1,
  meta: { topic: "La derivada", level: "Primer ciclo", objective: "Calcular derivadas de potencias", language: "es" },
  sections: [
    { id: "s1", title: "Idea de derivada", locked: false, slidesHint: [
      { id: "h1", intent: "Definición de derivada", blocks: [{ id: "b1", type: "formula", origin: "generated", sourceRefs: [], latex: "f'(a)=\\lim_{h\\to 0}\\frac{f(a+h)-f(a)}{h}", caption: "Definición" }] },
      { id: "h2", intent: "Derivada de x al cuadrado", blocks: [{ id: "b2", type: "derivation", origin: "generated", sourceRefs: [], steps: [{ latex: "(x+h)^2=x^2+2xh+h^2", explanation: "Se expande" }, { latex: "\\frac{(x+h)^2-x^2}{h}=2x+h", explanation: "Se simplifica" }] }] },
    ] },
    { id: "s2", title: "Resumen y práctica", locked: false, slidesHint: [
      { id: "h3", intent: "Ideas clave", blocks: [{ id: "b3", type: "text", origin: "generated", sourceRefs: [], md: "- La derivada mide la pendiente\n- Regla de la potencia: $(x^n)'=nx^{n-1}$" }] },
    ] },
  ],
  warnings: [],
};

export const validDeck = () => JSON.parse(JSON.stringify(deckFromContent(DRAFT, "Docente"))) as Record<string, any>;

/** Lleva una presentación a content_approved (lo que haría el docente en la UI). */
export async function approveAs(db: ReturnType<typeof createDb>["db"], presentationId: string, userId: string) {
  const [p] = await db.select().from(schema.presentations).where((await import("drizzle-orm")).eq(schema.presentations.id, presentationId));
  const [v] = await db.select().from(schema.contentVersions).where((await import("drizzle-orm")).eq(schema.contentVersions.id, p!.currentContentVersionId!));
  await wf.approveContent(db, presentationId, userId, v!.id, v!.sha256);
  return v!;
}
export { hashJson };
