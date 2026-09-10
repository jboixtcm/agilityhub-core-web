import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test, type Page } from "@playwright/test";

const baseUrl = "http://127.0.0.1:4173";
const evidenceDirectory = resolve(import.meta.dirname, "../../../roadmap/evidence/E3-W01");
const brandingCanic: unknown = JSON.parse(
  readFileSync(
    resolve(
      import.meta.dirname,
      "../../../packages/api-client/src/mocks/fixtures/branding-canic.json",
    ),
    "utf8",
  ),
);

async function prepareScenario(page: Page, scenario = "signup") {
  await page.addInitScript(
    ({ cachedBranding, mockScenario }) => {
      localStorage.setItem("agilityhub.locale", "ca");
      localStorage.setItem("agilityhub.mockScenario", mockScenario);
      localStorage.setItem(`agilityhub.branding:${location.host}`, JSON.stringify(cachedBranding));
    },
    { cachedBranding: brandingCanic, mockScenario: scenario },
  );
}

async function login(page: Page) {
  await prepareScenario(page);
  await page.goto(`${baseUrl}/entrar`);
  await page.getByLabel("Correu electrònic").fill("laura@example.test");
  await page.getByLabel("Contrasenya").fill("secret-password");
  await page.getByRole("button", { exact: true, name: "ENTRA" }).click();
  await page.waitForURL("**/inici");
}

async function fillPerson(page: Page) {
  await page.getByLabel("DNI / NIE").fill("12345678Z");
  await page.getByLabel("Nom", { exact: true }).fill("Nora");
  await page.getByLabel("Cognom 1").fill("Soler");
  await page.getByLabel("Cognom 2").fill("Pons");
  await page.getByLabel("Data de naixement").fill("05/04/1992");
  await page.getByRole("button", { name: "Altres / No binari" }).click();
  await page.getByLabel("Email", { exact: true }).fill("nora.soler@example.test");
  await page.getByLabel("Segon email (opcional)").fill("pau.soler@example.test");
  await page.getByLabel("Telèfon", { exact: true }).fill("612345678");
  await page.getByLabel("Descripció", { exact: true }).first().fill("Mòbil");
  await page.getByLabel("Segon telèfon (opcional)").fill("623456789");
  await page.getByLabel("Descripció", { exact: true }).nth(1).fill("Feina");
  await page.getByLabel("Carrer i número").fill("Carrer de la Font, 3");
  const postalCode = page.getByLabel("CP", { exact: true });
  await postalCode.fill("08349");
  await postalCode.blur();
  await expect(page.getByLabel("Població (proposada pel CP)")).not.toHaveValue("");
}

async function fillDog(page: Page, name: string) {
  await page.getByLabel("Nom del gos").fill(name);
  await page.getByRole("button", { name: "Mascle" }).click();
  await page.getByLabel("Raça").fill("Mestís");
  await page.getByLabel("Naix.").fill("03/2022");
  await page.getByLabel("Núm. de xip").fill(`chip-${name.toLocaleLowerCase()}`);
  await page.getByLabel("Cartilla de vacunes").setInputFiles({
    buffer: Buffer.from("mock-vaccination-page"),
    mimeType: "image/jpeg",
    name: "scan.jpg",
  });
  await expect(page.getByText(`cartilla_${name}_1.jpg pujada`)).toBeVisible();
}

test.describe("T-04-29–32 public signup", () => {
  test("completes screens 16–19 and the sent state against MSW", async ({ page }) => {
    await prepareScenario(page);
    await page.goto(`${baseUrl}/apuntat-hi`);
    await expect(page.getByText(/Pas 1 de 4/u)).toBeVisible();
    await fillPerson(page);
    await page.screenshot({
      fullPage: true,
      path: resolve(evidenceDirectory, "16-person-375.png"),
    });

    await page.getByRole("button", { name: "CONTINUA" }).click();
    await page.waitForURL("**/apuntat-hi/gos");
    await expect(page.getByText(/Pas 2 de 4/u)).toBeVisible();
    await fillDog(page, "Kiwi");
    await page.screenshot({
      fullPage: true,
      path: resolve(evidenceDirectory, "17-dog-375.png"),
    });

    await page.getByRole("button", { name: "CONTINUA" }).click();
    await page.waitForURL("**/apuntat-hi/familia");
    await expect(page.getByLabel("Nom del responsable")).toBeVisible();
    await page.screenshot({
      fullPage: true,
      path: resolve(evidenceDirectory, "18-family-375.png"),
    });

    await page.getByLabel("Nom del responsable").fill("Marta Roca");
    await page.getByLabel("Nom d'un dels seus gossos").fill("Kiwi");
    await page.getByRole("button", { name: "CONTINUA" }).click();
    await expect(page.getByText(/Grup trobat: Marta R\./u)).toBeVisible();
    await page.getByRole("button", { name: "CONTINUA" }).click();
    await page.waitForURL("**/apuntat-hi/pagament");
    await expect(page.getByText(/Pas 4 de 4/u)).toBeVisible();
    await page.getByLabel("Accepto la política de privacitat").check();
    await page.getByLabel("Autoritzo l'ús de la meva imatge").check();
    await page.getByRole("button", { name: "què vol dir?" }).click();
    await page.screenshot({
      fullPage: true,
      path: resolve(evidenceDirectory, "19-payment-375.png"),
    });

    await page.getByRole("button", { name: "ENVIA LA SOL·LICITUD" }).click();
    await page.waitForURL("**/apuntat-hi/enviada");
    await expect(page.getByRole("heading", { name: "Sol·licitud enviada" })).toBeVisible();
    await page.screenshot({
      fullPage: true,
      path: resolve(evidenceDirectory, "enviada-375.png"),
    });
  });
});

test.describe("T-04-32 add-dog signup", () => {
  test("starts from screen 13 and reaches the member payment variant", async ({ page }) => {
    await login(page);
    await page.goto(`${baseUrl}/gossos`);
    await page.getByRole("link", { name: "＋ AFEGEIX UN GOS" }).first().click();
    await page.waitForURL("**/gossos/nou");
    await expect(page.getByText(/Pas 1 de 2/u)).toBeVisible();
    await fillDog(page, "Neret");
    await page.getByRole("button", { name: "CONTINUA" }).click();
    await page.waitForURL("**/gossos/nou/pagament");
    await expect(page.getByLabel("Mètode de pagament actual")).toHaveValue(
      "Domiciliació · ···· 2231",
    );
    await page.screenshot({
      fullPage: true,
      path: resolve(evidenceDirectory, "add-dog-19-375.png"),
    });
  });
});
