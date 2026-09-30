import { mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test, type Page } from "@playwright/test";

const baseUrl = "http://127.0.0.1:4173";
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
// The S10 follow-up world is drawn at Monday 3 August 2026, 8:50 (Europe/Madrid).
const followupNow = new Date("2026-08-03T08:50:00+02:00");

test.use({ viewport: { height: 812, width: 375 } });

test.beforeAll(() => {
  mkdirSync(evidenceDirectory, { recursive: true });
});

async function prepare(page: Page, scenario: string) {
  await page.clock.setFixedTime(followupNow);
  await page.addInitScript(
    ({ cachedBranding, mockScenario }) => {
      localStorage.setItem("agilityhub.locale", "ca");
      localStorage.setItem("agilityhub.mockScenario", mockScenario);
      localStorage.setItem(`agilityhub.branding:${location.host}`, JSON.stringify(cachedBranding));
    },
    { cachedBranding: brandingCanic, mockScenario: scenario },
  );
}

/** Signs the member in (03 is the landing page) and opens 25 from 03's history link. */
async function openHistory(page: Page, scenario: string) {
  await prepare(page, scenario);
  await page.goto(`${baseUrl}/entrar`);
  await page.getByLabel("Correu electrònic").fill("laura@example.test");
  await page.getByLabel("Contrasenya").fill("secret-password");
  await page.getByRole("button", { exact: true, name: "ENTRA" }).click();
  await page.waitForURL("**/inici");
  await page.goto(`${baseUrl}/historic`);
  await expect(page.getByRole("heading", { level: 1, name: "Històric" })).toBeVisible();
}

function rows(page: Page) {
  return page.locator(".history-row");
}

// Icons are `<use>` references to the external sprite: a capture waits until every rendered icon
// has a box, as the other specs do.
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

test.describe("E6-W02 T-10-31 screen 25 «Històric» against MSW", () => {
  test("mockup 25: «Tots» by default, the group dog's chip, the type chips and the seven rows with their badges and lines", async ({
    page,
  }) => {
    await openHistory(page, "member");
    const dogs = page.getByRole("group", { name: "Gossos" });
    await expect(dogs.getByRole("button", { name: "Tots" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(dogs.getByRole("button", { name: "Toby · B (Joan Antoni)" })).toBeVisible();
    await expect(page.getByRole("group", { name: "Tipus" }).getByRole("button")).toHaveText([
      "Tot",
      "Classes",
      "Entrenaments",
      "Activitats",
    ]);
    await expect(page.getByText("Darrers 2 mesos, del més recent al més antic")).toBeVisible();
    await expect(rows(page)).toHaveCount(7);
    await expect(rows(page).nth(2)).toContainText("Classe B+C · amb Duna");
    await expect(rows(page).nth(2)).toContainText("anul·lada tard");
    await expect(rows(page).nth(2)).toContainText(
      "Per tu, el 21/07 a les 19:10 · compta com a feta",
    );
    await expect(rows(page).nth(3)).toContainText("«Pluja forta: pistes tancades»");
    await expect(rows(page).nth(4)).toContainText("Sense avís previ · compta com a feta");
    await expect(rows(page).nth(6)).toContainText("Per tu, dins termini · no compta");
    // «Inici» stays lit (mockup 25), and nothing overflows at 375 px.
    await expect(page.getByRole("link", { name: "Inici" })).toHaveAttribute("aria-current", "page");
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      375,
    );
    await shot(page, "25-historic-375.png");

    await page.getByRole("button", { name: "Entrenaments" }).click();
    await expect(page).toHaveURL(/\?tipus=TRAINING$/u);
    await expect(rows(page)).toHaveCount(1);
    await expect(rows(page).first()).toContainText("Entrenament · amb Rock");
  });

  test("a member with a single dog: no chips and no « · amb {gos}»", async ({ page }) => {
    await openHistory(page, "historySingleDog");
    await expect(rows(page).first()).toContainText("Classe B+C");
    await expect(page.getByRole("group", { name: "Gossos" })).toHaveCount(0);
    await expect(page.locator(".history-row", { hasText: " · amb " })).toHaveCount(0);
    await shot(page, "25-un-gos-375.png");
  });

  test("nothing in the window yet: «Encara no hi ha res a l'històric»", async ({ page }) => {
    await openHistory(page, "historyEmpty");
    await expect(page.getByText("Encara no hi ha res a l'històric")).toBeVisible();
    await shot(page, "25-buit-375.png");
  });

  test("impersonated: the banner stays over 25 and the rows are the member's", async ({ page }) => {
    await prepare(page, "impersonated");
    // E4-W16 step 1 (E47): the one-time code first, then the tab keeps the impersonated session.
    await page.goto(`${baseUrl}/entrar?handoff=mock-impersonation-handoff-e2e`);
    await page.waitForURL((url) => url.pathname === "/inici");
    await page.goto(`${baseUrl}/historic`);
    await expect(page.getByText("Estàs veient l'app com Laura Serra Vidal")).toBeVisible();
    await expect(rows(page)).toHaveCount(7);
  });
});
