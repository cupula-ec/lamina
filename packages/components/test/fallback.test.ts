import { describe, expect, it } from "vitest";
import { ContentDraft, DeckDocument } from "@lamina/contracts";
import { deckFromContent, validateDeckAgainstCatalog } from "../src";

const content = ContentDraft.parse({
  schemaVersion: 1, meta: { topic: "La derivada", level: "Universidad", objective: "Comprender la derivada" },
  sections: [
    { id: "s1", title: "Definición", slidesHint: [
      { id: "h1", intent: "Definir la derivada como límite", blocks: [
        { id: "b1", type: "definition", term: "Derivada", md: "$f'(a)=\\lim_{h\\to0}\\frac{f(a+h)-f(a)}{h}$" },
        { id: "b2", type: "graphSpec", functions: [{ expr: "x^2" }], domain: { xMin: -2, xMax: 2 }, tangents: [{ fnIndex: 0, at: 1 }] },
      ] },
      { id: "h2", intent: "Derivar x³", blocks: [{ id: "b3", type: "derivation", steps: [{ latex: "f(x)=x^3", explanation: "dada" }, { latex: "f'(x)=3x^2", explanation: "regla de la potencia" }] }] },
      { id: "h3", intent: "Notas", blocks: [{ id: "b4", type: "text", md: "- uno\n- dos" }, { id: "b5", type: "formula", latex: "e^{i\\pi}+1=0" }, { id: "b6", type: "table", headers: ["a", "b"], rows: [["1", "2"]] }] },
    ] },
    { id: "s2", title: "Aplicaciones", slidesHint: [{ id: "h4", intent: "Ejemplo", blocks: [{ id: "b7", type: "example", problem: "p", steps: [{ text: "t" }], answer: "a" }] }] },
  ],
});

describe("deckFromContent (fallback estable)", () => {
  it("produce un deck válido contra el catálogo y conserva todo el contenido", () => {
    const deck = deckFromContent(content, "Prof. X");
    const r = validateDeckAgainstCatalog(deck);
    expect(r.ok, !r.ok ? r.errors.join("\n") : "").toBe(true);
    const json = JSON.stringify(deck);
    for (const needle of ["f(a+h)", "f'(x)=3x^2", "e^{i\\\\pi}+1=0", "x^2"]) expect(json).toContain(needle);
    expect(deck.slides[0]!.layout).toBe("title");
    expect(deck.slides.filter((s) => s.layout === "section")).toHaveLength(2);
    expect(new Set(deck.slides.map((s) => s.id)).size).toBe(deck.slides.length);
  });
});

describe("nombre del docente muy largo", () => {
  it.each([121, 160])("%i caracteres: el deck sigue siendo válido (portada simple y con marca)", (n) => {
    const name = "Ñ".repeat(n);
    for (const branding of [undefined, { teacher: name.slice(0, 120) }]) {
      const deck = deckFromContent(content, name, { branding });
      expect(() => DeckDocument.parse(deck)).not.toThrow();
      expect(deck.meta.author!.length).toBeLessThanOrEqual(120);
      const r = validateDeckAgainstCatalog(deck);
      expect(r.ok, !r.ok ? r.errors.join("\n") : "").toBe(true);
    }
  });
});
