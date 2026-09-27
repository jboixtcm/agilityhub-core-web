import { mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test, type Page } from "@playwright/test";

const baseUrl = "http://127.0.0.1:4173";
const evidenceDirectory = resolve(import.meta.dirname, "../../../roadmap/evidence/E5-W02");
const brandingCanic: unknown = JSON.parse(
  readFileSync(
    resolve(
      import.meta.dirname,
      "../../../packages/api-client/src/mocks/fixtures/branding-canic.json",
    ),
    "utf8",
  ),
);
// The S09 mock world is drawn at Monday 3 August 2026, 7:10 (Europe/Madrid): `TRAINING_MOCK_NOW`.
const trainingNow = new Date("2026-08-03T07:10:00+02:00");

test.use({ viewport: { height: 812, width: 375 } });

test.beforeAll(() => {
  mkdirSync(evidenceDirectory, { recursive: true });
});

/** Signs in with the clock pinned at the S09 world's instant; `landing` is where login goes. */
async function login(page: Page, scenario: string, landing: string) {
  await page.clock.setFixedTime(trainingNow);
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

async function openTraining(page: Page) {
  await page.getByRole("link", { name: "Entrenaments" }).click();
  await page.waitForURL("**/entrenaments");
  await expect(page.getByRole("group", { name: "Matí" })).toBeVisible();
}

test.describe("E5-W02 S09 screens 08, the training detail and 24 against MSW", () => {
  test("T-09-38 08 as the mockup: «Qualsevol» with two free rings at 8:30, the booking and the limit", async ({
    page,
  }) => {
    await login(page, "member", "/inici");
    await openTraining(page);
    await expect(page.getByRole("button", { name: "Rock · D", pressed: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Avui dl 3", pressed: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Qualsevol", pressed: true })).toBeVisible();
    await expect(page.getByText("Portes 2/3 entrenaments aquesta setmana")).toBeVisible();
    await shot(page, "08-entrenaments-375.png");

    await page
      .getByRole("group", { name: "Matí" })
      .getByRole("button", { name: "8:30, lliure" })
      .click();
    await expect(
      page.getByText("A les 8:30 hi ha més d'una pista lliure — tria quina vols:"),
    ).toBeVisible();
    const confirm = page.getByRole("button", { name: /^Confirma/u });
    // Upper-cased by CSS, as the mockup's button.
    expect(await confirm.innerText()).toBe("CONFIRMA DILLUNS 3 · 8:30–9:00 · MUNTANYA");
    await shot(page, "08-qualsevol-375.png");

    const posted = page.waitForRequest(
      (request) => request.method() === "POST" && request.url().endsWith("/training-bookings"),
    );
    await confirm.click();
    const request = await posted;
    expect(request.postDataJSON()).toEqual({
      dogId: "dog-rock",
      ringId: "ring-muntanya",
      startsAt: "2026-08-03T06:30:00Z",
    });
    await expect(page.getByText("Entrenament reservat")).toBeVisible();
    await expect(page.getByText("Portes 3/3 entrenaments aquesta setmana")).toBeVisible();
    await expect(page.getByRole("link", { name: "dt 4 · 8:00 · Muntanya" })).toBeVisible();

    await page.getByRole("button", { name: "dc 5" }).click();
    await expect(page.getByText("El club està tancat aquest dia")).toBeVisible();
    await shot(page, "08-dia-tancat-375.png");
  });

  test("T-09-39 08 at the limit: the message with a link to each cancellable session", async ({
    page,
  }) => {
    await login(page, "trainingAtLimit", "/inici");
    await openTraining(page);
    await expect(
      page.getByText(
        "Has arribat al límit de 3 reserves per aquesta setmana: anul·la alguna de les properes per reservar-ne una altra.",
      ),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: /^Confirma/u })).toHaveCount(0);
    await shot(page, "08-limit-375.png");
    await page.getByRole("link", { name: "dj 6 · 7:30 · Carretera" }).click();
    await page.waitForURL("**/entrenaments/training-rock-thu6");
    await expect(page.getByText("Dijous 6 · 7:30–8:00 · Carretera")).toBeVisible();
  });

  test("the training detail from 03: the 07 pattern and the cancellation back to 03", async ({
    page,
  }) => {
    await login(page, "member", "/inici");
    await page
      .locator(".reservation-row")
      .filter({ hasText: "Dimarts 4 · 8:00–8:30" })
      .getByRole("link")
      .click();
    await page.waitForURL("**/entrenaments/training-rock-tue4");
    await expect(page.getByText("Entrenament · amb Rock")).toBeVisible();
    await expect(page.getByText("confirmada")).toBeVisible();
    await expect(page.getByText("Dimarts 4 · 8:00–8:30 · Muntanya")).toBeVisible();
    await shot(page, "entrenament-detall-375.png");
    await page.getByRole("button", { name: "ANUL·LA LA RESERVA" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "ANUL·LA" }).click();
    await page.waitForURL("**/inici");
    await expect(page.getByText("Entrenament anul·lat")).toBeVisible();
    await expect(
      page.locator(".reservation-row").filter({ hasText: "Dimarts 4 · 8:00–8:30" }),
    ).toHaveCount(0);
  });

  test("T-09-40 24: «Bloqueig» hides the reservation reasons; 18:00 + 18:30 on Petita, then 23 shows the block", async ({
    page,
  }) => {
    await login(page, "instructor", "/instructor/avui");
    await page.goto(`${baseUrl}/instructor/pistes/ring-petita/reservar`);
    await expect(page.getByRole("heading", { name: "Reservar o bloquejar pista" })).toBeVisible();
    await page.getByRole("combobox", { name: "Dia" }).selectOption("2026-08-06");
    await page.getByRole("combobox", { name: "Franja" }).selectOption("afternoon");
    const grid = page.getByRole("group", { name: "Hores de la franja" });
    await expect(grid.getByRole("button", { name: "19:00, bloqueig" })).toBeDisabled();
    await grid.getByRole("button", { name: "18:00, lliure" }).click();
    await grid.getByRole("button", { name: "18:30, lliure" }).click();
    await page.getByRole("textbox", { name: "Nota" }).fill("Particular amb l'alumna de la tarda");
    await expect(
      page.getByText(
        "Ocupa la pista Petita de 18:00 a 19:00, surt al quadre global i al registre d'ús de pistes. No es vincula a cap alumne.",
      ),
    ).toBeVisible();
    expect(await page.getByRole("button", { name: "Reserva la pista" }).innerText()).toBe(
      "RESERVA LA PISTA",
    );
    await shot(page, "24-reserva-pista-375.png");

    await page
      .getByRole("group", { name: "Tipus" })
      .getByRole("button", { name: "Bloqueig" })
      .click();
    await expect(page.getByRole("group", { name: "Motiu" }).getByRole("button")).toHaveText([
      "Manteniment",
      "Altres",
    ]);
    await expect(page.getByRole("button", { name: "Classe particular" })).toHaveCount(0);
    await shot(page, "24-bloqueig-375.png");

    // Back to «Reserva de pista» on Tuesday 11 (the calendar world's day), then to 23.
    await page
      .getByRole("group", { name: "Tipus" })
      .getByRole("button", { name: "Reserva de pista" })
      .click();
    await page.getByRole("combobox", { name: "Dia" }).selectOption("2026-08-11");
    await grid.getByRole("button", { name: "18:00, lliure" }).click();
    await grid.getByRole("button", { name: "18:30, lliure" }).click();
    await page.getByRole("button", { name: "Reserva la pista" }).click();
    await page.waitForURL("**/instructor/avui?date=2026-08-11");
    await expect(page.getByText("Pista reservada")).toBeVisible();
    const block = page.locator(".ah-day-grid").getByText("classe particular");
    await expect(block).toBeVisible();
    await expect(page.locator(".ah-day-grid").getByText("Bloq.").first()).toBeVisible();
  });
});
