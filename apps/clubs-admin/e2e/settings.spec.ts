import { mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test, type Page } from "@playwright/test";

const baseUrl = "http://127.0.0.1:4174";
const evidenceDirectory = resolve(import.meta.dirname, "../../../roadmap/evidence/E2-W05");
const branding: unknown = JSON.parse(
  readFileSync(
    resolve(
      import.meta.dirname,
      "../../../packages/api-client/src/mocks/fixtures/branding-canic.json",
    ),
    "utf8",
  ),
);
const minimalBranding: unknown = JSON.parse(
  readFileSync(
    resolve(
      import.meta.dirname,
      "../../../packages/api-client/src/mocks/fixtures/branding-minim.json",
    ),
    "utf8",
  ),
);

const accessCopy = {
  ca: {
    email: "Correu electrònic",
    enter: "ENTRA",
    password: "Contrasenya",
    reveal: "Tinc contrasenya",
  },
  en: {
    email: "Email",
    enter: "SIGN IN",
    password: "Password",
    reveal: "I have a password",
  },
  es: {
    email: "Correo electrónico",
    enter: "ENTRA",
    password: "Contraseña",
    reveal: "Tengo contraseña",
  },
} as const;

async function prepareAdmin(
  page: Page,
  locale: keyof typeof accessCopy,
  cachedBranding: unknown = branding,
  scenario = "admin",
) {
  const brandingWithEnglish = {
    ...(cachedBranding as Record<string, unknown>),
    locales: ["ca", "es", "en"],
  };
  await page.addInitScript(
    ({ initialBranding, initialLocale, mockScenario }) => {
      localStorage.setItem("agilityhub.locale", initialLocale);
      localStorage.setItem("agilityhub.mockScenario", mockScenario);
      localStorage.setItem(
        `agilityhub.branding:${location.host}`,
        JSON.stringify(initialBranding),
      );
    },
    { initialBranding: brandingWithEnglish, initialLocale: locale, mockScenario: scenario },
  );
  await page.goto(`${baseUrl}/entrar`);
  await page.getByLabel(accessCopy[locale].email).fill("admin@example.test");
  await page.getByRole("button", { name: accessCopy[locale].reveal }).click();
  await page.getByLabel(accessCopy[locale].password).fill("secret-password");
  await page.getByRole("button", { name: accessCopy[locale].enter }).click();
  await page.waitForURL("**/tauler");
}

test.beforeAll(() => {
  mkdirSync(evidenceDirectory, { recursive: true });
});

