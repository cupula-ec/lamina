/**
 * Flujo completo de una IA externa contra un Lámina en marcha: crea, envía contenido, (el docente aprueba: aquí se simula en BD),
 * envía el diseño y espera el render. Uso: MCP_SMOKE_KEEP=1 pnpm tsx scripts/mcp-smoke.ts … (imprime un token) y luego
 * pnpm --filter @lamina/web tsx scripts/mcp-flow.ts <token> <correo-del-docente>
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { eq } from "drizzle-orm";
import { schema, workflow as wf } from "@lamina/db";
import { deckFromContent } from "@lamina/components";
import type { ContentDraft } from "@lamina/contracts";
import { getDb } from "../src/lib/db";

const [token, email] = process.argv.slice(2);
const BASE = process.env.APP_URL ?? "http://localhost:3100";
const c = new Client({ name: "flow", version: "1" });
await c.connect(new StreamableHTTPClientTransport(new URL(`${BASE}/api/mcp`), { requestInit: { headers: { Authorization: `Bearer ${token}` } } }));
const call = async (name: string, args: Record<string, unknown>) => { const r = await c.callTool({ name, arguments: args }); return JSON.parse((r.content as { text: string }[])[0]!.text); };
const show = (k: string, v: unknown) => console.log(`\n## ${k}\n${JSON.stringify(v, null, 2)}`);

const draft: ContentDraft = {
  schemaVersion: 1, meta: { topic: "La regla de la cadena", level: "Primer ciclo", objective: "Derivar funciones compuestas", language: "es" },
  sections: [
    { id: "s1", title: "Composición de funciones", locked: false, slidesHint: [
      { id: "h1", intent: "Regla de la cadena", blocks: [{ id: "b1", type: "formula", origin: "generated", sourceRefs: [], latex: "\\frac{d}{dx}f(g(x))=f'(g(x))\\,g'(x)", caption: "Derivada de una composición" }] },
      { id: "h2", intent: "Ejemplo resuelto", blocks: [{ id: "b2", type: "example", origin: "generated", sourceRefs: [], problem: "Deriva $h(x)=(3x+1)^2$.", steps: [{ latex: "h'(x)=2(3x+1)\\cdot 3", text: "Se aplica la regla de la cadena" }, { latex: "h'(x)=6(3x+1)", text: "Se simplifica" }], answer: "$h'(x)=6(3x+1)$" }] },
    ] },
    { id: "s2", title: "Resumen y práctica", locked: false, slidesHint: [{ id: "h3", intent: "Ideas clave", blocks: [{ id: "b3", type: "text", origin: "generated", sourceRefs: [], md: "- Deriva la función externa\n- Multiplica por la derivada de la interna" }] }] },
  ],
  warnings: [],
};
const list = await call("list_presentations", {});
const created = list.presentations.find((p: { stage: string; origin: string }) => p.stage === "draft" && p.origin === "mcp") ?? (await call("create_presentation", { topic: draft.meta.topic, level: draft.meta.level, objective: draft.meta.objective, subject: "Cálculo I" }));
show("create_presentation", { id: created.id, url: created.url });
const sub = await call("submit_content_draft", { id: created.id, draft, baseVersionId: null });
show("submit_content_draft", sub);

const db = getDb();
await wf.approveContent(db, created.id, (await db.select().from(schema.user).where(eq(schema.user.email, email!)))[0]!.id, sub.versionId, sub.sha256);
console.log("\n(el docente aprueba el contenido en la UI; aquí se simula en la BD)");

const deck = deckFromContent(draft, "Docente MCP", { themeId: "calculo-editorial" });
const val = await call("validate_deck", { id: created.id, deck });
show("validate_deck", val);
const sd = await call("submit_deck", { id: created.id, deck, baseVersionId: null });
show("submit_deck", sd);
for (let i = 0; i < 40; i++) {
  const r = await call("get_render_issues", { id: created.id });
  if (r.status === "ready") { show("get_render_issues", r); break; }
  await new Promise((r) => setTimeout(r, 2000));
}
show("get_presentation", (({ id, stage, origin, currentContentVersion, currentDeckVersion, renderIssues, nextStep, url }) => ({ id, stage, origin, currentContentVersion, currentDeckVersion, renderIssues, nextStep, url }))(await call("get_presentation", { id: created.id })));
process.exit(0);
