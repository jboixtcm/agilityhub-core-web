import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import type { Browser, BrowserContext, Locator, Page, Response, Route } from "@playwright/test";

import { expect, test } from "./oauth-token-log";

// E4-W05 · T-06-28 and T-07-32 end to end against the published core with the E4 demo seed
// (api E4-T05, `seeds/demo-canic.yaml` of the image). The seed is anchored on `E4_WEEK_START`, the
// club-local Monday of the run's week (`scripts/e2e-core.sh`): week +1 is generated in draft (D4b),
// week +2 is validated and holds the registrants (the Wednesday 18:50 B+C class, 4 booked + 2
// waiting), the maintenance block, the instructor inconsistency and the «Torneig d'Estiu 2026»
// Saturday; the generation candidates propose week +3. Rows are chosen by state, time and counts —
// never by the people's names of the mockups. Every run gets a fresh seed (the stack is removed
// with its volumes), and the run's own records carry `runId`.

const clubsUrl = "http://127.0.0.1:4173";
const adminUrl = "http://127.0.0.1:4174";
const corePassword = requiredEnvironment("E1_CORE_PASSWORD");
const weekStart = requiredEnvironment("E4_WEEK_START");
const evidenceDirectory =
  process.env.CORE_EVIDENCE_DIRECTORY ?? resolve(process.cwd(), "roadmap/evidence/E4-W05");
const clubTimeZone = "Europe/Madrid";
const runId = Date.now().toString(36).slice(-6);
const seminarTitle = `Seminari E4 ${runId}`;
const desktop = { height: 900, width: 1280 };
const mobile = { height: 844, width: 375 };

const draftWeek = addDays(weekStart, 7);
const validatedWeek = addDays(weekStart, 14);
const generatedWeek = addDays(weekStart, 21);
const registrantsWednesday = addDays(validatedWeek, 2);
const tournamentSaturday = addDays(validatedWeek, 5);
const seminarSaturday = addDays(generatedWeek, 5);

const caShortDays = ["dl", "dt", "dc", "dj", "dv", "ds", "dg"] as const;

let adminContext: BrowserContext | undefined;
let adminPage: Page | undefined;
let seminarId = "";
let handlingId = "";
let ringBlockId = "";
const evidence: Record<string, unknown> = { runId, weekStart };

mkdirSync(evidenceDirectory, { recursive: true });

function requiredEnvironment(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === "") {
    throw new Error(`${name} is required`);
  }
  return value;
}

/** Plain-date arithmetic (UTC noon, never formatted in a zone). */
function addDays(date: string, days: number): string {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function dayOfMonth(date: string): string {
  return String(Number(date.slice(8, 10)));
}

/**
 * E4-W12 step 7 (R-07-13): 03 reads «Dissabte 17 · …» in the club's current month and «Dissabte
 * 17 d’octubre · …» in another one (the club's «today», Europe/Madrid). For the seminar's Saturday.
 */
function saturdayOn03(date: string, locale: "ca" | "es"): string {
  const weekday = locale === "ca" ? "Dissabte" : "Sábado";
  const today = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Europe/Madrid",
    year: "numeric",
  }).format(new Date());
  if (today.slice(0, 7) === date.slice(0, 7)) return `${weekday} ${dayOfMonth(date)} · `;
  const dayMonth = new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(new Date(`${date}T12:00:00Z`));
  return `${weekday} ${dayMonth} · `;
}

function caShortDay(date: string): string {
  const index = (new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7;
  return caShortDays[index] ?? "";
}

/** «dd/mm/aaaa», the masked date inputs of D4 and D7. */
function maskedDate(date: string): string {
  return `${date.slice(8, 10)}/${date.slice(5, 7)}/${date.slice(0, 4)}`;
}

/** The club-local today (R-06-14: the club's zone, never the device's). */
function clubToday(): string {
  return new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: clubTimeZone,
    year: "numeric",
  }).format(new Date());
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function apiPath(response: Response): string {
  return new URL(response.url()).pathname;
}

function isCall(method: string, path: RegExp) {
  return (response: Response) =>
    response.request().method() === method && path.test(apiPath(response));
}

async function localizedContext(
  browser: Browser,
  viewport: { height: number; width: number },
  locale: "ca" | "es",
): Promise<BrowserContext> {
  const context = await browser.newContext({ acceptDownloads: true, viewport });
  await context.addInitScript((value) => {
    localStorage.setItem("agilityhub.locale", value);
  }, locale);
  return context;
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
  await page.getByRole("button", { exact: true, name: /^(ENTRA|ENTRAR)$/u }).click({
    noWaitAfter: true,
  });
  expect((await tokenResponse).status()).toBe(200);
  await expect.poll(() => meStatuses.at(-1)).toBe(200);
}

async function loginAdmin(page: Page): Promise<void> {
  await page.goto(`${adminUrl}/entrar`);
  await page.getByLabel("Correu electrònic").fill("admin@example.test");
  const reveal = page.getByRole("button", { name: "Tinc contrasenya" });
  if (await reveal.isVisible()) {
    await reveal.click();
  }
  await page.getByLabel("Contrasenya").fill(corePassword);
  await submitPasswordLogin(page);
  await page.waitForURL("**/tauler");
  await expect(page.locator(".admin-shell")).toBeVisible();
  await settle(page, "/tauler");
}

/** Clubs app login (seed accounts of `club-canic.yaml`); `landing` = `/inici` or `/instructor/avui`. */
async function loginClubs(
  page: Page,
  email: string,
  landing: "/inici" | "/instructor/avui",
  labels: { email: string; password: string } = {
    email: "Correu electrònic",
    password: "Contrasenya",
  },
): Promise<void> {
  await page.goto(`${clubsUrl}/entrar`);
  await page.getByLabel(labels.email).fill(email);
  await page.getByLabel(labels.password, { exact: true }).fill(corePassword);
  // The app refreshes once it lands; a navigation that aborted that call would leave the browser
  // with the rotated-away cookie (`REFRESH_REUSED`), so the login waits for it as E1/E2 do.
  const routeRefresh = page.waitForResponse(isRefresh);
  await submitPasswordLogin(page);
  await page.waitForURL(`**${landing}`);
  expect((await routeRefresh).status()).toBe(200);
  await expect(page.locator(".clubs-shell")).toBeVisible();
}

function isRefresh(response: Response): boolean {
  return (
    response.url().endsWith("/oauth2/token") &&
    response.request().method() === "POST" &&
    new URLSearchParams(response.request().postData() ?? "").get("grant_type") === "refresh_token"
  );
}

async function settle(page: Page, pathname: string): Promise<void> {
  await expect
    .poll(async () => {
      try {
        return await page.evaluate(
          (expected) =>
            new Promise<boolean>((resolveFrames) => {
              requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                  resolveFrames(
                    window.location.pathname === expected && document.readyState === "complete",
                  );
                });
              });
            }),
          pathname,
        );
      } catch {
        return false;
      }
    })
    .toBe(true);
}

/** In-app navigation of the admin SPA (the session lives in memory: no reload). */
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
  // A route without a query may add its own (`/calendari` → `?estat=actives&setmana=…`).
  const query = path.includes("?") ? "" : "(\\?.*)?";
  await expect(page).toHaveURL(new RegExp(`${escapeRegExp(path)}${query}$`, "u"));
}

/** A clubs route by address (the refresh cookie restores the session). */
async function navigateClubRoute(page: Page, path: string): Promise<void> {
  const refreshResponse = page.waitForResponse(isRefresh);
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
  await expect(page).toHaveURL(new RegExp(`${escapeRegExp(path)}$`, "u"));
}

