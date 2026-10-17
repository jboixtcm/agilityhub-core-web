import { mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test, type Page } from "@playwright/test";

// E9-W05 step 3: S16 has no mockups, so every backoffice S16 screen is captured for Josep at 375
// and 1280 px, light and dark, against MSW. The light captures draw the club's branding with the
// light fixture's palette (`agilityhub.mockTheme`, `mockThemeMode` in the mocks). A later task can
// send them elsewhere with `--capture-task=<ID>` (`E2E_CAPTURE_TASK`).
const captureTask = process.env.E2E_CAPTURE_TASK ?? "";
const evidenceDirectory = resolve(
  import.meta.dirname,
  `../../../roadmap/evidence/${captureTask === "" ? "E9-W05" : captureTask}`,
);
const baseUrl = "http://127.0.0.1:4174";

interface Theme {
  colors: Record<string, string>;
  mode: string;
  ringPalette?: string[];
}
interface CachedBranding {
  theme: Theme;
}
function fixture(name: string): CachedBranding {
  return JSON.parse(
    readFileSync(
      resolve(import.meta.dirname, `../../../packages/api-client/src/mocks/fixtures/${name}`),
      "utf8",
    ),
  ) as CachedBranding;
}
const brandingCanic = fixture("branding-canic.json");
const brandingMinim = fixture("branding-minim.json");
const smarterFixture = resolve(
  import.meta.dirname,
  "../../../packages/course-core/fixtures/smarter/jp-s-sw_993483_sadesign.txt",
);

type Mode = "dark" | "light";
const MODES: readonly Mode[] = ["light", "dark"];
const WIDTHS = [375, 1280] as const;

/** The cached branding the app paints first, already in the capture's mode (no flash). */
function cachedBranding(mode: Mode): CachedBranding {
  if (mode === brandingCanic.theme.mode) return brandingCanic;
  const palette = brandingMinim.theme;
  return {
    ...brandingCanic,
    theme: {
      ...brandingCanic.theme,
      colors: palette.colors,
      mode,
      ...(palette.ringPalette === undefined ? {} : { ringPalette: palette.ringPalette }),
    },
  };
}

async function signIn(
  page: Page,
  scenario: "admin" | "instructor",
  mode: Mode,
  now?: Date,
): Promise<void> {
  if (now !== undefined) await page.clock.setFixedTime(now);
  await page.addInitScript(
    ({ branding, mockScenario, theme }) => {
      localStorage.setItem("agilityhub.locale", "ca");
      localStorage.setItem("agilityhub.mockScenario", mockScenario);
      localStorage.setItem("agilityhub.mockTheme", theme);
      localStorage.setItem(`agilityhub.branding:${location.host}`, JSON.stringify(branding));
    },
    { branding: cachedBranding(mode), mockScenario: scenario, theme: mode },
  );
  await page.goto(`${baseUrl}/entrar`);
  await page.getByLabel("Correu electrònic").fill(`${scenario}@example.test`);
  await page.getByRole("button", { name: "Tinc contrasenya" }).click();
  await page.getByLabel("Contrasenya").fill("secret-password");
  await page.getByRole("button", { name: "ENTRA" }).click();
  await page.waitForURL(/\/(tauler|agenda)/u);
  await expect(page.locator("html")).toHaveAttribute("data-theme", mode);
}

// Icons are `<use>` references to the external sprite: a capture waits for every icon's box.
async function shot(page: Page, name: string, width: number, mode: Mode): Promise<void> {
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
  await expect(page.locator("html")).toHaveAttribute("data-theme", mode);
  await page.screenshot({
    fullPage: true,
    path: resolve(evidenceDirectory, `admin-${name}-${String(width)}-${mode}.png`),
  });
}

test.beforeAll(() => {
  mkdirSync(evidenceDirectory, { recursive: true });
});

