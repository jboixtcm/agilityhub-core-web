import { mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test, type Page } from "@playwright/test";

const baseUrl = "http://127.0.0.1:4174";
const evidenceDirectory = resolve(import.meta.dirname, "../../../roadmap/evidence/E4-W04");
const brandingCanic: unknown = JSON.parse(
  readFileSync(
    resolve(
      import.meta.dirname,
      "../../../packages/api-client/src/mocks/fixtures/branding-canic.json",
    ),
    "utf8",
  ),
);
// The D7 mockup is read at the beginning of August 2026 (the Torneig of 7/08 is «this month»).
const mockupNow = new Date("2026-08-04T10:00:00+02:00");

async function signIn(page: Page, scenario: "admin" | "instructor") {
  await page.clock.setFixedTime(mockupNow);
  await page.addInitScript(
    ({ cachedBranding, mockScenario }) => {
      localStorage.setItem("agilityhub.locale", "ca");
      localStorage.setItem("agilityhub.mockScenario", mockScenario);
      localStorage.setItem(`agilityhub.branding:${location.host}`, JSON.stringify(cachedBranding));
    },
    { cachedBranding: brandingCanic, mockScenario: scenario },
  );
  await page.goto(`${baseUrl}/entrar`);
  await page.getByLabel("Correu electrònic").fill(`${scenario}@example.test`);
  await page.getByRole("button", { name: "Tinc contrasenya" }).click();
  await page.getByLabel("Contrasenya").fill("secret-password");
  await page.getByRole("button", { name: "ENTRA" }).click();
  await page.waitForURL("**/tauler");
}

function maintenance(page: Page, title: string) {
  return page.getByRole("region", { name: `Manteniment de l'activitat — ${title}` });
}

test.beforeAll(() => {
  mkdirSync(evidenceDirectory, { recursive: true });
});

