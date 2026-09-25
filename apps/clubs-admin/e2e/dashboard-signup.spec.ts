import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test, type Page } from "@playwright/test";

const baseUrl = "http://127.0.0.1:4174";
const evidenceDirectory = resolve(import.meta.dirname, "../../../roadmap/evidence/E3-W02");
const branding: unknown = JSON.parse(
  readFileSync(
    resolve(
      import.meta.dirname,
      "../../../packages/api-client/src/mocks/fixtures/branding-canic.json",
    ),
    "utf8",
  ),
);

async function login(page: Page, scenario = "admin") {
  await page.addInitScript(
    ({ cachedBranding, mockScenario }) => {
      localStorage.setItem("agilityhub.locale", "ca");
      localStorage.setItem("agilityhub.mockScenario", mockScenario);
      localStorage.setItem(`agilityhub.branding:${location.host}`, JSON.stringify(cachedBranding));
    },
    { cachedBranding: branding, mockScenario: scenario },
  );
  await page.goto(`${baseUrl}/entrar`);
  await page.getByLabel("Correu electrònic").fill("aina.serra@example.test");
  await page.getByRole("button", { name: "Tinc contrasenya" }).click();
  await page.getByLabel("Contrasenya").fill("secret-password");
  await page.getByRole("button", { name: "ENTRA" }).click();
  await page.waitForURL("**/tauler");
}

test("T-14-25 / T-04-33 validates a D1 pending signup in D2 and refreshes the counters", async ({ page }) => {
  await login(page);

  await expect(page.getByRole("heading", { name: /Bon dia!.*dilluns.*10 d’agost/iu })).toBeVisible();
  await expect(page.getByText("184", { exact: true })).toBeVisible();
  await expect(page.getByText("87%", { exact: true })).toBeVisible();
  await expect(page.getByRole("figure", { name: "Gossos per nivell — 242 actius" })).toBeVisible();
  await expect(page.getByRole("link", { name: /Preinscripcions\s*3/u })).toBeVisible();
  await expect(page.getByRole("link", { name: /Inactivitats i baixes\s*1/u })).toBeVisible();
  await expect(page.getByRole("link", { name: /Seguiment alumnes\s*5/u })).toBeVisible();
  await page.screenshot({
    fullPage: true,
    path: resolve(evidenceDirectory, "D1-dashboard-1280.png"),
  });

  await page.getByRole("button", { name: "VALIDA" }).first().click();
  await expect(page).toHaveURL(/\/preinscripcions\/42000000-0000-4000-8000-000000000001$/u);
  await expect(page.getByRole("heading", { name: /Preinscripció #1042 — Marta Roca Pujol \+ Kiwi/u })).toBeVisible();
  await expect(page.getByText(/no publiqueu fotos on surti ella/u)).toBeVisible();
  await expect(page.getByLabel("Nivell inicial")).toHaveValue("43000000-0000-4000-8000-000000000001");
  await expect(page.getByLabel("Import efectivament cobrat:")).toHaveValue(/130,00/u);
  await page.screenshot({
    fullPage: true,
    path: resolve(evidenceDirectory, "D2-signup-validation-1280.png"),
  });

  await page.getByRole("button", { name: "VALIDA L'ALTA" }).click();
  await expect(page).toHaveURL(/\/tauler\?signup=validated$/u);
  await expect(page.getByText("L'alta s'ha validat.")).toBeVisible();
  await expect(page.getByRole("link", { name: /Preinscripcions\s*2/u })).toBeVisible();
  await page.screenshot({
    fullPage: true,
    path: resolve(evidenceDirectory, "D1-dashboard-after-validation-1280.png"),
  });
});

test("E3-W08 step 6 (R-04-06, E38): D2 shows a readmission's old and new values, and the DNI stays read-only", async ({
  page,
}) => {
  await login(page, "adminSignupReviewReadmission");
  await page.getByRole("button", { name: "VALIDA" }).first().click();
  await expect(page.getByRole("heading", { name: /Preinscripció #1042 — Marta Roca Pujol \+ Kiwi/u })).toBeVisible();
  await expect(page.locator(".ah-badge", { hasText: "Readmissió" })).toBeVisible();
  const changes = page.getByRole("region", { name: "Canvis respecte de la fitxa de baixa" });
  await expect(changes.getByText("Abans: marta.antic@example.test")).toBeVisible();
  await expect(changes.getByText("Ara: marta.roca@example.test")).toBeVisible();
  await page.screenshot({
    fullPage: true,
    path: resolve(import.meta.dirname, "../../../roadmap/evidence/E3-W08/D2-readmission-mock-1280.png"),
  });
  await page.getByRole("button", { name: "EDITA LES DADES" }).click();
  const drawer = page.getByRole("dialog", { name: "Edita les dades de la preinscripció" });
  await expect(drawer.getByLabel("DNI/NIE")).toHaveAttribute("readonly", "");
  await expect(drawer.getByText(/per corregir-lo, rebutja la readmissió/u)).toBeVisible();
});
