import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test, type Page } from "@playwright/test";

const baseUrl = "http://127.0.0.1:4173";
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

async function prepareScenario(page: Page, scenario: "onboarding" | "policyReconsent") {
  await page.addInitScript(
    ({ cachedBranding, mockScenario }) => {
      localStorage.setItem("agilityhub.locale", "ca");
      localStorage.setItem("agilityhub.mockScenario", mockScenario);
      localStorage.setItem(`agilityhub.branding:${location.host}`, JSON.stringify(cachedBranding));
    },
    { cachedBranding: branding, mockScenario: scenario },
  );
}

async function login(page: Page) {
  await page.goto(`${baseUrl}/entrar`);
  await page.getByLabel("Correu electrònic").fill("biel.roca@example.test");
  await page.getByLabel("Contrasenya").fill("secret-password");
  await page.getByRole("button", { exact: true, name: "ENTRA" }).click();
}

test.describe("T-01-26 first-access onboarding", () => {
  test("pending account completes the screen once and enters the app", async ({ page }) => {
    await prepareScenario(page, "onboarding");
    await login(page);
    await page.waitForURL("**/benvinguda");

    await expect(page.getByRole("heading", { name: "Completa el teu perfil" })).toBeVisible();
    await expect(page.getByLabel("Nom (obligatori)")).toHaveValue("Biel Roca");
    await expect(page.getByRole("combobox", { name: "Idioma (obligatori)" })).toHaveValue("ca");
    await expect(page.getByLabel("Telèfon")).toHaveValue("");
    await page.screenshot({
      fullPage: true,
      path: resolve(evidenceDirectory, "benvinguda-375.png"),
    });

    await page.getByLabel("Telèfon").fill("+34600111222");
    await page.getByRole("checkbox", { name: "Autoritzo l'ús de la meva imatge" }).check();
    await page
      .getByRole("checkbox", { name: "He llegit i accepto la política de privacitat" })
      .check();
    const completion = page.waitForRequest(
      (request) => request.url().endsWith("/api/v1/me/onboarding") && request.method() === "PUT",
    );
    await page.getByRole("button", { name: "CONTINUA" }).click();
    expect((await completion).postDataJSON()).toEqual({
      consentAccepted: true,
      consentVersion: "2026-09-01",
      fields: { locale: "ca", name: "Biel Roca", phone: "+34600111222" },
      imageConsent: true,
    });
    await page.waitForURL("**/inici");

    await page.goto(`${baseUrl}/benvinguda`);
    await page.waitForURL("**/inici");
  });

  test("three policy postponements make the next consent blocking", async ({ page }) => {
    await prepareScenario(page, "policyReconsent");
    await login(page);
    await page.waitForURL("**/inici");
    await expect(
      page.getByRole("dialog", { name: "Hem actualitzat la política de privacitat" }),
    ).toBeVisible();

    const remaining = await page.evaluate(async () => {
      const first = await fetch("/api/v1/me/onboarding/postpone", { method: "POST" });
      const second = await fetch("/api/v1/me/onboarding/postpone", { method: "POST" });
      return Promise.all([first.json(), second.json()]);
    });
    expect(remaining).toMatchObject([{ postponeRemaining: 2 }, { postponeRemaining: 1 }]);
    await page.getByRole("button", { name: "Més tard" }).click();

    await page.waitForURL("**/benvinguda");
    await expect(page.getByRole("heading", { name: "Completa el teu perfil" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Més tard" })).toHaveCount(0);
    await expect(
      page.getByRole("checkbox", { name: "He llegit i accepto la política de privacitat" }),
    ).toBeVisible();
  });
});
