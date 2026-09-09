import { mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test, type Page } from "@playwright/test";

const baseUrl = "http://127.0.0.1:4174";
const evidenceDirectory = resolve(import.meta.dirname, "../../../roadmap/evidence/E2-W06");
const branding = JSON.parse(
  readFileSync(
    resolve(
      import.meta.dirname,
      "../../../packages/api-client/src/mocks/fixtures/branding-canic.json",
    ),
    "utf8",
  ),
) as Record<string, unknown>;
const allLocalesBranding = { ...branding, locales: ["ca", "es", "en"] };

async function prepareAdmin(page: Page) {
  await page.addInitScript((cachedBranding) => {
    localStorage.setItem("agilityhub.locale", "ca");
    localStorage.setItem("agilityhub.mockScenario", "adminAllLocales");
    localStorage.setItem(`agilityhub.branding:${location.host}`, JSON.stringify(cachedBranding));
  }, allLocalesBranding);
  await page.goto(`${baseUrl}/entrar`);
  await page.getByLabel("Correu electrònic").fill("admin@example.test");
  await page.getByRole("button", { name: "Tinc contrasenya" }).click();
  await page.getByLabel("Contrasenya").fill("secret-password");
  await page.getByRole("button", { exact: true, name: "ENTRA" }).click();
  await page.waitForURL("**/tauler");
}

test.beforeAll(() => {
  mkdirSync(evidenceDirectory, { recursive: true });
});

test("T-14-26 shows member/global audit, masked diffs, LastChange and queued exports", async ({
  browser,
}) => {
  const context = await browser.newContext({ viewport: { height: 900, width: 1280 } });
  const page = await context.newPage();
  await prepareAdmin(page);

  await page.goto(`${baseUrl}/abonats/member-laura`);
  await expect(page.getByRole("link", { name: "Tota l'auditoria ›" })).toHaveAttribute(
    "href",
    "/abonats/member-laura/auditoria",
  );
  await page.getByRole("tab", { name: "Auditoria" }).click();
  await expect(page.getByRole("table", { name: "Entrades d'auditoria de l'abonat" })).toBeVisible();

  await page.goto(`${baseUrl}/abonats/member-laura/auditoria`);
  await expect(page.getByRole("heading", { name: "Auditoria de l'abonat" })).toBeVisible();
  await page.getByRole("combobox", { name: "Acció" }).selectOption("MEMBER_PAYMENT_METHOD_CHANGED");
  await expect(
    page.getByRole("link", { exact: true, name: "Mètode de pagament modificat" }),
  ).toBeVisible();
  await expect(page.getByRole("link", { exact: true, name: "Modalitat modificada" })).toHaveCount(
    0,
  );
  await page.screenshot({
    fullPage: true,
    path: resolve(evidenceDirectory, "member-audit-1280.png"),
  });

  await page.getByRole("link", { exact: true, name: "Mètode de pagament modificat" }).click();
  const changeDrawer = page.getByRole("dialog", { name: "Detall del canvi" });
  await expect(changeDrawer).toContainText("paymentMethod.iban");
  await expect(changeDrawer).toContainText("···· ···· ···· ···· 2231");
  await expect(changeDrawer).toContainText("···· ···· ···· ···· 8867");
  await page.screenshot({
    fullPage: true,
    path: resolve(evidenceDirectory, "change-drawer-1280.png"),
  });
  await changeDrawer.getByRole("button", { name: "Tanca el detall del canvi" }).click();

  await page.getByText("Excel · PDF").click();
  await page.getByRole("button", { name: "Excel" }).click();
  const exportsDrawer = page.getByRole("dialog", { name: "Exportacions" });
  await expect(exportsDrawer).toContainText("Preparant l'exportació…");
  await expect(
    exportsDrawer.getByRole("link", { name: "Descarrega auditoria_20260803-1025.xlsx" }),
  ).toBeVisible();
  await page.screenshot({
    fullPage: true,
    path: resolve(evidenceDirectory, "exports-drawer-1280.png"),
  });
  await exportsDrawer.getByRole("button", { name: "Tanca les exportacions" }).click();

  await page.goto(`${baseUrl}/parametres`);
  await expect(page.getByText(/últim canvi:/u).first()).toBeVisible();
  await page.getByRole("link", { name: "amb històric" }).first().click();
  await page.waitForURL(/\/auditoria\?entityType=Parameter/u);
  await expect(page.getByRole("heading", { name: "Auditoria" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Capacitat per nivell" })).toBeVisible();
  await page.screenshot({
    fullPage: true,
    path: resolve(evidenceDirectory, "global-audit-1280.png"),
  });
  await context.close();
});

test("T-14-27 renders the audit and PDF export state in ca/es/en without missing keys", async ({
  browser,
}) => {
  const context = await browser.newContext({ viewport: { height: 900, width: 1280 } });
  const page = await context.newPage();
  await prepareAdmin(page);
  const cases = [
    { close: "Tanca les exportacions", locale: "ca", title: "Auditoria" },
    { close: "Cierra las exportaciones", locale: "es", title: "Auditoría" },
    { close: "Close exports", locale: "en", title: "Audit" },
  ] as const;

  for (const item of cases) {
    await page.goto(`${baseUrl}/auditoria`);
    await page.locator(".shell-language select").selectOption(item.locale);
    await expect(page.getByRole("heading", { name: item.title })).toBeVisible();
    await expect(page.getByRole("table")).toBeVisible();
    await expect(page.locator("body")).not.toContainText(/(?:admin-audit|census):/u);

    await page.getByText("Excel · PDF").click();
    await page.getByRole("button", { name: "PDF" }).click();
    const drawer = page.getByRole("dialog");
    await expect(drawer.getByRole("link", { name: /\.pdf$/u })).toBeVisible();
    await page.screenshot({
      fullPage: true,
      path: resolve(evidenceDirectory, `audit-${item.locale}-1280.png`),
    });
    await drawer.getByRole("button", { name: item.close }).click();
  }
  await context.close();
});
