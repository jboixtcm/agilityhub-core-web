import { mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test, type Page } from "@playwright/test";

const baseUrl = "http://127.0.0.1:4174";
const evidenceDirectory = resolve(import.meta.dirname, "../../../roadmap/evidence/E2-W04");
const brandingCanic: unknown = JSON.parse(
  readFileSync(
    resolve(
      import.meta.dirname,
      "../../../packages/api-client/src/mocks/fixtures/branding-canic.json",
    ),
    "utf8",
  ),
);
const brandingMinim: unknown = JSON.parse(
  readFileSync(
    resolve(
      import.meta.dirname,
      "../../../packages/api-client/src/mocks/fixtures/branding-minim.json",
    ),
    "utf8",
  ),
);
const canicModules = (brandingCanic as { modules: string[] }).modules;
const brandingWithoutFaq = {
  ...(brandingCanic as Record<string, unknown>),
  modules: canicModules.filter((module) => module !== "FAQ"),
};

type Scenario = "admin" | "catalogsNoFaq" | "minimalAdmin";

async function prepareAdmin(page: Page, scenario: Scenario, branding: unknown) {
  await page.addInitScript(
    ({ cachedBranding, mockScenario }) => {
      localStorage.setItem("agilityhub.locale", "ca");
      localStorage.setItem("agilityhub.mockScenario", mockScenario);
      localStorage.setItem(`agilityhub.branding:${location.host}`, JSON.stringify(cachedBranding));
    },
    { cachedBranding: branding, mockScenario: scenario },
  );
  await page.goto(`${baseUrl}/entrar`);
  await page.getByLabel("Correu electrònic").fill("admin@example.test");
  await page.getByRole("button", { name: "Tinc contrasenya" }).click();
  await page.getByLabel("Contrasenya").fill("secret-password");
  await page.getByRole("button", { name: "ENTRA" }).click();
  await page.waitForURL("**/tauler");
}

test.beforeAll(() => {
  mkdirSync(evidenceDirectory, { recursive: true });
});

