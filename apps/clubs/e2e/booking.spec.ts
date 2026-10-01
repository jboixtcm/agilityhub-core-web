import { mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test, type Page } from "@playwright/test";

const baseUrl = "http://127.0.0.1:4173";
// E5-W05 round 2 (review #10): the captures go to this spec's own task (E5-W01) unless the run names
// another one (`E2E_CAPTURE_TASK`, `pnpm e2e:docker <ID> --capture-task=<ID>`), as E5-W05 does to
// refresh the ones its mock clock changes (step 7): a later complete run never rewrites them.
const captureTask = process.env.E2E_CAPTURE_TASK ?? "";
const evidenceDirectory = resolve(
  import.meta.dirname,
  "../../../roadmap/evidence",
  captureTask === "" ? "E5-W01" : captureTask,
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
// The S08 mock world is drawn at Sunday 2 August 2026, 20:30 (Europe/Madrid), after the club's
// week opened at 20:00 (R-08-01): `BOOKING_MOCK_NOW` (E5-W05 step 7).
const bookingNow = new Date("2026-08-02T20:30:00+02:00");

test.use({ viewport: { height: 812, width: 375 } });

test.beforeAll(() => {
  mkdirSync(evidenceDirectory, { recursive: true });
});

async function prepare(page: Page, scenario: string, locale = "ca") {
  await page.addInitScript(
    ({ cachedBranding, language, mockScenario }) => {
      localStorage.setItem("agilityhub.locale", language);
      localStorage.setItem("agilityhub.mockScenario", mockScenario);
      localStorage.setItem(`agilityhub.branding:${location.host}`, JSON.stringify(cachedBranding));
    },
    { cachedBranding: brandingCanic, language: locale, mockScenario: scenario },
  );
}

/** Signs in (03 is the landing page) with the clock pinned at the mock world's instant. */
async function login(page: Page, scenario = "member", { clock = bookingNow, locale = "ca" } = {}) {
  await page.clock.setFixedTime(clock);
  await prepare(page, scenario, locale);
  await page.goto(`${baseUrl}/entrar`);
  await page
    .getByLabel(locale === "es" ? "Correo electrónico" : "Correu electrònic")
    .fill("laura@example.test");
  await page.getByLabel(locale === "es" ? "Contraseña" : "Contrasenya").fill("secret-password");
  await page.getByRole("button", { exact: true, name: "ENTRA" }).click();
  await page.waitForURL("**/inici");
}

// Icons are `<use>` references to the external sprite. A page that has just changed can be
// captured before the browser resolves them (the round-2 29 limit capture came out without its
// «×», paw and warning icons), so a capture waits until every rendered icon has a box, as
// `planning-calendar.spec.ts` does.
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

async function openReserve(page: Page) {
  await page.getByRole("link", { name: "Reservar" }).click();
  await page.waitForURL("**/reservar");
  await expect(page.getByRole("heading", { name: "Classes" })).toBeVisible();
}

/** Taps the 04 row whose text starts with `label` («dc 5 · 18:50»). */
async function tapRow(page: Page, label: string) {
  await page.locator(".class-row").filter({ hasText: label }).getByRole("button").click();
  await expect(page.getByRole("heading", { name: "Confirmar reserva" })).toBeVisible();
}

test.describe("E5-W01 S08 member flow against MSW (03, 04, 06/29, 07)", () => {
  test("T-08-37 03 and 04 as the mockups: dog filter, counters, rows, pack and every row badge", async ({
    page,
  }) => {
    await login(page);
    await expect(page.getByRole("heading", { level: 1, name: "Hola, Laura!" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Tots", pressed: true })).toBeVisible();
    // After the week opened: Rock's Monday 3 training (booked at 20:05) is there too, and Monday
    // 3's instructor shows (R-08-20); Monday 10's does not yet.
    await expect(page.locator(".reservation-row, .activity-row")).toHaveCount(6);
    await expect(page.getByText("Dilluns 3 · 18:50–19:50 · Central · Marc")).toBeVisible();
    await expect(page.getByText("instructor: es mostra el dia abans").first()).toBeVisible();
    await shot(page, "03-inici-375.png");
    await openReserve(page);
    await expect(page.getByText("Pack 10 — amb la Duna")).toBeVisible();
    await expect(page.locator(".class-row")).toHaveCount(6);
    await expect(page.locator(".class-row").nth(2).getByRole("button")).toHaveCount(0);
    // E7-W07 step 6 (ruling E85): mockup 04 draws «ds 8» as «Límit setmanal», but Duna is at 1 of
    // 2 with Monday 3 swappable, so the api sends a normal row (R-08-03); the done world shows it.
    await expect(page.locator(".class-row").filter({ hasText: "ds 8 · 9:00" })).toContainText(
      "3 places",
    );
    await expect(page.getByText("Límit setmanal")).toHaveCount(0);
    await shot(page, "04-reservar-375.png");
  });

  test("29 normal: the held seat for 30 s, the confirmation with the calendar links, then 07", async ({
    page,
  }) => {
    await login(page);
    await openReserve(page);
    await tapRow(page, "dc 5 · 18:50");
    await expect(page.getByText("Plaça bloquejada per a tu · 0:30")).toBeVisible();
    await shot(page, "29-confirmar-normal-375.png");
    await page.getByRole("button", { name: "CONFIRMAR LA RESERVA" }).click();
    await expect(page.getByText("Reserva confirmada. Afegeix-la al calendari:")).toBeVisible();
    await page.getByRole("link", { name: "VEURE LA RESERVA" }).click();
    await expect(page.getByRole("heading", { name: "Detall de la reserva" })).toBeVisible();
    await expect(page.getByText("Classe B+C · amb la Duna")).toBeVisible();
    await expect(page.getByText("Dimecres 5 · 18:50–19:50 · Central")).toBeVisible();
  });

  test("29 limit done and «Properament»: the notes without a countdown (S08 §2 row 29 amended 26-09, B1)", async ({
    page,
  }) => {
    // E5-W05 round 3 #2: the `bookingLimitDone` world on Monday 3 at 20:00 (`BOOKING_LIMIT_DONE_NOW`,
    // still W0): Duna's classes of Sunday 2 and Monday 3 are both done, nothing can be swapped, and
    // the api refuses the hold (R-08-09) — mockup 29's «Si aquesta setmana ja has fet les 2 classes».
    await login(page, "bookingLimitDone", { clock: new Date("2026-08-03T20:00:00+02:00") });
    await openReserve(page);
    await tapRow(page, "ds 8 · 9:00");
    // This week's limit (CURRENT at the clock, R-08-01): the class is over by Sunday 9 at 20:00,
    // the coming opening (`nextBookableAt`).
    await expect(
      page.getByText(
        "Aquesta setmana ja has fet dues classes amb la Duna. Podràs reservar per a la setmana vinent a partir de diumenge 9 a les 20 h.",
      ),
    ).toBeVisible();
    await shot(page, "29-limit-375.png");
    await page.getByRole("button", { name: "Tanca" }).click();
    await expect(page.getByRole("heading", { name: "Classes" })).toBeVisible();
    await tapRow(page, "dl 17 · 9:30");
    await expect(page.getByText("Disponible a partir de diumenge 9 a les 20 h.")).toBeVisible();
    await shot(page, "29-properament-375.png");
  });

  test("T-08-36 29 time out: at 0:00 the red note, and a tap goes back to 04", async ({ page }) => {
    await page.clock.install({ time: bookingNow });
    await prepare(page, "member");
    await page.goto(`${baseUrl}/entrar`);
    await page.getByLabel("Correu electrònic").fill("laura@example.test");
    await page.getByLabel("Contrasenya").fill("secret-password");
    await page.getByRole("button", { exact: true, name: "ENTRA" }).click();
    await page.waitForURL("**/inici");
    await openReserve(page);
    await tapRow(page, "dc 5 · 18:50");
    await expect(page.getByText("Plaça bloquejada per a tu · 0:30")).toBeVisible();
    await page.clock.runFor(31_000);
    const note = page.getByRole("button", {
      name: "Reserva cancel·lada per temps. Toca per tornar a la llista de classes.",
    });
    await expect(note).toBeVisible();
    await expect(page.getByRole("button", { name: "CONFIRMAR LA RESERVA" })).toBeDisabled();
    await shot(page, "29-temps-esgotat-375.png");
    await note.click();
    await expect(page.getByRole("heading", { name: "Classes" })).toBeVisible();
  });

  test("T-08-38 06: the week's limit proposes the swap; the chosen booking is cancelled in the same step", async ({
    page,
  }) => {
    await login(page, "bookingLimit");
    await openReserve(page);
    await tapRow(page, "ds 8 · 9:00");
    await expect(
      page.getByText("Ja tens 2 classes aquesta setmana amb la Duna (límit per gos)."),
    ).toBeVisible();
    await expect(page.getByRole("radio")).toHaveCount(2);
    await expect(
      page.getByRole("button", { name: "ANUL·LA DILLUNS 3 I CONFIRMA DISSABTE 8" }),
    ).toBeVisible();
    await shot(page, "06-confirmar-canvi-375.png");
    await page.getByRole("radio", { name: /Divendres 7/u }).click();
    await page.getByRole("button", { name: "ANUL·LA DIVENDRES 7 I CONFIRMA DISSABTE 8" }).click();
    await expect(page.getByText("Reserva confirmada. Afegeix-la al calendari:")).toBeVisible();
  });

  test("T-08-39 07: the booking detail, and the waiting entry with «SURT DE LA LLISTA D'ESPERA»", async ({
    page,
  }) => {
    await login(page);
    await page
      .locator(".reservation-row")
      .filter({ hasText: "Classe B+C" })
      .getByRole("link")
      .click();
    await expect(page.getByRole("heading", { name: "Detall de la reserva" })).toBeVisible();
    await expect(page.getByText("Reservada el dijous 30/07 a les 20:14")).toBeVisible();
    // E5-W05 step 9: the ring's dot before the title, as mockup 07.
    await expect(page.locator(".detail-card .detail-card__dot")).toHaveCount(1);
    await shot(page, "07-detall-375.png");
    await page.goto(`${baseUrl}/espera/waitlist-duna-thu6`);
    await expect(page.getByText("Classe C i sup. · amb la Duna")).toBeVisible();
    await shot(page, "07-espera-375.png");
    await page.getByRole("button", { name: "SURT DE LA LLISTA D'ESPERA" }).click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "SURT DE LA LLISTA D'ESPERA" })
      .click();
    await expect(page.getByText("Has sortit de la llista d'espera")).toBeVisible();
    await expect(
      page.locator(".reservation-row").filter({ hasText: "Classe C i sup." }),
    ).toHaveCount(0);
  });

  test("T-08-39 07 inside the 4 h threshold: the warning first, then the yellow note", async ({
    page,
  }) => {
    await login(page, "member", { clock: new Date("2026-08-03T16:00:00+02:00") });
    await page.goto(`${baseUrl}/reserves/booking-duna-mon3`);
    await page.getByRole("button", { name: "ANUL·LA LA RESERVA" }).click();
    await expect(
      page.getByText("Falten menys de 4 hores: la sessió comptarà com a feta."),
    ).toBeVisible();
    await page.getByRole("dialog").getByRole("button", { name: "ANUL·LA", exact: true }).click();
    await expect(
      page.getByText(/^Anul·lació feta amb menys de 4 hores d'antelació\./u),
    ).toBeVisible();
    await expect(page.getByText("anul·lada tard")).toBeVisible();
    await shot(page, "07-anullada-tard-375.png");
  });

  test("impersonated: the banner stays over 03 and 04, and the admin books as the member", async ({
    page,
  }) => {
    await page.clock.setFixedTime(bookingNow);
    await prepare(page, "impersonated");
    // E4-W16 step 1 (E47): «Entra com l'abonat» lands on /entrar?handoff=<one-time code>.
    await page.goto(`${baseUrl}/entrar?handoff=mock-impersonation-handoff-e2e`);
    await page.waitForURL((url) => url.pathname === "/inici");
    await expect(page.getByText("Estàs veient l'app com Laura Serra Vidal")).toBeVisible();
    await expect(page.getByRole("heading", { level: 1, name: "Hola, Laura!" })).toBeVisible();
    await page.goto(`${baseUrl}/reservar`);
    await expect(page.getByRole("heading", { name: "Classes" })).toBeVisible();
    await expect(page.getByText("Estàs veient l'app com Laura Serra Vidal")).toBeVisible();
    await tapRow(page, "dc 5 · 18:50");
    await page.getByRole("button", { name: "CONFIRMAR LA RESERVA" }).click();
    await expect(page.getByText("Reserva confirmada. Afegeix-la al calendari:")).toBeVisible();
  });

  test("es: 04 reads in Spanish", async ({ page }) => {
    await login(page, "member", { locale: "es" });
    await page.getByRole("link", { name: "Reservar" }).click();
    await expect(page.getByRole("heading", { name: "Clases" })).toBeVisible();
    await expect(page.getByText("Pack 10 — con Duna")).toBeVisible();
    await expect(page.locator(".class-row").first()).toContainText("2 plazas");
  });
});
