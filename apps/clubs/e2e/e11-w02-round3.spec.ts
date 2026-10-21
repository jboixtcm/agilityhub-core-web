import { mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test, type Page } from "@playwright/test";

const baseUrl = "http://127.0.0.1:4173";
const evidenceDirectory = resolve(import.meta.dirname, "../../../roadmap/evidence/E11-W02");
const brandingCanic: unknown = JSON.parse(
  readFileSync(
    resolve(
      import.meta.dirname,
      "../../../packages/api-client/src/mocks/fixtures/branding-canic.json",
    ),
    "utf8",
  ),
);
// The S09 mock world's instant (`TRAINING_MOCK_NOW`): Monday 3 August 2026, 7:10, Europe/Madrid.
const trainingNow = new Date("2026-08-03T07:10:00+02:00");
const WIDTHS = [375, 1280] as const;

test.beforeAll(() => {
  mkdirSync(evidenceDirectory, { recursive: true });
});

async function login(page: Page, scenario: string, landing: string) {
  await page.clock.setFixedTime(trainingNow);
  await page.addInitScript(
    ({ cachedBranding, mockScenario }) => {
      localStorage.setItem("agilityhub.locale", "ca");
      localStorage.setItem("agilityhub.mockScenario", mockScenario);
      localStorage.setItem(`agilityhub.branding:${location.host}`, JSON.stringify(cachedBranding));
    },
    { cachedBranding: brandingCanic, mockScenario: scenario },
  );
  await page.goto(`${baseUrl}/entrar`);
  await page.getByLabel("Correu electrònic").fill("laura@example.test");
  await page.getByLabel("Contrasenya").fill("secret-password");
  await page.getByRole("button", { exact: true, name: "ENTRA" }).click();
  await page.waitForURL(`**${landing}`);
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

test.describe("E11-W02 round 3 (INC-44): «18:50 classe» from `SlotCell.classStartsAtLocal`", () => {
  for (const width of WIDTHS) {
    test(`08 at ${String(width)} px: the 18:30 and 19:00 rows the 18:50 classes take read «18:50 classe»`, async ({
      page,
    }) => {
      await page.setViewportSize({ height: 812, width });
      await login(page, "member", "/inici");
      await page.goto(`${baseUrl}/entrenaments`);
      const afternoon = page.getByRole("group", { name: "Tarda" });
      await expect(afternoon.getByRole("button", { name: "18:30, 18:50 classe" })).toBeDisabled();
      await expect(afternoon.getByRole("button", { name: "19:00, 18:50 classe" })).toBeDisabled();
      await afternoon.getByRole("button", { name: "18:30, 18:50 classe" }).scrollIntoViewIfNeeded();
      await shot(page, `r3-08-entrenaments-classe-${String(width)}.png`);
    });

    test(`24 at ${String(width)} px: Central's 18:50 class reads «18:50 classe» with its group`, async ({
      page,
    }) => {
      await page.setViewportSize({ height: 812, width });
      await login(page, "instructor", "/instructor/dia");
      await page.goto(`${baseUrl}/instructor/pistes/ring-central/reservar`);
      await page.getByRole("combobox", { name: "Dia" }).selectOption("2026-08-03");
      await page.getByRole("combobox", { name: "Franja" }).selectOption("afternoon");
      const grid = page.getByRole("group", { name: "Hores de la franja" });
      const lesson = grid.getByRole("button", { name: "19:00, 18:50 classe" });
      await expect(lesson).toBeDisabled();
      await expect(lesson).toContainText("B+C");
      await shot(page, `r3-24-reservar-pista-classe-${String(width)}.png`);
    });
  }
});
