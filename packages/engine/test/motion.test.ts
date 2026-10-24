import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DeckDocument, MOTION_SPECS, motionForTheme } from "@lamina/contracts";
import { SlideView, deckViewProps } from "../src";

const slide = (extra: object = {}) => ({
  id: "s1", layout: "split-visual", notes: "", build: { steps: [] }, transition: "fade",
  slots: { title: { componentId: "T", version: "1.0.0", props: {} }, text: { componentId: "T", version: "1.0.0", key: "formula", props: {} }, visual: { componentId: "T", version: "1.0.0", props: {} } },
  ...extra,
});
const resolver = () => ({ kind: "native" as const, def: { id: "T", version: "1.0.0", propsSchema: { parse: (x: unknown) => x, safeParse: (x: unknown) => ({ success: true, data: x }) } as never, Component: () => createElement("span", null, "x") } });
const html = (motion: string | undefined, sl: object = {}) => renderToStaticMarkup(createElement(SlideView, { slide: slide(sl) as never, resolver, motion: motion as never }));

describe("motion por código", () => {
  it("sin preset no hay atributos de motion (comportamiento v2)", () => {
    expect(html(undefined)).not.toContain("data-motion");
    expect(html("none")).not.toContain("data-motion");
  });
  it("con preset cada elemento recibe su orden y las variables del preset", () => {
    const h = html("lively");
    expect(h).toContain('data-motion="lively"');
    expect(h).toContain(`--lm-m-stagger:${MOTION_SPECS.lively.staggerMs}ms`);
    expect(h).toMatch(/--lm-i:0/);
    expect(h).toMatch(/--lm-i:2/);
  });
  it("enter none deja la diapositiva estática; la key se vuelve view-transition-name", () => {
    expect(html("calm", { motion: { enter: "none" } })).toContain('data-motion="static"');
    expect(html("calm")).toContain("view-transition-name:lm-formula");
  });
  it("cada tema tiene un preset y el esquema acepta los campos nuevos", () => {
    expect(motionForTheme("pizarra")).toBe("lively");
    expect(motionForTheme("lamina-claro")).toBe("calm");
    const deck = { schemaVersion: 2, engineVersion: "1.0.0", themeId: "lamina-claro", meta: { title: "t", topic: "t", level: "l", motion: "calm" }, slides: [slide({ motion: { enter: "stagger" } })] };
    expect(DeckDocument.safeParse(deck).success).toBe(true);
    const dup = { ...deck, slides: [slide({ slots: { title: { componentId: "T", version: "1.0.0", key: "a", props: {} }, text: { componentId: "T", version: "1.0.0", key: "a", props: {} } } })] };
    expect(DeckDocument.safeParse(dup).success).toBe(false);
  });
  it("la CSS dibuja curvas solo con motion y respeta reduced-motion", async () => {
    const css = (await import("node:fs")).readFileSync(new URL("../src/base.css", import.meta.url), "utf8");
    const block = css.slice(css.indexOf("Motion por código"));
    expect(block).toMatch(/@media \(prefers-reduced-motion: no-preference\)[\s\S]*lm-draw/);
    expect(block.indexOf("stroke-dasharray: 1")).toBeGreaterThan(block.indexOf("no-preference"));
  });
});
