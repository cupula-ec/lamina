import { expect, test } from "@playwright/test";
import { createToDesignReview, login } from "./helpers";

test("móvil: landing, login, dashboard y visor táctil", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  await login(page);
  await expect(page.getByRole("link", { name: /Nueva presentación/ }).first()).toBeVisible();
  const id = await createToDesignReview(page, "Revisión móvil");
  await page.goto(`/presentations/${id}/view`);
  await expect(page.locator(".lm-slide")).toBeVisible();
  const first = await page.locator("[data-lm-slide]").first().getAttribute("data-lm-slide");
  await page.locator(".lm-stage").tap();
  await page.keyboard.press("ArrowRight");
  await expect(page.locator("[data-lm-slide]").first()).not.toHaveAttribute("data-lm-slide", first!);
});
