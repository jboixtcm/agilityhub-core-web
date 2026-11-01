import { mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test, type Page } from "@playwright/test";

const baseUrl = "http://127.0.0.1:4173";
const captureTask = process.env.E2E_CAPTURE_TASK ?? "";
const evidenceDirectory = resolve(
  import.meta.dirname,
  "../../../roadmap/evidence",
  captureTask === "" ? "E11-W06" : captureTask,
);
const brandingCanic: unknown = JSON.parse(
  readFileSync(
    resolve(
      import.meta.dirname,
      "../../../packages/api-client/src/mocks/fixtures/branding-canic.json",
    ),
    "utf8",
  ),
);
// The booking mock world's instant (`BOOKING_MOCK_NOW`): Sunday 2 August 2026, 20:30, Madrid.
const bookingNow = new Date("2026-08-02T20:30:00+02:00");

test.use({ viewport: { height: 812, width: 375 } });

test.beforeAll(() => {
  mkdirSync(evidenceDirectory, { recursive: true });
});

async function prepare(page: Page, scenario: string) {
  await page.clock.setFixedTime(bookingNow);
  await page.addInitScript(
    ({ cachedBranding, mockScenario }) => {
      localStorage.setItem("agilityhub.locale", "ca");
      localStorage.setItem("agilityhub.mockScenario", mockScenario);
      localStorage.setItem(`agilityhub.branding:${location.host}`, JSON.stringify(cachedBranding));
    },
    { cachedBranding: brandingCanic, mockScenario: scenario },
  );
}

async function passwordLogin(page: Page, email: string) {
  await page.getByLabel("Correu electrònic").fill(email);
  await page.getByLabel("Contrasenya", { exact: true }).fill("secret-password");
  await page.getByRole("button", { exact: true, name: "ENTRA" }).click();
}

// Icons are `<use>` references to the external sprite: a capture waits until each one has a box.
async function shot(page: Page, name: string) {
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
  await page.screenshot({ fullPage: true, path: resolve(evidenceDirectory, name) });
}

test.describe("E11-W06: the audit's fixes on the members' app (375 px)", () => {
  test("E11-W06 W1 (T-11-11, R-11-11): N-15's /espera/:id opened signed out survives the sign-in", async ({
    page,
  }) => {
    // The device has no session (the restore answers `400 REFRESH_EXPIRED`) until the sign-in.
    await prepare(page, "memberSignedOut");
    await page.goto(`${baseUrl}/espera/waitlist-duna-thu6`);
    await page.waitForURL(/\/entrar\?next=%2Fespera%2Fwaitlist-duna-thu6$/u);
    await passwordLogin(page, "laura@example.test");
    await page.waitForURL("**/espera/waitlist-duna-thu6");
    await expect(page.getByText("Classe C i sup. · amb la Duna")).toBeVisible();
    await shot(page, "50-espera-after-sign-in-375.png");
  });

  test("2026-11-01: a remembered ADMIN with INSTRUCTOR enters the app as instructor", async ({
    page,
  }) => {
    const unexpected: string[] = [];
    page.on("request", (request) => {
      if (/\/api\/v1\/me\/(home|bookable-classes)|\/auth\/handoff/u.test(request.url()))
        unexpected.push(request.url());
    });
    await prepare(page, "admin");
    await page.goto(`${baseUrl}/entrar`);
    await passwordLogin(page, "aina.serra@example.test");
    await page.waitForURL("**/instructor/dia");
    await expect(page.getByRole("link", { name: "El meu dia", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Alumnes", exact: true })).toBeVisible();
    await shot(page, "app-remembered-admin-instructor-375.png");
    expect(new URL(page.url()).origin).toBe(baseUrl);
    expect(unexpected).toEqual([]);
  });

  test("E11-W06 W8: 30's failed read offers a retry that reads again", async ({ page }) => {
    await prepare(page, "memberClubPagesUnavailable");
    await page.goto(`${baseUrl}/entrar`);
    await passwordLogin(page, "laura@example.test");
    await page.waitForURL("**/inici");
    await page.goto(`${baseUrl}/info`);
    const alert = page.getByRole("alert");
    await expect(alert).toContainText("No s'ha pogut carregar la informació.");
    await shot(page, "50-30-info-retry-375.png");
    // The api answers again: only the retry's new read can replace the error with the tabs.
    await page.evaluate(() => {
      localStorage.setItem("agilityhub.mockClubPagesBack", "1");
    });
    await page.getByRole("button", { name: "Torna-ho a provar" }).click();
    await expect(page.getByRole("tab", { name: "FAQ" })).toBeVisible();
    await expect(alert).toHaveCount(0);
  });
});
