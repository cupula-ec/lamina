import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { workflow as wf, hashJson, consumeQuota, DEFAULT_QUOTAS, schema } from "../src";
import { eq } from "drizzle-orm";
import { testDb, mkUser } from "./helpers";
import { LaminaError } from "@lamina/contracts";

let h: Awaited<ReturnType<typeof testDb>>;
beforeAll(async () => { h = await testDb(); });
afterAll(async () => { await h.pool.end(); });

const input = { title: "t", topic: "Derivadas", level: "U", objective: "o" };
const code = async (p: Promise<unknown>) => { try { await p; return "ok"; } catch (e) { return e instanceof LaminaError ? e.code : "other"; } };

async function toContentReview(owner: string) {
  const p = await wf.createPresentation(h.db, owner, input);
  await wf.beginContentGeneration(h.db, p.id, owner);
  const c = { a: 1 };
  const v = await wf.contentGenerated(h.db, p.id, { content: c, sha256: hashJson(c), parentId: null });
  return { p, v };
}

describe("workflow", () => {
  it("camino feliz hasta publicar", async () => {
    const o = await mkUser(h.db);
    const { p, v } = await toContentReview(o);
    await wf.approveContent(h.db, p.id, o, v.id, v.sha256);
    await wf.beginDesign(h.db, p.id, o);
    const d = { slides: 1 };
    const dv = await wf.designGenerated(h.db, p.id, { deck: d, sha256: hashJson(d), contentVersionId: v.id, parentId: null });
    await wf.approveDesign(h.db, p.id, o, dv.id, dv.sha256);
    await wf.beginPolish(h.db, p.id, o);
    const fv = await wf.polishGenerated(h.db, p.id, { deck: { slides: 2 }, sha256: hashJson({ slides: 2 }) });
    const r = await wf.publish(h.db, p.id, o, "link");
    expect(r.presentation.stage).toBe("published");
    expect(r.presentation.publishedDeckVersionId).toBe(fv.id);
    expect(r.token).toBeTruthy();
    expect(r.presentation.shareTokenHash).not.toBe(r.token);
  });

  it("no se puede pasar a diseño sin aprobar contenido", async () => {
    const o = await mkUser(h.db);
    const { p } = await toContentReview(o);
    expect(await code(wf.beginDesign(h.db, p.id, o))).toBe("invalid_transition");
    const q = await wf.createPresentation(h.db, o, input);
    expect(await code(wf.beginDesign(h.db, q.id, o))).toBe("invalid_transition");
  });

  it("aprobar exige versión vigente y hash correcto", async () => {
    const o = await mkUser(h.db);
    const { p, v } = await toContentReview(o);
    expect(await code(wf.approveContent(h.db, p.id, o, v.id, "deadbeef"))).toBe("stale_version");
    const edited = await wf.saveTeacherContent(h.db, p.id, o, { content: { a: 2 }, sha256: hashJson({ a: 2 }), baseVersionId: v.id });
    expect(await code(wf.approveContent(h.db, p.id, o, v.id, v.sha256))).toBe("stale_version");
    expect(await code(wf.approveContent(h.db, p.id, o, edited.id, edited.sha256))).toBe("ok");
  });

  it("editar con base obsoleta falla (stale_version)", async () => {
    const o = await mkUser(h.db);
    const { p, v } = await toContentReview(o);
    await wf.saveTeacherContent(h.db, p.id, o, { content: { a: 2 }, sha256: "x", baseVersionId: v.id });
    expect(await code(wf.saveTeacherContent(h.db, p.id, o, { content: { a: 3 }, sha256: "y", baseVersionId: v.id }))).toBe("stale_version");
  });

  it("otro usuario no ve ni transiciona la presentación (not_found)", async () => {
    const o = await mkUser(h.db);
    const x = await mkUser(h.db);
    const { p, v } = await toContentReview(o);
    expect(await code(wf.approveContent(h.db, p.id, x, v.id, v.sha256))).toBe("not_found");
    expect(await code(wf.getPresentationFor(h.db, p.id, x))).toBe("not_found");
  });

  it("transiciones inválidas: publicar desde design_review, pulir sin aprobar, doble aprobación", async () => {
    const o = await mkUser(h.db);
    const { p, v } = await toContentReview(o);
    expect(await code(wf.publish(h.db, p.id, o, "public"))).toBe("invalid_transition");
    expect(await code(wf.beginPolish(h.db, p.id, o))).toBe("invalid_transition");
    await wf.approveContent(h.db, p.id, o, v.id, v.sha256);
    expect(await code(wf.approveContent(h.db, p.id, o, v.id, v.sha256))).toBe("invalid_transition");
    expect(await code(wf.approveDesign(h.db, p.id, o, v.id, v.sha256))).toBe("invalid_transition");
  });

  it("el diseño debe corresponder al contenido aprobado", async () => {
    const o = await mkUser(h.db);
    const { p, v } = await toContentReview(o);
    await wf.approveContent(h.db, p.id, o, v.id, v.sha256);
    await wf.beginDesign(h.db, p.id, o);
    expect(await code(wf.designGenerated(h.db, p.id, { deck: {}, sha256: "x", contentVersionId: crypto.randomUUID(), parentId: null }))).toBe("stale_version");
  });

  it("doble clic concurrente: solo una beginContentGeneration prospera", async () => {
    const o = await mkUser(h.db);
    const p = await wf.createPresentation(h.db, o, input);
    const rs = await Promise.all([1, 2, 3].map(() => code(wf.beginContentGeneration(h.db, p.id, o))));
    expect(rs.filter((r) => r === "ok")).toHaveLength(1);
  });

  it("fallo → failed_recoverable → reanudar vuelve a la etapa en ejecución; quota_wait igual", async () => {
    const o = await mkUser(h.db);
    const p = await wf.createPresentation(h.db, o, input);
    const pending = { name: "research", payload: { presentationId: p.id } };
    await wf.beginContentGeneration(h.db, p.id, o, pending);
    expect((await wf.failJob(h.db, p.id, "falló")).stage).toBe("failed_recoverable");
    const r1 = await wf.resumeFromWait(h.db, p.id, o);
    expect(r1.presentation.stage).toBe("researching");
    expect(r1.pending).toEqual(pending);
    const q = await wf.enterQuotaWait(h.db, p.id, new Date(Date.now() - 1000), "cupo");
    expect(q.stage).toBe("quota_wait");
    expect((await wf.dueQuotaWaits(h.db)).map((x) => x.id)).toContain(p.id);
    expect(await code(wf.approveContent(h.db, p.id, o, crypto.randomUUID(), "x"))).toBe("invalid_transition");
    expect((await wf.resumeFromWait(h.db, p.id)).presentation.stage).toBe("researching");
    expect(await code(wf.resumeFromWait(h.db, p.id))).toBe("invalid_transition");
  });

  it("despublicar revoca token y snapshot; regenerar token cambia el hash", async () => {
    const o = await mkUser(h.db);
    const { p, v } = await toContentReview(o);
    await wf.approveContent(h.db, p.id, o, v.id, v.sha256);
    await wf.beginDesign(h.db, p.id, o);
    const dv = await wf.designGenerated(h.db, p.id, { deck: {}, sha256: hashJson({}), contentVersionId: v.id, parentId: null });
    await wf.approveDesign(h.db, p.id, o, dv.id, dv.sha256);
    await wf.beginPolish(h.db, p.id, o);
    await wf.polishGenerated(h.db, p.id, { deck: {}, sha256: hashJson({}) });
    const pub = await wf.publish(h.db, p.id, o, "link");
    const t2 = await wf.regenerateShareToken(h.db, p.id, o);
    expect(t2).not.toBe(pub.token);
    const un = await wf.unpublish(h.db, p.id, o);
    expect(un.shareTokenHash).toBeNull();
    expect(un.publishedDeckVersionId).toBeNull();
    expect(await code(wf.regenerateShareToken(h.db, p.id, o))).toBe("invalid_transition");
  });
});

