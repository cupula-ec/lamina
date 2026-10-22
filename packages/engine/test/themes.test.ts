import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { ACCENT_IDS, BRAND_MIN_CONTRAST, BRAND_THEMES, THEME_IDS, THEMES, brandColorFor, contrastRatio, type ThemeId } from "@lamina/contracts";

const DIR = path.join(__dirname, "../src/themes");
type Vars = Record<string, string>;

function parseTheme(id: string): Record<string, Vars> {
  const css = fs.readFileSync(path.join(DIR, `${id}.css`), "utf8");
  const out: Record<string, Vars> = {};
  for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const sel = m[1]!.replace(/\/\*[\s\S]*?\*\//g, "").trim();
    const acc = /\[data-accent="([abc])"\]/.exec(sel)?.[1] ?? "a";
    const vars: Vars = {};
    for (const v of m[2]!.matchAll(/(--lm-[a-z0-9-]+)\s*:\s*([^;]+);/g)) vars[v[1]!] = v[2]!.trim();
    out[acc] = { ...(out[acc] ?? {}), ...vars };
  }
  return { a: out.a!, b: { ...out.a!, ...out.b }, c: { ...out.a!, ...out.c } };
}

const hexOf = (vars: Vars, name: string): string => {
  let v = vars[name];
  for (let i = 0; v && v.startsWith("var(") && i < 4; i++) {
    const m = /^var\((--lm-[a-z0-9-]+)\s*(?:,\s*(.+))?\)$/.exec(v)!;
    v = vars[m[1]!] ?? m[2];
  }
  if (!v || !/^#[0-9a-f]{6}$/i.test(v)) throw new Error(`${name} no es un color hexadecimal: ${v}`);
  return v.toLowerCase();
};
const lin = (c: number) => { const v = c / 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
const lum = (h: string) => { const [r, g, b] = rgb(h); return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b); };
const ratio = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p) as [number, number]; return (x + 0.05) / (y + 0.05); };
const blend = (fg: string, bg: string, alpha: number) => `#${rgb(bg).map((c, i) => Math.round(c * (1 - alpha) + rgb(fg)[i]! * alpha).toString(16).padStart(2, "0")).join("")}`;

