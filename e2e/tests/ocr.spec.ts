import path from "node:path";
import { expect, test } from "@playwright/test";
import { login } from "./helpers";

const FX = path.join(__dirname, "../../packages/research/test/fixtures");

test.skip(process.env.E2E_OCR === "0", "el worker de este entorno no tiene tesseract + poppler (E2E_OCR=0)");

test("PDF escaneado: consentimiento de visión aparte, OCR con fuente marcada y contenido generado", async ({ page }) => {
  await login(page);
  await page.goto("/presentations/new");
  await page.getByLabel("Tema").fill("Derivadas desde apuntes escaneados");
  await page.getByLabel("¿Qué deben lograr tus estudiantes?").fill("Repasar la derivada a partir de mis apuntes");
  await page.getByRole("button", { name: "Continuar" }).click();

  // sin PDF no se ofrece el consentimiento de visión
  await expect(page.getByLabel(/Permito enviar imágenes de páginas con fórmulas/)).toHaveCount(0);
  await page.getByLabel(/Archivos: PDF/).setInputFiles(path.join(FX, "escaneado-es.pdf"));
  const vis = page.getByLabel(/Permito enviar imágenes de páginas con fórmulas/);
  await expect(vis).toBeVisible();
  await expect(vis).not.toBeChecked();
  await page.getByLabel(/Aviso de privacidad|Aviso/).check();
  await page.getByRole("button", { name: "Crear y empezar a investigar" }).click();

  await expect(page).toHaveURL(/preview\/information/);
  await expect(page.getByRole("button", { name: "Aprobar contenido" })).toBeVisible({ timeout: 180_000 });
  const fuentes = page.locator("section", { has: page.getByRole("heading", { name: /^Fuentes/ }) });
  await expect(fuentes.getByText(/escaneado-es\.pdf \(OCR\)/)).toBeVisible();
  await expect(fuentes.getByText(/Texto reconocido por OCR.*puede contener errores/)).toBeVisible();
});
