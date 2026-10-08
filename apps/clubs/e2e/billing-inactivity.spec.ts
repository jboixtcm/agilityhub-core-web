import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test, type Page } from "@playwright/test";

const clubsUrl = "http://127.0.0.1:4173";
const adminUrl = "http://127.0.0.1:4174";
const evidenceDirectory = resolve(import.meta.dirname, "../../../roadmap/evidence/E8-W02");
const branding: unknown = JSON.parse(
  readFileSync(
    resolve(
      import.meta.dirname,
      "../../../packages/api-client/src/mocks/fixtures/branding-canic.json",
    ),
    "utf8",
  ),
);

async function prepare(page: Page, scenario: string) {
  await page.addInitScript(
    ({ cachedBranding, mockScenario }) => {
      localStorage.setItem("agilityhub.locale", "ca");
      localStorage.setItem("agilityhub.mockScenario", mockScenario);
      localStorage.setItem(`agilityhub.branding:${location.host}`, JSON.stringify(cachedBranding));
    },
    { cachedBranding: branding, mockScenario: scenario },
  );
}

async function loginMember(page: Page, scenario = "member") {
  await prepare(page, scenario);
  await page.goto(`${clubsUrl}/entrar`);
  await page.getByLabel("Correu electrònic").fill("laura@example.test");
  await page.getByLabel("Contrasenya").fill("secret-password");
  await page.getByRole("button", { exact: true, name: "ENTRA" }).click();
  await page.waitForURL("**/inici");
}

async function loginAdmin(page: Page) {
  await prepare(page, "admin");
  await page.goto(`${adminUrl}/entrar`);
  await page.getByLabel("Correu electrònic").fill("admin@example.test");
  await page.getByRole("button", { name: "Tinc contrasenya" }).click();
  await page.getByLabel("Contrasenya").fill("secret-password");
  await page.getByRole("button", { exact: true, name: "ENTRA" }).click();
  await page.waitForURL("**/tauler");
}

async function shot(page: Page, name: string) {
  await page.screenshot({ fullPage: true, path: resolve(evidenceDirectory, name) });
}

test.describe("E8-W02 member billing, packs and lifecycle", () => {
  test("T-12-26 and T-13-29/30 render the complete member flows at 375 px", async ({ page }) => {
    await loginMember(page);

    await page.goto(`${clubsUrl}/perfil`);
    await expect(page.getByRole("link", { exact: true, name: "Rebuts" })).toBeVisible();
    await expect(page.getByText(/pendent d'aprovació/u)).toBeVisible();
    await shot(page, "12-perfil-rows-375.png");

    await page.goto(`${clubsUrl}/rebuts`);
    await expect(page.getByText("Quota setembre 2026")).toBeVisible();
    await expect(page.getByText("Grup familiar")).toBeVisible();
    await shot(page, "rebuts-375.png");

    await page.getByRole("link", { name: /Setembre 2026/u }).click();
    await expect(page.getByRole("button", { name: "Descarrega el justificant" })).toBeVisible();
    await expect(page.getByText("···· 2231", { exact: false })).toBeVisible();
    await shot(page, "rebut-detall-375.png");

    await page.goto(`${clubsUrl}/gossos`);
    await expect(page.getByText(/6 consumides · 4 disponibles/u)).toBeVisible();
    await shot(page, "13-pack-375.png");

    await page.goto(`${clubsUrl}/inactivitat`);
    await expect(page.getByRole("button", { name: "MODIFICA" })).toBeVisible();
    await expect(page.getByText(/Ara tens 1 reserva dins del període/u)).toBeVisible();
    await shot(page, "14-inactivitat-consulta-375.png");
    page.once("dialog", (dialog) => void dialog.accept());
    await page.getByRole("button", { name: "RETIRA LA SOL·LICITUD" }).click();
    await page.waitForURL("**/perfil");

    await page.goto(`${clubsUrl}/baixa`);
    // Mockup 15: the offer is a highlighted note with no heading of its own.
    await expect(page.getByText(/mantenir la teva entrada vigent/u)).toBeVisible();
    await expect(page.getByRole("link", { name: "VULL DEMANAR INACTIVITAT" })).toBeVisible();
    await expect(page.getByRole("group").getByRole("button")).toHaveCount(11);
    await shot(page, "15-baixa-375.png");

  });

  test("T-13-29 renders a new inactivity request", async ({ page }) => {
    await loginMember(page, "memberNoInactivity");
    await page.goto(`${clubsUrl}/inactivitat`);
    await expect(page.getByRole("button", { name: "ENVIA LA SOL·LICITUD" })).toBeVisible();
    await expect(page.getByText(/Ara tens 1 reserva dins del període/u)).toBeVisible();
    await shot(page, "14-inactivitat-375.png");
    await page.getByRole("button", { name: "ENVIA LA SOL·LICITUD" }).click();
    await page.waitForURL("**/perfil");
    await expect(page.getByRole("link", { name: /pendent d'aprovació/u })).toBeVisible();

    await page.goto(`${clubsUrl}/baixa`);
    await page.getByLabel("Motiu").selectOption("EXTERNAL");
    await page.getByRole("button", { name: "ENVIA LA SOL·LICITUD" }).click();
    await page.getByRole("button", { name: "Torna al perfil" }).click();
    await page.waitForURL("**/perfil");
    await expect(page.getByRole("link", { name: /baixa sol·licitada/u })).toBeVisible();
  });

  test("T-12-26 renders the invalid-card banner", async ({ page }) => {
    await loginMember(page, "memberCardInvalid");
    await page.goto(`${clubsUrl}/rebuts`);
    await expect(page.getByText(/No hem pogut cobrar el rebut/u)).toBeVisible();
    await expect(page.getByRole("button", { name: "Actualitza la targeta" })).toBeVisible();
    await shot(page, "rebuts-baner-targeta-375.png");
  });

  test("checkout return waits for the server-confirmed PAID status", async ({ page }) => {
    await loginMember(page);
    await page.goto(`${clubsUrl}/reserves/booking-duna-mon3?checkout=cs_e8_w02`);
    await expect(page.getByText("Estem confirmant el pagament…")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("Pagament rebut")).toBeVisible({ timeout: 3_000 });
  });

  test("D10 renders recent receipts, upfront payments and pack controls at 1280 px", async ({
    page,
  }) => {
    await page.setViewportSize({ height: 900, width: 1280 });
    await loginAdmin(page);
    await page.goto(`${adminUrl}/abonats/member-laura`);
    await expect(page.getByRole("heading", { exact: true, name: "Facturació" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Registra un pagament" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Ajusta" })).toBeVisible();
    await shot(page, "D10-bloc-facturacio-1280.png");
  });
});
