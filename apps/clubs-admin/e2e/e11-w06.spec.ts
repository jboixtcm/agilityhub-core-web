import { mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test, type Page } from "@playwright/test";

const baseUrl = "http://127.0.0.1:4174";
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
// The billing mock world's instant (`BILLING_MOCK_NOW`).
const billingNow = new Date("2026-08-26T08:00:00Z");
const signupMemberId = "42000000-0000-4000-8000-000000000001";

test.use({ viewport: { height: 900, width: 1280 } });

test.beforeAll(() => {
  mkdirSync(evidenceDirectory, { recursive: true });
});

async function signIn(page: Page, scenario: string) {
  await page.clock.setFixedTime(billingNow);
  await page.addInitScript(
    ({ cachedBranding, mockScenario }) => {
      localStorage.setItem("agilityhub.locale", "ca");
      localStorage.setItem("agilityhub.mockScenario", mockScenario);
      localStorage.setItem(`agilityhub.branding:${location.host}`, JSON.stringify(cachedBranding));
    },
    { cachedBranding: brandingCanic, mockScenario: scenario },
  );
  await page.goto(`${baseUrl}/entrar`);
  await page.getByLabel("Correu electrònic").fill("admin@example.test");
  await page.getByRole("button", { name: "Tinc contrasenya" }).click();
  await page.getByLabel("Contrasenya").fill("secret-password");
  await page.getByRole("button", { exact: true, name: "ENTRA" }).click();
  await page.waitForURL("**/tauler");
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

test.describe("E11-W06: the audit's fixes on the back office (1280 px)", () => {
  test("E11-W06 W1: D2's link opened signed out survives the password login", async ({ page }) => {
    await page.clock.setFixedTime(billingNow);
    await page.addInitScript(
      ({ cachedBranding }) => {
        localStorage.setItem("agilityhub.locale", "ca");
        // No session until the sign-in: the restore answers `400 REFRESH_EXPIRED`.
        localStorage.setItem("agilityhub.mockScenario", "adminSignedOut");
        localStorage.setItem(`agilityhub.branding:${location.host}`, JSON.stringify(cachedBranding));
      },
      { cachedBranding: brandingCanic },
    );
    await page.goto(`${baseUrl}/preinscripcions/${signupMemberId}`);
    await expect(page).toHaveURL(
      `${baseUrl}/entrar?next=%2Fpreinscripcions%2F${signupMemberId}`,
    );
    await page.getByLabel("Correu electrònic").fill("admin@example.test");
    await page.getByRole("button", { name: "Tinc contrasenya" }).click();
    await page.getByLabel("Contrasenya").fill("secret-password");
    await page.getByRole("button", { exact: true, name: "ENTRA" }).click();
    await expect(page).toHaveURL(`${baseUrl}/preinscripcions/${signupMemberId}`);
    await expect(page.getByRole("combobox", { name: "Modalitat i tarifa" })).toBeVisible();
  });

  test("E11-W06 W4 (R-01-06): the user menu opens with the account and «Tanca la sessió»", async ({
    page,
  }) => {
    // A revoked session stays gone: 01's restore after the sign-out answers `400 REFRESH_EXPIRED`.
    await signIn(page, "adminSignedOut");
    const button = page.getByRole("button", { name: "Menú d’usuari" });
    await button.click();
    const menu = page.getByRole("menu", { name: "Menú d’usuari" });
    await expect(menu.getByRole("menuitem", { name: "Tanca la sessió" })).toBeVisible();
    await shot(page, "50-user-menu-1280.png");
    await page.keyboard.press("Escape");
    await expect(menu).toHaveCount(0);
    await expect(button).toBeFocused();
    await button.click();
    const revoked = page.waitForRequest(
      (request) => request.method() === "POST" && new URL(request.url()).pathname === "/oauth2/revoke",
    );
    await page.getByRole("menuitem", { name: "Tanca la sessió" }).click();
    await revoked;
    // The sign-out's full load of 01 (the session's own redirect may start it first).
    await expect(page).toHaveURL(`${baseUrl}/entrar`);
    await expect(page.getByLabel("Correu electrònic")).toBeVisible();
  });

  test("E11-W06 W7 (CONVENCIONS_I18N §1): D10's dog block with its dates in the club's zone", async ({
    page,
  }) => {
    await signIn(page, "admin");
    await page.goto(`${baseUrl}/gossos/dog-duna`);
    await expect(page.getByRole("heading", { name: "Duna" })).toBeVisible();
    await expect(page.locator(".census-record__level-current")).toContainText(/\d{2}\/\d{2}\/\d{4}/u);
    await shot(page, "50-D10-dog-dates-1280.png");
  });

  test("E11-W06 W9 (S12 §6): D6's simulation alert names the plan and links D8 on 409 PRICE_OVERLAP", async ({
    page,
  }) => {
    await signIn(page, "billingPriceOverlap");
    await page.goto(`${baseUrl}/facturacio?mes=2026-10`);
    await page.getByRole("button", { name: "1 · SIMULA EL MES" }).first().click();
    const alert = page.getByRole("alert").filter({ hasText: "té dos preus vigents" });
    await expect(alert).toContainText("La modalitat Abonat té dos preus vigents per a Quota mensual.");
    await expect(alert.getByRole("link", { name: "Modalitats i tarifes" })).toHaveAttribute(
      "href",
      "/modalitats",
    );
    await shot(page, "50-D6-price-overlap-1280.png");
  });

  test("E11-W06 W10 (R-04-06): D10's write on a record waiting for its readmission points to D2", async ({
    page,
  }) => {
    await signIn(page, "adminMemberReadmissionPending");
    await page.goto(`${baseUrl}/abonats/member-laura`);
    await expect(page.getByRole("heading", { name: "Laura Serra Vidal" })).toBeVisible();
    await page.getByRole("button", { name: "Bloqueja les reserves" }).click();
    const dialog = page.getByRole("dialog", { name: "Bloqueja les reserves" });
    await dialog.getByLabel("Motiu del bloqueig").fill("Rebut pendent");
    await dialog.getByRole("button", { name: "Bloqueja les reserves" }).click();
    const alert = dialog.getByRole("alert");
    await expect(alert).toContainText("Aquest abonat té una readmissió pendent");
    await expect(alert.getByRole("link", { name: "Preinscripcions pendents" })).toBeVisible();
    await shot(page, "50-D10-readmission-pending-1280.png");
  });

  test("E11-W06 W11 (R-04-19): D2 without a plan proposal offers no plan and keeps the choice empty", async ({
    page,
  }) => {
    await signIn(page, "adminSignupReviewNoPlanProposal");
    await page.goto(`${baseUrl}/preinscripcions/${signupMemberId}`);
    const plan = page.getByRole("combobox", { name: "Modalitat i tarifa" });
    await expect(plan).toHaveValue("");
    await expect(plan.locator("option[value*='null'], option[value*='undefined']")).toHaveCount(0);
    await shot(page, "50-D2-no-plan-proposal-1280.png");
  });
});