describe("revisión de seguridad", () => {
  it("cuota 0 bloquea incluso el primer uso", async () => {
    const o = await mkUser(h.db);
    await h.db.insert(schema.userProfiles).values({ userId: o, quotaOverrides: { presentation_new: 0 } });
    expect(await code(consumeQuota(h.db, o, "presentation_new"))).toBe("quota_exceeded");
  });
  it("máx. 2 trabajos simultáneos por docente", async () => {
    const o = await mkUser(h.db);
    const ps = [];
    for (let i = 0; i < 3; i++) ps.push(await wf.createPresentation(h.db, o, input));
    expect(await code(wf.beginContentGeneration(h.db, ps[0]!.id, o))).toBe("ok");
    expect(await code(wf.beginContentGeneration(h.db, ps[1]!.id, o))).toBe("ok");
    expect(await code(wf.beginContentGeneration(h.db, ps[2]!.id, o))).toBe("job_in_progress");
  });
  it("cancelPending vuelve a la versión anterior y permite aprobar; failStale detecta trabajos atascados", async () => {
    const o = await mkUser(h.db);
    const { p, v } = await toContentReview(o);
    await wf.beginContentGeneration(h.db, p.id, o, { name: "content.generate", payload: {} });
    await wf.failJob(h.db, p.id, "falló");
    expect((await wf.cancelPending(h.db, p.id, o)).stage).toBe("content_review");
    expect(await code(wf.approveContent(h.db, p.id, o, v.id, v.sha256))).toBe("ok");
    const q = await toContentReview(o);
    await wf.beginContentGeneration(h.db, q.p.id, o, { name: "content.generate", payload: {} });
    expect(await wf.failStale(h.db, 45)).toBe(0);
    expect(await wf.failStale(h.db, 45, new Date(Date.now() + 3600_000))).toBeGreaterThanOrEqual(1);
    expect((await wf.getPresentationFor(h.db, q.p.id, o)).stage).toBe("failed_recoverable");
  });
  it("publicar registra el sha de la versión final", async () => {
    const o = await mkUser(h.db);
    const { p, v } = await toContentReview(o);
    await wf.approveContent(h.db, p.id, o, v.id, v.sha256);
    await wf.beginDesign(h.db, p.id, o);
    const dv = await wf.designGenerated(h.db, p.id, { deck: {}, sha256: hashJson({}), contentVersionId: v.id, parentId: null });
    await wf.approveDesign(h.db, p.id, o, dv.id, dv.sha256);
    await wf.beginPolish(h.db, p.id, o);
    const fv = await wf.polishGenerated(h.db, p.id, { deck: { a: 1 }, sha256: hashJson({ a: 1 }) });
    await wf.publish(h.db, p.id, o, "public");
    const ap = await h.db.select().from(schema.approvals).where(eq(schema.approvals.versionId, fv.id));
    expect(ap.find((a) => a.kind === "final")?.sha256).toBe(fv.sha256);
  });
});

describe("cuotas", () => {
  it("consume hasta el límite y luego rechaza (atómico bajo concurrencia)", async () => {
    const o = await mkUser(h.db);
    const n = DEFAULT_QUOTAS.component_request;
    const rs = await Promise.all(Array.from({ length: n + 3 }, () => code(consumeQuota(h.db, o, "component_request"))));
    expect(rs.filter((r) => r === "ok")).toHaveLength(n);
    expect(rs.filter((r) => r === "quota_exceeded")).toHaveLength(3);
  });
});
