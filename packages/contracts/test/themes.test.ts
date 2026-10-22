import { describe, expect, it } from "vitest";
import { Branding, DeckDocument, THEME_IDS, THEMES, isThemeId } from "../src";

const base = {
  schemaVersion: 1,
  engineVersion: "1.0.0",
  meta: { title: "T", topic: "t", level: "n" },
  slides: [{ id: "s1", layout: "title", slots: { main: { componentId: "Title", version: "1.0.0", props: {} } } }],
};

describe("temas y branding", () => {
  it("cada tema declara su propio id", () => {
    for (const id of THEME_IDS) expect(THEMES[id].id).toBe(id);
  });
  it("un tema desconocido cae a lamina-claro (decks antiguos)", () => {
    expect(DeckDocument.parse({ ...base, themeId: "ya-no-existe" }).themeId).toBe("lamina-claro");
    expect(DeckDocument.parse(base).themeId).toBe("lamina-claro");
    expect(isThemeId("lamina-oscuro")).toBe(true);
    expect(isThemeId("__proto__")).toBe(false);
  });
  it("meta.branding es opcional y solo admite rutas internas", () => {
    expect(DeckDocument.safeParse(base).success).toBe(true);
    expect(Branding.safeParse({ personalLogoUrl: "data:image/svg+xml;base64,AAAA" }).success).toBe(false);
    expect(Branding.safeParse({ personalLogoUrl: "https://evil.example/x.png" }).success).toBe(false);
    expect(Branding.safeParse({ personalLogoUrl: "/api/branding/institution/abc-123" }).success).toBe(true);
  });
});
