import { mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test, type Page } from "@playwright/test";

const baseUrl = "http://127.0.0.1:4174";
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
// The S09 mock world (E5-W02): Monday 3 August 2026, 7:10 club-local.
const trainingNow = new Date("2026-08-03T07:10:00+02:00");

test.use({ viewport: { height: 900, width: 1280 } });

test.beforeAll(() => {
  mkdirSync(evidenceDirectory, { recursive: true });
});

async function signIn(page: Page, scenario: "admin" | "instructor") {
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
  await page.getByLabel("Correu electrònic").fill(`${scenario}@example.test`);
  await page.getByRole("button", { name: "Tinc contrasenya" }).click();
  await page.getByLabel("Contrasenya").fill("secret-password");
  await page.getByRole("button", { name: "ENTRA" }).click();
  await page.waitForURL("**/tauler");
}

test.describe("E5-W02 D12 card «Reservar o bloquejar pista (sense alumne)»", () => {
  test("T-09-40 (D12) an instructor reserves Petita on Thursday 13 from the card", async ({
    page,
  }) => {
    await signIn(page, "instructor");
    await page.goto(`${baseUrl}/agenda`);
    const card = page.locator(".ring-block-card");
    await expect(
      card.getByRole("heading", { name: "Reservar o bloquejar pista (sense alumne)" }),
    ).toBeVisible();
    await expect(card.getByRole("group", { name: "Tipus" }).getByRole("button")).toHaveText([
      "Reserva de pista",
      "Bloqueig",
    ]);
    // D12 mockup: «dj 13 · 18:10–19:10», Petita; the fixed 30-min grid gives 18:00–19:00.
    const combobox = (name: string) => card.getByRole("combobox", { exact: true, name });
    await combobox("Dia").selectOption("2026-08-13");
    await combobox("Pista").selectOption("ring-petita");
    await expect(combobox("De").locator("option[value='18:00']")).toHaveCount(1);
    await combobox("De").selectOption("18:00");
    await combobox("A").selectOption("19:00");
    await expect(combobox("Motiu")).toHaveValue("PRIVATE_CLASS");
    await expect(card.getByRole("button", { name: "Reserva", exact: true })).toBeEnabled();
    await card.screenshot({ path: resolve(evidenceDirectory, "D12-targeta-pista-1280.png") });
    await page.screenshot({ path: resolve(evidenceDirectory, "D12-pagina-agenda-1280.png") });

    const posted = page.waitForRequest(
      (request) => request.method() === "POST" && request.url().endsWith("/ring-blocks"),
    );
    await card.getByRole("button", { name: "Reserva", exact: true }).click();
    const request = await posted;
    expect(request.postDataJSON()).toEqual({
      from: "2026-08-13T16:00:00.000Z",
      kind: "RESERVATION",
      note: null,
      reason: "PRIVATE_CLASS",
      ringId: "ring-petita",
      to: "2026-08-13T17:00:00.000Z",
    });
    expect(request.headers()["idempotency-key"]).toMatch(/^[0-9a-f-]{36}$/u);
    await expect(card.getByRole("status")).toHaveText("Pista reservada");
    // The block now occupies 18:00–19:00: the card no longer offers 18:00 on Petita.
    await expect(combobox("De").locator("option[value='18:00']")).toHaveCount(0);
  });
});
