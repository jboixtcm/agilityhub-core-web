import { resolve } from "node:path";

import { expect, test } from "@playwright/test";

const baseUrl = "http://127.0.0.1:4175";
const evidenceDirectory = resolve(import.meta.dirname, "../../../roadmap/evidence/E1-W03");

test.describe("T-01-22 AgilityHub ID", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem("agilityhub.locale", "ca");
      localStorage.setItem("agilityhub.mockScenario", "id");
    });
  });

  test("logs in and continues the OIDC authorize flow", async ({ page }) => {
    await page.goto(
      `${baseUrl}/login?flow=mock-flow&login_hint=biel.roca%40example.test&ui_locales=ca`,
    );

    await expect(page.getByRole("heading", { name: "Entra a AgilityHub" })).toBeVisible();
    await expect(page.getByLabel("Correu electrònic")).toHaveValue("biel.roca@example.test");
    await page.screenshot({
      fullPage: true,
      path: resolve(evidenceDirectory, "login-1280.png"),
    });

    const oidcSessionRequest = page.waitForRequest(
      (request) => request.url().endsWith("/oauth2/session") && request.method() === "POST",
    );
    await page.getByLabel("Contrasenya").fill("secret-password");
    await page.getByRole("button", { exact: true, name: "ENTRA" }).click();
    expect((await oidcSessionRequest).postDataJSON()).toEqual({ flow: "mock-flow" });
    await page.waitForURL("**/products?authorization=complete");
    await expect(page.getByRole("heading", { name: "Els teus productes" })).toBeVisible();

    await page.goto(`${baseUrl}/account`);
    await expect(page.getByRole("heading", { name: "El teu compte" })).toBeVisible();
    await expect(page.getByText("Safari · iPhone")).toBeVisible();
    await page.screenshot({
      fullPage: true,
      path: resolve(evidenceDirectory, "account-1280.png"),
    });
    const sessionRequest = page.waitForRequest(
      (request) =>
        request.method() === "DELETE" &&
        request.url().includes("/api/v1/me/sessions/40000000-0000-4000-8000-000000000002"),
    );
    const chromeRow = page.getByRole("listitem").filter({ hasText: "Chrome · Mac" });
    await chromeRow.getByRole("button", { name: "Tanca aquesta sessió" }).click();
    await sessionRequest;
    await expect(page.getByText("Chrome · Mac")).toHaveCount(0);

    await page.goto(`${baseUrl}/set-password`);
    await expect(page.getByRole("heading", { name: "Contrasenya" })).toBeVisible();
    await page.evaluate(() => {
      window.scrollTo(0, 0);
    });
    await page.screenshot({
      fullPage: true,
      path: resolve(evidenceDirectory, "set-password-1280.png"),
    });

    await page.goto(`${baseUrl}/products`);
    await expect(page.getByRole("heading", { name: "Els teus productes" })).toBeVisible();
    await page.screenshot({
      fullPage: true,
      path: resolve(evidenceDirectory, "products-1280.png"),
    });

    await page.goto(`${baseUrl}/magic-link?t=invalid`);
    await expect(page.getByRole("heading", { name: "Aquest enllaç ja no és vàlid" })).toBeVisible();
    await page.screenshot({
      fullPage: true,
      path: resolve(evidenceDirectory, "magic-link-invalid-1280.png"),
    });
  });
});
