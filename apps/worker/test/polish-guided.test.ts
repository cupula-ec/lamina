import { describe, expect, it } from "vitest";
import { ContentDraft } from "@lamina/contracts";
import { deckFromContent } from "@lamina/components";
import { applySuggestions, deterministicPolish, disallowedChanges } from "../src/handlers/polish";

const content = ContentDraft.parse({
  schemaVersion: 2, meta: { topic: "Pilas", level: "Grado", objective: "Entender pilas" },
  sections: [{ id: "s1", title: "Pilas", slidesHint: [
    { id: "h1", intent: "Práctica", blocks: [{ id: "b1", type: "exercise", statement: "Apila 1, 2, 3 y desapila una vez.", guidingQuestion: "¿Quién entró último?", hints: ["LIFO", "Mira el tope"], steps: [{ do: "Apila", why: "Así entra" }, { do: "Desapila", why: "Sale el tope" }], answer: "3" }] },
    { id: "h2", intent: "Traza", blocks: [{ id: "b2", type: "code", language: "python", source: "a = 1\nb = 2" }] },
  ] }],
});

describe("pulido de ejercicios guiados", () => {
  const deck = deckFromContent(content);
  it("el pulido determinista conserva el revelado del Exercise (pistas + pasos + respuesta)", () => {
    const p = deterministicPolish(deck);
    const s = p.slides.find((x) => x.id === "h1")!;
    expect(s.build.steps).toHaveLength(2 + 2 + 1);
    expect((s.slots.main!.props as { stepwise: boolean }).stepwise).toBe(true);
    expect(disallowedChanges(deck, p)).toEqual([]);
  });
  it("las sugerencias del modelo no pisan el revelado guiado", () => {
    const base = deterministicPolish(deck);
    const out = applySuggestions(base, { slides: [{ id: "h1", build: { steps: [{ reveal: ["main"] }] } }] });
    expect(out.slides.find((x) => x.id === "h1")!.build.steps).toHaveLength(5);
  });
});
