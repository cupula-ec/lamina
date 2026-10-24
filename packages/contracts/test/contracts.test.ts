import { describe, expect, it } from "vitest";
import { ContentDraft, DeckDocument, ComponentManifest, ENGINE_VERSION } from "../src";

const okContent = {
  schemaVersion: 1,
  meta: { topic: "Derivadas", level: "Universidad", objective: "Entender la derivada", language: "es" },
  sections: [
    { id: "s1", title: "Definición", slidesHint: [{ id: "h1", intent: "definir", blocks: [{ id: "b1", type: "formula", latex: "f'(x)=\\lim_{h\\to0}\\frac{f(x+h)-f(x)}{h}" }] }] },
  ],
};

describe("ContentDraft", () => {
  it("acepta un borrador válido y aplica defaults", () => {
    const r = ContentDraft.parse(okContent);
    expect(r.sections[0]!.locked).toBe(false);
    expect(r.sections[0]!.slidesHint[0]!.blocks[0]!.origin).toBe("generated");
  });
  it("rechaza bloques desconocidos y vacíos", () => {
    expect(ContentDraft.safeParse({ ...okContent, sections: [] }).success).toBe(false);
    const bad = structuredClone(okContent) as any;
    bad.sections[0].slidesHint[0].blocks[0] = { id: "x", type: "script", code: "alert(1)" };
    expect(ContentDraft.safeParse(bad).success).toBe(false);
  });
});

const comp = (id: string) => ({ componentId: id, version: "1.0.0", props: {} });
const okDeck = {
  schemaVersion: 1,
  engineVersion: ENGINE_VERSION,
  meta: { title: "T", topic: "t", level: "u" },
  slides: [{ id: "a", layout: "title-content", slots: { title: comp("SectionHeader"), main: comp("BulletPoints") } }],
};

describe("DeckDocument", () => {
  it("valida layout y slots", () => {
    expect(DeckDocument.safeParse(okDeck).success).toBe(true);
  });
  it("rechaza slot obligatorio ausente, slot inexistente y build inválido", () => {
    const miss = structuredClone(okDeck) as any;
    delete miss.slides[0].slots.main;
    expect(DeckDocument.safeParse(miss).success).toBe(false);
    const extra = structuredClone(okDeck) as any;
    extra.slides[0].slots.foo = comp("X");
    expect(DeckDocument.safeParse(extra).success).toBe(false);
    const build = structuredClone(okDeck) as any;
    build.slides[0].build = { steps: [{ reveal: ["nope"] }] };
    expect(DeckDocument.safeParse(build).success).toBe(false);
  });
  it("rechaza ids de slide repetidos", () => {
    const dup = structuredClone(okDeck) as any;
    dup.slides.push(dup.slides[0]);
    expect(DeckDocument.safeParse(dup).success).toBe(false);
  });
});

describe("ComponentManifest", () => {
  it("exige semver y estado", () => {
    const m = { id: "X", version: "1.0", title: "x", purpose: "p", useCases: ["u"], propsJsonSchema: {}, examples: [{ name: "a", props: {} }], status: "stable", scope: "global", runtime: "native" };
    expect(ComponentManifest.safeParse(m).success).toBe(false);
    expect(ComponentManifest.safeParse({ ...m, version: "1.0.0" }).success).toBe(true);
  });
});

import { parseContentAny, parseDeckAny } from "../src";
describe("lectores v1/v2", () => {
  it("aceptan v1 y v2 sin reescribir; rechazan otras versiones", () => {
    expect(parseDeckAny(okDeck).schemaVersion).toBe(1);
    expect(parseDeckAny({ ...okDeck, schemaVersion: 2 }).schemaVersion).toBe(2);
    expect(() => parseDeckAny({ ...okDeck, schemaVersion: 3 })).toThrow();
    expect(parseContentAny({ ...okContent, schemaVersion: 2 }).schemaVersion).toBe(2);
    expect(() => parseContentAny({ ...okContent, schemaVersion: 9 })).toThrow();
  });
});
