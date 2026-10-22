import { mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test, type Page } from "@playwright/test";

const baseUrl = "http://127.0.0.1:4173";
const captureTask = process.env.E2E_CAPTURE_TASK ?? "";
const evidenceDirectory = resolve(
  import.meta.dirname,
  "../../../roadmap/evidence",
  captureTask === "" ? "E11-W05" : captureTask,
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
// The S10 world's instant (`attendance.spec.ts`): Monday 3 August 2026, 8:50, Madrid.
const attendanceNow = new Date("2026-08-03T08:50:00+02:00");
const viewports = [
  { height: 812, width: 375 },
  { height: 900, width: 1280 },
] as const;

test.beforeAll(() => {
  mkdirSync(evidenceDirectory, { recursive: true });
});

async function signIn(page: Page, scenario: string, email: string, landing: string) {
  await page.clock.setFixedTime(attendanceNow);
  await page.addInitScript(
    ({ cachedBranding, mockScenario }) => {
      localStorage.setItem("agilityhub.locale", "ca");
      localStorage.setItem("agilityhub.mockScenario", mockScenario);
      localStorage.setItem(`agilityhub.branding:${location.host}`, JSON.stringify(cachedBranding));
    },
    { cachedBranding: brandingCanic, mockScenario: scenario },
  );
  await page.goto(`${baseUrl}/entrar`);
  await page.getByLabel("Correu electrònic").fill(email);
  await page.getByLabel("Contrasenya").fill("secret-password");
  await page.getByRole("button", { exact: true, name: "ENTRA" }).click();
  await page.waitForURL((url) => url.pathname === landing);
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

for (const viewport of viewports) {
  test.describe(`E11-W05: the members' app (${String(viewport.width)} px)`, () => {
    test.use({ viewport });

    test(`E11-W05 step 4 (A40.2): 28 says «Document d'identitat», and «Documento de identidad» in es (${String(viewport.width)} px)`, async ({
      page,
    }) => {
      await signIn(page, "member", "laura@example.test", "/inici");
      await page.goto(`${baseUrl}/dades`);
      await expect(page.getByRole("heading", { name: "Les meves dades" })).toBeVisible();
      await expect(page.getByText("Document d'identitat", { exact: true })).toBeVisible();
      await expect(page.getByText(/\bDNI\b/u)).toHaveCount(0);
      await shot(page, `50-28-id-document-ca-${String(viewport.width)}.png`);

      // 12's «Idioma» saves the account's language; 28 opens in place (the mock keeps it in memory).
      await page.goto(`${baseUrl}/perfil`);
      await page.getByRole("combobox", { name: "Idioma" }).selectOption("es");
      await expect(page.getByRole("heading", { name: "Mi perfil" })).toBeVisible();
      await page.locator('a[href="/dades"]').click();
      await expect(page.getByRole("heading", { name: "Mis datos" })).toBeVisible();
      await expect(page.getByText("Documento de identidad", { exact: true })).toBeVisible();
      await shot(page, `50-28-id-document-es-${String(viewport.width)}.png`);
    });

    test(`E11-W05 step 5 (b): 21 of a class nobody booked shows its empty state (${String(viewport.width)} px)`, async ({
      page,
    }) => {
      await signIn(page, "attendanceEmpty", "laura@example.test", "/instructor/dia");
      await page.goto(`${baseUrl}/instructor/classes/c1`);
      await expect(page.getByText("Encara no hi ha cap inscrit.")).toBeVisible();
      await shot(page, `50-21-empty-${String(viewport.width)}.png`);
    });
  });
}
