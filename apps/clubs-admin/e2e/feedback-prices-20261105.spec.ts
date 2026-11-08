import { mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test, type Page } from "@playwright/test";

const baseUrl = "http://127.0.0.1:4174";
const evidence = resolve(import.meta.dirname, "../../../roadmap/evidence/2026-11-05-feedback-3");
const branding: unknown = JSON.parse(
  readFileSync(
    resolve(
      import.meta.dirname,
      "../../../packages/api-client/src/mocks/fixtures/branding-canic.json",
    ),
    "utf8",
  ),
);
async function login(page: Page) {
  await page.addInitScript((cached) => {
    localStorage.setItem("agilityhub.locale", "ca");
    localStorage.setItem("agilityhub.mockScenario", "admin");
    localStorage.setItem(`agilityhub.branding:${location.host}`, JSON.stringify(cached));
  }, branding);
  await page.goto(`${baseUrl}/entrar`);
  await page.getByLabel("Correu electrònic").fill("admin@example.test");
  await page.getByRole("button", { name: "Tinc contrasenya" }).click();
  await page.getByLabel("Contrasenya", { exact: true }).fill("secret-password");
  await page.getByRole("button", { name: "ENTRA", exact: true }).click();
  await page.waitForURL("**/tauler");
  mkdirSync(evidence, { recursive: true });
}

test("T-05 feedback 3: desktop collapse, persistence and transparent chart labels", async ({
  page,
}) => {
  await login(page);
  const content = page.locator(".admin-shell__content");
  const expanded = await content.boundingBox();
  const colors = await page
    .locator(".dashboard-chart__segment")
    .first()
    .evaluate((label) => {
      const style = getComputedStyle(label);
      return {
        foreground: style.color.match(/[\d.]+/gu)?.map(Number),
        background: style.backgroundColor.match(/[\d.]+/gu)?.map(Number),
      };
    });
  expect(colors).toEqual({ foreground: [0, 0, 0], background: [0, 0, 0, 0] });
  await page.screenshot({ path: resolve(evidence, "dashboard-expanded.png") });
  await page
    .locator(".dashboard-chart")
    .screenshot({ path: resolve(evidence, "chart-labels.png") });
  await page.getByRole("button", { name: "Plega el menú", exact: true }).click();
  await expect(page.locator("#admin-navigation")).toBeVisible();
  await expect(page.locator(".admin-shell")).toHaveClass(/admin-shell--collapsed/u);
  expect((await content.boundingBox())?.width).toBeGreaterThan(expanded?.width ?? 0);
  await page.screenshot({ path: resolve(evidence, "dashboard-collapsed.png") });
  await page.reload();
  await expect(page.locator("#admin-navigation")).toBeVisible();
  await expect(page.locator(".admin-shell")).toHaveClass(/admin-shell--collapsed/u);
  await page.getByRole("button", { name: "Desplega el menú", exact: true }).click();
  await expect(page.locator("#admin-navigation")).toBeVisible();
});

test("T-05 feedback 3: mobile navigation still opens and closes on a route change", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await login(page);
  await expect(page.locator(".admin-shell__desktop-toggle")).toBeHidden();
  await page.locator(".admin-shell__navigation-toggle").click();
  await expect(page.locator("#admin-navigation")).toBeVisible();
  await page.getByRole("link", { name: "Modalitats i tarifes", exact: true }).click();
  await expect(page.locator("#admin-navigation")).toBeHidden();
  await expect(
    page.getByRole("heading", { name: "Modalitats i tarifes", exact: true }),
  ).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
  await page.screenshot({ path: resolve(evidence, "plans-mobile.png") });
});

test("T-05 feedback 3: plan deletion and billed price protections are visible in the editor", async ({
  page,
}) => {
  await login(page);
  await page.getByRole("link", { name: "Modalitats i tarifes", exact: true }).click();
  await page.getByRole("button", { name: "Edita Abonat", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("button", { name: "Elimina la modalitat" })).toBeVisible();
  await dialog.getByRole("button", { name: "Elimina la modalitat" }).click();
  const confirmation = dialog.getByRole("group", { name: "Confirma l’eliminació" });
  await expect(confirmation).toContainText("Abonat");
  await confirmation.scrollIntoViewIfNeeded();
  await page.screenshot({ path: resolve(evidence, "plan-removal-confirmation.png") });
  await confirmation.getByRole("button", { name: "Cancel·la" }).click();
  await expect(confirmation).toHaveCount(0);
  await page.setViewportSize({ width: 375, height: 812 });
  expect(await dialog.evaluate((element) => element.scrollWidth - element.clientWidth)).toBe(0);
  await dialog
    .locator(".catalog-prices")
    .screenshot({ path: resolve(evidence, "prices-mobile.png") });
});
