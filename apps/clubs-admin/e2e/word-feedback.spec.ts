import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test, type Page } from "@playwright/test";

const baseUrl = "http://127.0.0.1:4174";
const evidence = resolve(import.meta.dirname, "../../../roadmap/evidence/2026-10-30-word-feedback");
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
  await page.addInitScript((cached) => {
    localStorage.setItem("agilityhub.locale", "ca");
    localStorage.setItem("agilityhub.mockScenario", "admin");
    localStorage.setItem(`agilityhub.branding:${location.host}`, JSON.stringify(cached));
  }, branding);
  await page.goto(`${baseUrl}/entrar`);
  await page.getByLabel("Correu electrònic").fill("admin@example.test");
  await page.getByRole("button", { name: "Tinc contrasenya" }).click();
  await page.getByLabel("Contrasenya").fill("secret-password");
  await page.getByRole("button", { name: "ENTRA" }).click();
  await page.waitForURL("**/tauler");
}
test.beforeAll(() => {
  mkdirSync(evidence, { recursive: true });
});
for (const width of [1280, 375]) {
  test(`Word: training capacity configuration at ${String(width)}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await login(page);
    await page.goto(`${baseUrl}/parametres`);
    const settings = page
      .getByRole("heading", { name: "Entrenaments lliures", exact: true })
      .locator("..");
    await expect(
      settings.getByText("Reserves simultànies per pista i franja", { exact: true }),
    ).toBeVisible();
    await settings.getByText("Excepcions per pista", { exact: true }).click();
    await settings.getByLabel("Muntanya", { exact: true }).fill("3");
    await settings.getByRole("button", { name: "Desa Muntanya", exact: true }).click();
    await expect(settings.getByText("Capacitat desada.")).toBeVisible();
    await expect(settings.getByLabel("Muntanya", { exact: true })).toHaveValue("3");
    await settings.scrollIntoViewIfNeeded();
    await settings.screenshot({
      path: resolve(evidence, `training-capacity-${String(width)}.png`),
    });
    const overflow = await page.evaluate(() =>
      [...document.querySelectorAll("body *")].flatMap((element) => {
        const bounds = element.getBoundingClientRect();
        return bounds.right > innerWidth + 1 && bounds.width > 0
          ? [
              {
                tag: element.tagName,
                className: element.className,
                text: element.textContent.slice(0, 80),
                right: bounds.right,
                width: bounds.width,
              },
            ]
          : [];
      }),
    );
    writeFileSync(
      resolve(evidence, `training-overflow-${String(width)}.json`),
      JSON.stringify(overflow, null, 2),
    );
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  });

  test(`Word: add dog and preview merge at ${String(width)}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await login(page);
    await page.goto(`${baseUrl}/abonats/member-laura`);
    await page.getByRole("button", { name: "Afegir un altre gos" }).click();
    const drawer = page.getByRole("dialog", { name: "Afegir un altre gos" });
    await drawer.getByLabel("Nom", { exact: true }).fill("Nova");
    await drawer.getByLabel("Raça").fill("Mestissa");
    await drawer.getByLabel("Data de naixement").fill("2023-03-12");
    await drawer.getByLabel("Guia", { exact: true }).fill("Lau");
    await expect(drawer.getByLabel("El guia és l’abonat")).toBeChecked();
    await page.screenshot({ path: resolve(evidence, `add-dog-${String(width)}.png`) });
    await drawer.getByRole("button", { name: "Desa" }).click();
    await expect(page.getByText("Gos afegit i actiu.")).toBeVisible();
    await expect(drawer).toHaveCount(0);
    await page.getByRole("button", { name: "Fusiona abonats" }).click();
    const merge = page.getByRole("dialog", { name: "Fusiona abonats" });
    await expect(merge.getByRole("button", { name: "Previsualitza la fusió" })).toBeDisabled();
    const target = merge.getByRole("option", { name: /Marc Prats García · #/ });
    await expect(target).toHaveCount(1);
    await merge
      .getByLabel("Abonat que es conserva")
      .selectOption((await target.getAttribute("value")) ?? "");
    await merge.getByRole("button", { name: "Previsualitza la fusió" }).click();
    await expect(merge.getByText(/Es conserva: Marc Prats García · #/)).toBeVisible();
    await expect(merge.getByRole("button", { name: "Confirma la fusió" })).toBeEnabled();
    await page.screenshot({ path: resolve(evidence, `merge-preview-${String(width)}.png`) });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.keyboard.press("Escape");
    await expect(merge).toHaveCount(0);
  });
}
