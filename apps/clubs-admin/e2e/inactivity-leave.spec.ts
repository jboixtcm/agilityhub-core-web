import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test, type Page } from "@playwright/test";

const baseUrl = "http://127.0.0.1:4174";
const evidenceDirectory = resolve(import.meta.dirname, "../../../roadmap/evidence/E8-W03");
const brandingCanic: unknown = JSON.parse(
  readFileSync(
    resolve(
      import.meta.dirname,
      "../../../packages/api-client/src/mocks/fixtures/branding-canic.json",
    ),
    "utf8",
  ),
);

async function prepareAdmin(page: Page, scenario = "admin") {
  await page.setViewportSize({ height: 900, width: 1280 });
  await page.addInitScript(
    ({ branding, mockScenario }) => {
      localStorage.setItem("agilityhub.locale", "ca");
      localStorage.setItem("agilityhub.mockScenario", mockScenario);
      localStorage.setItem(`agilityhub.branding:${location.host}`, JSON.stringify(branding));
    },
    { branding: brandingCanic, mockScenario: scenario },
  );
  await page.goto(`${baseUrl}/entrar`);
  await page.getByLabel("Correu electrònic").fill("admin@example.test");
  await page.getByRole("button", { name: "Tinc contrasenya" }).click();
  await page.getByLabel("Contrasenya").fill("secret-password");
  await page.getByRole("button", { name: "ENTRA" }).click();
  await page.waitForURL("**/tauler");
}

async function capture(page: Page, fileName: string) {
  await page.screenshot({ path: resolve(evidenceDirectory, fileName) });
}

test.describe("E8-W03 D10 lifecycle drawers", () => {
  test("T-13-31 captures inactivity, leave, payment and plan states at 1280 px", async ({
    page,
  }) => {
    await prepareAdmin(page);

    await page.goto(`${baseUrl}/abonats/member-laura?calaix=inactivitat`);
    let drawer = page.getByRole("dialog", { name: "Inactivitat" });
    await expect(drawer.getByRole("button", { name: "Aprova" })).toBeVisible();
    await expect(drawer.getByRole("button", { name: "Denega" })).toBeVisible();
    await capture(page, "D10-calaix-inactivitat-1280.png");

    await drawer.getByRole("button", { name: "Aprova" }).click();
    const approval = page.getByRole("dialog", { name: "Aprova el període" });
    await approval.getByRole("button", { name: "Aprova" }).click();
    await expect(approval).toBeHidden();

    await page.reload();
    drawer = page.getByRole("dialog", { name: "Inactivitat" });
    await drawer.getByRole("button", { name: "Denega" }).click();
    await expect(drawer.getByRole("heading", { name: "Nou període d'inactivitat" })).toBeVisible();
    await capture(page, "D10-calaix-inactivitat-nou-1280.png");

    await page.goto(`${baseUrl}/abonats/member-laura?calaix=baixa`);
    drawer = page.getByRole("dialog", { name: "Baixa (amb data)" });
    await expect(drawer.getByRole("heading", { name: "Programa la baixa" })).toBeVisible();
    await capture(page, "D10-calaix-baixa-1280.png");
    await drawer.getByLabel("Data d'efecte").fill("2026-12-12");
    await drawer.getByRole("button", { name: "Programa la baixa" }).click();
    const leaveConfirmation = page.getByRole("dialog", { name: "Programa la baixa" });
    await leaveConfirmation.getByRole("button", { name: "Programa la baixa" }).click();
    await expect(leaveConfirmation).toBeHidden();
    await expect(drawer.getByRole("heading", { name: /Baixa prevista el/u })).toBeVisible();
    await capture(page, "D10-baixa-prevista-1280.png");

    await page.goto(`${baseUrl}/abonats/member-laura?calaix=pagament`);
    await expect(page.getByRole("dialog", { name: "Mètode de pagament" })).toBeVisible();
    await capture(page, "D10-calaix-metode-pagament-1280.png");

    await page.goto(`${baseUrl}/abonats/member-laura?calaix=modalitat`);
    await expect(page.getByRole("dialog", { name: "Modalitat" })).toBeVisible();
    await expect(page.getByText("Modalitat actual")).toBeVisible();
    await capture(page, "D10-calaix-modalitat-1280.png");
  });

  test("T-13-31 a member who has left exposes only reactivation", async ({ page }) => {
    await prepareAdmin(page, "memberLeft");
    await page.goto(`${baseUrl}/abonats/member-laura`);
    await expect(page.getByRole("heading", { name: "Laura Serra Vidal" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Inactivitat" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Baixa (amb data)" })).toHaveCount(0);
    await page.getByRole("button", { name: "Reactiva l'abonat" }).click();
    const drawer = page.getByRole("dialog", { name: "Baixa (amb data)" });
    await drawer.getByRole("button", { name: "Reactiva l'abonat" }).click();
    const reactivation = page.getByRole("dialog", { name: "Reactiva l'abonat" });
    await expect(reactivation).toBeVisible();
    await capture(page, "D10-reactivacio-1280.png");
    await reactivation.getByLabel("Modalitat").selectOption("plan-member");
    await reactivation.getByLabel("Tarifa").selectOption("price-member");
    await reactivation.getByLabel("Data del proper rebut").fill("2026-11-01");
    await reactivation.getByRole("button", { name: "Reactiva l'abonat" }).click();
    await expect(reactivation).toBeHidden();
    await page.reload();
    await expect(page.getByRole("button", { name: "Inactivitat" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Baixa (amb data)" })).toBeVisible();
  });

  test("T-13-22 captures the lifecycle queues and the system leave view", async ({ page }) => {
    await prepareAdmin(page);
    await page.goto(`${baseUrl}/inactivitats`);
    await expect(page.getByRole("heading", { name: "Inactivitats i baixes" })).toBeVisible();
    await expect(page.getByRole("link", { exact: true, name: "Laura Serra Vidal" })).toBeVisible();
    await capture(page, "inactivitats-i-baixes-1280.png");

    await page.goto(`${baseUrl}/abonats`);
    await expect(page.getByRole("link", { exact: true, name: "Laura Serra Vidal" })).toBeVisible();
    await page.locator("summary").filter({ hasText: "Vistes" }).click();
    await page
      .getByRole("combobox", { name: "Vistes" })
      .selectOption({ label: "Baixes previstes" });
    await expect(page.getByRole("columnheader", { name: "Origen de la baixa" })).toBeVisible();
    await expect(page.getByRole("link", { exact: true, name: "Montse Tresserra Casas" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Elimina la vista" })).toHaveCount(0);
    await capture(page, "D5-baixes-previstes-1280.png");
  });
});