/** E4-W12 step 7: the words of the day-grid cell lines drawn over two lines (a mid-word break). */
async function brokenWords(grid: Locator): Promise<string[]> {
  return grid
    .locator(".ah-schedule-cell__title, .ah-schedule-cell__subtitle")
    .evaluateAll((lines) =>
      lines.flatMap((line) => {
        const broken: string[] = [];
        const walker = document.createTreeWalker(line, NodeFilter.SHOW_TEXT);
        for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
          for (const match of (node.textContent ?? "").matchAll(/\S+/gu)) {
            const range = document.createRange();
            range.setStart(node, match.index);
            range.setEnd(node, match.index + match[0].length);
            const tops = new Set([...range.getClientRects()].map((rect) => Math.round(rect.top)));
            if (tops.size > 1) broken.push(match[0]);
          }
        }
        return broken;
      }),
    );
}

async function screenshot(page: Page, name: string, fullPage = true): Promise<void> {
  await page.evaluate(async () => document.fonts.ready);
  await page.screenshot({ fullPage, path: join(evidenceDirectory, name) });
}

// Icons are `<use>` references to the external sprite: a dialog captured right after it opens can
// miss them, so a screenshot of an overlay waits until every icon has a box.
async function expectIconsPainted(scope: Locator): Promise<void> {
  await expect
    .poll(() =>
      scope
        .locator("svg.ah-icon")
        .evaluateAll((icons) =>
          icons.every((icon) => icon instanceof SVGSVGElement && icon.getBBox().width > 0),
        ),
    )
    .toBe(true);
}

/**
 * D4 on `week` with `estat`: D4 reads its address on mount (and then replaces it), so an open
 * calendar is left first and the address is entered as a link would.
 */
async function openCalendar(
  page: Page,
  estat: "actives" | "esborrany",
  week: string,
): Promise<void> {
  await openFresh(page, `/calendari?estat=${estat}&setmana=${week}`);
  await expect(calendarGrid(page)).toBeVisible();
}

/**
 * An admin page by address with a fresh mount: the pages read their address and data on mount,
 * so a page already open on the same path is left first (as a link from another page would be).
 */
async function openFresh(page: Page, path: string): Promise<void> {
  if (new URL(page.url()).pathname === new URL(path, adminUrl).pathname) {
    await navigateSpa(page, "/tauler");
  }
  await navigateSpa(page, path);
}

function calendarGrid(page: Page): Locator {
  return page.getByRole("table", { name: /^Calendari de classes · del /u });
}

/**
 * The cells of a schedule grid whose text contains `text`, counted per column header («ds 3»): each
 * body row holds one slot per header, in the same order.
 */
async function cellsByColumn(grid: Locator, text: string): Promise<Record<string, number>> {
  return grid.evaluate((table, wanted) => {
    const headers = [...table.querySelectorAll("thead th")].map((header) =>
      header.textContent.trim(),
    );
    const counts: Record<string, number> = {};
    for (const row of table.querySelectorAll("tbody tr")) {
      row.querySelectorAll("td.ah-schedule-grid__slot").forEach((slot, index) => {
        const matching = [...slot.querySelectorAll(".ah-schedule-cell")].filter((cell) =>
          cell.textContent.includes(wanted),
        ).length;
        const header = headers[index] ?? String(index);
        if (matching > 0) counts[header] = (counts[header] ?? 0) + matching;
      });
    }
    return counts;
  }, text);
}

function admin(): Page {
  if (adminPage === undefined) throw new Error("The administrator session is not available");
  return adminPage;
}

function writeEvidence(): void {
  writeFileSync(
    join(evidenceDirectory, "e4-core-run.json"),
    `${JSON.stringify(evidence, null, 2)}\n`,
  );
}

interface RegistrationItem {
  cancelReason?: string | null;
  member: { emails?: string[]; fullName: string; id: string };
  position?: number | null;
  registrationId: string;
  state: string;
}

async function registrantsOf(page: Page, activityId: string, open: () => Promise<void>) {
  const listed = page.waitForResponse(
    isCall("GET", new RegExp(`/api/v1/activities/${activityId}/registrations$`, "u")),
  );
  await open();
  const response = await listed;
  expect(response.status()).toBe(200);
  return ((await response.json()) as { items: RegistrationItem[] }).items;
}

async function downloadExport(
  page: Page,
  scope: Locator,
  path: RegExp,
  name: string,
): Promise<Record<string, unknown>> {
  await scope.getByText("Excel · PDF", { exact: true }).click();
  const exportResponse = page.waitForResponse((response) => path.test(apiPath(response)));
  const exportDownload = page.waitForEvent("download");
  await scope.getByRole("button", { exact: true, name: "Excel" }).click();
  const exported = await exportResponse;
  expect(exported.status()).toBe(200);
  const download = await exportDownload;
  const file = readFileSync(await download.path());
  expect(exported.headers()["content-disposition"]).toMatch(/filename="?[^"]+\.xlsx/iu);
  expect(file.subarray(0, 4)).toEqual(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
  const summary = {
    bytes: file.length,
    contentDisposition: exported.headers()["content-disposition"],
    contentType: exported.headers()["content-type"],
    magic: file.subarray(0, 4).toString("hex"),
    request: `${apiPath(exported)}${new URL(exported.url()).search}`,
    status: exported.status(),
    suggestedFilename: download.suggestedFilename(),
  };
  writeFileSync(join(evidenceDirectory, name), `${JSON.stringify(summary, null, 2)}\n`);
  return summary;
}

test.describe.configure({ mode: "serial" });

// A failed step leaves the admin page's accessibility tree next to the evidence (fictional data).
// eslint-disable-next-line no-empty-pattern
test.afterEach(async ({}, testInfo) => {
  if (testInfo.status === testInfo.expectedStatus || adminPage === undefined) return;
  const snapshot = await adminPage
    .locator("body")
    .ariaSnapshot()
    .catch(() => "");
  const name = testInfo.title.slice(0, 16).replace(/[^\w-]+/gu, "_");
  writeFileSync(join(evidenceDirectory, `failure-${name}.txt`), `${adminPage.url()}\n${snapshot}`);
});

test.afterAll(async () => {
  writeEvidence();
  await adminContext?.close();
});

