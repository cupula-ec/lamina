import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { THEME_IDS } from "@lamina/contracts";
import { schema, workflow as wf } from "@lamina/db";
import { RateLimiter } from "../src";
import { scanJson } from "../src/safety";
import { DRAFT, approveAs, connect, mkUser, testDb, validDeck } from "./helpers";

let h: Awaited<ReturnType<typeof testDb>>;
beforeAll(async () => { h = await testDb("lamina_mcp_test"); });
afterAll(async () => { await h.pool.end(); });

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));
async function created(userId: string, c?: Awaited<ReturnType<typeof connect>>) {
  const cli = c ?? (await connect(h.db, { userId }));
  const r = await cli.call("create_presentation", { topic: "La derivada", level: "Primer ciclo", objective: "Calcular derivadas", subject: "Cálculo I" });
  expect(r.isError).toBe(false);
  return { cli, id: r.data.id as string };
}
async function toContentReview(userId: string) {
  const { cli, id } = await created(userId);
  const s = await cli.call("submit_content_draft", { id, draft: clone(DRAFT), baseVersionId: null });
  expect(s.isError, JSON.stringify(s.data)).toBe(false);
  return { cli, id, version: s.data };
}
async function toApproved(userId: string) {
  const x = await toContentReview(userId);
  await approveAs(h.db, x.id, userId);
  return x;
}

describe("superficie MCP", () => {
  it("expone exactamente las tools previstas y ninguna aprueba, publica, borra ni comparte", async () => {
    const u = await mkUser(h.db);
    const { client } = await connect(h.db, { userId: u });
    const names = (await client.listTools()).tools.map((t) => t.name).sort();
    expect(names).toEqual(["create_presentation", "get_presentation", "get_render_issues", "list_presentations", "submit_content_draft", "submit_deck", "validate_deck"]);
    expect(names.join(" ")).not.toMatch(/approve|publish|delete|share|aprob|public|borra/);
  });

  it("publica los resources previstos y se pueden leer", async () => {
    const u = await mkUser(h.db);
    const { client } = await connect(h.db, { userId: u });
    const uris = (await client.listResources()).resources.map((r) => r.uri).sort();
    expect(uris).toEqual(["lamina://catalog", "lamina://guides/authoring", "lamina://layouts", "lamina://schemas/content-draft", "lamina://schemas/deck", "lamina://themes"]);
    const read = async (uri: string) => (await client.readResource({ uri })).contents[0] as { text: string; mimeType: string };
    expect(JSON.parse((await read("lamina://themes")).text)).toHaveLength(THEME_IDS.length);
    expect(JSON.parse((await read("lamina://catalog")).text).length).toBeGreaterThanOrEqual(16);
    expect(JSON.parse((await read("lamina://layouts")).text).length).toBeGreaterThanOrEqual(17);
    expect(JSON.parse((await read("lamina://schemas/deck")).text).properties.slides).toBeTruthy();
    expect(JSON.parse((await read("lamina://schemas/content-draft")).text).properties.sections).toBeTruthy();
    const guide = await read("lamina://guides/authoring");
    expect(guide.mimeType).toBe("text/markdown");
    expect(guide.text).toContain("no puedes aprobar");
    expect((await client.listResourceTemplates()).resourceTemplates.map((t) => t.uriTemplate)).toContain("lamina://presentations/{id}");
  });
});

