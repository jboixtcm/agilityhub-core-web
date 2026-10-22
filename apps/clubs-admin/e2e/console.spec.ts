import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test, type Page } from "@playwright/test";

const baseUrl = "http://127.0.0.1:4174";
const evidenceDirectory = resolve(import.meta.dirname, "../../../roadmap/evidence/E10-W01");

/** The `platform` scenario: an AGILITYHUB_ADMIN account on the product host (S17 §2 «Entrada»). */
async function signIn(page: Page, scenario: "admin" | "platform" | "platformDark") {
  await page.addInitScript((mockScenario) => {
    localStorage.setItem("agilityhub.locale", "ca");
    localStorage.setItem("agilityhub.mockScenario", mockScenario);
  }, scenario);
  await page.goto(`${baseUrl}/entrar`);
  await page.getByLabel("Correu electrònic").fill("pol.ferrer@example.test");
  await page.getByRole("button", { name: "Tinc contrasenya" }).click();
  await page.getByLabel("Contrasenya").fill("secret-password");
  await page.getByRole("button", { exact: true, name: "ENTRA" }).click();
}

async function shot(page: Page, name: string) {
  await page.screenshot({ fullPage: true, path: resolve(evidenceDirectory, name) });
}

test.beforeAll(() => {
  mkdirSync(evidenceDirectory, { recursive: true });
});

