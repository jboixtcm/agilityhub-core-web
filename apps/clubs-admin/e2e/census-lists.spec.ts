import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test, type Page } from "@playwright/test";

const baseUrl = "http://127.0.0.1:4174";
const evidenceDirectory = resolve(import.meta.dirname, "../../../roadmap/evidence/E2-W01");
const brandingCanic: unknown = JSON.parse(
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
    localStorage.setItem("agilityhub.mockScenario", "admin");
    localStorage.setItem(`agilityhub.branding:${location.host}`, JSON.stringify(cachedBranding));
  }, brandingCanic);
  await page.goto(`${baseUrl}/entrar`);
  await page.getByLabel("Correu electrònic").fill("admin@example.test");
  await page.getByRole("button", { name: "Tinc contrasenya" }).click();
  await page.getByLabel("Contrasenya").fill("secret-password");
  await page.getByRole("button", { name: "ENTRA" }).click();
  await page.waitForURL("**/tauler");
}

test.describe("E2-W01 census universal lists", () => {
  test("T-03-31 D5 shows the member filter state and approved 1280 layout", async ({ page }) => {
    await prepareAdmin(page);
    await page.goto(`${baseUrl}/abonats`);

    await expect(page.getByRole("heading", { name: /Abonats/u })).toBeVisible();
    await expect(page.getByText("184 d'alta")).toBeVisible();
    await expect(page.getByText(/Filtre \(1\): Modalitat = «Abonat»/u)).toBeVisible();
    await expect(page.getByRole("combobox", { name: "Estat dels abonats" })).toHaveValue("ACTIVE");
    await page.screenshot({
      path: resolve(evidenceDirectory, "D5-abonats-1280.png"),
    });
  });

  test("T-03-32 reorders columns and creates a saved view", async ({ page }) => {
    await prepareAdmin(page);
    await page.goto(`${baseUrl}/abonats`);
    await expect(page.getByRole("link", { exact: true, name: "Laura Serra Vidal" })).toBeVisible();

    await page.locator("summary").filter({ hasText: "Columnes" }).click();
    const dogs = page.locator(".ah-universal-list__columns li").filter({
      hasText: "Gossos (nivell)",
    });
    const member = page.locator(".ah-universal-list__columns li").filter({ hasText: "Abonat" });
    await dogs.dragTo(member);
    await expect.poll(() => new URL(page.url()).searchParams.get("fields")).toMatch(/^dogs,/u);

    await page.locator("summary").filter({ hasText: "Vistes" }).click();
    await page.getByLabel("Nom de la vista").fill("Seguiment setembre");
    await page.getByRole("button", { name: "Desa la vista" }).click();
    await expect(page.locator("summary").filter({ hasText: "Seguiment setembre" })).toBeVisible();
  });

  test("T-03-33 changes rows per page without losing the page selection", async ({ page }) => {
    await prepareAdmin(page);
    await page.goto(`${baseUrl}/abonats`);
    await expect(page.getByRole("link", { exact: true, name: "Laura Serra Vidal" })).toBeVisible();

    await page.getByRole("checkbox", { exact: true, name: "Selecciona Laura Serra Vidal" }).check();
    await page
      .getByRole("checkbox", { exact: true, name: "Selecciona Anna Ballart Consul" })
      .check();
    await expect(page.getByText("2 seleccionats — accions massives:")).toBeVisible();
    await page.getByRole("combobox", { name: "files per pàgina" }).selectOption("20");

    await expect(page.getByText("2 seleccionats — accions massives:")).toBeVisible();
    await expect(page.getByRole("combobox", { name: "files per pàgina" })).toHaveValue("20");
    await expect.poll(() => new URL(page.url()).searchParams.get("size")).toBe("20");
  });

  test("T-03-34 D15 opens a dog record and matches the approved 1280 layout", async ({ page }) => {
    await prepareAdmin(page);
    await page.goto(`${baseUrl}/gossos`);

    await expect(page.getByRole("heading", { name: /Gossos/u })).toBeVisible();
    await expect(page.getByText("242 actius")).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "Entrenament lliure" })).toBeVisible();
    await expect(page.getByText("FCAG 3241 (Iniciació) · RSCE 13298 (2)")).toBeVisible();
    await page.evaluate(() => {
      window.scrollTo(0, 0);
    });
    await page.screenshot({
      path: resolve(evidenceDirectory, "D15-gossos-1280.png"),
    });

    await page.getByRole("link", { exact: true, name: "Duna" }).click();
    await expect(page).toHaveURL(/\/gossos\/dog-duna$/u);
  });

  test("T-03-35 exposes empty, error recovery, and visible-column export states", async ({
    page,
  }) => {
    await prepareAdmin(page);
    await page.goto(`${baseUrl}/abonats?q=sense-resultats`);
    await expect(
      page.getByRole("heading", { name: "Cap abonat amb aquests criteris" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Neteja" }).click();
    await expect(page.getByRole("link", { exact: true, name: "Laura Serra Vidal" })).toBeVisible();

    await page.goto(
      `${baseUrl}/abonats?filter=unknown%3Aeq%3Avalue&fields=fullName%2Cdogs%2Cplan%2CdisplayStatus`,
    );
    await expect(page.getByRole("alert")).toContainText("El filtre no és vàlid");
    await expect(page.getByRole("button", { name: "Torna-ho a provar" })).toBeVisible();

    await page.goto(`${baseUrl}/abonats`);
    await expect(page.getByRole("link", { exact: true, name: "Laura Serra Vidal" })).toBeVisible();
    await page.getByText("Excel · PDF", { exact: true }).click();
    await expect(page.getByRole("link", { name: "Excel" })).toHaveAttribute(
      "href",
      /format=xlsx.*columns=fullName%2Cdogs%2Cplan%2CdisplayStatus/u,
    );
  });
});
