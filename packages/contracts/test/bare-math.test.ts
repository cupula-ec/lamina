import { describe, expect, it } from "vitest";
import { wrapBareMath } from "../src";

describe("wrapBareMath", () => {
  it("envuelve matrices sueltas", () => {
    expect(wrapBareMath("\\begin{pmatrix}1&3\\\\4&2\\end{pmatrix}")).toBe("$\\begin{pmatrix}1&3\\\\4&2\\end{pmatrix}$");
  });
  it("envuelve comandos inline con sus operandos", () => {
    expect(wrapBareMath("Una matriz de orden m\\times n se llama rectangular.")).toBe("Una matriz de orden $m\\times n$ se llama rectangular.");
    expect(wrapBareMath("Si \\alpha \\cdot A es válida.")).toBe("Si $\\alpha \\cdot A$ es válida.");
  });
  it("deja intacto lo ya delimitado y es idempotente", () => {
    const t = "Orden $m\\times n$ y texto";
    expect(wrapBareMath(t)).toBe(t);
    const once = wrapBareMath("vale (A\\pm B).");
    expect(wrapBareMath(once)).toBe(once);
  });
  it("no toca texto sin LaTeX", () => {
    expect(wrapBareMath("Sin nada especial y a b c")).toBe("Sin nada especial y a b c");
  });
  it("no rompe markdown", () => {
    for (const t of ["x y z", "costo \\$5 y otro \\$7", "`printf(\"\\n\")`", "```\n\\alpha\n```", "salto\\\nsig"])
      expect(wrapBareMath(t)).toBe(t);
    expect(wrapBareMath("- \\alpha\n- \\beta")).toBe("- $\\alpha$\n- $\\beta$");
    expect(wrapBareMath("**\\alpha**")).toBe("**$\\alpha$**");
    expect(wrapBareMath("\\alpha y \\beta")).toBe("$\\alpha$ y $\\beta$");
  });
  it("es idempotente, incluso con $ sueltos y matrices multilínea", () => {
    for (const t of ["cuesta $5 y \\alpha", "M = \\begin{pmatrix}1 & 2 \\\\\n3 & 4\\end{pmatrix}", "orden m\\times n y \\alpha \\cdot A."]) {
      const once = wrapBareMath(t);
      expect(wrapBareMath(once)).toBe(once);
    }
  });
});