for (const [scenario, mode] of [
  ["platform", "clar"],
  ["platformDark", "fosc"],
] as const) {
  test(`T-17-12 D19 at 1280 px (${mode}): list, record tabs, the wizard creates a club with its checklist`, async ({
    browser,
  }) => {
    const context = await browser.newContext({ viewport: { height: 900, width: 1280 } });
    const page = await context.newPage();
    await signIn(page, scenario);
    // A platform account without a club lands on the console (S17 §2 «Entrada»).
    await page.waitForURL("**/consola/clubs");
    await expect(page.getByRole("heading", { level: 1, name: "Consola de clubs" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Consola" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    const riera = page.getByRole("row").filter({ hasText: "Club Agility Riera" });
    await expect(riera.getByText("Suspès")).toBeVisible();
    await expect(riera.getByText("GENERIC · Atlantic/Canary")).toBeVisible();
    // The shell keeps 1280 px: the ten columns scroll inside the list, never the page.
    // Round 2 #3: the document itself (what a full-page capture measures) stays at 1280 px; any
    // element reaching past it outside the table's own scroller is named in the failure.
    const widths = await page.evaluate(() => {
      const wrap = document.querySelector(".ah-universal-list__table-wrap");
      const outside = [...document.querySelectorAll("body *")]
        .filter((element) => !wrap?.contains(element))
        // A closed menu's panel is laid out by Chromium but never shown (checked open below).
        .filter((element) => element.closest("details:not([open]) > :not(summary)") === null)
        .filter((element) => element.getBoundingClientRect().right > 1280)
        .map((element) => {
          const rect = element.getBoundingClientRect();
          const details = element.closest("details");
          return `${element.tagName.toLowerCase()}.${(element.getAttribute("class") ?? "").replace(/\s+/gu, ".")} [${String(Math.round(rect.left))}–${String(Math.round(rect.right))}, details open=${String(details?.open)}, visibility=${getComputedStyle(element).visibility}, parent=${element.parentElement?.getAttribute("class") ?? ""}, docWidth=${String(document.documentElement.scrollWidth)}]`;
        });
      return {
        body: document.body.scrollWidth,
        document: document.documentElement.scrollWidth,
        outside,
        wrap: wrap?.getBoundingClientRect().right ?? 0,
      };
    });
    expect(widths.outside, JSON.stringify(widths.outside)).toEqual([]);
    expect(widths.document).toBeLessThanOrEqual(1280);
    expect(widths.body).toBeLessThanOrEqual(1280);
    expect(widths.wrap).toBeLessThanOrEqual(1280);
    // No module chip is cut: three at most and «+k», each whole inside its cell.
    const chipCells = await page.locator(".console-chips").evaluateAll((cells) =>
      cells.map((cell) => ({
        chips: cell.querySelectorAll(".ah-chip").length,
        clipped: [...cell.querySelectorAll(".ah-chip")].some(
          (chip) => chip.scrollWidth > chip.clientWidth + 1,
        ),
      })),
    );
    expect(chipCells.length).toBeGreaterThan(0);
    for (const cell of chipCells) {
      expect(cell.chips).toBeLessThanOrEqual(4);
      expect(cell.clipped).toBe(false);
    }
    await shot(page, `D19-llista-1280-${mode}.png`);
    const captured = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(captured).toBeLessThanOrEqual(1280);
    // The filter panel, open, stays inside the page too (its button is at the toolbar's end).
    const filterMenu = page.locator(".ah-universal-list__filter-menu");
    await filterMenu.locator("summary").click();
    const panel = filterMenu.locator(".ah-universal-list__menu-panel");
    await expect(panel).toBeVisible();
    const panelBox = await panel.boundingBox();
    expect(panelBox).not.toBeNull();
    expect((panelBox?.x ?? 0) + (panelBox?.width ?? 0)).toBeLessThanOrEqual(1280);
    expect(panelBox?.x ?? -1).toBeGreaterThanOrEqual(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      1280,
    );
    await filterMenu.locator("summary").click();
    await expect(panel).toBeHidden();
    // The other columns (last admin access, SMS, storage, checklist), scrolled into view.
    await page.locator(".ah-universal-list__table-wrap").evaluate((wrap) => {
      wrap.scrollLeft = wrap.scrollWidth;
    });
    await expect(riera.getByText("2/7")).toBeVisible();
    await page.screenshot({
      path: resolve(evidenceDirectory, `D19-llista-columnes-1280-${mode}.png`),
    });

    // The row's name cell is its link (the list scrolls sideways at 1280 px: ten columns).
    await riera.getByRole("link").first().click();
    await page.waitForURL("**/identitat");
    await expect(page.getByRole("heading", { level: 1, name: "Club Agility Riera" })).toBeVisible();
    await expect(page.getByLabel("Nom", { exact: true })).toHaveValue("Club Agility Riera");
    await shot(page, `D19-fitxa-identitat-1280-${mode}.png`);

    await page.getByRole("link", { exact: true, name: "Tema" }).click();
    await page.waitForURL("**/tema");
    await expect(page.getByTestId("theme-preview-clubs")).toBeVisible();
    await expect(page.getByTestId("theme-preview-clubs-admin")).toBeVisible();
    await expect(page.getByRole("list", { name: "Contrast AA" })).toBeVisible();
    await shot(page, `D19-fitxa-tema-1280-${mode}.png`);

    await page.getByRole("link", { exact: true, name: "Mòduls" }).click();
    await page.waitForURL("**/moduls");
    await expect(page.getByRole("switch", { name: "Packs" })).toBeEnabled();
    await shot(page, `D19-fitxa-moduls-1280-${mode}.png`);

    await page.goto(`${baseUrl}/consola/clubs/nou`);
    await expect(page.getByRole("heading", { level: 1, name: "Nou club" })).toBeVisible();
    await page.getByLabel("Nom", { exact: true }).fill("Club Agility Serralada");
    await expect(page.getByLabel("Slug")).toHaveValue("club-agility-serralada");
    await shot(page, `D19-assistent-pas1-1280-${mode}.png`);
    const next = page.getByRole("button", { name: "SEGÜENT" });
    for (const stepName of ["Localització", "Mòduls", "Pagaments", "Tema", "Catàlegs base"]) {
      await next.click();
      await expect(
        page.getByRole("heading", { level: 2, name: new RegExp(stepName, "u") }),
      ).toBeVisible();
    }
    await page
      .getByLabel("Club plantilla")
      .selectOption({ label: "Plantilla AgilityHub · ca, es, en · EUR" });
    await next.click();
    await page.getByLabel("Correu electrònic").fill("laia.costa@example.test");
    await page.getByLabel("Nom", { exact: true }).fill("Laia Costa");
    await next.click();
    await expect(page.getByLabel("Fitxer club-as-code")).toContainText(
      "slug: club-agility-serralada",
    );
    await shot(page, `D19-assistent-revisio-1280-${mode}.png`);
    await page.getByRole("button", { name: "CREA EL CLUB" }).click();
    await page.waitForURL("**/identitat?creat=1");
    await expect(
      page.getByRole("heading", { level: 1, name: "Club Agility Serralada" }),
    ).toBeVisible();
    await expect(page.getByRole("region", { name: "Checklist d'onboarding" })).toBeVisible();
    await expect(page.getByText(/S'ha creat el club Club Agility Serralada/u)).toBeVisible();
    await shot(page, `D19-fitxa-checklist-1280-${mode}.png`);
    await context.close();
  });
}

test("E10-W02 round 2 #1 (T-17-12, R-17-08): the second club's script clones the template once — the wizard with «Cap: catàlegs buits», then «Catàlegs base»; cloning the same parts again answers 409 CATALOG_NOT_EMPTY", async ({
  browser,
}) => {
  const context = await browser.newContext({ viewport: { height: 900, width: 1280 } });
  const page = await context.newPage();
  await signIn(page, "platform");
  await page.waitForURL("**/consola/clubs");
  // Step 2 of `docs/playbooks/segon-club-en-menys-d-una-hora.md`: the wizard creates the club
  // with empty catalogues (the mock's template club has all five parts).
  await page.getByRole("button", { name: "Nou club" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Nou club" })).toBeVisible();
  await page.getByLabel("Nom", { exact: true }).fill("Club Agility Torrent");
  const next = page.getByRole("button", { name: "SEGÜENT" });
  for (const stepName of ["Localització", "Mòduls", "Pagaments", "Tema", "Catàlegs base"]) {
    await next.click();
    await expect(
      page.getByRole("heading", { level: 2, name: new RegExp(stepName, "u") }),
    ).toBeVisible();
  }
  await page.getByLabel("Club plantilla").selectOption({ label: "Cap: catàlegs buits" });
  await next.click();
  await page.getByLabel("Correu electrònic").fill("marc.vidal@example.test");
  await page.getByLabel("Nom", { exact: true }).fill("Marc Vidal");
  await next.click();
  const created = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname.endsWith("/platform/clubs"),
  );
  await page.getByRole("button", { name: "CREA EL CLUB" }).click();
  const createdRequest = (await created).request().postDataJSON() as { catalogs?: unknown };
  await page.waitForURL("**/identitat?creat=1");

  // Step 7: «Catàlegs base» copies the template's five parts, the only clone of the script.
  await page.getByRole("link", { exact: true, name: "Catàlegs base" }).click();
  await page.waitForURL("**/catalegs");
  const isClone = (response: { request: () => { method: () => string }; url: () => string }) =>
    response.request().method() === "POST" &&
    new URL(response.url()).pathname.endsWith("/catalog-clone");
  const clone = page.getByRole("button", { name: "Clona d'un club plantilla" });
  const first = page.waitForResponse(isClone);
  await clone.click();
  const firstResponse = await first;
  expect(firstResponse.status()).toBe(200);
  const copied = ((await firstResponse.json()) as { copied: Record<string, number> }).copied;
  expect(Object.values(copied).reduce((sum, count) => sum + count, 0)).toBeGreaterThan(0);
  await expect(
    page.getByText(
      "S'ha copiat: Nivells 9 · Pistes 5 · Modalitats i preus 4 · Preguntes freqüents 6 · Plantilles de comunicat 21.",
    ),
  ).toBeVisible();

  // The same parts once more: the club is no longer empty (R-17-08).
  const second = page.waitForResponse(isClone);
  await clone.click();
  const secondResponse = await second;
  expect(secondResponse.status()).toBe(409);
  expect(await secondResponse.json()).toMatchObject({
    code: "CATALOG_NOT_EMPTY",
    details: { part: "LEVELS" },
  });
  await expect(
    page.getByText("Nivells: el club ja en té. Només es copien les parts buides."),
  ).toBeVisible();
  // The wizard sent no `catalogs.fromTemplate`: «Catàlegs base» was the only clone.
  expect(createdRequest.catalogs).toBeUndefined();
  await context.close();
});

test("D19 refuses a club account without the platform role (S17 §2 «Entrada»)", async ({
  browser,
}) => {
  const context = await browser.newContext({ viewport: { height: 900, width: 1280 } });
  const page = await context.newPage();
  await signIn(page, "admin");
  await page.waitForURL("**/tauler");
  await page.goto(`${baseUrl}/consola/clubs`);
  await expect(page.getByText("Aquest accés és només per a l'equip AgilityHub.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Consola" })).toHaveCount(0);
  await context.close();
});
