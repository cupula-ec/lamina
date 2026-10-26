import { expect, test } from "@playwright/test";
import { approveDesign, DESIGN_SUMMARY, designReady, login } from "./helpers";

test("flujo completo: crear → contenido → diseño → pulido → publicar → enlace → revocar", async ({ page, browser }) => {
  await login(page);
  await page.getByRole("link", { name: /Nueva presentación|Crear mi primera/ }).first().click();
  await page.getByLabel("Tema").fill("La derivada y su interpretación geométrica");
  await page.getByLabel("¿Qué deben lograr tus estudiantes?").fill("Calcular derivadas básicas e interpretarlas como pendientes");
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByLabel("Apuntes (Markdown o texto)").fill("La derivada de f en a es el límite del cociente incremental. Interpretación geométrica: pendiente de la tangente.");
  await page.getByLabel(/Aviso de privacidad|Aviso/).check();
  await page.getByRole("button", { name: "Crear y empezar a investigar" }).click();

  // Etapa A/B: investigación y borrador (estado real, sobrevive a recargas)
  await expect(page).toHaveURL(/preview\/information/);
  await expect(page.getByText(/Investigando y redactando/).first()).toBeVisible();
  await page.reload();
  await expect(page.getByRole("button", { name: "Aprobar contenido" })).toBeVisible({ timeout: 120_000 });
  await expect(page.getByText("Avisos de verificación")).toBeVisible();

  // Edición: cambia el título de la primera sección y guarda → nueva versión
  const title = page.getByLabel("Título de la sección 1");
  await title.fill("La idea de derivada (editada)");
  await page.getByRole("button", { name: "Guardar cambios" }).click();
  await expect(page.getByText("Cambios guardados como una nueva versión.")).toBeVisible();
  await expect(page.getByText(/Versión 2/)).toBeVisible();

  // Regeneración con comentarios conservando lo bloqueado
  await page.getByLabel("Conservar al regenerar").nth(1).check();
  await page.getByRole("button", { name: "Guardar cambios" }).click();
  await expect(page.getByText(/Versión 3/)).toBeVisible();
  await page.getByLabel("Comentarios (opcional)").fill("agrega un ejemplo más");
  await page.getByRole("button", { name: "Regenerar con comentarios" }).click();
  await expect(page.getByRole("button", { name: "Aprobar contenido" })).toBeVisible({ timeout: 120_000 });
  await expect(page.getByLabel("Título de la sección 2")).toHaveValue(/Reglas de derivación/);

  // Aprobación → diseño
  await page.getByRole("button", { name: "Aprobar contenido" }).click();
  await expect(page.getByText("Contenido aprobado").first()).toBeVisible();
  await page.getByRole("button", { name: "Continuar al diseño" }).click();
  await expect(page).toHaveURL(/preview\/design/);
  await designReady(page, 180_000);
  // revisión automática del renderer
  await expect(page.getByText(DESIGN_SUMMARY)).toBeVisible({ timeout: 180_000 });
  await expect(page.getByText(/Diapositiva 1 de \d+/)).toBeVisible();

  // Iteración de diseño con comentarios sobre una diapositiva
  await page.getByLabel("Ir a la diapositiva 4").click();
  await page.getByLabel("Ir a la diapositiva 4").locator("xpath=ancestor::li").getByText("cambiar").click();
  await page.getByLabel("Comentarios").fill("más grande la gráfica");
  await page.getByRole("button", { name: "Regenerar con comentarios" }).click();
  await designReady(page, 180_000);
  await expect(page.getByText(DESIGN_SUMMARY)).toBeVisible({ timeout: 180_000 });
  await approveDesign(page);
  await page.getByRole("button", { name: "Pulir y continuar" }).click();
  await expect(page.getByRole("button", { name: "Publicar", exact: true })).toBeVisible({ timeout: 120_000 });

  // Publicar con enlace
  await page.getByRole("button", { name: "Publicar", exact: true }).click();
  const shared = page.locator("p", { hasText: "Enlace para compartir" });
  await expect(shared).toBeVisible();
  const url = (await shared.innerText()).match(/https?:\/\/\S+/)![0];
  await expect(page.getByRole("button", { name: "Copiar enlace" })).toBeVisible();
  const id = url.match(/presentations\/([0-9a-f-]+)\/view/)![1]!;

  // Edición posterior a la publicación: nueva versión; lo público no cambia hasta «Publicar cambios»
  await page.goto(`/presentations/${id}/preview/design`);
  await page.getByRole("link", { name: "Editar diapositiva" }).click();
  await expect(page).toHaveURL(/\/edit\//);
  await page.getByLabel("Notas del presentador").fill("Nota añadida desde la edición manual");
  await page.getByRole("button", { name: "Guardar como nueva versión" }).click();
  await expect(page).toHaveURL(/preview\/design/);
  await expect(page.getByText("Hay cambios sin publicar.")).toBeVisible();
  await page.getByRole("button", { name: "Publicar cambios" }).click();
  await expect(page.getByText("Hay cambios sin publicar.")).toBeHidden();

  // Visor del dueño
  await page.goto(`/presentations/${id}/view`);
  await expect(page.locator(".lm-slide")).toBeVisible();
  await page.keyboard.press("ArrowRight");

  // Anónimo: con token sí, sin token no
  const anon = await browser.newContext();
  const ap = await anon.newPage();
  await ap.goto(url);
  await expect(ap.locator(".lm-slide")).toBeVisible();
  const r404 = await ap.goto(`/presentations/${id}/view`);
  expect(r404?.status()).toBe(404);

  // Revocar: regenerar enlace invalida el anterior
  await page.goto(`/presentations/${id}/preview/design`);
  await page.getByRole("button", { name: /Regenerar enlace/ }).click();
  await expect(page.locator("p", { hasText: "Enlace para compartir" })).toBeVisible();
  const old = await ap.goto(url);
  expect(old?.status()).toBe(404);
  await page.getByRole("button", { name: "Despublicar" }).click();
  await expect(page.getByText("Lista y privada")).toBeVisible();
  await anon.close();
});
