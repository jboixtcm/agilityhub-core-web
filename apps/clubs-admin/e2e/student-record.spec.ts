import { mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test, type Page } from "@playwright/test";

const baseUrl = "http://127.0.0.1:4174";
const evidenceDirectory = resolve(import.meta.dirname, "../../../roadmap/evidence/E6-W02");
const brandingCanic: unknown = JSON.parse(
  readFileSync(
    resolve(
      import.meta.dirname,
      "../../../packages/api-client/src/mocks/fixtures/branding-canic.json",
    ),
    "utf8",
  ),
);
// The S10 world is drawn at Monday 3 August 2026, 8:50 (Europe/Madrid): `ATTENDANCE_MOCK_NOW`.
const followupNow = new Date("2026-08-03T08:50:00+02:00");

test.use({ viewport: { height: 800, width: 1280 } });

test.beforeAll(() => {
  mkdirSync(evidenceDirectory, { recursive: true });
});

async function signIn(page: Page) {
  await page.clock.setFixedTime(followupNow);
  await page.addInitScript(
    ({ cachedBranding }) => {
      localStorage.setItem("agilityhub.locale", "ca");
      localStorage.setItem("agilityhub.mockScenario", "instructor");
      localStorage.setItem(`agilityhub.branding:${location.host}`, JSON.stringify(cachedBranding));
    },
    { cachedBranding: brandingCanic },
  );
  await page.goto(`${baseUrl}/entrar`);
  await page.getByLabel("Correu electrònic").fill("instructor@example.test");
  await page.getByRole("button", { name: "Tinc contrasenya" }).click();
  await page.getByLabel("Contrasenya").fill("secret-password");
  await page.getByRole("button", { name: "ENTRA" }).click();
  await page.waitForURL("**/tauler");
}

async function iconsPainted(page: Page) {
  await expect
    .poll(() =>
      page
        .locator("svg.ah-icon")
        .evaluateAll((icons) =>
          icons.every(
            (icon) =>
              !(icon instanceof SVGSVGElement) ||
              icon.getClientRects().length === 0 ||
              icon.getBBox().width > 0,
          ),
        ),
    )
    .toBe(true);
}

test.describe("E6-W02 T-10-28 D13 «Fitxa d'alumne» (desktop) against MSW", () => {
  test("from «Alumnes» to D13: the header, the metrics, the three blocks and the table; the manage drawer with the same editor as 26", async ({
    page,
  }) => {
    await signIn(page);
    // Exact: since E6-W03 an instructor's sidebar also has «Seguiment alumnes» (D14).
    await page.getByRole("link", { exact: true, name: "Alumnes" }).click();
    await page.waitForURL("**/alumnes");
    await page.getByPlaceholder("Cerca un alumne").fill("Duna");
    await page.getByRole("link", { name: "Laura + Duna · C" }).click();
    await page.waitForURL("**/alumnes/dog-duna");

    await expect(page.getByRole("heading", { level: 1, name: "Laura + Duna" })).toBeVisible();
    await expect(page.getByText("Nivell C · fa 8 mesos")).toBeVisible();
    await expect(page.getByText("Abonada", { exact: true })).toBeVisible();
    await expect(page.getByText("1 no presentat · 1 avisat")).toBeVisible();
    await expect(page.getByText("mitjana 30 dies")).toBeVisible();
    const tasks = page.locator(".student-record__tasks li");
    await expect(tasks).toHaveCount(3);
    await expect(tasks.nth(2)).toContainText("feta el 02-08");
    await expect(
      page.getByRole("table", { name: "5 darreres classes" }).locator("tbody tr"),
    ).toHaveCount(5);
    await iconsPainted(page);
    await page.screenshot({
      fullPage: true,
      path: resolve(evidenceDirectory, "D13-fitxa-1280.png"),
    });

    await page.getByRole("button", { name: "Gestionar tasques i notes" }).click();
    const drawer = page.getByRole("dialog", { name: "Gestionar tasques i notes" });
    await expect(drawer.getByLabel("Observacions privades")).toBeVisible();
    await expect(drawer.locator(".ah-tasks__list > .ah-task")).toHaveCount(3);
    await iconsPainted(page);
    await page.screenshot({
      fullPage: true,
      path: resolve(evidenceDirectory, "D13-tasques-calaix-1280.png"),
    });

    await drawer
      .locator(".ah-tasks__list > .ah-task")
      .nth(0)
      .getByRole("button", { name: "Marca-la com a feta" })
      .click();
    await expect(drawer.locator(".ah-tasks__list > .ah-task").nth(0)).toContainText(
      "feta per l'Estel el 03-08",
    );
    await drawer.getByRole("button", { name: "Tanca" }).click();
    // A write in the drawer shows on the record behind it (the api's counters, read again).
    await expect(page.getByText("1 pendent", { exact: true })).toBeVisible();
    await expect(page.getByText("2 fetes", { exact: true })).toBeVisible();
  });
});
