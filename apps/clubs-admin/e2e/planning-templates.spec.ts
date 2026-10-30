import { mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test, type Page } from "@playwright/test";

const baseUrl = "http://127.0.0.1:4174";
const evidenceDirectory = resolve(import.meta.dirname, "../../../roadmap/evidence/E4-W01");
const brandingCanic: unknown = JSON.parse(
  readFileSync(
    resolve(
      import.meta.dirname,
      "../../../packages/api-client/src/mocks/fixtures/branding-canic.json",
    ),
    "utf8",
  ),
);
// The D3 mockup is drawn on Wednesday 19 August 2026: week 34 generated and validated (since
// E4-W02 the mocks also generate weeks 35 and 36 in draft for the D4b calendar).
const mockupNow = new Date("2026-08-19T10:00:00+02:00");

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
  // The account's landing (E11-W02 round 2, INC-41): D1 for an ADMIN, D12 for an INSTRUCTOR.
  await page.waitForURL(/\/(tauler|agenda)$/u);
}

async function chooseTemplate(page: Page, name: string) {
  await page.getByRole("button", { name: /^dl–dv: «/u }).click();
  await page.getByRole("menuitemradio", { name }).click();
  await expect(
    page.getByRole("table", { name: `Quadre setmanal de la plantilla «${name}»` }),
  ).toBeVisible();
}

test.beforeAll(() => {
  mkdirSync(evidenceDirectory, { recursive: true });
});

