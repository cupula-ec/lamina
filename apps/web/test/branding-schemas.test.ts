import { describe, expect, it } from "vitest";
import { InstitutionInput, MetaFields, ProfileInput, slugify } from "../src/lib/branding-schemas";

describe("ProfileInput", () => {
  it("exige nombre completo (3–160) y limpia espacios", () => {
    expect(ProfileInput.parse({ fullName: "  Gustavo Bravo Quezada  ", institutionId: null }).fullName).toBe("Gustavo Bravo Quezada");
    expect(ProfileInput.safeParse({ fullName: "ab", institutionId: null }).success).toBe(false);
    expect(ProfileInput.safeParse({ fullName: "   ", institutionId: null }).success).toBe(false);
    expect(ProfileInput.safeParse({ fullName: "x".repeat(161), institutionId: null }).success).toBe(false);
  });
  it("la institución es un UUID o null", () => {
    expect(ProfileInput.safeParse({ fullName: "Ana Pérez", institutionId: "00000000-0000-4000-8000-000000000000" }).success).toBe(true);
    expect(ProfileInput.safeParse({ fullName: "Ana Pérez", institutionId: "ups" }).success).toBe(false);
    expect(ProfileInput.safeParse({ fullName: "Ana Pérez", institutionId: "1; drop table" }).success).toBe(false);
  });
});

describe("MetaFields (materia, período, grupo)", () => {
  it("vacío o en blanco → null; con texto → recortado", () => {
    expect(MetaFields.parse({})).toEqual({ subject: null, period: null, group: null });
    expect(MetaFields.parse({ subject: "  ", period: "", group: undefined })).toEqual({ subject: null, period: null, group: null });
    expect(MetaFields.parse({ subject: " Cálculo I ", period: "Abr–Ago 2026", group: "Grupo 2" })).toEqual({ subject: "Cálculo I", period: "Abr–Ago 2026", group: "Grupo 2" });
  });
  it("respeta los máximos 160/80/80", () => {
    expect(MetaFields.safeParse({ subject: "x".repeat(160) }).success).toBe(true);
    expect(MetaFields.safeParse({ subject: "x".repeat(161) }).success).toBe(false);
    expect(MetaFields.safeParse({ period: "x".repeat(81) }).success).toBe(false);
    expect(MetaFields.safeParse({ group: "x".repeat(81) }).success).toBe(false);
  });
});

describe("InstitutionInput", () => {
  const ok = { name: "Universidad Politécnica Salesiana", short: "UPS", primaryColor: "#003976", secondaryColor: null, active: true };
  it("acepta colores #RRGGBB o null", () => { expect(InstitutionInput.safeParse(ok).success).toBe(true); });
  it("rechaza colores inválidos (incluye inyección CSS)", () => {
    for (const c of ["azul", "#fff", "#00397", "#GGGGGG", "red;background:url(//x)", "javascript:1"]) expect(InstitutionInput.safeParse({ ...ok, primaryColor: c }).success, c).toBe(false);
  });
  it("sigla ≤ 24 y nombre ≥ 3", () => {
    expect(InstitutionInput.safeParse({ ...ok, short: "x".repeat(25) }).success).toBe(false);
    expect(InstitutionInput.safeParse({ ...ok, name: "ab" }).success).toBe(false);
  });
  it("slugify normaliza acentos y símbolos", () => {
    expect(slugify("Politécnica Salesiana")).toBe("politecnica-salesiana");
    expect(slugify("¡¡¡")).toBe("institucion");
  });
});
