import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test, type Page } from "@playwright/test";

const baseUrl = "http://127.0.0.1:4174";
const evidenceDirectory = resolve(import.meta.dirname, "../../../roadmap/evidence/E3-W02");
const branding: unknown = JSON.parse(
  readFileSync(
    resolve(
      import.meta.dirname,
      "../../../packages/api-client/src/mocks/fixtures/branding-canic.json",
    ),
    "utf8",
  ),
);

async function login(page: Page, scenario = "admin") {
  await page.addInitScript(
    ({ cachedBranding, mockScenario }) => {
      localStorage.setItem("agilityhub.locale", "ca");
      localStorage.setItem("agilityhub.mockScenario", mockScenario);
      localStorage.setItem(`agilityhub.branding:${location.host}`, JSON.stringify(cachedBranding));
    },
    { cachedBranding: branding, mockScenario: scenario },
  );
  await page.goto(`${baseUrl}/entrar`);
  await page.getByLabel("Correu electrònic").fill("aina.serra@example.test");
  await page.getByRole("button", { name: "Tinc contrasenya" }).click();
  await page.getByLabel("Contrasenya").fill("secret-password");
  await page.getByRole("button", { name: "ENTRA" }).click();
  await page.waitForURL("**/tauler");
}

test("T-14-25 / T-04-33 validates a D1 pending signup in D2 and refreshes the counters", async ({ page }) => {
  await login(page);

  await expect(page.getByRole("heading", { name: /Bon dia!.*dilluns.*10 d’agost/iu })).toBeVisible();
  await expect(page.getByText("184", { exact: true })).toBeVisible();
  await expect(page.getByText("87%", { exact: true })).toBeVisible();
  await expect(page.getByRole("figure", { name: "Gossos per nivell — 242 actius" })).toBeVisible();
  await expect(page.getByRole("link", { name: /Preinscripcions\s*3/u })).toBeVisible();
  await expect(page.getByRole("link", { name: /Inactivitats i baixes\s*1/u })).toBeVisible();
  await expect(page.getByRole("link", { name: /Seguiment alumnes\s*5/u })).toBeVisible();
  await page.screenshot({
    fullPage: true,
    path: resolve(evidenceDirectory, "D1-dashboard-1280.png"),
  });

  await page.getByRole("button", { name: "VALIDA" }).first().click();
  await expect(page).toHaveURL(/\/preinscripcions\/42000000-0000-4000-8000-000000000001$/u);
  await expect(page.getByRole("heading", { name: /Preinscripció #1042 — Marta Roca Pujol \+ Kiwi/u })).toBeVisible();
  await expect(page.getByText(/no publiqueu fotos on surti ella/u)).toBeVisible();
  await expect(page.getByLabel("Nivell inicial")).toHaveValue("43000000-0000-4000-8000-000000000001");
  await expect(page.getByLabel("Import efectivament cobrat:")).toHaveValue(/130,00/u);
  await page.screenshot({
    fullPage: true,
    path: resolve(evidenceDirectory, "D2-signup-validation-1280.png"),
  });

  await page.getByRole("button", { name: "VALIDA L'ALTA" }).click();
  await expect(page).toHaveURL(/\/tauler\?signup=validated$/u);
  await expect(page.getByText("L'alta s'ha validat.")).toBeVisible();
  await expect(page.getByRole("link", { name: /Preinscripcions\s*2/u })).toBeVisible();
  await page.screenshot({
    fullPage: true,
    path: resolve(evidenceDirectory, "D1-dashboard-after-validation-1280.png"),
  });
});

test("E3-W08 step 6 (R-04-06, E38): D2 shows a readmission's old and new values, and the DNI stays read-only", async ({
  page,
}) => {
  await login(page, "adminSignupReviewReadmission");
  await page.getByRole("button", { name: "VALIDA" }).first().click();
  await expect(page.getByRole("heading", { name: /Preinscripció #1042 — Marta Roca Pujol \+ Kiwi/u })).toBeVisible();
  await expect(page.locator(".ah-badge", { hasText: "Readmissió" })).toBeVisible();
  // `exact`: the reused dog has its own block, «Canvis respecte de la fitxa de baixa Kiwi» (E4-W13).
  const changes = page.getByRole("region", { exact: true, name: "Canvis respecte de la fitxa de baixa" });
  await expect(changes.getByText("Abans: marta.antic@example.test")).toBeVisible();
  await expect(changes.getByText("Ara: marta.roca@example.test")).toBeVisible();
  await page.screenshot({
    fullPage: true,
    path: resolve(import.meta.dirname, "../../../roadmap/evidence/E3-W08/D2-readmission-mock-1280.png"),
  });
  await page.getByRole("button", { name: "EDITA LES DADES" }).click();
  const drawer = page.getByRole("dialog", { name: "Edita les dades de la preinscripció" });
  await expect(drawer.getByLabel("DNI/NIE")).toHaveAttribute("readonly", "");
  await expect(drawer.getByText(/per corregir-lo, rebutja la readmissió/u)).toBeVisible();
});

test("T-04-12 E4-W13 (R-04-06, R-04-19, E38): D2 shows the reused dog's old and new values, and the drawer edits its documents only through PATCH /dogs/{id}", async ({
  page,
}) => {
  const kiwiPath = "/api/v1/dogs/44000000-0000-4000-8000-000000000001";
  const evidence = resolve(import.meta.dirname, "../../../roadmap/evidence/E4-W13");
  // Every write to the reused dog's record routes (documents, files, photo, level…): none may happen.
  const frozenCalls: string[] = [];
  page.on("request", (request) => {
    const path = new URL(request.url()).pathname;
    if (path.startsWith(`${kiwiPath}/`) && request.method() !== "GET") frozenCalls.push(`${request.method()} ${path}`);
  });
  await login(page, "adminSignupReviewReadmission");
  await page.getByRole("button", { name: "VALIDA" }).first().click();
  await expect(page.getByRole("heading", { name: /Preinscripció #1042 — Marta Roca Pujol \+ Kiwi/u })).toBeVisible();
  const dogChanges = page.getByRole("region", { exact: true, name: "Canvis respecte de la fitxa de baixa Kiwi" });
  await expect(dogChanges.getByText("Abans: Kivi", { exact: true })).toBeVisible();
  await expect(dogChanges.getByText("Ara: Kiwi", { exact: true })).toBeVisible();
  // E4-W13 round 2 (review nit #5): one line per document type, named after the club's types.
  await expect(dogChanges.getByText("Cartilla de vacunes", { exact: true })).toBeVisible();
  await expect(dogChanges.getByText("Abans: cartilla_Kivi_2025.pdf", { exact: true })).toBeVisible();
  await expect(dogChanges.getByText("Ara: cartilla_Kiwi_1.jpg · cartilla_Kiwi_2.jpg", { exact: true })).toBeVisible();
  await expect(dogChanges.getByText("Assegurança", { exact: true })).toBeVisible();
  await expect(dogChanges.getByText("Ara: Assegurança.pdf", { exact: true })).toBeVisible();
  await page.screenshot({ fullPage: true, path: resolve(evidence, "D2-reused-dog-mock-1280.png") });

  await page.getByRole("button", { name: "EDITA LES DADES" }).click();
  const drawer = page.getByRole("dialog", { name: "Edita les dades de la preinscripció" });
  await expect(drawer.locator("#signup-edit-dog-0-chip")).toHaveAttribute("readonly", "");
  await expect(drawer.locator("#signup-edit-dog-0-chip-help")).toHaveText(
    "La readmissió està pendent: la fitxa del gos no es pot canviar fins que es validi o es rebutgi.",
  );
  const patch = page.waitForRequest((request) => new URL(request.url()).pathname === kiwiPath && request.method() === "PATCH");
  await drawer.locator(".signup-edit-documents li").filter({ hasText: "Assegurança.pdf" }).getByRole("button", { name: "Retira" }).click();
  expect((await patch).postDataJSON()).toEqual({ documents: [{ files: [], type: "INSURANCE" }], version: 1 });
  await expect(dogChanges.getByText("Ara: cartilla_Kiwi_1.jpg · cartilla_Kiwi_2.jpg", { exact: true })).toBeVisible();
  await expect(dogChanges.getByText("Assegurança", { exact: true })).toHaveCount(0);
  await expect(drawer.getByText("Assegurança.pdf")).toHaveCount(0);
  // The drawer stays where the admin is: no jump back to its top after the change (packages/ui overlay).
  await expect(drawer.locator(".signup-edit-documents")).toBeInViewport();
  await expect(drawer.getByRole("button", { name: "Cancel·la" })).not.toBeFocused();
  // Round 2 (R-04-06): the submitted card withdrawn file by file brings the record's 2025 card back,
  // which offers no [Retira], and the dog has no documents change left.
  const files = drawer.locator(".signup-edit-documents li");
  for (const name of ["cartilla_Kiwi_1.jpg", "cartilla_Kiwi_2.jpg"]) {
    await files.filter({ hasText: name }).getByRole("button", { name: "Retira" }).click();
    await expect(files.filter({ hasText: name })).toHaveCount(0);
  }
  const recordCard = files.filter({ hasText: "cartilla_Kivi_2025.pdf" });
  await expect(recordCard).toHaveCount(1);
  await expect(recordCard.getByRole("button", { name: "Retira" })).toHaveCount(0);
  await expect(dogChanges.getByText("Cartilla de vacunes", { exact: true })).toHaveCount(0);
  await expect(dogChanges.getByText(/cartilla_/u)).toHaveCount(0);
  await page.screenshot({ path: resolve(evidence, "D2-reused-dog-drawer-mock-1280.png") });
  expect(frozenCalls).toEqual([]);
});
