import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test, type Page } from "@playwright/test";

const baseUrl = "http://127.0.0.1:4174";
const evidenceDirectory = resolve(import.meta.dirname, "../../../roadmap/evidence/E10-W03");
/** The console's fixture clubs (`packages/api-client/src/mocks/fixtures/console.ts`). */
const CANIC = "50000000-0000-4000-8000-000000000001";
const MINIM = "50000000-0000-4000-8000-000000000002";

type Scenario = "adminSupportAccess" | "platform" | "platformDark";

async function signIn(page: Page, scenario: Scenario) {
  await page.addInitScript((mockScenario) => {
    localStorage.setItem("agilityhub.locale", "ca");
    // Only the first load of each tab picks its scenario: a tab the test retargets later
    // (`agilityhub.mockScenario` set again) keeps it.
    if (sessionStorage.getItem("e2e.scenario") === null) {
      sessionStorage.setItem("e2e.scenario", mockScenario);
      localStorage.setItem("agilityhub.mockScenario", mockScenario);
    }
  }, scenario);
  await page.goto(`${baseUrl}/entrar`);
  await page.getByLabel("Correu electrònic").fill("pol.ferrer@example.test");
  await page.getByRole("button", { name: "Tinc contrasenya" }).click();
  await page.getByLabel("Contrasenya").fill("secret-password");
  await page.getByRole("button", { exact: true, name: "ENTRA" }).click();
}

async function shot(page: Page, name: string) {
  await page.evaluate(async () => document.fonts.ready);
  await page.screenshot({ fullPage: true, path: resolve(evidenceDirectory, name) });
}

async function openRecordTab(page: Page, id: string, tab: string) {
  await page.evaluate((path) => {
    window.history.pushState(null, "", path);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }, `/consola/clubs/${id}/${tab}`);
}

test.beforeAll(() => {
  mkdirSync(evidenceDirectory, { recursive: true });
});

