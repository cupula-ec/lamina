import { describe, expect, it } from "vitest";
import { ContentDraft } from "@lamina/contracts";
import { ensureClosing, validateContent } from "../src/content";

const draft = (blocks: unknown[], extra: object = {}) => ContentDraft.parse({
  schemaVersion: 2, meta: { topic: "Pilas", level: "Grado", objective: "Entender pilas" },
  sections: [{ id: "s1", title: "Pilas", slidesHint: [{ id: "h1", intent: "Pilas", blocks }] }], ...extra,
});
const ex = (over: object = {}) => ({ id: "b1", type: "exercise", statement: "Apila 1, 2, 3 y desapila una vez. ¿Qué sale?", guidingQuestion: "¿Quién entró último?", hints: ["Piensa en LIFO."], steps: [{ do: "Apila", why: "Así entra" }], answer: "tres", ...over });

describe("validación pedagógica", () => {
  it("rechaza ejercicios cuya pista da la respuesta", () => {
    const v = validateContent(draft([ex({ hints: ["Sale tres, el último."] })]));
    expect(v.errors.join()).toMatch(/respuesta/);
  });
  it("acepta un ejercicio bien formado", () => expect(validateContent(draft([ex()])).errors).toEqual([]));
  it("ensureClosing añade un cierre al final y es idempotente", () => {
    const d = ensureClosing(draft([{ id: "b0", type: "text", md: "- Idea A\n- Idea B" }]));
    const last = d.sections[0]!.slidesHint.at(-1)!.blocks[0]!;
    expect(last.type).toBe("closing");
    expect(last.type === "closing" && last.keyIdeas).toEqual(["Idea A", "Idea B"]);
    expect(ensureClosing(d)).toBe(d);
  });
});
