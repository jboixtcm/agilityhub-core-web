import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test, type Page } from "@playwright/test";

const baseUrl = "http://127.0.0.1:4173";
const evidenceDirectory = resolve(import.meta.dirname, "../../../roadmap/evidence/E1-W01");
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

async function prepareScenario(page: Page, scenario: string, branding: unknown = brandingCanic) {
  await page.addInitScript(
    ({ cachedBranding, mockScenario }) => {
      localStorage.setItem("agilityhub.locale", "ca");
      localStorage.setItem("agilityhub.mockScenario", mockScenario);
      localStorage.setItem(`agilityhub.branding:${location.host}`, JSON.stringify(cachedBranding));
    },
    { cachedBranding: branding, mockScenario: scenario },
  );
}

async function passwordLogin(page: Page) {
  await prepareScenario(page, "multiProfile");
  await page.goto(`${baseUrl}/entrar`);
  await page.getByLabel("Correu electrònic").fill("estel.rius@example.test");
  await page.getByRole("button", { name: "Tinc contrasenya" }).click();
  await page.getByLabel("Contrasenya").fill("secret-password");
  await page.getByRole("button", { name: "ENTRA" }).click();
}

test.describe("T-01-18 access screen", () => {
  test("renders screen 01, focuses missing email and sends a neutral response", async ({
    page,
  }) => {
    await prepareScenario(page, "member");
    await page.goto(`${baseUrl}/entrar`);
    await expect(page.getByPlaceholder("correu@exemple.cat")).toBeVisible();
    await expect(page.getByRole("button", { name: "Envia'm l'enllaç" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Tinc contrasenya" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Encara no hi ets? Apunta-t'hi →" })).toBeVisible();
    await page.screenshot({
      fullPage: true,
      path: resolve(evidenceDirectory, "01-entrar-375.png"),
    });

    await page.getByRole("button", { name: "Envia'm l'enllaç" }).click();
    await expect(page.getByLabel("Correu electrònic")).toBeFocused();
    await expect(page.getByRole("alert")).toHaveText("Escriu el teu correu");
    await page.getByLabel("Correu electrònic").fill("estel.rius@example.test");
    await page.getByRole("button", { name: "Envia'm l'enllaç" }).click();
    await expect(page.getByRole("status")).toHaveText(
      "Si el correu és al club, hi rebràs l'enllaç",
    );
  });

  test("uses Retry-After as a visible countdown", async ({ page }) => {
    await prepareScenario(page, "rateLimited");
    await page.goto(`${baseUrl}/entrar`);
    await page.getByLabel("Correu electrònic").fill("limit@example.test");
    await page.getByRole("button", { name: "Envia'm l'enllaç" }).click();
    await expect(page.getByRole("alert")).toContainText(
      "Massa intents. Torna-ho a provar d'aquí a 120 s",
    );
    await expect(page.getByRole("button", { name: "Envia'm l'enllaç" })).toBeDisabled();
    await expect(page.getByRole("alert")).toContainText("119 s", { timeout: 2_500 });
  });

  test("hides signup when the club has disabled it", async ({ page }) => {
    await prepareScenario(page, "minimal", brandingMinim);
    await page.goto(`${baseUrl}/entrar`);
    await expect(page.getByRole("link", { name: /Apunta-t'hi/u })).toHaveCount(0);
  });
});

test.describe("T-01-19 activation screen", () => {
  test("renders screen 02 with continue before the optional password", async ({ page }) => {
    await prepareScenario(page, "activationFemale");
    await page.goto(`${baseUrl}/activacio?token=valid&purpose=LOGIN`);
    await expect(page.getByRole("heading", { name: "Benvinguda, Estel!" })).toBeVisible();
    await expect(page.getByText("Compte activat")).toBeVisible();
    const continueBox = await page.getByRole("button", { name: "CONTINUAR" }).boundingBox();
    const passwordBox = await page
      .getByRole("heading", { name: "Si vols, tria una contrasenya per a futurs accessos" })
      .boundingBox();
    expect(continueBox?.y).toBeLessThan(passwordBox?.y ?? 0);
    await page.screenshot({
      fullPage: true,
      path: resolve(evidenceDirectory, "02-activacio-375.png"),
    });
  });

  test("uses masculine greeting for male and non-binary accounts", async ({ browser }) => {
    for (const [scenario, heading] of [
      ["activationMale", "Benvingut, Marc!"],
      ["activationNonBinary", "Benvingut, Àlex!"],
    ] as const) {
      const page = await browser.newPage();
      await prepareScenario(page, scenario);
      await page.goto(`${baseUrl}/activacio?token=valid&purpose=LOGIN`);
      await expect(page.getByRole("heading", { name: heading })).toBeVisible();
      await page.close();
    }
  });

  test("renders reset and invalid-link variants", async ({ browser }) => {
    const resetPage = await browser.newPage();
    await prepareScenario(resetPage, "activationReset");
    await resetPage.goto(`${baseUrl}/activacio?token=valid&purpose=RESET`);
    await expect(resetPage.getByRole("heading", { name: "Ja hi ets" })).toBeVisible();
    await expect(resetPage.getByText("Compte activat")).toHaveCount(0);
    await resetPage.close();

    const invalidPage = await browser.newPage();
    await prepareScenario(invalidPage, "invalidMagicLink");
    await invalidPage.goto(`${baseUrl}/activacio?token=invalid&purpose=LOGIN`);
    await expect(
      invalidPage.getByRole("heading", { name: "Aquest enllaç ja no és vàlid" }),
    ).toBeVisible();
    await expect(invalidPage.getByRole("button", { name: "Envia-me'n un de nou" })).toBeVisible();
    await invalidPage.close();
  });
});

test.describe("T-01-20 profile choice", () => {
  test("renders screen 03b and sends the selected profile with remember", async ({ page }) => {
    await passwordLogin(page);
    await page.waitForURL("**/perfil-acces");
    await expect(page.getByRole("button", { name: /Com a alumna/u })).toBeVisible();
    await expect(page.getByRole("button", { name: /Com a instructora/u })).toBeVisible();
    await expect(page.getByRole("button", { name: /Com a administradora/u })).toBeVisible();
    await page.screenshot({
      fullPage: true,
      path: resolve(evidenceDirectory, "03b-perfil-acces-375.png"),
    });

    const profileRequest = page.waitForRequest(
      (request) => request.url().includes("/api/v1/me/profile") && request.method() === "PUT",
    );
    await page.getByRole("button", { name: /Com a alumna/u }).click();
    expect((await profileRequest).postDataJSON()).toEqual({
      activeProfile: "MEMBER",
      remember: true,
    });
    await page.waitForURL("**/inici");
  });

  test("administrator selection creates a clubs-admin handoff", async ({ page }) => {
    await passwordLogin(page);
    await page.waitForURL("**/perfil-acces");
    const handoffRequest = page.waitForRequest(
      (request) => request.url().includes("/auth/handoff") && request.method() === "POST",
    );
    const navigationRequest = page.waitForRequest(
      (request) =>
        request.isNavigationRequest() &&
        request.url() === "http://127.0.0.1:4174/entrar?handoff=mock-handoff-code",
    );
    await page.getByRole("button", { name: /Com a administradora/u }).click();
    expect((await handoffRequest).postDataJSON()).toEqual({ targetClientId: "clubs-admin" });
    await navigationRequest;
  });
});

test.describe("T-01-21 profile rows and impersonation", () => {
  test("renders screen 12 and changes password, locale and sessions", async ({ page }) => {
    await passwordLogin(page);
    await page.waitForURL("**/perfil-acces");
    await page.goto(`${baseUrl}/perfil`);
    await expect(page.getByRole("heading", { name: "El meu perfil" })).toBeVisible();
    await page.screenshot({
      fullPage: true,
      path: resolve(evidenceDirectory, "12-perfil-375.png"),
    });

    await page.getByRole("button", { name: "Canvia la contrasenya" }).click();
    await expect(page.getByRole("dialog", { name: "Canvia la contrasenya" })).toBeVisible();
    await expect(page.getByLabel("contrasenya actual")).toHaveCount(0);
    await page.getByRole("button", { exact: true, name: "Tanca" }).click();

    await page.getByRole("button", { name: "Sessions" }).click();
    await expect(page.getByText("Safari · iPhone")).toBeVisible();
    await page.getByRole("button", { name: "Tanca aquesta sessió" }).click();
    await expect(page.getByText("Chrome · Mac")).toHaveCount(0);
    await page.getByRole("button", { exact: true, name: "Tanca" }).click();

    const profileLanguage = page.locator(".profile-language").getByRole("combobox");
    await expect(profileLanguage.getByRole("option", { name: "Anglès" })).toHaveCount(0);
    await profileLanguage.selectOption("es");
    await expect(page.getByRole("heading", { name: "Mi perfil" })).toBeVisible();
  });

  test("keeps the impersonation banner and revokes on exit", async ({ page }) => {
    await prepareScenario(page, "impersonated");
    await page.goto(`${baseUrl}/perfil#impersonation=mock-impersonation-token`);
    await expect(page.getByText("Estàs veient l'app com Laura Serra Vidal")).toBeVisible();
    await page.getByRole("button", { name: "Surt" }).click();
    await page.waitForURL("**/entrar");
  });
});
