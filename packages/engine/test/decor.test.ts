import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { THEME_IDS } from "@lamina/contracts";
import { DECOR_KINDS, SlideDecor, THEME_DECOR, decorKindFor, hashSeed, makeRand } from "../src";

const svg = (themeId: string, layout: string, seed: string) => renderToStaticMarkup(createElement(SlideDecor, { themeId, layout, seed }));
const KINDS = Object.keys(DECOR_KINDS);

describe("decoración procedural", () => {
  it("el generador es determinista por seed", () => {
    const a = makeRand(hashSeed("x")), b = makeRand(hashSeed("x")), c = makeRand(hashSeed("y"));
    const xs = [a.next(), a.next(), a.next()];
    expect(xs).toEqual([b.next(), b.next(), b.next()]);
    expect(xs).not.toEqual([c.next(), c.next(), c.next()]);
  });
  const LAYOUT_OF = { cover: "cover-branded", section: "section", closing: "closing", interior: "title-content" } as const;
  it.each(KINDS)("%s: mismo seed = mismo SVG; otro seed = otro dibujo", (kind) => {
    const found = THEME_IDS.flatMap((t) => (Object.entries(THEME_DECOR[t]) as [keyof typeof LAYOUT_OF, string][]).filter(([, k]) => k === kind).map(([role]) => ({ themeId: t, layout: LAYOUT_OF[role] })))[0];
    expect(found, `ningún tema usa ${kind}`).toBeTruthy();
    const one = svg(found!.themeId, found!.layout, "deck|slide-1");
    expect(one).toContain(`data-lm-decor="${kind}"`);
    expect(one).toBe(svg(found!.themeId, found!.layout, "deck|slide-1"));
    if (kind !== "corner") expect(one).not.toBe(svg(found!.themeId, found!.layout, "deck|slide-2"));
    expect(one.length).toBeGreaterThan(300);
  });
  it("no usa red ni recursos externos: solo formas inline", () => {
    for (const themeId of THEME_IDS) for (const layout of ["cover-branded", "section", "closing", "title-content", "two-column"]) {
      const out = svg(themeId, layout, "s");
      expect(out).not.toMatch(/https?:|href=|xlink|url\(|<image|<script|<foreignObject|<style|onload|data:/i);
      if (out) expect(out).toContain('aria-hidden="true"');
    }
  });
  it("cada tema declara decoración y los layouts con visual a sangre no la llevan", () => {
    for (const id of THEME_IDS) expect(Object.keys(THEME_DECOR[id]).length).toBeGreaterThan(0);
    expect(decorKindFor("fisica-aurora", "full-visual")).toBeNull();
    expect(decorKindFor("fisica-aurora", "cover-branded")?.role).toBe("cover");
    expect(decorKindFor("fisica-aurora", "three-column")?.role).toBe("interior");
    expect(decorKindFor("tema-que-no-existe", "closing")?.role).toBe("closing"); // cae a lamina-claro
  });
  it("temas distintos dibujan cosas distintas (identidad propia)", () => {
    const kinds = new Set(THEME_IDS.map((t) => THEME_DECOR[t].cover));
    expect(kinds.size).toBeGreaterThanOrEqual(8);
  });
});
