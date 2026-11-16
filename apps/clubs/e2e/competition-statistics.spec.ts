import { mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test } from "@playwright/test";
const evidence = resolve(import.meta.dirname, "../../../roadmap/evidence/flow-weekly");
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
    { value: branding, scenario: "competitionMember" },
  );
  await page.goto("http://127.0.0.1:4173/entrar");
  await page.getByLabel("Correu electrònic").fill("laura@example.test");
  await page.getByLabel("Contrasenya", { exact: true }).fill("secret-password");
  await page.getByRole("button", { exact: true, name: "ENTRA" }).click();
  await page.waitForURL("**/inici");
});
test("T-STATS-21 member sees own statistics, source and period filters", async ({ page }) => {
  await page.goto("http://127.0.0.1:4173/perfil");
  await page.getByRole("link", { name: "Estadístiques de competició" }).click();
  await expect(page.getByRole("heading", { name: "Estadístiques de competició" })).toBeVisible();
  await expect(page.getByText("140", { exact: true })).toBeVisible();
  await expect(page.getByText("1 prova amb punt")).toBeVisible();
  await expect(page.locator(".competition-runs li")).toHaveCount(2);
  await expect(page.getByRole("link", { name: "Veure la font" }).first()).toHaveAttribute(
    "href",
    "https://app.fcagility.cat/federated/classification/division/128",
  );
  await expect(page.getByRole("heading", { name: "Grau actual G2" })).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Progrés d’ascens" }).getByText("Falten 2"),
  ).toBeVisible();
  await expect(
    page
      .getByRole("region", { name: "Campionat d’Espanya 2027" })
      .getByRole("progressbar", { name: "Agility · PV" }),
  ).toHaveAttribute("value", "1");
  await page.setViewportSize({ width: 375, height: 900 });
  await expect(page.locator("body")).toHaveJSProperty("scrollWidth", 375);
  await page.screenshot({ path: resolve(evidence, "member-375.png"), fullPage: true });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.screenshot({ path: resolve(evidence, "member-1280.png"), fullPage: true });
  await page.getByLabel("Mostra només mànegues amb punt").check();
  await expect(page.locator(".competition-runs li")).toHaveCount(1);
  await page.getByRole("combobox", { name: "Gos", exact: true }).selectOption({ label: "Rock" });
  await expect(page.getByText("No hi ha resultats importats per a aquest any.")).toBeVisible();
  await expect(page.getByText("140", { exact: true })).toHaveCount(0);
});
