import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test, type Page } from "@playwright/test";

const baseUrl = "http://127.0.0.1:4174";
const evidenceDirectory = resolve(import.meta.dirname, "../../../roadmap/evidence/E1-W02");
const branding: unknown = JSON.parse(
  readFileSync(
    resolve(
      import.meta.dirname,
      "../../../packages/api-client/src/mocks/fixtures/branding-canic.json",
    ),
    "utf8",
  ),
);

async function prepareAdmin(page: Page) {
  await page.addInitScript((cachedBranding) => {
    localStorage.setItem("agilityhub.locale", "ca");
    localStorage.setItem("agilityhub.mockScenario", "onboardingAdmin");
    localStorage.setItem(`agilityhub.branding:${location.host}`, JSON.stringify(cachedBranding));
  }, branding);
  await page.goto(`${baseUrl}/entrar`);
  await page.getByLabel("Correu electrònic").fill("aina.serra@example.test");
  await page.getByRole("button", { name: "Tinc contrasenya" }).click();
  await page.getByLabel("Contrasenya").fill("secret-password");
  await page.getByRole("button", { name: "ENTRA" }).click();
  await page.waitForURL("**/tauler");
}

test.describe("T-01-26 clubs-admin onboarding", () => {
  test("shows the equivalent modal and can defer only the optional profile data", async ({
    page,
  }) => {
    await prepareAdmin(page);

    const dialog = page.getByRole("dialog", { name: "Completa el teu perfil" });
    await expect(dialog).toBeVisible();
    await expect(page.getByRole("button", { name: "Tanca" })).toHaveCount(0);
    await page.screenshot({
      fullPage: true,
      path: resolve(evidenceDirectory, "admin-onboarding-1280.png"),
    });

    await dialog
      .getByRole("checkbox", { name: "He llegit i accepto la política de privacitat" })
      .check();
    const completion = page.waitForRequest(
      (request) => request.url().endsWith("/api/v1/me/onboarding") && request.method() === "PUT",
    );
    await dialog.getByRole("button", { name: "Ho faré més tard" }).click();
    expect((await completion).postDataJSON()).toEqual({
      consentAccepted: true,
      consentVersion: "2026-09-01",
      imageConsent: false,
    });
    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Configuració" })).toBeVisible();
  });
});