test("T-06-28 E2E (a) D3: the three seeded templates, «Setmana B» blocked by its inconsistency, «Setmana A» generates the proposed week, D3b per ring", async ({
  browser,
}) => {
  test.setTimeout(240_000);
  adminContext = await localizedContext(browser, desktop, "ca");
  adminPage = await adminContext.newPage();
  const page = adminPage;
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => {
    pageErrors.push(error.stack ?? error.message);
  });
  await loginAdmin(page);

  // D3 reads one list per kind (WEEKDAYS, SATURDAY): the seed's three templates between them.
  const templateNames = new Set<string>();
  const templateIds = new Map<string, string>();
  const collectTemplates = async (response: Response) => {
    if (!isCall("GET", /\/api\/v1\/week-templates$/u)(response)) return;
    const body = (await response.json()) as { items: { id: string; name: string }[] };
    for (const item of body.items) {
      templateNames.add(item.name);
      templateIds.set(item.name, item.id);
    }
  };
  page.on("response", collectTemplates);
  const candidatesResponse = page.waitForResponse(
    isCall("GET", /\/api\/v1\/weeks\/generation-candidates$/u),
  );
  await navigateSpa(page, "/plantilles");
  await expect
    .poll(() => [...templateNames].sort())
    .toEqual(["Dissabtes", "Setmana A", "Setmana B"]);
  page.off("response", collectTemplates);
  const candidates = (
    (await (await candidatesResponse).json()) as {
      items: { isoWeek: number; isoYear: number; proposed: boolean; startDate: string }[];
    }
  ).items;
  const proposed = candidates.find((candidate) => candidate.proposed);
  // Seed arrangement: weeks 0, +1 and +2 exist, so the first free week (+3) is proposed.
  expect(proposed?.startDate).toBe(generatedWeek);
  await expect(page.getByRole("heading", { level: 1, name: "Plantilles" })).toBeVisible();

  // The tabs: the weekday tab offers both WEEKDAYS templates, the Saturday tab the third one.
  const weekdayTab = page.getByRole("button", { name: /^dl–dv: «/u });
  await weekdayTab.click();
  const menuItems = page.getByRole("menuitemradio");
  expect((await menuItems.allTextContents()).sort()).toEqual(["Setmana A", "Setmana B"]);
  await menuItems.filter({ hasText: "Setmana B" }).click();
  await expect(
    page.getByRole("table", { name: "Quadre setmanal de la plantilla «Setmana B»" }),
  ).toBeVisible();
  // The Saturday tab («Dissabtes ▾»): its menu offers the third template.
  const saturdayTab = page.getByRole("button", { name: /^Dissabtes/u });
  await saturdayTab.click();
  await expect(page.getByRole("menuitemradio")).toHaveText(["Dissabtes"]);
  await saturdayTab.press("Escape");
  await saturdayTab.blur();

  const note = page.getByRole("note").filter({ hasText: /^Incoherència: /u });
  await expect(note).toHaveCount(1);
  await expect(note).toContainText(
    "Mentre hi hagi incoherències no es poden generar classes d'aquesta plantilla.",
  );
  evidence.templateInconsistency = await note.textContent();
  await expect(page.getByText("bloquejat: 1 incoherència a la plantilla")).toBeVisible();
  await expect(page.getByRole("button", { name: "GENERAR CLASSES" })).toBeDisabled();
  await screenshot(page, "D3-plantilles-core-1280.png");

  await weekdayTab.click();
  await page.getByRole("menuitemradio").filter({ hasText: "Setmana A" }).click();
  await expect(
    page.getByRole("table", { name: "Quadre setmanal de la plantilla «Setmana A»" }),
  ).toBeVisible();
  const generationCard = page.getByRole("region", { name: "Generar classes — per setmanes" });
  await expect(generationCard.getByRole("combobox", { name: "Setmana" })).toHaveValue(
    generatedWeek,
  );
  await generationCard.getByRole("button", { name: "GENERAR CLASSES" }).click();
  const confirmation = page.getByRole("dialog", { name: "Generar classes — per setmanes" });
  await expect(
    confirmation.getByText(
      `Es generaran com a esborrany les classes de la setmana del ${maskedDate(generatedWeek)}`,
      { exact: true },
    ),
  ).toBeVisible();
  const generation = page.waitForResponse(isCall("POST", /\/api\/v1\/weeks\/[^/]+\/generation$/u));
  await confirmation.getByRole("button", { name: "GENERAR CLASSES" }).click();
  const generated = await generation;
  expect(generated.status()).toBe(200);
  // E4-W14 (E4-W05 review #5): the week is generated from «Setmana A» and the Saturday template.
  const generationBody = generated.request().postDataJSON() as Record<string, unknown>;
  expect(templateIds.get("Dissabtes")).toBeDefined();
  expect(generationBody).toEqual({
    saturdayTemplateId: templateIds.get("Dissabtes"),
    weekdayTemplateId: templateIds.get("Setmana A"),
  });
  const outcome = (await generated.json()) as { classCount: number; skipped: unknown[] };
  expect(outcome.classCount).toBeGreaterThan(0);
  evidence.generation = {
    body: generationBody,
    status: generated.status(),
    ...outcome,
    week: generatedWeek,
  };
  await expect(
    page.getByText(new RegExp(`^${String(outcome.classCount)} classes generades`, "u")),
  ).toBeVisible();

  const weeks = page.getByRole("table", { name: "Setmanes" });
  const generatedRow = weeks.getByRole("row", {
    name: new RegExp(
      `^${String(proposed?.isoYear)} ${String(proposed?.isoWeek)} ${generatedWeek.slice(8, 10)}/${generatedWeek.slice(5, 7)} \\d{2}/\\d{2} · \\d{1,2}:\\d{2} —$`,
      "u",
    ),
  });
  await expect(generatedRow).toBeVisible();

  // D3b: the Monday of «Setmana A», per ring — only the rings its classes use.
  await page.getByRole("button", { name: /^dilluns/iu }).click();
  await page.waitForURL("**/plantilles/*/dia/monday");
  const day = page.getByRole("table", { name: "Plantilla «Setmana A» · dilluns" });
  await expect(day).toBeVisible();
  const headers = (await day.getByRole("columnheader").allTextContents()).map((text) =>
    text.trim(),
  );
  evidence.d3bMondayColumns = headers;
  expect(headers.some((header) => /Central/iu.test(header))).toBe(true);
  expect(headers.some((header) => /Carretera/iu.test(header))).toBe(false);
  await screenshot(page, "D3b-dia-core-1280.png");
  await page.getByRole("button", { name: "Tornar a la visió setmanal" }).click();
  await page.waitForURL("**/plantilles?template=*");
  expect(pageErrors).toEqual([]);
});

