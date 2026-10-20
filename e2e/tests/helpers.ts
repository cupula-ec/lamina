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
  await designReady(page);
  await expect(page.getByText(DESIGN_SUMMARY)).toBeVisible({ timeout: 180_000 });
  return id;
}

/** Resumen global de la revisión de diseño: «Sin errores · 2 con avisos» / «3 diapositivas con errores · 1 con avisos». */
export const DESIGN_SUMMARY = /(Sin errores|\d+ diapositivas? con errores) · \d+ con avisos/;

/** La revisión de diseño ya se puede aprobar: con errores el botón principal es «Corregir errores» y la aprobación es «Aprobar de todos modos». */
export async function designReady(page: Page, timeout = 180_000) {
  await expect(page.getByRole("button", { name: "Aprobar diseño" }).or(page.getByRole("button", { name: "Aprobar de todos modos" }))).toBeVisible({ timeout });
}

export async function approveDesign(page: Page) {
  const anyway = page.getByRole("button", { name: "Aprobar de todos modos" });
  if (await anyway.isVisible()) {
    await anyway.click();
    await page.getByRole("button", { name: "Sí, aprobar con errores" }).click();
  } else await page.getByRole("button", { name: "Aprobar diseño" }).click();
}
