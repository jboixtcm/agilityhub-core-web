import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test, type Page } from "@playwright/test";

const base = "http://127.0.0.1:4174";

const branding: unknown = JSON.parse(
  readFileSync(
    resolve(
      import.meta.dirname,
      "../../../packages/api-client/src/mocks/fixtures/branding-canic.json",
    ),
    "utf8",
  ),
);
async function login(page: Page, mode: "light" | "dark") {
  await page.clock.setFixedTime(new Date("2026-08-12T10:00:00+02:00"));
  await page.addInitScript(
    ({ value, mode }) => {
      localStorage.setItem("agilityhub.locale", "ca");
      localStorage.setItem("agilityhub.mockScenario", "admin");
      localStorage.setItem("agilityhub.appearance:canic", mode);
      localStorage.setItem(`agilityhub.branding:${location.host}`, JSON.stringify(value));
    },
    { value: branding, mode },
  );
  await page.goto(`${base}/entrar`);
  await page.getByLabel("Correu electrònic").fill("admin@example.test");
  await page.getByRole("button", { name: "Tinc contrasenya" }).click();
  await page.getByLabel("Contrasenya", { exact: true }).fill("secret-password");
  await page.getByRole("button", { name: "ENTRA", exact: true }).click();
  await page.waitForURL("**/tauler");
}

test("exports only the selected calendar week and status in its screen grid", async ({
  page,
}, info) => {
  await login(page, "dark");
  await page.goto(`${base}/calendari?estat=actives&setmana=2026-08-10`);
  const table = page.locator(".calendar-grid table");
  await expect(table).toBeVisible();
  const dates = await table.locator("thead th").allTextContents();
  expect(dates.length).toBeGreaterThan(1);
  const cells = await table.locator(".ah-schedule-cell__title").allTextContents();
  expect(cells.length).toBeGreaterThan(0);
  await page.evaluate(() => {
    window.print = () => {
      document.documentElement.setAttribute("data-printed", "true");
    };
  });
  await page.getByRole("button", { name: "Imprimeix / Desa PDF" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-printed", "true");
  await page.emulateMedia({ media: "print" });
  await expect(page.locator(".admin-shell__navigation")).toBeHidden();
  await expect(page.locator(".calendar-cards")).toBeHidden();
  await expect(page.getByRole("button", { name: "Actives", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Esborrany", exact: true })).toBeHidden();
  await expect(table).toBeVisible();
  expect(await table.locator(".ah-schedule-cell__title").allTextContents()).toEqual(cells);
  const pdf = await page.pdf({
    preferCSSPageSize: true,
    printBackground: true,
    path: info.outputPath("calendar-week.pdf"),
  });
  expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
});
