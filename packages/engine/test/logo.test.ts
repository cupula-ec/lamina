import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { logoZone, withLogoZone, type Slide } from "@lamina/contracts";
import { SlideView } from "../src";

const slide = (layout: string): Slide => ({ id: "s", layout: layout as never, slots: {}, notes: "", build: { steps: [] }, transition: "fade" });
const branding = { institution: { name: "Universidad Politécnica Salesiana", short: "UPS", logoUrl: "/api/branding/institution/00000000-0000-4000-8000-000000000000" }, personalLogoUrl: "/api/branding/personal/u1", teacher: "Prof. A" };
const html = (layout: string, logo?: { corner: "tl" | "tr" | "bl" | "br" | "none"; which?: "institution" | "personal" | "both"; size?: "s" | "m" }, page = { n: 3, total: 10 }) =>
  renderToStaticMarkup(createElement(SlideView, { slide: slide(layout), resolver: () => undefined, branding: branding as never, logo: logo as never, page }));

describe("logo persistente (deck v2)", () => {
  it("sin meta.logo el render es el de v2: sin logos de esquina", () => {
    expect(html("title-content")).not.toContain("data-lm-corner-logos");
  });
  it("interiores: logos de la esquina elegida, filtrados por `which`, y ocultos con «none»", () => {
    const both = html("title-content", { corner: "tr", which: "both" });
    expect(both).toContain('data-lm-corner-logos="tr"');
    expect(both).toContain('data-lm-logo="inst"');
    expect(both).toContain('data-lm-logo="personal"');
    const inst = html("title-content", { corner: "bl", which: "institution" });
    expect(inst).toContain('data-lm-logo="inst"');
    expect(inst).not.toContain('data-lm-logo="personal"');
    expect(html("title-content", { corner: "none" })).not.toContain("data-lm-corner-logos");
  });
  it("esquina inferior: el logo ocupa el lugar de la sigla y el número de página pasa al lado opuesto", () => {
    const bl = html("title-content", { corner: "bl" });
    expect(bl).toContain("lm-footer-right");
    expect(bl).not.toContain(">UPS<");
    expect(html("title-content", { corner: "br" })).toContain("lm-footer-left");
  });
  it("portada: logo real grande y sin el texto de sigla en el pie (antes mostraba «UPS»)", () => {
    const v2 = html("cover-branded");
    expect(v2).toContain("lm-cover-foot");
    const v3 = html("cover-branded", { corner: "tr", which: "both" });
    expect(v3).toContain("lm-cover-v3");
    expect(v3).not.toContain("lm-cover-foot");
    expect(v3).not.toContain("data-lm-corner-logos");
  });
  it("la zona reservada acorta solo el título en esquinas superiores", () => {
    const z = logoZone({ corner: "tr", which: "both", size: "s" }, { institution: true, personal: true })!;
    expect(z.count).toBe(2);
    const box = { x: 96, y: 64, w: 1728, h: 150 };
    expect(withLogoZone(box, "title", z).w).toBeLessThan(1728 - z.width);
    expect(withLogoZone(box, "main", z)).toEqual(box);
    const tl = withLogoZone(box, "title", logoZone({ corner: "tl" }, { institution: true, personal: false }));
    expect(tl.x).toBeGreaterThan(96);
    expect(withLogoZone(box, "title", logoZone({ corner: "bl" }, { institution: true, personal: true }))).toEqual(box);
    expect(logoZone({ corner: "tr" }, { institution: false, personal: false })).toBeNull();
    expect(logoZone({ corner: "none" }, { institution: true, personal: true })).toBeNull();
  });
});
