import { describe, expect, it } from "vitest";
import { ACCENT_IDS, CANVAS, DEFAULT_THEME_ID, LAYOUTS, LAYOUT_IDS, SLOT_GEOMETRY, THEMES, THEME_IDS, formatStylePref, isStyleProposal, parseStylePref, proposeStyle, themesForPrompt, type Box } from "../src";

const LEGACY = ["title", "section", "title-content", "two-column", "split-visual", "formula-focus"];
const NEW = ["cover-branded", "hero-formula", "full-visual", "three-column", "steps-timeline", "comparison", "big-number", "quote-source", "agenda", "closing", "sidebar-notes"];
/** Solapamientos intencionales: el título y la leyenda se superponen al visual a sangre. */
const INTENDED = new Set(["full-visual:visual|title", "full-visual:visual|caption"]);
const overlaps = (a: Box, b: Box) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

describe("layouts", () => {
  it("conservan los 6 originales y añaden los 11 nuevos", () => {
    for (const id of [...LEGACY, ...NEW]) expect(LAYOUT_IDS).toContain(id);
    expect(LAYOUT_IDS).toHaveLength(17);
  });
  it.each(LAYOUT_IDS)("%s: cada slot tiene geometría dentro del lienzo y un propósito para la IA", (id) => {
    const spec = LAYOUTS[id];
    expect(spec.purpose.length).toBeGreaterThan(15);
    expect(spec.slots.some((s) => s.required)).toBe(true);
    const geo = SLOT_GEOMETRY[id]!;
    expect(Object.keys(geo).sort()).toEqual(spec.slots.map((s) => s.name).sort());
    for (const [name, b] of Object.entries(geo)) {
      expect(b.x, name).toBeGreaterThanOrEqual(0);
      expect(b.y, name).toBeGreaterThanOrEqual(0);
      expect(b.x + b.w, name).toBeLessThanOrEqual(CANVAS.width);
      expect(b.y + b.h, name).toBeLessThanOrEqual(CANVAS.height);
      expect(b.w, name).toBeGreaterThanOrEqual(400);
      expect(b.h, name).toBeGreaterThanOrEqual(100);
    }
  });
  it.each(LAYOUT_IDS)("%s: sin solapamientos salvo los intencionales", (id) => {
    const names = Object.keys(SLOT_GEOMETRY[id]!);
    for (let i = 0; i < names.length; i++)
      for (let j = i + 1; j < names.length; j++) {
        const a = names[i]!, b = names[j]!;
        if (!overlaps(SLOT_GEOMETRY[id]![a]!, SLOT_GEOMETRY[id]![b]!)) continue;
        expect(INTENDED.has(`${id}:${a}|${b}`) || INTENDED.has(`${id}:${b}|${a}`), `${id}: ${a} solapa ${b}`).toBe(true);
      }
  });
  it("la estructura de slots de cada layout nuevo es la acordada", () => {
    expect(LAYOUTS["three-column"].slots.map((s) => s.name)).toEqual(["title", "col1", "col2", "col3"]);
    expect(LAYOUTS["cover-branded"].slots.map((s) => s.name)).toEqual(["main"]);
    expect(LAYOUTS["full-visual"].slots[0]!.name).toBe("visual"); // el visual va debajo (primero en el DOM)
  });
});

describe("catálogo de temas", () => {
  it("hay entre 8 y 10 temas con 3 acentos, y se conservan los dos originales", () => {
    expect(THEME_IDS.length).toBeGreaterThanOrEqual(8);
    expect(THEME_IDS.length).toBeLessThanOrEqual(10);
    expect(THEME_IDS).toContain("lamina-claro");
    expect(THEME_IDS).toContain("lamina-oscuro");
    for (const id of THEME_IDS) expect(THEMES[id].accents).toHaveLength(ACCENT_IDS.length);
  });
  it("usa como máximo 5 familias tipográficas en total", () => {
    const fams = new Set(THEME_IDS.flatMap((id) => [THEMES[id].fonts.display, THEMES[id].fonts.body]));
    expect(fams.size).toBeLessThanOrEqual(5);
  });
  it("hay temas claros y oscuros y cada uno tiene descripción y tono", () => {
    expect(new Set(THEME_IDS.map((id) => THEMES[id].mode))).toEqual(new Set(["light", "dark"]));
    for (const id of THEME_IDS) { expect(THEMES[id].mood.length).toBeGreaterThan(5); expect(themesForPrompt()).toContain(id); }
  });
  it("proposeStyle elige por palabra clave y cae al tema base", () => {
    expect(proposeStyle({ topic: "La derivada y límites" }).themeId).toBe("calculo-editorial");
    expect(proposeStyle({ topic: "Cinemática del movimiento" }).themeId).toBe("fisica-aurora");
    expect(proposeStyle({ subject: "Álgebra lineal", topic: "Matrices" }).themeId).toBe("algebra-grafito");
    expect(proposeStyle({ topic: "Triángulos y trigonometría" }).themeId).toBe("geometria-compas");
    expect(proposeStyle({ topic: "Probabilidad", subject: "Estadística" }).themeId).toBe("estadistica-datos");
    expect(proposeStyle({ topic: "Reacciones químicas" }).themeId).toBe("quimica-laboratorio");
    expect(proposeStyle({ topic: "Derecho constitucional" }).themeId).toBe("institucional-sobrio");
    expect(proposeStyle({ topic: "Los números", level: "Bachillerato" }).themeId).toBe("pizarra");
    expect(proposeStyle({ topic: "Tema cualquiera" }).themeId).toBe(DEFAULT_THEME_ID);
  });
  it("Cálculo y Física producen estilos distintos", () => {
    expect(proposeStyle({ topic: "Derivadas" }).themeId).not.toBe(proposeStyle({ topic: "Dinámica" }).themeId);
  });
  it("la preferencia de estilo se guarda y se lee de ida y vuelta", () => {
    expect(formatStylePref({ themeId: "fisica-aurora", accent: "a" })).toBe("fisica-aurora");
    expect(formatStylePref({ themeId: "fisica-aurora", accent: "c" })).toBe("fisica-aurora:c");
    expect(parseStylePref("fisica-aurora:c")).toEqual({ themeId: "fisica-aurora", accent: "c" });
    expect(parseStylePref("fisica-aurora")).toEqual({ themeId: "fisica-aurora", accent: "a" });
    expect(parseStylePref("nope")).toBeNull();
    expect(parseStylePref("pizarra:z")).toBeNull();
    expect(parseStylePref(null)).toBeNull();
    expect(formatStylePref({ themeId: "pizarra", accent: "a" }, true)).toBe("pizarra:a:ia");
    expect(parseStylePref("pizarra:a:ia")).toEqual({ themeId: "pizarra", accent: "a" });
    expect(isStyleProposal("pizarra:a:ia")).toBe(true);
    expect(isStyleProposal("pizarra:c")).toBe(false);
    expect(isStyleProposal("nope:a:ia")).toBe(false);
    expect(parseStylePref("pizarra:a:xx")).toBeNull();
  });
});