describe("create_presentation / get_presentation", () => {
  it("crea en borrador con origen mcp, consume cuota y deja evento sin contenido", async () => {
    const u = await mkUser(h.db);
    const { cli, id } = await created(u);
    const p = await cli.call("get_presentation", { id });
    expect(p.data).toMatchObject({ stage: "draft", origin: "mcp", subject: "Cálculo I", canSubmitContent: true, canSubmitDeck: false });
    const ev = await h.db.select().from(schema.events).where(eq(schema.events.presentationId, id));
    expect(ev.map((e) => e.name)).toContain("mcp.presentation_created");
    expect(JSON.stringify(ev)).not.toContain("derivada");
  });

  it("respeta la cuota diaria de presentaciones nuevas", async () => {
    const u = await mkUser(h.db, { presentation_new: 1 });
    const cli = await connect(h.db, { userId: u });
    expect((await cli.call("create_presentation", { topic: "A", level: "B", objective: "C" })).isError).toBe(false);
    const r = await cli.call("create_presentation", { topic: "A", level: "B", objective: "C" });
    expect(r.isError).toBe(true);
    expect(r.data.error.code).toBe("quota_exceeded");
  });

  it("themeId inválido se rechaza", async () => {
    const u = await mkUser(h.db);
    const { client } = await connect(h.db, { userId: u });
    const r = await client.callTool({ name: "create_presentation", arguments: { topic: "A", level: "B", objective: "C", themeId: "no-existe" } });
    expect(r.isError).toBe(true);
  });
});

describe("submit_content_draft", () => {
  it("válido: versión mcp en content_review, avisos de verificación y enlace", async () => {
    const u = await mkUser(h.db);
    const { cli, id, version } = await toContentReview(u);
    expect(version).toMatchObject({ stage: "content_review", idempotent: false });
    expect(version.verification.verified).toBeGreaterThan(0);
    const [p] = await h.db.select().from(schema.presentations).where(eq(schema.presentations.id, id));
    expect(p!.stage).toBe("content_review");
    const [v] = await h.db.select().from(schema.contentVersions).where(eq(schema.contentVersions.id, version.versionId));
    expect(v!.authorKind).toBe("mcp");
    expect((await cli.call("get_presentation", { id, includeContent: true })).data.content.draft.meta.topic).toBe("La derivada");
  });

  it("reenviar lo mismo es idempotente; con base obsoleta devuelve stale_version", async () => {
    const u = await mkUser(h.db);
    const { cli, id, version } = await toContentReview(u);
    const again = await cli.call("submit_content_draft", { id, draft: clone(DRAFT), baseVersionId: null });
    expect(again.data).toMatchObject({ idempotent: true, versionId: version.versionId });
    const d2 = clone(DRAFT); d2.sections[1]!.title = "Cierre";
    const ok = await cli.call("submit_content_draft", { id, draft: d2, baseVersionId: version.versionId });
    expect(ok.isError).toBe(false);
    const d3 = clone(DRAFT); d3.sections[1]!.title = "Distinto";
    const stale = await cli.call("submit_content_draft", { id, draft: d3, baseVersionId: version.versionId });
    expect(stale.data.error.code).toBe("stale_version");
    const stale2 = await cli.call("submit_content_draft", { id, draft: clone(DRAFT), baseVersionId: null });
    expect(stale2.data.error.code).toBe("stale_version");
  });

  it("esquema inválido, LaTeX hostil o inválido y payload gigante se rechazan con mensaje claro", async () => {
    const u = await mkUser(h.db);
    const { cli, id } = await created(u);
    const bad = clone(DRAFT) as any; delete bad.sections;
    expect((await cli.call("submit_content_draft", { id, draft: bad, baseVersionId: null })).data.error.code).toBe("validation_failed");

    for (const latex of ["\\href{javascript:alert(1)}{x}", "\\includegraphics{http://evil/x.png}", "\\frac{", "\\def\\a{\\a\\a}\\a", "x".repeat(2500)]) {
      const d = clone(DRAFT) as any; d.sections[0].slidesHint[0].blocks[0].latex = latex;
      const r = await cli.call("submit_content_draft", { id, draft: d, baseVersionId: null });
      expect(r.isError, latex.slice(0, 30)).toBe(true);
      expect(["validation_failed"]).toContain(r.data.error.code);
    }
    const huge = clone(DRAFT) as any;
    huge.sections[0].slidesHint[0].blocks[0].caption = "a".repeat(100);
    huge.sections[0].slidesHint[0].blocks.push(...Array.from({ length: 5 }, (_, i) => ({ id: `x${i}`, type: "diagramSpec", kind: "generic", description: "d", data: { blob: "z".repeat(450_000) } })));
    const r = await cli.call("submit_content_draft", { id, draft: huge, baseVersionId: null });
    expect(r.data.error.code).toBe("payload_too_large");
    const [p] = await h.db.select().from(schema.presentations).where(eq(schema.presentations.id, id));
    expect(p!.stage).toBe("draft");
  });

  it("anidación profunda y clave __proto__ se rechazan", async () => {
    const u = await mkUser(h.db);
    const { cli, id } = await created(u);
    let deep: any = { v: 1 }; for (let i = 0; i < 30; i++) deep = { n: deep };
    const d = clone(DRAFT) as any; d.sections[0].slidesHint[0].blocks.push({ id: "z", type: "diagramSpec", kind: "generic", description: "d", data: deep });
    expect((await cli.call("submit_content_draft", { id, draft: d, baseVersionId: null })).data.error.code).toBe("invalid_input");
    expect(() => scanJson(JSON.parse('{"a":{"__proto__":{"x":1}}}'), "x")).toThrow(/no permitida/);
  });

  it("no se puede enviar contenido con el contenido ya aprobado", async () => {
    const u = await mkUser(h.db);
    const { cli, id, version } = await toApproved(u);
    const r = await cli.call("submit_content_draft", { id, draft: clone(DRAFT), baseVersionId: version.versionId });
    expect(r.data.error.code).toBe("invalid_transition");
  });
});

