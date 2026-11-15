import { mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test } from "@playwright/test";
const evidence = resolve(import.meta.dirname, "../../../roadmap/evidence/competition-statistics");
const branding = JSON.parse(
  readFileSync(
    resolve(
      import.meta.dirname,
      "../../../packages/api-client/src/mocks/fixtures/branding-canic.json",
    ),
    "utf8",
  ),
) as { modules: string[] };
branding.modules.push("STATS");
test.beforeEach(async ({ page }) => {
  mkdirSync(evidence, { recursive: true });
  await page.clock.setFixedTime(new Date("2026-08-02T18:30:00Z"));
  await page.addInitScript(
    ({ value, scenario }) => {
      localStorage.setItem("agilityhub.locale", "ca");
      localStorage.setItem("agilityhub.mockScenario", scenario);
      localStorage.setItem(`agilityhub.branding:${location.host}`, JSON.stringify(value));
    },
    { value: branding, scenario: "competitionAdmin" },
  );
  await page.goto("http://127.0.0.1:4174/entrar");
  await page.getByLabel("Correu electrònic").fill("admin@example.test");
  await page.getByRole("button", { name: "Tinc contrasenya" }).click();
  await page.getByLabel("Contrasenya", { exact: true }).fill("secret-password");
  await page.getByRole("button", { exact: true, name: "ENTRA" }).click();
  await page.waitForURL("**/tauler");
});
test("T-STATS-22 administrator reviews selected licences before importing", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.getByRole("link", { name: "Estadístiques de competició" }).click();
  await expect(page.getByRole("heading", { name: "Resultats de competició" })).toBeVisible();
  await page
    .getByLabel("Enllaç de la classificació o prova")
    .fill("https://app.fcagility.cat/federated/classification/division/128");
  await page.getByRole("button", { name: "Previsualitza" }).click();
  await expect(page.getByRole("heading", { name: "Revisa les coincidències" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Confirma la importació" })).toBeDisabled();
  await page.getByLabel("Mostra també resultats sense coincidència").check();
  await expect(page.getByLabel("Assigna Núvol, llicència 9999")).toHaveValue("");
  await page.screenshot({ path: resolve(evidence, "admin-1280.png"), fullPage: true });
  await page.getByLabel(/He revisat la selecció/u).check();
  const confirmation = page.waitForRequest(
    (request) => request.url().endsWith("/confirm") && request.method() === "POST",
  );
  await page.getByRole("button", { name: "Confirma la importació" }).click();
  expect((await confirmation).postDataJSON()).toEqual({ assignments: { "fcag-1": "dog-duna" } });
  await expect(page.getByText("1 resultat importat").first()).toBeVisible();
});
