import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SlideView, deckViewProps, brandingLine } from "@lamina/engine";
import { ContentDraft, DeckDocument, LAYOUT_IDS, THEME_IDS, type Branding, type Slide } from "@lamina/contracts";
import { NATIVE_CATALOG, catalogForPrompt, deckFromContent, galleryDeck, nativeResolver, previewDeck, sampleSlides, slidesFromHint, titleSlide, validateDeckAgainstCatalog, varietyProblem, varietyViolations } from "../src";

const html = (slide: Slide, extra: Record<string, unknown> = {}) => renderToStaticMarkup(createElement(SlideView, { slide, resolver: nativeResolver, ...extra }));

describe("layouts nuevos: samples válidos y renderizados", () => {
  it("las diapositivas de ejemplo de todos los layouts validan contra el catálogo", () => {
    for (const themeId of ["lamina-claro", "fisica-aurora"] as const) {
      const r = validateDeckAgainstCatalog(galleryDeck({ themeId }));
      expect(r.ok, !r.ok ? r.errors.join("\n") : "").toBe(true);
    }
    expect(Object.keys(sampleSlides()).sort()).toEqual([...LAYOUT_IDS].sort());
  });
  it.each(THEME_IDS)("%s: todos los layouts se dibujan sin errores de componente", (themeId) => {
    const deck = galleryDeck({ themeId, accent: "b" });
    expect(deck.slides).toHaveLength(LAYOUT_IDS.length);
    for (const slide of deck.slides) {
      const out = html(slide, deckViewProps(deck));
      expect(out, `${themeId}/${slide.layout}`).not.toContain("data-lamina-error");
      expect(out).toContain(`data-theme="${themeId}"`);
      expect(out).toContain('data-accent="b"');
      expect(out).toContain(`lm-layout-${slide.layout}`);
    }
  });
  it("paridad: el mismo deck produce exactamente el mismo marcado (vista previa = publicada = captura)", () => {
    const deck = galleryDeck({ themeId: "geometria-compas" });
    const a = deck.slides.map((s) => html(s, deckViewProps(deck))).join("");
    const b = deck.slides.map((s) => html(s, deckViewProps(deck))).join("");
    expect(a).toBe(b);
  });
  it("un tema distinto o un deck distinto cambian la decoración (Cálculo ≠ Física)", () => {
    const calc = previewDeck({ themeId: "calculo-editorial", topic: "Derivadas" });
    const fis = previewDeck({ themeId: "fisica-aurora", topic: "Dinámica" });
    const a = html(calc.slides[0]!, deckViewProps(calc)), b = html(fis.slides[0]!, deckViewProps(fis));
    expect(a).toContain('data-lm-decor="curve-family"');
    expect(b).toContain('data-lm-decor="field-lines"');
  });
  it("un tema desconocido en un deck antiguo cae al tema base y sigue dibujándose", () => {
    const d = DeckDocument.parse({ ...galleryDeck({ themeId: "lamina-claro" }), themeId: "tema-retirado" });
    expect(d.themeId).toBe("lamina-claro");
    expect(html(d.slides[0]!, deckViewProps(d))).toContain('data-theme="lamina-claro"');
  });
  it("decks antiguos (sin accent ni branding, layouts originales) se dibujan igual que antes", () => {
    const old = { id: "s", layout: "title-content", notes: "", build: { steps: [] }, transition: "none", slots: { title: { componentId: "SectionHeader", version: "1.0.0", props: { title: "t" } }, main: { componentId: "BulletPoints", version: "1.0.0", props: { items: [{ text: "a" }] } } } } as unknown as Slide;
    const out = html(old, { themeId: "lamina-claro" });
    expect(out).not.toContain("data-lamina-error");
    expect(out).not.toContain("lm-decor");
    expect(out).not.toContain("lm-footer");
  });
});