describe("validate_deck / submit_deck", () => {
  it("sin contenido aprobado no se puede enviar diseño", async () => {
    const u = await mkUser(h.db);
    const { cli, id } = await toContentReview(u);
    const r = await cli.call("submit_deck", { id, deck: validDeck(), baseVersionId: null });
    expect(r.data.error.code).toBe("invalid_transition");
  });

  it("deck válido: design_review, versión mcp, render encolado; get_render_issues pending→ready", async () => {
    const u = await mkUser(h.db);
    const { cli, id } = await toApproved(u);
    const v = await cli.call("validate_deck", { deck: validDeck(), id });
    expect(v.data).toMatchObject({ valid: true, fidelityChecked: true });
    const s = await cli.call("submit_deck", { id, deck: validDeck(), baseVersionId: null });
    expect(s.isError, JSON.stringify(s.data)).toBe(false);
    expect(cli.renders).toEqual([[id, s.data.versionId]]);
    const [p] = await h.db.select().from(schema.presentations).where(eq(schema.presentations.id, id));
    expect(p).toMatchObject({ stage: "design_review", currentDeckVersionId: s.data.versionId, approvedDeckVersionId: null });
    const [dv] = await h.db.select().from(schema.deckVersions).where(eq(schema.deckVersions.id, s.data.versionId));
    expect(dv).toMatchObject({ authorKind: "mcp", kind: "design" });
    expect((dv!.deck as any).meta.branding.teacher).toBe(`Docente ${u}`);
    const pend = await cli.call("get_render_issues", { id });
    expect(pend.data).toMatchObject({ status: "pending" });
    const slides = (dv!.deck as any).slides as { id: string }[];
    for (const sl of slides) await h.db.insert(schema.renderArtifacts).values({ presentationId: id, deckVersionId: dv!.id, slideId: sl.id, path: "/x.png", issues: sl.id === slides[1]!.id ? [{ slot: "main", kind: "overflow", severity: "error", message: "Se desborda" }] : [] });
    const ready = await cli.call("get_render_issues", { id });
    expect(ready.data).toMatchObject({ status: "ready", errors: 1 });
    expect(ready.data.slides).toHaveLength(1);
    expect(JSON.stringify(ready.data)).not.toContain("/x.png");
    const again = await cli.call("submit_deck", { id, deck: validDeck(), baseVersionId: null });
    expect(again.data).toMatchObject({ idempotent: true, versionId: s.data.versionId });
    const stale = await cli.call("submit_deck", { id, deck: (() => { const d = validDeck(); d.slides[0].notes = "otra"; return d; })(), baseVersionId: null });
    expect(stale.data.error.code).toBe("stale_version");
    const ev = await h.db.select().from(schema.events).where(eq(schema.events.presentationId, id));
    expect(ev.map((e) => e.name)).toContain("mcp.deck_submitted");
  });

  it("componente desconocido, campos con código/HTML, tema inexistente, fórmulas alteradas y 61 slides se rechazan", async () => {
    const u = await mkUser(h.db);
    const { cli, id } = await toApproved(u);
    const call = (deck: unknown) => cli.call("submit_deck", { id, deck, baseVersionId: null });

    const unk = validDeck(); unk.slides[1].slots.main = { componentId: "EvilWidget", version: "1.0.0", props: {} };
    const r1 = await call(unk);
    expect(r1.data.error.code).toBe("validation_failed");
    expect(JSON.stringify(r1.data.error.details.errors)).toMatch(/EvilWidget.*catálogo/);
    expect(JSON.stringify(r1.data.error.details.errors)).toMatch(/interfaz de Lámina/);

    const code = validDeck(); code.slides[1].slots.main.code = "alert(1)";
    expect((await call(code)).data.error.message).toMatch(/no permitida.*code/);
    const html = validDeck(); html.slides[0].html = "<script>alert(1)</script>";
    expect((await call(html)).data.error.message).toMatch(/no permitida.*html/);
    const top = validDeck(); top.script = "x";
    expect((await call(top)).data.error.code).toBe("invalid_input");

    const theme = validDeck(); theme.themeId = "tema-falso";
    expect(JSON.stringify((await call(theme)).data.error.details.errors)).toMatch(/Temas válidos/);

    const fx = JSON.parse(JSON.stringify(validDeck()).replace("f'(a)=\\\\lim_{h\\\\to 0}", "g'(a)=\\\\lim_{h\\\\to 0}"));
    const rf = await call(fx);
    expect(JSON.stringify(rf.data.error.details.errors)).toMatch(/Faltan fórmulas/);

    const many = validDeck(); many.slides = Array.from({ length: 61 }, (_, i) => ({ ...many.slides[0], id: `s${i}` }));
    expect((await call(many)).data.error.code).toBe("payload_too_large");

    const bigProps = validDeck(); bigProps.slides[1].slots.main.props = { items: [{ text: "x".repeat(40_000) }] };
    expect((await call(bigProps)).data.error.code).toBe("payload_too_large");

    const [p] = await h.db.select().from(schema.presentations).where(eq(schema.presentations.id, id));
    expect(p!.stage).toBe("content_approved");
  });

  it("la marca del deck la fija el servidor: un personalLogoUrl ajeno se descarta", async () => {
    const a = await mkUser(h.db), b = await mkUser(h.db);
    await h.db.update(schema.userProfiles).set({ personalLogoPath: "x.png", personalLogoMime: "image/png" }).where(eq(schema.userProfiles.userId, b));
    const { cli, id } = await toApproved(a);
    const d = validDeck();
    d.meta.branding = { personalLogoUrl: `/api/branding/personal/${b}?v=abcd1234`, teacher: "Otro Nombre", institution: { name: "Falsa", short: "FAL" } };
    d.meta.author = "x".repeat(300);
    const r = await cli.call("submit_deck", { id, deck: d, baseVersionId: null });
    expect(r.isError, JSON.stringify(r.data)).toBe(false);
    const [dv] = await h.db.select().from(schema.deckVersions).where(eq(schema.deckVersions.id, r.data.versionId));
    const meta = (dv!.deck as any).meta;
    expect(JSON.stringify(meta)).not.toContain(b);
    expect(meta.branding?.personalLogoUrl).toBeUndefined();
    expect(meta.branding?.institution).toBeUndefined();
    expect(meta.branding.teacher).toBe(`Docente ${a}`);
    expect(meta.author.length).toBeLessThanOrEqual(120);
  });

  it("LaTeX hostil dentro de las props del deck se rechaza", async () => {
    const u = await mkUser(h.db);
    const { cli, id } = await toApproved(u);
    const d = validDeck();
    const s = d.slides.find((x: any) => Object.values<any>(x.slots).some((r) => r.componentId === "FormulaHighlight"))!;
    const slot = Object.values<any>(s.slots).find((r) => r.componentId === "FormulaHighlight")!;
    slot.props.latex = `${slot.props.latex}+\\href{javascript:alert(1)}{x}`;
    const r = await cli.call("validate_deck", { deck: d, id });
    expect(r.data.valid).toBe(false);
  });

  it("máximo de versiones de diseño por presentación", async () => {
    const u = await mkUser(h.db);
    const { cli, id } = await toApproved(u);
    let base: string | null = null;
    for (let i = 0; i < 12; i++) {
      const d = validDeck(); d.slides[0].notes = `v${i}`;
      const r = await cli.call("submit_deck", { id, deck: d, baseVersionId: base });
      expect(r.isError, JSON.stringify(r.data)).toBe(false);
      base = r.data.versionId;
    }
    const d = validDeck(); d.slides[0].notes = "extra";
    const r = await cli.call("submit_deck", { id, deck: d, baseVersionId: base });
    expect(r.data.error.code).toBe("quota_exceeded");
  });
});