test.describe("E4-W01 D3 + D3b weekly templates", () => {
  test("T-06-26 / T-06-27 designs, checks and generates the week, then opens the day per ring and per instructor", async ({
    page,
  }) => {
    await signIn(page, "admin");
    await page.getByRole("link", { name: "Plantilla setmanal" }).click();
    await page.waitForURL("**/plantilles?template=template-setmana-a");

    await expect(page.getByRole("heading", { name: "Plantilles", level: 1 })).toBeVisible();
    await expect(
      page.getByRole("table", { name: "Quadre setmanal de la plantilla «Setmana A»" }),
    ).toBeVisible();
    // The api resolves `displayDescription` in the UI language (`Accept-Language`), whatever the
    // browser language is (R-06-03, E29: «D i sup.» over the progression levels only).
    await expect(page.getByRole("button", { name: /^D i sup\. · Anna · /u }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /^F i sup\. · /u }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /and up|y sup\./u })).toHaveCount(0);
    const weeks = page.getByRole("table", { name: "Setmanes" });
    await expect(
      weeks.getByRole("row", { name: "2026 34 17/08 17/08 · 09:12 18/08 · 10:02" }),
    ).toBeVisible();
    // E4-W02: the next two weeks are generated in draft (D4b) → the proposal is week 37.
    await expect(weeks.getByRole("row", { name: "2026 35 24/08 18/08 · 09:30 —" })).toBeVisible();
    await expect(weeks.getByRole("row", { name: "2026 36 31/08 19/08 · 08:40 —" })).toBeVisible();
    await expect(page.getByRole("combobox", { name: "Setmana" })).toHaveValue("2026-09-07");
    await expect(page.getByRole("combobox", { name: "Setmana" })).toContainText(
      "Setmana del 7 al 13 de setembre",
    );
    await expect(
      page.getByRole("table", { name: "Cobertura per nivell (places de la setmana)" }),
    ).toBeVisible();
    await page.screenshot({
      fullPage: true,
      path: resolve(evidenceDirectory, "D3-plantilles-setmana-a-1280.png"),
    });

    await chooseTemplate(page, "Setmana B");
    await expect(
      page.getByText(
        "Incoherència: dimecres 20:00 — pista Central amb dues classes alhora. Mentre hi hagi incoherències no es poden generar classes d'aquesta plantilla.",
      ),
    ).toBeVisible();
    await expect(page.getByText("bloquejat: 1 incoherència a la plantilla")).toBeVisible();
    await expect(page.getByRole("button", { name: "GENERAR CLASSES" })).toBeDisabled();

    await page.getByRole("button", { name: "Crear classe", exact: true }).click();
    const card = page.getByRole("region", { name: "Crear classe" });
    await card.getByLabel("Franja").selectOption({ label: "18:50–19:50" });
    await card.getByLabel("Instructor").selectOption({ label: "Anna" });
    await card.getByRole("radio", { name: "Central" }).click();
    await card.getByRole("button", { name: "B", exact: true }).click();
    await card.getByRole("button", { name: "C", exact: true }).click();
    await expect(card.getByRole("radio", { name: "dilluns" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    await expect(card.getByLabel("Descripció")).toHaveAttribute("placeholder", "B+C");
    await page.screenshot({
      fullPage: true,
      path: resolve(evidenceDirectory, "D3-plantilles-1280.png"),
    });

    await chooseTemplate(page, "Setmana A");
    await page.getByRole("button", { name: "GENERAR CLASSES" }).click();
    const confirmation = page.getByRole("dialog", { name: "Generar classes — per setmanes" });
    await expect(
      confirmation.getByText(
        "Es generaran com a esborrany les classes de la setmana del 07/09/2026",
        { exact: true },
      ),
    ).toBeVisible();
    const generation = page.waitForRequest(
      (request) =>
        request.method() === "POST" && request.url().endsWith("/weeks/week-2026-09-07/generation"),
    );
    await confirmation.getByRole("button", { name: "GENERAR CLASSES" }).click();
    expect((await generation).headers()["idempotency-key"]).toMatch(/^[0-9a-f-]{36}$/u);
    await expect(page.getByText("46 classes generades")).toBeVisible();
    await expect(weeks.getByRole("row", { name: "2026 37 07/09 19/08 · 10:00 —" })).toBeVisible();
    await expect(page.getByRole("combobox", { name: "Setmana" })).toContainText(
      "Setmana del 14 al 20 de setembre",
    );

    await page.getByRole("button", { name: /^dilluns/iu }).click();
    await page.waitForURL("**/plantilles/template-setmana-a/dia/monday");
    await expect(page.getByText("Plantilla: «Setmana A» (dl–dv)")).toBeVisible();
    const day = page.getByRole("table", { name: "Plantilla «Setmana A» · dilluns" });
    await expect(day.getByRole("columnheader")).toHaveText([
      /Muntanya/iu,
      /Central/iu,
      /Carretera/iu,
      /Cadells/iu,
      /Petita/iu,
      /Sense/iu,
    ]);
    await page.screenshot({
      fullPage: true,
      path: resolve(evidenceDirectory, "D3b-dia-per-pista-1280.png"),
    });

    await page.getByRole("button", { name: "Visió per instructor" }).click();
    await expect(day.getByRole("columnheader")).toHaveText([
      /Laura/iu,
      /Marc/iu,
      /Anna/iu,
      /Sergio/iu,
    ]);
    await page.screenshot({
      fullPage: true,
      path: resolve(evidenceDirectory, "D3b-dia-per-instructor-1280.png"),
    });

    await page.getByRole("button", { name: "Tornar a la visió setmanal" }).click();
    await page.waitForURL("**/plantilles?template=template-setmana-a");
    await expect(
      page.getByRole("table", { name: "Quadre setmanal de la plantilla «Setmana A»" }),
    ).toBeVisible();
  });

  test("T-06-26 INSTRUCTOR reads D3 without any action (A22 c)", async ({ page }) => {
    await signIn(page, "instructor");
    await page.getByRole("link", { name: "Plantilla setmanal" }).click();
    await page.waitForURL("**/plantilles?template=template-setmana-a");

    await expect(
      page.getByRole("table", { name: "Quadre setmanal de la plantilla «Setmana A»" }),
    ).toBeVisible();
    for (const name of [
      "Nova",
      "Duplica",
      "Canvia el nom",
      "Esborra plantilla",
      "Franja",
      "Crear classe",
      "GENERAR CLASSES",
    ]) {
      await expect(page.getByRole("button", { name, exact: true })).toHaveCount(0);
    }
    await expect(page.getByRole("region", { name: "Crear classe" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "A · Laura · Petita" })).toHaveCount(0);
    await expect(page.getByRole("group", { name: "A · Laura · Petita" }).first()).toBeVisible();
    await expect(page.getByRole("table", { name: "Setmanes" })).toBeVisible();
    await expect(
      page.getByRole("table", { name: "Cobertura per nivell (places de la setmana)" }),
    ).toBeVisible();
    await page.screenshot({
      fullPage: true,
      path: resolve(evidenceDirectory, "D3-plantilles-instructor-1280.png"),
    });

    await page.getByRole("button", { name: /^dimecres/iu }).click();
    await page.waitForURL("**/plantilles/template-setmana-a/dia/wednesday");
    await expect(
      page.getByRole("table", { name: "Plantilla «Setmana A» · dimecres" }),
    ).toBeVisible();
  });
});

test.describe("T-06-26 template management", () => {
  for (const width of [1280, 375]) {
    test(`renames and retires a template at ${String(width)}px`, async ({ page }) => {
      const captures = resolve(
        import.meta.dirname,
        "../../../roadmap/evidence/2026-10-30-template-actions",
      );
      mkdirSync(captures, { recursive: true });
      await signIn(page, "admin");
      await page.goto(`${baseUrl}/plantilles`);
      await expect(
        page.getByRole("table", { name: "Quadre setmanal de la plantilla «Setmana A»" }),
      ).toBeVisible();
      await page.setViewportSize({ height: 900, width });
      await page.getByRole("button", { name: "Canvia el nom", exact: true }).click();
      const rename = page.getByRole("dialog", { name: "Canvia el nom" });
      await expect(rename.getByLabel("Nom")).toHaveValue("Setmana A");
      await rename.getByLabel("Nom").fill("Setmana de tardor");
      // Keyboard submission also exercises the dialog's labelled form and focus trap.
      await rename.getByLabel("Nom").press("Enter");
      await expect(rename).toHaveCount(0);
      await expect(page.getByRole("button", { name: "dl–dv: «Setmana de tardor»" })).toBeVisible();
      await page.screenshot({
        path: resolve(captures, `renamed-${String(width)}.png`),
        fullPage: true,
      });
      await page.getByRole("button", { name: "Esborra plantilla", exact: true }).click();
      const confirmation = page.getByRole("dialog", { name: "Esborra plantilla" });
      await expect(confirmation).toContainText("Setmana de tardor");
      await expect(confirmation).toContainText("Les classes ja generades es conservaran.");
      await page.screenshot({
        path: resolve(captures, `remove-confirmation-${String(width)}.png`),
        fullPage: true,
      });
      await confirmation.getByRole("button", { name: "Cancel·la" }).click();
      await expect(
        page.getByRole("table", { name: "Quadre setmanal de la plantilla «Setmana de tardor»" }),
      ).toBeVisible();
      await page.getByRole("button", { name: "Esborra plantilla", exact: true }).click();
      const removal = page.waitForRequest(
        (request) =>
          request.method() === "PATCH" &&
          request.url().endsWith("/week-templates/template-setmana-a"),
      );
      await confirmation.getByRole("button", { name: "Esborra plantilla" }).click();
      expect((await removal).postDataJSON()).toMatchObject({ active: false, version: 2 });
      await expect(confirmation).toHaveCount(0);
      await expect(page).toHaveURL(/template=template-setmana-b$/u);
      await expect(
        page.getByRole("table", { name: "Quadre setmanal de la plantilla «Setmana B»" }),
      ).toBeVisible();
      await page.getByRole("button", { name: "dl–dv: «Setmana B»" }).click();
      await expect(page.getByRole("menuitemradio", { name: "Setmana de tardor" })).toHaveCount(0);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      ).toBe(true);
    });
  }
});

