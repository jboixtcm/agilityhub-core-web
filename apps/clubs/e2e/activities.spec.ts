import { mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test, type Page } from "@playwright/test";

const baseUrl = "http://127.0.0.1:4173";
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
// The 03 and 04 mockups are read at the beginning of August 2026 (the Torneig is on 7/08).
const mockupNow = new Date("2026-08-04T10:00:00+02:00");

async function login(page: Page) {
  await page.clock.setFixedTime(mockupNow);
  await page.addInitScript(
    ({ cachedBranding }) => {
      localStorage.setItem("agilityhub.locale", "ca");
      localStorage.setItem("agilityhub.mockScenario", "member");
      localStorage.setItem(`agilityhub.branding:${location.host}`, JSON.stringify(cachedBranding));
    },
    { cachedBranding: brandingCanic },
  );
  await page.goto(`${baseUrl}/entrar`);
  await page.getByLabel("Correu electrònic").fill("laura@example.test");
  await page.getByLabel("Contrasenya").fill("secret-password");
  await page.getByRole("button", { exact: true, name: "ENTRA" }).click();
  await page.waitForURL("**/inici");
}

test.beforeAll(() => {
  mkdirSync(evidenceDirectory, { recursive: true });
});

test.describe("E4-W04 activities in the app", () => {
  test("T-07-30 03 row, 04 block, detail registration and waitlist", async ({ page }) => {
    await login(page);
    const reservations = page.getByRole("region", { name: "Les meves reserves" });
    const tournament = reservations.getByRole("link", { name: /Torneig d'Estiu 2026/u });
    await expect(tournament).toContainText("inscrita");
    await expect(tournament).toContainText("Divendres 7 · 18:30–20:30 · totes les pistes");
    await page.screenshot({ path: resolve(evidenceDirectory, "03-activitat-inscrita-375.png") });

    await page.getByRole("link", { name: "Reservar" }).click();
    await page.waitForURL("**/reservar");
    const block = page.getByRole("region", { name: "Activitats" });
    await expect(block.getByRole("link", { name: /Seminari de handling/u })).toContainText(
      "Seminari de handling · ds 12/09 · 9:00",
    );
    await expect(block.getByRole("link", { name: /Seminari de handling/u })).toContainText(
      "6 places",
    );
    await expect(block.getByRole("link", { name: /Taller de contactes/u })).toContainText(
      "Completa · ⏳2",
    );
    await page.screenshot({ path: resolve(evidenceDirectory, "04-activitats-375.png") });

    await block.getByRole("link", { name: /Seminari de handling/u }).click();
    await page.waitForURL("**/activitats/activity-seminari-handling");
    await expect(page.getByRole("heading", { name: "Seminari de handling" })).toBeVisible();
    await expect(page.getByText("6 places lliures de 12")).toBeVisible();
    await page.screenshot({ path: resolve(evidenceDirectory, "activitat-detall-375.png") });
    await page.getByRole("button", { name: "INSCRIU-M'HI" }).click();
    await expect(page.getByText("T'hi has inscrit")).toBeVisible();
    await expect(page.getByRole("button", { name: "ANUL·LA LA INSCRIPCIÓ" })).toBeVisible();

    await page.goto(`${baseUrl}/activitats/activity-taller-contactes`);
    await page.getByRole("button", { name: "APUNTA'M A LA LLISTA D'ESPERA" }).click();
    const dialog = page.getByRole("dialog", {
      name: "Vols apuntar-te a la llista d'espera de Taller de contactes?",
    });
    await dialog.getByRole("button", { name: "APUNTA'M A LA LLISTA D'ESPERA" }).click();
    await expect(page.getByText("Ets a la llista d'espera")).toBeVisible();
    await expect(page.getByText("en llista d'espera (3)")).toBeVisible();
    await page.screenshot({ path: resolve(evidenceDirectory, "activitat-llista-espera-375.png") });
  });

  test("E4-W08 R-07-09/10 impersonated: the cancellation asks for «Motiu» and sends it", async ({
    page,
  }) => {
    const followUpEvidence = resolve(import.meta.dirname, "../../../roadmap/evidence/E4-W08");
    mkdirSync(followUpEvidence, { recursive: true });
    await page.clock.setFixedTime(mockupNow);
    await page.addInitScript(
      ({ cachedBranding }) => {
        localStorage.setItem("agilityhub.locale", "ca");
        localStorage.setItem("agilityhub.mockScenario", "impersonated");
        localStorage.setItem(
          `agilityhub.branding:${location.host}`,
          JSON.stringify(cachedBranding),
        );
      },
      { cachedBranding: brandingCanic },
    );
    const bodies: unknown[] = [];
    page.on("request", (request) => {
      if (/\/activity-registrations\/[^/]+\/cancellation$/u.test(new URL(request.url()).pathname)) {
        bodies.push(request.postDataJSON());
      }
    });
    await page.goto(
      `${baseUrl}/activitats/activity-torneig-estiu-2026#impersonation=mock-impersonation-token`,
    );
    await expect(page.getByText("Estàs veient l'app com Laura Serra Vidal")).toBeVisible();
    await page.getByRole("button", { name: "INSCRIU-M'HI" }).click();
    await expect(page.getByText("T'hi has inscrit")).toBeVisible();
    await page.getByRole("button", { name: "ANUL·LA LA INSCRIPCIÓ" }).click();
    const dialog = page.getByRole("dialog", {
      name: "Vols anul·lar la inscripció a Torneig d'Estiu 2026?",
    });
    const confirm = dialog.getByRole("button", { name: "ANUL·LA LA INSCRIPCIÓ" });
    await expect(confirm).toBeDisabled();
    await dialog.getByLabel("Motiu").fill("Ho demana per telèfon");
    await expect(confirm).toBeEnabled();
    await page.screenshot({
      path: resolve(followUpEvidence, "activitat-anullacio-motiu-375.png"),
    });
    await confirm.click();
    await expect(page.getByText("Inscripció anul·lada")).toBeVisible();
    expect(bodies).toEqual([{ reason: "Ho demana per telèfon" }]);
  });

  test("T-07-30 25 activity rows (component preview; /me/history is S10/E6)", async ({ page }) => {
    await login(page);
    await page.goto(`${baseUrl}/_gallery/historic-activitats`);
    await expect(page.getByText("ds 12/07")).toBeVisible();
    await expect(page.getByText("Seminari d'obstacles")).toBeVisible();
    await expect(page.getByText("feta")).toBeVisible();
    await expect(page.getByText("cancel·lada pel club")).toBeVisible();
    await expect(page.getByText("«Pluja forta: pistes tancades»")).toBeVisible();
    await page.screenshot({ path: resolve(evidenceDirectory, "25-activitat-375.png") });
  });
});
