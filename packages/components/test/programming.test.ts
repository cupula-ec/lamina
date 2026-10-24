import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NATIVE_CATALOG } from "../src";

const ctx = (revealCount: number | null = null) => ({ layout: "split-visual", slot: "visual", width: 988, height: 750, revealCount });
const render = (id: string, raw: unknown, revealCount: number | null = null) => {
  const e = NATIVE_CATALOG.find((c) => c.def.id === id)!;
  return renderToStaticMarkup(createElement(e.def.Component, { props: e.def.propsSchema.parse(raw), ctx: ctx(revealCount) } as never));
};

describe("programación", () => {
  it("todos los ejemplos se dibujan", () => {
    for (const id of ["CodeBlock", "CodeTrace", "ConsoleOutput", "Flowchart", "DataStructure"]) for (const ex of NATIVE_CATALOG.find((c) => c.def.id === id)!.examples) expect(render(id, ex.props), `${id}/${ex.name}`.toString()).not.toContain("data-lamina-error");
  });
  it("CodeBlock resalta sintaxis y líneas, sin interpretar el código como HTML", () => {
    const html = render("CodeBlock", { code: 'if x < 3: # <b>hola</b>\n    print("<img src=x>")', language: "python", highlight: [2] });
    expect(html).toContain("lm-tok-kw");
    expect(html).toContain('data-active="1"');
    expect(html).not.toContain("<img");
    expect(html).not.toContain("<b>hola");
  });
  it("CodeTrace revela un paso por avance", () => {
    const raw = { code: "a = 1\nb = 2", steps: [{ line: 1, vars: { a: 1 } }, { line: 2, vars: { a: 1, b: 2 } }], stepwise: true };
    expect(render("CodeTrace", raw, 0)).toContain("Paso 1 de 2");
    expect(render("CodeTrace", raw, 1)).toContain("Paso 2 de 2");
  });
  it("Flowchart exige flechas entre nodos existentes", () => {
    const schema = NATIVE_CATALOG.find((c) => c.def.id === "Flowchart")!.def.propsSchema;
    expect(schema.safeParse({ nodes: [{ id: "a", label: "A" }, { id: "b", label: "B" }], edges: [{ from: "a", to: "zz" }] }).success).toBe(false);
  });
  it("DataStructure: árbol con hijos vacíos y grafo", () => {
    expect(render("DataStructure", { kind: "tree", items: ["5", "2", "", "1"] })).toContain("<circle");
    expect(render("DataStructure", { kind: "graph", items: ["A", "B", "C"], edges: [[0, 1], [1, 2]] })).toContain("<line");
  });
});
