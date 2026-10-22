import { expect, type Page } from "@playwright/test";

export const TEACHER = { email: process.env.E2E_EMAIL ?? "docente@test.ec", pass: process.env.E2E_PASSWORD ?? "ClaveDocente123" };
export const ADMIN = { email: process.env.E2E_ADMIN_EMAIL ?? "esteban.morocho@cupula.com.ec", pass: process.env.E2E_ADMIN_PASSWORD ?? "ClaveAdmin12345" };

export async function login(page: Page, who: { email: string; pass: string } = TEACHER) {
  await page.goto("/login");
  await page.getByLabel("Correo").fill(who.email);
  await page.getByLabel("Contraseña").fill(who.pass);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page).toHaveURL(/dashboard|bienvenida/);
  if (/bienvenida/.test(page.url())) await completeOnboarding(page);
  await expect(page).toHaveURL(/dashboard/);
}

/** Onboarding obligatorio tras el consentimiento: nombre completo, institución (UPS) y, opcionalmente, un logo personal. */
export async function completeOnboarding(page: Page, opts: { fullName?: string; institution?: string | null; logo?: { name: string; mimeType: string; buffer: Buffer } } = {}) {
  await expect(page).toHaveURL(/bienvenida/);
  await page.getByLabel("Nombre completo").fill(opts.fullName ?? "Docente de Prueba E2E");
  if (opts.institution !== null) await page.getByLabel("Institución").selectOption({ label: opts.institution ?? "Universidad Politécnica Salesiana (UPS)" });
  if (opts.logo) await page.getByLabel(/Logo personal/).setInputFiles(opts.logo);
  await page.getByRole("button", { name: "Guardar y continuar" }).click();
  await expect(page).toHaveURL(/dashboard/);
}

/** PNG 64×32 válido (rojo) para pruebas de subida de logo (el mínimo aceptado es 16 px por lado). */
export const TINY_PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAEAAAAAgCAYAAACinX6EAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAQUlEQVRo3u3QMQEAAAQAMH0k0F4zerBjBRZdOZ+FAAECBAgQIECAAAECBAgQIECAAAECBAgQIECAAAECBAgQcN8C+2IZAA/GInIAAAAASUVORK5CYII=", "base64");

/** Crea una presentación y la lleva hasta la revisión de diseño. Devuelve su id. */
export async function createToDesignReview(page: Page, topic = "La derivada y su interpretación geométrica", meta: { subject?: string; period?: string; group?: string } = {}): Promise<string> {
  await page.goto("/presentations/new");
  await page.getByLabel("Tema").fill(topic);
  await page.getByLabel("¿Qué deben lograr tus estudiantes?").fill("Calcular derivadas básicas e interpretarlas como pendientes");
  if (meta.subject) await page.getByLabel(/Materia/).fill(meta.subject);
  if (meta.period) await page.getByLabel(/Período/).fill(meta.period);
  if (meta.group) await page.getByLabel(/Grupo/).fill(meta.group);
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
