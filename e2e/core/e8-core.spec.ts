import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import type { Browser, BrowserContext, Locator, Page, Response } from "@playwright/test";

import type { components } from "../../packages/api-client/src/generated/schema";

import { expect, test } from "./oauth-token-log";

// E8-W04 · the E8 gate against the published core and its E8-T06 demo seeds (Cànic + the fictional
// Stripe-enabled FIFO club). Every value asserted in the UI comes from the same run's API answers;
// receipt totals and numbers are never copied from a fixture. The card leg asks `e2e-core.sh` for the
// FakePaymentProvider's events while D6 stays open (`requestFakeCardEvent`).

const clubsUrl = "http://127.0.0.1:4173";
const adminUrl = "http://127.0.0.1:4174";
const fifoClubsUrl = "http://127.0.0.1:4176";
const fifoAdminUrl = "http://127.0.0.1:4177";
const corePassword = requiredEnvironment("E1_CORE_PASSWORD");
const weekStart = requiredEnvironment("E8_WEEK_START");
const evidenceDirectory =
  process.env.CORE_EVIDENCE_DIRECTORY ?? resolve(process.cwd(), "roadmap/evidence/E8-W04");
const desktop = { height: 900, width: 1280 };
const mobile = { height: 844, width: 375 };

const ADMIN = "admin@example.test";
const INSTRUCTOR = "instructor@example.test";
const FIFO_ADMIN = "fifo.admin@example.test";

type Schemas = components["schemas"];
type ApiProblem = Partial<Pick<Schemas["ApiError"], "code" | "details">>;
type BillingPeriod = Schemas["BillingPeriod"];
type BillingSimulation = Schemas["BillingSimulation"];
type BillingRunResult = Schemas["BillingRunResult"];
type Booking = Schemas["Booking"];
type BookableClasses = Schemas["BookableClasses"];
type CardCharges = Schemas["CardChargesResult"];
type CardSetupLink = Schemas["CardSetupLink"];
type Impersonation = Schemas["ImpersonationTokenResponse"];
type InactivityPage = Schemas["InactivityPeriodPage"];
type InactivityPeriod = Schemas["InactivityPeriod"];
type Invoice = Schemas["Invoice"];
type InvoicePage = Schemas["InvoicePage"];
type LeaveRequest = Schemas["LeaveRequest"];
type MeInactivityContext = Schemas["MeInactivityContext"];
type MeInvoicePage = Schemas["MeInvoicePage"];
type MemberListItem = Schemas["MemberListItem"];
type MemberPage = Schemas["ListPageMemberListItem"];
type Pack = Schemas["PackBalanceDetail"];
type RemittanceFile = Schemas["RemittanceFile"];

interface Session {
  /** The club app's own origin, from the core's impersonation `launchUrl`. */
  appOrigin?: string;
  bearer: () => string | undefined;
  context: BrowserContext;
  page: Page;
}

interface CoreAnswer<Body> {
  body: Body;
  status: number;
}

/** What the serial tests hand to each other, and the gate record written at the end. */
interface GateRecord {
  clock?: { instant: string; status: number }[];
  rateLimitWaits?: number[];
  billing?: {
    cashDisplayNumber: string;
    cashLineCount: number;
    chipsAfterGeneration: Schemas["InvoiceCounts"];
    chipsAfterRollback: Schemas["InvoiceCounts"];
    exportFileName: string;
    exportStatus: number;
    firstNumbers: string[];
    incidents: Record<string, number>;
    kpis: {
      cashPending: number;
      collectionDate: string | null;
      count: number;
      inactivityFees: number;
      totalMinor: number;
    };
    receiptCount: number;
    remittanceCount: number;
    remittanceFileName: string;
    remittanceStatus: number;
    remittanceTotalMinor: number;
    secondNumbers: string[];
  };
  card?: {
    banner: "unproven" | { invoice: string; shown: boolean };
    cardSetup: { host?: string; status: number };
    failedChip: number;
    paidChip: number;
    settledWithoutReload: boolean;
    skipped: number;
    submitted: number;
  };
  inactivity?: {
    cancelledBookings: number;
    frozenMemberUntil: string | null;
    fromMonth: string;
    memberId: string;
    ownInvoiceLine?: string;
    screen04Status: number;
  };
  leave?: {
    reasonLabelForEs: string;
    decemberWithout: boolean;
    decemberWithBefore: boolean;
    effectiveDate: string;
    memberId: string;
  };
  pack?: {
    clockMovedTo?: string;
    afterBooking: number;
    afterCancellation: number;
    afterSeededRefund: number;
    before: number;
    expiredRemaining: number;
    memberId: string;
  };
  performance?: Record<string, { max: number; median: number }>;
  permissions?: {
    familyPartnerChecked: boolean;
    foreignInvoice: number;
    foreignLeave: number;
    foreignPeriod: number;
  };
}

/** The member who requests inactivity on 14 and her leave on 15 (T-13-32), and her family. */
interface Lifecycle {
  familyPartner?: MemberListItem;
  invoiceId?: string;
  leaveRequestId?: string;
  member?: MemberListItem;
  periodId?: string;
}

// Playwright starts a new worker after a failing test: the legs hand their ids over through a file
// of the Playwright container's own /tmp (fresh for every stage), not through module state.
const statePath = join(tmpdir(), "e8-w04-state.json");
const saved = (existsSync(statePath) ? JSON.parse(readFileSync(statePath, "utf8")) : {}) as {
  lifecycle?: Lifecycle;
  record?: GateRecord;
};
const record: GateRecord = saved.record ?? {};
const lifecycle: Lifecycle = saved.lifecycle ?? {};

function persistState(): void {
  writeFileSync(statePath, JSON.stringify({ lifecycle, record }));
}

mkdirSync(evidenceDirectory, { recursive: true });

function requiredEnvironment(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === "") throw new Error(`${name} is required`);
  return value;
}

function nextMonth(month: string): string {
  const [yearText, monthText] = month.split("-");
  const year = Number(yearText);
  const value = Number(monthText);
  const next = value === 12 ? { month: 1, year: year + 1 } : { month: value + 1, year };
  return `${String(next.year)}-${String(next.month).padStart(2, "0")}`;
}

/** The last day of a `YYYY-MM` month (S13 §13-1: «inactiva fins» shows it). */
function monthEnd(month: string): string {
  const [yearText, monthText] = month.split("-");
  const last = new Date(Date.UTC(Number(yearText), Number(monthText), 0));
  return last.toISOString().slice(0, 10);
}

/** «31/10»: D5's and D10's day and month. */
function dayMonth(date: string): string {
  const [, month, day] = date.split("-");
  return `${day ?? ""}/${month ?? ""}`;
}

/** The club's (Europe/Madrid) UTC offset on a plain date, «+02:00» or «+01:00». */
function madridOffset(date: string): string {
  const name = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Madrid",
    timeZoneName: "longOffset",
  })
    .formatToParts(new Date(`${date}T12:00:00Z`))
    .find((part) => part.type === "timeZoneName")?.value;
  return name?.replace("GMT", "") ?? "+01:00";
}

const period = nextMonth(weekStart.slice(0, 7));
const monthAfterPeriod = nextMonth(period);
const leaveDate = monthEnd(weekStart.slice(0, 7));
const clockInstant = `${weekStart}T07:00:00${madridOffset(weekStart)}`;
const realClubToday = new Intl.DateTimeFormat("en-CA", {
  day: "2-digit",
  month: "2-digit",
  timeZone: "Europe/Madrid",
  year: "numeric",
}).format(new Date());
// A full IBAN or a Stripe secret: never rendered anywhere (masked accounts are fine).
const secretPattern = /\b[A-Z]{2}\d{2}(?:\s?[A-Z0-9]{4}){4,7}\b|sk_(?:test|live)_/u;

function bearerOf(page: Page): () => string | undefined {
  let bearer: string | undefined;
  page.on("request", (request) => {
    const authorization = request.headers().authorization;
    if (
      bearer === undefined &&
      authorization?.startsWith("Bearer ") === true &&
      request.url().includes("/api/v1/")
    ) {
      bearer = authorization;
    }
  });
  return () => bearer;
}

async function contextFor(
  browser: Browser,
  viewport: { height: number; width: number },
  locale = "ca",
): Promise<BrowserContext> {
  const context = await browser.newContext({ acceptDownloads: true, viewport });
  await context.addInitScript((value) => {
    localStorage.setItem("agilityhub.locale", value);
  }, locale);
  return context;
}

/**
 * The access screen's [ENTRA]. The core limits password logins per IP (`429` with `Retry-After`,
 * E4-W16): this stage needs seven, so a refused one waits what the core asks (once, at most two
 * minutes) and is recorded; any other answer fails.
 */
async function submitPasswordLogin(page: Page): Promise<void> {
  for (let attempt = 0; ; attempt += 1) {
    const token = page.waitForResponse(
      (response) =>
        response.url().endsWith("/oauth2/token") &&
        response.request().method() === "POST" &&
        new URLSearchParams(response.request().postData() ?? "").get("grant_type") === "password",
    );
    await page.getByRole("button", { name: /^(ENTRA|ENTRAR)$/u }).click({ noWaitAfter: true });
    const answer = await token;
    if (answer.status() === 429 && attempt === 0) {
      const seconds = Math.min(Number(answer.headers()["retry-after"] ?? "60") || 60, 120);
      record.rateLimitWaits = [...(record.rateLimitWaits ?? []), seconds];
      await page.waitForTimeout(seconds * 1_000 + 500);
      continue;
    }
    expect(answer.status()).toBe(200);
    return;
  }
}

