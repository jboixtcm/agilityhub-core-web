import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { type Browser, type BrowserContext, type Page } from "@playwright/test";

import { expect, test } from "./oauth-token-log";

const clubsUrl = "http://127.0.0.1:4173";
const adminUrl = "http://127.0.0.1:4174";
const corePassword = requiredEnvironment("E1_CORE_PASSWORD");
const evidenceDirectory =
  process.env.CORE_EVIDENCE_DIRECTORY ?? resolve(process.cwd(), "roadmap/evidence/E2-W07");
const bookingBlockReason = "Validació d'integració E2";

let blockedMemberId = "";
let e2AdminContext: BrowserContext | undefined;
let e2AdminPage: Page | undefined;

mkdirSync(evidenceDirectory, { recursive: true });

function requiredEnvironment(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === "") {
    throw new Error(`${name} is required`);
  }
  return value;
}

async function localizedContext(
  browser: Browser,
  viewport: { height: number; width: number },
): Promise<BrowserContext> {
  const context = await browser.newContext({ viewport });
  await context.addInitScript(() => {
    localStorage.setItem("agilityhub.locale", "ca");
  });
  return context;
}

async function revealPassword(page: Page): Promise<void> {
  const reveal = page.getByRole("button", { name: "Tinc contrasenya" });
  if (await reveal.isVisible()) {
    await reveal.click();
  }
}

async function submitPasswordLogin(page: Page): Promise<void> {
  const meStatuses: number[] = [];
  page.on("response", (response) => {
    if (response.url().endsWith("/api/v1/me") && response.request().method() === "GET") {
      meStatuses.push(response.status());
    }
  });
  const tokenResponse = page.waitForResponse((response) => {
    if (!response.url().endsWith("/oauth2/token") || response.request().method() !== "POST") {
      return false;
    }
    return (
      new URLSearchParams(response.request().postData() ?? "").get("grant_type") === "password"
    );
  });
  await page.getByRole("button", { exact: true, name: "ENTRA" }).click({ noWaitAfter: true });
  expect((await tokenResponse).status()).toBe(200);
  await expect.poll(() => meStatuses.at(-1)).toBe(200);
}

async function loginAdmin(page: Page): Promise<void> {
  await page.goto(`${adminUrl}/entrar`);
  await page.getByLabel("Correu electrònic").fill("admin@example.test");
  await revealPassword(page);
  await page.getByLabel("Contrasenya").fill(corePassword);
  await submitPasswordLogin(page);
  await page.waitForURL("**/tauler");
  await expect(page.locator(".admin-shell")).toBeVisible();
  await expect
    .poll(async () => {
      try {
        return await page.evaluate(
          () =>
            new Promise<boolean>((resolveFrames) => {
              requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                  resolveFrames(
                    window.location.pathname === "/tauler" && document.readyState === "complete",
                  );
                });
              });
            }),
        );
      } catch {
        return false;
      }
    })
    .toBe(true);
}

async function loginMember(page: Page, email = "member@example.test"): Promise<void> {
  await page.goto(`${clubsUrl}/entrar`);
  await page.getByLabel("Correu electrònic").fill(email);
  await page.getByLabel("Contrasenya").fill(corePassword);
  const routeRefresh = page.waitForResponse((response) => {
    if (!response.url().endsWith("/oauth2/token") || response.request().method() !== "POST") {
      return false;
    }
    return (
      new URLSearchParams(response.request().postData() ?? "").get("grant_type") === "refresh_token"
    );
  });
  await submitPasswordLogin(page);
  await page.waitForURL("**/inici");
  expect((await routeRefresh).status()).toBe(200);
  await expect(page.locator(".clubs-shell")).toBeVisible();
}

async function screenshot(page: Page, name: string): Promise<void> {
  await page.evaluate(async () => document.fonts.ready);
  await page.screenshot({ fullPage: true, path: join(evidenceDirectory, name) });
}

async function navigateSpa(page: Page, path: string): Promise<void> {
  await page.evaluate(async (nextPath) => {
    await new Promise<void>((resolveFrame) => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          resolveFrame();
        });
      });
    });
    window.history.pushState(null, "", nextPath);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }, path);
  await expect(page).toHaveURL(new RegExp(`${path.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")}$`, "u"));
}

