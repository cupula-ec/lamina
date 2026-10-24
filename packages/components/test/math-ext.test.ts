import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NATIVE_CATALOG } from "../src";
import { implicitContours, toImplicit } from "../src/curves";

const ctx = { layout: "split-visual", slot: "visual", width: 988, height: 750, revealCount: null };
const render = (id: string, raw: unknown) => {
  const e = NATIVE_CATALOG.find((c) => c.def.id === id)!;
  return renderToStaticMarkup(createElement(e.def.Component, { props: e.def.propsSchema.parse(raw), ctx } as never));
};

describe("matemáticas ampliadas", () => {
  it("todos los ejemplos del catálogo se dibujan sin error y con trazos", () => {
    for (const id of ["ConicFigure", "ImplicitPlot", "ParametricPlot", "PolarPlot", "StatChart"]) {
      const e = NATIVE_CATALOG.find((c) => c.def.id === id)!;
      for (const ex of e.examples) {
        const html = render(id, ex.props);
        expect(html, `${id}/${ex.name}`).not.toContain("data-lamina-error");
        expect(html).toMatch(/<(path|rect|circle)/);
      }
    }
  });
  it("ConicFigure: hipérbola con asíntotas y parábola con directriz", () => {
    expect(render("ConicFigure", { kind: "hyperbola", a: 3, b: 2 })).toContain("lm-asymptote");
    expect(render("ConicFigure", { kind: "parabola", p: 2, direction: "right" })).toContain("directriz");
  });
  it("ImplicitPlot: ecuación con signo = y error legible si no se puede evaluar", () => {
    expect(render("ImplicitPlot", { curves: [{ equation: "x^2 + y^2 = 4" }], xDomain: [-3, 3], yDomain: [-3, 3] })).toContain("lm-curve");
    expect(render("ImplicitPlot", { curves: [{ equation: "import(x)" }], xDomain: [-3, 3], yDomain: [-3, 3] })).toContain("data-lamina-error");
  });
  it("ParametricPlot y PolarPlot rechazan funciones no permitidas sin romper", () => {
    expect(render("ParametricPlot", { curves: [{ x: "evaluate(t)", y: "t" }], tRange: [0, 1] })).toContain("data-lamina-error");
    expect(render("PolarPlot", { curves: [{ r: "2 sin(3 theta)" }] })).toContain("lm-curve");
  });
  it("StatChart: histograma, cajas y dispersión con regresión", () => {
    expect(render("StatChart", { kind: "histogram", values: [1, 2, 2, 3, 3, 3, 4, 5], bins: 4 })).toContain("lm-bar");
    expect(render("StatChart", { kind: "box", groups: [{ label: "A", values: [1, 2, 3, 4, 10] }, { label: "B", values: [2, 3, 4] }] })).toContain(">A<");
    expect(render("StatChart", { kind: "scatter", points: [{ x: 1, y: 1 }, { x: 2, y: 2 }, { x: 3, y: 3 }], regression: true })).toContain("lm-tangent");
  });
  it("curves: toImplicit y contornos", () => {
    expect(toImplicit("x^2 = 4")).toBe("(x^2 ) - ( 4)");
    expect(() => toImplicit("a=b=c")).toThrow();
    expect(implicitContours((x, y) => x * x + y * y - 1, { xMin: -2, xMax: 2, yMin: -2, yMax: 2 }, 60).length).toBeGreaterThan(40);
  });
});
