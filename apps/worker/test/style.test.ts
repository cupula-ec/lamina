import { describe, expect, it } from "vitest";
import { LaminaError, THEME_IDS } from "@lamina/contracts";
import { chooseStyle, layoutsDoc } from "../src/handlers/design";
import type { Ctx } from "../src/ctx";

const ctxWith = (structured: (o: any) => Promise<unknown>) => ({ ai: { structured }, log: () => {} }) as unknown as Ctx;
const input = { presentationId: "p", topic: "Leyes de Newton", level: "Universidad", objective: "Aplicar la segunda ley", subject: "Física I" };

describe("chooseStyle", () => {
  it("usa la respuesta de la IA cuando es válida y valida contra THEME_IDS", async () => {
    let seen: any;
    const s = await chooseStyle(ctxWith(async (o) => { seen = o; return o.schema.parse({ themeId: "fisica-aurora", accent: "b", rationale: "Aula de física." }); }), input);
    expect(s).toMatchObject({ themeId: "fisica-aurora", accent: "b", source: "ia" });
    expect(seen.role).toBe("design");
    for (const id of THEME_IDS) expect(seen.system).toContain(id);
    expect(seen.user).toContain("Física I");
  });
  it("un tema inventado por la IA lo rechaza el esquema Zod (la IA reintenta o se usan reglas)", async () => {
    const s = await chooseStyle(ctxWith(async (o) => o.schema.parse({ themeId: "neon-fiesta" })), input);
    expect(s.source).toBe("reglas");
    expect(s.themeId).toBe("fisica-aurora");
  });
  it("si la IA falla (proveedor caído) cae al fallback determinista por palabra clave", async () => {
    const s = await chooseStyle(ctxWith(async () => { throw new LaminaError("provider_failed", "caído", 502); }), { ...input, topic: "La derivada", subject: "Cálculo I", objective: "Derivar" });
    expect(s).toMatchObject({ themeId: "calculo-editorial", accent: "a", source: "reglas" });
  });
  it("Cálculo y Física terminan con estilos distintos con el mismo código", async () => {
    const fail = ctxWith(async () => { throw new Error("sin IA"); });
    const calc = await chooseStyle(fail, { ...input, topic: "Límites", subject: "Cálculo" });
    const fis = await chooseStyle(fail, input);
    expect(calc.themeId).not.toBe(fis.themeId);
  });
  it("layoutsDoc incluye los 17 layouts y marca los que coloca el sistema", () => {
    const doc = layoutsDoc();
    for (const id of ["cover-branded", "hero-formula", "full-visual", "three-column", "steps-timeline", "comparison", "big-number", "quote-source", "agenda", "closing", "sidebar-notes", "title-content"]) expect(doc).toContain(`- ${id}`);
    expect(doc).toContain("cover-branded [lo coloca el sistema]");
  });
});
