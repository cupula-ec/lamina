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
    const uuid = "00000000-0000-4000-8000-000000000000";
    for (const ok of [`/api/branding/institution/${uuid}`, `/api/branding/institution/${uuid}?v=0a1b2c3d`, "/api/branding/personal/userA1", "/api/branding/personal/userA1?v=0a1b2c3d"]) expect(Branding.safeParse({ personalLogoUrl: ok }).success, ok).toBe(true);
    for (const bad of ["/api/branding/institution/abc-123", "/api/branding/personal/..", "/api/branding/personal/../institution/x", "/api/branding/personal/a/b", "/api/branding/personal/a?v=1&exp=9&sig=z", "/api/branding/other/x"]) expect(Branding.safeParse({ personalLogoUrl: bad }).success, bad).toBe(false);
  });
});
