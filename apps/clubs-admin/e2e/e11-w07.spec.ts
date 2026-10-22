import { mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test, type Page } from "@playwright/test";

const baseUrl = "http://127.0.0.1:4174";
const captureTask = process.env.E2E_CAPTURE_TASK ?? "";
const evidenceDirectory = resolve(
  import.meta.dirname,
  "../../../roadmap/evidence",
  captureTask === "" ? "E11-W07" : captureTask,
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
// D10's month (club-local 05/10/2026); D6's September run (`BILLING_MOCK_NOW` is 26/08): the day
// before its 01/09 collection (`submissionDue`) and the collection date itself (E147).
const recordNow = new Date("2026-10-05T10:00:00+02:00");
const submissionDueNow = new Date("2026-08-31T10:00:00+02:00");
const collectionDateNow = new Date("2026-09-01T10:00:00+02:00");
const viewports = [
  { height: 900, width: 1280 },
  { height: 812, width: 375 },
] as const;

test.beforeAll(() => {
  mkdirSync(evidenceDirectory, { recursive: true });
});

async function signIn(page: Page, now: Date) {
  await page.clock.setFixedTime(now);
  await page.addInitScript(
    ({ cachedBranding }) => {
      localStorage.setItem("agilityhub.locale", "ca");
      localStorage.setItem("agilityhub.mockScenario", "admin");
      localStorage.setItem(`agilityhub.branding:${location.host}`, JSON.stringify(cachedBranding));
    },
    { cachedBranding: brandingCanic },
  );
  await page.goto(`${baseUrl}/entrar`);
  await page.getByLabel("Correu electrònic").fill("admin@example.test");
  await page.getByRole("button", { name: "Tinc contrasenya" }).click();
  await page.getByLabel("Contrasenya").fill("secret-password");
  await page.getByRole("button", { exact: true, name: "ENTRA" }).click();
  await page.waitForURL("**/tauler");
}

test.afterEach(async ({ page }, testInfo) => {
  // A failure inside the container leaves no trace on the host: its screen goes to the evidence.
  if (testInfo.status !== testInfo.expectedStatus) {
    const name = testInfo.title.replace(/[^\w-]+/gu, "-").slice(0, 80);
    await page.screenshot({
      fullPage: true,
      path: resolve(evidenceDirectory, `debug-${name}.png`),
    });
  }
});

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
  const width = String(viewport.width);
  test.describe(`E11-W07: the E11-T15 contract in the back office (${width} px)`, () => {
    test.use({ viewport });

    test(`E11-W07 step 2 (E146): D10's «Proper rebut» and its drawer PUT the date with a reason (${width} px)`, async ({
      page,
    }) => {
      await signIn(page, recordNow);
      await page.goto(`${baseUrl}/abonats/member-laura`);
      // E11-W08 E164 (c): the row of «Dades i pagament», as the mockup draws it.
      const section = page
        .locator(".census-record__data-row")
        .filter({ has: page.locator("dt", { hasText: "Proper rebut" }) });
      await expect(section).toContainText("Proper rebut");
      await expect(section).toContainText("01/09/2026");
      await section.scrollIntoViewIfNeeded();
      await shot(page, `60-D10-next-invoice-${width}.png`);

      await section.getByRole("button", { name: "Edita la data del proper rebut" }).click();
      const drawer = page.getByRole("dialog", { name: "Proper rebut" });
      const date = drawer.getByLabel("Data del proper rebut");
      await expect(date).toHaveAttribute("min", "2025-10-01");
      await expect(date).toHaveAttribute("max", "2027-10-31");
      await date.fill("2026-11-01");
      await drawer.getByLabel("Motiu").fill("Pagat fins a octubre");
      await shot(page, `61-D10-next-invoice-drawer-${width}.png`);
      const put = page.waitForRequest(
        (request) =>
          request.method() === "PUT" &&
          request.url().endsWith("/members/member-laura/next-invoice-date"),
      );
      await drawer.getByRole("button", { name: "Desa" }).click();
      expect((await put).postDataJSON()).toEqual({
        nextInvoiceDate: "2026-11-01",
        reason: "Pagat fins a octubre",
      });
      await expect(drawer).toHaveCount(0);
      await expect(section).toContainText("01/11/2026");
    });

    test(`E11-W07 step 5 (R-12-15): D6 asks to submit the GENERATED remittance, in the warning tone on 31/08 (${width} px)`, async ({
      page,
    }) => {
      await signIn(page, submissionDueNow);
      await page.goto(`${baseUrl}/facturacio?mes=2026-09`);
      const due = page.getByText("Presenta-la al banc abans del 01/09");
      await expect(due).toBeVisible();
      await expect(due).toHaveAttribute("data-tone", "warning");
      await expect(page.getByRole("button", { name: "Retrocedeix la remesa" })).toBeEnabled();
      await shot(page, `62-D6-submission-due-${width}.png`);
    });

    test(`E11-W07 step 5 (R-12-14): on 01/09 the amount asks to mark the remittance sent; the rollback asks for FITXER_NO_ENVIAT since E11-W08 (${width} px)`, async ({
      page,
    }) => {
      await signIn(page, collectionDateNow);
      await page.goto(`${baseUrl}/facturacio?mes=2026-09`);
      await expect(
        page.getByText(
          "Ja ha passat la data de cobrament: marca la remesa com a enviada o espera la resposta del banc",
        ),
      ).toBeVisible();
      await expect(page.getByRole("button", { name: "Retrocedeix la remesa" })).toBeEnabled();
      await shot(page, `63-D6-collection-date-passed-${width}.png`);
    });
  });
}
