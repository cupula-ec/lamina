import { expect, test, request as pwRequest } from "@playwright/test";
import { ADMIN, TEACHER, createToDesignReview, login } from "./helpers";

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3100";

test("anónimo: nada privado es accesible sin sesión", async ({ page, request }) => {
  const fake = "00000000-0000-4000-8000-000000000000";
  for (const p of ["/dashboard", "/admin", "/presentations/new", `/presentations/${fake}/preview/information`, "/cuenta"]) {
    await page.goto(p);
    await expect(page).toHaveURL(/\/login/);
  }
  expect((await request.get(`/api/presentations/${fake}/status`)).status()).toBe(401);
  expect((await request.get(`/api/presentations/${fake}/renders/${fake}/x`)).status()).toBe(401);
  expect((await request.post(`/api/presentations`, { multipart: { topic: "x" } })).status()).toBe(401);
  expect((await request.get(`/presentations/${fake}/view`)).status()).toBe(404);
  expect((await request.get(`/render/${fake}?token=nope`)).status()).toBe(404);
  expect((await request.get(`/render/component/${fake}?token=nope`)).status()).toBe(404);
  // el registro público está deshabilitado
  const su = await request.post("/api/auth/sign-up/email", { data: { email: "intruso@x.com", password: "abcdefghijkl", name: "x" }, headers: { origin: BASE } });
  expect(su.status()).toBeGreaterThanOrEqual(400);
  // un docente no entra al panel admin
});

test("dos cuentas: el docente B no puede ver ni tocar la presentación del docente A; tampoco entra a /admin", async ({ page, browser }) => {
  await login(page);
  const id = await createToDesignReview(page, "Aislamiento entre cuentas");

  // cuenta B: se da de alta con el admin vía API de Better Auth (admin plugin) usando la sesión del admin
  const adminCtx = await browser.newContext();
  const ap = await adminCtx.newPage();
  await login(ap, ADMIN);
  await ap.goto("/admin?tab=usuarios");
  const emailB = `docente-b-${Date.now()}@test.ec`;
  await ap.getByLabel("Correo").fill(emailB);
  await ap.getByLabel("Nombre").fill("Docente B");
  await ap.getByRole("button", { name: "Crear y enviar correo" }).click();
  await expect(ap.getByText(/Alta creada/)).toBeVisible();
  const tempMsg = await ap.getByRole("status").innerText();
  const temp = tempMsg.match(/contraseña temporal: (\S+)/)?.[1];
  await adminCtx.close();
  test.skip(!temp, "sin correo configurado: la clave temporal solo se muestra si el envío falla");

  const bCtx = await browser.newContext();
  const bp = await bCtx.newPage();
  await login(bp, { email: emailB, pass: temp! }).catch(async () => {});
  // primer ingreso: cambio de clave obligatorio
  await expect(bp).toHaveURL(/cambiar-clave/);
  await bp.getByLabel("Contraseña temporal").fill(temp!);
  await bp.getByLabel("Nueva contraseña", { exact: true }).fill("NuevaClaveSegura123");
  await bp.getByLabel("Repite la nueva contraseña").fill("NuevaClaveSegura123");
  await bp.getByRole("button", { name: "Guardar contraseña" }).click();
  await expect(bp).toHaveURL(/consentimiento/);
  await bp.getByRole("checkbox").check();
  await bp.getByRole("button", { name: "Acepto y continúo" }).click();
  await expect(bp).toHaveURL(/dashboard/);

  for (const path of [`/presentations/${id}/preview/information`, `/presentations/${id}/preview/design`, `/presentations/${id}/view`]) {
    const r = await bp.goto(path);
    expect(r?.status(), path).toBe(404);
  }
  expect((await bp.request.get(`/api/presentations/${id}/status`)).status()).toBe(404);
  await bp.goto("/admin");
  await expect(bp).toHaveURL(/dashboard/);
  await bCtx.close();
});

test("el aviso de privacidad es obligatorio para subir materiales", async ({ page }) => {
  await login(page);
  await page.goto("/presentations/new");
  await page.getByLabel("Tema").fill("Prueba de consentimiento");
  await page.getByLabel("¿Qué deben lograr tus estudiantes?").fill("Comprobar el consentimiento");
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByLabel("Apuntes (Markdown o texto)").fill("algo de texto");
  await expect(page.getByRole("button", { name: "Crear y empezar a investigar" })).toBeDisabled();
  void TEACHER; void pwRequest;
});
