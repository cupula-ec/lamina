import { describe, expect, it } from "vitest";
import { entryStep, nextPos, prevPos } from "../src/build";

const slide = (slots: string[], steps: string[][]) => ({
  slots: Object.fromEntries(slots.map((k) => [k, {}])) as any,
  build: { steps: steps.map((reveal) => ({ reveal })) },
});

describe("entryStep", () => {
  it("0 si algún slot es visible desde el inicio", () => {
    expect(entryStep(slide(["title", "body"], [["body"]]))).toBe(0);
  });
  it("avanza hasta el primer paso con contenido si todo está gateado", () => {
    expect(entryStep(slide(["a", "b"], [["a"], ["b"]]))).toBe(1);
  });
  it("la navegación no se detiene en un estado vacío", () => {
    const slides = [slide(["t"], []), slide(["a"], [["a"], ["a"]])] as any[];
    expect(nextPos(slides, { slide: 0, step: 0 })).toEqual({ slide: 1, step: 1 });
    expect(prevPos(slides, { slide: 1, step: 1 })).toEqual({ slide: 0, step: 0 });
  });
});
