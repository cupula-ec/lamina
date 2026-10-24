import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SlideView } from "@lamina/engine";
import { ENGINE_VERSION, LAYOUTS, type DeckDocument } from "@lamina/contracts";
import { NATIVE_CATALOG, NATIVE_MANIFESTS, nativeResolver, validateDeckAgainstCatalog, catalogForPrompt } from "../src";

describe("catálogo nativo", () => {
  it("son 24 componentes (16 originales + 7 nuevos + Image) con ids únicos, manifest válido y JSON Schema", () => {
    expect(NATIVE_CATALOG).toHaveLength(24);
    expect(new Set(NATIVE_CATALOG.map((c) => c.def.id)).size).toBe(24);
    for (const id of ["Callout", "StatCard", "StepsList", "ComparisonTable", "IconBullets", "SectionNumber", "AgendaItem"]) expect(NATIVE_CATALOG.some((c) => c.def.id === id)).toBe(true);
    for (const m of NATIVE_MANIFESTS) {
      expect(m.status).toBe("stable");
      expect(m.runtime).toBe("native");
      expect(m.propsJsonSchema).toHaveProperty("type");
    }
    expect(catalogForPrompt()).toContain("FunctionPlot@1.0.0");
  });

  it.each(NATIVE_CATALOG.map((c) => [c.def.id, c] as const))("%s: los ejemplos validan y renderizan sin error", (_id, c) => {
    for (const ex of c.examples) {
      const parsed = c.def.propsSchema.safeParse(ex.props);
      expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true);
      const slot = c.fitsSlots[0]!;
      const layout = (Object.values(LAYOUTS).find((l) => l.slots.some((s) => s.name === slot)) ?? LAYOUTS["title-content"]).id;
      const slots: any = {};
      for (const s of LAYOUTS[layout].slots) slots[s.name] = { componentId: "SectionHeader", version: "1.0.0", props: { title: "t" } };
      slots[slot] = { componentId: c.def.id, version: c.def.version, props: ex.props };
      const html = renderToStaticMarkup(createElement(SlideView, { slide: { id: "s", layout, slots, notes: "", build: { steps: [] }, transition: "none" } as any, resolver: nativeResolver }));
      expect(html).not.toContain("data-lamina-error");
      expect(html.length).toBeGreaterThan(200);
    }
  });

  it("props inválidas y componentes inexistentes se muestran como error, sin romper el slide", () => {
    const slide: any = { id: "s", layout: "title-content", notes: "", build: { steps: [] }, transition: "none", slots: {
      title: { componentId: "SectionHeader", version: "1.0.0", props: {} },
      main: { componentId: "NoExiste", version: "1.0.0", props: {} },
    } };
    const html = renderToStaticMarkup(createElement(SlideView, { slide, resolver: nativeResolver }));
    expect(html).toContain('data-lamina-error="props"');
    expect(html).toContain('data-lamina-error="missing"');
  });

  it("el Markdown no ejecuta HTML ni scripts ni imágenes/enlaces peligrosos", () => {
    const evil = '<script>alert(1)</script>\n\n<img src=x onerror=alert(1)>\n\n[x](javascript:alert(1)) ![i](http://e.com/a.png) [ok](https://e.com)';
    const slide: any = { id: "s", layout: "title-content", notes: "", build: { steps: [] }, transition: "none", slots: {
      title: { componentId: "SectionHeader", version: "1.0.0", props: { title: "t" } },
      main: { componentId: "BulletPoints", version: "1.0.0", props: { items: [{ text: evil }] } },
    } };
    const html = renderToStaticMarkup(createElement(SlideView, { slide, resolver: nativeResolver }));
    expect(html).not.toMatch(/<script|<img|href="javascript:|src="/i);
    expect(html).toContain('href="https://e.com"');
  });

  it("validateDeckAgainstCatalog detecta componente desconocido, props inválidas y slots mal formados", () => {
    const deck = (main: any): DeckDocument => ({ schemaVersion: 1, engineVersion: ENGINE_VERSION, themeId: "lamina-claro", meta: { title: "t", topic: "t", level: "u", language: "es" },
      slides: [{ id: "a", layout: "title-content", notes: "", build: { steps: [] }, transition: "fade", slots: { title: { componentId: "SectionHeader", version: "1.0.0", props: { title: "x" } }, main } }] } as any);
    expect(validateDeckAgainstCatalog(deck({ componentId: "BulletPoints", version: "1.0.0", props: { items: [{ text: "a" }] } })).ok).toBe(true);
    const bad1 = validateDeckAgainstCatalog(deck({ componentId: "Nope", version: "1.0.0", props: {} }));
    expect(!bad1.ok && bad1.errors[0]).toMatch(/no existe en el catálogo/);
    const bad2 = validateDeckAgainstCatalog(deck({ componentId: "BulletPoints", version: "1.0.0", props: { items: [] } }));
    expect(!bad2.ok && bad2.errors[0]).toMatch(/props inválidas/);
    expect(validateDeckAgainstCatalog({ slides: [] }).ok).toBe(false);
  });

  it("FunctionPlot rechaza dominio invertido y marca funciones no evaluables", () => {
    const e = NATIVE_CATALOG.find((c) => c.def.id === "FunctionPlot")!;
    expect(e.def.propsSchema.safeParse({ functions: [{ expr: "x" }], xDomain: [3, 1] }).success).toBe(false);
    const html = renderToStaticMarkup(createElement(e.def.Component, { props: e.def.propsSchema.parse({ functions: [{ expr: "import('x')" }], xDomain: [0, 1] }), ctx: { layout: "split-visual", slot: "visual", width: 988, height: 750, revealCount: null } }));
    expect(html).toContain("data-lamina-error");
  });
});