test.describe("E2-W04 club catalogs", () => {
  test("T-05-22 manages ordered rings and hides free-training controls without the module", async ({
    browser,
  }) => {
    const context = await browser.newContext({ viewport: { height: 900, width: 1280 } });
    const page = await context.newPage();
    await prepareAdmin(page, "admin", brandingCanic);
    await page.goto(`${baseUrl}/pistes`);

    await expect(page.getByRole("heading", { name: "Pistes" })).toBeVisible();
    const table = page.getByRole("table", { name: "Pistes del club" });
    await expect(table.locator("tbody tr")).toHaveCount(5);
    await expect(table.locator("tbody tr strong")).toHaveText([
      "Muntanya",
      "Central",
      "Carretera",
      "Cadells",
      "Petita",
    ]);
    await expect(
      table.getByRole("columnheader", { name: "Reservable per entrenaments" }),
    ).toBeVisible();
    await page.screenshot({
      fullPage: true,
      path: resolve(evidenceDirectory, "D16-pistes-1280.png"),
    });
    await context.close();

    const minimalContext = await browser.newContext({ viewport: { height: 900, width: 1280 } });
    const minimalPage = await minimalContext.newPage();
    await prepareAdmin(minimalPage, "minimalAdmin", brandingMinim);
    await minimalPage.goto(`${baseUrl}/pistes`);
    const minimalTable = minimalPage.getByRole("table", { name: "Pistes del club" });
    await expect(
      minimalTable.getByRole("columnheader", { name: "Reservable per entrenaments" }),
    ).toHaveCount(0);
    await minimalPage.getByRole("button", { name: "Nova pista" }).click();
    await expect(minimalPage.getByLabel("Reservable per entrenaments")).toHaveCount(0);
    await minimalContext.close();
  });

  test("T-05-23 manages instructors and administrators with active-member and last-admin guards", async ({
    browser,
  }) => {
    const context = await browser.newContext({ viewport: { height: 900, width: 1280 } });
    const page = await context.newPage();
    await prepareAdmin(page, "admin", brandingCanic);
    await page.goto(`${baseUrl}/equip`);

    await expect(page.getByRole("heading", { name: "Instructors i administradors" })).toBeVisible();
    await expect(page.getByRole("heading", { exact: true, name: "Instructors" })).toBeVisible();
    await expect(page.getByRole("heading", { exact: true, name: "Administradors" })).toBeVisible();
    await expect(page.getByText("Laura Serra Vidal (Duna)").first()).toBeVisible();
    await page.screenshot({
      fullPage: true,
      path: resolve(evidenceDirectory, "D17-equip-1280.png"),
    });

    const memberRequest = page.waitForRequest((request) => {
      if (!request.url().includes("/api/v1/members")) {
        return false;
      }
      return new URL(request.url()).searchParams.getAll("filter").includes("status:eq:ACTIVE");
    });
    await page.getByRole("button", { name: "Nou instructor" }).click();
    await memberRequest;
    await page.getByRole("dialog", { name: "Nou instructor" }).getByLabel("Tanca").click();

    const administratorTable = page.getByRole("table", { name: "Administradors del club" });
    await administratorTable.getByRole("button", { name: "Elimina membership-laura" }).click();
    await page
      .getByRole("dialog", { name: "Elimina el membre de l'equip" })
      .getByRole("button", { name: "Elimina" })
      .click();
    await expect(administratorTable.getByText("Laura Serra Vidal (Duna)")).toHaveCount(0);

    await administratorTable.getByRole("button", { name: "Elimina membership-marc" }).click();
    await page
      .getByRole("dialog", { name: "Elimina el membre de l'equip" })
      .getByRole("button", { name: "Elimina" })
      .click();
    await expect(page.getByText("Hi ha d'haver almenys un administrador actiu")).toBeVisible();
    await expect(administratorTable.getByText("Marc Prats García (Chun-li)")).toBeVisible();
    await context.close();
  });

  test("T-05-24 edits plan copy, billing modes and pricing while respecting module gates", async ({
    browser,
  }) => {
    const context = await browser.newContext({ viewport: { height: 900, width: 1280 } });
    const page = await context.newPage();
    await prepareAdmin(page, "admin", brandingCanic);
    await page.goto(`${baseUrl}/modalitats`);

    await expect(page.getByRole("heading", { name: "Modalitats i tarifes" })).toBeVisible();
    await expect(page.getByText(/entrada per gos \(matrícula\): 100/u)).toBeVisible();
    await expect(page.getByText(/60\s*€\/mes \+ entrada 100\s*€/u).first()).toBeVisible();
    await expect(page.getByText("(familiar)")).toBeVisible();
    await expect(page.locator(".catalog-plan-preview")).toContainText(
      /Fins a dues classes per setmana · entrada 100\s*€/u,
    );
    await page.screenshot({
      fullPage: true,
      path: resolve(evidenceDirectory, "D8-modalitats-1280.png"),
    });

    await page.getByLabel("Text de presentació").fill("Text de prova en viu");
    await expect(page.locator(".catalog-plan-preview")).toContainText("Text de prova en viu");

    const plansTable = page.getByRole("table", { name: "Modalitats i tarifes" });
    await plansTable.getByRole("button", { name: "Edita plan-member" }).click();
    const dialog = page.getByRole("dialog", { name: "Edita Abonat" });
    await expect(dialog.getByLabel("Mode de facturació")).toHaveValue("MONTHLY_FEE");
    await dialog.getByLabel("Import", { exact: true }).fill("70");
    await dialog.getByLabel("Data d'inici").fill("2026-08-01");
    await dialog.getByRole("button", { name: "Afegeix el preu" }).click();
    await expect(
      dialog.getByText("No es pot afegir: la data correspon a un període de preu bloquejat."),
    ).toBeVisible();
    await context.close();

    const minimalContext = await browser.newContext({ viewport: { height: 900, width: 1280 } });
    const minimalPage = await minimalContext.newPage();
    await prepareAdmin(minimalPage, "minimalAdmin", brandingMinim);
    await minimalPage.goto(`${baseUrl}/modalitats`);
    const minimalTable = minimalPage.getByRole("table", { name: "Modalitats i tarifes" });
    await expect(minimalTable.getByRole("columnheader", { name: "Preu" })).toHaveCount(0);
    await expect(minimalPage.getByText(/entrada per gos/u)).toHaveCount(0);
    await minimalPage.getByRole("button", { name: "Nova modalitat" }).click();
    const minimalDialog = minimalPage.getByRole("dialog", { name: "Nova modalitat" });
    await expect(minimalDialog.getByLabel("Entrada")).toHaveCount(0);
    await expect(minimalDialog.getByLabel("Tipus").locator('option[value="PACK"]')).toHaveCount(0);
    await expect(
      minimalDialog.getByLabel("Tipus").locator('option[value="SINGLE_CLASS"]'),
    ).toHaveCount(0);
    await minimalContext.close();
  });

  test("T-05-25 manages local levels and FAQ CRUD/reorder with FAQ module gating", async ({
    browser,
  }) => {
    const context = await browser.newContext({ viewport: { height: 900, width: 1280 } });
    const page = await context.newPage();
    await prepareAdmin(page, "admin", brandingCanic);
    await page.goto(`${baseUrl}/parametres`);

    await expect(page.getByRole("heading", { name: "Nivells" })).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Preguntes freqüents — pàgina «Info» de l'app" }),
    ).toBeVisible();
    await page.screenshot({
      fullPage: true,
      path: resolve(evidenceDirectory, "D11-parametres-1280.png"),
    });

    await page.getByRole("button", { name: "Nova pregunta" }).click();
    let dialog = page.getByRole("dialog", { name: "Nova pregunta" });
    await dialog.locator("#faq-category").fill("Accés");
    await dialog.locator("#faq-question").fill("Com entro al club?");
    await dialog.locator("#faq-answer").fill("Amb la teva credencial activa.");
    await dialog.locator("#faq-order").fill("50");
    await dialog.getByRole("button", { name: "DESA" }).click();

    const faqTable = page.getByRole("table", { name: "Preguntes freqüents" });
    const newRow = faqTable.locator("tbody tr").filter({ hasText: "Com entro al club?" });
    await expect(newRow).toBeVisible();
    await newRow.click();
    dialog = page.getByRole("dialog", { name: "Edita la pregunta" });
    await dialog.locator("#faq-answer").fill("Amb la credencial digital activa.");
    await dialog.getByRole("button", { name: "DESA" }).click();

    const firstRow = faqTable.locator("tbody tr").first();
    const reorderRequest = page.waitForRequest(
      (request) => request.method() === "PUT" && request.url().includes("/faq-entries/order"),
    );
    await newRow.dragTo(firstRow);
    await reorderRequest;
    await expect(faqTable.locator("tbody tr").first()).toContainText("Com entro al club?");
    await context.close();

    const noFaqContext = await browser.newContext({ viewport: { height: 900, width: 1280 } });
    const noFaqPage = await noFaqContext.newPage();
    await prepareAdmin(noFaqPage, "catalogsNoFaq", brandingWithoutFaq);
    await noFaqPage.goto(`${baseUrl}/parametres`);
    await expect(noFaqPage.getByRole("heading", { name: "Nivells" })).toBeVisible();
    await expect(noFaqPage.getByRole("heading", { name: /Preguntes freqüents/u })).toHaveCount(0);
    await noFaqContext.close();
  });
});