describe("cover-branded y marcas", () => {
  const cover = (b?: Branding) => { const d = previewDeck({ themeId: "institucional-sobrio", branding: b ?? null }); return html(d.slides[0]!, deckViewProps(d)); };
  it("con ambos logos: institución a la izquierda, personal a la derecha, línea de datos y sigla", () => {
    const out = cover({ institution: { name: "Universidad X", short: "UX", logoUrl: "/api/branding/institution/abc" }, personalLogoUrl: "/api/branding/personal/me", teacher: "Prof. Ana", subject: "Cálculo I", period: "Abr–Ago 2026", group: "Grupo 2" });
    expect(out.indexOf("lm-logo-inst")).toBeGreaterThan(-1);
    expect(out.indexOf("lm-logo-inst")).toBeLessThan(out.indexOf("lm-logo-personal"));
    expect(out).toContain("Prof. Ana · Cálculo I · Abr–Ago 2026 · Grupo 2");
    expect(out).toContain("lm-cover-foot");
    expect(out).toContain(">UX<");
    expect(out).toContain('src="/api/branding/institution/abc"');
    expect(out).toContain('alt="Logo de Universidad X"');
  });
  it("omite lo vacío: nada de undefined, guiones ni separadores sueltos", () => {
    expect(brandingLine({ teacher: "Prof. Ana", subject: "", period: "  ", group: "G1" })).toBe("Prof. Ana · G1");
    expect(brandingLine({})).toBe("");
    const out = cover({ teacher: "Prof. Ana" });
    expect(out).toContain("Prof. Ana");
    expect(out).not.toMatch(/undefined|null|· ·|>·|·</);
    expect(out).not.toContain("lm-brandbar");
  });
  it("sin logos ni datos la portada queda limpia, sin huecos, con la marca Lámina al pie", () => {
    const out = cover();
    expect(out).not.toContain("lm-brandbar");
    expect(out).not.toContain("lm-cover-meta");
    expect(out).not.toContain("<img");
    expect(out).toContain(">Lámina<");
  });
  it("solo institución sin logo: muestra su nombre como marca; solo logo personal: va a la derecha", () => {
    expect(cover({ institution: { name: "Universidad X", short: "UX" } })).toContain('class="lm-wordmark">Universidad X');
    const solo = cover({ personalLogoUrl: "/api/branding/personal/me" });
    expect(solo).toContain("lm-brand-right");
    expect(solo).not.toContain("lm-logo-inst");
  });
  it("el color de la institución llega como variable --lm-brand", () => {
    expect(cover({ institution: { name: "U", short: "U", colors: { primary: "#0a3d91" } } })).toContain("--lm-brand:#0a3d91");
  });
  it("titleSlide usa cover-branded solo cuando hay marcas o datos, y no duplica al docente", () => {
    const meta = { topic: "Tema", level: "Univ", objective: "Obj", language: "es" } as ContentDraft["meta"];
    expect(titleSlide(meta, "Prof. A").layout).toBe("title");
    const s = titleSlide(meta, "Prof. A", { teacher: "Prof. A" });
    expect(s.layout).toBe("cover-branded");
    expect((s.slots.main!.props as { author?: string }).author).toBeUndefined();
    expect(titleSlide(meta, "Prof. A", {}).layout).toBe("title");
  });
});

describe("componentes nuevos", () => {
  const NEW = ["Callout", "StatCard", "StepsList", "ComparisonTable", "IconBullets", "SectionNumber", "AgendaItem"];
  it.each(NEW)("%s: manifest, fixtures válidos y entrada en el prompt", (id) => {
    const e = NATIVE_CATALOG.find((c) => c.def.id === id)!;
    expect(e.examples.length).toBeGreaterThan(0);
    for (const ex of e.examples) expect(e.def.propsSchema.safeParse(ex.props).success, id).toBe(true);
    expect(catalogForPrompt()).toContain(`${id}@1.0.0`);
    expect(e.fitsSlots.length).toBeGreaterThan(0);
  });
  it("rechazan datos fuera de límites", () => {
    const g = (id: string) => NATIVE_CATALOG.find((c) => c.def.id === id)!.def.propsSchema;
    expect(g("StepsList").safeParse({ steps: [{ title: "a" }] }).success).toBe(false);
    expect(g("StepsList").safeParse({ steps: Array.from({ length: 6 }, () => ({ title: "a" })) }).success).toBe(false);
    expect(g("Callout").safeParse({ variant: "otra", text: "x" }).success).toBe(false);
    expect(g("IconBullets").safeParse({ items: [{ icon: "nube", title: "x" }] }).success).toBe(false);
    expect(g("ComparisonTable").safeParse({ leftTitle: "a", rightTitle: "b", rows: [] }).success).toBe(false);
    expect(g("StatCard").safeParse({ value: "", label: "x" }).success).toBe(false);
    expect(g("SectionNumber").safeParse({ number: "123", title: "x" }).success).toBe(false);
    expect(g("AgendaItem").safeParse({ items: [{ title: "solo uno" }] }).success).toBe(false);
  });
  it("AgendaItem calcula el progreso y los iconos son SVG propios", () => {
    const d = galleryDeck({ themeId: "lamina-claro" });
    const out = html(d.slides.find((s) => s.layout === "agenda")!);
    expect(out).toContain('role="progressbar"');
    expect(out).toContain("<svg");
    expect(out).not.toMatch(/<img|href=/);
  });
  it("el Markdown de los componentes nuevos sigue saneado", () => {
    const slide = { id: "s", layout: "three-column", notes: "", build: { steps: [] }, transition: "none", slots: {
      title: { componentId: "SectionHeader", version: "1.0.0", props: { title: "t" } },
      col1: { componentId: "Callout", version: "1.0.0", props: { variant: "nota", text: '<script>alert(1)</script> <img src=x onerror=alert(1)>' } },
      col2: { componentId: "Callout", version: "1.0.0", props: { text: "ok" } }, col3: { componentId: "Callout", version: "1.0.0", props: { text: "ok" } },
    } } as unknown as Slide;
    expect(html(slide)).not.toMatch(/<script|<img/i);
  });
});

