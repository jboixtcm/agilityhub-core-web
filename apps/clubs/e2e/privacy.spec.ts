import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test, type Page } from "@playwright/test";

const baseUrl = "http://127.0.0.1:4173";
const evidenceDirectory = resolve(import.meta.dirname, "../../../roadmap/evidence/E11-W01");
const branding: unknown = JSON.parse(
  readFileSync(
    resolve(
      import.meta.dirname,
      "../../../packages/api-client/src/mocks/fixtures/branding-canic.json",
    ),
    "utf8",
  ),
);

async function login(page: Page, scenario: "impersonated" | "member"): Promise<void> {
  await page.addInitScript(
    ({ cachedBranding, mockScenario }) => {
      localStorage.setItem("agilityhub.locale", "ca");
      localStorage.setItem("agilityhub.mockScenario", mockScenario);
      localStorage.setItem(`agilityhub.branding:${location.host}`, JSON.stringify(cachedBranding));
    },
    { cachedBranding: branding, mockScenario: scenario },
  );
  if (scenario === "impersonated") {
    await page.goto(`${baseUrl}/entrar?handoff=mock-impersonation-handoff-e2e`);
    await page.waitForURL("**/inici");
    return;
  }
  await page.goto(`${baseUrl}/entrar`);
  await page.getByLabel("Correu electrònic").fill("laura@example.test");
  await page.getByLabel("Contrasenya").fill("secret-password");
  await page.getByRole("button", { exact: true, name: "ENTRA" }).click();
  await page.waitForURL("**/inici");
}

test("T-14-17 screen 12 keeps the queued export and downloads its ZIP", async ({ page }) => {
  await page.setViewportSize({ height: 812, width: 375 });
  await login(page, "member");
  await page.goto(`${baseUrl}/perfil`);
  const queued = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname === "/api/v1/me/data-export",
  );
  await page.getByRole("button", { name: "Descarrega les meves dades" }).click();
  expect((await queued).status()).toBe(202);
  await expect(page.getByText("Preparant el paquet…", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Descarrega el paquet" })).toBeVisible();
  await page.screenshot({
    fullPage: true,
    path: resolve(evidenceDirectory, "12-dades-personals-ready-mock-375.png"),
  });
  const download = page.waitForResponse(
    (response) =>
      response.request().method() === "GET" &&
      /\/api\/v1\/exports\/[0-9a-f-]+\/download$/u.test(new URL(response.url()).pathname),
  );
  await page.getByRole("button", { name: "Descarrega el paquet" }).click();
  expect((await download).status()).toBe(200);
});

test("T-14-17 hides the data export during impersonation", async ({ page }) => {
  await login(page, "impersonated");
  await page.goto(`${baseUrl}/perfil`);
  await expect(page.getByText("Estàs veient l'app com Laura Serra Vidal")).toBeVisible();
  await expect(page.getByRole("button", { name: "Descarrega les meves dades" })).toHaveCount(0);
});
