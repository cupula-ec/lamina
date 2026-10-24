import { describe, expect, it } from "vitest";
import { checklist, guidanceNotes, quality } from "../src/lib/request-quality";

const empty = { objective: "", level: "Universidad", prior: "", examples: "", avoid: "", materials: false };
describe("calidad del pedido", () => {
  it("básico → bueno → excelente a medida que se completan los ítems (el nivel no cuenta)", () => {
    expect(quality(empty)).toMatchObject({ level: "basic", done: 0 });
    expect(quality({ ...empty, objective: "Que los estudiantes calculen derivadas de funciones compuestas con la regla de la cadena", materials: true })).toMatchObject({ level: "good", done: 2 });
    expect(quality({ ...empty, objective: "Que los estudiantes calculen derivadas de funciones compuestas con la regla de la cadena", materials: true, prior: "Conocen límites", examples: "Un ejemplo con trigonometría" })).toMatchObject({ level: "excellent", done: 4, total: 5 });
  });
  it("cada ítem explica por qué ayuda y el de materiales avisa del costo", () => {
    const items = checklist(empty);
    expect(items.every((i) => i.why.length > 10)).toBe(true);
    expect(items.find((i) => i.id === "materials")!.cost).toMatch(/tiempo/);
  });
  it("las indicaciones del docente se guardan etiquetadas y vacías no generan nada", () => {
    expect(guidanceNotes({ prior: "", examples: "", avoid: " " })).toBeUndefined();
    expect(guidanceNotes({ prior: "Conocen límites", examples: "", avoid: "demostraciones largas" })).toBe("Lo que los estudiantes ya saben: Conocen límites\nEvitar: demostraciones largas");
  });
});