async function navigateClubRoute(page: Page, path: string): Promise<void> {
  const refreshResponse = page.waitForResponse((response) => {
    if (!response.url().endsWith("/oauth2/token") || response.request().method() !== "POST") {
      return false;
    }
    return (
      new URLSearchParams(response.request().postData() ?? "").get("grant_type") === "refresh_token"
    );
  });
  const meResponse = page.waitForResponse(
    (response) => response.url().endsWith("/api/v1/me") && response.request().method() === "GET",
  );
  await page.goto(`${clubsUrl}${path}`);
  const refresh = await refreshResponse;
  if (refresh.status() !== 200) {
    throw new Error(
      `Club session refresh failed (${String(refresh.status())}): ${await refresh.text()}`,
    );
  }
  expect((await meResponse).status()).toBe(200);
  await expect(page).toHaveURL(new RegExp(`${path}$`, "u"));
}

function isFilteredMembersResponse(response: { request(): { method(): string }; url(): string }) {
  const url = new URL(response.url());
  return (
    response.request().method() === "GET" &&
    url.pathname.endsWith("/api/v1/members") &&
    url.searchParams.getAll("filter").some((filter) => filter.startsWith("dogLevelId:eq:"))
  );
}

async function measureFilteredMembers(page: Page): Promise<number[]> {
  const durations: number[] = [];
  const search = page.getByRole("searchbox", { name: "Cerca per nom, DNI, gos…" });
  for (const query of ["l", "la", "lai", "laia", ""]) {
    const responsePromise = page.waitForResponse(isFilteredMembersResponse);
    await search.fill(query);
    const response = await responsePromise;
    expect(response.status()).toBe(200);
    await expect(page.getByRole("table", { name: "Llistat d'abonats" })).toBeVisible();
    const duration = await page.evaluate((resourceUrl) => {
      const entry = performance
        .getEntriesByType("resource")
        .filter((item) => item.name === resourceUrl)
        .at(-1);
      return entry?.duration ?? Number.NaN;
    }, response.url());
    expect(Number.isFinite(duration)).toBe(true);
    durations.push(duration);
  }
  return durations;
}

function percentileSummary(durations: readonly number[]) {
  const sorted = [...durations].sort((left, right) => left - right);
  return {
    durationsMs: durations.map((value) => Number(value.toFixed(2))),
    maxMs: Number(Math.max(...durations).toFixed(2)),
    medianMs: Number((sorted[Math.floor(sorted.length / 2)] ?? 0).toFixed(2)),
  };
}

async function deactivateSwitch(dialog: ReturnType<Page["getByRole"]>): Promise<void> {
  const active = dialog.getByRole("switch", { name: "Activa" });
  await expect(active).toBeChecked();
  await active.click();
}

test.describe.configure({ mode: "serial" });

