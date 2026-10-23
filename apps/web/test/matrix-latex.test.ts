import { describe, expect, it } from "vitest";
import { hasMatrix, parseMatrices, resize, serializeMatrices } from "../src/lib/matrix-latex";

describe("matrix-latex", () => {
  const src = "A = \\begin{pmatrix}1 & 3 \\\\ 4 & 2\\end{pmatrix} + \\begin{bmatrix}a_{12}\\end{bmatrix}";
  it("separa texto y matrices", () => {
    const p = parseMatrices(src);
    expect(p.map((x) => x.t)).toEqual(["text", "matrix", "text", "matrix"]);
    expect(p[1]).toMatchObject({ env: "pmatrix", rows: [["1", "3"], ["4", "2"]] });
    expect(p[3]).toMatchObject({ env: "bmatrix", rows: [["a_{12}"]] });
  });
  it("ida y vuelta conserva el contenido", () => {
    expect(parseMatrices(serializeMatrices(parseMatrices(src)))).toEqual(parseMatrices(src));
  });
  it("detecta matrices y redimensiona", () => {
    expect(hasMatrix("x^2")).toBe(false);
    expect(hasMatrix(src)).toBe(true);
    expect(resize([["1"]], 2, 2)).toEqual([["1", "0"], ["0", "0"]]);
  });
});

import { applyInstruction } from "../src/lib/matrix-latex";
describe("applyInstruction", () => {
  const A = "A=\\begin{pmatrix}a_{11} & a_{12} \\\\ a_{21} & a_{22}\\end{pmatrix}";
  it("cambia a12 por a13 (subíndices)", () => {
    const r = applyInstruction(A, "Cambia a12 por a13");
    expect(r.ok && r.latex).toContain("a_{13}");
    expect(r.ok && r.latex).not.toContain("a_{12}");
  });
  it("cambia una celda por posición", () => {
    const r = applyInstruction(A, "cambia la fila 2 columna 1 por 5");
    expect(r.ok && parseMatrices(r.latex).find((p) => p.t === "matrix")).toMatchObject({ rows: [["a_{11}", "a_{12}"], ["5", "a_{22}"]] });
  });
  it("agrega y quita filas/columnas", () => {
    const add = applyInstruction(A, "agrega una columna");
    expect(add.ok && (parseMatrices(add.latex)[1] as any).rows[0]).toHaveLength(3);
    const del = applyInstruction(A, "quita la última fila");
    expect(del.ok && (parseMatrices(del.latex)[1] as any).rows).toHaveLength(1);
  });
  it("explica lo que no entiende o no encuentra", () => {
    expect(applyInstruction(A, "hazlo bonito")).toMatchObject({ ok: false });
    expect(applyInstruction(A, "cambia z9 por 1")).toMatchObject({ ok: false });
    expect(applyInstruction("x^2", "cambia fila 1 columna 1 por 2")).toMatchObject({ ok: false });
  });
});

describe("applyInstruction (revisión)", () => {
  const A = "A=\\begin{pmatrix}a_{11} & a_{12} \\\\ a_{21} & a_{22}\\end{pmatrix}";
  it("«por/a/con» solo como palabra", () => {
    const r = applyInstruction(A, "fila 1 columna 2 cambiala por 7");
    expect(r.ok && parseMatrices(r.latex).find((p) => p.t === "matrix")).toMatchObject({ rows: [["a_{11}", "7"], ["a_{21}", "a_{22}"]] });
  });
  it("rechaza posiciones que no soporta", () => {
    expect(applyInstruction(A, "quita la fila 1")).toMatchObject({ ok: false });
    expect(applyInstruction(A, "agrega una fila al principio")).toMatchObject({ ok: false });
  });
  it("no rompe comandos ni llaves", () => {
    expect(applyInstruction("2\\pi r", "cambia pi por 3")).toMatchObject({ ok: false });
    const r = applyInstruction("\\frac{a}{b}", "cambia a por c");
    expect(r.ok && r.latex).toBe("\\frac{c}{b}");
  });
  it("conserva filas vacías al editar", () => {
    const rows = (parseMatrices("\\begin{pmatrix}1 \\\\ \\\\ 3\\end{pmatrix}")[0] as any).rows;
    expect(rows).toEqual([["1"], [""], ["3"]]);
    expect((parseMatrices("\\begin{pmatrix}1 \\\\ 2 \\\\ \\end{pmatrix}")[0] as any).rows).toEqual([["1"], ["2"]]);
  });
});
