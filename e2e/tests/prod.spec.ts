import { expect, test } from "@playwright/test";
import { approveDesign, DESIGN_SUMMARY, designReady, login } from "./helpers";

// Recorrido real (modelos :free, búsqueda real) contra un despliegue. Solo con E2E_PROD=1.
test.skip(process.env.E2E_PROD !== "1", "solo contra producción");
test.setTimeout(30 * 60_000);

test("recorrido real: tema de Cálculo + URL → contenido → diseño → pulido → publicar por enlace → revocar", async ({ page, browser }) => {
  await login(page, { email: process.env.E2E_EMAIL!, pass: process.env.E2E_PASSWORD! });
  await page.goto("/presentations/new");
  await page.getByLabel("Tema").fill("La regla de la cadena para derivar funciones compuestas");
  await page.getByLabel("¿Qué deben lograr tus estudiantes?").fill("Derivar funciones compuestas aplicando la regla de la cadena e interpretar el resultado");
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByLabel("Enlaces de fuentes públicas").fill("https://es.wikipedia.org/wiki/Regla_de_la_cadena");
  await page.getByLabel(/Aviso de privacidad|Aviso/).check();
  await page.getByRole("button", { name: "Crear y empezar a investigar" }).click();
  await expect(page).toHaveURL(/preview\/information/);
  const id = page.url().match(/presentations\/([0-9a-f-]+)\//)![1]!;
  console.log("presentación", id);

  await expect(page.getByRole("button", { name: "Aprobar contenido" })).toBeVisible({ timeout: 15 * 60_000 });
  await page.screenshot({ path: "test-results/prod-1-contenido.png", fullPage: true });
  await expect(page.getByText(/Fuentes \(\d+\)/)).toBeVisible();
  // edición real del docente
  await page.getByLabel("Título de la sección 1").fill((await page.getByLabel("Título de la sección 1").inputValue()) + " (revisada por el docente)");
  await page.getByRole("button", { name: "Guardar cambios" }).click();
  await expect(page.getByText("Cambios guardados como una nueva versión.")).toBeVisible();
  await page.getByRole("button", { name: "Aprobar contenido" }).click();
  await page.getByRole("button", { name: "Generar el diseño" }).click();
  await designReady(page, 20 * 60_000);
  await expect(page.getByText(DESIGN_SUMMARY)).toBeVisible({ timeout: 5 * 60_000 });
  await page.screenshot({ path: "test-results/prod-2-diseno.png", fullPage: true });
  await approveDesign(page);
  await page.getByRole("button", { name: "Pulir y continuar" }).click();
  await expect(page.getByRole("button", { name: "Publicar", exact: true })).toBeVisible({ timeout: 5 * 60_000 });
  await page.getByRole("button", { name: "Publicar", exact: true }).click();
  const shared = page.locator("p", { hasText: "Enlace para compartir" });
  await expect(shared).toBeVisible();
  const url = (await shared.innerText()).match(/https?:\/\/\S+/)![0];
  const anon = await browser.newContext();
  const ap = await anon.newPage();
  await ap.goto(url);
  await expect(ap.locator(".lm-slide")).toBeVisible();
  await ap.screenshot({ path: "test-results/prod-3-publicada.png" });
  expect((await ap.goto(`/presentations/${id}/view`))?.status()).toBe(404);
  await page.goto(`/presentations/${id}/preview/design`);
  await page.getByRole("button", { name: "Despublicar" }).click();
  await expect(page.getByText("Lista y privada")).toBeVisible();
  expect((await ap.goto(url))?.status()).toBe(404);
  await anon.close();
});