test.describe("T-06-26 E4-W10 D3 when a day of the kind is closed", () => {
  // E4-W11 step 4 rewrites the note as a label («Dies de tancament: …»): the capture shows it.
  const closedDayEvidence = resolve(import.meta.dirname, "../../../roadmap/evidence/E4-W11");

  test.beforeAll(() => {
    mkdirSync(closedDayEvidence, { recursive: true });
  });

  test("R-06-01 R-02-09 a closed Monday: the WEEKDAYS band drawer names it and [Desa] stays disabled", async ({
    page,
  }) => {
    await signIn(page, "admin");
    await page.getByRole("link", { name: "Plantilla setmanal" }).click();
    await page.waitForURL("**/plantilles?template=template-setmana-a");
    await expect(
      page.getByRole("table", { name: "Quadre setmanal de la plantilla «Setmana A»" }),
    ).toBeVisible();
    // Monday absent from club.openingHours, through the mock api of this document.
    const status = await page.evaluate(async () => {
      const headers = {
        Authorization: "Bearer mock-access-token",
        "Content-Type": "application/json",
      };
      const current = (await (await fetch("/api/v1/club/opening-hours", { headers })).json()) as {
        version: number;
      };
      const days = ["TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"];
      const value = Object.fromEntries(days.map((day) => [day, { close: "22:00", open: "07:00" }]));
      const result = await fetch("/api/v1/club/opening-hours", {
        body: JSON.stringify({ value, version: current.version }),
        headers,
        method: "PUT",
      });
      return result.status;
    });
    expect(status).toBe(200);
    // The day view and back remount D3, which reads the new opening hours (the sidebar links load
    // a new document, whose mock api starts again from its fixtures).
    await page.getByRole("button", { name: /^dimecres/iu }).click();
    await page.waitForURL("**/plantilles/template-setmana-a/dia/wednesday");
    await page.getByRole("button", { name: "Tornar a la visió setmanal" }).click();
    await page.waitForURL("**/plantilles?template=template-setmana-a");
    await expect(
      page.getByRole("table", { name: "Quadre setmanal de la plantilla «Setmana A»" }),
    ).toBeVisible();

    await page.getByRole("button", { name: "Franja", exact: true }).click();
    const drawer = page.getByRole("dialog", { name: "Nova franja" });
    await expect(
      drawer.getByText("Dies de tancament: dilluns. Aquesta plantilla no admet franges."),
    ).toBeVisible();
    await drawer.getByLabel("Inici").fill("10:00");
    await drawer.getByLabel("Final").fill("11:00");
    await expect(drawer.getByRole("button", { name: "Desa" })).toBeDisabled();
    await page.screenshot({
      fullPage: true,
      path: resolve(closedDayEvidence, "D3-franja-dies-de-tancament-1280.png"),
    });
  });
});
