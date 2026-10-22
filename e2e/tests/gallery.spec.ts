import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ACCENT_IDS, LAYOUT_IDS, THEME_IDS } from "../../packages/contracts/src";

/**
 * Galería de estilos (B6): todos los temas × todos los layouts × 3 acentos se miden con el detector del renderer
 * (overflow, texto pequeño, KaTeX, componentes caídos) y se dejan capturas en docs/evidence/.
 * Requiere el servidor en desarrollo (la ruta /dev/gallery no existe en producción salvo LAMINA_GALLERY=1).
 */
const EVIDENCE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../docs/evidence");
type Issue = { slot: string | null; kind: string; severity: string; message: string; detail?: string };

async function open(page: import("@playwright/test").Page, qs: string) {
  await page.goto(`/dev/gallery?${qs}`, { waitUntil: "load" });
  await page.waitForFunction(() => (window as unknown as { __galleryReady?: boolean }).__galleryReady === true, undefined, { timeout: 60_000 });
}

test.beforeAll(() => fs.mkdirSync(EVIDENCE, { recursive: true }));

for (const theme of THEME_IDS) {
  for (const accent of ACCENT_IDS) {
    test(`galería ${theme}/${accent}: sin problemas de render en los ${LAYOUT_IDS.length} layouts`, async ({ page }) => {
      await open(page, `theme=${theme}&accent=${accent}&view=layouts`);
      const issues = await page.evaluate(() => (window as unknown as { __galleryIssues: Record<string, Issue[]> }).__galleryIssues);
      expect(Object.keys(issues).sort()).toEqual([...LAYOUT_IDS].sort());
      const flat = Object.entries(issues).flatMap(([layout, list]) => list.map((i) => `${layout}/${i.slot}: [${i.severity}] ${i.kind} ${i.message} ${i.detail ?? ""}`));
      expect(flat, flat.join("\n")).toEqual([]);
      if (accent === "a") await page.screenshot({ path: path.join(EVIDENCE, `gallery-${theme}.jpg`), type: "jpeg", quality: 80, fullPage: true });
    });
  }
}

test("galería: componentes con el tema base (sin errores de componente)", async ({ page }) => {
  await open(page, "theme=lamina-claro&view=components");
  const issues = await page.evaluate(() => (window as unknown as { __galleryIssues: Record<string, Issue[]> }).__galleryIssues);
  const errors = Object.entries(issues).flatMap(([id, list]) => list.filter((i) => i.severity === "error").map((i) => `${id}: ${i.kind} ${i.message}`));
  expect(errors, errors.join("\n")).toEqual([]);
});

test("selector de estilo: elegir tema y acento cambia la vista previa", async ({ page }) => {
  await page.goto("/dev/gallery?view=picker");
  const picker = page.locator("[data-theme-picker]");
  await expect(picker).toBeVisible();
  await picker.getByRole("radio", { name: /Física aurora/ }).check({ force: true });
  await expect(picker.locator('.lm-thumb[data-theme="fisica-aurora"]').first()).toBeVisible();
  await picker.getByRole("radio", { name: /Violeta/ }).check({ force: true });
  await expect(picker.locator('.lm-thumb[data-accent="c"]').first()).toBeVisible();
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(EVIDENCE, "gallery-picker.jpg"), type: "jpeg", quality: 82, fullPage: true });
});

test("Cálculo y Física se ven distintos con el mismo código (portada + diapositiva con fórmula y gráfica)", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const shots: Record<string, string> = {};
  for (const theme of ["calculo-editorial", "fisica-aurora"]) {
    await open(page, `theme=${theme}&view=layouts`);
    for (const layout of ["cover-branded", "two-column"]) {
      const el = page.locator(`[data-gallery="${layout}"]`);
      await el.scrollIntoViewIfNeeded();
      const file = path.join(EVIDENCE, `compare-${theme}-${layout}.png`);
      await el.screenshot({ path: file });
      shots[`${theme}/${layout}`] = file;
    }
  }
  const a = fs.readFileSync(shots["calculo-editorial/cover-branded"]!), b = fs.readFileSync(shots["fisica-aurora/cover-branded"]!);
  expect(a.equals(b)).toBe(false);
});