describe("temas: CSS y contraste AA", () => {
  it("cada tema del catálogo tiene su CSS y viceversa", () => {
    const files = fs.readdirSync(DIR).filter((f) => f.endsWith(".css")).map((f) => f.replace(/\.css$/, "")).sort();
    expect(files).toEqual([...THEME_IDS].sort());
    const engine = fs.readFileSync(path.join(__dirname, "../src/engine.css"), "utf8");
    for (const id of THEME_IDS) expect(engine).toContain(`./themes/${id}.css`);
  });

  for (const id of THEME_IDS) {
    for (const acc of ACCENT_IDS) {
      it(`${id} / acento ${acc}: texto, acentos y gráficas cumplen AA`, () => {
        const v = parseTheme(id)[acc]!;
        const c = (n: string) => hexOf(v, `--lm-${n}`);
        const checks: [string, number, number][] = [
          ["ink/bg", ratio(c("ink"), c("bg")), 7], ["ink/panel", ratio(c("ink"), c("panel")), 7],
          ["muted/bg", ratio(c("muted"), c("bg")), 4.5], ["muted/panel", ratio(c("muted"), c("panel")), 4.5],
          ["accent/bg", ratio(c("accent"), c("bg")), 4.5], ["accent/panel", ratio(c("accent"), c("panel")), 4.5],
          ["accent2/bg", ratio(c("accent2"), c("bg")), 4.5], ["accent2/panel", ratio(c("accent2"), c("panel")), 4.5],
          ["bg sobre accent2 (números de paso, cabeceras)", ratio(c("bg"), c("accent2")), 4.5], ["bg sobre accent (cabeceras)", ratio(c("bg"), c("accent")), 4.5],
          ["respuesta", ratio(c("answer-ink"), c("answer")), 4.5], ["resaltado", ratio(c("hl-ink"), c("mark")), 4.5],
          ["pregunta", ratio(c("cp-ink"), c("cp-bg")), 4.5], ["etiqueta pregunta", ratio(c("cp-label"), c("cp-bg")), 4.5],
          ["pen/bg", ratio(c("pen"), c("bg")), 3], ["pen/panel", ratio(c("pen"), c("panel")), 3],
          ...([1, 2, 3, 4] as const).map((n): [string, number, number] => [`plot${n}/bg`, ratio(c(`plot${n}`), c("bg")), 3]),
        ];
        for (const [what, got, min] of checks) expect(got, `${what}: ${got.toFixed(2)} < ${min}`).toBeGreaterThanOrEqual(min);
      });
      it(`${id} / acento ${acc}: la decoración al máximo de opacidad no resta legibilidad al texto`, () => {
        const v = parseTheme(id)[acc]!;
        const bg = hexOf(v, "--lm-bg");
        for (const [opKey, label] of [["--lm-deco-opacity", "portada/sección/cierre"], ["--lm-deco-bg-opacity", "interior"]] as const) {
          const alpha = parseFloat(v[opKey]!);
          expect(alpha, label).toBeLessThanOrEqual(0.25);
          for (const col of ["--lm-deco", "--lm-deco2"]) {
            const under = blend(hexOf(v, col), bg, alpha);
            expect(ratio(hexOf(v, "--lm-ink"), under), `${label} ink`).toBeGreaterThanOrEqual(7);
            expect(ratio(hexOf(v, "--lm-muted"), under), `${label} muted`).toBeGreaterThanOrEqual(4.5);
          }
        }
      });
    }
  }

  it("cada tema define las variables nuevas (radio, sombra, peso de título, pie, decoración)", () => {
    for (const id of THEME_IDS) {
      const v = parseTheme(id).a!;
      for (const k of ["--lm-radius", "--lm-shadow", "--lm-title-weight", "--lm-title-tracking", "--lm-card-border", "--lm-deco", "--lm-deco-opacity", "--lm-deco-bg-opacity", "--lm-footer-display", "--lm-font-display", "--lm-font-body"]) expect(v[k], `${id} ${k}`).toBeTruthy();
    }
  });
  it("las tipografías de cada tema están declaradas en su CSS y se importan desde @fontsource", () => {
    const engine = fs.readFileSync(path.join(__dirname, "../src/engine.css"), "utf8");
    const imports = [...engine.matchAll(/@import "(@fontsource[^"]+)"/g)].map((m) => m[1]!);
    expect(imports.length).toBeGreaterThan(0);
    const FONT_PKG: Record<string, string> = { Literata: "literata", Fraunces: "fraunces", "Space Grotesk": "space-grotesk", "Atkinson Hyperlegible": "atkinson-hyperlegible", "IBM Plex Sans": "ibm-plex-sans" };
    for (const id of THEME_IDS) {
      const v = parseTheme(id).a!;
      for (const [role, fam] of [["--lm-font-display", THEMES[id].fonts.display], ["--lm-font-body", THEMES[id].fonts.body]] as const) {
        expect(v[role], `${id} ${role}`).toContain(fam.split(" ")[0]);
        expect(imports.some((i) => i.includes(FONT_PKG[fam]!)), `${fam} sin @import`).toBe(true);
      }
    }
  });
  it("los componentes leen variables: sin colores fijos sueltos en el CSS de componentes", () => {
    const base = fs.readFileSync(path.join(__dirname, "../src/base.css"), "utf8");
    for (const hex of ["#8a5a00", "#2a2410", "#fff4d6", "#c98b00", "#14181f"]) expect(base).not.toContain(hex);
  });
});

describe("color institucional (--lm-brand): contraste con el fondo del tema", () => {
  it("las constantes de BRAND_THEMES coinciden con el CSS del tema (fondo y acentos a/b/c)", () => {
    for (const [id, t] of Object.entries(BRAND_THEMES) as [ThemeId, NonNullable<(typeof BRAND_THEMES)[ThemeId]>][]) {
      const v = parseTheme(id);
      expect(hexOf(v.a!, "--lm-bg")).toBe(t.bg);
      expect([hexOf(v.a!, "--lm-accent"), hexOf(v.b!, "--lm-accent"), hexOf(v.c!, "--lm-accent")]).toEqual([...t.accents]);
      for (const a of t.accents) expect(ratio(a, t.bg)).toBeGreaterThanOrEqual(BRAND_MIN_CONTRAST);
    }
  });
  it("contrastRatio coincide con la implementación de referencia del test", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(contrastRatio("#f8f8f6", "#1f3a5f")).toBeCloseTo(ratio("#f8f8f6", "#1f3a5f"), 8);
  });
  it("un color institucional claro (amarillo) no se usa en el tema sobrio; uno oscuro sí", () => {
    expect(brandColorFor("institucional-sobrio", "#FCC000")).toBeUndefined();
    expect(brandColorFor("institucional-sobrio", "#ffffff")).toBeUndefined();
    expect(brandColorFor("institucional-sobrio", "#003976")).toBe("#003976");
    expect(brandColorFor("lamina-claro", "#FCC000")).toBe("#FCC000"); // ese tema no pinta con la marca
    expect(brandColorFor("institucional-sobrio", undefined)).toBeUndefined();
  });
});