test("T-03-42 real census flow, booking block and member profile", async ({ browser }) => {
  test.setTimeout(180_000);
  e2AdminContext = await localizedContext(browser, { height: 900, width: 1280 });
  const admin = await e2AdminContext.newPage();
  e2AdminPage = admin;
  const pageErrors: string[] = [];
  admin.on("pageerror", (error) => {
    pageErrors.push(error.stack ?? error.message);
  });
  await loginAdmin(admin);
  await navigateSpa(admin, "/abonats");

  await expect(admin.getByRole("heading", { name: /Abonats/u })).toBeVisible();
  await expect(admin.getByText("184 d'alta")).toBeVisible();
  await expect(admin.getByRole("combobox", { name: "Estat dels abonats" })).toHaveValue("ACTIVE");

  const filterMenu = admin.locator(".ah-universal-list__filter-menu");
  await filterMenu.locator("summary").click();
  const clearFilters = filterMenu.getByRole("button", { name: "Neteja" });
  if (await clearFilters.isEnabled()) {
    await clearFilters.click();
  }
  await filterMenu.getByLabel("Columna").selectOption("dogLevelId");
  const filterValue = filterMenu.locator("select").nth(2);
  await expect(filterValue).toBeEnabled();
  const cadells = filterValue.locator("option").filter({ hasText: "Cadells" });
  await expect(cadells).toHaveCount(1);
  const cadellsId = await cadells.getAttribute("value");
  if (cadellsId === null || cadellsId === "") {
    throw new Error("The Cadells filter value did not contain a level id");
  }
  await filterValue.selectOption(cadellsId);
  const filteredResponse = admin.waitForResponse(isFilteredMembersResponse);
  await filterMenu.getByRole("button", { name: "Afegeix el filtre" }).click();
  expect((await filteredResponse).status()).toBe(200);
  await expect(filterMenu.locator("summary")).toContainText("Nivell del gos");
  await screenshot(admin, "D5-abonats-core-1280.png");

  const performanceSummary = percentileSummary(await measureFilteredMembers(admin));
  writeFileSync(
    join(evidenceDirectory, "performance-members.json"),
    `${JSON.stringify(performanceSummary, null, 2)}\n`,
  );

  const search = admin.getByRole("searchbox", { name: "Cerca per nom, DNI, gos…" });
  const searchedResponse = admin.waitForResponse(isFilteredMembersResponse);
  await search.fill("member@example.test");
  expect((await searchedResponse).status()).toBe(200);
  const memberLink = admin.getByRole("link", { exact: true, name: "Laia Fictici006" });
  await expect(memberLink).toBeVisible();
  const memberHref = await memberLink.getAttribute("href");
  if (memberHref === null) {
    throw new Error("The member row did not contain a record URL");
  }
  blockedMemberId = memberHref.split("/").at(-1) ?? "";
  expect(blockedMemberId).not.toBe("");
  const overviewResponse = admin.waitForResponse(
    (response) =>
      response.request().method() === "GET" &&
      response.url().endsWith(`/api/v1/members/${blockedMemberId}/overview`),
  );
  await navigateSpa(admin, memberHref);
  expect((await overviewResponse).status()).toBe(200);
  expect(pageErrors).toEqual([]);
  await expect(admin.getByRole("heading", { name: "Laia Fictici006" })).toBeVisible();
  await screenshot(admin, "D10-abonat-core-1280.png");

  await admin.getByRole("button", { name: "Bloqueja les reserves" }).click();
  const blockDialog = admin.getByRole("dialog", { name: "Bloqueja les reserves" });
  await blockDialog.getByLabel("Motiu del bloqueig").fill(bookingBlockReason);
  const blockResponse = admin.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      response.url().endsWith(`/api/v1/members/${blockedMemberId}/booking-block`),
  );
  await blockDialog.getByRole("button", { name: "Bloqueja les reserves" }).click();
  expect((await blockResponse).status()).toBe(201);
  await expect(admin.getByText("Reserves bloquejades")).toBeVisible();
  await screenshot(admin, "D10-abonat-bloquejat-core-1280.png");

  await navigateSpa(admin, "/gossos");
  await expect(admin.getByText("242 actius")).toBeVisible();
  await expect(admin.getByRole("table", { name: "Llistat de gossos" })).toBeVisible();
  await screenshot(admin, "D15-gossos-core-1280.png");

  const memberContext = await localizedContext(browser, { height: 844, width: 375 });
  const member = await memberContext.newPage();
  const memberPageErrors: string[] = [];
  member.on("pageerror", (error) => {
    memberPageErrors.push(error.stack ?? error.message);
  });
  await loginMember(member);
  await navigateClubRoute(member, "/gossos");
  expect(memberPageErrors).toEqual([]);
  await expect(member.getByRole("heading", { name: "Els meus gossos" })).toBeVisible();
  await expect(member.locator(".dog-card")).toHaveCount(2);
  await screenshot(member, "13-els-meus-gossos-core-375.png");

  await navigateClubRoute(member, "/dades");
  await expect(member.getByRole("heading", { name: "Les meves dades" })).toBeVisible();
  await member.getByLabel("Telèfon principal").fill("612345678");
  await member.getByLabel("Descripció").first().fill("Mòbil");
  await member.getByLabel("Carrer i número").fill("Carrer de la Integració, 1");
  const postalResponse = member.waitForResponse(
    (response) =>
      response.request().method() === "GET" &&
      response.url().endsWith("/api/v1/country-profile/postal-codes/08001"),
  );
  await member.getByLabel("CP", { exact: true }).fill("08001");
  expect((await postalResponse).status()).toBe(200);
  await expect(member.getByLabel("Població (proposada pel CP)")).not.toHaveValue("");
  const profileResponse = member.waitForResponse(
    (response) =>
      response.request().method() === "PATCH" && response.url().endsWith("/api/v1/me/profile"),
  );
  await member.getByRole("button", { exact: true, name: "DESA" }).click();
  expect((await profileResponse).status()).toBe(200);
  await expect(member.getByText("Dades desades")).toBeVisible();
  await screenshot(member, "28-les-meves-dades-core-375.png");

  expect(await member.evaluate(() => document.fonts.check('16px "Montserrat"'))).toBe(true);
  expect(
    await member.evaluate(() =>
      performance
        .getEntriesByType("resource")
        .every((entry) => !/^https?:\/\/(?:fonts\.googleapis|fonts\.gstatic)\./u.test(entry.name)),
    ),
  ).toBe(true);
  await memberContext.close();
});

