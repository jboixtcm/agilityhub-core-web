import { mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test, type Page } from "@playwright/test";

const baseUrl = "http://127.0.0.1:4174";
const captureTask = process.env.E2E_CAPTURE_TASK ?? "";
const evidenceDirectory = resolve(
  import.meta.dirname,
  "../../../roadmap/evidence",
  captureTask === "" ? "E11-W08" : captureTask,
);
const fixture = (name: string): unknown =>
  JSON.parse(
    readFileSync(
      resolve(import.meta.dirname, "../../../packages/api-client/src/mocks/fixtures", name),
      "utf8",
    ),
  );
const brandingCanic = fixture("branding-canic.json");
const brandingProduct = fixture("branding-product.json");
// D6's September run (its remittance asks for 01/09): the collection date itself (E147, E156).
const collectionDateNow = new Date("2026-09-01T10:00:00+02:00");
// D10's month (club-local 05/10/2026).
const recordNow = new Date("2026-10-05T10:00:00+02:00");
const REFUSAL = "Aquest accés és només per a l'equip AgilityHub.";

test.beforeAll(() => {
  mkdirSync(evidenceDirectory, { recursive: true });
});

test.afterEach(async ({ page }, testInfo) => {
  if (testInfo.status !== testInfo.expectedStatus) {
    const name = testInfo.title.replace(/[^\w-]+/gu, "-").slice(0, 80);
    await page.screenshot({
      fullPage: true,
      path: resolve(evidenceDirectory, `debug-${name}.png`),
    });
  }
});

/** The mock world of a host: its scenario and the branding `/branding` answers there. */
async function prepare(page: Page, scenario: string, branding: unknown) {
  await page.addInitScript(
    ({ cachedBranding, mockScenario }) => {
      localStorage.setItem("agilityhub.locale", "ca");
      localStorage.setItem("agilityhub.mockScenario", mockScenario);
      localStorage.setItem(`agilityhub.branding:${location.host}`, JSON.stringify(cachedBranding));
    },
    { cachedBranding: branding, mockScenario: scenario },
  );
}

async function submitPassword(page: Page, email: string) {
  await page.getByLabel("Correu electrònic").fill(email);
  await page.getByRole("button", { name: "Tinc contrasenya" }).click();
  await page.getByLabel("Contrasenya").fill("secret-password");
  const token = page.waitForRequest(
    (request) =>
      new URL(request.url()).pathname === "/oauth2/token" &&
      new URLSearchParams(request.postData() ?? "").get("grant_type") === "password",
  );
  await page.getByRole("button", { exact: true, name: "ENTRA" }).click();
  return new URLSearchParams((await token).postData() ?? "");
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

test.describe("E11-W08 step 2 (S17 §2 «Entrada», S01 R-01-02, ruling E157): the console on the product host", () => {
  test.use({ viewport: { height: 900, width: 1280 } });

  test("an AGILITYHUB_ADMIN signs in with client_id clubs-admin and lands on D19, without a club", async ({
    page,
  }) => {
    await prepare(page, "platform", brandingProduct);
    await page.goto(`${baseUrl}/entrar`);
    const form = await submitPassword(page, "pol.ferrer@example.test");
    expect(form.get("client_id")).toBe("clubs-admin");
    await page.waitForURL("**/consola/clubs");
    await expect(page.getByRole("heading", { level: 1, name: "Consola de clubs" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Tauler" })).toHaveCount(0);
    await shot(page, "20-console-product-host-1280.png");
  });

  test("403 PLATFORM_ONLY: an account without the platform role is told so on /entrar", async ({
    page,
  }) => {
    await prepare(page, "platformRefused", brandingProduct);
    await page.goto(`${baseUrl}/entrar`);
    await submitPassword(page, "aina.serra@example.test");
    await expect(page.getByRole("alert")).toHaveText(REFUSAL);
    await expect(page).toHaveURL(`${baseUrl}/entrar`);
    await shot(page, "21-console-platform-only-1280.png");
  });

  test("the magic link /activacio?t= opens the console and leaves the address without the token", async ({
    page,
  }) => {
    await prepare(page, "platform", brandingProduct);
    await page.goto(`${baseUrl}/activacio?t=mock-magic-token`);
    await page.waitForURL("**/consola/clubs");
    await expect(page.getByRole("heading", { level: 1, name: "Consola de clubs" })).toBeVisible();
  });
});

for (const viewport of [
  { height: 900, width: 1280 },
  { height: 812, width: 375 },
] as const) {
  const width = String(viewport.width);
  test.describe(`E11-W08 D6 and D10 (${width} px)`, () => {
    test.use({ viewport });

    async function signInAdmin(page: Page, now: Date) {
      await page.clock.setFixedTime(now);
      await prepare(page, "admin", brandingCanic);
      await page.goto(`${baseUrl}/entrar`);
      await submitPassword(page, "admin@example.test");
      await page.waitForURL("**/tauler");
    }

    test(`step 3 (R-12-14, E156): on 01/09 the rollback asks for FITXER_NO_ENVIAT and sends it (${width} px)`, async ({
      page,
    }) => {
      await signInAdmin(page, collectionDateNow);
      await page.goto(`${baseUrl}/facturacio?mes=2026-09`);
      await page.getByRole("button", { name: "Retrocedeix la remesa" }).click();
      const dialog = page.getByRole("dialog", { name: "Retrocedeix la remesa · Setembre 2026" });
      await expect(dialog.getByText("Només si el fitxer no s'ha enviat mai al banc")).toBeVisible();
      await dialog.getByLabel("Escriu FITXER_NO_ENVIAT per confirmar-ho").fill("FITXER_NO_ENVIAT");
      await dialog.getByLabel("Motiu").fill("El fitxer no es va pujar al banc");
      await shot(page, `22-D6-rollback-file-not-sent-${width}.png`);
      const rollback = page.waitForRequest(
        (request) => request.method() === "POST" && request.url().endsWith("/rollback"),
      );
      await dialog.getByRole("button", { name: "Retrocedeix" }).click();
      expect((await rollback).postDataJSON()).toEqual({
        confirmation: "FITXER_NO_ENVIAT",
        reason: "El fitxer no es va pujar al banc",
      });
      await expect(page.getByText("168 rebuts anul·lats")).toBeVisible();
    });

    test(`E164 (c): D10 reads «Proper rebut» once, in «Dades i pagament» (${width} px)`, async ({
      page,
    }) => {
      await signInAdmin(page, recordNow);
      await page.goto(`${baseUrl}/abonats/member-laura`);
      const row = page
        .locator(".census-record__data-row")
        .filter({ has: page.locator("dt", { hasText: "Proper rebut" }) });
      await expect(row).toContainText("01/09/2026 · 90,00");
      await expect(page.getByText("Proper rebut", { exact: true })).toHaveCount(1);
      await row.scrollIntoViewIfNeeded();
      await shot(page, `23-D10-next-invoice-row-${width}.png`);
    });
  });
}