describe("aislamiento, alcances, cuotas y límite por token", () => {
  it("la cuenta B no ve ni modifica lo de A", async () => {
    const a = await mkUser(h.db), b = await mkUser(h.db);
    const { id } = await toApproved(a);
    const cb = await connect(h.db, { userId: b });
    expect((await cb.call("get_presentation", { id })).data.error.code).toBe("not_found");
    expect((await cb.call("get_render_issues", { id })).data.error.code).toBe("not_found");
    expect((await cb.call("submit_content_draft", { id, draft: clone(DRAFT), baseVersionId: null })).data.error.code).toBe("not_found");
    expect((await cb.call("submit_deck", { id, deck: validDeck(), baseVersionId: null })).data.error.code).toBe("not_found");
    expect((await cb.call("validate_deck", { id, deck: validDeck() })).data.error.code).toBe("not_found");
    expect((await cb.call("get_presentation", { id: "no-es-uuid" })).isError).toBe(true);
    expect((await cb.call("list_presentations", {})).data.count).toBe(0);
    const res = await cb.client.readResource({ uri: `lamina://presentations/${id}` }).catch((e) => e);
    expect(String(res)).toMatch(/no encontrada/);
    const [p] = await h.db.select().from(schema.presentations).where(eq(schema.presentations.id, id));
    expect(p!.stage).toBe("content_approved");
  });

  it("con solo presentations:read no se puede escribir", async () => {
    const u = await mkUser(h.db);
    const cli = await connect(h.db, { userId: u, scopes: ["presentations:read"] });
    expect((await cli.call("list_presentations", {})).isError).toBe(false);
    const r = await cli.call("create_presentation", { topic: "A", level: "B", objective: "C" });
    expect(r.data.error.code).toBe("insufficient_scope");
    expect((await cli.call("submit_deck", { id: "00000000-0000-0000-0000-000000000000", deck: {}, baseVersionId: null })).data.error.code).toBe("insufficient_scope");
  });

  it("sin ningún alcance de presentaciones todo se rechaza", async () => {
    const u = await mkUser(h.db);
    const cli = await connect(h.db, { userId: u, scopes: [] });
    expect((await cli.call("list_presentations", {})).data.error.code).toBe("insufficient_scope");
  });

  it("cuota mcp_submit y mcp_call", async () => {
    const u = await mkUser(h.db, { mcp_submit: 1, mcp_call: 8 });
    const { cli, id } = await toContentReview(u).catch((e) => { throw e; });
    const d2 = clone(DRAFT); d2.sections[1]!.title = "Otro";
    const [cur] = await h.db.select().from(schema.contentVersions).where(eq(schema.contentVersions.presentationId, id));
    const r = await cli.call("submit_content_draft", { id, draft: d2, baseVersionId: cur!.id });
    expect(r.data.error.code).toBe("quota_exceeded");
    let last: any;
    for (let i = 0; i < 8; i++) last = await cli.call("list_presentations", {});
    expect(last.data.error?.code).toBe("quota_exceeded");
  });

  it("un envío fallido no consume cuota mcp_submit", async () => {
    const u = await mkUser(h.db, { mcp_submit: 1 });
    const { cli, id } = await created(u);
    const bad = clone(DRAFT) as any; bad.sections[0].slidesHint[0].blocks[0].latex = "\\frac{";
    expect((await cli.call("submit_content_draft", { id, draft: bad, baseVersionId: null })).isError).toBe(true);
    expect((await cli.call("submit_content_draft", { id, draft: clone(DRAFT), baseVersionId: null })).isError).toBe(false);
  });

  it("límite de llamadas por minuto y token", async () => {
    const u = await mkUser(h.db);
    const cli = await connect(h.db, { userId: u }, { limiter: new RateLimiter(3) });
    for (let i = 0; i < 3; i++) expect((await cli.call("list_presentations", {})).isError).toBe(false);
    const r = await cli.call("list_presentations", {});
    expect(r.data.error.code).toBe("rate_limited");
    expect(r.data.error.details.retryAfterSeconds).toBeGreaterThan(0);
  });
});