async function login(
  browser: Browser,
  baseUrl: string,
  email: string,
  viewport = desktop,
): Promise<Session> {
  const context = await contextFor(browser, viewport);
  const page = await context.newPage();
  page.setDefaultTimeout(15_000);
  // A Vite dev server compiles a route on its first hit: navigations get a longer budget.
  page.setDefaultNavigationTimeout(45_000);
  const bearer = bearerOf(page);
  await page.goto(`${baseUrl}/entrar`);
  await page.getByLabel(/Correu electrònic|Correo electrónico|Email/u).fill(email);
  const reveal = page.getByRole("button", { name: /Tinc contrasenya|Tengo contraseña/u });
  if (await reveal.isVisible()) await reveal.click();
  await page.getByLabel(/Contrasenya|Contraseña|Password/u, { exact: true }).fill(corePassword);
  await submitPasswordLogin(page);
  await page.waitForURL((url) => url.pathname === "/tauler" || url.pathname === "/inici");
  await expect.poll(bearer).toBeDefined();
  return { bearer, context, page };
}

async function call<Body = ApiProblem>(
  session: Session,
  path: string,
  method = "GET",
  body?: unknown,
): Promise<CoreAnswer<Body>> {
  const authorization = session.bearer();
  // `POST /test/clock` goes as E5-W04 sends it (answered 200): anonymous and without the key.
  const withKey = method !== "GET" && !path.startsWith("/test/");
  return session.page.evaluate(
    async ({ auth, callBody, callMethod, callPath, keyed }) => {
      const headers: Record<string, string> = {};
      if (auth !== undefined) headers.Authorization = auth;
      if (callBody !== undefined) headers["Content-Type"] = "application/json";
      if (keyed) headers["Idempotency-Key"] = crypto.randomUUID();
      const response = await fetch(`/api/v1${callPath}`, {
        headers,
        method: callMethod,
        ...(callBody === undefined ? {} : { body: JSON.stringify(callBody) }),
      });
      const text = await response.text();
      let parsed: unknown = null;
      try {
        parsed = text === "" ? null : JSON.parse(text);
      } catch {
        parsed = text;
      }
      return { body: parsed, status: response.status };
    },
    { auth: authorization, callBody: body, callMethod: method, callPath: path, keyed: withKey },
  ) as Promise<CoreAnswer<Body>>;
}

/** D10's [Impersona] handoff, landing on the member's 03 (`/inici`) at 375 px. */
async function impersonate(
  browser: Browser,
  admin: Session,
  memberId: string,
  baseUrl = clubsUrl,
  locale = "ca",
): Promise<Session> {
  for (let attempt = 0; ; attempt += 1) {
    const created = await call<Impersonation>(
      admin,
      `/members/${memberId}/impersonation-token`,
      "POST",
      { reason: "E8-W04 published-core verification" },
    );
    expect(created.status).toBe(201);
    const launch = new URL(created.body.launchUrl ?? "");
    const handoff = launch.searchParams.get("handoff");
    expect(handoff).toBeTruthy();
    const context = await contextFor(browser, mobile, locale);
    const page = await context.newPage();
    page.setDefaultTimeout(15_000);
    page.setDefaultNavigationTimeout(45_000);
    const bearer = bearerOf(page);
    const exchanged = page.waitForResponse(
      (response) =>
        response.url().endsWith("/oauth2/token") &&
        new URLSearchParams(response.request().postData() ?? "").get("grant_type") ===
          "urn:agilityhub:grant:handoff",
      { timeout: 60_000 },
    );
    await page.goto(`${baseUrl}/entrar?handoff=${encodeURIComponent(handoff ?? "")}`);
    const exchange = await exchanged;
    // The handoff grant shares the per-IP authentication quota of the password logins (E4-W16).
    if (exchange.status() === 429 && attempt === 0) {
      const seconds = Math.min(Number(exchange.headers()["retry-after"] ?? "60") || 60, 120);
      record.rateLimitWaits = [...(record.rateLimitWaits ?? []), seconds];
      await context.close();
      await new Promise((resolve) => setTimeout(resolve, seconds * 1_000 + 500));
      continue;
    }
    expect(exchange.status()).toBe(200);
    await page.waitForURL((url) => url.pathname === "/inici", { timeout: 60_000 });
    await expect(page.locator(".clubs-shell")).toBeVisible();
    await expect.poll(bearer).toBeDefined();
    const session = { appOrigin: launch.origin, bearer, context, page };
    expect((await call(session, "/me")).status).toBe(200);
    return session;
  }
}

async function iconsPainted(scope: Locator | Page): Promise<void> {
  await expect
    .poll(() =>
      scope
        .locator("svg.ah-icon")
        .evaluateAll((icons) =>
          icons.every(
            (icon) =>
              !(icon instanceof SVGSVGElement) ||
              icon.getClientRects().length === 0 ||
              icon.getBBox().width > 0,
          ),
        ),
    )
    .toBe(true);
}

async function shot(page: Page, name: string): Promise<void> {
  await page.evaluate(() => {
    window.scrollTo(0, 0);
  });
  await iconsPainted(page);
  await page.evaluate(async () => document.fonts.ready);
  const viewport = page.viewportSize();
  if (viewport === null) throw new Error("The evidence page has no viewport");
  const height = await page.evaluate(() =>
    Math.max(document.body.scrollHeight, document.documentElement.scrollHeight),
  );
  await page.screenshot({
    clip: { height, width: viewport.width, x: 0, y: 0 },
    path: join(evidenceDirectory, name),
  });
}

/** A viewport shot with `target` scrolled into view (the admin shell scrolls inside `main`). */
async function shotAt(page: Page, target: Locator, name: string): Promise<void> {
  await target.scrollIntoViewIfNeeded();
  await iconsPainted(page);
  await page.screenshot({ path: join(evidenceDirectory, name) });
}

async function noSecretsRendered(page: Page): Promise<void> {
  expect(await page.locator("body").innerText()).not.toMatch(secretPattern);
}

async function navigateSpa(page: Page, path: string): Promise<void> {
  await page.evaluate((nextPath) => {
    window.history.pushState(null, "", nextPath);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }, path);
  const pathname = path.split("?")[0] ?? path;
  await expect.poll(() => new URL(page.url()).pathname).toBe(pathname);
}

/**
 * Opens an app route. Inside an already loaded app it moves in-app (history + popstate, as its
 * links do), which spends no token grant: the core's per-IP authentication quota (E4-W16, about
 * forty grants a minute here) also counts every refresh a full reload makes. The same path with
 * another query (D6's month) is loaded for real, since the page reads its month when mounted.
 */
async function visit(page: Page, url: string): Promise<void> {
  const target = new URL(url);
  const current = new URL(page.url());
  if (
    current.origin === target.origin &&
    current.pathname !== "/entrar" &&
    current.pathname !== target.pathname
  ) {
    await navigateSpa(page, `${target.pathname}${target.search}`);
    return;
  }
  await page.goto(url);
}

/**
 * A pause before a leg that starts with fresh logins and impersonations: the quota above refills
 * within a minute, and the refresh grants it refuses (429) have no retry in the app.
 */
async function letAuthQuotaRefill(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 30_000));
}

function responseIs(method: string, pattern: RegExp) {
  return (response: Response) =>
    response.request().method() === method && pattern.test(new URL(response.url()).pathname);
}

async function invoicePage(admin: Session, filter: string[]): Promise<InvoicePage> {
  const query = new URLSearchParams({
    fields: "displayNumber,member,concept,total,paymentMethodType,status,runId,period,rolledBack",
    page: "0",
    size: "200",
  });
  filter.forEach((value) => {
    query.append("filter", value);
  });
  const answer = await call<InvoicePage>(admin, `/invoices?${query.toString()}`);
  expect(answer.status).toBe(200);
  return answer.body;
}

async function billingPeriod(admin: Session, month: string): Promise<BillingPeriod> {
  const answer = await call<BillingPeriod>(admin, `/billing/periods/${month}`);
  expect(answer.status).toBe(200);
  return answer.body;
}

/** The chips row of D6 reads the counts of `GET /billing/periods/{period}` (the «Cobrats» chip has none). */
async function expectChips(page: Page, counts: Schemas["InvoiceCounts"]): Promise<void> {
  const chips = page.getByRole("group", { name: "Estat dels rebuts" });
  await expect(chips.getByRole("button", { name: `Tots (${String(counts.all)})` })).toBeVisible();
  await expect(
    chips.getByRole("button", { name: `Pendents (${String(counts.pending)})` }),
  ).toBeVisible();
  await expect(
    chips.getByRole("button", { name: `Remesats (${String(counts.remitted)})` }),
  ).toBeVisible();
  await expect(
    chips.getByRole("button", { name: `Impagats (${String(counts.failed)})` }),
  ).toBeVisible();
}

function kpi(page: Page, label: string): Locator {
  return page.locator(".billing-kpi").filter({ hasText: label }).locator(".billing-kpi__value");
}

/** [1 · SIMULA EL MES] on D6 of `month`; the page's own `POST /billing/simulations` answer. */
async function simulateOnD6(
  page: Page,
  baseUrl: string,
  month: string,
): Promise<BillingSimulation> {
  await page.goto(`${baseUrl}/facturacio?mes=${month}`);
  const simulate = page.getByRole("button", { name: "1 · SIMULA EL MES" }).first();
  await expect(simulate).toBeEnabled({ timeout: 45_000 });
  const response = page.waitForResponse(responseIs("POST", /\/api\/v1\/billing\/simulations$/u));
  await simulate.click();
  const http = await response;
  expect(http.status()).toBe(201);
  await expect(page.getByText("Mes simulat.")).toBeVisible();
  return (await http.json()) as BillingSimulation;
}

/**
 * `POST /test/clock {instant}` (api E5-T06, `test`/`local` profiles), as E5-W04 does it: anonymously
 * when the core allows it, else with a throwaway admin session. Moving the clock expires the
 * sessions issued before, so every caller logs in again afterwards. The E8 week is only open for
 * bookings at the seed's clock: without it the run cannot prove the pack leg, so it fails.
 */
