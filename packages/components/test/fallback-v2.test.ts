import { describe, expect, it } from "vitest";
import { ContentDraft, parseDeckAny } from "@lamina/contracts";
import { deckFromContent } from "../src/fallback";

const content = ContentDraft.parse({
  schemaVersion: 2, meta: { topic: "Pilas", level: "Grado", objective: "Entender pilas" },
  sections: [
    { id: "s1", title: "Pilas", slidesHint: [
      { id: "h1", intent: "Por qué pilas", blocks: [{ id: "b1", type: "motivation", hook: "Deshacer en un editor", intuition: "Lo último que haces es lo primero que se deshace." }] },
      { id: "h2", intent: "Práctica", blocks: [{ id: "b2", type: "exercise", statement: "Apila 1, 2, 3 y desapila una vez.", guidingQuestion: "¿Quién entró último?", hints: ["Piensa en LIFO."], steps: [{ do: "Apila", why: "Así entra" }], answer: "3" }] },
      { id: "h3", intent: "Imagen", blocks: [{ id: "b3", type: "imageRequest", query: "stack", purpose: "ilustrar", alt: "Pila de platos" }] },
    ] },
    { id: "s2", title: "Cierre", slidesHint: [{ id: "h4", intent: "Cierre de clase", blocks: [{ id: "b4", type: "closing", keyIdeas: ["LIFO"] }] }] },
  ],
});

describe("fallback con bloques pedagógicos v2", () => {
  const deck = deckFromContent(content);
  it("produce un deck válido", () => expect(() => parseDeckAny(deck)).not.toThrow());
  it("el ejercicio oculta la respuesta tras pasos de revelado", () => {
    const s = deck.slides.find((x) => x.id === "h2")!;
    expect(s.slots.main!.componentId).toBe("Checkpoint");
    expect(s.build.steps.length).toBe(2);
  });
  it("ignora imageRequest y cierra con el layout closing", () => {
    expect(deck.slides.some((x) => x.id === "h3")).toBe(false);
    expect(deck.slides.at(-1)!.layout).toBe("closing");
  });
});

describe("imageRequest resuelto", () => {
  const images = new Map([["b3", { assetId: "11111111-1111-4111-8111-111111111111", alt: "Pila de platos", credit: "Ana · CC BY · wikimedia" }]]);
  it("se convierte en un componente Image válido", () => {
    const deck = deckFromContent(content, undefined, { images });
    const s = deck.slides.find((x) => x.id === "h3")!;
    expect(s.slots.main!.componentId).toBe("Image");
    expect((s.slots.main!.props as { assetId: string }).assetId).toBe("11111111-1111-4111-8111-111111111111");
    expect(() => parseDeckAny(deck)).not.toThrow();
  });
});