test("T-05-22/T-05-25 real catalog create, edit and deactivate round trips", async () => {
  test.setTimeout(180_000);
  if (e2AdminPage === undefined) {
    throw new Error("The administrator session from T-03-42 was not available");
  }
  const page = e2AdminPage;

  await navigateSpa(page, "/pistes");
  await expect(page.getByRole("heading", { name: "Pistes" })).toBeVisible();
  await page.getByRole("button", { name: "Nova pista" }).click();
  let dialog = page.getByRole("dialog", { name: "Nova pista" });
  await dialog.getByLabel("Nom", { exact: true }).fill("Integració E2");
  await dialog.getByLabel("Nom curt").fill("E2");
  await dialog.getByRole("button", { name: "DESA" }).click();
  let row = page.getByRole("table", { name: "Pistes del club" }).locator("tbody tr").filter({
    hasText: "Integració E2",
  });
  await expect(row).toBeVisible();
  await row.getByRole("button").first().click();
  dialog = page.getByRole("dialog", { name: "Edita la pista Integració E2" });
  await dialog.getByLabel("Nom", { exact: true }).fill("Integració E2 editada");
  await deactivateSwitch(dialog);
  await dialog.getByRole("button", { name: "DESA" }).click();
  row = page.getByRole("table", { name: "Pistes del club" }).locator("tbody tr").filter({
    hasText: "Integració E2 editada",
  });
  await expect(row).toContainText("no");
  await screenshot(page, "D16-pistes-core-1280.png");

  await navigateSpa(page, "/parametres");
  await expect(page.getByRole("heading", { name: "Paràmetres" })).toBeVisible();
  await page.getByRole("button", { name: "Nou nivell" }).click();
  dialog = page.getByRole("dialog", { name: "Nou nivell" });
  await dialog.getByLabel("Nom", { exact: true }).fill("Integració E2");
  await dialog.getByLabel("Codi").fill("E2I");
  await dialog.getByLabel("Aforament").fill("6");
  await dialog.getByRole("button", { name: "DESA" }).click();
  let catalogRow = page
    .getByRole("table", { name: "Nivells del club" })
    .locator("tbody tr")
    .filter({ hasText: "E2I" });
  await expect(catalogRow).toBeVisible();
  await catalogRow.getByRole("button").first().click();
  dialog = page.getByRole("dialog", { name: "Edita el nivell" });
  await dialog.getByLabel("Nom", { exact: true }).fill("Integració E2 editat");
  await deactivateSwitch(dialog);
  await dialog.getByRole("button", { name: "DESA" }).click();
  catalogRow = page
    .getByRole("table", { name: "Nivells del club" })
    .locator("tbody tr")
    .filter({ hasText: "Integració E2 editat" });
  await expect(catalogRow).toContainText("no");

  await page.getByRole("button", { name: "Nova pregunta" }).click();
  dialog = page.getByRole("dialog", { name: "Nova pregunta" });
  await dialog.getByLabel("Categoria").fill("Integració");
  await dialog.getByLabel("Pregunta").fill("La integració funciona?");
  await dialog.getByLabel("Resposta").fill("Sí, amb el core publicat.");
  await dialog.getByLabel("Ordre").fill("90");
  await dialog.getByRole("button", { name: "DESA" }).click();
  catalogRow = page
    .getByRole("table", { name: "Preguntes freqüents" })
    .locator("tbody tr")
    .filter({ hasText: "La integració funciona?" });
  await expect(catalogRow).toBeVisible();
  await catalogRow.click();
  dialog = page.getByRole("dialog", { name: "Edita la pregunta" });
  await dialog.getByLabel("Resposta").fill("Sí, validada contra el core publicat.");
  await deactivateSwitch(dialog);
  await dialog.getByRole("button", { name: "DESA" }).click();
  await expect(catalogRow).toHaveClass(/catalog-table__row--inactive/u);

  await screenshot(page, "D11-parametres-catalogs-core-1280.png");
  await navigateSpa(page, "/equip");
  await expect(page.getByRole("heading", { name: "Instructors i administradors" })).toBeVisible();
  await screenshot(page, "D17-equip-core-1280.png");
  await navigateSpa(page, "/modalitats");
  await expect(page.getByRole("heading", { name: "Modalitats i tarifes" })).toBeVisible();
  await screenshot(page, "D8-modalitats-core-1280.png");
  await navigateSpa(page, "/plantilles");
  // D3 is no longer a placeholder since E4-W01: the real templates page opens.
  await expect(page.getByRole("heading", { name: "Plantilles", exact: true })).toBeVisible();
  await screenshot(page, "D3-plantilles-core-1280.png");
});