describe("transiciones de workflow para MCP", () => {
  const code = async (p: Promise<unknown>) => { try { await p; return "ok"; } catch (e) { return (e as { code?: string }).code ?? "other"; } };
  it("mcpContentSubmitted solo desde draft/content_review; mcpDeckSubmitted solo desde content_approved/design_review", async () => {
    const u = await mkUser(h.db);
    const p = await wf.createPresentation(h.db, u, { title: "t", topic: "t", level: "l", objective: "o", origin: "mcp" });
    expect(p.origin).toBe("mcp");
    expect(await code(wf.mcpDeckSubmitted(h.db, p.id, u, { deck: {}, sha256: "x", baseVersionId: null, maxVersions: 5 }))).toBe("invalid_transition");
    const v = await wf.mcpContentSubmitted(h.db, p.id, u, { content: { a: 1 }, sha256: "h1", baseVersionId: null });
    expect(await code(wf.mcpDeckSubmitted(h.db, p.id, u, { deck: {}, sha256: "x", baseVersionId: null, maxVersions: 5 }))).toBe("invalid_transition");
    await wf.approveContent(h.db, p.id, u, v.id, "h1");
    expect(await code(wf.mcpContentSubmitted(h.db, p.id, u, { content: { a: 2 }, sha256: "h2", baseVersionId: v.id }))).toBe("invalid_transition");
    await wf.mcpDeckSubmitted(h.db, p.id, u, { deck: { s: 1 }, sha256: "d1", baseVersionId: null, maxVersions: 5 });
    const [cur] = await h.db.select().from(schema.presentations).where(eq(schema.presentations.id, p.id));
    expect(cur!.stage).toBe("design_review");
    const dv = cur!.currentDeckVersionId!;
    await wf.approveDesign(h.db, p.id, u, dv, "d1");
    expect(await code(wf.mcpDeckSubmitted(h.db, p.id, u, { deck: { s: 2 }, sha256: "d2", baseVersionId: dv, maxVersions: 5 }))).toBe("invalid_transition");
    expect(await code(wf.mcpContentSubmitted(h.db, p.id, u, { content: {}, sha256: "z", baseVersionId: null }))).toBe("invalid_transition");
  });

  it("no actúa sobre presentaciones de otro dueño ni en etapas en ejecución", async () => {
    const a = await mkUser(h.db), b = await mkUser(h.db);
    const p = await wf.createPresentation(h.db, a, { title: "t", topic: "t", level: "l", objective: "o" });
    expect(await code(wf.mcpContentSubmitted(h.db, p.id, b, { content: {}, sha256: "x", baseVersionId: null }))).toBe("not_found");
    await wf.beginContentGeneration(h.db, p.id, a);
    expect(await code(wf.mcpContentSubmitted(h.db, p.id, a, { content: {}, sha256: "x", baseVersionId: null }))).toBe("invalid_transition");
  });
});
