import { describe, expect, it } from "vitest";
import { ContentDraft } from "@lamina/contracts";
import { checkLatex, checkExpr, compileFn, derivativeExpr, latexToExpr, numericEquivalent, validateContent, parseSafe } from "../src";

describe("latex", () => {
  it("valida y rechaza", () => {
    expect(checkLatex("\\int_0^1 x^2\\,dx=\\frac13")).toBeNull();
    expect(checkLatex("\\frac{1}{")).toBeTruthy();
    expect(checkLatex("\\foo{x}")).toBeTruthy();
  });
});

describe("mathjs seguro", () => {
  it("evalúa expresiones válidas", () => {
    expect(compileFn("x^2 + 2x")(3)).toBe(15);
    expect(compileFn("sin(pi/2)")(0)).toBeCloseTo(1);
    expect(checkExpr("ln(x)")).toBeNull();
  });
  it("bloquea funciones/nodos peligrosos", () => {
    for (const bad of ["import('fs')", "evaluate('1')", "x = 3", "f(x) = x", "createUnit('a')", "[1,2]", "a.b", "x[1]", "parse('1')", "simplify('x')", "(1,2)", "'abc'", "{a:1}", "derivative('x','x')"])
      expect(checkExpr(bad), bad).toBeTruthy();
  });
  it("derivada simbólica", () => {
    expect(numericEquivalent(derivativeExpr("x^3 + sin(x)"), "3x^2 + cos(x)")).toBe("equal");
    expect(numericEquivalent("x^2", "x^3")).toBe("different");
  });
  it("parseSafe rechaza símbolos arbitrarios", () => expect(() => parseSafe("constructor(x)")).toThrow());
});

describe("latexToExpr", () => {
  it("convierte subconjunto", () => {
    expect(numericEquivalent(latexToExpr("\\frac{x^{2}+1}{2x}")!, "(x^2+1)/(2x)")).toBe("equal");
    expect(latexToExpr("\\sqrt{x}")).toBe("sqrt(x)");
    expect(latexToExpr("\\int x dx")).toBeNull();
    expect(latexToExpr("\\lim_{h\\to0}")).toBeNull();
  });
});

const draft = (blocks: unknown[]) =>
  ContentDraft.parse({ schemaVersion: 1, meta: { topic: "t", level: "u", objective: "o" }, sections: [{ id: "s", title: "S", slidesHint: [{ id: "h", intent: "i", blocks }] }] });

describe("validateContent", () => {
  it("verifica una derivación correcta y marca la incorrecta", () => {
    const ok = validateContent(draft([{ id: "b", type: "derivation", steps: [{ latex: "f(x)=x^3+2x", explanation: "def" }, { latex: "f'(x)=3x^2+2", explanation: "regla de la potencia" }] }]));
    expect(ok.errors).toEqual([]);
    expect(ok.warnings.filter((w) => /Posible error/.test(w.message))).toEqual([]);
    const bad = validateContent(draft([{ id: "b", type: "derivation", steps: [{ latex: "f(x)=x^3+2x", explanation: "def" }, { latex: "f'(x)=3x^2+3", explanation: "mal" }] }]));
    expect(bad.warnings.some((w) => /Posible error/.test(w.message))).toBe(true);
  });
  it("cadena con pasos que continúan con '='", () => {
    const r = validateContent(draft([{ id: "b", type: "derivation", steps: [{ latex: "\\frac{d}{dx}\\left(x^2\\right) = 2x", explanation: "a" }, { latex: "= 2x + 0", explanation: "b" }] }]));
    expect(r.warnings.filter((w) => /Posible error/.test(w.message))).toEqual([]);
    const r2 = validateContent(draft([{ id: "b", type: "formula", latex: "(x+1)^2 = x^2 + 1" }]));
    expect(r2.warnings.some((w) => /Posible error/.test(w.message))).toBe(true);
  });
  it("errores duros: LaTeX roto, gráfico con expr inválida, tabla irregular, ids repetidos", () => {
    const r = validateContent(draft([
      { id: "b1", type: "formula", latex: "\\frac{1" },
      { id: "b2", type: "graphSpec", functions: [{ expr: "import('x')" }], domain: { xMin: 0, xMax: 1 } },
      { id: "b3", type: "table", headers: ["a", "b"], rows: [["1"]] },
      { id: "b3", type: "text", md: "x" },
    ]));
    expect(r.errors.length).toBe(4);
  });
  it("no verificable → aviso visible (no se afirma verificación)", () => {
    const r = validateContent(draft([{ id: "b", type: "formula", latex: "\\int_0^1 x\\,dx = \\frac12" }]));
    expect(r.errors).toEqual([]);
    expect(r.warnings.length).toBeGreaterThan(0);
  });
});
