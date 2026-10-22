import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { DeckDocument, LaminaError } from "@lamina/contracts";
import { hashJson, schema, workflow as wf } from "../src";
import { mkUser, testDb } from "./helpers";

let h: Awaited<ReturnType<typeof testDb>>;
beforeAll(async () => { h = await testDb("lamina_branding_entry_test"); });
afterAll(async () => { await h.pool.end(); });

const code = async (p: Promise<unknown>) => { try { await p; return "ok"; } catch (e) { return e instanceof LaminaError ? e.code : "other"; } };
const input = { title: "t", topic: "Derivadas", level: "U", objective: "o" };
const deckWith = (branding: unknown, extra: Record<string, unknown> = {}) => ({
  schemaVersion: 1, engineVersion: "1", themeId: "lamina-claro",
  meta: { title: "t", topic: "t", level: "u", language: "es", branding, ...extra },
  slides: [{ id: "s", layout: "title", slots: { main: { componentId: "Title", version: "1.0.0", props: { title: "x" } } }, notes: "", build: { steps: [] }, transition: "fade" }],
});
const brandingOf = async (versionId: string) => (DeckDocument.parse((await h.db.select().from(schema.deckVersions).where(eq(schema.deckVersions.id, versionId)))[0]!.deck)).meta.branding;

async function toDesignReview(owner: string, subject?: string) {
  const p = await wf.createPresentation(h.db, owner, { ...input, subject });
  await wf.beginContentGeneration(h.db, p.id, owner);
  const v = await wf.contentGenerated(h.db, p.id, { content: { a: 1 }, sha256: hashJson({ a: 1 }), parentId: null });
  await wf.approveContent(h.db, p.id, owner, v.id, v.sha256);
  await wf.beginDesign(h.db, p.id, owner);
  const d = deckWith({ teacher: "x" });
  const dv = await wf.designGenerated(h.db, p.id, { deck: d, sha256: hashJson(d), contentVersionId: v.id, parentId: null });
  await wf.designFinish(h.db, p.id, dv.id);
  return { p, v, dv };
}

describe("la marca del deck la fija el servidor (el cliente no la controla)", () => {
  it("saveEditedDeck: personalLogoUrl de otro usuario no se conserva; la marca es la del dueño y el hash se recalcula", async () => {
    const o = await mkUser(h.db); const other = await mkUser(h.db);
    const { p, dv } = await toDesignReview(o, "Cálculo I");
    const evil = deckWith({ personalLogoUrl: `/api/branding/personal/${other}?v=abcdef01`, teacher: "Impostor", institution: { name: "Falsa", short: "F" } });
    const row = await wf.saveEditedDeck(h.db, p.id, o, { baseVersionId: dv.id, deck: evil, sha256: hashJson(evil), note: "e" });
    const b = await brandingOf(row.id);
    expect(b?.personalLogoUrl).toBeUndefined();
    expect(b?.institution).toBeUndefined();
    expect(b).toMatchObject({ teacher: o, subject: "Cálculo I" });
    expect(row.sha256).toBe(hashJson(row.deck));
    expect(JSON.stringify(row.deck)).not.toContain(other);
  });

  it("mcpDeckSubmitted: igual, sustituye la marca enviada por la del dueño", async () => {
    const o = await mkUser(h.db); const other = await mkUser(h.db);
    await h.db.insert(schema.userProfiles).values({ userId: o, personalLogoPath: `${o}-abcd1234.png`, personalLogoMime: "image/png" });
    const p = await wf.createPresentation(h.db, o, input);
    await wf.beginContentGeneration(h.db, p.id, o);
    const v = await wf.contentGenerated(h.db, p.id, { content: { a: 1 }, sha256: hashJson({ a: 1 }), parentId: null });
    await wf.approveContent(h.db, p.id, o, v.id, v.sha256);
    const evil = deckWith({ personalLogoUrl: `/api/branding/personal/${other}`, teacher: "Impostor" });
    const row = await wf.mcpDeckSubmitted(h.db, p.id, o, { deck: evil, sha256: hashJson(evil), baseVersionId: null, maxVersions: 5 });
    const b = await brandingOf(row.id);
    expect(b?.personalLogoUrl).toMatch(new RegExp(`^/api/branding/personal/${o}\\?v=[0-9a-f]{8}$`));
    expect(b?.teacher).toBe(o);
    expect(JSON.stringify(row.deck)).not.toContain(other);
  });

  it("saveEditedDeck con meta: materia/período/grupo y versión van en una transacción (versión obsoleta = nada cambia)", async () => {
    const o = await mkUser(h.db);
    const { p, dv } = await toDesignReview(o, "Original");
    const d = deckWith({});
    expect(await code(wf.saveEditedDeck(h.db, p.id, o, { baseVersionId: crypto.randomUUID(), deck: d, sha256: hashJson(d), note: "e", meta: { subject: "Nueva", period: null, groupName: null } }))).toBe("stale_version");
    expect((await h.db.select().from(schema.presentations).where(eq(schema.presentations.id, p.id)))[0]!.subject).toBe("Original");
    const row = await wf.saveEditedDeck(h.db, p.id, o, { baseVersionId: dv.id, deck: d, sha256: hashJson(d), note: "e", meta: { subject: "Nueva", period: "P1", groupName: null } });
    expect((await h.db.select().from(schema.presentations).where(eq(schema.presentations.id, p.id)))[0]).toMatchObject({ subject: "Nueva", period: "P1", groupName: null });
    expect(await brandingOf(row.id)).toMatchObject({ subject: "Nueva", period: "P1" });
  });
});

describe("styleChanged", () => {
  it("crea una versión `style` del docente, guarda la elección y rechaza base obsoleta o estilo repetido", async () => {
    const o = await mkUser(h.db);
    const { p, dv } = await toDesignReview(o);
    expect(await code(wf.styleChanged(h.db, p.id, o, { baseVersionId: crypto.randomUUID(), themeId: "pizarra", accent: "a" }))).toBe("stale_version");
    const row = await wf.styleChanged(h.db, p.id, o, { baseVersionId: dv.id, themeId: "pizarra", accent: "b" });
    expect(row).toMatchObject({ kind: "style", authorKind: "docente", parentId: dv.id });
    const cur = (await h.db.select().from(schema.presentations).where(eq(schema.presentations.id, p.id)))[0]!;
    expect(cur).toMatchObject({ currentDeckVersionId: row.id, themeId: "pizarra:b" });
    expect(await code(wf.styleChanged(h.db, p.id, o, { baseVersionId: row.id, themeId: "pizarra", accent: "b" }))).toBe("invalid_input");
    expect(await code(wf.styleChanged(h.db, p.id, await mkUser(h.db), { baseVersionId: row.id, themeId: "lamina-claro", accent: "a" }))).toBe("not_found");
  });
});
