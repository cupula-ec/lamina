import { describe, expect, it } from "vitest";
import { resolveFlag, type FlagConfig } from "../src/flags";

describe("flags V3", () => {
  const cfg: FlagConfig = {
    v3_images: { mode: "testers", testers: ["t1"], users: { u9: true }, presentations: { p1: false } },
    v3_areas: { mode: "volunteers", testers: ["t1"], volunteers: ["v1"] },
    v3_motion: { mode: "all", users: { bad: false } },
  };
  it("sin configuración todo está apagado", () => {
    expect(resolveFlag(null, "v3_images", { userId: "t1" })).toBe(false);
    expect(resolveFlag({}, "v3_workspace")).toBe(false);
  });
  it("testers → voluntarios → todos", () => {
    expect(resolveFlag(cfg, "v3_images", { userId: "t1" })).toBe(true);
    expect(resolveFlag(cfg, "v3_images", { userId: "v1" })).toBe(false);
    expect(resolveFlag(cfg, "v3_areas", { userId: "v1" })).toBe(true);
    expect(resolveFlag(cfg, "v3_areas", { userId: "x" })).toBe(false);
    expect(resolveFlag(cfg, "v3_motion", { userId: "x" })).toBe(true);
  });
  it("`off` apaga también los overrides (interruptor general)", () => {
    expect(resolveFlag({ v3_images: { mode: "off", users: { u1: true }, presentations: { p1: true } } }, "v3_images", { userId: "u1", presentationId: "p1" })).toBe(false);
  });
  it("overrides: presentación > usuario > modo", () => {
    expect(resolveFlag(cfg, "v3_images", { userId: "u9" })).toBe(true);
    expect(resolveFlag(cfg, "v3_images", { userId: "t1", presentationId: "p1" })).toBe(false);
    expect(resolveFlag(cfg, "v3_motion", { userId: "bad" })).toBe(false);
  });
});