test("T-06-28 E2E (b) D4: «Esborrany» opens the seeded draft week, [VALIDAR LA SETMANA], the D4c modal with the 4 registrants (200), «Anul·lades», ring blocks (409 then 201)", async () => {
  test.setTimeout(240_000);
  const page = admin();

  await navigateSpa(page, "/calendari");
  await page.waitForURL(`**/calendari?estat=actives&setmana=${weekStart}`);
  await expect(calendarGrid(page)).toBeVisible();
  await page.getByRole("button", { exact: true, name: "Esborrany" }).click();
  // R-06-07: the first week with drafts is the seeded week +1.
  await page.waitForURL(`**/calendari?estat=esborrany&setmana=${draftWeek}`);
  const drafts = calendarGrid(page);
  const validation = page.getByRole("region", { name: "Validació de la setmana" });
  await expect(validation).toContainText(
    /Setmana vinent · del .+ · \d+ classes en esborrany · cap incoherència/u,
  );
  const draftCount = Number(
    /(\d+) classes en esborrany/u.exec((await validation.textContent()) ?? "")?.[1] ?? Number.NaN,
  );
  expect(draftCount).toBeGreaterThan(0);
  await expect(drafts.locator(".ah-schedule-cell--dashed")).toHaveCount(draftCount);
  await screenshot(page, "D4b-esborrany-core-1280.png");

  await validation.getByRole("button", { name: "VALIDAR LA SETMANA" }).click();
  const validationResponse = page.waitForResponse(
    isCall("POST", /\/api\/v1\/weeks\/[^/]+\/validation$/u),
  );
  await page
    .getByRole("dialog", { name: "Validació de la setmana" })
    .getByRole("button", { name: "VALIDAR LA SETMANA" })
    .click();
  expect((await validationResponse).status()).toBe(200);
  await expect(page.getByText(`${String(draftCount)} classes validades`)).toBeVisible();
  await page.waitForURL(`**/calendari?estat=actives&setmana=${draftWeek}`);
  await expect(drafts.locator(".ah-schedule-cell--dashed")).toHaveCount(0);
  await expect(drafts.locator("button.ah-schedule-cell")).toHaveCount(draftCount);
  evidence.validation = { draftCount, week: draftWeek };

  // Week +2 (validated by the seed): the instructor inconsistency and the R-06-10 class. D4 reads
  // the week on mount and moves with its own arrows (it replaces the address), so the test does too.
  await page.getByRole("button", { name: "Setmana següent" }).click();
  await page.waitForURL(`**/calendari?estat=actives&setmana=${validatedWeek}`);
  const week = calendarGrid(page);
  await expect(week).toBeVisible();
  const warnings = page.getByRole("region", { name: "Avisos d'incoherència de la setmana" });
  await expect(
    warnings.getByRole("button", { name: /assignat a dues pistes alhora/u }),
  ).toHaveCount(1);
  const wednesday = `${caShortDay(registrantsWednesday)} ${dayOfMonth(registrantsWednesday)}`;
  const registrantsClass = week.getByRole("button", {
    name: new RegExp(`^${wednesday} 18:50 · B\\+C · 4\\/5 \\+2`, "u"),
  });
  await expect(registrantsClass).toHaveCount(1);
  await registrantsClass.click();
  const card = page.getByRole("region", { name: /^Classe seleccionada/u });
  await expect(card).toContainText(`Classe seleccionada — ${wednesday} · 18:50 · B+C · Central`);
  await screenshot(page, "D4-actives-core-1280.png");

  const previewResponse = page.waitForResponse(
    isCall("GET", /\/api\/v1\/class-sessions\/[^/]+\/cancellation-preview$/u),
  );
  await card.getByRole("button", { name: "ANUL·LA LA CLASSE" }).click();
  expect((await previewResponse).status()).toBe(200);
  let modal = page.getByRole("dialog", {
    name: new RegExp(`^Anul·lar la classe — ${wednesday} · 18:50 · B\\+C · Central`, "u"),
  });
  await expect(modal.getByRole("table", { name: "Alumnes inscrits" }).getByRole("row")).toHaveCount(
    4,
  );
  let confirm = modal.getByRole("button", { name: "ANUL·LA I AVISA ELS 4 ALUMNES" });
  await expect(confirm).toBeDisabled();
  await modal
    .getByLabel("Text de l'avís")
    .fill(`Integració E4 ${runId}: la classe queda anul·lada. Disculpeu les molèsties!`);
  await expect(confirm).toBeEnabled();
  await expectIconsPainted(modal);
  // The modal is fixed to the viewport: a viewport capture keeps its backdrop whole.
  await screenshot(page, "D4c-modal-core-1280.png", false);
  await modal.getByRole("button", { name: "Torna enrere" }).click();
  await expect(modal).toHaveCount(0);

  // [ELIMINA] goes through the same modal: without text the button stays disabled.
  await card.getByRole("button", { exact: true, name: "ELIMINA" }).click();
  modal = page.getByRole("dialog", { name: /^Anul·lar la classe — / });
  await expect(modal.getByRole("table", { name: "Alumnes inscrits" }).getByRole("row")).toHaveCount(
    4,
  );
  confirm = modal.getByRole("button", { name: "ANUL·LA I AVISA ELS 4 ALUMNES" });
  await expect(confirm).toBeDisabled();
  await modal
    .getByLabel("Text de l'avís")
    .fill(`Integració E4 ${runId}: la classe s'elimina del calendari. Disculpeu les molèsties!`);
  const cancellation = page.waitForResponse(
    isCall("POST", /\/api\/v1\/class-sessions\/[^/]+\/cancellation$/u),
  );
  await confirm.click();
  const cancelled = await cancellation;
  expect(cancelled.status()).toBe(200);
  const cancelledClass = (await cancelled.json()) as {
    cancellation?: { affectedBookings: number; affectedWaitlist: number; reason: string };
    state: string;
  };
  expect(cancelledClass.state).toBe("CANCELLED");
  evidence.classCancellation = { status: cancelled.status(), ...cancelledClass.cancellation };
  const dimmed = week.getByRole("button", {
    name: new RegExp(`^${wednesday} 18:50 · B\\+C · .*anul·lada · (pel club|eliminada)`, "u"),
  });
  await expect(dimmed).toHaveCount(1);

  // Ring blocks: over an active class the api refuses (409 RING_BLOCK_CONFLICT, shown in the
  // drawer); on a free slot it creates the block (201) and the grid draws it.
  await page.getByRole("button", { name: "Bloqueja pista" }).click();
  const drawer = page.getByRole("dialog", { name: "Bloqueja pista" });
  await drawer.getByLabel("Pista").selectOption({ label: "Central" });
  await drawer.getByLabel("Data").fill(maskedDate(registrantsWednesday).replaceAll("/", ""));
  await expect(drawer.getByLabel("Data")).toHaveValue(maskedDate(registrantsWednesday));
  await drawer.getByLabel("De", { exact: true }).selectOption("20:00");
  await drawer.getByLabel("A", { exact: true }).selectOption("21:00");
  await drawer.getByLabel("Nota").fill(`Integració E4 ${runId}`);
  let blockResponse = page.waitForResponse(isCall("POST", /\/api\/v1\/ring-blocks$/u));
  await drawer.getByRole("button", { name: "DESA EL BLOQUEIG" }).click();
  const refused = await blockResponse;
  expect(refused.status()).toBe(409);
  const refusedBody = (await refused.json()) as { code: string; details: unknown };
  expect(refusedBody.code).toBe("RING_BLOCK_CONFLICT");
  evidence.ringBlockConflict = { status: refused.status(), ...refusedBody };
  await expect(drawer.getByRole("list", { name: "Coincideix amb:" })).toContainText("20:00–21:00");
  await drawer.getByLabel("De", { exact: true }).selectOption("11:00");
  await drawer.getByLabel("A", { exact: true }).selectOption("12:00");
  blockResponse = page.waitForResponse(isCall("POST", /\/api\/v1\/ring-blocks$/u));
  await drawer.getByRole("button", { name: "DESA EL BLOQUEIG" }).click();
  const created = await blockResponse;
  expect(created.status()).toBe(201);
  ringBlockId = ((await created.json()) as { id: string }).id;
  evidence.ringBlock = { id: ringBlockId, status: created.status() };
  await expect(page.getByText("Bloqueig desat")).toBeVisible();
  await expect(
    week.getByRole("button", { name: /^Central bloquejada · .+ 11:00–12:00$/u }),
  ).toHaveCount(1);

  // «Anul·lades» opens on the current week (R-06-09), then the arrows reach week +2.
  await page.getByRole("button", { exact: true, name: "Anul·lades" }).click();
  await page.waitForURL(`**/calendari?estat=anul%C2%B7lades&setmana=${weekStart}`);
  for (const monday of [draftWeek, validatedWeek]) {
    await page.getByRole("button", { name: "Setmana següent" }).click();
    await page.waitForURL(`**/calendari?estat=anul%C2%B7lades&setmana=${monday}`);
  }
  await expect(dimmed).toHaveCount(1);
  await screenshot(page, "D4-anullades-core-1280.png");
});