async function setClock(browser: Browser, instant = clockInstant): Promise<void> {
  const context = await contextFor(browser, desktop);
  const page = await context.newPage();
  await page.goto(`${adminUrl}/entrar`);
  const anonymous = { bearer: () => undefined, context, page } satisfies Session;
  let answer = await call(anonymous, "/test/clock", "POST", { instant });
  if (answer.status === 401 || answer.status === 403) {
    const admin = await login(browser, adminUrl, ADMIN);
    answer = await call(admin, "/test/clock", "POST", { instant });
    await admin.context.close();
  }
  record.clock = [...(record.clock ?? []), { instant, status: answer.status }];
  expect(answer.status, JSON.stringify(answer.body)).toBe(200);
  await context.close();
}

/** The member Laura plays in T-13-32: ACTIVE, monthly plan, SEPA, nothing pending, in a family. */
async function lifecycleCandidates(admin: Session): Promise<{
  family?: MemberListItem;
  member: MemberListItem;
}> {
  const answer = await call<MemberPage>(
    admin,
    "/members?page=0&size=200&sort=memberNumber,desc&fields=fullName,memberNumber,plan,paymentMethod,displayStatus,hasPendingRequest,leaveDate,familyGroup",
  );
  expect(answer.status).toBe(200);
  const members = answer.body.items as MemberListItem[];
  const eligible = members.filter(
    (member) =>
      member.displayStatus?.kind === "ACTIVE" &&
      member.hasPendingRequest !== true &&
      member.leaveDate === undefined &&
      member.paymentMethod?.type === "SEPA_DD" &&
      /abonat/iu.test(member.plan?.name ?? ""),
  );
  const partnerOf = (member: MemberListItem) =>
    members.find(
      (other) =>
        other.id !== member.id &&
        other.displayStatus?.kind === "ACTIVE" &&
        other.familyGroup !== undefined &&
        other.familyGroup.id === member.familyGroup?.id,
    );
  const inFamily = eligible.find((member) => partnerOf(member) !== undefined);
  const member = inFamily ?? eligible[0];
  if (member === undefined) throw new Error("The E8 seed has no eligible monthly SEPA member");
  const family = inFamily === undefined ? undefined : partnerOf(inFamily);
  return { family, member };
}

async function findPackCase(
  admin: Session,
): Promise<{ bookingId: string; memberId: string; pack: Pack }> {
  const members = await call<MemberPage>(
    admin,
    "/members?page=0&size=200&fields=fullName,memberNumber,plan,dogs&sort=memberNumber,asc",
  );
  expect(members.status).toBe(200);
  const adminMembers = members.body.items as MemberListItem[];
  const likely = adminMembers.filter((member) => /pack|sess/iu.test(member.plan?.name ?? ""));
  for (const member of likely.length === 0 ? adminMembers : likely) {
    const balances = await call<Pack[]>(admin, `/pack-balances?memberId=${member.id}`);
    if (balances.status !== 200) continue;
    const pack = balances.body.find(
      (candidate) =>
        candidate.state === "ACTIVE" &&
        candidate.movements.some(
          (movement) => movement.type === "CONSUME" && movement.bookingId != null,
        ),
    );
    const bookingId = pack?.movements.find(
      (movement) => movement.type === "CONSUME" && movement.bookingId != null,
    )?.bookingId;
    if (pack !== undefined && bookingId != null) return { bookingId, memberId: member.id, pack };
  }
  throw new Error("E8 demo seed has no live pack booking with a CONSUME movement");
}

async function packRemaining(session: Session, packId: string): Promise<Pack> {
  const answer = await call<Pack[]>(session, "/me/pack-balances");
  expect(answer.status).toBe(200);
  const pack = answer.body.find((item) => item.id === packId);
  if (pack === undefined) throw new Error("The member's pack is absent from /me/pack-balances");
  return pack;
}

/** 07 by address: [ANUL·LA LA RESERVA] → [ANUL·LA]; the api's answer. */
async function cancelFrom07(page: Page, bookingId: string): Promise<Booking> {
  await navigateSpa(page, `/reserves/${bookingId}`);
  await page.getByRole("button", { name: "ANUL·LA LA RESERVA" }).click();
  const cancellation = page.waitForResponse(
    responseIs("POST", new RegExp(`/api/v1/bookings/${bookingId}/cancellation$`, "u")),
  );
  await page.getByRole("dialog").getByRole("button", { exact: true, name: "ANUL·LA" }).click();
  const response = await cancellation;
  expect(response.status()).toBe(200);
  return (await response.json()) as Booking;
}

/** Screen 13 (`/gossos`): the pack card of the dog shows the remaining sessions. */
async function expectPackCard(page: Page, remaining: number): Promise<void> {
  const read = page.waitForResponse(responseIs("GET", /\/api\/v1\/me\/pack-balances$/u));
  await navigateSpa(page, "/inici");
  await navigateSpa(page, "/gossos");
  expect((await read).status()).toBe(200);
  await expect(page.locator(".dog-pack").first()).toContainText(String(remaining));
}

/**
 * Asks `e2e-core.sh`'s watcher to deliver one FakePaymentProvider event for the FIFO club's latest
 * Stripe collection (the evidence folder is shared with the host) and waits for its answer.
 */
async function requestFakeCardEvent(event: "payment_intent.succeeded"): Promise<void> {
  const directory = join(evidenceDirectory, ".e8-fake-card");
  expect(existsSync(directory), "e2e-core.sh runs the fake-card watcher beside this stage").toBe(
    true,
  );
  const done = join(directory, "done");
  rmSync(done, { force: true });
  writeFileSync(join(directory, "request"), `${event}\n`);
  await expect
    .poll(() => (existsSync(done) ? readFileSync(done, "utf8").trim() : ""), {
      intervals: [2_000],
      timeout: 240_000,
    })
    .toBe(`${event} 0`);
  rmSync(done, { force: true });
}

async function performanceLoads(
  page: Page,
  suffix: string,
  authorization: string,
): Promise<{ max: number; median: number }> {
  const durations = await page.evaluate(
    async ({ auth, value }) => {
      performance.clearResourceTimings();
      for (let index = 0; index < 5; index += 1) {
        const separator = value.includes("?") ? "&" : "?";
        const response = await fetch(`/api/v1/invoices${value}${separator}probe=${String(index)}`, {
          cache: "no-store",
          headers: { Authorization: auth },
        });
        if (!response.ok) throw new Error(`GET /invoices answered ${String(response.status)}`);
        await response.arrayBuffer();
      }
      return performance
        .getEntriesByType("resource")
        .filter((entry) => entry.name.includes("/api/v1/invoices"))
        .slice(-5)
        .map((entry) => entry.duration);
    },
    { auth: authorization, value: suffix },
  );
  expect(durations).toHaveLength(5);
  const sorted = [...durations].sort((left, right) => left - right);
  return {
    max: Math.round(Math.max(...durations) * 100) / 100,
    median: Math.round((sorted[2] ?? 0) * 100) / 100,
  };
}

function writeRecord(): void {
  writeFileSync(
    join(evidenceDirectory, "e8-gate-record.json"),
    `${JSON.stringify({ clockInstant, leaveDate, period, weekStart, ...record }, null, 2)}\n`,
  );
}

// In file order on one worker (the config's `workers: 1`). Not `serial`: a failing leg must not
// hide the independent ones (pack, card); a leg that needs an earlier one's member says so.
test.describe.configure({ mode: "default" });

test.afterEach(() => {
  persistState();
  writeRecord();
});

