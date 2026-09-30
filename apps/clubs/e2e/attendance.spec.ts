import { mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test, type Page } from "@playwright/test";

const baseUrl = "http://127.0.0.1:4173";
const evidenceDirectory = resolve(import.meta.dirname, "../../../roadmap/evidence/E6-W01");
const brandingCanic: unknown = JSON.parse(
  readFileSync(
    resolve(
      import.meta.dirname,
      "../../../packages/api-client/src/mocks/fixtures/branding-canic.json",
    ),
    "utf8",
  ),
);
// The S10 mock world is drawn at Monday 3 August 2026, 8:50 (Europe/Madrid): `ATTENDANCE_MOCK_NOW`.
const attendanceNow = new Date("2026-08-03T08:50:00+02:00");

test.use({ viewport: { height: 812, width: 375 } });

test.beforeAll(() => {
  mkdirSync(evidenceDirectory, { recursive: true });
});

/** Signs in as the scenario's instructor with the clock pinned at the S10 world's instant. */
async function login(page: Page, scenario: string) {
  await page.clock.setFixedTime(attendanceNow);
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
  // Round 2 #7 (ruling E71): an instructor lands on 20.
  await page.waitForURL((url) => url.pathname === "/instructor/dia");
}

// Icons are `<use>` references to the external sprite: a capture waits until every rendered
// icon has a box, as `booking.spec.ts` does.
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

async function openDay(page: Page) {
  await page.getByRole("link", { name: "El meu dia" }).click();
  await page.waitForURL("**/instructor/dia");
  await expect(page.getByRole("heading", { level: 1, name: "Grups del dia" })).toBeVisible();
}

function row(page: Page, name: string) {
  return page
    .locator("li.instructor-sheet__row")
    .filter({ has: page.getByText(name, { exact: true }) });
}

