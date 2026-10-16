import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test, type Page } from "@playwright/test";

const baseUrl = "http://127.0.0.1:4174";
const evidenceDirectory = resolve(import.meta.dirname, "../../../roadmap/evidence/E10-W01");

/** The `platform` scenario: an AGILITYHUB_ADMIN account on the product host (S17 §2 «Entrada»). */
async function signIn(page: Page, scenario: "admin" | "platform" | "platformDark") {
  await page.addInitScript((mockScenario) => {
    localStorage.setItem("agilityhub.locale", "ca");
    localStorage.setItem("agilityhub.mockScenario", mockScenario);
  }, scenario);
  await page.goto(`${baseUrl}/entrar`);
  await page.getByLabel("Correu electrònic").fill("pol.ferrer@example.test");
  await page.getByRole("button", { name: "Tinc contrasenya" }).click();
  await page.getByLabel("Contrasenya").fill("secret-password");
  await page.getByRole("button", { exact: true, name: "ENTRA" }).click();
}

async function shot(page: Page, name: string) {
  await page.screenshot({ fullPage: true, path: resolve(evidenceDirectory, name) });
}

test.beforeAll(() => {
  mkdirSync(evidenceDirectory, { recursive: true });
});

for (const [scenario, mode] of [
  ["platform", "clar"],
  ["platformDark", "fosc"],
] as const) {
  test(`T-17-12 D19 at 1280 px (${mode}): list, record tabs, the wizard creates a club with its checklist`, async ({
    browser,
  }) => {
    const context = await browser.newContext({ viewport: { height: 900, width: 1280 } });
    const page = await context.newPage();
    await signIn(page, scenario);
    // A platform account without a club lands on the console (S17 §2 «Entrada»).
    await page.waitForURL("**/consola/clubs");
    await expect(page.getByRole("heading", { level: 1, name: "Consola de clubs" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Consola" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    const riera = page.getByRole("row").filter({ hasText: "Club Agility Riera" });
    await expect(riera.getByText("Suspès")).toBeVisible();
    await expect(riera.getByText("GENERIC · Atlantic/Canary")).toBeVisible();
    // The shell keeps 1280 px: the ten columns scroll inside the list, never the page.
    const widths = await page.evaluate(() => {
      const wrap = document.querySelector(".ah-universal-list__table-wrap");
      return {
        body: document.body.scrollWidth,
        wrap: wrap?.getBoundingClientRect().right ?? 0,
      };
    });
    expect(widths.body).toBeLessThanOrEqual(1280);
    expect(widths.wrap).toBeLessThanOrEqual(1280);
    await shot(page, `D19-llista-1280-${mode}.png`);
    // The other columns (last admin access, SMS, storage, checklist), scrolled into view.
    await page.locator(".ah-universal-list__table-wrap").evaluate((wrap) => {
      wrap.scrollLeft = wrap.scrollWidth;
    });
    await expect(riera.getByText("2/7")).toBeVisible();
    await page.screenshot({
      path: resolve(evidenceDirectory, `D19-llista-columnes-1280-${mode}.png`),
    });

    // The row's name cell is its link (the list scrolls sideways at 1280 px: ten columns).
    await riera.getByRole("link").first().click();
    await page.waitForURL("**/identitat");
    await expect(page.getByRole("heading", { level: 1, name: "Club Agility Riera" })).toBeVisible();
    await expect(page.getByLabel("Nom", { exact: true })).toHaveValue("Club Agility Riera");
    await shot(page, `D19-fitxa-identitat-1280-${mode}.png`);

    await page.getByRole("link", { exact: true, name: "Tema" }).click();
    await page.waitForURL("**/tema");
    await expect(page.getByTestId("theme-preview-clubs")).toBeVisible();
    await expect(page.getByTestId("theme-preview-clubs-admin")).toBeVisible();
    await expect(page.getByRole("list", { name: "Contrast AA" })).toBeVisible();
    await shot(page, `D19-fitxa-tema-1280-${mode}.png`);

    await page.getByRole("link", { exact: true, name: "Mòduls" }).click();
    await page.waitForURL("**/moduls");
    await expect(page.getByRole("switch", { name: "Packs" })).toBeEnabled();
    await shot(page, `D19-fitxa-moduls-1280-${mode}.png`);

    await page.goto(`${baseUrl}/consola/clubs/nou`);
    await expect(page.getByRole("heading", { level: 1, name: "Nou club" })).toBeVisible();
    await page.getByLabel("Nom", { exact: true }).fill("Club Agility Serralada");
    await expect(page.getByLabel("Slug")).toHaveValue("club-agility-serralada");
    await shot(page, `D19-assistent-pas1-1280-${mode}.png`);
    const next = page.getByRole("button", { name: "SEGÜENT" });
    for (const stepName of ["Localització", "Mòduls", "Pagaments", "Tema", "Catàlegs base"]) {
      await next.click();
      await expect(
        page.getByRole("heading", { level: 2, name: new RegExp(stepName, "u") }),
      ).toBeVisible();
    }
    await page
      .getByLabel("Club plantilla")
      .selectOption({ label: "Plantilla AgilityHub · ca, es, en · EUR" });
    await next.click();
    await page.getByLabel("Correu electrònic").fill("laia.costa@example.test");
    await page.getByLabel("Nom", { exact: true }).fill("Laia Costa");
    await next.click();
    await expect(page.getByLabel("Fitxer club-as-code")).toContainText(
      "slug: club-agility-serralada",
    );
    await shot(page, `D19-assistent-revisio-1280-${mode}.png`);
    await page.getByRole("button", { name: "CREA EL CLUB" }).click();
    await page.waitForURL("**/identitat?creat=1");
    await expect(
      page.getByRole("heading", { level: 1, name: "Club Agility Serralada" }),
    ).toBeVisible();
    await expect(page.getByRole("region", { name: "Checklist d'onboarding" })).toBeVisible();
    await expect(page.getByText(/S'ha creat el club Club Agility Serralada/u)).toBeVisible();
    await shot(page, `D19-fitxa-checklist-1280-${mode}.png`);
    await context.close();
  });
}

test("D19 refuses a club account without the platform role (S17 §2 «Entrada»)", async ({
  browser,
}) => {
  const context = await browser.newContext({ viewport: { height: 900, width: 1280 } });
  const page = await context.newPage();
  await signIn(page, "admin");
  await page.waitForURL("**/tauler");
  await page.goto(`${baseUrl}/consola/clubs`);
  await expect(page.getByText("Aquest accés és només per a l'equip AgilityHub.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Consola" })).toHaveCount(0);
  await context.close();
});
