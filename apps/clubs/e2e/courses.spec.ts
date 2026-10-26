import { mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test, type Page } from "@playwright/test";

const baseUrl = "http://127.0.0.1:4173";
const evidenceDirectory = resolve(import.meta.dirname, "../../../roadmap/evidence/E9-W04");
const reviewEvidenceDirectory = resolve(
  import.meta.dirname,
  "../../../roadmap/evidence/2026-10-23-web-review",
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
// The S09 world (08) is drawn at Monday 3 August 2026, 7:10 club-local; the course world's
// setups are dated relative to that day (built «ahir», «fa 2 dies»).
const worldNow = new Date("2026-08-03T07:10:00+02:00");

test.use({ viewport: { height: 812, width: 375 } });

test.beforeAll(() => {
  mkdirSync(evidenceDirectory, { recursive: true });
  mkdirSync(reviewEvidenceDirectory, { recursive: true });
});

async function login(page: Page, scenario: string, landing: string) {
  await page.clock.setFixedTime(worldNow);
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

/** In-app navigation (the app's own `popstate`): a reload would restart the MSW world. */
async function navigate(page: Page, path: string) {
  await page.evaluate((next) => {
    window.history.pushState(null, "", next);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }, path);
}

// Icons are `<use>` references to the external sprite: a capture waits for every icon's box.
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
  await page.evaluate(async () => document.fonts.ready);
  await page.screenshot({ fullPage: true, path: resolve(evidenceDirectory, name) });
}

test.describe("E9-W04 S16 in the members' app (WP-16-F′) against MSW, 375 px", () => {
  test("T-16-16 a member: the course lines of 08 and 07, the icon of 10 and the read-only viewer", async ({
    page,
  }) => {
    await login(page, "member", "/inici");
    await navigate(page, "/entrenaments");
    const line = page.getByRole("link", { name: "Muntanya: Jumping · nivell C–D · muntat ahir" });
    await expect(line).toBeVisible();
    await shot(page, "08-entrenaments-recorreguts-375.png");
    await line.click();
    await expect(page).toHaveURL(/\/recorreguts\/57000000-0000-4000-8000-000000000002$/u);
    await expect(page.getByText("Jumping · nivell C–D")).toBeVisible();
    const plan = page.getByRole("img", { name: "Plànol de Jumping del dijous" });
    await expect(plan).toBeVisible();
    await expect(plan.getByText("1", { exact: true }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Marca com a desmuntat" })).toHaveCount(0);
    await shot(page, "visor-alumne-375.png");
    await page.screenshot({
      fullPage: true,
      path: resolve(reviewEvidenceDirectory, "member-standing-course-375.png"),
    });

    await navigate(page, "/avui");
    const icon = page.getByRole("button", { name: "Recorregut muntat a Muntanya" });
    await expect(icon).toBeVisible();
    await shot(page, "10-avui-icona-recorregut-375.png");

    await navigate(page, "/reserves/booking-duna-mon3");
    await expect(page.getByText("Recorregut previst: Agility C–D")).toBeVisible();
    await expect(
      page.getByRole("link", { name: /^A la pista hi ha muntat: Fun · muntat fa 2 dies$/u }),
    ).toBeVisible();
    await shot(page, "07-reserva-muntat-375.png");
  });

  test("T-16-16 an instructor: 23's icons, the placed course in 2D and 3D, registering in three taps", async ({
    page,
  }) => {
    await login(page, "instructor", "/instructor/dia");
    await navigate(page, "/instructor/avui");
    await expect(page.getByRole("button", { name: "Recorregut muntat a Muntanya" })).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Registra què hi ha muntat a Carretera" }),
    ).toBeVisible();
    await shot(page, "23-visio-global-recorreguts-375.png");

    await page.getByRole("button", { name: "Recorregut muntat a Muntanya" }).click();
    await expect(page.getByText("Geometria canviada: revisa la col·locació")).toBeVisible();
    await expect(page.getByRole("img", { name: /^Plànol de / })).toBeVisible();
    await shot(page, "visor-instructor-2d-375.png");
    await page.getByRole("button", { exact: true, name: "3D" }).click();
    await expect(page.locator(".course-viewer__3d canvas")).toBeVisible({ timeout: 30_000 });
    await page.waitForTimeout(1500);
    await shot(page, "visor-instructor-3d-375.png");

    await navigate(page, "/instructor/pistes/ring-carretera/muntat");
    await expect(
      page.getByRole("heading", { level: 1, name: "Registra què hi ha muntat" }),
    ).toBeVisible();
    await page.getByRole("button", { exact: true, name: "Jumping" }).click();
    // A stand-in «photo» of the ring: a plan drawn with the club's course tokens.
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
        context.fillStyle = token("--ah-color-course-obstacle");
        for (const [x, y] of [
          [60, 60],
          [160, 100],
          [260, 140],
        ]) {
          context.fillRect(x ?? 0, y ?? 0, 24, 8);
        }
      }
      return canvas.toDataURL("image/png");
    });
    await page.getByLabel("Fes una foto o tria'n una").setInputFiles({
      buffer: Buffer.from(dataUrl.split(",")[1] ?? "", "base64"),
      mimeType: "image/png",
      name: "pista.png",
    });
    await shot(page, "registra-muntat-375.png");
    await page.getByRole("button", { name: "REGISTRA" }).click();
    await expect(page.getByText("Registrat com a muntat.")).toBeVisible();
    await expect(page).toHaveURL(/\/recorreguts\/[0-9a-f-]{36}$/u);
    await shot(page, "registra-muntat-desat-375.png");
  });

  test("T-16-10 an instructor's build session: the code, a tap, FINALITZA and the registered setup", async ({
    page,
  }) => {
    await login(page, "instructor", "/instructor/dia");
    await navigate(page, "/recorreguts/57000000-0000-4000-8000-000000000002");
    await page.getByRole("button", { name: "Sessió de muntatge" }).click();
    await expect(page).toHaveURL(/\/instructor\/muntatge\//u);
    const list = page.getByRole("list", { name: "Obstacles" });
    await expect(list).toBeVisible();
    await expect(page.getByText(/^Codi per unir-s'hi:/u)).toBeVisible();
    const first = list.getByRole("button").first();
    await first.click();
    await expect(first).toHaveAccessibleName(/col·locat\. Toca per passar a per revisar\.$/u);
    await shot(page, "sessio-muntatge-375.png");
    await page.getByRole("button", { name: "FINALITZA" }).click();
    await expect(page.getByText("Sessió acabada: el muntatge ha quedat registrat.")).toBeVisible();
    await shot(page, "sessio-muntatge-finalitzada-375.png");
  });
});
