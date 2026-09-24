import { mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test, type Page } from "@playwright/test";

const baseUrl = "http://127.0.0.1:4174";
const evidenceDirectory = resolve(import.meta.dirname, "../../../roadmap/evidence/E4-W02");
const brandingCanic: unknown = JSON.parse(
  readFileSync(
    resolve(
      import.meta.dirname,
      "../../../packages/api-client/src/mocks/fixtures/branding-canic.json",
    ),
    "utf8",
  ),
);
// The D4 mockup is drawn on Wednesday 12 August 2026: week 33 (10–16/08) validated and current,
// week 34 (17–23/08) generated in draft.
const mockupNow = new Date("2026-08-12T10:00:00+02:00");

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

function grid(page: Page, range: string) {
  return page.getByRole("table", { name: `Calendari de classes · del ${range}` });
}

test.beforeAll(() => {
  mkdirSync(evidenceDirectory, { recursive: true });
});

test.describe("E4-W02 D4 + D4b + D4c class calendar", () => {
  test("T-06-28 edits and cancels a class with registrants, blocks a ring, validates the draft week and opens the day view", async ({
    page,
  }) => {
    await signIn(page, "admin");
    await page.getByRole("link", { name: "Calendari de classes" }).click();
    await page.waitForURL("**/calendari?estat=actives&setmana=2026-08-10");
    const week = grid(page, "10 al 16 d’agost");
    await expect(week).toBeVisible();
    await expect(page.getByRole("button", { name: "Setmana", exact: true })).toContainText(
      "Setmana en curs · del 10 al 16 d’agost",
    );
    await expect(week.getByRole("columnheader")).toHaveText([
      /dl 10/iu,
      /dt 11/iu,
      /dc 12/iu,
      /dj 13/iu,
      /dv 14/iu,
      /ds 15/iu,
    ]);
    await expect(
      week.getByRole("button", { name: /^Carretera bloquejada · manteniment 16:00–18:00$/u }),
    ).toBeVisible();
    await expect(
      week.getByRole("button", {
        name: /^dc 12 9:30 · Cadells · 0\/5 · anul·lada · revisió de les 7:30/u,
      }),
    ).toBeVisible();

    await week.getByRole("button", { name: /^dc 12 18:50 · B\+C · 4\/5 \+2/u }).click();
    const card = page.getByRole("region", { name: /^Classe seleccionada/u });
    await expect(card).toContainText("Classe seleccionada — dc 12 · 18:50 · B+C · Central · Marc");
    await expect(
      page.getByRole("button", {
        name: "dj 18:50 — Marc assignat a dues pistes alhora (Cadells i Petita)",
      }),
    ).toBeVisible();
    await page.screenshot({
      fullPage: true,
      path: resolve(evidenceDirectory, "D4-calendari-actives-1280.png"),
    });

    await card.getByRole("button", { name: "ANUL·LA LA CLASSE" }).click();
    const modal = page.getByRole("dialog", {
      name: "Anul·lar la classe — dc 12 · 18:50 · B+C · Central · Marc",
    });
    await expect(
      modal.getByRole("table", { name: "Alumnes inscrits" }).getByRole("row"),
    ).toHaveCount(4);
    const confirm = modal.getByRole("button", { name: "ANUL·LA I AVISA ELS 4 ALUMNES" });
    await expect(confirm).toBeDisabled();
    await modal
      .getByLabel("Text de l'avís")
      .fill(
        "La classe de dimecres 12 a les 18:50 (B+C, pista Central) queda anul·lada per la pluja. Podeu reservar-ne una altra des de l'app. Disculpeu les molèsties!",
      );
    await expect(confirm).toBeEnabled();
    await page.screenshot({
      fullPage: true,
      path: resolve(evidenceDirectory, "D4c-anullar-classe-1280.png"),
    });
    const cancellation = page.waitForRequest(
      (request) => request.method() === "POST" && request.url().endsWith("/cancellation"),
    );
    await confirm.click();
    expect((await cancellation).headers()["idempotency-key"]).toMatch(/^[0-9a-f-]{36}$/u);
    await expect(page.getByText("Classe anul·lada")).toBeVisible();
    await expect(
      week.getByRole("button", { name: /^dc 12 18:50 · B\+C · 0\/5 · anul·lada · pel club/u }),
    ).toBeVisible();

    await page.getByRole("button", { name: "Anul·lades", exact: true }).click();
    await page.waitForURL("**/calendari?estat=anul%C2%B7lades&setmana=2026-08-10");
    await expect(week.locator("button.ah-schedule-cell--struck")).toHaveCount(2);
    await page.screenshot({
      fullPage: true,
      path: resolve(evidenceDirectory, "D4-calendari-anullades-1280.png"),
    });

    await page.getByRole("button", { name: "Actives", exact: true }).click();
    await page.getByRole("button", { name: "Bloqueja pista" }).click();
    const drawer = page.getByRole("dialog", { name: "Bloqueja pista" });
    await drawer.getByLabel("Pista").selectOption({ label: "Cadells" });
    await drawer.getByLabel("Data").fill("13082026");
    await expect(drawer.getByLabel("Data")).toHaveValue("13/08/2026");
    await drawer.getByLabel("De", { exact: true }).selectOption("18:00");
    await drawer.getByLabel("A", { exact: true }).selectOption("19:00");
    await drawer.getByLabel("Nota").fill("Reg de la gespa");
    await drawer.getByRole("button", { name: "DESA EL BLOQUEIG" }).click();
    await expect(drawer.getByRole("list", { name: "Coincideix amb:" })).toContainText(
      "dj 18:50 · Cadells · 18:50–19:50",
    );
    await page.screenshot({
      fullPage: true,
      path: resolve(evidenceDirectory, "D4-bloqueja-pista-1280.png"),
    });
    await drawer.getByLabel("De", { exact: true }).selectOption("16:00");
    await drawer.getByLabel("A", { exact: true }).selectOption("17:00");
    await drawer.getByRole("button", { name: "DESA EL BLOQUEIG" }).click();
    await expect(page.getByText("Bloqueig desat")).toBeVisible();
    await expect(
      week.getByRole("button", { name: /^Cadells bloquejada · manteniment 16:00–17:00$/u }),
    ).toBeVisible();

    await page.getByRole("button", { name: "Esborrany", exact: true }).click();
    await page.waitForURL("**/calendari?estat=esborrany&setmana=2026-08-17");
    const drafts = grid(page, "17 al 23 d’agost");
    await expect(drafts.locator(".ah-schedule-cell--dashed")).toHaveCount(28);
    await drafts.getByRole("button", { name: /^dt 18 8:30 · F\+G/u }).click();
    await expect(page.getByRole("region", { name: /^Classe seleccionada/u })).toContainText(
      "Classe seleccionada — dt 18 · 8:30 · F+G · Central · Laura",
    );
    const validation = page.getByRole("region", { name: "Validació de la setmana" });
    await expect(validation).toContainText(
      "Setmana vinent · del 17 al 23 d’agost · 28 classes en esborrany · cap incoherència",
    );
    await page.screenshot({
      fullPage: true,
      path: resolve(evidenceDirectory, "D4b-calendari-esborrany-1280.png"),
    });
    await validation.getByRole("button", { name: "VALIDAR LA SETMANA" }).click();
    await page
      .getByRole("dialog", { name: "Validació de la setmana" })
      .getByRole("button", { name: "VALIDAR LA SETMANA" })
      .click();
    await expect(page.getByText("28 classes validades")).toBeVisible();
    await page.waitForURL("**/calendari?estat=actives&setmana=2026-08-17");
    await expect(drafts.locator("button.ah-schedule-cell")).toHaveCount(28);
    await expect(drafts.locator(".ah-schedule-cell--dashed")).toHaveCount(0);

    await page.getByRole("button", { name: "Setmana anterior" }).click();
    await page.waitForURL("**/calendari?estat=actives&setmana=2026-08-10");
    await week.getByRole("button", { name: "dc 12", exact: true }).click();
    await page.waitForURL("**/calendari/dia/2026-08-12?estat=actives");
    const day = page.getByRole("table", { name: /^Calendari de classes · dimecres/u });
    await expect(day.getByRole("columnheader")).toHaveText([
      /Muntanya/iu,
      /Central/iu,
      /Carretera/iu,
      /Cadells/iu,
      /Petita/iu,
    ]);
    await expect(day.getByText("Bloq. manteniment")).toBeVisible();
    await page.screenshot({
      fullPage: true,
      path: resolve(evidenceDirectory, "D4-dia-1280.png"),
    });
    await page.getByRole("button", { name: "Visió per instructor" }).click();
    await expect(day.getByRole("columnheader")).toHaveText([/Laura/iu, /Marc/iu, /Anna/iu]);
    await page.getByRole("button", { name: "Tornar a la visió setmanal" }).click();
    await page.waitForURL("**/calendari?estat=actives&setmana=2026-08-10");
    await expect(week).toBeVisible();
  });

  test("T-06-28 INSTRUCTOR reads D4 without any action (A22 c)", async ({ page }) => {
    await signIn(page, "instructor");
    await page.getByRole("link", { name: "Calendari de classes" }).click();
    await page.waitForURL("**/calendari?estat=actives&setmana=2026-08-10");
    const week = grid(page, "10 al 16 d’agost");
    await expect(week).toBeVisible();
    for (const name of ["Crear classe", "Bloqueja pista"]) {
      await expect(page.getByRole("button", { name, exact: true })).toHaveCount(0);
    }
    await expect(week.getByRole("group", { name: /^Carretera bloquejada/u })).toBeVisible();
    await week.getByRole("button", { name: /^dc 12 18:50 · B\+C/u }).click();
    const card = page.getByRole("region", { name: /^Classe seleccionada/u });
    await expect(card.getByRole("button", { name: "ACCEPTA" })).toHaveCount(0);
    await expect(card.getByRole("button", { name: "ANUL·LA LA CLASSE" })).toHaveCount(0);
    await expect(card.getByRole("combobox")).toHaveCount(0);
    await page.getByRole("button", { name: "Esborrany", exact: true }).click();
    await expect(grid(page, "17 al 23 d’agost")).toBeVisible();
    await expect(page.getByRole("button", { name: "VALIDAR LA SETMANA" })).toHaveCount(0);
  });
});
