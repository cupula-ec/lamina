import { expect, type Page } from "@playwright/test";

export const TEACHER = { email: process.env.E2E_EMAIL ?? "docente@test.ec", pass: process.env.E2E_PASSWORD ?? "ClaveDocente123" };
export const ADMIN = { email: process.env.E2E_ADMIN_EMAIL ?? "esteban.morocho@cupula.com.ec", pass: process.env.E2E_ADMIN_PASSWORD ?? "ClaveAdmin12345" };

export async function login(page: Page, who: { email: string; pass: string } = TEACHER) {
  await page.goto("/login");
  await page.getByLabel("Correo").fill(who.email);
  await page.getByLabel("Contraseña").fill(who.pass);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page).toHaveURL(/dashboard/);
}

/** Crea una presentación y la lleva hasta la revisión de diseño. Devuelve su id. */
export async function createToDesignReview(page: Page, topic = "La derivada y su interpretación geométrica"): Promise<string> {
  await page.goto("/presentations/new");
  await page.getByLabel("Tema").fill(topic);
  await page.getByLabel("¿Qué deben lograr tus estudiantes?").fill("Calcular derivadas básicas e interpretarlas como pendientes");
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByRole("button", { name: "Crear y empezar a investigar" }).click();
  await expect(page).toHaveURL(/preview\/information/);
  const id = page.url().match(/presentations\/([0-9a-f-]+)\//)![1]!;
  await expect(page.getByRole("button", { name: "Aprobar contenido" })).toBeVisible({ timeout: 150_000 });
  await page.getByRole("button", { name: "Aprobar contenido" }).click();
  await page.getByRole("button", { name: "Generar el diseño" }).click();
  await expect(page.getByRole("button", { name: "Aprobar diseño" })).toBeVisible({ timeout: 180_000 });
  await expect(page.getByText(/errores · \d+ avisos/)).toBeVisible({ timeout: 180_000 });
  return id;
}
