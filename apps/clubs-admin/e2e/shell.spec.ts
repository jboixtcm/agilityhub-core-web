import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test, type Page } from "@playwright/test";

const baseUrl = "http://127.0.0.1:4174";
const evidenceDirectory = resolve(import.meta.dirname, "../../../roadmap/evidence/E0-W06");
const brandingCanic: unknown = JSON.parse(
  readFileSync(
    resolve(
      import.meta.dirname,
      "../../../packages/api-client/src/mocks/fixtures/branding-canic.json",
    ),
    "utf8",
  ),
);
const brandingMinim: unknown = JSON.parse(
  readFileSync(
    resolve(
      import.meta.dirname,
      "../../../packages/api-client/src/mocks/fixtures/branding-minim.json",
    ),
    "utf8",
  ),
);

async function prepareScenario(
  page: Page,
  scenario: "admin" | "instructor" | "minimalAdmin",
  branding: unknown,
) {
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
  await page.getByLabel("Correu electrònic").fill("aina.serra@example.test");
  await page.getByRole("button", { name: "Tinc contrasenya" }).click();
  await page.getByLabel("Contrasenya").fill("secret-password");
  await page.getByRole("button", { name: "ENTRA" }).click();
  await page.waitForURL("**/tauler");
}

test.describe("T-02-14 clubs-admin shell", () => {
  test("shows the Cànic administrator sidebar", async ({ page }) => {
    await prepareScenario(page, "admin", brandingCanic);
    await login(page);

    await expect(page.getByRole("heading", { name: "Configuració" })).toBeVisible();
    await page.screenshot({
      fullPage: true,
      path: resolve(evidenceDirectory, "admin-canic-1280.png"),
    });
  });

  test("renders the minimal club with its module-filtered sidebar", async ({ page }) => {
    await prepareScenario(page, "minimalAdmin", brandingMinim);
    await login(page);

    await expect(page.getByRole("heading", { name: "Configuració" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Entrenaments" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Facturació" })).toHaveCount(0);
    await page.screenshot({
      fullPage: true,
      path: resolve(evidenceDirectory, "admin-minim-1280.png"),
    });
  });

  test("does not show Configuració to an instructor", async ({ page }) => {
    await prepareScenario(page, "instructor", brandingCanic);
    await login(page);

    await expect(page.getByRole("link", { name: "Entrenaments" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Configuració" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Paràmetres" })).toHaveCount(0);
  });
});

test.describe("T-01-18 clubs-admin access", () => {
  test("offers magic-link and password sign-in", async ({ page }) => {
    await prepareScenario(page, "admin", brandingCanic);
    await page.goto(`${baseUrl}/entrar`);

    await expect(page.getByRole("heading", { name: "Accés al backoffice" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Envia'm l'enllaç" })).toBeVisible();
    await page.getByLabel("Correu electrònic").fill("aina.serra@example.test");
    await page.getByRole("button", { name: "Envia'm l'enllaç" }).click();
    await expect(page.getByRole("status")).toHaveText(
      "Si el correu és al club, hi rebràs l'enllaç",
    );
  });
});

test.describe("T-01-20 clubs-admin handoff", () => {
  test("exchanges the one-time code and opens the backoffice session", async ({ page }) => {
    await prepareScenario(page, "admin", brandingCanic);
    await page.goto(`${baseUrl}/entrar?handoff=mock-handoff-code`);

    await page.waitForURL("**/tauler");
    await expect(page.getByRole("heading", { name: "Configuració" })).toBeVisible();
  });
});
