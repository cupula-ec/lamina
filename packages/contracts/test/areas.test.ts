import { describe, expect, it } from "vitest";
import { detectArea } from "../src/areas";

describe("detectArea", () => {
  it("respeta la elección explícita", () => expect(detectArea({ explicit: "natsci", topic: "Derivadas" })).toBe("natsci"));
  it("detecta por materia y tema", () => {
    expect(detectArea({ topic: "Estructuras de datos: pilas y colas", subject: "Programación II" })).toBe("programming");
    expect(detectArea({ topic: "Cónicas", subject: "Matemática" })).toBe("math");
    expect(detectArea({ topic: "Teorías del aprendizaje", subject: "Pedagogía" })).toBe("humanities");
  });
  it("usa general como respaldo", () => expect(detectArea({ topic: "Gestión de un restaurante" })).toBe("general"));
  it("ignora valores explícitos inválidos", () => expect(detectArea({ explicit: "xx", topic: "Fotosíntesis" , subject: "Biología"})).toBe("natsci"));
});
