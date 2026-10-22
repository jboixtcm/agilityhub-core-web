import { mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test, type Page } from "@playwright/test";

// E11-W04 step 6 (ruling E137): the members' app screens that show es action labels this task
// moved to the infinitive, in es at 375 and 1280 px against MSW (the course world of
// `courses-gallery.spec.ts`). A capture script, not a suite: it runs only when `E2E_CAPTURE_TASK`
// names the folder, so `pnpm e2e` and CI skip it and never rewrite the captures:
//   pnpm e2e:docker E11-W04 --capture-task=E11-W04 --grep=E11-W04 --pass-with-no-tests
const captureTask = process.env.E2E_CAPTURE_TASK ?? "";
test.skip(captureTask === "", "capture only: set E2E_CAPTURE_TASK (--capture-task=<ID>)");
const evidenceDirectory = resolve(import.meta.dirname, `../../../roadmap/evidence/${captureTask}`);
const baseUrl = "http://127.0.0.1:4173";
// The course world is drawn at Monday 3 August 2026, 7:10 club-local (courses-gallery.spec.ts).
const worldNow = new Date("2026-08-03T07:10:00+02:00");
const brandingCanic: unknown = JSON.parse(
  readFileSync(
    resolve(
      import.meta.dirname,
      "../../../packages/api-client/src/mocks/fixtures/branding-canic.json",
    ),
    "utf8",
  ),
);

/** Signs an instructor in, in es (as booking.spec.ts's `prepare(page, scenario, "es")`). */
async function loginEs(page: Page): Promise<void> {
  await page.clock.setFixedTime(worldNow);
  await page.addInitScript(
    ({ cachedBranding }) => {
      localStorage.setItem("agilityhub.locale", "es");
      // The account's own language too: the app applies it at the sign-in (E11-W06 W5).
      localStorage.setItem("agilityhub.mockAccountLocale", "es");
      localStorage.setItem("agilityhub.mockScenario", "instructor");
      localStorage.setItem(`agilityhub.branding:${location.host}`, JSON.stringify(cachedBranding));
    },
    { cachedBranding: brandingCanic },
  );
  await page.goto(`${baseUrl}/entrar`);
  await page.getByLabel("Correo electrónico").fill("laura@example.test");
  await page.getByLabel("Contraseña").fill("secret-password");
  await page.getByRole("button", { exact: true, name: "ENTRAR" }).click();
  await page.waitForURL("**/instructor/dia");
}

/** In-app navigation (the app's own `popstate`): a reload would restart the MSW world. */
async function navigate(page: Page, path: string): Promise<void> {
  await page.evaluate((next) => {
    window.history.pushState(null, "", next);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }, path);
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
  test.describe(`E11-W04 es action labels · members' app · ${String(width)} px`, () => {
    test.use({ viewport: { height: width === 375 ? 812 : 900, width } });

    test(`E11-W04 the staff viewer and «Registrar qué hay montado» in es (${String(width)})`, async ({
      page,
    }) => {
      await loginEs(page);

      // The staff viewer of Muntanya's setup: courses:viewer.register, .dismantle, .join.submit.
      await navigate(page, "/instructor/avui");
      await page.getByRole("button", { name: "Recorrido montado en Muntanya" }).click();
      await expect(page.getByRole("img", { name: /^Plano de / })).toBeVisible();
      await expect(page.getByRole("button", { name: "Registrar qué hay montado" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Marcar como desmontado" })).toBeVisible();
      await expect(page.getByRole("button", { exact: true, name: "Unirse" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Ampliar" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Reducir" })).toBeVisible();
      await shot(page, "visor-personal", width);

      // «Registrar qué hay montado» (courses:register.*): the photo, then the library.
      await navigate(page, "/instructor/pistes/ring-carretera/muntat");
      await expect(
        page.getByRole("heading", { level: 1, name: "Registrar qué hay montado" }),
      ).toBeVisible();
      await page.getByRole("button", { exact: true, name: "Jumping" }).click();
      await expect(page.getByText("Hacer una foto o elegir una")).toBeVisible();
      await expect(page.getByRole("button", { exact: true, name: "REGISTRAR" })).toBeVisible();
      await shot(page, "registrar-montado", width);

      await page.getByRole("button", { name: "Un recorrido de la biblioteca" }).click();
      await expect(page.getByRole("searchbox", { name: "Buscar un recorrido" })).toBeVisible();
      await expect(page.getByRole("button", { exact: true, name: "Buscar" })).toBeVisible();
      await shot(page, "registrar-montado-biblioteca", width);
    });
  });
}
