import { mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test, type Page } from "@playwright/test";

const baseUrl = "http://127.0.0.1:4174";
const evidenceDirectory = resolve(import.meta.dirname, "../../../roadmap/evidence/E6-W03");
const brandingCanic: unknown = JSON.parse(
  readFileSync(
    resolve(
      import.meta.dirname,
      "../../../packages/api-client/src/mocks/fixtures/branding-canic.json",
    ),
    "utf8",
  ),
);
// The D12 world (E6-W03, `AGENDA_MOCK_NOW`): Monday 10 August 2026, 19:30 club-local.
const agendaNow = new Date("2026-08-10T19:30:00+02:00");

test.use({ viewport: { height: 800, width: 1280 } });

test.beforeAll(() => {
  mkdirSync(evidenceDirectory, { recursive: true });
});

async function signIn(page: Page, scenario: "admin" | "agendaNoTraining" | "instructor") {
  await page.clock.setFixedTime(agendaNow);
  await page.addInitScript(
    ({ cachedBranding, mockScenario }) => {
      localStorage.setItem("agilityhub.locale", "ca");
      localStorage.setItem("agilityhub.mockScenario", mockScenario);
      localStorage.setItem(`agilityhub.branding:${location.host}`, JSON.stringify(cachedBranding));
    },
    { cachedBranding: brandingCanic, mockScenario: scenario },
  );
  await page.goto(`${baseUrl}/entrar`);
  await page
    .getByLabel("Correu electrònic")
    .fill(`${scenario === "instructor" ? "instructor" : "admin"}@example.test`);
  await page.getByRole("button", { name: "Tinc contrasenya" }).click();
  await page.getByLabel("Contrasenya").fill("secret-password");
  await page.getByRole("button", { name: "ENTRA" }).click();
  await page.waitForURL("**/tauler");
}

async function iconsPainted(page: Page) {
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
}

/** A class cell of the grid by its title and subtitle. */
function classCell(page: Page, title: string, subtitle: string) {
  return page
    .locator(".week-agenda button.ah-schedule-cell")
    .filter({ hasText: title })
    .filter({ has: page.locator(".ah-schedule-cell__subtitle", { hasText: subtitle }) });
}