test.describe("E6-W01 S10 screens 20, 21 and 22 against MSW", () => {
  test("T-10-27 20 as the mockup: the chips, the three classes, the legend and the block; an empty day", async ({
    page,
  }) => {
    await login(page, "instructor");
    await openDay(page);
    await expect(page.getByLabel("Instructor")).toHaveValue("instructor-estel");
    await expect(page.getByRole("button", { name: "dl 3" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    const first = page.getByRole("link", { name: /8:30–9:30 · A\+B · Central/u });
    await expect(first).toContainText("3/5");
    await expect(first).toContainText("passar llista pendent");
    await expect(page.getByRole("link", { name: /17:40–18:40 · Teràpia · Petita/u })).toContainText(
      "individual",
    );
    await expect(page.getByText("n/n = inscrits/places")).toBeVisible();
    const block = page.getByRole("button", { name: /16:00–17:30 · Pista Carretera/u });
    await expect(block).toContainText("bloquejada");
    await expect(block).toContainText("Manteniment — regar i repassar el terra");
    await shot(page, "20-grups-del-dia-375.png");

    await page.getByRole("button", { name: "dc 5" }).click();
    await expect(page.getByText("Cap classe aquest dia")).toBeVisible();
    await shot(page, "20-buit-375.png");
  });

  test("T-10-27 21: a tap is local, [DESA] sends only the changed rows, «ha avisat» and the photo full screen", async ({
    page,
  }) => {
    await login(page, "instructor");
    await openDay(page);
    await page.getByRole("link", { name: /8:30–9:30 · A\+B · Central/u }).click();
    await page.waitForURL("**/instructor/classes/c1");
    await expect(
      page.getByRole("heading", { level: 1, name: "dl 3 · 8:30 · A+B · Central" }),
    ).toBeVisible();
    await expect(row(page, "Anna + Nass")).toContainText("ha avisat (12:40)");
    await expect(row(page, "Anna + Nass")).toContainText("plaça alliberada");
    await expect(row(page, "Anna + Nass")).toContainText("espera avisada");
    await expect(row(page, "Eva + Fish")).toContainText("no presentat → avís demà a les 8:00");
    await expect(page.getByText("des d'ahir 21:04")).toBeVisible();
    await expect(
      page.getByText("Si s'allibera una plaça, s'avisa alhora tothom qui espera."),
    ).toBeVisible();
    await shot(page, "21-passar-llista-375.png");

    // Round 2 #6 (AGENTS rule 6): Marc's four circles can be chosen; none is faded, and each ring
    // keeps 3:1 or more against the card (computed styles).
    const rings = await row(page, "Marc + Chun-li")
      .getByRole("radio")
      .evaluateAll((circles) => {
        const channels = (value: string): number[] => {
          const srgb = /color\(srgb ([\d.]+) ([\d.]+) ([\d.]+)/u.exec(value);
          if (srgb !== null) return srgb.slice(1, 4).map((part) => Number(part) * 255);
          return (value.match(/[\d.]+/gu) ?? []).slice(0, 4).map(Number);
        };
        const luminance = (rgb: number[]) => {
          const [red = 0, green = 0, blue = 0] = rgb.map((channel) => {
            const normalized = channel / 255;
            return normalized <= 0.04045
              ? normalized / 12.92
              : ((normalized + 0.055) / 1.055) ** 2.4;
          });
          return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
        };
        const contrast = (a: number[], b: number[]) => {
          const [lighter, darker] = [luminance(a), luminance(b)].sort((x, y) => y - x);
          return ((lighter ?? 0) + 0.05) / ((darker ?? 0) + 0.05);
        };
        return circles.map((circle) => {
          let background: number[] = [0, 0, 0];
          for (let node = circle.parentElement; node !== null; node = node.parentElement) {
            const fill = channels(getComputedStyle(node).backgroundColor);
            if ((fill[3] ?? 1) > 0) {
              background = fill.slice(0, 3);
              break;
            }
          }
          const style = getComputedStyle(circle);
          return {
            label: circle.getAttribute("aria-label"),
            opacity: Number(style.opacity),
            ratio: contrast(channels(style.borderTopColor).slice(0, 3), background),
          };
        });
      });
    expect(rings.map((ring) => ring.label)).toEqual([
      "pendent",
      "present",
      "ha avisat",
      "no presentat",
    ]);
    for (const ring of rings) {
      expect(ring.opacity).toBe(1);
      expect(ring.ratio).toBeGreaterThanOrEqual(3);
    }

    // The photo full screen, and back to the same screen. Round 2 #5 (AGENTS rule 6): a modal;
    // Tab and Shift+Tab stay on it, the page behind is inert and does not scroll, and Escape (or
    // a tap) closes it with the focus back on the photo.
    const scroll = await page.evaluate(() => window.scrollY);
    const opener = page.getByRole("button", { name: "Mostra la foto de Duna a pantalla completa" });
    await opener.click();
    await expect(page.getByRole("dialog", { name: "Tanca la foto de Duna" })).toBeVisible();
    const close = page.getByRole("button", { name: "Tanca la foto de Duna" });
    await expect(close).toBeFocused();
    await shot(page, "21-foto-375.png");
    await page.keyboard.press("Tab");
    await expect(close).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    await expect(close).toBeFocused();
    expect(
      await page.evaluate(() => ({
        inert: document.getElementById("root")?.hasAttribute("inert") ?? false,
        overflow: document.body.style.overflow,
      })),
    ).toEqual({ inert: true, overflow: "hidden" });
    await page.mouse.wheel(0, 600);
    expect(await page.evaluate(() => window.scrollY)).toBe(scroll);
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(opener).toBeFocused();
    expect(await page.evaluate(() => document.getElementById("root")?.hasAttribute("inert"))).toBe(
      false,
    );
    await opener.click();
    await close.click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    expect(await page.evaluate(() => window.scrollY)).toBe(scroll);

    // A tap changes the circle only locally; [DESA] sends Marc's «ha avisat» and nothing else.
    const requests: string[] = [];
    page.on("request", (request) => {
      if (request.url().includes("/api/v1/"))
        requests.push(`${request.method()} ${new URL(request.url()).pathname}`);
    });
    await row(page, "Marc + Chun-li")
      .getByRole("radio", { exact: true, name: "ha avisat" })
      .click();
    await expect(
      row(page, "Marc + Chun-li").getByRole("radio", { exact: true, name: "ha avisat" }),
    ).toHaveAttribute("aria-checked", "true");
    expect(requests).toEqual([]);
    const put = page.waitForRequest(
      (request) =>
        request.method() === "PUT" && request.url().endsWith("/class-sessions/c1/attendance"),
    );
    await page.getByRole("button", { name: "Desa" }).click();
    const sent = await put;
    expect(sent.postDataJSON()).toEqual({
      items: [{ bookingId: "b2", state: "NOTIFIED" }],
      version: 4,
    });
    expect(sent.headers()["idempotency-key"]).toMatch(/^[0-9a-f-]{36}$/u);
    await expect(page.getByText("Llista desada")).toBeVisible();
    await expect(row(page, "Marc + Chun-li")).toContainText("ha avisat (8:50)");
    await expect(row(page, "Marc + Chun-li")).toContainText("plaça alliberada");
    await expect(page.getByText("2/5")).toBeVisible();
    for (const radio of await row(page, "Marc + Chun-li").getByRole("radio").all()) {
      await expect(radio).toBeDisabled();
    }
  });

  test("T-10-27 21's 409: another instructor saved first; the toast, and the caller's edit merged and sent again", async ({
    page,
  }) => {
    await login(page, "attendanceStale");
    await page.goto(`${baseUrl}/instructor/classes/c1`);
    await row(page, "Eva + Fish").getByRole("radio", { exact: true, name: "pendent" }).click();
    await page.getByRole("button", { name: "Desa" }).click();
    await expect(page.getByText("Algú ha desat la llista fa un moment: revisa-la")).toBeVisible();
    await expect(
      row(page, "Marc + Chun-li").getByRole("radio", { exact: true, name: "present" }),
    ).toHaveAttribute("aria-checked", "true");
    const put = page.waitForRequest((request) => request.method() === "PUT");
    await page.getByRole("button", { name: "Desa" }).click();
    expect((await put).postDataJSON()).toEqual({
      items: [{ bookingId: "b4", state: "PENDING" }],
      version: 5,
    });
    await expect(page.getByText("Llista desada")).toBeVisible();
  });

  test("21 of a class cancelled by the club: the banner and an inert list", async ({ page }) => {
    await login(page, "instructor");
    await page.goto(`${baseUrl}/instructor/classes/c4`);
    await expect(page.getByText("Classe anul·lada pel club")).toBeVisible();
    await expect(page.getByRole("button", { name: "Desa" })).toHaveCount(0);
    await shot(page, "21-anullada-375.png");
  });

  test("T-10-28 22 as the mockup, and without TASKS", async ({ page }) => {
    await login(page, "instructor");
    await page.goto(`${baseUrl}/instructor/alumnes/dog-duna`);
    await expect(page.getByRole("heading", { level: 2, name: "Laura + Duna" })).toBeVisible();
    await expect(page.getByText("C · fa 8 mesos")).toBeVisible();
    await expect(page.getByText("86%")).toBeVisible();
    await expect(page.getByText("2,3")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Observacions (privades)" })).toBeVisible();
    await shot(page, "22-fitxa-375.png");

    await page.getByRole("link", { name: "Cerca un alumne" }).click();
    await page.waitForURL("**/instructor/alumnes");
    await expect(page.getByRole("link", { name: "Laura + Duna · C" })).toBeVisible();
  });

  test("T-10-28 22 without TASKS: no blocks, no manage button", async ({ page }) => {
    await login(page, "instructorNoTasks");
    await page.goto(`${baseUrl}/instructor/alumnes/dog-duna`);
    await expect(page.getByRole("heading", { level: 2, name: "Laura + Duna" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Observacions (privades)" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Gestionar tasques i notes" })).toHaveCount(0);
    await shot(page, "22-sense-tasques-375.png");
  });

  test("S09 T-09-40's other half: a block made on 24 from 20's button shows on 20 as «bloquejada»", async ({
    page,
  }) => {
    await login(page, "instructor");
    await openDay(page);
    await page.getByRole("button", { name: "Reservar o bloquejar pista" }).click();
    await page.waitForURL("**/instructor/pistes/ring-central/reservar");
    await expect(page.getByRole("heading", { name: "Reservar o bloquejar pista" })).toBeVisible();
    await page
      .getByRole("group", { name: "Tipus" })
      .getByRole("button", { name: "Bloqueig" })
      .click();
    // 24's ring picker: the route's ring (Central) is preselected; any other is a tap away.
    await expect(
      page.getByRole("group", { name: "Pista" }).getByRole("button", { name: "Central" }),
    ).toHaveAttribute("aria-pressed", "true");
    await page
      .getByRole("group", { name: "Pista" })
      .getByRole("button", { name: "Petita" })
      .click();
    await page.getByRole("combobox", { name: "Dia" }).selectOption("2026-08-06");
    await page.getByRole("combobox", { name: "Franja" }).selectOption("afternoon");
    const grid = page.getByRole("group", { name: "Hores de la franja" });
    await grid.getByRole("button", { name: "18:00, lliure" }).click();
    await grid.getByRole("button", { name: "18:30, lliure" }).click();
    await page.getByRole("textbox", { name: "Nota" }).fill("Canvi de sorra");
    await page.getByRole("button", { name: "Bloqueja la pista" }).click();
    await page.waitForURL("**/instructor/avui?date=2026-08-06");
    await expect(page.getByText("Pista bloquejada")).toBeVisible();
    // The MSW world lives in the page, and the tab bar's links load a new page: 20 is opened
    // in-app, as 24 itself returns to 23 (the api keeps the block across page loads).
    await page.evaluate(() => {
      window.history.pushState(null, "", "/instructor/dia?date=2026-08-06");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    await expect(page.getByRole("heading", { level: 1, name: "Grups del dia" })).toBeVisible();
    await expect(page.getByRole("button", { name: "dj 6" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    const block = page.getByRole("button", { name: /18:00–19:00 · Pista Petita/u });
    await expect(block).toContainText("bloquejada");
    await expect(block).toContainText("Manteniment — Canvi de sorra");
    await shot(page, "20-bloqueig-de-24-375.png");
  });
});
