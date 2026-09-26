import { mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test, type Page } from "@playwright/test";

const baseUrl = "http://127.0.0.1:4173";
const evidenceDirectory = resolve(import.meta.dirname, "../../../roadmap/evidence/E5-W01");
const brandingCanic: unknown = JSON.parse(
  readFileSync(
    resolve(
      import.meta.dirname,
      "../../../packages/api-client/src/mocks/fixtures/branding-canic.json",
    ),
    "utf8",
  ),
);
// The S08 mock world is drawn at Sunday 2 August 2026, noon (Europe/Madrid): `BOOKING_MOCK_NOW`.
const bookingNow = new Date("2026-08-02T12:00:00+02:00");

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

const shot = (page: Page, name: string) =>
  page.screenshot({ fullPage: true, path: resolve(evidenceDirectory, name) });

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
    await expect(page.locator(".reservation-row, .activity-row")).toHaveCount(5);
    await expect(page.getByText("instructor: es mostra el dia abans").first()).toBeVisible();
    await shot(page, "03-inici-375.png");
    await openReserve(page);
    await expect(page.getByText("Pack 10 — amb la Duna")).toBeVisible();
    await expect(page.locator(".class-row")).toHaveCount(6);
    await expect(page.locator(".class-row").nth(2).getByRole("button")).toHaveCount(0);
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

  test("29 limit done and «Properament»: the notes without a countdown (decision B1)", async ({
    page,
  }) => {
    await login(page);
    await openReserve(page);
    await tapRow(page, "ds 8 · 9:00");
    await expect(
      page.getByText(
        "Aquesta setmana ja has fet dues classes amb la Duna. Podràs reservar aquesta classe a partir de diumenge 9 a les 20 h.",
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
    await page.goto(`${baseUrl}/inici#impersonation=mock-impersonation-token`);
    await expect(page.getByText("Estàs veient l'app com Laura Serra Vidal")).toBeVisible();
    await expect(page.getByRole("heading", { level: 1, name: "Hola, Laura!" })).toBeVisible();
    await page.goto(`${baseUrl}/reservar#impersonation=mock-impersonation-token`);
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