test("T-06-28 E2E (c) screens 10 and 23: the member never sees the cancelled class nor counts, the validated week is visible; the instructor sees the block, the dimmed class and n/n", async ({
  browser,
}) => {
  test.setTimeout(240_000);
  const memberContext = await localizedContext(browser, mobile, "ca");
  const member = await memberContext.newPage();
  await loginClubs(member, "member.4@example.test", "/inici");
  await navigateClubRoute(member, `/avui?date=${registrantsWednesday}`);
  let grid = member.getByRole("table", { name: "Quadre del dia" });
  await expect(grid).toBeVisible();
  await expect(grid.getByText(/\d+\/\d+/u)).toHaveCount(0);
  const evening = grid
    .getByRole("row")
    .filter({ has: member.getByRole("rowheader", { name: "18:50" }) });
  await expect(evening).toHaveCount(1);
  await expect(evening).not.toContainText("B+C");
  // E4-W12 step 7: «Ocupada · manteniment» never breaks inside a word in the 375 px cells.
  expect(await brokenWords(grid)).toEqual([]);
  await screenshot(member, "10-avui-core-375.png");

  // The week validated in (b): its Monday classes reach the member.
  await navigateClubRoute(member, `/avui?date=${draftWeek}`);
  grid = member.getByRole("table", { name: "Quadre del dia" });
  await expect(grid).toBeVisible();
  await expect(grid.getByText("A+B").first()).toBeVisible();
  await memberContext.close();

  const instructorContext = await localizedContext(browser, mobile, "ca");
  const instructor = await instructorContext.newPage();
  await loginClubs(instructor, "instructor@example.test", "/instructor/avui");
  await navigateClubRoute(instructor, `/instructor/avui?date=${registrantsWednesday}`);
  grid = instructor.getByRole("table", { name: "Quadre del dia" });
  await expect(grid).toBeVisible();
  await expect(grid.getByText("Bloq.").first()).toBeVisible();
  await expect(grid.getByText(/^anul·lada/u).first()).toBeVisible();
  await expect(grid.getByText(/\d+\/\d+/u).first()).toBeVisible();
  expect(await brokenWords(grid)).toEqual([]);
  await screenshot(instructor, "23-visio-global-core-375.png");
  await instructorContext.close();

  // Cleanup (f): the run's ring block is cancelled from D4.
  const page = admin();
  await openCalendar(page, "actives", validatedWeek);
  await calendarGrid(page)
    .getByRole("button", { name: /^Central bloquejada · .+ 11:00–12:00$/u })
    .click();
  const blockDrawer = page.getByRole("dialog", { name: "Bloqueig de pista" });
  const blockCancellation = page.waitForResponse(
    isCall("POST", new RegExp(`/api/v1/ring-blocks/${ringBlockId}/cancellation$`, "u")),
  );
  await blockDrawer.getByRole("button", { name: "Anul·la el bloqueig" }).click();
  expect((await blockCancellation).status()).toBe(200);
  await expect(page.getByText("Bloqueig anul·lat")).toBeVisible();
});

