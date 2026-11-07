import { mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test, type Page } from "@playwright/test";

const base = "http://127.0.0.1:4174";
const evidence = resolve(
  import.meta.dirname,
  "../../../roadmap/evidence/2026-11-07-josep-feedback",
);
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
  test(`T-03-28 family holder, actions and summary at ${String(width)}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await login(page);
    await page.goto(`${base}/abonats/member-laura`);
    const header = page.locator(".census-record__header-actions");
    await expect(header.getByRole("button", { name: "Accions" })).toBeVisible();
    await expect(header.getByRole("button", { name: "Fusiona abonats" })).toBeHidden();
    await header.getByRole("button", { name: "Accions" }).click();
    await page.screenshot({ path: resolve(evidence, `member-actions-${String(width)}.png`) });
    await header.getByRole("button", { name: "Grup familiar" }).click();
    const dialog = page.getByRole("dialog", { name: "Grup familiar" });
    await expect(dialog.getByRole("button", { name: "Desa", exact: true })).toBeEnabled();
    await expect(dialog.getByRole("link", { name: "Laura Serra Vidal" })).toBeVisible();
    const joan = dialog
      .getByRole("listitem")
      .filter({ has: page.getByRole("link", { name: "Joan Antoni Serra" }) });
    await joan.getByRole("radio").check();
    await expect(joan.getByRole("radio")).toBeChecked();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({ path: resolve(evidence, `family-group-${String(width)}.png`) });
    await dialog.getByRole("button", { name: "Desa", exact: true }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByText("membre del grup familiar", { exact: true })).toBeVisible();
    const summary = page
      .locator(".census-record__data-row")
      .filter({ has: page.locator("dt").filter({ hasText: /^Grup familiar$/u }) });
    await summary.getByRole("button", { name: "Grup familiar" }).click();
    await expect(
      dialog
        .getByRole("listitem")
        .filter({ has: page.getByRole("link", { name: "Joan Antoni Serra" }) })
        .getByRole("radio"),
    ).toBeChecked();
  });
}
