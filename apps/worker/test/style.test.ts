import { describe, expect, it } from "vitest";
import { LaminaError, THEMES, THEME_IDS } from "@lamina/contracts";
import { chooseStyle, layoutsDoc, withBrandedCover } from "../src/handlers/design";
import type { Ctx } from "../src/ctx";

const ctxWith = (structured: (o: any) => Promise<unknown>) => ({ ai: { structured }, log: () => {} }) as unknown as Ctx;
const input = { presentationId: "p", topic: "Leyes de Newton", level: "Universidad", objective: "Aplicar la segunda ley", subject: "Física I" };

describe("chooseStyle", () => {
  it("usa la respuesta de la IA cuando es válida y valida contra THEME_IDS", async () => {
    let seen: any;
    const s = await chooseStyle(ctxWith(async (o) => { seen = o; return o.schema.parse({ themeId: "fisica-aurora", accent: "b", rationale: "Aula de física." }); }), input);
    expect(s).toMatchObject({ themeId: "fisica-aurora", accent: "b", source: "ia" });
    expect(seen.role).toBe("design");
    // Los temas V3 (flag v3_areas) no se ofrecen a la IA mientras el flag esté apagado.
    for (const id of THEME_IDS) { if ((THEMES[id] as { v3?: boolean }).v3) expect(seen.system).not.toContain(id); else expect(seen.system).toContain(id); }
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

describe("withBrandedCover", () => {
  const cover = (props: Record<string, unknown>) => ({ id: "title", layout: "title", slots: { main: { componentId: "Title", version: "1.0.0", props } }, notes: "", build: { steps: [] }, transition: "fade" }) as any;
  it("una portada conservada con `author` no repite al docente cuando la marca ya lo lleva", () => {
    const c = withBrandedCover([cover({ title: "T", author: "Prof. Ana" })], { teacher: "Prof. Ana" })[0] as any;
    expect(c.layout).toBe("cover-branded");
    expect(c.slots.main.props).toEqual({ title: "T" });
  });
  it("sin docente en la marca conserva el autor", () => {
    const c = withBrandedCover([cover({ title: "T", author: "Prof. Ana" })], {})[0] as any;
    expect(c.slots.main.props.author).toBe("Prof. Ana");
  });
});
