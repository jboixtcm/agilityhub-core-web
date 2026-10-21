import { mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test, type Page } from "@playwright/test";

// E11-W04 step 6 (ruling E137): the backoffice screens that show es action labels this task moved
// to the infinitive, in es at 375 and 1280 px against MSW. A capture script, not a suite: it runs
// only when `E2E_CAPTURE_TASK` names the folder, so `pnpm e2e` and CI skip it and never rewrite
// the captures:
//   pnpm e2e:docker E11-W04 --capture-task=E11-W04 --grep=E11-W04 --pass-with-no-tests
const captureTask = process.env.E2E_CAPTURE_TASK ?? "";
test.skip(captureTask === "", "capture only: set E2E_CAPTURE_TASK (--capture-task=<ID>)");
const evidenceDirectory = resolve(import.meta.dirname, `../../../roadmap/evidence/${captureTask}`);
const baseUrl = "http://127.0.0.1:4174";
const brandingCanic: unknown = JSON.parse(
  readFileSync(
    resolve(
      import.meta.dirname,
      "../../../packages/api-client/src/mocks/fixtures/branding-canic.json",
    ),
    "utf8",
  ),
);

/** Signs in, in es: D1 for an ADMIN, D12 for an INSTRUCTOR. */
async function signInEs(page: Page, scenario: "admin" | "instructor", now?: Date): Promise<void> {
  if (now !== undefined) await page.clock.setFixedTime(now);
  await page.addInitScript(
    ({ cachedBranding, mockScenario }) => {
      localStorage.setItem("agilityhub.locale", "es");
      localStorage.setItem("agilityhub.mockScenario", mockScenario);
      localStorage.setItem(`agilityhub.branding:${location.host}`, JSON.stringify(cachedBranding));
    },
    { cachedBranding: brandingCanic, mockScenario: scenario },
  );
  await page.goto(`${baseUrl}/entrar`);
  await page.getByLabel("Correo electrónico").fill(`${scenario}@example.test`);
  await page.getByRole("button", { name: "Tengo contraseña" }).click();
  await page.getByLabel("Contraseña").fill("secret-password");
  await page.getByRole("button", { exact: true, name: "ENTRAR" }).click();
  await page.waitForURL(/\/(tauler|agenda)$/u);
}

// Icons are `<use>` references to the external sprite: a capture waits for every icon's box.
async function shot(page: Page, name: string, width: number): Promise<void> {
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
  await page.evaluate(async () => document.fonts.ready);
  await page.screenshot({
    fullPage: true,
    path: resolve(evidenceDirectory, `50-${name}-es-${String(width)}.png`),
  });
}

test.beforeAll(() => {
  mkdirSync(evidenceDirectory, { recursive: true });
});

for (const width of [375, 1280] as const) {
  test.describe(`E11-W04 es action labels · backoffice · ${String(width)} px`, () => {
    test.use({ viewport: { height: 900, width } });

    test(`E11-W04 D12's setup of Muntanya: «Abrir el recorrido» (${String(width)})`, async ({
      page,
    }) => {
      // The D12 world (`AGENDA_MOCK_NOW`): Monday 10 August 2026, 19:30 club-local.
      await signInEs(page, "instructor", new Date("2026-08-10T19:30:00+02:00"));
      await page.goto(`${baseUrl}/agenda`);
      await page
        .getByRole("list", { name: "Recorridos montados en las pistas" })
        .getByRole("button", { name: /^Muntanya:/u })
        .click();
      const modal = page.getByRole("dialog", { name: "Muntanya" });
      await expect(modal.getByRole("button", { name: "Abrir el recorrido" })).toBeVisible();
      await shot(page, "d12-abrir-recorrido", width);
    });

    test(`E11-W04 D10's inactivity drawer: «Modificar los meses» (${String(width)})`, async ({
      page,
    }) => {
      await signInEs(page, "admin");
      await page.goto(`${baseUrl}/abonats/member-laura?calaix=inactivitat`);
      const drawer = page.getByRole("dialog", { name: "Inactividad" });
      await drawer.getByRole("button", { exact: true, name: "Aprobar" }).click();
      const approval = page.getByRole("dialog", { name: "Aprobar el periodo" });
      await approval.getByRole("button", { exact: true, name: "Aprobar" }).click();
      await expect(approval).toBeHidden();
      await expect(drawer.getByRole("button", { name: "Modificar los meses" })).toBeVisible();
      await shot(page, "d10-inactividad", width);

      await drawer.getByRole("button", { name: "Modificar los meses" }).click();
      await expect(drawer.getByRole("heading", { name: "Modificar los meses" })).toBeVisible();
      await shot(page, "d10-inactividad-modificar", width);
    });
  });
}
