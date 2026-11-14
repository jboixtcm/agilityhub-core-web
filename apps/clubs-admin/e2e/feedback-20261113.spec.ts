import { mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test, type Page } from "@playwright/test";

const base = "http://127.0.0.1:4174";
const evidence = resolve(import.meta.dirname, "../../../roadmap/evidence/feedback-20261113");
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
test.use({ locale: "ca-ES" });

test.beforeAll(() => mkdirSync(evidence, { recursive: true }));
for (const width of [1280, 375]) {
  for (const mode of ["light", "dark"] as const) {
    test(`T-06-09 free class times and T-12-07 saved forecast ${String(width)} ${mode}`, async ({
      page,
    }, testInfo) => {
      await page.setViewportSize({ width, height: 900 });
      await login(page, mode);
      await page.goto(`${base}/calendari?estat=actives&setmana=2026-08-10`);
      await page.getByRole("button", { name: /^dc 12 18:50 · B\+C · 4\/5/u }).click();
      const card = page.getByRole("region", { name: /^Classe seleccionada/u });
      await card.getByLabel("Hora", { exact: true }).fill("18:45");
      await card.getByLabel("Final", { exact: true }).fill("19:57");
      const saved = page.waitForRequest(
        (request) => request.method() === "PATCH" && request.url().includes("/class-sessions/"),
      );
      await card.getByRole("button", { name: "ACCEPTA", exact: true }).click();
      expect((await saved).postDataJSON()).toMatchObject({ startTime: "18:45", endTime: "19:57" });
      await expect(card.getByRole("heading", { level: 2 })).toContainText("18:45");
      await expect(card.getByLabel("Hora", { exact: true })).toHaveValue("18:45");
      await expect(card.getByLabel("Final", { exact: true })).toHaveValue("19:57");
      await card.scrollIntoViewIfNeeded();
      await page.screenshot({
        path: resolve(evidence, `times-${testInfo.project.name}-${String(width)}-${mode}.png`),
      });
      await page.goto(`${base}/facturacio?mes=2026-09`);
      const preview = page.locator(".billing-preview");
      await expect(preview).toBeVisible();
      await expect(preview.locator("tbody tr").first()).toBeVisible();
      await preview.locator("summary").first().click();
      await expect(preview.locator("details[open] li").first()).toBeVisible();
      await preview.evaluate((element) => { element.scrollIntoView({ block: "start" }); });
      await expect(preview.locator("tbody tr").first().getByRole("link")).toBeInViewport();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      await page.screenshot({
        path: resolve(evidence, `simulation-${testInfo.project.name}-${String(width)}-${mode}.png`),
      });
    });
  }
}

test("T-03-31 a calendar date replaces timestamp suggestions", async ({ page }) => {
  await login(page, "light");
  const loaded = page.waitForResponse(
    (response) => response.request().method() === "GET" && new URL(response.url()).pathname === "/api/v1/members",
  );
  await page.locator("#admin-navigation").getByRole("link", { name: "Abonats", exact: true }).click();
  expect((await loaded).ok()).toBe(true);
  await expect(page.getByRole("heading", { level: 1, name: /^Abonats(?: |$)/u })).toBeVisible();
  const filter = page
    .locator("details")
    .filter({ has: page.locator("summary").filter({ hasText: /^Filtre/u }) });
  await filter.locator("summary").click();
  await filter.getByLabel("Columna").selectOption("joinedAt");
  const date = filter.locator('input[type="date"]');
  await expect(date).toHaveCount(1);
  await date.fill("2026-08-12");
  await page.screenshot({ path: resolve(evidence, "census-date-1280.png") });
  await filter.getByRole("button", { name: "Afegeix el filtre" }).click();
  await expect
    .poll(() => new URL(page.url()).searchParams.getAll("filter").join(" "))
    .toContain("joinedAt:between:2026-08-11T22:00:00.000Z,2026-08-12T21:59:59.999Z");
});
