import { mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test, type Page } from "@playwright/test";

const adminUrl = "http://127.0.0.1:4174";
const clubsUrl = "http://127.0.0.1:4173";
const evidenceDirectory = resolve(import.meta.dirname, "../../../roadmap/evidence/E2-W09");
const branding: unknown = JSON.parse(
  readFileSync(
    resolve(
      import.meta.dirname,
      "../../../packages/api-client/src/mocks/fixtures/branding-canic.json",
    ),
    "utf8",
  ),
);

async function prepare(page: Page, scenario: "admin" | "member") {
  await page.addInitScript(
    ({ cachedBranding, mockScenario }) => {
      localStorage.setItem("agilityhub.locale", "ca");
      localStorage.setItem("agilityhub.mockScenario", mockScenario);
      localStorage.setItem(`agilityhub.branding:${location.host}`, JSON.stringify(cachedBranding));
    },
    { cachedBranding: branding, mockScenario: scenario },
  );
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

async function loginMember(page: Page) {
  await prepare(page, "member");
  await page.goto(`${clubsUrl}/entrar`);
  await page.getByLabel("Correu electrònic").fill("laura@example.test");
  await page.getByLabel("Contrasenya").fill("secret-password");
  await page.getByRole("button", { exact: true, name: "ENTRA" }).click();
  await page.waitForURL("**/inici");
}

test.beforeAll(() => {
  mkdirSync(evidenceDirectory, { recursive: true });
});

test("T-05-CP-07 publishes a club page from D11 and exposes Normes in screen 30", async ({
  browser,
}) => {
  const adminContext = await browser.newContext({ viewport: { height: 900, width: 1280 } });
  const admin = await adminContext.newPage();
  await loginAdmin(admin);
  await admin.goto(`${adminUrl}/parametres`);
  const rules = admin.getByRole("button", { name: /Normes del club/u });
  await expect(rules).toBeVisible();
  await admin.screenshot({
    fullPage: true,
    path: resolve(evidenceDirectory, "D11-club-pages-1280.png"),
  });

  await rules.click();
  const editor = admin.getByRole("dialog", { name: "Edita la pàgina" });
  await editor
    .getByLabel("Contingut")
    .fill("## Convivència\n\nRespecteu els espais **compartits** i les indicacions de l'equip.");
  await expect(editor.getByRole("heading", { name: "Convivència" })).toBeVisible();
  await expect(editor.getByText("compartits", { exact: true })).toHaveCSS("font-weight", "700");
  await admin.screenshot({
    fullPage: true,
    path: resolve(evidenceDirectory, "D11-club-page-editor-preview-1280.png"),
  });

  await editor.getByRole("button", { name: "Publica" }).click();
  const confirmation = admin.getByRole("dialog", { name: "Publica la pàgina" });
  await expect(confirmation).toContainText("Es publicarà la versió 2");
  await confirmation.getByRole("button", { name: "Publica" }).click();
  await expect(admin.getByText(/versió 2/u)).toBeVisible();
  await adminContext.close();

  const memberContext = await browser.newContext({ viewport: { height: 844, width: 390 } });
  const member = await memberContext.newPage();
  await loginMember(member);
  await member.goto(`${clubsUrl}/info`);
  await expect(member.getByRole("tab", { name: "Normes" })).toBeVisible();
  await member.getByRole("tab", { name: "Normes" }).click();
  await expect(member.getByRole("heading", { name: "Normes del club" })).toBeVisible();
  await expect(member.getByText(/Actualitzat el 09\/09\/2026/u)).toBeVisible();
  await member.screenshot({
    fullPage: true,
    path: resolve(evidenceDirectory, "30-info-390.png"),
  });
  await memberContext.close();
});