test("T-07-32 E2E (d) D7: the four seeded activities, the Torneig blocks every ring on D4, a new seminar published over a class with the conflict dialog; D7 exports against the core", async () => {
  test.setTimeout(300_000);
  const page = admin();

  const listResponse = page.waitForResponse(isCall("GET", /\/api\/v1\/activities$/u));
  await navigateSpa(page, "/activitats");
  const listed = (
    (await (await listResponse).json()) as { items: { id: string; state: string; title: string }[] }
  ).items;
  handlingId = listed.find((item) => item.title === "Seminari de handling")?.id ?? "";
  expect(handlingId).not.toBe("");
  const table = page.getByRole("table", { name: "Llistat d'activitats" });
  for (const title of [
    "Torneig d'Estiu 2026",
    "Seminari de handling",
    "Lliga social — 3a jornada",
    "Demostració Festa Major",
  ]) {
    await expect(table.getByRole("row").filter({ hasText: title })).toHaveCount(1);
  }
  await expect(table.getByText("publicada", { exact: true })).toHaveCount(3);
  await expect(table.getByText("esborrany", { exact: true })).toHaveCount(1);
  await screenshot(page, "D7-llistat-core-1280.png");

  // E4-W05 step 7: the activities export is the file the core returns.
  evidence.activitiesExport = await downloadExport(
    page,
    page.locator("main"),
    /\/api\/v1\/activities\/export$/u,
    "activities-export-download.json",
  );

  // The seeded Torneig (published, conflicts resolved by the seed) blocks the five rings.
  await openCalendar(page, "actives", validatedWeek);
  const week = calendarGrid(page);
  // E4-W12 step 8: an activity on every ring of the band is one cell «… · totes les pistes».
  const tournamentCells = week.locator(".ah-schedule-cell", {
    hasText: "Activitat · Torneig d'Estiu 2026",
  });
  await expect(tournamentCells).toHaveCount(1);
  await expect(tournamentCells).toHaveAccessibleName(
    "Activitat · Torneig d'Estiu 2026 · totes les pistes",
  );
  await expect(tournamentCells).toContainText("totes les pistes · ");
  // E4-W14 (E4-W05 review #7): that one cell is on the Torneig's Saturday, not another day.
  const saturdayColumn = `${caShortDay(tournamentSaturday)} ${dayOfMonth(tournamentSaturday)}`;
  const tournamentByColumn = await cellsByColumn(week, "Activitat · Torneig d'Estiu 2026");
  const tournamentColumns = Object.entries(tournamentByColumn);
  expect(tournamentColumns).toHaveLength(1);
  expect(tournamentColumns[0]?.[0]).toMatch(new RegExp(`^${saturdayColumn}(\\D|$)`, "u"));
  expect(tournamentColumns[0]?.[1]).toBe(1);
  await tournamentCells.scrollIntoViewIfNeeded();
  await screenshot(page, "D4-activitat-totes-les-pistes-core-1280.png");
  evidence.tournamentSaturday = { cellsByColumn: tournamentByColumn, date: tournamentSaturday };

  // A new seminar on the Saturday of the week generated in (a), over the «Dissabtes» class.
  await navigateSpa(page, "/activitats");
  await page.getByRole("button", { name: "Nova activitat" }).click();
  const create = page.getByRole("dialog", { name: "Nova activitat" });
  await create.getByLabel("Títol").fill(seminarTitle);
  await expect(create.getByLabel("Tipus")).toHaveValue("SEMINAR");
  const createdResponse = page.waitForResponse(isCall("POST", /\/api\/v1\/activities$/u));
  await create.getByRole("button", { name: "Crea l'activitat" }).click();
  const createdActivity = await createdResponse;
  expect(createdActivity.status()).toBe(201);
  seminarId = ((await createdActivity.json()) as { id: string }).id;
  await page.waitForURL(`**/activitats/${seminarId}`);
  const card = page.getByRole("region", { name: `Manteniment de l'activitat — ${seminarTitle}` });
  await card
    .getByLabel("Data", { exact: true })
    .fill(maskedDate(seminarSaturday).replaceAll("/", ""));
  await card.getByLabel("Hora d'inici").selectOption("18:30");
  await card.getByLabel("Hora de final").selectOption("20:30");
  await card.getByRole("button", { exact: true, name: "Central" }).click();
  await card.getByLabel("Inscripció: de").fill(maskedDate(clubToday()).replaceAll("/", ""));
  await card
    .getByLabel("Inscripció: al")
    .fill(maskedDate(addDays(seminarSaturday, -1)).replaceAll("/", ""));
  await card.getByLabel("Places").fill("5");
  const waitlistChip = card.getByRole("button", { name: /^Llista d'espera: / });
  if ((await waitlistChip.getAttribute("aria-pressed")) !== "true") {
    await waitlistChip.click();
  }
  await expect(waitlistChip).toHaveText("Llista d'espera: sí");
  const saved = page.waitForResponse(
    isCall("PATCH", new RegExp(`/api/v1/activities/${seminarId}$`, "u")),
  );
  await card.getByRole("button", { exact: true, name: "DESA" }).click();
  const savedResponse = await saved;
  expect(savedResponse.status()).toBe(200);
  await expect(page.getByText("Canvis desats")).toBeVisible();
  // E4-W12 step 6: the seed club has no public web (`publicUrl: null`): no «URL:» line.
  const savedActivity = (await savedResponse.json()) as { publicUrl?: string | null };
  if (savedActivity.publicUrl == null) {
    await expect(card.getByText(/^URL:/u)).toHaveCount(0);
  } else {
    await expect(card.getByText(/^URL:/u)).toHaveCount(1);
  }
  evidence.publicUrl = savedActivity.publicUrl ?? null;
  await screenshot(page, "D7-manteniment-core-1280.png");

  const conflictsResponse = page.waitForResponse(
    isCall("GET", new RegExp(`/api/v1/activities/${seminarId}/ring-conflicts$`, "u")),
  );
  await card.getByRole("button", { exact: true, name: "PUBLICA" }).click();
  const conflicts = (await (await conflictsResponse).json()) as {
    conflicts: { bookedCount?: number; label: string; type: string }[];
  };
  evidence.seminarConflicts = conflicts;
  expect(conflicts.conflicts.filter((conflict) => conflict.type === "CLASS")).toHaveLength(1);
  const dialog = page.getByRole("dialog", { name: "Conflictes de pista" });
  await expect(dialog.getByText(/^Central · A\+B · 18:30–19:30/u)).toBeVisible();
  await dialog.getByLabel("Anul·la les classes en conflicte i avisa els inscrits").check();
  await dialog
    .getByLabel("Text de l'avís")
    .fill(`Integració E4 ${runId}: la pista Central queda reservada per al seminari.`);
  await expectIconsPainted(dialog);
  await screenshot(page, "D7-conflictes-core-1280.png", false);
  const publication = page.waitForResponse(
    isCall("POST", new RegExp(`/api/v1/activities/${seminarId}/publication$`, "u")),
  );
  await dialog.getByRole("button", { name: "PUBLICA I APLICA" }).click();
  expect((await publication).status()).toBe(200);
  await expect(page.getByText("Activitat publicada")).toBeVisible();
  await expect(card.getByText("publicada", { exact: true })).toBeVisible();

  // D4 of that week: the seminar holds Central and the «Dissabtes» class is gone from it.
  await openCalendar(page, "actives", generatedWeek);
  const generated = calendarGrid(page);
  await expect(
    generated.locator(".ah-schedule-cell", { hasText: `Activitat · ${seminarTitle}` }),
  ).toHaveCount(1);
  const saturday = `${caShortDay(seminarSaturday)} ${dayOfMonth(seminarSaturday)}`;
  await expect(
    generated.getByRole("button", {
      name: new RegExp(`^${saturday} 18:30 · A\\+B · .*anul·lada`, "u"),
    }),
  ).toHaveCount(1);
  writeEvidence();
});

test("T-07-32 E2E (e) ca: 04 → detail → register → 03 → cancel in time; the waitlist of the full «Seminari de handling» and the FIFO promotion when the admin adds a place", async ({
  browser,
}) => {
  test.setTimeout(300_000);
  const context = await localizedContext(browser, mobile, "ca");
  const member = await context.newPage();
  await loginClubs(member, "member.4@example.test", "/inici");
  await navigateClubRoute(member, "/reservar");
  const block = member.getByRole("region", { name: "Activitats" });
  const seminarRow = block.getByRole("link", { name: new RegExp(escapeRegExp(seminarTitle), "u") });
  // E4-W14 (R-07-13): the 04 row prints the start–end of an activity that has both.
  const seminarWhen = `${seminarTitle} · ${caShortDay(seminarSaturday)} ${dayOfMonth(seminarSaturday)}/${seminarSaturday.slice(5, 7)} · 18:30–20:30`;
  await expect(seminarRow).toContainText(seminarWhen);
  await expect(seminarRow).toContainText("5 places");
  await screenshot(member, "04-activitats-core-375.png");

  await seminarRow.click();
  await member.waitForURL(`**/activitats/${seminarId}`);
  await expect(member.getByRole("heading", { name: seminarTitle })).toBeVisible();
  await expect(member.getByText("5 places lliures de 5")).toBeVisible();
  await screenshot(member, "activitat-detall-core-375.png");
  const registration = member.waitForResponse(
    isCall("POST", /\/api\/v1\/activity-registrations$/u),
  );
  await member.getByRole("button", { name: "INSCRIU-M'HI" }).click();
  expect((await registration).status()).toBe(201);
  await expect(member.getByText("T'hi has inscrit")).toBeVisible();

  await navigateClubRoute(member, "/inici");
  const reservations = member.getByRole("region", { name: "Les meves reserves" });
  const row = reservations.getByRole("link", { name: new RegExp(escapeRegExp(seminarTitle), "u") });
  await expect(row).toContainText("inscrita");
  await expect(row).toContainText(`${saturdayOn03(seminarSaturday, "ca")}18:30–20:30 · Central`);
  // E4-W14 (E4-W05 review #7, T-07-30 «(no dog)»): an activity row names no dog: the whole row
  // is the title, the state and «{day} · {hh:mm}–{hh:mm} · {place}», nothing else.
  await expect(row).toHaveText(
    new RegExp(
      `^\\s*${escapeRegExp(seminarTitle)}\\s*inscrita\\s*${escapeRegExp(`${saturdayOn03(seminarSaturday, "ca")}18:30–20:30 · Central`)}\\s*$`,
      "u",
    ),
  );
  evidence.row03Ca = (await row.textContent())?.replaceAll(/\s+/gu, " ").trim() ?? null;
  await screenshot(member, "03-inscrita-core-375.png");
  await row.click();
  await member.waitForURL(`**/activitats/${seminarId}`);
  await member.getByRole("button", { name: "ANUL·LA LA INSCRIPCIÓ" }).click();
  const cancelDialog = member.getByRole("dialog", {
    name: `Vols anul·lar la inscripció a ${seminarTitle}?`,
  });
  const memberCancellation = member.waitForResponse(
    isCall("POST", /\/api\/v1\/activity-registrations\/[^/]+\/cancellation$/u),
  );
  await cancelDialog.getByRole("button", { name: "ANUL·LA LA INSCRIPCIÓ" }).click();
  expect((await memberCancellation).status()).toBe(200);
  await expect(member.getByText("Inscripció anul·lada")).toBeVisible();
  await navigateClubRoute(member, "/inici");
  await expect(
    member.getByRole("link", { name: new RegExp(escapeRegExp(seminarTitle), "u") }),
  ).toHaveCount(0);

  // The seeded full seminar (12/12 + 2 waiting): the member joins the waitlist at position 3.
  await navigateClubRoute(member, `/activitats/${handlingId}`);
  await member.getByRole("button", { name: "APUNTA'M A LA LLISTA D'ESPERA" }).click();
  const waitlistDialog = member.getByRole("dialog", {
    name: "Vols apuntar-te a la llista d'espera de Seminari de handling?",
  });
  const joined = member.waitForResponse(isCall("POST", /\/api\/v1\/activity-registrations$/u));
  await waitlistDialog.getByRole("button", { name: "APUNTA'M A LA LLISTA D'ESPERA" }).click();
  const joinedResponse = await joined;
  expect(joinedResponse.status()).toBe(201);
  const joinedRegistration = (await joinedResponse.json()) as {
    id: string;
    position: number | null;
    state: string;
  };
  expect(joinedRegistration).toMatchObject({ position: 3, state: "WAITLISTED" });
  await expect(member.getByText("Ets a la llista d'espera")).toBeVisible();
  await expect(member.getByText("en llista d'espera (3)")).toBeVisible();
  await context.close();

  // Admin: the registrants list shows the member third in the queue; one more place promotes the
  // position-1 registrant (R-07-08 FIFO), never the member who joined last.
  const page = admin();
  const before = await registrantsOf(page, handlingId, async () => {
    await openFresh(page, `/activitats/${handlingId}/inscrits`);
  });
  const mine = before.find((item) => item.registrationId === joinedRegistration.id);
  const first = before.find((item) => item.state === "WAITLISTED" && item.position === 1);
  if (mine === undefined || first === undefined) {
    throw new Error("The waitlist of «Seminari de handling» is not the seeded one");
  }
  const registrants = page.getByRole("table");
  await expect(
    registrants.getByRole("row").filter({ hasText: mine.member.fullName }),
  ).toContainText("en llista d'espera (3)");
  await openFresh(page, `/activitats/${handlingId}`);
  const handling = page.getByRole("region", {
    name: "Manteniment de l'activitat — Seminari de handling",
  });
  await expect(handling.getByLabel("Places")).toHaveValue("12");
  await handling.getByLabel("Places").fill("13");
  const raised = page.waitForResponse(
    isCall("PATCH", new RegExp(`/api/v1/activities/${handlingId}$`, "u")),
  );
  await handling.getByRole("button", { exact: true, name: "DESA" }).click();
  expect((await raised).status()).toBe(200);
  await expect(page.getByText("Canvis desats")).toBeVisible();
  const after = await registrantsOf(page, handlingId, async () => {
    await handling.getByRole("link", { name: /^Inscrits \(\d+\) ›$/u }).click();
  });
  expect(after.find((item) => item.registrationId === first.registrationId)?.state).toBe("ACTIVE");
  expect(after.find((item) => item.registrationId === mine.registrationId)?.state).toBe(
    "WAITLISTED",
  );
  await expect(
    registrants.getByRole("row").filter({ hasText: first.member.fullName }),
  ).toContainText("inscrita");
  await expect(
    registrants.getByRole("row").filter({ hasText: mine.member.fullName }),
  ).toContainText("en llista d'espera");
  evidence.waitlistCa = {
    member: { after: "WAITLISTED", before: mine.position },
    promoted: { after: "ACTIVE", before: first.position },
  };
  await page
    .getByRole("heading", { name: "Inscrits — Seminari de handling" })
    .scrollIntoViewIfNeeded();
  // E4-W12 step 6 (AGENTS rule 6): with the seed's long demo e-mails the table fits 1280 px: no
  // sideways page scroll, the header and «Excel · PDF» inside the viewport, the e-mail clipped
  // with its full value in the tooltip.
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(1280);
  for (const visible of [
    page.getByRole("heading", { name: "Inscrits — Seminari de handling" }),
    page.getByText("Excel · PDF"),
    registrants.getByRole("columnheader", { name: "Contacte" }),
  ]) {
    const box = await visible.boundingBox();
    expect(box).not.toBeNull();
    expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(1280);
  }
  const longContact = registrants.locator(".activity-registrants__contact").first();
  const contactTitle = await longContact.getAttribute("title");
  expect(contactTitle).toContain("@");
  expect(await longContact.textContent()).toBe(contactTitle);
  await screenshot(page, "D7-inscrits-core-1280.png");

  // E4-W05 step 7: the registrants export is the file the core returns.
  evidence.registrantsExport = await downloadExport(
    page,
    page.locator("main"),
    /\/api\/v1\/activity-registrations\/export$/u,
    "registrants-export-download.json",
  );
  writeEvidence();
});

test("T-07-32 E2E (e) es: the same member flow with the es literals, a second FIFO promotion, then the admin cancels the seminar (200) and the registrant reads «cancel·lada pel club»", async ({
  browser,
}) => {
  test.setTimeout(300_000);
  const context = await localizedContext(browser, mobile, "es");
  const member = await context.newPage();
  await loginClubs(member, "member.5@example.test", "/inici", {
    email: "Correo electrónico",
    password: "Contraseña",
  });
  await navigateClubRoute(member, "/reservar");
  const block = member.getByRole("region", { name: "Actividades" });
  const seminarRow = block.getByRole("link", { name: new RegExp(escapeRegExp(seminarTitle), "u") });
  await expect(seminarRow).toContainText("5 plazas");
  await seminarRow.click();
  await member.waitForURL(`**/activitats/${seminarId}`);
  await expect(member.getByText("5 plazas libres de 5")).toBeVisible();
  let registration = member.waitForResponse(isCall("POST", /\/api\/v1\/activity-registrations$/u));
  await member.getByRole("button", { name: "INSCRÍBEME" }).click();
  expect((await registration).status()).toBe(201);
  await expect(member.getByText("Te has inscrito")).toBeVisible();

  await navigateClubRoute(member, "/inici");
  const row = member
    .getByRole("region", { name: "Mis reservas" })
    .getByRole("link", { name: new RegExp(escapeRegExp(seminarTitle), "u") });
  await expect(row).toContainText("inscrita");
  await expect(row).toContainText(`${saturdayOn03(seminarSaturday, "es")}18:30–20:30 · Central`);
  evidence.row03Es = (await row.textContent())?.replaceAll(/\s+/gu, " ").trim() ?? null;
  await screenshot(member, "03-inscrita-core-es-375.png");
  await row.click();
  await member.waitForURL(`**/activitats/${seminarId}`);
  await member.getByRole("button", { name: "ANULAR LA INSCRIPCIÓN" }).click();
  const cancelled = member.waitForResponse(
    isCall("POST", /\/api\/v1\/activity-registrations\/[^/]+\/cancellation$/u),
  );
  await member
    .getByRole("dialog", { name: `¿Quieres anular la inscripción a ${seminarTitle}?` })
    .getByRole("button", { name: "ANULAR LA INSCRIPCIÓN" })
    .click();
  expect((await cancelled).status()).toBe(200);
  await expect(member.getByText("Inscripción anulada")).toBeVisible();
  // E4-W14 (E4-W05 review #7): after her own cancellation the row leaves «Mis reservas» (checked
  // once 03 has read her activities).
  const activitiesRead = member.waitForResponse(isCall("GET", /\/api\/v1\/me\/activities$/u));
  await navigateClubRoute(member, "/inici");
  expect((await activitiesRead).status()).toBe(200);
  await expect(
    member.getByRole("link", { name: new RegExp(escapeRegExp(seminarTitle), "u") }),
  ).toHaveCount(0);
  // Registered again, so that the club's cancellation below reaches a live registration.
  await navigateClubRoute(member, `/activitats/${seminarId}`);
  registration = member.waitForResponse(isCall("POST", /\/api\/v1\/activity-registrations$/u));
  await member.getByRole("button", { name: "INSCRÍBEME" }).click();
  const again = await registration;
  expect(again.status()).toBe(201);
  const seminarRegistration = ((await again.json()) as { id: string }).id;

  await navigateClubRoute(member, `/activitats/${handlingId}`);
  await member.getByRole("button", { name: "APÚNTAME A LA LISTA DE ESPERA" }).click();
  const joined = member.waitForResponse(isCall("POST", /\/api\/v1\/activity-registrations$/u));
  await member
    .getByRole("dialog", { name: /^¿Quieres apuntarte a la lista de espera de / })
    .getByRole("button", { name: "APÚNTAME A LA LISTA DE ESPERA" })
    .click();
  const joinedResponse = await joined;
  expect(joinedResponse.status()).toBe(201);
  const joinedRegistration = (await joinedResponse.json()) as { id: string; position: number };
  await expect(member.getByText("Estás en la lista de espera")).toBeVisible();
  await expect(
    member.getByText(`en lista de espera (${String(joinedRegistration.position)})`),
  ).toBeVisible();
  await screenshot(member, "activitat-llista-espera-core-es-375.png");

  // A second place: the head of the queue again (FIFO), never the members who joined last.
  const page = admin();
  // E4-W14 (E4-W05 review #7): the admin reads the list in es too: the member's chip «en lista de
  // espera (n)», then back to ca for the rest of the flow.
  const language = page.getByRole("combobox", { name: "Idioma" });
  await language.selectOption("es");
  const before = await registrantsOf(page, handlingId, async () => {
    await openFresh(page, `/activitats/${handlingId}/inscrits`);
  });
  const joinedListed = before.find((item) => item.registrationId === joinedRegistration.id);
  if (joinedListed === undefined) throw new Error("The es member is not on the waitlist");
  await expect(
    page.getByRole("table").getByRole("row").filter({ hasText: joinedListed.member.fullName }),
  ).toContainText(`en lista de espera (${String(joinedListed.position)})`);
  await screenshot(page, "D7-inscrits-llista-espera-core-es-1280.png");
  evidence.waitlistChipEs = `en lista de espera (${String(joinedListed.position)})`;
  await language.selectOption("ca");
  await expect(language).toHaveValue("ca");
  const head = before
    .filter((item) => item.state === "WAITLISTED")
    .sort((left, right) => (left.position ?? 0) - (right.position ?? 0))[0];
  if (head === undefined) throw new Error("The waitlist is empty");
  expect(head.registrationId).not.toBe(joinedRegistration.id);
  await openFresh(page, `/activitats/${handlingId}`);
  const handling = page.getByRole("region", {
    name: "Manteniment de l'activitat — Seminari de handling",
  });
  await expect(handling.getByLabel("Places")).toHaveValue("13");
  await handling.getByLabel("Places").fill("14");
  const raised = page.waitForResponse(
    isCall("PATCH", new RegExp(`/api/v1/activities/${handlingId}$`, "u")),
  );
  await handling.getByRole("button", { exact: true, name: "DESA" }).click();
  expect((await raised).status()).toBe(200);
  const after = await registrantsOf(page, handlingId, async () => {
    await handling.getByRole("link", { name: /^Inscrits \(\d+\) ›$/u }).click();
  });
  expect(after.find((item) => item.registrationId === head.registrationId)?.state).toBe("ACTIVE");
  expect(after.find((item) => item.registrationId === joinedRegistration.id)?.state).toBe(
    "WAITLISTED",
  );
  evidence.waitlistEs = { joinedPosition: joinedRegistration.position, promoted: head.position };

  // The admin cancels the seminar through the modal: 200, and the registrant reads «cancel·lada
  // pel club» (the N-32c feed row belongs to screen 11, E7).
  await openFresh(page, `/activitats/${seminarId}`);
  const card = page.getByRole("region", { name: `Manteniment de l'activitat — ${seminarTitle}` });
  await card.getByRole("button", { name: "CANCEL·LA L'ACTIVITAT" }).click();
  const modal = page.getByRole("dialog", { name: `Cancel·lar l'activitat — ${seminarTitle}` });
  const confirm = modal.getByRole("button", { name: /^CANCEL·LA I AVISA / });
  await expect(confirm).toBeDisabled();
  await modal.getByLabel("Text de l'avís").fill(`Integració E4 ${runId}: seminari cancel·lat.`);
  const cancellation = page.waitForResponse(
    isCall("POST", new RegExp(`/api/v1/activities/${seminarId}/cancellation$`, "u")),
  );
  await confirm.click();
  const cancelledActivity = await cancellation;
  expect(cancelledActivity.status()).toBe(200);
  evidence.seminarCancellation = { status: cancelledActivity.status() };
  await expect(page.getByText("Activitat cancel·lada")).toBeVisible();
  const seminarRegistrants = await registrantsOf(page, seminarId, async () => {
    await openFresh(page, `/activitats/${seminarId}/inscrits`);
  });
  const clubCancelled = seminarRegistrants.find(
    (item) => item.registrationId === seminarRegistration,
  );
  if (clubCancelled === undefined) throw new Error("The es registration is not listed");
  expect(clubCancelled).toMatchObject({ cancelReason: "ACTIVITY_CANCELLED", state: "CANCELLED" });
  // Her two rows: the registration she cancelled herself, and the one the club cancelled.
  const herRows = page
    .getByRole("table")
    .getByRole("row")
    .filter({ hasText: clubCancelled.member.fullName });
  await expect(herRows).toHaveCount(2);
  await expect(herRows.filter({ hasText: "cancel·lada pel club" })).toHaveCount(1);
  await expect(herRows.filter({ hasText: /^(?!.*cancel·lada pel club).*anul·lada/u })).toHaveCount(
    1,
  );
  evidence.seminarRegistrants = seminarRegistrants.map((item) => ({
    cancelReason: item.cancelReason,
    state: item.state,
  }));
  await screenshot(page, "D7-inscrits-cancellada-core-1280.png");

  await navigateClubRoute(member, "/inici");
  await expect(
    member.getByRole("link", { name: new RegExp(escapeRegExp(seminarTitle), "u") }),
  ).toHaveCount(0);
  await context.close();
  writeEvidence();
});

test("E4-W05 step 7 · the «Excel · PDF» menus of D5 and D7 with EXPORT_TOO_LARGE and while an export is pending", async () => {
  test.setTimeout(180_000);
  const page = admin();
  for (const [screen, path, pattern] of [
    ["D5", "/abonats", "**/api/v1/members/export**"],
    ["D7", "/activitats", "**/api/v1/activities/export**"],
  ] as const) {
    await navigateSpa(page, path);
    await expect(page.getByRole("table").first()).toBeVisible();
    if (screen === "D5") {
      // E4-W12 step 5: D5's default view applies only «Alta», so it lists members as it opens.
      await expect(page.getByText("Cap abonat amb aquests criteris")).toHaveCount(0);
      await expect(page.getByRole("table").first().getByRole("link").first()).toBeVisible();
    }
    // The api's error shape for the code (CATALEG_ERRORS rule 0: 422).
    await page.route(pattern, (route) =>
      route.fulfill({
        body: JSON.stringify({
          code: "EXPORT_TOO_LARGE",
          details: {},
          message: "Export too large",
          traceId: "e4-w05-export-too-large",
        }),
        contentType: "application/json",
        status: 422,
      }),
    );
    const menu = page.locator("main");
    await menu.getByText("Excel · PDF", { exact: true }).click();
    await menu.getByRole("button", { exact: true, name: "Excel" }).click();
    await expect(page.getByText("L'exportació és massa gran.")).toBeVisible();
    await screenshot(page, `${screen}-export-massa-gran-core-1280.png`, false);
    await page.unroute(pattern);

    // Pending: the answer is held until the capture is taken (deterministic).
    let release: (() => void) | undefined;
    const held = new Promise<void>((resolveHeld) => {
      release = resolveHeld;
    });
    await page.route(pattern, async (route: Route) => {
      await held;
      await route.fulfill({
        body: JSON.stringify({
          code: "EXPORT_TOO_LARGE",
          details: {},
          message: "Export too large",
          traceId: "e4-w05-export-pending",
        }),
        contentType: "application/json",
        status: 422,
      });
    });
    const requested = page.waitForRequest((request) => request.url().includes("/export"));
    await menu.getByRole("button", { exact: true, name: "Excel" }).click();
    await requested;
    await expect(menu.getByRole("button", { exact: true, name: "Excel" })).toBeDisabled();
    await expect(menu.getByRole("button", { exact: true, name: "PDF" })).toBeDisabled();
    await screenshot(page, `${screen}-export-pendent-core-1280.png`, false);
    release?.();
    await expect(menu.getByRole("button", { exact: true, name: "Excel" })).toBeEnabled();
    await page.unroute(pattern);
  }
});
