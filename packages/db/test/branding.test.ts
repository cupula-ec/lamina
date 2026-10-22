import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { Branding } from "@lamina/contracts";
import { buildBranding, institutionLogoUrl, optionalText, personalLogoUrl, schema, seedInstitutions, workflow as wf } from "../src";
import { mkUser, testDb } from "./helpers";

let h: Awaited<ReturnType<typeof testDb>>;
beforeAll(async () => { h = await testDb("lamina_branding_test"); });
afterAll(async () => { await h.pool.end(); });

describe("seed de instituciones", () => {
  it("es idempotente y no pisa las ediciones del administrador", async () => {
    await seedInstitutions(h.db);
    await seedInstitutions(h.db);
    const rows = await h.db.select().from(schema.institutions).where(eq(schema.institutions.slug, "ups"));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ name: "Universidad Politécnica Salesiana", short: "UPS", primaryColor: "#003976", secondaryColor: "#FCC000", active: true, logoPath: "builtin:ups.png" });
    await h.db.update(schema.institutions).set({ primaryColor: "#112233" }).where(eq(schema.institutions.slug, "ups"));
    await seedInstitutions(h.db);
    const [again] = await h.db.select().from(schema.institutions).where(eq(schema.institutions.slug, "ups"));
    expect(again!.primaryColor).toBe("#112233");
  });
});

describe("buildBranding", () => {
  const pres = (ownerId: string, extra: { subject?: string | null; period?: string | null; groupName?: string | null } = {}) => ({ ownerId, ...extra });

  it("sin perfil ni institución: solo el nombre del docente, sin claves vacías", async () => {
    const u = await mkUser(h.db);
    const b = await buildBranding(h.db, pres(u));
    expect(b).toEqual({ teacher: u });
  });

  it("omite materia/período/grupo vacíos o en blanco y recorta espacios", async () => {
    const u = await mkUser(h.db);
    const b = await buildBranding(h.db, pres(u, { subject: "  Cálculo I ", period: "   ", groupName: "" }));
    expect(b).toEqual({ teacher: u, subject: "Cálculo I" });
    expect(optionalText("  ")).toBeNull();
    expect(optionalText(" x ")).toBe("x");
  });

  it("institución + logo personal + datos: URLs internas y colores válidos", async () => {
    const [ups] = await h.db.select().from(schema.institutions).where(eq(schema.institutions.slug, "ups"));
    const u = await mkUser(h.db);
    await h.db.insert(schema.userProfiles).values({ userId: u, fullName: "Gustavo Bravo Quezada", institutionId: ups!.id, personalLogoPath: `${u}-abcd1234.png`, personalLogoMime: "image/png" });
    const b = await buildBranding(h.db, pres(u, { subject: "Cálculo I", period: "Abr–Ago 2026", groupName: "Grupo 2" }));
    expect(Branding.parse(b)).toEqual(b);
    expect(b.teacher).toBe("Gustavo Bravo Quezada");
    expect(b.institution).toMatchObject({ name: "Universidad Politécnica Salesiana", short: "UPS", colors: { primary: "#112233", secondary: "#FCC000" } });
    expect(b.institution!.logoUrl).toBe(institutionLogoUrl(ups!));
    expect(b.institution!.logoUrl).toMatch(/^\/api\/branding\/institution\/[0-9a-f-]{36}\?v=[0-9a-f]{8}$/);
    expect(b.personalLogoUrl).toBe(personalLogoUrl(u, `${u}-abcd1234.png`));
    expect(b).toMatchObject({ subject: "Cálculo I", period: "Abr–Ago 2026", group: "Grupo 2" });
    expect(JSON.stringify(b)).not.toMatch(/undefined|null|\/data\/|data:/);
  });

  it("un color inválido en BD se ignora en lugar de romper el deck", async () => {
    const [inst] = await h.db.insert(schema.institutions).values({ slug: "color-malo", name: "Colegio X", short: "CX", primaryColor: "azul" }).returning();
    const u = await mkUser(h.db);
    await h.db.insert(schema.userProfiles).values({ userId: u, institutionId: inst!.id });
    const b = await buildBranding(h.db, pres(u));
    expect(b.institution).toEqual({ name: "Colegio X", short: "CX" });
  });

  it("sin logo no hay URL de logo", () => {
    expect(institutionLogoUrl({ id: "x", logoPath: null })).toBeUndefined();
    expect(personalLogoUrl("u", null)).toBeUndefined();
  });
});

describe("metadatos de la presentación", () => {
  it("createPresentation guarda materia, período y grupo", async () => {
    const u = await mkUser(h.db);
    const p = await wf.createPresentation(h.db, u, { title: "t", topic: "T", level: "U", objective: "o", subject: "Física", period: null, groupName: "A" });
    expect(p).toMatchObject({ subject: "Física", period: null, groupName: "A" });
  });
});