for (const mode of MODES) {
  for (const width of WIDTHS) {
    test.describe(`E9-W05 S16 backoffice screens · ${String(width)} px · ${mode}`, () => {
      test.use({ viewport: { height: width === 375 ? 812 : 900, width } });

      test(`T-16-15 D18, the course page, the placement editor, registering, D16 and D7 (${mode}, ${String(width)})`, async ({
        page,
      }) => {
        test.setTimeout(180_000);
        await signIn(page, "admin", mode);

        await page.goto(`${baseUrl}/recorreguts`);
        await expect(
          page.getByRole("heading", { level: 1, name: "Biblioteca de recorreguts" }),
        ).toBeVisible();
        await expect(page.getByRole("row").filter({ hasText: "Jumping del dijous" })).toBeVisible();
        await shot(page, "D18-biblioteca", width, mode);

        await page.getByRole("button", { name: "Nou recorregut" }).click();
        await page.getByRole("menuitem", { name: "Importa un fitxer Smarter (.txt)" }).click();
        const dialog = page.getByRole("dialog", { name: "Importa un fitxer Smarter" });
        await dialog
          .getByLabel("Tria el fitxer .txt que exporta Smarter")
          .setInputFiles(smarterFixture);
        await expect(dialog.getByText(/obstacles$/u).first()).toBeVisible();
        await shot(page, "D18-importa", width, mode);
        await page.keyboard.press("Escape");

        await page.goto(`${baseUrl}/recorreguts/course-jumping-dijous`);
        await expect(page.getByRole("img", { name: /^Plànol de / }).first()).toBeVisible();
        await shot(page, "D18-recorregut-2d", width, mode);
        await page.getByRole("tab", { name: "3D" }).click();
        await expect(page.locator(".courses-viewer-3d canvas")).toBeVisible({ timeout: 30_000 });
        await page.waitForTimeout(1500);
        await shot(page, "D18-recorregut-3d", width, mode);

        await page.goto(
          `${baseUrl}/recorreguts/course-jumping-dijous/col-locacio?colocacio=placement-muntanya-dijous`,
        );
        await expect(
          page.getByRole("img", { name: "Recorregut col·locat a Muntanya" }),
        ).toBeVisible();
        await shot(page, "D18-col-locacio", width, mode);
        await page.getByRole("button", { name: "Registra-ho com a muntat" }).first().click();
        await expect(page.getByRole("dialog", { name: "Registra-ho com a muntat" })).toBeVisible();
        await shot(page, "D18-registra", width, mode);
        await page.keyboard.press("Escape");

        await page.goto(`${baseUrl}/pistes/ring-muntanya/geometria`);
        await expect(
          page.getByRole("heading", { level: 1, name: "Geometria · Muntanya" }),
        ).toBeVisible();
        await expect(page.getByRole("region", { name: "Muntatges" })).toBeVisible();
        await shot(page, "D16-geometria", width, mode);

        await page.goto(`${baseUrl}/activitats/activity-lliga-social-3`);
        await expect(page.getByRole("region", { name: "Col·locacions" })).toBeVisible();
        await shot(page, "D7-col-locacions", width, mode);
      });

      test(`R-16-13 D4's «Recorregut previst» (${mode}, ${String(width)})`, async ({ page }) => {
        // The D4 world: Wednesday 12 August 2026, week 33 validated and current.
        await signIn(page, "admin", mode, new Date("2026-08-12T10:00:00+02:00"));
        await page.goto(`${baseUrl}/calendari?estat=actives&setmana=2026-08-10`);
        await page
          .getByRole("table", { name: "Calendari de classes · del 10 al 16 d’agost" })
          .getByRole("button", { name: /^dc 12 18:50 · B\+C/u })
          .click();
        const card = page.getByRole("region", { name: /^Classe seleccionada/u });
        await expect(card.getByLabel("Recorregut previst")).toBeVisible();
        await shot(page, "D4-recorregut-previst", width, mode);
      });

      test(`R-16-09 WP-16-F D12's ring setups strip (${mode}, ${String(width)})`, async ({
        page,
      }) => {
        // The D12 world (`AGENDA_MOCK_NOW`): Monday 10 August 2026, 19:30 club-local.
        await signIn(page, "instructor", mode, new Date("2026-08-10T19:30:00+02:00"));
        await page.goto(`${baseUrl}/agenda`);
        await expect(
          page.getByRole("list", { name: "Recorreguts muntats a les pistes" }),
        ).toBeVisible();
        await shot(page, "D12-agenda-muntatges", width, mode);
      });
    });
  }
}
