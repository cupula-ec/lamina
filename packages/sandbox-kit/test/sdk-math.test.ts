import { describe, expect, it } from "vitest";
import { compileFn, compileFn2, compilePolar, ellipsePath, hyperbolaPaths, implicitContours, parametric, polar, segmentsPath } from "../../../sandbox/sdk/math";

describe("SDK: compileFn (sin regresiones)", () => {
  it("evalúa y=f(x)", () => {
    expect(compileFn("x^2 + 2x")(3)).toBe(15);
    expect(compileFn("sin(pi/2)")(0)).toBeCloseTo(1);
    expect(compileFn("2(x+1)")(2)).toBe(6);
    expect(compileFn("-x^2")(3)).toBe(-9);
    expect(compileFn("pow(2, t)")(3)).toBe(8);
  });
  it("rechaza identificadores no permitidos", () => {
    expect(() => compileFn("y + 1")).toThrow();
    expect(() => compileFn("foo(x)")).toThrow();
  });
});

describe("SDK: curvas", () => {
  it("compileFn2 evalúa en x e y", () => {
    const f = compileFn2("x^2/4 + y^2/9 - 1");
    expect(f(2, 0)).toBeCloseTo(0);
    expect(f(0, 3)).toBeCloseTo(0);
    expect(f(0, 0)).toBe(-1);
  });
  it("implicitContours dibuja una elipse cerrada cuyos puntos satisfacen f≈0", () => {
    const f = compileFn2("x^2/4 + y^2/9 - 1");
    const segs = implicitContours(f, { xMin: -4, xMax: 4, yMin: -5, yMax: 5 }, 120);
    expect(segs.length).toBeGreaterThan(100);
    for (const s of segs) { expect(Math.abs(f(s[0], s[1]))).toBeLessThan(0.05); expect(Math.abs(f(s[2], s[3]))).toBeLessThan(0.05); }
    expect(segmentsPath(segs.slice(0, 2))).toMatch(/^M[\d.\-]+ [\d.\-]+ L/);
  });
  it("parametric y polar", () => {
    const c = parametric(compileFn("2cos(t)"), compileFn("3sin(t)"), [0, 2 * Math.PI], 100);
    expect(c.length).toBe(101);
    expect(c[0]![0]).toBeCloseTo(2);
    const r = polar(compilePolar("1 + cos(theta)"), [0, 2 * Math.PI], 360);
    expect(Math.max(...r.map((p) => p[0]))).toBeCloseTo(2, 1);
  });
  it("ellipsePath e hyperbolaPaths generan trazos SVG", () => {
    expect(ellipsePath(10, 10, 5, 3)).toMatch(/^M.*Z$/);
    const [a, b] = hyperbolaPaths(0, 0, 2, 3, 6);
    expect(a.startsWith("M")).toBe(true);
    expect(a).not.toBe(b);
  });
});
