import { mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test, type Page } from "@playwright/test";

const base = "http://127.0.0.1:4174";
const evidence = resolve(import.meta.dirname, "../../../roadmap/evidence/feedback-20261109");
const branding: unknown = JSON.parse(
  readFileSync(
    resolve(
      import.meta.dirname,
      "../../../packages/api-client/src/mocks/fixtures/branding-canic.json",
    ),
    "utf8",
  ),
);
async function login(page: Page) {
  await page.addInitScript((value) => {
    localStorage.setItem("agilityhub.locale", "ca");
    localStorage.setItem("agilityhub.mockScenario", "admin");
    localStorage.setItem(`agilityhub.branding:${location.host}`, JSON.stringify(value));
  }, branding);
  await page.goto(`${base}/entrar`);
  await page.getByLabel("Correu electrònic").fill("admin@example.test");
  await page.getByRole("button", { name: "Tinc contrasenya" }).click();
  await page.getByLabel("Contrasenya", { exact: true }).fill("secret-password");
  await page.getByRole("button", { name: "ENTRA", exact: true }).click();
  await page.waitForURL("**/tauler");
}
test.beforeAll(() => {
  mkdirSync(evidence, { recursive: true });
});

for (const width of [1280, 375]) {
  test(`member notes remain editable and readable at ${String(width)}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await login(page);
    await page.goto(`${base}/abonats/member-laura`);
    const notes = page
      .locator(".ah-card")
      .filter({ has: page.getByRole("heading", { name: "Notes internes", exact: true }) });
    await notes.getByRole("button", { name: "Edita", exact: true }).click();
    const drawer = page.getByRole("dialog", { name: "Edita l'abonat" });
    await expect(drawer).toBeVisible();
    const note = `Nota interna ${String(width)}\nSegona línia per administració`;
    await drawer.getByLabel("Notes internes", { exact: true }).fill(note);
    await drawer.getByRole("button", { name: "Desa", exact: true }).click();
    await expect(drawer).toBeHidden();
    await expect(notes.locator("p")).toHaveText(note);
    await page.screenshot({
      path: resolve(evidence, `member-notes-${String(width)}.png`),
      fullPage: true,
    });
    // The editor remains reachable in the summary independently of the member's dogs.
    const editPlan = page
      .locator("dt")
      .filter({ hasText: /^Modalitat$/u })
      .locator("..")
      .getByRole("button", { name: "Edita", exact: true });
    await editPlan.click();
    await expect(page.getByRole("dialog", { name: "Modalitat", exact: true })).toBeVisible();
  });
}
