import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test, type Page } from "@playwright/test";

const baseUrl = "http://127.0.0.1:4173";
const evidenceDirectory = resolve(import.meta.dirname, "../../../roadmap/evidence/E2-W03");
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

async function login(page: Page, scenario = "member", branding: unknown = brandingCanic) {
  await prepareScenario(page, scenario, branding);
  await page.goto(`${baseUrl}/entrar`);
  await page.getByLabel("Correu electrònic").fill("laura@example.test");
  await page.getByLabel("Contrasenya").fill("secret-password");
  await page.getByRole("button", { exact: true, name: "ENTRA" }).click();
  await page.waitForURL("**/inici");
}

test.describe("T-03-40 mobile own dogs", () => {
  test("edits the note, shows task totals and uploads photo and document", async ({ page }) => {
    await login(page);
    await page.goto(`${baseUrl}/gossos`);

    await expect(page.getByRole("heading", { name: "Els meus gossos" })).toBeVisible();
    await expect(page.getByText("4 anys")).toBeVisible();
    await expect(page.getByText("Nivell C")).toBeVisible();
    await expect(page.getByText("Pot entrenar sol")).toHaveCount(1);
    await expect(page.getByText("FCAG · llicència 3241 · Iniciació")).toBeVisible();
    await expect(page.getByText("RSCE · llicència 13298 · M · 2 · 2D")).toBeVisible();

    const noteRequest = page.waitForRequest(
      (request) =>
        request.url().includes("/api/v1/me/dogs/dog-duna/instructor-note") &&
        request.method() === "PUT",
    );
    await page
      .getByLabel(/Notes als instructors/u)
      .first()
      .fill("Treballarem el balancí amb calma.");
    await page.getByRole("button", { exact: true, name: "DESA" }).first().click();
    expect((await noteRequest).postDataJSON()).toEqual({
      text: "Treballarem el balancí amb calma.",
    });
    await expect(page.getByText("Nota de Duna desada")).toBeVisible();

    await expect(page.getByText("2 pendents · 1 fetes")).toBeVisible();

    const photoRequest = page.waitForRequest(
      (request) =>
        request.url().includes("/api/v1/me/dogs/dog-duna/photo") && request.method() === "PUT",
    );
    await page.getByLabel("Canvia la foto de Duna").setInputFiles({
      buffer: Buffer.from("mock-image"),
      mimeType: "image/png",
      name: "duna.png",
    });
    await photoRequest;
    await expect(page.getByText("Foto de Duna desada")).toBeVisible();

    await page.getByRole("button", { name: "＋ DOC." }).first().click();
    await expect(page.getByRole("dialog", { name: "Afegeix un document de Duna" })).toBeVisible();
    await page.getByLabel("Tipus").selectOption("VACCINATION_CARD");
    await page.getByLabel("Nom del document").fill("cartilla_Duna_3.jpg");
    await page.getByLabel("Fitxer").setInputFiles({
      buffer: Buffer.from("mock-document"),
      mimeType: "image/jpeg",
      name: "cartilla_Duna_3.jpg",
    });
    const documentRequest = page.waitForRequest(
      (request) =>
        request.url().includes("/api/v1/me/dogs/dog-duna/documents") && request.method() === "POST",
    );
    await page.getByRole("button", { name: "PUJA EL DOCUMENT" }).click();
    expect((await documentRequest).postDataJSON()).toMatchObject({
      name: "cartilla_Duna_3.jpg",
      type: "VACCINATION_CARD",
    });
    await expect(page.getByText("Document desat")).toBeVisible();
    await expect(
      page.getByText(
        "El nivell l'assigna el club · Per donar de baixa un dels gossos, comunica-ho al club",
      ),
    ).toBeVisible();

    await page.screenshot({
      fullPage: true,
      path: resolve(evidenceDirectory, "13-els-meus-gossos-375.png"),
    });
  });

  test("hides instructor notes and tasks when TASKS is disabled", async ({ page }) => {
    await login(page, "minimal", brandingMinim);
    await page.goto(`${baseUrl}/gossos`);
    await expect(page.getByRole("heading", { name: "Els meus gossos" })).toBeVisible();
    await expect(page.getByText("Notes als instructors", { exact: false })).toHaveCount(0);
    await expect(page.getByText("Tasques", { exact: true })).toHaveCount(0);
  });
});

test.describe("T-03-41 mobile own data", () => {
  test("keeps identity read-only, looks up towns and maps field errors", async ({ page }) => {
    await login(page);
    await page.goto(`${baseUrl}/dades`);

    await expect(page.getByRole("heading", { name: "Les meves dades" })).toBeVisible();
    await expect(page.getByLabel("DNI")).toHaveAttribute("readonly", "");
    await expect(page.getByLabel("Nom", { exact: true })).toHaveAttribute("readonly", "");
    await expect(page.getByLabel("Cognom 1", { exact: true })).toHaveAttribute("readonly", "");
    await expect(page.getByLabel("Cognom 2", { exact: true })).toHaveAttribute("readonly", "");
    await expect(page.getByLabel("Segon email (opcional)")).toHaveValue("feina@example.cat");
    await expect(page.getByLabel("Població (proposada pel CP)")).not.toHaveValue("");
    await expect(page.getByRole("heading", { name: "Domiciliació" })).toBeVisible();
    await expect(page.getByLabel("Domiciliació")).toHaveValue("···· ···· ···· ···· 2231");
    await expect(page.getByLabel("Domiciliació")).toHaveAttribute("readonly", "");
    await expect(page.getByRole("heading", { name: "Consentiments" })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Idioma" })).toHaveCount(0);

    await page.screenshot({
      fullPage: true,
      path: resolve(evidenceDirectory, "28-les-meves-dades-375.png"),
    });

    await page.getByLabel("CP", { exact: true }).fill("99999");
    const townSelect = page.getByRole("combobox", { name: "Població (proposada pel CP)" });
    await expect(townSelect).toContainText("Poble Nord");
    await expect(townSelect).toContainText("Poble Sud");

    await page.getByLabel("Email principal").fill("readonly@example.test");
    await page.getByRole("button", { exact: true, name: "DESA" }).click();
    await expect(page.getByText("Aquest element és només de lectura.")).toBeVisible();

    await page.getByLabel("Email principal").fill("laura@example.cat");
    await page.getByLabel("CP", { exact: true }).fill("08349");
    await expect(page.getByLabel("Població (proposada pel CP)")).not.toHaveValue("");
  });

  test("hides direct debit when BILLING is disabled", async ({ page }) => {
    await login(page, "minimal", brandingMinim);
    await page.goto(`${baseUrl}/dades`);
    await expect(page.getByRole("heading", { name: "Les meves dades" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Domiciliació" })).toHaveCount(0);
  });
});
