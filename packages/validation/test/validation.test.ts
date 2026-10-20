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

const draftOn = (topic: string) => (blocks: unknown[]) =>
  ContentDraft.parse({ schemaVersion: 1, meta: { topic, level: "u", objective: "o" }, sections: [{ id: "s", title: "S", slidesHint: [{ id: "h", intent: "i", blocks }] }] });
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

describe("álgebra lineal y varias variables", () => {
  const w = (latex: string) => validateContent(draftOn("Álgebra lineal: matrices")([{ id: "b", type: "formula", latex }]));
  const bad = (latex: string) => w(latex).warnings.some((x) => /Posible error/.test(x.message));
  const unv = (latex: string) => w(latex).warnings.some((x) => /No se pudo verificar/.test(x.message));

  it("identidades matriciales correctas quedan verificadas", () => {
    for (const l of ["A+B=B+A", "(A+B)+C=A+(B+C)", "(AB)^T=B^TA^T", "(AB)^{-1}=B^{-1}A^{-1}", "A(B+C)=AB+AC", "AI=A", "IA=A", "A+O=A", "(A^T)^T=A", "k(A+B)=kA+kB", "(kA)^T=kA^T", "\\det(AB)=\\det(A)\\det(B)", "\\operatorname{tr}(AB)=\\operatorname{tr}(BA)"]) {
      expect(bad(l), l).toBe(false);
      expect(unv(l), l).toBe(false);
    }
  });
  it("detecta errores matriciales", () => {
    for (const l of ["AB=BA", "(AB)^T=A^TB^T", "(A+B)^2=A^2+2AB+B^2", "\\det(A+B)=\\det(A)+\\det(B)"]) expect(bad(l), l).toBe(true);
  });
  it("AB ≠ BA se verifica; una desigualdad falsa se marca", () => {
    expect(bad("AB \\neq BA")).toBe(false);
    expect(unv("AB \\neq BA")).toBe(false);
    expect(bad("A+B \\neq B+A")).toBe(true);
  });
  it("matrices numéricas", () => {
    expect(bad("\\begin{bmatrix}1&2\\\\3&4\\end{bmatrix}\\begin{bmatrix}5&6\\\\7&8\\end{bmatrix}=\\begin{bmatrix}19&22\\\\43&50\\end{bmatrix}")).toBe(false);
    expect(unv("\\begin{bmatrix}1&2\\\\3&4\\end{bmatrix}\\begin{bmatrix}5&6\\\\7&8\\end{bmatrix}=\\begin{bmatrix}19&22\\\\43&50\\end{bmatrix}")).toBe(false);
    expect(bad("\\begin{bmatrix}1&2\\\\3&4\\end{bmatrix}\\begin{bmatrix}5&6\\\\7&8\\end{bmatrix}=\\begin{bmatrix}19&22\\\\43&51\\end{bmatrix}")).toBe(true);
    expect(w("\\det\\begin{pmatrix}a&b\\\\c&d\\end{pmatrix}=ad-bc").warnings).toEqual([]);
    expect(bad("\\begin{pmatrix}a&b\\\\c&d\\end{pmatrix}^T=\\begin{pmatrix}a&c\\\\b&d\\end{pmatrix}")).toBe(false);
  });
  it("escalares con varias variables y subíndices", () => {
    expect(w("(a+b)^2=a^2+2ab+b^2").warnings).toEqual([]);
    expect(bad("(a+b)^2=a^2+b^2")).toBe(true);
    expect(bad("a_{11}a_{22}=a_{22}a_{11}")).toBe(false);
  });
  it("definiciones y ecuaciones por resolver no son errores ni avisos de verificación", () => {
    expect(w("m = 2ab").warnings).toEqual([]);
    expect(bad("2x+3=7")).toBe(false);
    expect(bad("y-9=6(x-3)")).toBe(false);
    expect(bad("x^2+y^2=r^2")).toBe(false);
    expect(bad("\\det(A-\\lambda I)=0")).toBe(false);
    expect(w("A\\mathbf{x}=\\mathbf{b}").warnings.some((x) => /Posible error/.test(x.message))).toBe(false);
  });
  it("lo no soportado sigue siendo «no verificable»", () => {
    expect(unv("\\int_0^1 x\\,dx=\\frac12")).toBe(true);
    expect(unv("\\sum_{i=1}^n i=\\frac{n(n+1)}{2}")).toBe(true);
  });
  it("física: las mayúsculas son escalares (no matrices)", () => {
    const f = (latex: string) => validateContent(draftOn("Circuitos eléctricos")([{ id: "b", type: "formula", latex }])).warnings;
    expect(f("\\frac{1}{R_1}+\\frac{1}{R_2}=\\frac{R_1+R_2}{R_1R_2}")).toEqual([]);
    expect(f("\\frac{V}{R}=\\frac{1}{R}V")).toEqual([]);
  });
  it("una llamada f(a+b) no se toma como multiplicación", () => {
    expect(bad("f(a+b)=f(a)+f(b)")).toBe(false);
    expect(unv("f(a+b)=f(a)+f(b)")).toBe(true);
  });
  it("definir f(x) no genera avisos; t y n se verifican", () => {
    expect(w("f(x)=x^2").warnings).toEqual([]);
    expect(bad("2t+3t=6t")).toBe(true);
    expect(bad("n(n+1)=n^2")).toBe(true);
    expect(w("2t+3t=5t").warnings).toEqual([]);
  });
  it("los avisos nunca superan el límite del contrato", () => {
    const big = "\\begin{pmatrix}\\frac{1}{2}&\\frac{3}{4}&\\frac{5}{6}\\\\\\frac{7}{8}&\\frac{9}{10}&\\frac{11}{12}\\\\\\frac{13}{14}&\\frac{15}{16}&\\frac{17}{18}\\end{pmatrix}";
    const r = validateContent(draftOn("Matrices")([{ id: "b", type: "formula", latex: `M^T + M = M + ${big}` }]));
    expect(r.warnings.every((x) => x.message.length <= 400)).toBe(true);
    expect(() => ContentDraft.parse({ schemaVersion: 1, meta: { topic: "t", level: "u", objective: "o" }, warnings: r.warnings, sections: [{ id: "s", title: "S", slidesHint: [{ id: "h", intent: "i", blocks: [{ id: "b", type: "formula", latex: "x" }] }] }] })).not.toThrow();
  });
});