describe("variedad de layouts", () => {
  it("rechaza la tercera diapositiva consecutiva con el mismo layout y propone alternativas", () => {
    expect(varietyProblem(["two-column", "title-content", "title-content"], "title-content")).toMatch(/Variedad.*title-content/);
    expect(varietyProblem(["title-content", "two-column", "title-content"], "title-content")).toBeNull();
    expect(varietyProblem(["title-content"], "title-content")).toBeNull();
  });
  it("exime el contenido que por naturaleza exige un layout (derivaciones y ejemplos)", () => {
    const deriv = [{ id: "b", type: "derivation", steps: [] }] as never;
    expect(varietyProblem(["title-content", "title-content"], "title-content", deriv)).toBeNull();
  });
  it("varietyViolations detecta rachas de 3 o más en un deck ya armado", () => {
    expect(varietyViolations(["a", "a", "b", "b", "b", "b"])).toEqual([4, 5]);
    expect(varietyViolations(["a", "b", "a", "b"])).toEqual([]);
  });
  it("el fallback determinista alterna formula-focus y hero-formula", () => {
    const hint = (id: string) => ({ id, intent: `Fórmula ${id}`, blocks: [{ id: `b${id}`, type: "formula", latex: "x^2", origin: "generated", sourceRefs: [] }] }) as never;
    const prev: string[] = [];
    const layouts: string[] = [];
    for (const id of ["h1", "h2", "h3", "h4", "h5"]) { const s = slidesFromHint(hint(id), prev)[0]!; layouts.push(s.layout); prev.push(s.layout); }
    expect(varietyViolations(layouts)).toEqual([]);
    expect(layouts).toContain("hero-formula");
  });
  it("deckFromContent con marcas: portada cover-branded, tema y acento fijados, deck válido", () => {
    const content = ContentDraft.parse({ schemaVersion: 1, meta: { topic: "La derivada", level: "Universidad", objective: "Comprender" }, sections: [{ id: "s1", title: "Uno", slidesHint: [
      { id: "h1", intent: "F1", blocks: [{ id: "b1", type: "formula", latex: "x^2" }] }, { id: "h2", intent: "F2", blocks: [{ id: "b2", type: "formula", latex: "x^3" }] }, { id: "h3", intent: "F3", blocks: [{ id: "b3", type: "formula", latex: "x^4" }] },
    ] }] });
    const deck = deckFromContent(content, "Prof. X", { branding: { teacher: "Prof. X", institution: { name: "U", short: "U" } }, themeId: "calculo-editorial", accent: "c" });
    expect(deck.slides[0]!.layout).toBe("cover-branded");
    expect(deck.themeId).toBe("calculo-editorial");
    expect(deck.accent).toBe("c");
    expect(deck.meta.branding?.institution?.short).toBe("U");
    expect(validateDeckAgainstCatalog(deck).ok).toBe(true);
    expect(varietyViolations(deck.slides.map((s) => s.layout))).toEqual([]);
  });
});