test.describe("E6-W03 T-10-29 D12 «Agenda de la setmana» against MSW", () => {
  test("the instructor's week, the selected class's list saved through the same PUT as 21, the PDF, and the way to D13 and back", async ({
    page,
  }) => {
    await signIn(page, "instructor");
    await page.getByRole("link", { name: "Agenda de la setmana" }).click();
    await page.waitForURL("**/agenda");
    await expect(page.getByText("Setmana actual")).toBeVisible();
    await expect(page.getByText(/^del 10 al 15 d.agost$/u)).toBeVisible();
    const table = page.locator(".week-agenda table");
    await expect(table.getByRole("columnheader")).toHaveText([
      "dl 10",
      "dt 11",
      "dc 12",
      "dj 13",
      "dv 14",
      "ds 15",
    ]);
    await expect(page.getByText("8:00 Reserva")).toBeVisible();
    await expect(page.getByText("16:00–18:00 Bloqueig")).toBeVisible();
    await expect(page.getByText("Carretera — manteniment")).toBeVisible();
    // Half height: the training block is half the class cell's height (R-10-15).
    const trainingHeight = await page
      .locator(".week-agenda__half .ah-schedule-cell")
      .first()
      .evaluate((cell) => cell.getBoundingClientRect().height);
    const classHeight = await classCell(page, "A i B", "Central · Estel")
      .first()
      .evaluate((cell) => cell.getBoundingClientRect().height);
    expect(Math.abs(trainingHeight * 2 - classHeight)).toBeLessThan(2);
    await iconsPainted(page);
    await page.screenshot({ path: resolve(evidenceDirectory, "D12-agenda-1280.png") });

    await classCell(page, "B i C", "Central · Marc · 2 espera").click();
    const panel = page.locator(".week-agenda__panel");
    await expect(panel.getByRole("heading", { level: 2 })).toHaveText(
      "dl 10 · 18:50 · B i C · Central · Marc — 4/5 · 2 en espera",
    );
    await expect(panel.getByRole("link")).toHaveText([
      "Laura + Duna",
      "Marc + Chun-li",
      "Anna + Nass",
      "Eva + Fish",
      "Pau + Blat",
    ]);
    await expect(panel.getByText("2 tasques pendents")).toBeVisible();
    await expect(panel.getByText("ha avisat — plaça alliberada")).toBeVisible();
    await expect(panel.getByText("avís demà a les 8:00")).toBeVisible();
    await expect(panel.getByText("En espera: Júlia + Kira · Roser + Lluna")).toBeVisible();
    await expect(page.getByText(/seleccionada: dl 18:50$/u)).toBeVisible();
    await iconsPainted(page);
    await page.screenshot({
      fullPage: true,
      path: resolve(evidenceDirectory, "D12-llista-assistents-1280.png"),
    });

    const pau = panel.getByRole("button", { name: /^Assistència de Pau \+ Blat/u });
    await pau.click();
    await expect(pau).toHaveText("present");
    const put = page.waitForRequest(
      (request) => request.method() === "PUT" && request.url().endsWith("/attendance"),
    );
    await panel.getByRole("button", { name: "Desa la llista" }).click();
    const request = await put;
    expect(request.postDataJSON()).toEqual({
      items: [{ bookingId: "b-d12-5", state: "PRESENT" }],
      version: 3,
    });
    expect(request.headers()["idempotency-key"]).toMatch(/^[0-9a-f-]{36}$/u);
    await expect(panel.getByText("Llista desada")).toBeVisible();

    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "PDF" }).click();
    expect((await download).suggestedFilename()).toBe("agenda-2026-08-10.pdf");

    // A name opens D13 (a normal navigation); back on the agenda the class is still selected.
    await panel.getByRole("button", { name: /^Assistència de Eva \+ Fish/u }).click();
    await panel.getByRole("link", { name: "Laura + Duna" }).click();
    await page.waitForURL("**/alumnes/dog-duna");
    await expect(page.getByRole("heading", { level: 1, name: "Laura + Duna" })).toBeVisible();
    await page.goBack();
    await page.waitForURL("**/agenda?classe=c-0810-1850-bc");
    await expect(page.locator(".week-agenda__panel").getByRole("heading", { level: 2 })).toHaveText(
      "dl 10 · 18:50 · B i C · Central · Marc — 4/5 · 2 en espera",
    );
    await expect(
      page.locator(".week-agenda__panel").getByRole("button", { name: /^Assistència de Eva/u }),
    ).toHaveText("—");
  });

  test("the instructor filter asks for «Els meus» without hiding trainings or blocks", async ({
    page,
  }) => {
    await signIn(page, "instructor");
    await page.goto(`${baseUrl}/agenda`);
    await expect(page.getByText("8:00 Reserva")).toBeVisible();
    const week = page.waitForRequest((request) =>
      request.url().includes("/instructor/week?instructorId=me"),
    );
    await page.getByRole("combobox", { name: "Instructor" }).selectOption("me");
    await week;
    await expect(classCell(page, "C i sup.", "Muntanya · Marc")).toHaveCount(0);
    await expect(page.getByText("8:00 Reserva")).toBeVisible();
    await expect(page.getByText("16:00–18:00 Bloqueig")).toBeVisible();
    await expect(page).toHaveURL(/\/agenda\?instructor=me$/u);
  });

  test("S10 §9: a club without FREE_TRAINING shows no training cells and no «Reserva = …» legend", async ({
    page,
  }) => {
    await signIn(page, "agendaNoTraining");
    await page.goto(`${baseUrl}/agenda`);
    await expect(page.getByText("16:00–18:00 Bloqueig")).toBeVisible();
    await expect(page.getByText(/ Reserva$/u)).toHaveCount(0);
    await expect(page.locator(".week-agenda__legend")).toHaveText(
      "Bloqueig = pista tancada, amb el motiu · clic en una classe: inscrits i passar llista",
    );
    await iconsPainted(page);
    await page.screenshot({ path: resolve(evidenceDirectory, "D12-sense-entrenaments-1280.png") });
  });
});
