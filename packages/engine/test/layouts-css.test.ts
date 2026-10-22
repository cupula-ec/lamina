import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const css = fs.readFileSync(path.join(__dirname, "../src/layouts.css"), "utf8");
const rules = (sel: string) => [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter((m) => m[1]!.split(",").some((x) => x.trim() === sel)).map((m) => m[2]!).join(" ");

describe("zonas de marca acotadas (valores máximos no desbordan la portada ni el cierre)", () => {
  it.each([".lm-cover-meta", ".lm-wordmark"])("%s: line-clamp + overflow hidden + límite de altura", (sel) => {
    const r = rules(sel);
    expect(r, sel).toMatch(/line-clamp:\s*2/);
    expect(r, sel).toMatch(/overflow:\s*hidden/);
    expect(r, sel).toMatch(/max-height:/);
  });
  it(".lm-closing-foot: una sola línea con elipsis", () => {
    const r = rules(".lm-closing-foot") + rules(".lm-closing-foot > *");
    expect(r).toMatch(/overflow:\s*hidden/);
    expect(r).toMatch(/max-height:/);
    expect(r).toMatch(/text-overflow:\s*ellipsis/);
    expect(r).toMatch(/white-space:\s*nowrap/);
  });
});