test("E8-W04 T-13-32 (e·1): screen 14 request → «Inactivitats» → D10 approval; the seeded inactive member on 04, D5 and D10", async ({
  browser,
}) => {
  test.setTimeout(240_000);
  await setClock(browser);
  const admin = await login(browser, adminUrl, ADMIN);
  const { page } = admin;
  const { family, member } = await lifecycleCandidates(admin);
  lifecycle.member = member;
  lifecycle.familyPartner = family;

  // Laura's request on 14, in ca: the first month the core still accepts (R-13-01).
  const laura = await impersonate(browser, admin, member.id);
  const contextRead = laura.page.waitForResponse(
    responseIs("GET", /\/api\/v1\/me\/inactivity-periods$/u),
  );
  await navigateSpa(laura.page, "/inactivitat");
  const contextHttp = await contextRead;
  expect(contextHttp.status()).toBe(200);
  const inactivityContext = (await contextHttp.json()) as MeInactivityContext;
  const fromMonth = inactivityContext.earliestFromMonth;
  // The wrapper's E8 week starts before the 25th (inactivity.requestDeadlineDay) of its month.
  expect(fromMonth, "the billing month of this run is the first month still requestable").toBe(
    period,
  );
  await expect(laura.page.getByRole("heading", { name: "Període d'inactivitat" })).toBeVisible();
  await laura.page.getByLabel("Mes d'inici (obligatori)").selectOption(fromMonth);
  await laura.page.getByLabel("Mes de finalització (si el saps)").fill(fromMonth);
  await laura.page.getByLabel("Comentaris").fill("Pausa fictícia E8-W04");
  const submit = laura.page.getByRole("button", { name: "ENVIA LA SOL·LICITUD" });
  await expect(submit).toBeEnabled();
  await shot(laura.page, "14-inactivitat-core-375.png");
  const requested = laura.page.waitForResponse(
    responseIs("POST", /\/api\/v1\/me\/inactivity-periods$/u),
  );
  await submit.click();
  expect((await requested).status()).toBe(201);
  // 14 reloads the profile after the 201 (its «desat» toast does not survive the reload: see the
  // report): the profile row reads the request, and her context lists the new period.
  await laura.page.waitForURL((url) => url.pathname === "/perfil");
  await expect(laura.page.getByRole("link", { name: /pendent d'aprovació/u })).toBeVisible();
  const afterRequest = await call<MeInactivityContext>(laura, "/me/inactivity-periods");
  expect(afterRequest.status).toBe(200);
  const requestedPeriod = afterRequest.body.periods.find(
    (item) => item.fromMonth === fromMonth && item.state === "REQUESTED",
  );
  if (requestedPeriod === undefined) throw new Error("Laura's request is not in her context");
  expect(requestedPeriod.toMonth).toBe(fromMonth);
  lifecycle.periodId = requestedPeriod.id;
  await noSecretsRendered(laura.page);

  // The admin reviews it in «Inactivitats i baixes» and approves it in the D10 drawer.
  await visit(page, `${adminUrl}/inactivitats`);
  await expect(page.getByRole("heading", { name: "Inactivitats i baixes" })).toBeVisible();
  await shot(page, "inactivitats-i-baixes-core-1280.png");
  await page
    .getByRole("link", { name: `Obre la fitxa de ${member.fullName ?? ""}` })
    .last()
    .click();
  await expect(page).toHaveURL(new RegExp(`/abonats/${member.id}`, "u"));
  const inactivityDrawer = page.getByRole("dialog", { name: "Inactivitat" });
  await expect(inactivityDrawer.getByRole("button", { name: "Aprova" })).toBeVisible();
  await shot(page, "D10-calaix-inactivitat-core-1280.png");
  const approvedResponse = page.waitForResponse(
    responseIs(
      "POST",
      new RegExp(`/api/v1/inactivity-periods/${requestedPeriod.id}/decision$`, "u"),
    ),
  );
  await inactivityDrawer.getByRole("button", { name: "Aprova" }).click();
  await page
    .getByRole("dialog", { name: "Aprova el període" })
    .getByRole("button", { name: "Aprova" })
    .click();
  const approvedHttp = await approvedResponse;
  expect(approvedHttp.status()).toBe(200);
  const approved = (await approvedHttp.json()) as InactivityPeriod;
  expect(["APPROVED", "ACTIVE"]).toContain(approved.state);
  // R-13-05/06: the toast reports the bookings the approval cancelled, from the core's answer.
  await expect(
    page.getByText(
      new RegExp(
        `S'han anul·lat ${String(approved.cancelledBookings.length)} reserv(?:a|es)$`,
        "u",
      ),
    ),
  ).toBeVisible();

  // The seeded inactive member (this month and the next): D5 and D10 show the last day of toMonth
  // (S13 §13-1), and 04 shows her classes as not bookable for inactivity (T-13-32).
  const periods = await call<InactivityPage>(admin, "/inactivity-periods?page=0&size=200");
  expect(periods.status).toBe(200);
  const frozen = periods.body.items.find(
    (item) => item.state === "ACTIVE" && item.member?.id !== member.id,
  );
  const frozenMember = frozen?.member;
  if (frozen === undefined || frozenMember === undefined) {
    throw new Error("The E8 seed's active inactivity is absent");
  }
  const until = frozen.toMonth == null ? null : monthEnd(frozen.toMonth);
  const statusText = until === null ? "inactiva" : `inactiva fins ${dayMonth(until)}`;
  await visit(page, `${adminUrl}/abonats`);
  await page
    .getByRole("searchbox", { name: "Cerca per nom, DNI, gos…" })
    .fill(frozenMember.fullName);
  await expect(
    page.locator("tbody tr").filter({ hasText: frozenMember.fullName }).first(),
  ).toContainText(statusText);
  await visit(page, `${adminUrl}/abonats/${frozenMember.id}`);
  await expect(page.getByText(statusText, { exact: true }).first()).toBeVisible();

  const eva = await impersonate(browser, admin, frozenMember.id);
  const bookableResponse = eva.page.waitForResponse(
    responseIs("GET", /\/api\/v1\/me\/bookable-classes$/u),
  );
  await navigateSpa(eva.page, "/reservar");
  const bookableHttp = await bookableResponse;
  const bookableBody = (await bookableHttp.json()) as BookableClasses | ApiProblem;
  record.inactivity = {
    cancelledBookings: approved.cancelledBookings.length,
    frozenMemberUntil: until,
    fromMonth: approved.fromMonth,
    memberId: member.id,
    screen04Status: bookableHttp.status(),
  };
  expect(bookableHttp.status(), JSON.stringify(bookableBody)).toBe(200);
  const bookable = bookableBody as BookableClasses;
  expect(bookable.classes.some((item) => item.state === "BOOKABLE")).toBe(false);
  expect(
    bookable.classes.some(
      (item) => item.state === "NOT_BOOKABLE" && item.notBookableReason === "INACTIVITY",
    ),
  ).toBe(true);
  await expect(
    eva.page.getByText("Aquest abonament està en un període d'inactivitat.").first(),
  ).toBeVisible();
  await noSecretsRendered(eva.page);
  await Promise.all([admin.context.close(), laura.context.close(), eva.context.close()]);
});

test("E8-W04 (d) R-12-23/24 pack: a 04 booking consumes one session, an in-time 07 cancellation returns it, 13 shows both; the expired pack stays unusable", async ({
  browser,
}) => {
  test.setTimeout(300_000);
  let admin = await login(browser, adminUrl, ADMIN);
  const packCase = await findPackCase(admin);
  let member = await impersonate(browser, admin, packCase.memberId);
  const before = (await packRemaining(member, packCase.pack.id)).remaining;

  // The seeded booking is cancelled in time first: its session comes back once (REFUND).
  const seededCancellation = await cancelFrom07(member.page, packCase.bookingId);
  expect(seededCancellation.cancellation?.late).toBe(false);
  const afterSeeded = await packRemaining(member, packCase.pack.id);
  expect(afterSeeded.remaining).toBe(before + 1);
  expect(
    afterSeeded.movements.filter(
      (movement) => movement.type === "REFUND" && movement.bookingId === packCase.bookingId,
    ),
  ).toHaveLength(1);

  // 04: a BOOKABLE class of the pack's dog, held and confirmed (E5-W01's flow). At the seed's
  // Monday 07:00 the week is not open yet: the core's test clock goes to the earliest opening
  // (`opensAt` of the row), with a re-login after the move.
  const bookablePath = `/me/bookable-classes?dogId=${encodeURIComponent(packCase.pack.dogId)}`;
  let clockMovedTo: string | undefined;
  let bookable = await call<BookableClasses>(member, bookablePath);
  expect(bookable.status).toBe(200);
  if (!bookable.body.classes.some((item) => item.state === "BOOKABLE")) {
    const openings = bookable.body.classes
      .filter((item) => item.state === "NOT_YET_OPEN" && item.opensAt != null)
      .map((item) => Date.parse(item.opensAt ?? ""))
      .sort((left, right) => left - right);
    const opening = openings[0];
    if (opening !== undefined) {
      clockMovedTo = new Date(opening + 60_000).toISOString();
      await Promise.all([admin.context.close(), member.context.close()]);
      await setClock(browser, clockMovedTo);
      admin = await login(browser, adminUrl, ADMIN);
      member = await impersonate(browser, admin, packCase.memberId);
      bookable = await call<BookableClasses>(member, bookablePath);
      expect(bookable.status).toBe(200);
    }
  }
  // The latest open class: the furthest from the late-cancellation threshold.
  const row = bookable.body.classes
    .filter((item) => item.state === "BOOKABLE")
    .sort((left, right) => right.startsAtLocal.localeCompare(left.startsAtLocal))[0];
  if (row === undefined) {
    const states = bookable.body.classes.map(
      (item) =>
        `${item.startsAtLocal} ${item.state}/${item.notBookableReason ?? "-"} opens ${item.opensAt ?? "-"}`,
    );
    throw new Error(
      `The pack's dog has no BOOKABLE class: ${JSON.stringify({ block: bookable.body.bookingBlock, pack: bookable.body.pack, states })}`,
    );
  }
  const pageRead = member.page.waitForResponse(
    responseIs("GET", /\/api\/v1\/me\/bookable-classes$/u),
  );
  await navigateSpa(member.page, "/reservar");
  expect((await pageRead).status()).toBe(200);
  const dogName = bookable.body.dogs.find((dog) => dog.id === packCase.pack.dogId)?.name ?? "";
  const chip = member.page.getByRole("button", {
    name: new RegExp(`^${dogName.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")}(?: ·| \\(|$)`, "u"),
  });
  if ((await chip.count()) > 0 && (await chip.first().getAttribute("aria-pressed")) !== "true") {
    const reread = member.page.waitForResponse(
      responseIs("GET", /\/api\/v1\/me\/bookable-classes$/u),
    );
    await chip.first().click();
    expect((await reread).status()).toBe(200);
  }
  const hold = member.page.waitForResponse(responseIs("POST", /\/api\/v1\/seat-holds$/u));
  await member.page.locator(`.class-row[data-class-id="${row.id}"]`).getByRole("button").click();
  expect((await hold).status()).toBe(201);
  const booked = member.page.waitForResponse(responseIs("POST", /\/api\/v1\/bookings$/u));
  await member.page.getByRole("button", { name: "CONFIRMAR LA RESERVA" }).click();
  const bookedHttp = await booked;
  expect(bookedHttp.status()).toBe(201);
  const booking = (await bookedHttp.json()) as Booking;
  const afterBooking = await packRemaining(member, packCase.pack.id);
  expect(afterBooking.remaining).toBe(afterSeeded.remaining - 1);
  expect(
    afterBooking.movements.filter(
      (movement) => movement.type === "CONSUME" && movement.bookingId === booking.id,
    ),
  ).toHaveLength(1);
  await expectPackCard(member.page, afterBooking.remaining);
  await shotAt(member.page, member.page.locator(".dog-pack").first(), "13-pack-core-375.png");

  // 07 within the threshold: the session is back and 13 shows it.
  const cancelled = await cancelFrom07(member.page, booking.id);
  expect(cancelled.cancellation?.late, JSON.stringify(cancelled.cancellation)).toBe(false);
  const afterCancellation = await packRemaining(member, packCase.pack.id);
  expect(afterCancellation.remaining).toBe(afterBooking.remaining + 1);
  expect(
    afterCancellation.movements.filter(
      (movement) => movement.type === "REFUND" && movement.bookingId === booking.id,
    ),
  ).toHaveLength(1);
  await expectPackCard(member.page, afterCancellation.remaining);
  await noSecretsRendered(member.page);

  // B11: Joan's expired pack shows «caducat» with its remaining sessions, which 04 cannot use.
  const expiredMember = (
    await call<MemberPage>(
      admin,
      "/members?page=0&size=200&filter=leaveSource:eq:PACK_EXPIRED&fields=fullName,memberNumber,leaveDate,leaveSource",
    )
  ).body.items[0];
  if (expiredMember === undefined) throw new Error("The E8 expired-pack member is absent");
  const expiredPacks = await call<Pack[]>(admin, `/pack-balances?memberId=${expiredMember.id}`);
  expect(expiredPacks.status).toBe(200);
  const expiredPack = expiredPacks.body.find(
    (item) => item.state === "EXPIRED" && item.remaining > 0,
  );
  if (expiredPack === undefined) throw new Error("The E8 expired pack with a balance is absent");
  const joan = await impersonate(browser, admin, expiredMember.id);
  await expectPackCard(joan.page, expiredPack.remaining);
  await expect(joan.page.locator(".dog-pack").filter({ hasText: "caducat" })).toBeVisible();
  const joanBookable = await call<BookableClasses>(
    joan,
    `/me/bookable-classes?dogId=${encodeURIComponent(expiredPack.dogId)}`,
  );
  if (joanBookable.status === 200) {
    expect(joanBookable.body.pack?.available ?? 0).toBe(0);
    expect(joanBookable.body.classes.some((item) => item.state === "BOOKABLE")).toBe(false);
  }
  record.pack = {
    afterBooking: afterBooking.remaining,
    afterCancellation: afterCancellation.remaining,
    afterSeededRefund: afterSeeded.remaining,
    before,
    clockMovedTo,
    expiredRemaining: expiredPack.remaining,
    memberId: packCase.memberId,
  };
  await Promise.all([admin.context.close(), member.context.close(), joan.context.close()]);
});

test("E8-W04 T-12-27 (a)(b) + step 3 + step 5: simulate → generate → XML → returned → rollback → same numbers; cash paid; accounting export; GET /invoices timings", async ({
  browser,
}) => {
  test.setTimeout(420_000);
  const admin = await login(browser, adminUrl, ADMIN);
  const { page } = admin;
  const laura = lifecycle.member;
  if (laura === undefined) throw new Error("The inactivity leg did not choose its member");

  // D6 simulation: every number below is the real answer this page caused.
  const simulation = await simulateOnD6(page, adminUrl, period);
  const simulated = await billingPeriod(admin, period);
  // The KPIs are the seed's own figures as the month reads them back (not hard-coded).
  expect(simulated.simulation?.id).toBe(simulation.id);
  expect(simulated.simulation?.kpis).toEqual(simulation.kpis);
  await expect(kpi(page, "Rebuts del mes")).toHaveText(String(simulation.kpis.count));
  await expect(kpi(page, "En efectiu")).toHaveText(String(simulation.kpis.cashPending));
  await expect(kpi(page, "Quota d'inactivitat")).toHaveText(
    String(simulation.kpis.inactivityFees.count),
  );
  const incidentsCard = page.locator(".billing-simulation");
  for (const incident of simulation.incidents) {
    await expect(
      incidentsCard.getByText(incident.memberName, { exact: true }).first(),
    ).toBeVisible();
  }
  for (const cash of simulation.cashMembers) {
    const cashRow = incidentsCard.locator("tr").filter({ hasText: cash.memberName }).first();
    await expect(cashRow).toBeVisible();
    if (cash.plannedLeaveDate != null) {
      const [year, month, day] = cash.plannedLeaveDate.split("-");
      await expect(cashRow).toContainText("data de baixa prevista:");
      await expect(cashRow).toContainText(
        new RegExp(`0?${String(Number(day))}/0?${String(Number(month))}/${year ?? ""}`, "u"),
      );
    }
  }
  // R-13-08: Laura's approved month is billed as the inactivity fee.
  const lauraPreview = simulation.invoicesPreview.find((preview) => preview.memberId === laura.id);
  expect(lauraPreview?.lines.map((line) => line.origin)).toContain("INACTIVITY_FEE");
  // E90 (d): before the run the amount KPI reads the date the run would ask for.
  const plannedCollection = simulation.kpis.collectionDate;
  if (plannedCollection != null) {
    const [, collectionMonth, collectionDay] = plannedCollection.split("-");
    await expect(
      page.locator(".billing-kpi").filter({ hasText: "Import de la remesa" }),
    ).toContainText(`data de cobrament: ${collectionDay ?? ""}/${collectionMonth ?? ""}`);
  }
  await shot(page, "D6-facturacio-core-1280.png");

  const generate = page.getByRole("button", { name: /2 · GENERA/u });
  await expect(generate).toBeEnabled();
  await generate.click();
  const generateModal = page.getByRole("dialog", { name: /Genera els rebuts/u });
  await expect(generateModal).toContainText(String(simulation.kpis.count));
  const generatedResponse = page.waitForResponse(responseIs("POST", /\/api\/v1\/billing\/runs$/u));
  await generateModal.getByRole("button", { exact: true, name: "Genera" }).click();
  const generatedHttp = await generatedResponse;
  expect(generatedHttp.status()).toBe(201);
  const firstRun = (await generatedHttp.json()) as BillingRunResult;
  const firstInvoices = await invoicePage(admin, [
    `period:eq:${period}`,
    `runId:eq:${firstRun.run.id}`,
  ]);
  const firstNumbers = firstInvoices.items.map((item) => item.displayNumber ?? "");
  expect(firstNumbers).toHaveLength(firstRun.run.invoiceIds.length);
  expect(firstNumbers.every((value) => /^\d{4}-\d{4}$/u.test(value))).toBe(true);
  const generated = await billingPeriod(admin, period);
  expect(generated.counts.all).toBe(firstNumbers.length);
  await expectChips(page, generated.counts);
  await shot(page, "D6-generat-core-1280.png");
  await shotAt(
    page,
    page.getByRole("group", { name: "Estat dels rebuts" }),
    "D6-generat-rebuts-core-1280.png",
  );

  // The remittances page: the run's SEPA file, downloaded (status, name, Content-Type; not parsed).
  const remittance = firstRun.remittance;
  if (remittance == null) throw new Error("E8 Cànic run has no SEPA remittance");
  await visit(page, `${adminUrl}/facturacio/remeses?mes=${period}`);
  const remittanceRow = page.locator(`tr[data-remittance-status="${remittance.status}"]`).filter({
    hasText: String(remittance.count),
  });
  await expect(remittanceRow).toBeVisible();
  await shot(page, "remeses-core-1280.png");
  const metadataRequest = page.waitForResponse(
    responseIs("GET", new RegExp(`/api/v1/remittances/${remittance.id}/file$`, "u")),
  );
  const remittanceDownload = page.waitForEvent("download");
  await remittanceRow.getByRole("button", { name: "Descarrega l'XML" }).click();
  const [metadataHttp, downloadedXml] = await Promise.all([metadataRequest, remittanceDownload]);
  expect(metadataHttp.status()).toBe(200);
  const fileAnswer = (await metadataHttp.json()) as RemittanceFile;
  expect(fileAnswer.fileName).toMatch(/\.xml$/u);
  expect(downloadedXml.suggestedFilename()).toBe(fileAnswer.fileName);
  const signedFile = new URL(fileAnswer.downloadUrl, adminUrl);
  const fileResponse = await page.request.get(
    `${adminUrl}${signedFile.pathname}${signedFile.search}`,
  );
  expect(fileResponse.status()).toBe(200);
  expect(fileResponse.headers()["content-type"]).toContain("xml");
  expect(fileResponse.headers()["content-disposition"]).toContain(fileAnswer.fileName);

  // D6 → D10 through an «Obre fitxa» link of the simulation (E8-W04 6b(d)), when there is one.
  const firstLinked = simulation.incidents[0] ?? simulation.cashMembers[0];
  if (firstLinked !== undefined) {
    await visit(page, `${adminUrl}/facturacio?mes=${period}`);
    await page
      .getByRole("link", { name: `Obre fitxa de ${firstLinked.memberName}` })
      .first()
      .click();
    await expect(page).toHaveURL(new RegExp(`/abonats/${firstLinked.memberId}$`, "u"));
    await expect(page.getByRole("heading", { name: firstLinked.memberName })).toBeVisible();
  }

  // One direct debit returned by hand, then the strong rollback through the UI.
  const returnedRow = firstInvoices.items.find((item) => item.paymentMethodType === "SEPA_DD");
  if (returnedRow?.displayNumber === undefined) {
    throw new Error("The generated run has no numbered direct-debit receipt");
  }
  await visit(page, `${adminUrl}/facturacio?mes=${period}`);
  await page
    .getByRole("searchbox", { name: "Cerca per número o abonat" })
    .fill(returnedRow.displayNumber);
  await page
    .getByRole("button", { exact: true, name: `Obre el rebut ${returnedRow.displayNumber}` })
    .click();
  const returnedDrawer = page.getByRole("dialog", {
    name: `Rebut ${returnedRow.displayNumber}`,
  });
  await returnedDrawer.getByRole("button", { name: "Marca impagat" }).click();
  const failModal = page.getByRole("dialog", { name: "Marca impagat" });
  await failModal.getByLabel("Data de l'impagat").fill(realClubToday);
  await failModal.getByLabel("Motiu").fill("Devolució bancària fictícia E8-W04");
  const failureResponse = page.waitForResponse(
    responseIs("POST", new RegExp(`/api/v1/invoices/${returnedRow.id}/failure$`, "u")),
  );
  await failModal.getByRole("button", { exact: true, name: "Marca impagat" }).click();
  const failureHttp = await failureResponse;
  expect(failureHttp.status()).toBe(200);
  expect(((await failureHttp.json()) as Invoice).status).toBe("FAILED");
  await expect(returnedDrawer.getByText("impagat (manual)")).toBeVisible();
  await returnedDrawer.getByRole("button", { name: "Tanca el rebut" }).click();
  await page.getByRole("button", { name: "Retrocedeix la remesa" }).click();
  const rollbackModal = page.getByRole("dialog", { name: /Retrocedeix la remesa/u });
  await rollbackModal.getByLabel("Escriu RETROCEDIR per confirmar-ho").fill("RETROCEDIR");
  await rollbackModal.getByLabel("Motiu").fill("Assaig publicat E8-W04");
  const rollbackResponse = page.waitForResponse(responseIs("POST", /\/rollback$/u));
  await rollbackModal.getByRole("button", { exact: true, name: "Retrocedeix" }).click();
  expect((await rollbackResponse).status()).toBe(200);
  const rolledBack = await billingPeriod(admin, period);
  expect(rolledBack.counts).toEqual({ all: 0, failed: 0, paid: 0, pending: 0, remitted: 0 });
  await expectChips(page, rolledBack.counts);
  const cancelledInvoices = await invoicePage(admin, [
    `period:eq:${period}`,
    "status:eq:CANCELLED",
  ]);
  expect(cancelledInvoices.items).toHaveLength(firstNumbers.length);
  expect(cancelledInvoices.items.every((item) => item.rolledBack === true)).toBe(true);
  await shot(page, "D6-retroces-core-1280.png");

  // R-12-14: simulate and generate again → the same displayNumber values.
  const secondSimulationResponse = page.waitForResponse(
    responseIs("POST", /\/api\/v1\/billing\/simulations$/u),
  );
  await page.getByRole("button", { name: "1 · SIMULA EL MES" }).first().click();
  expect((await secondSimulationResponse).status()).toBe(201);
  await page.getByRole("button", { name: /2 · GENERA/u }).click();
  const secondGenerateModal = page.getByRole("dialog", { name: /Genera els rebuts/u });
  const secondRunResponse = page.waitForResponse(responseIs("POST", /\/api\/v1\/billing\/runs$/u));
  await secondGenerateModal.getByRole("button", { exact: true, name: "Genera" }).click();
  const secondRunHttp = await secondRunResponse;
  expect(secondRunHttp.status()).toBe(201);
  const secondRun = (await secondRunHttp.json()) as BillingRunResult;
  const secondInvoices = await invoicePage(admin, [
    `period:eq:${period}`,
    `runId:eq:${secondRun.run.id}`,
  ]);
  const secondNumbers = secondInvoices.items.map((item) => item.displayNumber ?? "");
  expect([...secondNumbers].sort()).toEqual([...firstNumbers].sort());

  // (b) A2 9 · A29: the half-year cash receipt, marked paid in bulk from «Pendents».
  const cashDetails = await Promise.all(
    secondInvoices.items
      .filter((item) => item.paymentMethodType === "MANUAL")
      .map(async (item) => ({ detail: await call<Invoice>(admin, `/invoices/${item.id}`), item })),
  );
  const halfYearCash = cashDetails.find(({ detail }) => detail.body.lines.length > 1);
  const cashDisplayNumber = halfYearCash?.item.displayNumber;
  if (halfYearCash === undefined || cashDisplayNumber === undefined) {
    throw new Error("The regenerated run has no half-year cash receipt");
  }
  const regenerated = await billingPeriod(admin, period);
  await page
    .getByRole("group", { name: "Estat dels rebuts" })
    .getByRole("button", { name: `Pendents (${String(regenerated.counts.pending)})` })
    .click();
  await page.getByRole("searchbox", { name: "Cerca per número o abonat" }).fill(cashDisplayNumber);
  const cashRow = page
    .getByRole("table", { name: /Rebuts ·/u })
    .locator(`tbody tr[data-invoice-number="${cashDisplayNumber}"]`);
  await expect(cashRow).toContainText("pendent · marca cobrat");
  await cashRow.locator("input[type=checkbox]:not([disabled])").click();
  const markPaidSelection = page.getByRole("button", { name: "Marcar cobrat (selecció)" });
  await expect(markPaidSelection).toBeEnabled();
  await markPaidSelection.click();
  const paidResponse = page.waitForResponse(responseIs("POST", /\/api\/v1\/invoices\/payments$/u));
  await page
    .getByRole("dialog", { name: "Marcar cobrat" })
    .getByRole("button", { name: "Marca cobrat" })
    .click();
  expect((await paidResponse).status()).toBe(200);
  const paidCash = await call<Invoice>(admin, `/invoices/${halfYearCash.item.id}`);
  expect(paidCash.body.status).toBe("PAID");
  await page
    .getByRole("group", { name: "Estat dels rebuts" })
    .getByRole("button", { exact: true, name: "Cobrats" })
    .click();
  await expect(
    page
      .getByRole("table", { name: /Rebuts ·/u })
      .locator(`tbody tr[data-invoice-number="${cashDisplayNumber}"]`),
  ).toContainText("cobrat");

  // Step 3: [Exporta per a comptabilitat] → the request, its status and the file name (not opened).
  const exportRequest = page.waitForResponse(
    (response) =>
      response.request().method() === "GET" &&
      new URL(response.url()).pathname.endsWith("/api/v1/billing/exports"),
  );
  await page.getByRole("button", { name: "Exporta per a comptabilitat" }).click();
  const exportModal = page.getByRole("dialog", { name: "Exporta per a comptabilitat" });
  await expect(exportModal.getByRole("radio", { name: "CSV" })).toBeChecked();
  const exportDownload = page.waitForEvent("download");
  await exportModal.getByRole("button", { name: "Exporta" }).click();
  const [exported, downloadedExport] = await Promise.all([exportRequest, exportDownload]);
  const exportUrl = new URL(exported.url());
  expect(exportUrl.searchParams.get("period")).toBe(period);
  expect(exportUrl.searchParams.get("format")).toBe("csv");
  expect([200, 202]).toContain(exported.status());
  expect(downloadedExport.suggestedFilename()).toMatch(/\.csv$/u);
  expect(exported.headers()["content-disposition"] ?? "").toContain(
    downloadedExport.suggestedFilename(),
  );

  // Laura's own receipt for the month carries «Quota inactivitat — {month}» (R-13-08).
  const lauraInvoice = secondInvoices.items.find((item) => item.member?.id === laura.id);
  if (lauraInvoice === undefined) throw new Error("Laura's inactivity receipt was not generated");
  lifecycle.invoiceId = lauraInvoice.id;
  const lauraSession = await impersonate(browser, admin, laura.id);
  const own = await call<MeInvoicePage>(
    lauraSession,
    `/me/invoices?page=0&size=50&filter=period:eq:${period}`,
  );
  expect(own.status).toBe(200);
  const ownLine = own.body.items
    .find((item) => item.id === lauraInvoice.id)
    ?.lines.find((line) => line.origin === "INACTIVITY_FEE");
  expect(ownLine?.description).toMatch(/^Quota inactivitat — /u);
  if (record.inactivity !== undefined) record.inactivity.ownInvoiceLine = ownLine?.description;
  await navigateSpa(lauraSession.page, "/rebuts");
  await expect(lauraSession.page.locator(".receipt-list")).toBeVisible();
  await expect(lauraSession.page.locator(".receipt-list")).toContainText(
    ownLine?.description ?? "Quota inactivitat",
  );
  await shot(lauraSession.page, "rebuts-core-375.png");
  await noSecretsRendered(lauraSession.page);

  // D10's billing block of the same member, with the real receipts.
  await visit(page, `${adminUrl}/abonats/${laura.id}`);
  await expect(page.getByRole("heading", { name: laura.fullName ?? "" })).toBeVisible();
  await expect(page.locator("body")).toContainText(lauraInvoice.displayNumber ?? "");
  await expect(page.locator(".member-billing")).toContainText(lauraInvoice.displayNumber ?? "");
  await shotAt(page, page.locator(".member-billing"), "D10-bloc-facturacio-core-1280.png");
  await noSecretsRendered(page);

  // Step 5: five loads of the full month and of two filters, as browser resource timings.
  const authorization = admin.bearer() ?? "";
  record.performance = {
    failed: await performanceLoads(
      page,
      `?page=0&size=200&filter=period:eq:${period}&filter=status:eq:FAILED`,
      authorization,
    ),
    full: await performanceLoads(
      page,
      `?page=0&size=200&filter=period:eq:${period}`,
      authorization,
    ),
    paid: await performanceLoads(
      page,
      `?page=0&size=200&filter=period:eq:${period}&filter=status:eq:PAID`,
      authorization,
    ),
  };

  const incidentCounts = Object.fromEntries(
    [...new Set(simulation.incidents.map((item) => item.code))].map((code) => [
      code,
      simulation.incidents.filter((item) => item.code === code).length,
    ]),
  );
  record.billing = {
    cashDisplayNumber,
    cashLineCount: halfYearCash.detail.body.lines.length,
    chipsAfterGeneration: generated.counts,
    chipsAfterRollback: rolledBack.counts,
    exportFileName: downloadedExport.suggestedFilename(),
    exportStatus: exported.status(),
    firstNumbers: [...firstNumbers].sort(),
    incidents: incidentCounts,
    kpis: {
      cashPending: simulation.kpis.cashPending,
      collectionDate: simulation.kpis.collectionDate ?? null,
      count: simulation.kpis.count,
      inactivityFees: simulation.kpis.inactivityFees.count,
      totalMinor: simulation.kpis.total.amountMinor,
    },
    receiptCount: firstNumbers.length,
    remittanceCount: remittance.count,
    remittanceFileName: fileAnswer.fileName,
    remittanceStatus: fileResponse.status(),
    remittanceTotalMinor: remittance.total.amountMinor,
    secondNumbers: [...secondNumbers].sort(),
  };
  await Promise.all([admin.context.close(), lauraSession.context.close()]);
});

test("E8-W04 T-13-32 (e·2) in es: 15 → «Baixes» → D10 approval → D5 «baixa dd/mm» and «Baixes previstes»; the month after has no receipt (R-13-11)", async ({
  browser,
}) => {
  test.setTimeout(300_000);
  const admin = await login(browser, adminUrl, ADMIN);
  const { page } = admin;
  const laura = lifecycle.member;
  if (laura === undefined) throw new Error("The inactivity leg did not choose its member");

  // Control: before her leave, the month after the billed one still bills her.
  const before = await simulateOnD6(page, adminUrl, monthAfterPeriod);
  const billedBefore = before.invoicesPreview.some((preview) => preview.memberId === laura.id);
  expect(billedBefore).toBe(true);

  let leaveReasonLabel = "";
  const member = await impersonate(browser, admin, laura.id, clubsUrl, "es");
  await member.page.goto(`${clubsUrl}/perfil`);
  await member.page.locator(".shell-language select").selectOption("es");
  await expect(member.page.getByRole("heading", { name: "Mi perfil" })).toBeVisible();
  await navigateSpa(member.page, "/baixa");
  await expect(member.page.getByRole("heading", { name: "Solicitar la baja" })).toBeVisible();
  const leaveContext = await call<Schemas["MeLeaveContext"]>(member, "/me/leave-requests");
  expect(leaveContext.status).toBe(200);
  const reason = leaveContext.body.reasons[0];
  if (reason === undefined) throw new Error("The leave reason catalog is empty");
  // Evidence: the label the core sends this es reader (S13 §6: «in the reader's locale»).
  leaveReasonLabel = reason.label;
  await member.page.getByLabel("Fecha en la que quieres la baja").fill(leaveDate);
  await member.page.getByLabel("Motivo").selectOption(reason.key);
  if (leaveContext.body.npsEnabled) {
    await member.page.locator(".leave-nps").getByRole("button", { exact: true, name: "8" }).click();
  }
  await member.page
    .getByLabel("¿Qué podríamos mejorar para que el club se adaptara mejor a tus necesidades?")
    .fill("Canvi fictici de disponibilitat E8-W04");
  await shot(member.page, "15-baixa-core-375.png");
  const leaveRequestResponse = member.page.waitForResponse(
    responseIs("POST", /\/api\/v1\/me\/leave-requests$/u),
  );
  await member.page.getByRole("button", { name: "ENVÍA LA SOLICITUD" }).click();
  const leaveRequestHttp = await leaveRequestResponse;
  expect(leaveRequestHttp.status()).toBe(201);
  const requestedLeave = (await leaveRequestHttp.json()) as LeaveRequest;
  expect(requestedLeave.requestedDate).toBe(leaveDate);
  lifecycle.leaveRequestId = requestedLeave.id;
  await noSecretsRendered(member.page);

  await visit(page, `${adminUrl}/inactivitats`);
  await page.getByRole("tab", { name: "Baixes" }).click();
  await page
    .getByRole("link", { name: `Obre la fitxa de ${laura.fullName ?? ""}` })
    .last()
    .click();
  const leaveDrawer = page.getByRole("dialog", { name: "Baixa (amb data)" });
  await expect(leaveDrawer.getByLabel("Data d'efecte")).toHaveValue(leaveDate);
  await shot(page, "D10-calaix-baixa-core-1280.png");
  const leaveDecisionResponse = page.waitForResponse(
    responseIs("POST", new RegExp(`/api/v1/leave-requests/${requestedLeave.id}/decision$`, "u")),
  );
  await leaveDrawer.getByRole("button", { name: "Aprova" }).click();
  const leaveDecisionHttp = await leaveDecisionResponse;
  expect(leaveDecisionHttp.status()).toBe(200);
  expect(((await leaveDecisionHttp.json()) as LeaveRequest).state).toBe("APPROVED");

  await visit(page, `${adminUrl}/abonats`);
  await page
    .getByRole("searchbox", { name: "Cerca per nom, DNI, gos…" })
    .fill(laura.fullName ?? "");
  const defaultRow = page.locator("tbody tr").filter({ hasText: laura.fullName ?? "" });
  await expect(defaultRow).toContainText(`baixa ${dayMonth(leaveDate)}`);
  await page.locator("summary").filter({ hasText: "Vistes" }).click();
  await page.getByRole("combobox", { name: "Vistes" }).selectOption({ label: "Baixes previstes" });
  const plannedRow = page.locator("tbody tr").filter({ hasText: laura.fullName ?? "" });
  await expect(
    plannedRow.getByRole("link", { exact: true, name: laura.fullName ?? "" }),
  ).toBeVisible();
  await expect(plannedRow).toContainText(dayMonth(leaveDate));
  await expect(plannedRow).toContainText("sol·licitud de l'abonat");
  await page.locator("summary").filter({ hasText: "Vistes" }).click();
  await shot(page, "D5-baixes-previstes-core-1280.png");

  // R-13-11: after the leave, the next month is simulated again and she is no longer billed.
  const after = await simulateOnD6(page, adminUrl, monthAfterPeriod);
  const billedAfter = after.invoicesPreview.some((preview) => preview.memberId === laura.id);
  expect(billedAfter).toBe(false);
  record.leave = {
    decemberWithBefore: billedBefore,
    decemberWithout: !billedAfter,
    effectiveDate: leaveDate,
    memberId: laura.id,
    reasonLabelForEs: leaveReasonLabel,
  };
  await Promise.all([admin.context.close(), member.context.close()]);
});

test("E8-W04 (f) T-13-24 / T-12-21: instructor gates, another member's /me/…/{id} (also a family member's) is not found, nothing secret rendered", async ({
  browser,
}) => {
  test.setTimeout(300_000);
  await letAuthQuotaRefill();
  const admin = await login(browser, adminUrl, ADMIN);
  const periodId = lifecycle.periodId;
  const invoiceId = lifecycle.invoiceId;
  const leaveRequestId = lifecycle.leaveRequestId;
  if (periodId === undefined || invoiceId === undefined || leaveRequestId === undefined) {
    throw new Error("The lifecycle and billing legs did not leave their ids");
  }

  const instructor = await login(browser, adminUrl, INSTRUCTOR);
  await expect(instructor.page.getByText("Facturació", { exact: true })).toHaveCount(0);
  await expect(instructor.page.getByText("Inactivitats i baixes", { exact: true })).toHaveCount(0);
  // Direct routes inside the signed-in app (a full reload races the refresh rotation, INC-07).
  for (const route of ["/facturacio", "/inactivitats"]) {
    await instructor.page.evaluate((path) => {
      window.history.pushState(null, "", path);
      window.dispatchEvent(new PopStateEvent("popstate"));
    }, route);
    await expect(instructor.page.locator("main")).toBeVisible();
    await expect(instructor.page.locator("main")).not.toContainText(
      /Pas 1 — Simulació|1 · SIMULA EL MES|Inactivitats i baixes/u,
    );
  }
  await noSecretsRendered(instructor.page);
  expect((await call(instructor, `/billing/periods/${period}`)).status).toBe(403);

  // A member of another household: the receipt's own route shows the error state, never the data.
  // Laura's `/me/…/{id}` operations as the snapshot publishes them (PATCH of her period, the
  // cancellation of her leave request) answer 404 to anyone else (T-13-24).
  const packCase = await findPackCase(admin).catch(() => undefined);
  const strangerId =
    packCase?.memberId ??
    (await call<MemberPage>(admin, "/members?page=0&size=1&fields=fullName")).body.items[0]?.id ??
    "";
  const stranger = await impersonate(browser, admin, strangerId);
  const foreignInvoice = await call(stranger, `/me/invoices/${invoiceId}`);
  expect(foreignInvoice.status).toBe(404);
  const foreignPeriod = await call(stranger, `/me/inactivity-periods/${periodId}`, "PATCH", {
    comments: "E8-W04 foreign edit",
    version: 0,
  });
  expect(foreignPeriod.status, JSON.stringify(foreignPeriod.body)).toBe(404);
  const foreignLeave = await call(
    stranger,
    `/me/leave-requests/${leaveRequestId}/cancellation`,
    "POST",
  );
  expect(foreignLeave.status, JSON.stringify(foreignLeave.body)).toBe(404);
  await navigateSpa(stranger.page, `/rebuts/${invoiceId}`);
  await expect(
    stranger.page.getByText("No s'han pogut carregar els rebuts.").first(),
  ).toBeVisible();
  await expect(stranger.page.locator(".receipt-detail")).toHaveCount(0);
  await noSecretsRendered(stranger.page);

  // Her family-group partner gets the same 404s (T-13-24: «també del seu grup familiar»).
  let familyPartnerChecked = false;
  if (lifecycle.familyPartner !== undefined) {
    const partner = await impersonate(browser, admin, lifecycle.familyPartner.id);
    const partnerPeriod = await call(partner, `/me/inactivity-periods/${periodId}`, "PATCH", {
      comments: "E8-W04 family edit",
      version: 0,
    });
    expect(partnerPeriod.status, JSON.stringify(partnerPeriod.body)).toBe(404);
    const partnerLeave = await call(
      partner,
      `/me/leave-requests/${leaveRequestId}/cancellation`,
      "POST",
    );
    expect(partnerLeave.status, JSON.stringify(partnerLeave.body)).toBe(404);
    familyPartnerChecked = true;
    await partner.context.close();
  }
  // Nothing of the above changed Laura's records.
  const lauraPeriod = await call<InactivityPeriod>(admin, `/inactivity-periods/${periodId}`);
  expect(lauraPeriod.body.comments ?? "").not.toContain("E8-W04 foreign edit");
  expect(lauraPeriod.body.comments ?? "").not.toContain("E8-W04 family edit");
  const lauraLeave = await call<LeaveRequest>(admin, `/leave-requests/${leaveRequestId}`);
  expect(lauraLeave.body.state).toBe("APPROVED");
  record.permissions = {
    familyPartnerChecked,
    foreignInvoice: foreignInvoice.status,
    foreignLeave: foreignLeave.status,
    foreignPeriod: foreignPeriod.status,
  };
  await Promise.all([admin.context.close(), instructor.context.close(), stranger.context.close()]);
});

test("E8-W04 (c) card leg on the fictional Stripe club: [COBRA LES TARGETES] → 202 → CHARGING settles on its own (6b(a)) → «impagat (targeta)» and the member's banner → «cobrat»", async ({
  browser,
}) => {
  test.setTimeout(600_000);
  await letAuthQuotaRefill();
  const admin = await login(browser, fifoAdminUrl, FIFO_ADMIN);
  const { page } = admin;
  await page.goto(`${fifoAdminUrl}/facturacio?mes=${period}`);
  const initial = await billingPeriod(admin, period);
  if (initial.simulation == null || initial.run == null) {
    const response = page.waitForResponse(responseIs("POST", /\/api\/v1\/billing\/simulations$/u));
    await page.getByRole("button", { name: "1 · SIMULA EL MES" }).first().click();
    expect((await response).status()).toBe(201);
  }
  if (initial.run == null) {
    await page.getByRole("button", { name: /2 · GENERA/u }).click();
    const dialog = page.getByRole("dialog", { name: /Genera els rebuts/u });
    const response = page.waitForResponse(responseIs("POST", /\/api\/v1\/billing\/runs$/u));
    await dialog.getByRole("button", { exact: true, name: "Genera" }).click();
    expect((await response).status()).toBe(201);
  }
  const chargeCards = page.getByRole("button", { exact: true, name: "COBRA LES TARGETES" });
  await expect(chargeCards).toBeEnabled();
  await chargeCards.click();
  const chargeModal = page.getByRole("dialog", { name: "Cobra les targetes" });
  const chargeResponse = page.waitForResponse(responseIs("POST", /\/card-charges$/u));
  await chargeModal.getByRole("button", { exact: true, name: "Cobra" }).click();
  const chargedHttp = await chargeResponse;
  expect(chargedHttp.status()).toBe(202);
  const charged = (await chargedHttp.json()) as CardCharges;
  expect(charged.submitted).toBeGreaterThan(0);
  await expect(page.getByText("Cobrant les targetes…")).toBeVisible();
  const charging = await billingPeriod(admin, period);
  expect(charging.run?.status).toBe("CHARGING");

  // The submitted receipt is COLLECTING («cobrant» on D6). The local FakePaymentProvider only
  // answers `payment_intent.succeeded` (its CLI: `billing:fake-webhook payment_intent.succeeded`),
  // so the failed side comes from what the charge itself refused: a CARD receipt without a usable
  // card is FAILED{NO_PAYMENT_METHOD} and listed in `skipped` (R-12-13).
  const runId = charging.run?.id ?? "";
  const skippedIds = new Set(charged.skipped.map((item) => item.invoiceId));
  const cardReceipts = async () =>
    (await invoicePage(admin, [`period:eq:${period}`, "paymentMethodType:eq:CARD"])).items;
  const submittedReceipt = (await cardReceipts()).find((item) => !skippedIds.has(item.id));
  if (submittedReceipt?.displayNumber === undefined) throw new Error("No submitted card receipt");
  expect(submittedReceipt.status).toBe("COLLECTING");
  const receiptsTable = page.getByRole("table", { name: /Rebuts ·/u });
  await expect(
    receiptsTable.locator(`tbody tr[data-invoice-number="${submittedReceipt.displayNumber}"]`),
  ).toContainText("cobrant");

  let banner: NonNullable<GateRecord["card"]>["banner"] = "unproven";
  const skipped = charged.skipped[0];
  if (skipped !== undefined) {
    const skippedInvoice = await call<Invoice>(admin, `/invoices/${skipped.invoiceId}`);
    expect(skippedInvoice.status).toBe(200);
    expect(skippedInvoice.body.status).toBe("FAILED");
    // A second tab reads the month as it is now; the first one keeps polling the CHARGING run.
    const now = await billingPeriod(admin, period);
    const second = await admin.context.newPage();
    await second.goto(`${fifoAdminUrl}/facturacio?mes=${period}`);
    await expect(
      second
        .getByRole("group", { name: "Estat dels rebuts" })
        .getByRole("button", { name: `Impagats (${String(now.counts.failed)})` }),
    ).toBeVisible();
    await expect(
      second
        .getByRole("table", { name: /Rebuts ·/u })
        .locator(`tbody tr[data-invoice-number="${skippedInvoice.body.displayNumber}"]`),
    ).toContainText("impagat (targeta)");
    await noSecretsRendered(second);
    await second.close();

    // The member: /rebuts shows the card banner; [Actualitza la targeta] reaches a checkoutUrl
    // (the provider's form itself is never opened: every other host is aborted).
    const cardMember = await impersonate(
      browser,
      admin,
      skippedInvoice.body.memberId,
      fifoClubsUrl,
    );
    await navigateSpa(cardMember.page, "/rebuts");
    const bannerCard = cardMember.page.locator(".billing-card-banner");
    await expect(bannerCard).toContainText("No hem pogut cobrar el rebut de");
    await shot(cardMember.page, "rebuts-targeta-core-375.png");
    // Its action is the `POST /me/card-setup` proven below on the club's own host (this page runs
    // on the local dev server, whose address the core rightly refuses as a redirect).
    await expect(bannerCard.getByRole("button", { name: "Actualitza la targeta" })).toBeEnabled();
    await noSecretsRendered(cardMember.page);
    banner = { invoice: skippedInvoice.body.displayNumber, shown: true };
    await cardMember.context.close();
  }

  // The provider confirms the submitted payment. The first tab, never reloaded since
  // [COBRA LES TARGETES], leaves «Cobrant les targetes…» by itself and reads the month again
  // (E8-W04 6b(a)); the receipt reads «cobrat» under «Cobrats».
  await requestFakeCardEvent("payment_intent.succeeded");
  await expect
    .poll(
      async () => {
        const receipt = (await cardReceipts()).find((item) => item.id === submittedReceipt.id);
        const run = await call<{ status?: string }>(admin, `/billing/runs/${runId}`);
        return `${receipt?.status ?? "none"} · run ${run.body.status ?? String(run.status)}`;
      },
      { intervals: [3_000], timeout: 90_000 },
    )
    .toBe("PAID · run COMPLETED");
  await expect(page.getByText("Cobrant les targetes…")).toHaveCount(0, { timeout: 30_000 });
  const settled = await billingPeriod(admin, period);
  expect(settled.counts.paid).toBeGreaterThan(0);
  await expect(
    page
      .getByRole("group", { name: "Estat dels rebuts" })
      .getByRole("button", { name: `Impagats (${String(settled.counts.failed)})` }),
  ).toBeVisible();
  await page
    .getByRole("group", { name: "Estat dels rebuts" })
    .getByRole("button", { exact: true, name: "Cobrats" })
    .click();
  await expect(
    receiptsTable.locator(`tbody tr[data-invoice-number="${submittedReceipt.displayNumber}"]`),
  ).toContainText("cobrat");
  await shot(page, "D6-targetes-core-1280.png");
  await noSecretsRendered(page);

  // The card member's own /rebuts reads the same receipt «cobrat» and no banner. Without a refused
  // receipt the banner cannot appear on this stack, so its action is proven at the api it calls:
  // `POST /me/card-setup` (the impersonation token is allowed) answers a checkout link.
  const payer = await impersonate(
    browser,
    admin,
    (await call<Invoice>(admin, `/invoices/${submittedReceipt.id}`)).body.memberId,
    fifoClubsUrl,
  );
  await navigateSpa(payer.page, "/rebuts");
  const payerRow = payer.page.locator(".receipt-row").filter({
    hasText: `Rebut ${submittedReceipt.displayNumber}`,
  });
  await expect(payerRow).toContainText("cobrat");
  await expect(payer.page.locator(".billing-card-banner")).toHaveCount(0);
  await noSecretsRendered(payer.page);
  // successUrl/cancelUrl on the club's app host (the origin of the core's own launchUrl), as the
  // deployed app sends its address; the local dev server's 127.0.0.1 is not that host.
  const cardSetup = await call<CardSetupLink>(payer, "/me/card-setup", "POST", {
    cancelUrl: `${payer.appOrigin ?? ""}/rebuts`,
    successUrl: `${payer.appOrigin ?? ""}/rebuts`,
  });
  expect(cardSetup.status, JSON.stringify(cardSetup.body)).toBe(201);
  expect(cardSetup.body.checkoutUrl).toMatch(/^https?:\/\//u);
  const cardSetupHost = new URL(cardSetup.body.checkoutUrl).host;
  await payer.context.close();
  record.card = {
    banner,
    cardSetup: { host: cardSetupHost, status: cardSetup.status },
    failedChip: settled.counts.failed,
    paidChip: settled.counts.paid,
    settledWithoutReload: true,
    skipped: charged.skipped.length,
    submitted: charged.submitted,
  };
  await admin.context.close();
});
