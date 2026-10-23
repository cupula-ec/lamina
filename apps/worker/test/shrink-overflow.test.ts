import { describe, expect, it } from "vitest";
import type { Slide } from "@lamina/contracts";
import { MIN_AUTO_SCALE, shrinkOverflow } from "../src/handlers/repair";

const slide = { id: "s", layout: "title-content", slots: { main: { componentId: "BulletPoints", version: "1.0.0", props: {} }, title: { componentId: "SectionHeader", version: "1.0.0", props: {} } }, notes: "", build: { steps: [] }, transition: "fade" } as unknown as Slide;
const ov = (slot: string) => ({ slot, kind: "overflow", severity: "error", message: "x" });

describe("shrinkOverflow", () => {
  it("reduce la escala del slot desbordado", () => {
    expect(shrinkOverflow(slide, [ov("main")])?.adjust?.main?.fontScale).toBe(0.85);
  });
  it("respeta el mínimo y no repite sin cambio", () => {
    const s = { ...slide, adjust: { main: { fontScale: MIN_AUTO_SCALE } } } as Slide;
    expect(shrinkOverflow(s, [ov("main")])).toBeNull();
  });
  it("no actúa si hay errores que no son desbordes", () => {
    expect(shrinkOverflow(slide, [ov("main"), { slot: "main", kind: "katex_error", severity: "error", message: "x" }])).toBeNull();
  });
});
