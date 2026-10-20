import { expect, test } from "@playwright/test";
import { ADMIN, createToDesignReview, login } from "./helpers";

test("componente nuevo: pedir → provisional aislado → usado en la presentación → admin lo promueve", async ({ page, browser }) => {
  await login(page);
  const id = await createToDesignReview(page, "Dominio y desigualdades");

  // Selecciona una diapositiva de contenido y pide un componente que no existe en el catálogo
  await page.getByLabel("Ir a la diapositiva 4").click();
  await page.getByLabel("Nombre (sin espacios)").fill("RectaNumerica");
  await page.getByLabel("¿Qué debe mostrar?").fill("Una recta numérica con intervalos abiertos y cerrados resaltados, para explicar dominios");
  await page.getByRole("button", { name: "Pedir componente" }).click();
  await expect(page.getByText("Solicitud enviada")).toBeVisible();

  // Se construye en el sandbox y queda provisional; luego se rediseña la diapositiva usándolo
  await expect(page.getByText("Listo (provisional)")).toBeVisible({ timeout: 180_000 });
  await expect(page.getByText(/RectaNumerica \(visual\)/)).toBeVisible({ timeout: 180_000 });
  await expect(page.getByRole("button", { name: "Aprobar diseño" })).toBeVisible({ timeout: 120_000 });

  // Se ejecuta en un iframe sandbox con origen opaco (sin allow-same-origin)
  const frame = page.locator("iframe[data-lm-sandbox]").first();
  await expect(frame).toBeVisible();
  expect(await frame.getAttribute("sandbox")).toBe("allow-scripts");
  const csp = await frame.getAttribute("srcdoc");
  expect(csp).toContain("default-src 'none'");
  await expect(page.locator("[data-lamina-error]")).toHaveCount(0);

  // Admin: ve la propuesta con sus pruebas y la aprueba (estable)
  const adminCtx = await browser.newContext();
  const ap = await adminCtx.newPage();
  await login(ap, ADMIN);
  await ap.goto("/admin?tab=componentes");
  const card = ap.locator("article", { hasText: "RectaNumerica" }).first();
  await expect(card).toContainText("Provisional");
  await expect(card).toContainText("✓ Análisis estático");
  await expect(card).toContainText("✓ Typecheck");
  await card.getByRole("button", { name: /Aprobar/ }).click();
  await expect(card).toContainText("Estable", { timeout: 20_000 });
  await adminCtx.close();
  void id;
});