test.describe("E4-W04 D7 activities", () => {
  test("T-07-29 list + maintenance of «Torneig d'Estiu 2026» as the mockup", async ({ page }) => {
    await signIn(page, "admin");
    await page.getByRole("link", { exact: true, name: "Activitats" }).click();
    await page.waitForURL("**/activitats**");
    const table = page.getByRole("table");
    const tournament = table.getByRole("row").filter({ hasText: "Torneig d'Estiu 2026" });
    await expect(tournament).toContainText("dv 7 · 18:30–20:30");
    await expect(tournament).toContainText("totes — bloquejades");
    await expect(tournament).toContainText("22/40 · fins el 6/08");
    await expect(tournament).toContainText("publicada");
    await expect(
      table.getByRole("row").filter({ hasText: "Demostració Festa Major" }),
    ).toContainText("— (fora del club)");
    await tournament.getByRole("link").first().click();
    await page.waitForURL("**/activitats/activity-torneig-estiu-2026");
    const card = maintenance(page, "Torneig d'Estiu 2026");
    await expect(card.getByLabel("Títol", { exact: true })).toHaveValue("Torneig d'Estiu 2026");
    await expect(card.getByText("Nivells: tots")).toBeVisible();
    await expect(card.getByRole("button", { name: "Llista d'espera: sí" })).toBeVisible();
    await expect(
      card.getByText(
        "URL: agilitycanic.cat/activitat/torneig-estiu-2026 · surt a l'API de la web (mai noms)",
      ),
    ).toBeVisible();
    await page.screenshot({
      fullPage: true,
      path: resolve(evidenceDirectory, "D7-activitats-1280.png"),
    });
  });

  test("T-07-29 publishing a dated draft opens the ring-conflict dialog and applies the options", async ({
    page,
  }) => {
    await signIn(page, "admin");
    await page.goto(`${baseUrl}/activitats/activity-demostracio-festa-major`);
    const card = maintenance(page, "Demostració Festa Major");
    await expect(card.getByLabel("Lloc")).toHaveValue("Plaça Major");
    await card.getByRole("switch", { name: "Al club" }).click();
    await card.getByRole("button", { name: "Muntanya" }).click();
    await card.getByRole("button", { name: "Central" }).click();
    await card.getByLabel("Hora d'inici").selectOption("18:30");
    await card.getByLabel("Hora de final").selectOption("20:30");
    await card.getByLabel("Inscripció: de").fill("01/09/2026");
    await card.getByLabel("Inscripció: al").fill("01/10/2026");
    await card.getByRole("button", { name: "DESA" }).click();
    await expect(page.getByText("Canvis desats")).toBeVisible();
    await card.getByRole("button", { name: "PUBLICA" }).click();
    const dialog = page.getByRole("dialog", { name: "Conflictes de pista" });
    await expect(dialog.getByText("Central · B+C · 18:30–19:30")).toBeVisible();
    await expect(dialog.getByText("3 inscrits")).toBeVisible();
    await expect(dialog.getByText("Muntanya · Pau Soler + Blat · 19:00–19:30")).toBeVisible();
    await expect(dialog.getByRole("button", { name: "PUBLICA I APLICA" })).toBeDisabled();
    await dialog.getByLabel("Anul·la les classes en conflicte i avisa els inscrits").check();
    await dialog.getByLabel("Cancel·la les reserves d'entrenament").check();
    await dialog
      .getByLabel("Text de l'avís")
      .fill("Diumenge 4 fem la Demostració: la classe queda anul·lada.");
    await page.screenshot({ path: resolve(evidenceDirectory, "D7-conflictes-1280.png") });
    await dialog.getByRole("button", { name: "PUBLICA I APLICA" }).click();
    await expect(page.getByText("Activitat publicada")).toBeVisible();
    await expect(card.getByRole("button", { name: "CANCEL·LA L'ACTIVITAT" })).toBeVisible();
  });

  test("T-07-29 cancelling the Torneig lists the 22 registrants and requires the notice text", async ({
    page,
  }) => {
    await signIn(page, "admin");
    await page.goto(`${baseUrl}/activitats/activity-torneig-estiu-2026`);
    const card = maintenance(page, "Torneig d'Estiu 2026");
    await card.getByRole("button", { name: "CANCEL·LA L'ACTIVITAT" }).click();
    const modal = page.getByRole("dialog", {
      name: "Cancel·lar l'activitat — Torneig d'Estiu 2026",
    });
    await expect(modal.getByRole("row")).toHaveCount(22);
    const confirm = modal.getByRole("button", { name: "CANCEL·LA I AVISA ELS 22 INSCRITS" });
    await expect(confirm).toBeDisabled();
    await modal.getByLabel("Text de l'avís").fill("Pluja forta: pistes tancades");
    await expect(confirm).toBeEnabled();
    await page.screenshot({ path: resolve(evidenceDirectory, "D7-cancellacio-1280.png") });
    await confirm.click();
    await expect(page.getByText("Activitat cancel·lada")).toBeVisible();
  });

  test("registrants of a full activity with the FIFO waitlist positions", async ({ page }) => {
    await signIn(page, "admin");
    await page.goto(`${baseUrl}/activitats/activity-taller-contactes`);
    await maintenance(page, "Taller de contactes")
      .getByRole("link", { name: "Inscrits (10) ›" })
      .click();
    await page.waitForURL("**/activitats/activity-taller-contactes/inscrits");
    await expect(
      page.getByRole("heading", { name: "Inscrits — Taller de contactes" }),
    ).toBeVisible();
    await expect(page.getByText("en llista d'espera (1)")).toBeVisible();
    await expect(page.getByText("en llista d'espera (2)")).toBeVisible();
    await page
      .getByRole("heading", { name: "Inscrits — Taller de contactes" })
      .scrollIntoViewIfNeeded();
    await page.screenshot({ path: resolve(evidenceDirectory, "D7-inscrits-1280.png") });
  });

  test("INSTRUCTOR reads D7 without actions", async ({ page }) => {
    await signIn(page, "instructor");
    await page.goto(`${baseUrl}/activitats/activity-torneig-estiu-2026`);
    const card = maintenance(page, "Torneig d'Estiu 2026");
    await expect(card.getByLabel("Títol", { exact: true })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Nova activitat" })).toHaveCount(0);
    await expect(card.getByRole("button", { name: "DESA" })).toHaveCount(0);
  });
});

test.describe("T-07-29 E4-W08 D7 follow-ups", () => {
  const followUpEvidence = resolve(import.meta.dirname, "../../../roadmap/evidence/E4-W08");

  test.beforeAll(() => {
    mkdirSync(followUpEvidence, { recursive: true });
  });

  test("S07 §6 registrants: the member filter (memberId) names the member in its chip", async ({
    page,
  }) => {
    await signIn(page, "admin");
    await page.goto(`${baseUrl}/activitats/activity-taller-contactes/inscrits`);
    const table = page.getByRole("table");
    await expect(table.getByText("en llista d'espera (1)")).toBeVisible();
    const filterSummary = page.locator("summary", { hasText: /^Filtre/u });
    const filterMenu = page.locator("details", { has: filterSummary });
    await filterSummary.click();
    await filterMenu.getByLabel("Columna").selectOption("memberId");
    const value = filterMenu.getByLabel("Valor");
    await expect(value).toBeEnabled();
    await value.selectOption({ index: 1 });
    const picked = (await value.locator("option:checked").textContent()) ?? "";
    const member = picked.replace(/ \(\d+\)$/u, "");
    await filterMenu.getByRole("button", { name: "Afegeix el filtre" }).click();
    await expect(table.getByRole("row")).toHaveCount(2);
    await expect(filterSummary).toContainText(`Filtre (1): Abonat = «${member}»`);
    await expect(table).toContainText(member);
    await page.screenshot({
      path: resolve(followUpEvidence, "D7-inscrits-filtre-abonat-1280.png"),
    });
  });

  test("R-07-14 an INSTRUCTOR sees no «Nivells» on an activity without levels (no /parameters access)", async ({
    page,
  }) => {
    await signIn(page, "instructor");
    await page.goto(`${baseUrl}/activitats/activity-torneig-estiu-2026`);
    const card = maintenance(page, "Torneig d'Estiu 2026");
    await expect(card.getByLabel("Títol", { exact: true })).toBeDisabled();
    await expect(card.getByText("Llista d'espera: sí")).toBeVisible();
    await expect(card.getByText(/^Nivells:/u)).toHaveCount(0);
    await page.screenshot({
      fullPage: true,
      path: resolve(followUpEvidence, "D7-instructor-sense-nivells-1280.png"),
    });
  });

  test("R-07-05 an activity away from the club takes 6:00 although the club opens at 7:00", async ({
    page,
  }) => {
    await signIn(page, "admin");
    await page.goto(`${baseUrl}/activitats/activity-demostracio-festa-major`);
    const card = maintenance(page, "Demostració Festa Major");
    await card.getByLabel("Hora d'inici").selectOption("06:00");
    await card.getByRole("button", { name: "DESA" }).click();
    await expect(page.getByText("Canvis desats")).toBeVisible();
    await expect(card.getByLabel("Hora d'inici")).toHaveValue("06:00");
    await page.screenshot({
      path: resolve(followUpEvidence, "D7-fora-del-club-6h-1280.png"),
    });
  });
});

/**
 * The D7 list, then `club.openingHours` with `closedDay` absent (closed), through the mock api of
 * this document: the list is drawn from the mock api, so the mock worker serves it by now. The mock
 * state lives in this document, so the caller only navigates inside the app afterwards.
 */
async function listWithClosedDay(page: Page, closedDay: string) {
  await signIn(page, "admin");
  await page.getByRole("link", { exact: true, name: "Activitats" }).click();
  await page.waitForURL("**/activitats**");
  const table = page.getByRole("table");
  await expect(table.getByRole("row").filter({ hasText: "Torneig d'Estiu 2026" })).toBeVisible();
  const status = await page.evaluate(async (closed) => {
    const headers = {
      Authorization: "Bearer mock-access-token",
      "Content-Type": "application/json",
    };
    const current = (await (await fetch("/api/v1/club/opening-hours", { headers })).json()) as {
      version: number;
    };
    const days = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"];
    const value = Object.fromEntries(
      days.filter((day) => day !== closed).map((day) => [day, { close: "22:00", open: "07:00" }]),
    );
    const result = await fetch("/api/v1/club/opening-hours", {
      body: JSON.stringify({ value, version: current.version }),
      headers,
      method: "PUT",
    });
    return result.status;
  }, closedDay);
  expect(status).toBe(200);
  return table;
}

test.describe("T-07-29 E4-W10 D7 on a day the club is closed", () => {
  const closedDayEvidence = resolve(import.meta.dirname, "../../../roadmap/evidence/E4-W10");
  const saveEvidence = resolve(import.meta.dirname, "../../../roadmap/evidence/E4-W11");

  test.beforeAll(() => {
    mkdirSync(closedDayEvidence, { recursive: true });
    mkdirSync(saveEvidence, { recursive: true });
  });

  test("R-07-05 R-02-09 at the club with linked rings, a closed Friday shows «El club està tancat aquest dia» and offers no times; E4-W11 [DESA] shows OUTSIDE_OPENING_HOURS on the date and times", async ({
    page,
  }) => {
    const table = await listWithClosedDay(page, "FRIDAY");
    await table
      .getByRole("row")
      .filter({ hasText: "Torneig d'Estiu 2026" })
      .getByRole("link")
      .first()
      .click();
    await page.waitForURL("**/activitats/activity-torneig-estiu-2026");
    const card = maintenance(page, "Torneig d'Estiu 2026");
    const message = card.getByText("El club està tancat aquest dia");
    await expect(message).toBeVisible();
    // Only «—» and the Torneig's own 18:30.
    await expect(card.getByLabel("Hora d'inici").locator("option")).toHaveCount(2);
    await message.scrollIntoViewIfNeeded();
    await page.screenshot({ path: resolve(closedDayEvidence, "D7-divendres-tancat-1280.png") });

    // Taking Central off re-syncs the published Torneig's ring blocks: the api refuses the window.
    await card.getByRole("button", { name: "Central" }).click();
    await card.getByRole("button", { name: "DESA" }).click();
    const outside = card
      .getByRole("alert")
      .filter({ hasText: "L'hora seleccionada és fora de l'horari d'obertura." });
    await expect(outside).toHaveCount(3);
    for (const id of ["activity-date-error", "activity-start-error", "activity-end-error"]) {
      await expect(card.locator(`#${id}`)).toHaveText(
        "L'hora seleccionada és fora de l'horari d'obertura.",
      );
    }
    await card.getByLabel("Data").scrollIntoViewIfNeeded();
    await page.screenshot({
      path: resolve(saveEvidence, "D7-desa-divendres-tancat-1280.png"),
    });
  });

  test("R-07-05 R-02-09 E4-W11 a draft at the club with rings on a closed Sunday: [PUBLICA] is disabled, with the closed-day note", async ({
    page,
  }) => {
    const table = await listWithClosedDay(page, "SUNDAY");
    await table
      .getByRole("row")
      .filter({ hasText: "Demostració Festa Major" })
      .getByRole("link")
      .first()
      .click();
    await page.waitForURL("**/activitats/activity-demostracio-festa-major");
    const card = maintenance(page, "Demostració Festa Major");
    const publish = card.getByRole("button", { name: "PUBLICA" });
    // Away from the club nothing is blocked: [PUBLICA] is offered.
    await expect(publish).toBeEnabled();
    await card.getByRole("switch", { name: "Al club" }).click();
    await card.getByRole("button", { name: "Central" }).click();
    await expect(card.getByText("El club està tancat aquest dia")).toBeVisible();
    await expect(publish).toBeDisabled();
    await publish.scrollIntoViewIfNeeded();
    await page.screenshot({
      path: resolve(saveEvidence, "D7-publica-diumenge-tancat-1280.png"),
    });
  });
});