test("T-02-13/T-14-26 real parameter history, export and audit", async () => {
  test.setTimeout(180_000);
  if (e2AdminPage === undefined) {
    throw new Error("The administrator session from T-03-42 was not available");
  }
  const page = e2AdminPage;
  await navigateSpa(page, "/parametres");

  const parameterLabel = "Llindar d'anul·lació tardana («classe feta»)";
  const parameterRow = page.locator(".settings-parameter").filter({ hasText: parameterLabel });
  await expect(parameterRow).toBeVisible();
  await parameterRow.getByRole("button").last().click();
  let dialog = page.getByRole("dialog", { name: parameterLabel });
  const value = dialog.getByLabel(parameterLabel);
  const current = Number(await value.inputValue());
  await value.fill(String(current === 120 ? 121 : 120));
  await dialog.getByLabel("Motiu del canvi (opcional)").fill("Validació E2-W07");
  const parameterResponse = page.waitForResponse(
    (response) =>
      response.request().method() === "PUT" &&
      response.url().endsWith("/api/v1/parameters/bookings.lateCancelThresholdMinutes"),
  );
  await dialog.getByRole("button", { name: "DESA" }).click();
  expect((await parameterResponse).status()).toBe(200);
  await parameterRow.getByRole("button").nth(1).click();
  dialog = page.getByRole("dialog", { name: `Històric · ${parameterLabel}` });
  await expect(dialog.locator("li")).not.toHaveCount(0);
  await screenshot(page, "D11-parametre-historic-core-1280.png");
  await dialog.getByRole("button", { name: "Tanca" }).click();

  const listUrl = new URL(`${adminUrl}/abonats`);
  listUrl.searchParams.append("filter", "status:eq:ACTIVE");
  listUrl.searchParams.set("fields", "fullName,dogs,plan,displayStatus");
  await navigateSpa(page, `${listUrl.pathname}${listUrl.search}`);
  await expect(page.getByRole("table", { name: "Llistat d'abonats" })).toBeVisible();
  await page.getByText("Excel · PDF", { exact: true }).click();
  const exportResponse = page.waitForResponse((response) =>
    new URL(response.url()).pathname.endsWith("/api/v1/members/export"),
  );
  const exportDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Excel" }).click();
  const exported = await exportResponse;
  expect(exported.status()).toBe(200);
  const exportUrl = new URL(exported.url());
  expect(exportUrl.searchParams.get("format")).toBe("xlsx");
  expect(exportUrl.searchParams.get("columns")).toBe("fullName,dogs,plan,displayStatus");
  expect(exported.headers()["content-disposition"]).toMatch(/filename="?[^"]+\.xlsx/iu);
  // E4-W07: the inline `200` file is downloaded as the api names it ({slug}_{listKey}_{stamp}),
  // byte for byte (an XLSX is a ZIP: `PK\x03\x04`).
  const download = await exportDownload;
  const file = readFileSync(await download.path());
  expect(download.suggestedFilename()).toMatch(/^canic_members_\d{8}-\d{4}\.xlsx$/u);
  expect(file.subarray(0, 4)).toEqual(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
  expect(file.length).toBe(Number(exported.headers()["content-length"] ?? file.length));
  writeFileSync(
    join(evidenceDirectory, "members-export-download.json"),
    `${JSON.stringify(
      {
        bytes: file.length,
        contentDisposition: exported.headers()["content-disposition"],
        contentType: exported.headers()["content-type"],
        magic: file.subarray(0, 4).toString("hex"),
        request: `${exportUrl.pathname}${exportUrl.search}`,
        status: exported.status(),
        suggestedFilename: download.suggestedFilename(),
      },
      null,
      2,
    )}\n`,
  );

  await navigateSpa(page, "/auditoria");
  await expect(page.getByRole("heading", { name: "Auditoria" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Configuració modificada" }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Reserves bloquejades" }).first()).toBeVisible();
  await page.getByRole("link", { name: "Reserves bloquejades" }).first().click();
  const changeDrawer = page.getByRole("dialog", { name: "Detall del canvi" });
  await expect(changeDrawer).toContainText(/Reserves bloquejades|Motiu del bloqueig/u);
  await expect(changeDrawer).not.toContainText(/bookingBlock\.(?:active|reason)/u);
  await changeDrawer.getByRole("button", { name: "Tanca el detall del canvi" }).click();
  await screenshot(page, "auditoria-core-1280.png");

  await navigateSpa(page, `/abonats/${blockedMemberId}/auditoria`);
  await expect(page.getByRole("heading", { name: "Auditoria de l'abonat" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Reserves bloquejades" }).first()).toBeVisible();
});

test("T-05-CP-07 real club page edit renders styled Markdown on screen 30", async ({ browser }) => {
  test.setTimeout(180_000);
  if (e2AdminContext === undefined || e2AdminPage === undefined) {
    throw new Error("The administrator session from T-03-42 was not available");
  }
  const admin = e2AdminPage;
  await navigateSpa(admin, "/parametres");
  const rules = admin.getByRole("button", { name: /Normes del club/u });
  await expect(rules).toBeVisible();
  await rules.click();
  const editor = admin.getByRole("dialog", { name: "Edita la pàgina" });
  await editor
    .getByLabel("Contingut")
    .fill(
      "## Convivència E2\n\nRespecteu els espais **compartits**.\n\n- Recolliu el material\n- [Consulteu el web](https://example.test)",
    );
  await expect(editor.getByRole("heading", { name: "Convivència E2" })).toBeVisible();
  await expect(editor.getByText("compartits", { exact: true })).toHaveCSS("font-weight", "700");
  await expect(editor.getByRole("listitem")).toHaveCount(2);
  await screenshot(admin, "D11-pagina-club-preview-core-1280.png");
  await editor.getByRole("button", { name: "Publica" }).click();
  const confirmation = admin.getByRole("dialog", { name: "Publica la pàgina" });
  const publishResponse = admin.waitForResponse(
    (response) =>
      response.request().method() === "PATCH" &&
      response.url().endsWith("/api/v1/club-pages/RULES"),
  );
  await confirmation.getByRole("button", { name: "Publica" }).click();
  expect((await publishResponse).status()).toBe(200);
  await expect(rules.getByText("publicada", { exact: true })).toBeVisible();
  await expect(rules.getByText(/versió \d+/u)).toBeVisible();
  await e2AdminContext.close();
  e2AdminContext = undefined;
  e2AdminPage = undefined;

  const memberContext = await localizedContext(browser, { height: 844, width: 375 });
  const member = await memberContext.newPage();
  await loginMember(member, "member.2@example.test");
  await navigateClubRoute(member, "/info");
  await expect(member.getByRole("heading", { name: "Info" })).toBeVisible();
  await member.getByRole("tab", { name: "Normes" }).click();
  await expect(member.getByRole("heading", { name: "Convivència E2" })).toBeVisible();
  await expect(member.getByText("compartits", { exact: true })).toHaveCSS("font-weight", "700");
  await expect(member.getByRole("listitem")).toHaveCount(2);
  await expect(member.getByRole("link", { name: "Consulteu el web" })).toHaveAttribute(
    "href",
    "https://example.test",
  );
  await screenshot(member, "30-info-core-375.png");
  await memberContext.close();
});

// Last, so that a core older than api E3-T16 fails only this test (the file runs in series).
test("T-03-40 E3-W12 step 4 · screen 13 reads GET /me/dogs only: the seed's document types, «Nivell» per dog, no /parameters (S03 §6)", async ({
  browser,
}) => {
  const memberContext = await localizedContext(browser, { height: 844, width: 375 });
  const member = await memberContext.newPage();
  await loginMember(member);
  const parameterReads: string[] = [];
  member.on("request", (request) => {
    if (new URL(request.url()).pathname.startsWith("/api/v1/parameters")) parameterReads.push(request.url());
  });
  const meDogsResponse = member.waitForResponse(
    (response) => response.url().endsWith("/api/v1/me/dogs") && response.request().method() === "GET",
  );
  await navigateClubRoute(member, "/gossos");
  const meDogsAnswer = await meDogsResponse;
  expect(meDogsAnswer.status()).toBe(200);
  const meDogs = (await meDogsAnswer.json()) as {
    documentTypes?: { key: string; label: string; required: boolean }[];
    dogs: { level?: { code: string } | null }[];
  };
  // Soft, so that the checks below still run on a core older than api E3-T16.
  expect.soft(meDogs, "GET /me/dogs.documentTypes (api E3-T16)").toHaveProperty("documentTypes");
  const seedDocumentTypes = meDogs.documentTypes ?? [];
  expect.soft(seedDocumentTypes.length, "the seed's census.dogDocumentTypes").toBeGreaterThan(0);
  await expect(member.getByRole("heading", { name: "Els meus gossos" })).toBeVisible();
  // R-03-30: «Nivell {codi}» for exactly the dogs that carry their level.
  await expect(member.locator(".dog-card__level")).toHaveCount(meDogs.dogs.filter((dog) => dog.level != null).length);
  // R-03-15, R-03-32: «＋ DOC.» offers the seed's types, in the api's order and with its labels.
  await member.getByRole("button", { name: "＋ DOC." }).first().click();
  const documentDialog = member.getByRole("dialog", { name: /^Afegeix un document de / });
  const documentTypes = await documentDialog
    .getByLabel("Tipus")
    .locator("option")
    .evaluateAll((options) => options.map((option) => [option.getAttribute("value"), option.textContent]));
  expect(documentTypes).toEqual(seedDocumentTypes.map((type) => [type.key, type.label]));
  await screenshot(member, "13-document-types-core-375.png");
  await documentDialog.getByRole("button", { name: "Tanca" }).click();
  expect(parameterReads).toEqual([]);
  // What the core answers a MEMBER on /parameters (the mocks answer the same); the bearer is not written.
  const memberAuthorization = (await meDogsAnswer.request().allHeaders()).authorization;
  const memberParameter = await member.evaluate(async (authorization) => {
    const response = await fetch("/api/v1/parameters/levels.enabled", {
      headers: authorization === undefined ? {} : { Authorization: authorization },
    });
    const body = (await response.json()) as { code?: string };
    return { code: body.code ?? null, status: response.status };
  }, memberAuthorization);
  writeFileSync(
    join(evidenceDirectory, "me-dogs-core.json"),
    `${JSON.stringify({ documentTypes: meDogs.documentTypes ?? "absent", levels: meDogs.dogs.map((dog) => dog.level?.code ?? null), memberParameter }, null, 2)}\n`,
  );
  expect(memberParameter).toEqual({ code: "FORBIDDEN", status: 403 });
  await memberContext.close();
});