for (const [scenario, mode] of [
  ["platform", "clar"],
  ["platformDark", "fosc"],
] as const) {
  test(`T-17-12 D19 «Dominis» at 1280 px (${mode}): DNS records, [Afegeix domini], [Verifica], the public key, «Paràmetres»`, async ({
    browser,
  }) => {
    const context = await browser.newContext({ viewport: { height: 900, width: 1280 } });
    const page = await context.newPage();
    await signIn(page, scenario);
    await page.waitForURL("**/consola/clubs");
    await openRecordTab(page, MINIM, "dominis");
    await expect(page.getByRole("heading", { level: 2, name: "Dominis" })).toBeVisible();
    await expect(page.getByRole("link", { exact: true, name: "Dominis" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    const records = page.locator(".console-card").filter({
      has: page.getByRole("heading", { name: "Registres DNS de minim.example.test" }),
    });
    await expect(records.getByText("clubs.agilitydoghub.com")).toBeVisible();
    await expect(records.getByText("_agilityhub-verify.minim.example.test")).toBeVisible();
    await shot(page, `D19-dominis-pendent-1280-${mode}.png`);

    // [Verifica] without the record (the mock's fake DNS has none for this host): 422, unchanged.
    await page.getByRole("button", { name: "Verifica minim.example.test" }).click();
    await expect(
      page.getByText(/No s'ha trobat cap dels dos registres DNS de minim\.example\.test/u),
    ).toBeVisible();

    // [Afegeix domini] for the back office, then [Verifica] (the fake DNS has its CNAME).
    await page.getByLabel("Host").fill("admin.minim.example.test");
    await page.getByLabel("App").selectOption("clubs-admin");
    const added = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        response.url().endsWith(`/clubs/${MINIM}/domains`),
    );
    await page.getByRole("button", { name: "Afegeix domini" }).click();
    expect((await added).status()).toBe(201);
    await expect(
      page.getByRole("heading", { name: "Registres DNS de admin.minim.example.test" }),
    ).toBeVisible();
    await expect(page.getByText("clubsadmin.agilitydoghub.com")).toBeVisible();
    await shot(page, `D19-dominis-afegit-1280-${mode}.png`);
    await page.getByRole("button", { name: "Verifica admin.minim.example.test" }).click();
    await expect(
      page.getByText("S'ha verificat admin.minim.example.test (registre CNAME)."),
    ).toBeVisible();
    const row = page.getByRole("row").filter({ hasText: "admin.minim.example.test" });
    await expect(row.getByText("verificat")).toBeVisible();
    await expect(row.getByText("principal")).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Registres DNS de admin.minim.example.test" }),
    ).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      1280,
    );
    await shot(page, `D19-dominis-verificat-1280-${mode}.png`);

    // R-17-11: the public key, shown once.
    await page.getByRole("button", { name: "Genera una clau nova" }).click();
    await page.getByRole("button", { name: "GENERA LA CLAU" }).click();
    await expect(page.getByLabel("Clau d'API pública nova")).toHaveText(/^agh_pub_/u);
    await shot(page, `D19-clau-publica-1280-${mode}.png`);

    // «Paràmetres» on the club's own values (E10-T04).
    await openRecordTab(page, CANIC, "parametres");
    await expect(page.getByText("valor del club").first()).toBeVisible();
    await expect(page.getByText("només plataforma").first()).toBeVisible();
    await shot(page, `D19-parametres-1280-${mode}.png`);
    await context.close();
  });
}

test("T-17-09 «Entra com a administrador del club»: a new tab on the club's back office with the support banner, and «Surt»", async ({
  browser,
}) => {
  const context = await browser.newContext({ viewport: { height: 900, width: 1280 } });
  const page = await context.newPage();
  await signIn(page, "platform");
  await page.waitForURL("**/consola/clubs");
  await openRecordTab(page, CANIC, "estat");
  await expect(page.getByRole("heading", { level: 2, name: "Accés de suport" })).toBeVisible();
  await page.getByLabel("Motiu de l'accés").fill("Revisar la remesa d'octubre");
  await shot(page, "D19-estat-acces-suport-1280-clar.png");
  // The new tab boots as the club's back office (its own mock world: the Cànic's branding).
  await page.evaluate(() => {
    localStorage.setItem("agilityhub.mockScenario", "admin");
  });
  const popup = context.waitForEvent("page");
  const granted = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" && response.url().endsWith("/support-access"),
  );
  await page.getByRole("button", { name: "Entra com a administrador del club" }).click();
  expect((await granted).status()).toBe(201);
  const support = await popup;
  const addresses: string[] = [];
  support.on("framenavigated", (frame) => {
    if (frame === support.mainFrame()) addresses.push(frame.url());
  });
  await expect(
    page.getByText(/S'ha obert el backoffice del club en una pestanya nova/u),
  ).toBeVisible();
  await support.waitForURL("**/tauler");
  const banner = support.getByRole("region", { name: "Accés de suport" });
  await expect(banner).toContainText(
    "Accés de suport de l'equip AgilityHub · Pol Ferrer · fins al",
  );
  // No console entry and no exports in a support access (R-17-10).
  await expect(support.getByRole("link", { name: "Consola" })).toHaveCount(0);
  await expect(support.getByRole("button", { name: "Exportacions" })).toHaveCount(0);
  // The token never travelled in an address, and stays in this tab only.
  expect([support.url(), ...addresses].join(" ")).not.toContain("mock-support-token");
  expect(await support.evaluate(() => JSON.stringify(Object.entries(localStorage)))).not.toContain(
    "mock-support-token",
  );
  await shot(support, "D19-suport-backoffice-1280-clar.png");
  const revoked = support.waitForRequest((request) => request.url().endsWith("/oauth2/revoke"));
  await banner.getByRole("button", { name: "Surt" }).click();
  expect((await revoked).headers().authorization).toBe("Bearer mock-support-token");
  // An in-app navigation: the shell is gone before the revoke signs the tab out (never /entrar).
  await expect(support).toHaveURL(/\/suport\?sortit=1$/u);
  await expect(
    support.getByText("Has sortit de l'accés de suport. Ja pots tancar aquesta pestanya."),
  ).toBeVisible();
  await shot(support, "D19-suport-sortit-1280-clar.png");
  await context.close();
});

test("R-17-10 (E123) the club's ADMIN ends a live support access from «Auditoria»", async ({
  browser,
}) => {
  const context = await browser.newContext({ viewport: { height: 900, width: 1280 } });
  const page = await context.newPage();
  await signIn(page, "adminSupportAccess");
  await page.waitForURL("**/tauler");
  await page.goto(`${baseUrl}/auditoria`);
  const card = page.getByRole("region", { name: "Accessos de suport en curs" });
  await expect(card.getByRole("listitem")).toHaveCount(1);
  await expect(card).toContainText("Motiu: Revisar la configuració de la remesa");
  await shot(page, "D19-auditoria-acces-suport-1280-clar.png");
  const ended = page.waitForResponse(
    (response) =>
      response.request().method() === "DELETE" && response.url().includes("/support-accesses/"),
  );
  await card.getByRole("button", { name: "Acaba l'accés" }).click();
  expect((await ended).status()).toBe(204);
  await expect(card.getByText("S'ha acabat l'accés de suport de Pol Ferrer.")).toBeVisible();
  await expect(card.getByRole("listitem")).toHaveCount(0);
  await context.close();
});
