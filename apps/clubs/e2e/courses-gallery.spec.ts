import { mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test, type Page } from "@playwright/test";

// E9-W05 step 3: S16 has no mockups, so every members' app S16 screen is captured for Josep at 375
// and 1280 px, light and dark, against MSW. The light captures draw the club's branding with the
// light fixture's palette (`agilityhub.mockTheme`, `mockThemeMode` in the mocks). A capture script,
// not a suite (E9-W05 round 2 #2): it runs only when `E2E_CAPTURE_TASK` names the folder, so
// `pnpm e2e` and CI skip it and never rewrite the captures:
//   pnpm e2e:docker E9-W05 --capture-task=E9-W05 --grep=E9-W05 --pass-with-no-tests
const captureTask = process.env.E2E_CAPTURE_TASK ?? "";
test.skip(captureTask === "", "capture only: set E2E_CAPTURE_TASK (--capture-task=<ID>)");
const evidenceDirectory = resolve(import.meta.dirname, `../../../roadmap/evidence/${captureTask}`);
const baseUrl = "http://127.0.0.1:4173";
// The S09 world (08) is drawn at Monday 3 August 2026, 7:10 club-local; the course world's
// setups are dated relative to that day.
const worldNow = new Date("2026-08-03T07:10:00+02:00");

interface CachedBranding {
  theme: { colors: Record<string, string>; mode: string; ringPalette?: string[] };
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

async function login(page: Page, scenario: string, landing: string, mode: Mode): Promise<void> {
  await page.clock.setFixedTime(worldNow);
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
  await page.getByLabel("Correu electrònic").fill("laura@example.test");
  await page.getByLabel("Contrasenya").fill("secret-password");
  await page.getByRole("button", { exact: true, name: "ENTRA" }).click();
  await page.waitForURL(`**${landing}`);
  await expect(page.locator("html")).toHaveAttribute("data-theme", mode);
}

/** In-app navigation (the app's own `popstate`): a reload would restart the MSW world. */
async function navigate(page: Page, path: string): Promise<void> {
  await page.evaluate((next) => {
    window.history.pushState(null, "", next);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }, path);
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
    path: resolve(evidenceDirectory, `clubs-${name}-${String(width)}-${mode}.png`),
  });
}

/** A stand-in «photo» of the ring: a plan drawn with the club's course tokens. */
async function ringPhoto(page: Page): Promise<Buffer> {
  const dataUrl = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 320;
    canvas.height = 200;
    const context = canvas.getContext("2d");
    const token = (name: string) =>
      getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    if (context !== null) {
      context.fillStyle = token("--ah-color-course-floor");
      context.fillRect(0, 0, 320, 200);
      context.strokeStyle = token("--ah-color-course-ring");
      context.lineWidth = 4;
      context.strokeRect(10, 10, 300, 180);
    }
    return canvas.toDataURL("image/png");
  });
  return Buffer.from(dataUrl.split(",")[1] ?? "", "base64");
}

test.beforeAll(() => {
  mkdirSync(evidenceDirectory, { recursive: true });
});

for (const mode of MODES) {
  for (const width of WIDTHS) {
    test.describe(`E9-W05 S16 members' app screens · ${String(width)} px · ${mode}`, () => {
      test.use({ viewport: { height: width === 375 ? 812 : 900, width } });

      test(`T-16-16 a member: 08, the read-only viewer, 10 and 07 (${mode}, ${String(width)})`, async ({
        page,
      }) => {
        await login(page, "member", "/inici", mode);
        await navigate(page, "/entrenaments");
        await expect(
          page.getByRole("link", { name: "Muntanya: Jumping · nivell C–D · muntat ahir" }),
        ).toBeVisible();
        await shot(page, "08-entrenaments", width, mode);

        await navigate(page, "/recorreguts/setup-muntanya-dijous");
        await expect(page.getByText("Jumping · nivell C–D")).toBeVisible();
        await shot(page, "visor-alumne", width, mode);

        await navigate(page, "/avui");
        await expect(
          page.getByRole("button", { name: "Recorregut muntat a Muntanya" }),
        ).toBeVisible();
        await shot(page, "10-avui", width, mode);

        await navigate(page, "/reserves/booking-duna-mon3");
        await expect(page.getByText("Recorregut previst: Agility C–D")).toBeVisible();
        await shot(page, "07-reserva", width, mode);
      });

      test(`T-16-16 an instructor: 23, the viewer in 2D and 3D, registering, a build session (${mode}, ${String(width)})`, async ({
        page,
      }) => {
        test.setTimeout(120_000);
        await login(page, "instructor", "/instructor/dia", mode);
        await navigate(page, "/instructor/avui");
        await expect(
          page.getByRole("button", { name: "Recorregut muntat a Muntanya" }),
        ).toBeVisible();
        await shot(page, "23-visio-global", width, mode);

        await page.getByRole("button", { name: "Recorregut muntat a Muntanya" }).click();
        await expect(page.getByRole("img", { name: /^Plànol de / })).toBeVisible();
        await shot(page, "visor-instructor-2d", width, mode);
        await page.getByRole("button", { exact: true, name: "3D" }).click();
        await expect(page.locator(".course-viewer__3d canvas")).toBeVisible({ timeout: 30_000 });
        await page.waitForTimeout(1500);
        await shot(page, "visor-instructor-3d", width, mode);

        // E9-W05 #8: staff build a planned course from 07, and join from a ring with no setup.
        await navigate(page, "/reserves/booking-duna-mon3");
        await expect(page.getByText("Recorregut previst: Agility C–D")).toBeVisible();
        await expect(page.getByRole("button", { name: "Sessió de muntatge" })).toBeVisible();
        await shot(page, "07-reserva-personal", width, mode);
        await navigate(page, "/recorreguts/muntat/ring-carretera");
        await expect(page.getByText("Sense recorregut registrat")).toBeVisible();
        await expect(page.getByLabel("Codi d'una sessió de muntatge")).toBeVisible();
        await shot(page, "visor-sense-muntatge-personal", width, mode);

        await navigate(page, "/instructor/pistes/ring-carretera/muntat");
        await expect(
          page.getByRole("heading", { level: 1, name: "Registra què hi ha muntat" }),
        ).toBeVisible();
        await shot(page, "registra-muntat-buit", width, mode);
        await page.getByRole("button", { exact: true, name: "Jumping" }).click();
        await page.getByLabel("Fes una foto o tria'n una").setInputFiles({
          buffer: await ringPhoto(page),
          mimeType: "image/png",
          name: "pista.png",
        });
        await shot(page, "registra-muntat", width, mode);

        await navigate(page, "/recorreguts/setup-muntanya-dijous");
        await page.getByRole("button", { name: "Sessió de muntatge" }).click();
        await expect(page).toHaveURL(/\/instructor\/muntatge\//u);
        await expect(page.getByText(/^Codi per unir-s'hi:/u)).toBeVisible();
        await page.getByRole("list", { name: "Obstacles" }).getByRole("button").first().click();
        await shot(page, "sessio-muntatge", width, mode);
        await page.getByRole("button", { name: "FINALITZA" }).click();
        await expect(
          page.getByText("Sessió acabada: el muntatge ha quedat registrat."),
        ).toBeVisible();
        await shot(page, "sessio-muntatge-finalitzada", width, mode);
      });
    });
  }
}
