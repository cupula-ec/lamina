import { expect, test } from "@playwright/test";
import { createToDesignReview, login, TINY_PNG } from "./helpers";

test("branding: logo personal en /cuenta, rechazo de archivos hostiles y carátula con datos opcionales", async ({ page, request }) => {
  await login(page);

  // /cuenta: perfil y logo personal
  await page.goto("/cuenta");
  await page.getByLabel("Institución").selectOption({ label: "Universidad Politécnica Salesiana (UPS)" });
  await page.getByLabel(/Logo personal/).setInputFiles({ name: "logo.png", mimeType: "image/png", buffer: TINY_PNG });
  await page.getByRole("button", { name: "Guardar cambios" }).click();
  await expect(page.getByText("Cambios guardados.")).toBeVisible();

  // un HTML renombrado .png no pasa
  const hostile = await page.request.post("/api/branding/personal", { multipart: { logo: { name: "logo.png", mimeType: "image/png", buffer: Buffer.from("<html><script>alert(1)</script></html>") } } });
  expect(hostile.status()).toBe(415);
  const svg = await page.request.post("/api/branding/personal", { multipart: { logo: { name: "x.svg", mimeType: "image/svg+xml", buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><rect width="10" height="10"/></svg>') } } });
  expect(svg.status()).toBe(400);

  // el logo personal solo lo sirve a su dueño: un cliente anónimo recibe 404
  const img = page.locator('img[alt="Tu logo actual"]');
  await expect(img).toBeVisible();
  const src = await img.getAttribute("src");
  expect((await page.request.get(src!)).headers()["content-type"]).toBe("image/png");
  expect((await request.get(src!)).status()).toBe(404);

  // wizard: Materia/Período/Grupo opcionales
  const id = await createToDesignReview(page, "Carátula con marca", { subject: "Cálculo I", period: "Abr–Ago 2026" });
  await page.screenshot({ path: `../docs/evidence/branding-caratula-${id.slice(0, 8)}.png`, fullPage: true });
});
