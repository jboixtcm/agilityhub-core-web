import { mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test, type Page } from "@playwright/test";

const base = "http://127.0.0.1:4174";
const evidence = resolve(import.meta.dirname, "../../../roadmap/evidence/feedback-20261108");
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

test("T-03-38 collapsed navigation and persistent list size", async ({ page }) => {
  await login(page);
  await page.getByRole("button", { name: "Plega el menú" }).click();
  const navigation = page.locator("#admin-navigation");
  await expect(navigation).toBeVisible();
  const members = navigation.getByRole("link", { name: "Abonats", exact: true });
  await expect(members).toBeVisible();
  await expect(members).toHaveAttribute("title", "Abonats");
  await members.click();
  await expect(page.getByRole("heading", { level: 1, name: /^Abonats(?: |$)/u })).toBeVisible();
  await expect(page.getByRole("button", { name: "Desplega el menú" })).toBeVisible();
  await page.getByRole("combobox", { name: "files per pàgina" }).selectOption("200");
  await page.goto(`${base}/gossos`);
  await expect(page.getByRole("combobox", { name: "files per pàgina" })).toHaveValue("50");
  await page.goto(`${base}/abonats`);
  await expect(page.getByRole("combobox", { name: "files per pàgina" })).toHaveValue("200");
  await expect(page.getByRole("button", { name: "Desplega el menú" })).toBeVisible();
  const box = await navigation.boundingBox();
  expect(box?.width).toBeLessThan(100);
  expect(box?.width).toBeGreaterThan(40);
  const links = navigation.getByRole("link");
  const names = await links.evaluateAll((elements) =>
    elements.map((element) => element.querySelector("use")?.getAttribute("href")),
  );
  expect(new Set(names).size).toBe(names.length);
  await expect(page.getByRole("link", { name: "Laura Serra Vidal", exact: true })).toBeVisible();
  await page.screenshot({ path: resolve(evidence, "collapsed-desktop.png"), fullPage: false });
  await page.reload();
  await expect(page.getByRole("combobox", { name: "files per pàgina" })).toHaveValue("200");
  await page.getByRole("button", { name: "Desplega el menú" }).click();
  await expect(page.getByRole("button", { name: "Plega el menú" })).toBeVisible();
});

for (const width of [1280, 375]) {
  test(`T-03-32 license editing and member leave at ${String(width)}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await login(page);
    await page.goto(`${base}/gossos/dog-rock`);
    const licenses = page
      .locator(".ah-card")
      .filter({ has: page.getByRole("heading", { name: "Llicències" }) });
    await licenses.getByRole("button", { name: "Edita", exact: true }).click();
    const drawer = page.getByRole("dialog", { name: "Edita les dades del gos" });
    await expect(drawer).toBeVisible();
    await drawer.getByRole("textbox", { name: "Categoria de la llicència 1" }).fill("L");
    await drawer.getByRole("button", { name: "Desa", exact: true }).click();
    await expect(drawer).toBeHidden();
    await expect(licenses.getByText("Categoria FCAG: L", { exact: false })).toBeVisible();
    await page.screenshot({
      path: resolve(evidence, `licenses-${String(width)}.png`),
      fullPage: true,
    });
    await page.goto(`${base}/abonats/member-laura`);
    const actions = page.getByRole("group", { name: "Accions", exact: true });
    await actions.getByRole("button", { name: "Accions", exact: true }).click();
    await actions.getByRole("button", { name: "Baixa (amb data)", exact: true }).click();
    await expect(page.getByRole("dialog", { name: "Baixa (amb data)" })).toBeVisible();
    await page.screenshot({
      path: resolve(evidence, `leave-${String(width)}.png`),
      fullPage: false,
    });
    await page
      .getByRole("dialog", { name: "Baixa (amb data)" })
      .getByRole("button", { name: "Tanca", exact: true })
      .click();
    await actions.getByRole("button", { name: "Accions", exact: true }).click();
    await actions.getByRole("button", { name: "Grup familiar", exact: true }).click();
    const family = page.getByRole("dialog", { name: "Grup familiar" });
    await expect(family.getByRole("link", { name: "Laura Serra Vidal" })).toBeVisible();
    const color = await family
      .getByRole("link", { name: "Laura Serra Vidal" })
      .evaluate((element) => getComputedStyle(element).color);
    const primary = await family
      .getByRole("button", { name: "Desa", exact: true })
      .evaluate((element) => getComputedStyle(element).backgroundColor);
    expect(color).toBe(primary);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({
      path: resolve(evidence, `family-${String(width)}.png`),
      fullPage: false,
    });
  });
}