test.describe("E2-W05 generated club settings", () => {
  test("T-02-13 generates D11 from the catalog with typed drawers, history and module gates", async ({
    browser,
  }) => {
    const context = await browser.newContext({ viewport: { height: 900, width: 1280 } });
    const page = await context.newPage();
    await prepareAdmin(page, "ca");
    await page.goto(`${baseUrl}/parametres`);

    await expect(page.getByRole("heading", { name: "Paràmetres" })).toBeVisible();
    await expect(page.getByRole("heading", { exact: true, name: "Classes" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Entrenaments lliures" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Llista d'espera" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Quotes, packs i remesa" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Club i pistes" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Mòduls" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Pàgines del club" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Processos automàtics" })).toBeVisible();
    await expect(page.getByText(/últim canvi:.*amb històric/u)).toBeVisible();
    await expect(page.getByText("2 h abans", { exact: true })).toBeVisible();
    await expect(page.getByText("dl–dg 07:00–22:00", { exact: true })).toBeVisible();

    await page.screenshot({
      fullPage: true,
      path: resolve(evidenceDirectory, "D11-parametres-1280.png"),
    });

    await page
      .getByRole("button", { exact: true, name: "Edita Anul·lació fins a" })
      .click();
    let drawer = page.getByRole("dialog", { name: "Anul·lació fins a" });
    await expect(drawer.getByText("S'aplica a partir d'ara.")).toBeVisible();
    await expect(drawer.getByLabel("Anul·lació fins a")).toHaveAttribute("type", "number");
    await page.screenshot({
      fullPage: true,
      path: resolve(evidenceDirectory, "D11-parametre-calaix-1280.png"),
    });
    const updateRequest = page.waitForRequest(
      (request) =>
        request.method() === "PUT" &&
        request.url().includes("/parameters/training.cancelThresholdMinutes"),
    );
    await drawer.getByLabel("Anul·lació fins a").fill("180");
    await drawer.getByLabel("Motiu del canvi (opcional)").fill("Canvi de prova");
    await drawer.getByRole("button", { name: "DESA" }).click();
    await updateRequest;
    await expect(page.getByText("3 h abans", { exact: true })).toBeVisible();

    await page
      .getByRole("button", {
        exact: true,
        name: "Mostra l'històric de Anul·lació fins a",
      })
      .click();
    drawer = page.getByRole("dialog", { name: "Històric · Anul·lació fins a" });
    await expect(drawer.locator("li")).toHaveCount(2);
    await drawer.getByRole("button", { name: "Tanca" }).click();

    await page.getByRole("button", { exact: true, name: "Edita Horari d'obertura" }).click();
    drawer = page.getByRole("dialog", { name: "Horari d'obertura" });
    await expect(drawer.getByRole("switch", { name: "Dilluns" })).toBeChecked();
    await expect(drawer.getByLabel("Obertura de Dilluns")).toHaveValue("07:00");
    await drawer.getByRole("button", { name: "Tanca" }).click();

    await page.getByRole("button", { exact: true, name: "Edita Festius" }).click();
    drawer = page.getByRole("dialog", { name: "Festius" });
    await drawer.getByRole("button", { name: "Afegeix un festiu" }).click();
    await drawer.getByLabel("Data del festiu 1").fill("2026-12-25");
    await drawer.getByLabel("Nom del festiu 1").fill("Nadal");
    const holidayRequest = page.waitForRequest(
      (request) => request.method() === "PUT" && request.url().includes("/club/holidays"),
    );
    await drawer.getByRole("button", { name: "DESA" }).click();
    await holidayRequest;
    await expect(page.getByText("1 festiu", { exact: true })).toBeVisible();

    await page.getByRole("switch", { name: "Preguntes freqüents" }).click();
    await expect(page.getByRole("heading", { name: /Preguntes freqüents/u })).toHaveCount(0);
    await page.getByRole("switch", { name: "Preguntes freqüents" }).click();
    await expect(
      page.getByRole("heading", { name: "Preguntes freqüents — pàgina «Info» de l'app" }),
    ).toBeVisible();
    await context.close();

    const minimalContext = await browser.newContext({ viewport: { height: 900, width: 1280 } });
    const minimalPage = await minimalContext.newPage();
    await prepareAdmin(minimalPage, "ca", minimalBranding, "minimalAdmin");
    await minimalPage.goto(`${baseUrl}/parametres`);
    await expect(minimalPage.getByRole("heading", { name: "Entrenaments lliures" })).toHaveCount(0);
    await expect(minimalPage.getByRole("heading", { name: "Quotes, packs i remesa" })).toHaveCount(0);
    await expect(minimalPage.getByRole("heading", { name: "Recorreguts" })).toHaveCount(0);
    await expect(minimalPage.getByRole("heading", { name: "Llista d'espera" })).toBeVisible();
    await minimalContext.close();
  });

  test("T-02-17 localizes every catalog row and formats durations in Spanish and English", async ({
    browser,
  }) => {
    test.setTimeout(60_000);
    for (const locale of ["es", "en"] as const) {
      const context = await browser.newContext({ viewport: { height: 900, width: 1280 } });
      const page = await context.newPage();
      await prepareAdmin(page, locale, branding, "adminAllLocales");
      await page.goto(`${baseUrl}/parametres`);

      const duration = locale === "es" ? "2 h antes" : "2 h before";
      const label = locale === "es" ? "Cancelación hasta" : "Cancellation up to";
      const help =
        locale === "es"
          ? "Antelación mínima para cancelar un entrenamiento."
          : "Minimum notice required to cancel a training session.";
      const edit = locale === "es" ? `Editar ${label}` : `Edit ${label}`;
      await expect(page.getByText(duration, { exact: true })).toBeVisible();
      await expect(page.locator(".settings-parameter__main span").first()).not.toContainText(
        "admin-settings:param",
      );
      await page.getByRole("button", { exact: true, name: edit }).click();
      const drawer = page.getByRole("dialog", { name: label });
      await expect(drawer.getByText(help, { exact: true })).toBeVisible();
      await drawer.getByRole("button", { name: locale === "es" ? "Cerrar" : "Close" }).click();
      await context.close();
    }
  });
});
