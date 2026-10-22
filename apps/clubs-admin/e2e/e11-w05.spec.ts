import { mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test, type Page } from "@playwright/test";

const baseUrl = "http://127.0.0.1:4174";
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
// D4's mockup day (Wednesday 12 August 2026, after the review) and the S09 world's instant (Monday
// 3 August, 7:10, `TRAINING_MOCK_NOW`), both in Madrid.
const calendarNow = new Date("2026-08-12T10:00:00+02:00");
const trainingNow = new Date("2026-08-03T07:10:00+02:00");
const viewports = [
  { height: 900, width: 1280 },
  { height: 812, width: 375 },
] as const;

test.beforeAll(() => {
  mkdirSync(evidenceDirectory, { recursive: true });
});

async function signIn(page: Page, scenario: string, now: Date) {
  await page.clock.setFixedTime(now);
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
  // The shell is drawn once this document has started the mock worker, which answers its fetches.
  await expect(page.locator('a[href="/calendari"]').first()).toBeVisible();
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

/** Opens an address of the back office in place (its router), keeping the mock's state. */
async function openInPlace(page: Page, path: string) {
  await page.evaluate((target) => {
    window.history.pushState(null, "", target);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }, path);
  // A screen may then write its own query (D4's week): the address's path is the check.
  const pathname = new URL(path, baseUrl).pathname;
  await page.waitForURL((url) => url.pathname === pathname);
}

for (const viewport of viewports) {
  const width = String(viewport.width);
  test.describe(`E11-W05: the back office (${width} px)`, () => {
    test.use({ viewport });

    test(`E11-W05 step 3 (A40.1): D16's RING_HAS_BOOKINGS confirmation lists the live trainings (${width} px)`, async ({
      page,
    }) => {
      await signIn(page, "admin", trainingNow);
      await page.goto(`${baseUrl}/pistes`);
      await page.getByRole("button", { name: "Edita Central" }).click();
      const form = page.getByRole("dialog", { name: "Edita la pista Central" });
      await form.getByRole("switch", { name: "Reservable per entrenaments" }).click();
      await form.getByRole("button", { name: "DESA" }).click();
      const confirm = page.getByRole("dialog", { name: "Aquesta pista té reserves d'entrenament" });
      await expect(confirm.getByRole("listitem")).toHaveText([
        "Sergio + Thai · dl 3 8:30",
        "Pau + Blat · dl 3 9:00",
        "Marc + Chun-li · dl 3 16:30",
      ]);
      await expect(
        confirm.getByRole("button", { name: "Anul·la les reserves i desa" }),
      ).toBeVisible();
      await shot(page, `50-D16-ring-bookings-${width}.png`);
    });

    test(`E11-W05 step 2 (R-06-13): D4 under an 08:00 review reads «revisió de les 8:00» (${width} px)`, async ({
      page,
    }) => {
      await signIn(page, "admin", calendarNow);
      // The club moves its review to 08:00 (D11's parameter), then opens D4 in place.
      await page.evaluate(async () => {
        const url = "/api/v1/parameters/classes.riskReviewTime";
        const current = (await (await fetch(url)).json()) as { version: number };
        const saved = await fetch(url, {
          body: JSON.stringify({ value: "08:00", version: current.version }),
          headers: { "Content-Type": "application/json" },
          method: "PUT",
        });
        if (!saved.ok) throw new Error(`PUT ${url} → ${String(saved.status)}`);
      });
      await openInPlace(page, "/calendari");
      const cell = page.getByRole("button", {
        name: /^dc 12 9:30 · Cadells · .*revisió de les 8:00/u,
      });
      await expect(cell).toBeVisible();
      await expect(page.getByText(/revisió de les 7:30/u)).toHaveCount(0);
      await cell.click();
      await expect(page.getByRole("region", { name: /^Classe seleccionada/u })).toBeVisible();
      await shot(page, `50-D4-review-0800-${width}.png`);
    });

    test(`E11-W05 step 5 (a, d): a back-office chunk that cannot load shows the error state inside the shell (${width} px)`, async ({
      page,
    }) => {
      await signIn(page, "admin", calendarNow);
      // The deploy removed the courses chunk (the dev server's module here; `CoursesRoute-*.js` in a
      // build); this tab already reloaded once for it (`reloadOnce`).
      for (const pattern of ["**/src/courses/CoursesRoute.tsx*", "**/assets/CoursesRoute-*.js"]) {
        await page.context().route(pattern, (route) => route.abort("failed"));
        await page.route(pattern, (route) => route.abort("failed"));
      }
      await page.evaluate(() => {
        sessionStorage.setItem("agilityhub.chunkReloadAt", String(Date.now()));
      });
      await openInPlace(page, "/recorreguts");
      await expect(
        page.getByText("L'aplicació s'ha actualitzat. Torna a carregar-la."),
      ).toBeVisible();
      await expect(page.getByRole("button", { name: "Torna a carregar" })).toBeVisible();
      await shot(page, `50-chunk-failure-${width}.png`);
    });

    test(`E11-W05 step 5 (f): D5 reads a channel with no label as its type (${width} px)`, async ({
      page,
    }) => {
      await signIn(page, "adminUnlabelledChannel", calendarNow);
      await openInPlace(page, "/abonats?size=100");
      await expect(page.getByRole("heading", { name: "Abonats" })).toBeVisible();
      // «Columnes» → «Pagament» (not among D5's default columns).
      const columns = page.locator("summary").filter({ hasText: "Columnes" });
      await columns.click();
      const payment = page.getByRole("checkbox", { name: "Pagament" });
      if (!(await payment.isChecked())) await payment.click();
      await columns.click();
      // Anna pays by hand: her method's channel («CHEQUE») has no label, so it reads the type's.
      await expect(
        page.locator('a[href="/abonats/member-anna"]').filter({ hasText: "Efectiu" }),
      ).toBeVisible();
      await expect(page.getByText(/paymentChannel|CHEQUE/u)).toHaveCount(0);
      await shot(page, `50-D5-unlabelled-channel-${width}.png`);
    });
  });
}
