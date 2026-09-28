import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import type { Browser, BrowserContext, Locator, Page, Response } from "@playwright/test";

import { expect, test } from "./oauth-token-log";

// E5-W04 · T-08-40 and T-09-40 end to end against the published core with the E5 demo seed (api
// E5-T06, `scenario:` of the image's `seeds/demo-canic.yaml`). The seed anchors week 0 on
// `E5_WEEK_START` (the club-local Monday after the run's day, `scripts/e2e-core.sh`) and is
// consistent at its `demoNow` (Monday 07:00 club-local), where the first test sets the core's test
// clock (`POST /test/clock`) once it has switched the scheduler's processes off; moving the clock
// expires the sessions issued before, so every session is opened after each move.
// Accounts are the seed's login members by census ordinal (5 = `member@` … 14 = `member.10@`,
// `demo-canic.yaml`); rows are chosen by state, time and data attributes, and the rows' dogs by what
// the api answers — never by the mockups' names. The browsers keep their own clock (never faked).

const clubsUrl = "http://127.0.0.1:4173";
const adminUrl = "http://127.0.0.1:4174";
const coreUrl = requiredEnvironment("CORE_URL");
const corePassword = requiredEnvironment("E1_CORE_PASSWORD");
const weekStart = process.env.E5_WEEK_START ?? requiredEnvironment("E4_WEEK_START");
const evidenceDirectory =
  process.env.CORE_EVIDENCE_DIRECTORY ?? resolve(process.cwd(), "roadmap/evidence/E5-W04");
const clubTimeZone = "Europe/Madrid";
const runId = Date.now().toString(36).slice(-6);
const desktop = { height: 900, width: 1280 };
const mobile = { height: 844, width: 375 };
// The scenario's roles (`demo-canic.yaml` `scenario:`, member ordinals 5–12).
/** Ordinal 5: 03's CLASS, TRAINING ×2, CLASS_WAITLIST and ACTIVITY rows; 2/3 trainings. */
const BOOKER = "member@example.test";
/** Ordinal 6: the week's limit reached with the swappable Wednesday 08:30 (06). */
const SWAPPER = "member.2@example.test";
/** Ordinal 7: the limit reached with nothing swappable (29) and Monday 08:30 inside the 4 h. */
const LIMITED = "member.3@example.test";
/** Ordinal 8: a dog with the Thursday 17:40 WAITLIST_OPEN row. */
const WAITER = "member.4@example.test";
/** Ordinal 9: booked in that Thursday 17:40 class (the seat to free). */
const SEAT_HOLDER = "member.5@example.test";
/** Ordinal 12: no booking of its own, WAITLIST_OPEN rows (the `es` pass). */
const ES_MEMBER = "member.8@example.test";
const INSTRUCTOR = "instructor@example.test";

const caWeekdays = [
  "dilluns",
  "dimarts",
  "dimecres",
  "dijous",
  "divendres",
  "dissabte",
  "diumenge",
] as const;
const caShortDays = ["dl", "dt", "dc", "dj", "dv", "ds", "dg"] as const;

type Locale = "ca" | "es";

const text = {
  ca: {
    calendar: /^Google$/u,
    cancel: "ANUL·LA LA RESERVA",
    cancelConfirm: "ANUL·LA",
    claim: "AGAFA LA PLAÇA",
    classes: "Classes",
    confirmTitle: "Confirmar reserva",
    done: "Reserva confirmada. Afegeix-la al calendari:",
    email: "Correu electrònic",
    hold: /^Plaça bloquejada per a tu · 0:(?:30|[0-2]\d)$/u,
    inTime:
      "Anul·lació feta dins el termini establert: pots reservar una altra classe per aquesta setmana.",
    join: "APUNTA'M",
    // A substring: the same text as a regex name (with its apostrophe) failed to parse as a role
    // selector in Playwright 1.63 (`InvalidSelectorError`).
    joinDialog: "Vols apuntar-te a la llista d'espera de ",
    joined: "Ets a la llista d'espera",
    password: "Contrasenya",
    submit: "CONFIRMAR LA RESERVA",
  },
  es: {
    calendar: /^Google$/u,
    cancel: "ANULA LA RESERVA",
    cancelConfirm: "ANULA",
    claim: "COGE LA PLAZA",
    classes: "Clases",
    confirmTitle: "Confirmar reserva",
    done: "Reserva confirmada. Añádela al calendario:",
    email: "Correo electrónico",
    hold: /^Plaza bloqueada para ti · 0:(?:30|[0-2]\d)$/u,
    inTime:
      "Anulación hecha dentro del plazo establecido: puedes reservar otra clase para esta semana.",
    join: "APÚNTAME",
    joinDialog: "¿Quieres apuntarte a la lista de espera de ",
    joined: "Estás en la lista de espera",
    password: "Contraseña",
    submit: "CONFIRMAR LA RESERVA",
  },
} as const;

interface Session {
  bearer: () => string | undefined;
  context: BrowserContext;
  page: Page;
}

interface CoreAnswer<Body> {
  body: Body;
  status: number;
}

interface ApiProblem {
  code?: string;
  details?: Record<string, unknown>;
}

interface Dog {
  id: string;
  name: string;
}

interface ReservationRow {
  dogName?: string | null;
  id: string;
  startsAtLocal: string;
  state: string;
  title: string;
  type: string;
}

interface MeHome {
  dogs: Dog[];
  limits: { currentWeek: { count: number }; nextWeek: { count: number } };
  reservations: ReservationRow[];
}

interface BookableRow {
  description: string;
  id: string;
  opensAt?: string | null;
  startsAtLocal: string;
  state: string;
}

interface BookableClasses {
  classes: BookableRow[];
  dog: Dog;
  dogs: Dog[];
}

interface SeatHold {
  expiresAt: string;
  id: string;
  limit: {
    notSelectable: { bookingId: string }[];
    reached: boolean;
    swappable: { bookingId: string; startsAtLocal: string }[];
  };
  serverNow: string;
}

interface Booking {
  cancellation?: { late?: boolean } | null;
  id: string;
  state: string;
}

interface WaitlistEntry {
  id: string;
  position?: number | null;
  state: string;
}

interface TrainingSlot {
  anyFree: boolean;
  bookable: boolean;
  endsAtLocal: string;
  rings: Record<string, { reason?: string | null; state: string } | undefined>;
  startsAt: string;
  startsAtLocal: string;
}

interface TrainingSlots {
  days: { closed?: boolean; date: string; slots: TrainingSlot[] }[];
  rings: { id: string; name: string }[];
}

interface TrainingSummary {
  cancellableBookings: { id: string }[];
  counter: { limit: number; remaining: number; used: number };
  defaultDogId?: string | null;
  eligibleDogs: Dog[];
}

interface TrainingBookingItem {
  date: string;
  dogId: string;
  id: string;
  ringId: string;
  ringName: string;
  startsAt: string;
  startsAtLocal: string;
  state: string;
}

interface RiskReviewItem {
  classId: string;
  notified: { dogName: string; memberName: string }[];
  status: string;
}

interface JobEffectItem {
  action: string;
  entityId: string;
  entityType: string;
}

/** `JobRun` (S15 §3): what `POST /jobs/{name}/trigger` answers. */
interface JobRunAnswer {
  dryRun: boolean;
  effects: { counters: Record<string, number>; items: JobEffectItem[] };
  runId: string;
  status: string;
}

interface RunRecord {
  created: Record<string, string>;
  demoNow: string;
  runId: string;
  steps: Record<string, unknown>;
  weekStart: string;
}

mkdirSync(evidenceDirectory, { recursive: true });

function requiredEnvironment(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === "") {
    throw new Error(`${name} is required`);
  }
  return value;
}

/** Minutes east of UTC that `timeZone` uses at `instant`. */
function zoneOffsetMinutes(instant: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
    minute: "2-digit",
    month: "2-digit",
    second: "2-digit",
    timeZone,
    year: "numeric",
  }).formatToParts(new Date(instant));
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((item) => item.type === type)?.value ?? 0);
  const local = Date.UTC(
    part("year"),
    part("month") - 1,
    part("day"),
    part("hour"),
    part("minute"),
  );
  return Math.round((local - instant) / 60_000);
}

/**
 * The instant of a club-local date and time (Europe/Madrid). Across a DST change an ambiguous time
 * takes its first occurrence and a missing one moves forward by the gap.
 */
function clubInstant(date: string, time: string): string {
  const wall = Date.parse(`${date}T${time}:00Z`);
  const halfDay = 12 * 60 * 60_000;
  // The zone's offsets on each side of that day, the larger one first (= the earlier instant).
  const offsets = [
    ...new Set([wall - halfDay, wall + halfDay].map((at) => zoneOffsetMinutes(at, clubTimeZone))),
  ].sort((first, second) => second - first);
  const valid = offsets.find(
    (offset) => zoneOffsetMinutes(wall - offset * 60_000, clubTimeZone) === offset,
  );
  // No offset maps back to that wall time: it falls in the spring gap, read with the offset before it.
  const offset = valid ?? Math.min(...offsets);
  return new Date(wall - offset * 60_000).toISOString();
}

/** Plain-date arithmetic (UTC noon, never formatted in a zone). */
function addDays(date: string, days: number): string {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function weekdayIndex(date: string): number {
  return (new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7;
}

function dayOfMonth(date: string): string {
  return String(Number(date.slice(8, 10)));
}

/** «DIMECRES 30» (06's swap button, upper-cased; another month adds « D’OCTUBRE»). */
function upperDay(date: string): string {
  return `${(caWeekdays[weekdayIndex(date)] ?? "").toLocaleUpperCase("ca")} ${dayOfMonth(date)}`;
}

/** «dj 1» (D4's column header and class cells). */
function shortDay(date: string): string {
  return `${caShortDays[weekdayIndex(date)] ?? ""} ${dayOfMonth(date)}`;
}

/** «8:30» from «08:30». */
function shortTime(time: string): string {
  return time.replace(/^0(?=\d:)/u, "");
}

function addMinutes(time: string, minutes: number): string {
  const [hours = 0, mins = 0] = time.split(":").map(Number);
  const total = hours * 60 + mins + minutes;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

/** The scenario's `demoNow` (`demo-canic.yaml`): Monday 07:00 club-local of week 0. */
const demoNow = clubInstant(weekStart, "07:00");
const registryPath = join(evidenceDirectory, "e5-core-run.json");

function readRecord(): RunRecord {
  try {
    return JSON.parse(readFileSync(registryPath, "utf8")) as RunRecord;
  } catch {
    return { created: {}, demoNow, runId, steps: {}, weekStart };
  }
}

function writeRecord(record: RunRecord): void {
  writeFileSync(registryPath, `${JSON.stringify(record, null, 2)}\n`);
}

/** What a step proved (statuses, codes, counters), kept for the report. Never a token. */
function note(step: string, value: unknown): void {
  const record = readRecord();
  record.steps[step] = value;
  writeRecord(record);
}

/** An id the run created, cancelled at the end (h). */
function remember(key: string, id: string): void {
  const record = readRecord();
  record.created[key] = id;
  writeRecord(record);
}

function apiPath(response: Response): string {
  return new URL(response.url()).pathname;
}

function isCall(method: string, path: RegExp) {
  return (response: Response) =>
    response.request().method() === method && path.test(apiPath(response));
}

function isRefresh(response: Response): boolean {
  return (
    response.url().endsWith("/oauth2/token") &&
    response.request().method() === "POST" &&
    new URLSearchParams(response.request().postData() ?? "").get("grant_type") === "refresh_token"
  );
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

/** The bearer the page's own api calls carry (read from its requests, never printed). */
function bearerOf(page: Page): () => string | undefined {
  let bearer: string | undefined;
  page.on("request", (request) => {
    const header = request.headers().authorization;
    if (header?.startsWith("Bearer ") === true && request.url().includes("/api/v1/")) {
      bearer = header;
    }
  });
  return () => bearer;
}

async function newContext(
  browser: Browser,
  viewport: { height: number; width: number },
  locale: Locale = "ca",
): Promise<BrowserContext> {
  const context = await browser.newContext({ viewport });
  await context.addInitScript((value) => {
    localStorage.setItem("agilityhub.locale", value);
  }, locale);
  return context;
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

async function loginClubs(
  page: Page,
  email: string,
  landing: "/inici" | "/instructor/avui",
  locale: Locale,
): Promise<void> {
  await page.goto(`${clubsUrl}/entrar`);
  await page.getByLabel(text[locale].email).fill(email);
  await page.getByLabel(text[locale].password, { exact: true }).fill(corePassword);
  // The app refreshes once it lands; a navigation that aborted that call would leave the browser
  // with the rotated-away cookie (`REFRESH_REUSED`), so the login waits for it as E1–E4 do.
  const routeRefresh = page.waitForResponse(isRefresh);
  await submitPasswordLogin(page);
  await page.waitForURL(`**${landing}`);
  expect((await routeRefresh).status()).toBe(200);
  await expect(page.locator(".clubs-shell")).toBeVisible();
}

// One session per account for the whole run (the tests are serial): every login costs three
// `/oauth2/token` calls and the core allows 30 a minute per IP (S01 R-01-08).
const sessions = new Map<string, Session>();

async function clubsSession(
  browser: Browser,
  email: string,
  landing: "/inici" | "/instructor/avui" = "/inici",
  locale: Locale = "ca",
): Promise<Session> {
  const key = `${email}|${locale}`;
  const known = sessions.get(key);
  if (known !== undefined) {
    await navigateClubRoute(known.page, landing);
    return known;
  }
  const context = await newContext(browser, mobile, locale);
  const page = await context.newPage();
  const bearer = bearerOf(page);
  await loginClubs(page, email, landing, locale);
  await expect.poll(bearer).toBeDefined();
  const session = { bearer, context, page };
  sessions.set(key, session);
  return session;
}

async function adminSession(browser: Browser): Promise<Session> {
  const known = sessions.get("admin");
  if (known !== undefined) {
    await navigateSpa(known.page, "/tauler");
    return known;
  }
  const context = await newContext(browser, desktop);
  const page = await context.newPage();
  const bearer = bearerOf(page);
  await loginAdmin(page);
  await expect.poll(bearer).toBeDefined();
  const session = { bearer, context, page };
  sessions.set("admin", session);
  return session;
}

/** Moving the core's clock expires every session issued before: they are all closed first. */
async function closeSessions(): Promise<void> {
  for (const session of sessions.values()) await session.context.close();
  sessions.clear();
}

/**
 * A call to the core from the session's page with its bearer: what the api answers where the UI
 * does not ask (reads that pick the rows, cleanup). Writes carry their own `Idempotency-Key`.
 */
async function call<Body = ApiProblem>(
  session: Session | Page,
  path: string,
  method = "GET",
  body?: unknown,
): Promise<CoreAnswer<Body>> {
  const page = "page" in session ? session.page : session;
  const authorization = "page" in session ? session.bearer() : undefined;
  // `POST /test/clock` goes as the discovery runs sent it (answered 200): without the key.
  const idempotent = method !== "GET" && !path.startsWith("/test/");
  const answer = await page.evaluate(
    async ({ auth, callBody, callMethod, callUrl, withKey }) => {
      const headers: Record<string, string> = {};
      if (auth !== undefined) headers.Authorization = auth;
      if (callBody !== undefined) headers["Content-Type"] = "application/json";
      if (withKey) headers["Idempotency-Key"] = crypto.randomUUID();
      const response = await fetch(callUrl, {
        headers,
        method: callMethod,
        ...(callBody === undefined ? {} : { body: JSON.stringify(callBody) }),
      });
      const raw = await response.text();
      let parsed: unknown = raw;
      try {
        parsed = raw === "" ? null : JSON.parse(raw);
      } catch {
        // Not JSON: kept as text.
      }
      return { body: parsed, status: response.status };
    },
    {
      auth: authorization,
      callBody: body,
      callMethod: method,
      callUrl: `/api/v1${path}`,
      withKey: idempotent,
    },
  );
  return answer as CoreAnswer<Body>;
}

/**
 * A clubs route in place, as the app's own links do (`navigateInApp`): no reload, so no refresh
 * call — `/oauth2/token` allows 30 calls a minute per IP (S01 R-01-08) and the whole run shares
 * one. A page already on `path` is left first, so the route mounts and reads again.
 */
async function navigateClubRoute(page: Page, path: string): Promise<void> {
  const target = new URL(path, clubsUrl).pathname;
  if (new URL(page.url()).pathname === target) {
    await navigateSpa(page, target === "/inici" ? "/reservar" : "/inici");
  }
  await navigateSpa(page, path);
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
  const query = path.includes("?") ? "" : "(\\?.*)?";
  await expect(page).toHaveURL(new RegExp(`${escapeRegExp(path)}${query}$`, "u"));
}

// Icons are `<use>` references to the external sprite: a capture waits until each has a box.
async function shot(page: Page, name: string, fullPage = true): Promise<void> {
  await expect
    .poll(() =>
      page
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
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
  await page.screenshot({ fullPage, path: join(evidenceDirectory, name) });
}

async function shotOf(scope: Locator, page: Page, name: string): Promise<void> {
  await scope.scrollIntoViewIfNeeded();
  await expect
    .poll(() =>
      scope
        .locator("svg.ah-icon")
        .evaluateAll((icons) =>
          icons.every((icon) => icon instanceof SVGSVGElement && icon.getBBox().width > 0),
        ),
    )
    .toBe(true);
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
  await scope.screenshot({ path: join(evidenceDirectory, name) });
}

/**
 * `POST /test/clock {instant}` (api E5-T06, `test`/`local` profiles only). Moving the core's clock
 * expires the sessions issued before, so it runs before any login of the step: anonymously when
 * the core allows it, else with a throwaway admin session.
 */
async function setCoreClock(browser: Browser, instant: string): Promise<CoreAnswer<unknown>> {
  const context = await newContext(browser, desktop);
  const page = await context.newPage();
  await page.goto(`${adminUrl}/entrar`);
  let answer = await call<unknown>(page, "/test/clock", "POST", { instant });
  note(`clock-anonymous-${instant}`, answer);
  if (answer.status === 401 || answer.status === 403) {
    const bearer = bearerOf(page);
    await loginAdmin(page);
    await expect.poll(bearer).toBeDefined();
    answer = await call<unknown>({ bearer, context, page }, "/test/clock", "POST", { instant });
  }
  await context.close();
  return answer;
}

async function meHome(session: Session): Promise<MeHome> {
  const answer = await call<MeHome>(session, "/me/home");
  expect(answer.status).toBe(200);
  return answer.body;
}

async function bookableOf(session: Session, dogId: string): Promise<BookableClasses> {
  const answer = await call<BookableClasses>(
    session,
    `/me/bookable-classes?dogId=${encodeURIComponent(dogId)}`,
  );
  expect(answer.status).toBe(200);
  return answer.body;
}

/** The first of the member's dogs whose 04 has a row in `state` (read-only api reads). */
async function dogWithState(
  session: Session,
  state: string,
): Promise<{ dog: Dog; row: BookableRow; rows: BookableRow[] }> {
  const home = await meHome(session);
  for (const dog of home.dogs) {
    const rows = (await bookableOf(session, dog.id)).classes;
    const row = rows.find((item) => item.state === state);
    if (row !== undefined) return { dog, row, rows };
  }
  throw new Error(`No dog of the account has a ${state} row`);
}

/** 04 by address: the page's own `GET /me/bookable-classes` answer. */
async function open04(session: Session, locale: Locale = "ca"): Promise<BookableClasses> {
  const read = session.page.waitForResponse(isCall("GET", /\/api\/v1\/me\/bookable-classes$/u));
  await navigateClubRoute(session.page, "/reservar");
  const response = await read;
  expect(response.status()).toBe(200);
  await expect(
    session.page.getByRole("heading", { exact: true, name: text[locale].classes }),
  ).toBeVisible();
  return (await response.json()) as BookableClasses;
}

/** Selects a dog chip of 04 by the api's dog name and waits for its rows. */
async function chooseDog(page: Page, name: string): Promise<void> {
  const chip = page.getByRole("button", {
    name: new RegExp(`^${escapeRegExp(name)}(?: ·| \\(|$)`, "u"),
  });
  await expect(chip).toBeVisible();
  if ((await chip.getAttribute("aria-pressed")) === "true") return;
  const read = page.waitForResponse(isCall("GET", /\/api\/v1\/me\/bookable-classes$/u));
  await chip.click();
  expect((await read).status()).toBe(200);
  await expect(chip).toHaveAttribute("aria-pressed", "true");
}

function classRow(page: Page, classId: string): Locator {
  return page.locator(`.class-row[data-class-id="${classId}"]`);
}

async function rowStates(page: Page): Promise<string[]> {
  return page
    .locator(".class-row")
    .evaluateAll((rows) => rows.map((row) => row.getAttribute("data-bookable-state") ?? ""));
}

/**
 * Taps a BOOKABLE row, checks the 30 s hold on the api clock and confirms inside it (R-08-07).
 * Returns the booking, the hold and how long the seat was held before the confirmation left.
 */
async function bookInsideHold(
  page: Page,
  classId: string,
  locale: Locale,
): Promise<{ booking: Booking; heldMs: number; hold: SeatHold }> {
  const holding = page.waitForResponse(isCall("POST", /\/api\/v1\/seat-holds$/u));
  await classRow(page, classId).getByRole("button").click();
  const holdResponse = await holding;
  const heldAt = Date.now();
  expect(holdResponse.status()).toBe(201);
  const hold = (await holdResponse.json()) as SeatHold;
  const ttl = Date.parse(hold.expiresAt) - Date.parse(hold.serverNow);
  expect(ttl).toBeGreaterThan(29_000);
  expect(ttl).toBeLessThanOrEqual(30_500);
  await expect(page.getByRole("heading", { name: text[locale].confirmTitle })).toBeVisible();
  await expect(page.getByText(text[locale].hold)).toBeVisible();
  const booking = page.waitForResponse(isCall("POST", /\/api\/v1\/bookings$/u));
  await page.getByRole("button", { name: text[locale].submit }).click();
  const bookingResponse = await booking;
  const heldMs = Date.now() - heldAt;
  expect(bookingResponse.status()).toBe(201);
  expect(heldMs).toBeLessThan(30_000);
  await expect(page.getByText(text[locale].done)).toBeVisible();
  await expect(page.getByRole("link", { name: text[locale].calendar })).toBeVisible();
  await expect(page.getByRole("link", { name: "Outlook" })).toBeVisible();
  await expect(page.getByRole("link", { name: ".ics" })).toBeVisible();
  return { booking: (await bookingResponse.json()) as Booking, heldMs, hold };
}

/** 07 by address: [ANUL·LA LA RESERVA] → [ANUL·LA]; the api's answer. */
async function cancelFrom07(page: Page, bookingId: string, locale: Locale = "ca") {
  await navigateClubRoute(page, `/reserves/${bookingId}`);
  await page.getByRole("button", { name: text[locale].cancel }).click();
  const dialog = page.getByRole("dialog");
  const cancellation = page.waitForResponse(
    isCall("POST", new RegExp(`/api/v1/bookings/${bookingId}/cancellation$`, "u")),
  );
  await dialog.getByRole("button", { exact: true, name: text[locale].cancelConfirm }).click();
  const response = await cancellation;
  expect(response.status()).toBe(200);
  return (await response.json()) as Booking;
}

async function entryState(session: Session, entryId: string): Promise<string> {
  const answer = await call<WaitlistEntry>(session, `/waitlist-entries/${entryId}`);
  return answer.status === 200 ? answer.body.state : `HTTP ${String(answer.status)}`;
}

/** The processes the first test switched off (`e5-core-run.json`), for `afterAll`. */
const JOBS_SWITCHED_OFF = "jobs-switched-off";

/** `PUT /jobs/{name}/switch {enabled}` for each process: the api's answers, by name. */
async function switchJobs(
  admin: Session,
  names: readonly string[],
  enabled: boolean,
): Promise<Record<string, { enabled: boolean | null; status: number }>> {
  const answers: Record<string, { enabled: boolean | null; status: number }> = {};
  for (const name of names) {
    const answer = await call<{ enabled?: boolean }>(admin, `/jobs/${name}/switch`, "PUT", {
      enabled,
    });
    answers[name] = { enabled: answer.body.enabled ?? null, status: answer.status };
  }
  return answers;
}

test.describe.configure({ mode: "serial" });

// Review #10 and #7: the processes go back on and the core's clock back to the real instant, even
// when a test failed (the stack is removed after the run anyway, but a failure must not hide either).
test.afterAll(async ({ browser }) => {
  await closeSessions();
  const switchedOff = (readRecord().steps[JOBS_SWITCHED_OFF] as string[] | undefined) ?? [];
  let switchedOn: Record<string, { enabled: boolean | null; status: number }> = {};
  if (switchedOff.length > 0) {
    switchedOn = await switchJobs(await adminSession(browser), switchedOff, true);
    note("jobs-switched-on", switchedOn);
    await closeSessions();
  }
  const restored = await setCoreClock(browser, new Date().toISOString());
  note("clock-restored", restored);
  expect(restored.status).toBe(200);
  for (const answer of Object.values(switchedOn)) {
    expect(answer).toEqual({ enabled: true, status: 200 });
  }
});

test("E5-W04 step 2 · the automatic processes off, POST /test/clock to demoNow, and the parameters the flows read", async ({
  browser,
}) => {
  test.setTimeout(300_000);
  writeRecord({ created: {}, demoNow, runId, steps: {}, weekStart });
  // Review #10: the scheduler's own runs (catch-ups after each clock move) raced with the scenario,
  // so its processes are switched off first, at the real instant and before any clock move; the
  // manual [Executa ara] still runs them (S15 R-15-09). `afterAll` switches them back on.
  const before = await adminSession(browser);
  const listed = await call<{ items: { enabled: boolean; name: string }[] }>(before, "/jobs");
  expect(listed.status).toBe(200);
  const enabledJobs = listed.body.items.filter((job) => job.enabled).map((job) => job.name);
  note(JOBS_SWITCHED_OFF, enabledJobs);
  const switchedOff = await switchJobs(before, enabledJobs, false);
  note("jobs-switch-off-answers", switchedOff);
  for (const answer of Object.values(switchedOff)) {
    expect(answer).toEqual({ enabled: false, status: 200 });
  }
  await closeSessions();
  // The scenario is consistent at `demoNow`: the core's test clock goes there before any other login.
  // (The per-account views of the seed were recorded once in `e5-seed-discovery.json`; the flows
  // below read theirs.) There is no fallback without `POST /test/clock`: every test needs `demoNow`.
  const clock = await setCoreClock(browser, demoNow);
  note("clock", { answer: clock, coreUrl, demoNow });
  expect(clock.status).toBe(200);
  const admin = await adminSession(browser);
  const parameters: Record<string, unknown> = {};
  for (const key of [
    "bookings.lateCancelThresholdMinutes",
    "bookings.weekOpensAt",
    "waitlist.mode",
    "waitlist.notifyThresholdMinutes",
    "training.maxPerWeek",
    "training.bookingWindowDays",
    "classes.riskReviewTime",
  ]) {
    const answer = await call<{ value?: unknown } | null>(admin, `/parameters/${key}`);
    expect(answer.status).toBe(200);
    parameters[key] = answer.body?.value;
  }
  note("parameters", parameters);
  // The flows below assume the Cànic's values (R-08-10, R-08-11, R-08-13, R-09-04, R-09-05).
  expect(parameters).toMatchObject({
    "bookings.lateCancelThresholdMinutes": 240,
    "training.bookingWindowDays": 3,
    "training.maxPerWeek": 3,
    "waitlist.mode": "ALL_AT_ONCE",
    "waitlist.notifyThresholdMinutes": 30,
  });
  const jobs = await call<{ items: { enabled: boolean; name: string }[] }>(admin, "/jobs");
  note(
    "jobs",
    jobs.body.items.map((job) => ({ enabled: job.enabled, name: job.name })),
  );
  // Still off after the clock move (the switch is a club parameter, not a session's).
  expect(jobs.body.items.filter((job) => job.enabled).map((job) => job.name)).toEqual([]);
});

test("T-08-40 (a)(b) · 03 and 04 from the seed, a booking inside the 30 s hold, an in-time and a late cancellation", async ({
  browser,
}) => {
  test.setTimeout(300_000);
  const member = await clubsSession(browser, BOOKER);
  const { page } = member;

  // 03 from the page's own answer: the seeded rows and the counters.
  const homeRead = page.waitForResponse(isCall("GET", /\/api\/v1\/me\/home$/u));
  await navigateClubRoute(page, "/inici");
  const home = (await (await homeRead).json()) as MeHome;
  await expect(page.getByRole("heading", { level: 1, name: /^Hola, .+!$/u })).toBeVisible();
  const links = { CLASS: "/reserves/", CLASS_WAITLIST: "/espera/", TRAINING: "/entrenaments/" };
  const types = home.reservations.map((row) => row.type);
  expect(types).toEqual(
    expect.arrayContaining(["CLASS", "TRAINING", "CLASS_WAITLIST", "ACTIVITY"]),
  );
  for (const row of home.reservations) {
    const prefix = links[row.type as keyof typeof links] as string | undefined;
    if (prefix !== undefined) {
      await expect(page.locator(`a[href="${prefix}${row.id}"]`)).toBeVisible();
    }
  }
  const counters = page.getByRole("group", { name: "Classes reservades" });
  await expect(counters.locator(".home-limits__count--current")).toHaveText(
    String(home.limits.currentWeek.count),
  );
  await shot(page, "03-inici-core-375.png");

  // 04: the default dog's rows are the api's, state by state (`data-bookable-state`).
  const bookable = await open04(member);
  expect(await rowStates(page)).toEqual(bookable.classes.map((row) => row.state));
  const defaultStates = new Set(bookable.classes.map((row) => row.state));
  for (const state of ["BOOKABLE", "WAITLIST_FULL", "NOT_YET_OPEN"]) {
    expect(defaultStates.has(state)).toBe(true);
  }
  await expect(
    page.locator('.class-row[data-bookable-state="NOT_YET_OPEN"]').first(),
  ).toContainText("Properament");
  await shot(page, "04-reservar-core-375.png");
  // WAITLIST_OPEN lives on another dog of the account (the seed's Thursday 17:40 class).
  const waitlistDog = await dogWithState(member, "WAITLIST_OPEN");
  await chooseDog(page, waitlistDog.dog.name);
  await expect(classRow(page, waitlistDog.row.id)).toHaveAttribute(
    "data-bookable-state",
    "WAITLIST_OPEN",
  );
  await chooseDog(page, bookable.dog.name);

  // (a) A BOOKABLE row from Thursday on (more than 4 h ahead of demoNow), confirmed in the hold.
  const target = bookable.classes.find(
    (row) =>
      row.state === "BOOKABLE" &&
      row.startsAtLocal.slice(0, 10) >= addDays(weekStart, 3) &&
      row.startsAtLocal.slice(0, 10) < addDays(weekStart, 7),
  );
  if (target === undefined) throw new Error("The seed has no BOOKABLE row from Thursday on");
  const { booking, heldMs, hold } = await bookInsideHold(page, target.id, "ca");
  remember("bookerBooking", booking.id);
  await navigateClubRoute(page, "/inici");
  await expect(page.locator(`a[href="/reserves/${booking.id}"]`)).toBeVisible();

  // (b) In time: the green note, then the row is gone from 03. Review #2: 03 shows a skeleton until
  // its own `GET /me/home` answers, so the check reads that answer and waits for a rendered row
  // before it counts the cancelled one.
  const inTime = await cancelFrom07(page, booking.id);
  expect(inTime.state).toBe("CANCELLED");
  await expect(page.getByText(text.ca.inTime)).toBeVisible();
  const homeAfterRead = page.waitForResponse(isCall("GET", /\/api\/v1\/me\/home$/u));
  await navigateClubRoute(page, "/inici");
  const homeAfterResponse = await homeAfterRead;
  expect(homeAfterResponse.status()).toBe(200);
  const homeAfter = (await homeAfterResponse.json()) as MeHome;
  expect(homeAfter.reservations.map((row) => row.id)).not.toContain(booking.id);
  const stillListed = homeAfter.reservations.find((row) => row.type in links);
  if (stillListed === undefined) throw new Error("03 lists no other row after the cancellation");
  await expect(
    page.locator(`a[href="${links[stillListed.type as keyof typeof links]}${stillListed.id}"]`),
  ).toBeVisible();
  await expect(page.locator(`a[href="/reserves/${booking.id}"]`)).toHaveCount(0);
  note("a-b-booker", {
    booked: {
      classStartsAtLocal: target.startsAtLocal,
      heldMs,
      holdTtlMs: Date.parse(hold.expiresAt) - Date.parse(hold.serverNow),
      status: 201,
    },
    cancelledInTime: { late: inTime.cancellation?.late ?? null, state: inTime.state },
    home: { counters: home.limits, types },
    rowStates: [...defaultStates],
  });

  // (b) Late: the seeded Monday 08:30 booking of ordinal 7, 1 h 30 before the class.
  const limited = await clubsSession(browser, LIMITED);
  const limitedHome = await meHome(limited);
  const monday = limitedHome.reservations.find(
    (row) => row.type === "CLASS" && row.startsAtLocal === `${weekStart}T08:30`,
  );
  if (monday === undefined) throw new Error("The seed's Monday 08:30 booking is missing");
  await navigateClubRoute(limited.page, `/reserves/${monday.id}`);
  // `BookedBy.self`: the reader booked it (api E5-T25), so no name.
  await expect(limited.page.getByText(/^Reservada el /u)).toBeVisible();
  const late = await cancelFrom07(limited.page, monday.id);
  expect(late.state).toBe("CANCELLED_LATE");
  await expect(
    limited.page.getByText(/^Anul·lació feta amb menys de 4 hores d'antelació\./u),
  ).toBeVisible();
  await expect(limited.page.getByText("anul·lada tard", { exact: true })).toBeVisible();
  await shot(limited.page, "07-anullada-tard-core-375.png");
  note("b-late", { late: late.cancellation?.late ?? null, state: late.state });
});

test("T-08-40 (c) · 06 swaps the week's booking in one step; without a swappable one, 29", async ({
  browser,
}) => {
  test.setTimeout(300_000);
  const swapper = await clubsSession(browser, SWAPPER);
  const { page } = swapper;
  const home = await meHome(swapper);
  // The swappable booking: this week's ACTIVE class more than 4 h ahead (Wednesday 08:30).
  const old = home.reservations.find(
    (row) =>
      row.type === "CLASS" &&
      row.startsAtLocal.slice(0, 10) > addDays(weekStart, 1) &&
      row.startsAtLocal.slice(0, 10) < addDays(weekStart, 7),
  );
  if (old === undefined) throw new Error("The seed's swappable booking is missing");
  const dog = home.dogs.find((item) => item.name === old.dogName);
  if (dog === undefined) throw new Error("The swappable booking's dog is not the account's");
  const rows = (await bookableOf(swapper, dog.id)).classes;
  const target = rows
    .filter(
      (row) =>
        row.state === "BOOKABLE" &&
        row.startsAtLocal.slice(0, 10) > old.startsAtLocal.slice(0, 10) &&
        row.startsAtLocal.slice(0, 10) < addDays(weekStart, 7),
    )
    .at(-1);
  if (target === undefined) throw new Error("No BOOKABLE row after the swappable booking");
  await open04(swapper);
  await chooseDog(page, dog.name);
  const holding = page.waitForResponse(isCall("POST", /\/api\/v1\/seat-holds$/u));
  await classRow(page, target.id).getByRole("button").click();
  const holdResponse = await holding;
  expect(holdResponse.status()).toBe(201);
  const hold = (await holdResponse.json()) as SeatHold;
  expect(hold.limit.reached).toBe(true);
  expect(hold.limit.swappable.map((option) => option.bookingId)).toContain(old.id);
  await expect(
    page.getByText(/^Ja tens \d+ classes aquesta setmana amb .+ \(límit per gos\)\.$/u),
  ).toBeVisible();
  await expect(page.getByText("Tria quina anul·les per fer-li lloc")).toBeVisible();
  const radios = page.getByRole("radio");
  await expect(radios).toHaveCount(hold.limit.swappable.length);
  // Review #2: the seed gives this member an inert card (its Monday 08:30 cancelled late: `DONE`,
  // R-08-09), so the count below cannot pass on an empty list.
  expect(hold.limit.notSelectable.length).toBeGreaterThan(0);
  await expect(page.locator(".confirm-option--inert")).toHaveCount(hold.limit.notSelectable.length);
  // Review #11: the swap card is chosen by tapping its radio (the first one is preselected).
  const oldRadio = radios.nth(
    hold.limit.swappable.findIndex((option) => option.bookingId === old.id),
  );
  await oldRadio.click();
  await expect(oldRadio).toHaveAttribute("aria-checked", "true");
  const oldDay = old.startsAtLocal.slice(0, 10);
  const newDay = target.startsAtLocal.slice(0, 10);
  const swapButton = page.getByRole("button", {
    name: new RegExp(
      `^ANUL·LA ${escapeRegExp(upperDay(oldDay))}(?: D.+)? I CONFIRMA ${escapeRegExp(upperDay(newDay))}(?: D.+)?$`,
      "u",
    ),
  });
  await expect(swapButton).toBeVisible();
  await shot(page, "06-confirmar-canvi-core-375.png");
  const posted = page.waitForResponse(isCall("POST", /\/api\/v1\/bookings$/u));
  await swapButton.click();
  const swapResponse = await posted;
  expect(swapResponse.status()).toBe(201);
  expect(swapResponse.request().postDataJSON()).toEqual({
    seatHoldId: hold.id,
    swapBookingId: old.id,
  });
  const swapped = (await swapResponse.json()) as Booking;
  remember("swapBooking", swapped.id);
  await expect(page.getByText(text.ca.done)).toBeVisible();
  await navigateClubRoute(page, "/inici");
  await expect(page.locator(`a[href="/reserves/${swapped.id}"]`)).toBeVisible();
  await expect(page.locator(`a[href="/reserves/${old.id}"]`)).toHaveCount(0);
  note("c-swap", {
    newClass: target.startsAtLocal,
    notSelectable: hold.limit.notSelectable.length,
    // R-08-09: `DONE` for a past or CANCELLED_LATE booking, `LATE_WINDOW` inside the threshold.
    notSelectableItems: await Promise.all(
      hold.limit.notSelectable.map(async (item) => ({
        ...item,
        bookingState: (await call<Booking>(swapper, `/bookings/${item.bookingId}`)).body.state,
      })),
    ),
    oldClass: old.startsAtLocal,
    status: swapResponse.status(),
    swappable: hold.limit.swappable.length,
  });

  // 29: the limit reached with nothing to swap (ordinal 7): the api's `details.week` decides.
  const limited = await clubsSession(browser, LIMITED);
  const done = await dogWithState(limited, "WEEKLY_LIMIT_DONE");
  await open04(limited);
  await chooseDog(limited.page, done.dog.name);
  const refused = limited.page.waitForResponse(isCall("POST", /\/api\/v1\/seat-holds$/u));
  await classRow(limited.page, done.row.id).getByRole("button").click();
  const refusal = await refused;
  expect(refusal.status()).toBe(409);
  const problem = (await refusal.json()) as ApiProblem;
  expect(problem.code).toBe("BOOKING_LIMIT_REACHED");
  const week = problem.details?.week;
  const second =
    week === "NEXT"
      ? "Podràs reservar aquesta classe a partir de "
      : "Podràs reservar per a la setmana vinent a partir de ";
  await expect(
    limited.page.getByText(
      new RegExp(
        `^${week === "NEXT" ? "La setmana vinent ja tens" : "Aquesta setmana ja has fet"} .+ amb .+\\. ${escapeRegExp(second)}.+\\.$`,
        "u",
      ),
    ),
  ).toBeVisible();
  await shot(limited.page, "29-limit-core-375.png");
  note("c-29", { code: problem.code, details: problem.details, status: refusal.status() });
});

test("T-08-40 (d) · ALL_AT_ONCE: join a full class, a seat released more than 30 min ahead, NOTIFIED, claim", async ({
  browser,
}) => {
  test.setTimeout(420_000);
  const waiter = await clubsSession(browser, WAITER);
  const open = await dogWithState(waiter, "WAITLIST_OPEN");
  const full = open.row;
  await open04(waiter);
  await chooseDog(waiter.page, open.dog.name);
  await classRow(waiter.page, full.id).getByRole("button").click();
  const dialog = waiter.page.getByRole("dialog", { name: text.ca.joinDialog });
  const joining = waiter.page.waitForResponse(isCall("POST", /\/api\/v1\/waitlist-entries$/u));
  await dialog.getByRole("button", { name: text.ca.join }).click();
  const joined = await joining;
  expect(joined.status()).toBe(201);
  const entry = (await joined.json()) as WaitlistEntry;
  remember("waiterEntry", entry.id);
  await expect(waiter.page.getByText(text.ca.joined)).toBeVisible();
  await expect(classRow(waiter.page, full.id)).toHaveCount(0);
  await navigateClubRoute(waiter.page, "/inici");
  await expect(waiter.page.locator(`a[href="/espera/${entry.id}"]`)).toContainText(
    "en llista d'espera",
  );
  const entryRead = waiter.page.waitForResponse(
    isCall("GET", new RegExp(`/api/v1/waitlist-entries/${entry.id}$`, "u")),
  );
  await navigateClubRoute(waiter.page, `/espera/${entry.id}`);
  const shown = (await (await entryRead).json()) as WaitlistEntry;
  note("d-entry", shown);
  await expect(waiter.page.locator(".detail-card")).toContainText(open.dog.name);
  await expect(waiter.page.locator(".detail-card")).toContainText("en llista d'espera");
  if (shown.position !== null && shown.position !== undefined) {
    await expect(
      waiter.page.getByText(`Ets el número ${String(shown.position)} de la llista`),
    ).toBeVisible();
  }

  // The class's registrants in D4 (E5-W03), with the member who holds the seat and the waiting dogs.
  const holder = await clubsSession(browser, SEAT_HOLDER);
  const holderHome = await meHome(holder);
  const seat = holderHome.reservations.find(
    (row) => row.type === "CLASS" && row.startsAtLocal === full.startsAtLocal,
  );
  if (seat === undefined) throw new Error("The seed's seat holder is not booked in that class");
  const admin = await adminSession(browser);
  await navigateSpa(admin.page, `/calendari?estat=actives&setmana=${weekStart}`);
  const grid = admin.page.getByRole("table", { name: /^Calendari de classes · del /u });
  await expect(grid).toBeVisible();
  const date = full.startsAtLocal.slice(0, 10);
  await grid
    .getByRole("button", {
      name: new RegExp(
        `^${escapeRegExp(shortDay(date))} ${escapeRegExp(shortTime(full.startsAtLocal.slice(11, 16)))} · ${escapeRegExp(full.description)}`,
        "u",
      ),
    })
    .first()
    .click();
  const card = admin.page.getByRole("region", { name: /^Classe seleccionada/u });
  const panel = card.getByRole("region", { name: /^Inscrits \(/u });
  // Review #2: an empty name would make the check below pass on any panel.
  const seatDog = seat.dogName ?? "";
  expect(seatDog).not.toBe("");
  await expect(panel).toContainText(seatDog);
  await expect(panel.getByText(/^En espera: /u)).toContainText(open.dog.name);
  await shotOf(card, admin.page, "D4-inscrits-core-1280.png");

  // ALL_AT_ONCE (R-08-13): the booker's seeded entry of the same class is notified too.
  const booker = await clubsSession(browser, BOOKER);
  const bookerEntry = (await meHome(booker)).reservations.find(
    (row) => row.type === "CLASS_WAITLIST" && row.startsAtLocal === full.startsAtLocal,
  );

  // The seat holder cancels in time (days ahead: more than the 30 min of R-08-11).
  const released = await cancelFrom07(holder.page, seat.id);
  expect(released.state).toBe("CANCELLED");
  await expect(holder.page.getByText(text.ca.inTime)).toBeVisible();
  await expect.poll(() => entryState(waiter, entry.id), { timeout: 30_000 }).toBe("NOTIFIED");
  const bookerEntryState =
    bookerEntry === undefined ? "none" : await entryState(booker, bookerEntry.id);
  expect(bookerEntryState).toBe("NOTIFIED");

  // N-15 is E7's feed (screen 11): the entry's own page shows the NOTIFIED state and the claim;
  // the deadline line only when the api sends `confirmBy`.
  const notifiedRead = waiter.page.waitForResponse(
    isCall("GET", new RegExp(`/api/v1/waitlist-entries/${entry.id}$`, "u")),
  );
  await navigateClubRoute(waiter.page, `/espera/${entry.id}`);
  const notified = (await (await notifiedRead).json()) as WaitlistEntry & {
    confirmBy?: string | null;
    notifiedAt?: string | null;
  };
  expect(notified.state).toBe("NOTIFIED");
  if (notified.confirmBy !== null && notified.confirmBy !== undefined) {
    await expect(
      waiter.page.getByText(/^Tens temps fins a les \d+:\d{2} per agafar la plaça\.$/u),
    ).toBeVisible();
  }
  const claim = waiter.page.getByRole("button", { name: text.ca.claim });
  await expect(claim).toBeVisible();
  await shot(waiter.page, "07-espera-notificada-core-375.png");
  const holding = waiter.page.waitForResponse(isCall("POST", /\/api\/v1\/seat-holds$/u));
  await claim.click();
  expect((await holding).status()).toBe(201);
  await expect(waiter.page.getByText(text.ca.hold)).toBeVisible();
  const claiming = waiter.page.waitForResponse(
    isCall("POST", new RegExp(`/api/v1/waitlist-entries/${entry.id}/claim$`, "u")),
  );
  await waiter.page.getByRole("button", { name: text.ca.submit }).click();
  const claimed = await claiming;
  expect(claimed.status()).toBe(201);
  const claimedBooking = (await claimed.json()) as Booking;
  remember("waiterClaim", claimedBooking.id);
  await expect(waiter.page.getByText(text.ca.done)).toBeVisible();
  // R-08-15: the claim books the seat and consolidates the entry (gate line 2).
  expect(claimedBooking.state).toBe("ACTIVE");
  const consolidated = await entryState(waiter, entry.id);
  expect(consolidated).toBe("CONSOLIDATED");
  await navigateClubRoute(waiter.page, "/inici");
  await expect(waiter.page.locator(`a[href="/reserves/${claimedBooking.id}"]`)).toBeVisible();
  note("d-waitlist", {
    bookerEntryAfterRelease: bookerEntryState,
    claim: {
      bookingState: claimedBooking.state,
      entryState: consolidated,
      status: claimed.status(),
    },
    join: { status: joined.status() },
    notified: { confirmBy: notified.confirmBy ?? null, notifiedAt: notified.notifiedAt ?? null },
    release: { state: released.state },
  });
});

test("T-08-40 (g) · the same flows in es: a booking inside the hold, and a waiting entry claimed", async ({
  browser,
}) => {
  test.setTimeout(420_000);
  const member = await clubsSession(browser, ES_MEMBER, "/inici", "es");
  const { page } = member;
  const bookable = await open04(member, "es");
  const target = bookable.classes.find(
    (row) =>
      row.state === "BOOKABLE" &&
      row.startsAtLocal.slice(0, 10) >= addDays(weekStart, 3) &&
      row.startsAtLocal.slice(0, 10) < addDays(weekStart, 7),
  );
  if (target === undefined) throw new Error("The es member has no BOOKABLE row from Thursday on");
  const { booking } = await bookInsideHold(page, target.id, "es");
  remember("esBooking", booking.id);

  // A full class with room on its waiting list, and a login member booked in it who frees a seat.
  const open = await dogWithState(member, "WAITLIST_OPEN");
  await open04(member, "es");
  await chooseDog(page, open.dog.name);
  await classRow(page, open.row.id).getByRole("button").click();
  const joining = page.waitForResponse(isCall("POST", /\/api\/v1\/waitlist-entries$/u));
  await page
    .getByRole("dialog", { name: text.es.joinDialog })
    .getByRole("button", { name: text.es.join })
    .click();
  const joined = await joining;
  expect(joined.status()).toBe(201);
  const entry = (await joined.json()) as WaitlistEntry;
  remember("esEntry", entry.id);
  await expect(page.getByText(text.es.joined)).toBeVisible();

  const freeing = await clubsSession(browser, WAITER);
  const seat = (await meHome(freeing)).reservations.find(
    (row) => row.type === "CLASS" && row.startsAtLocal === open.row.startsAtLocal,
  );
  if (seat === undefined) throw new Error("No login member of the waiter's family holds a seat");
  const released = await call<Booking>(freeing, `/bookings/${seat.id}/cancellation`, "POST", {});
  expect(released.status).toBe(200);
  await expect.poll(() => entryState(member, entry.id), { timeout: 30_000 }).toBe("NOTIFIED");

  await navigateClubRoute(page, `/espera/${entry.id}`);
  const holding = page.waitForResponse(isCall("POST", /\/api\/v1\/seat-holds$/u));
  await page.getByRole("button", { name: text.es.claim }).click();
  expect((await holding).status()).toBe(201);
  await expect(page.getByText(text.es.hold)).toBeVisible();
  const claiming = page.waitForResponse(
    isCall("POST", new RegExp(`/api/v1/waitlist-entries/${entry.id}/claim$`, "u")),
  );
  await page.getByRole("button", { name: text.es.submit }).click();
  const claimed = await claiming;
  expect(claimed.status()).toBe(201);
  const claimedBooking = (await claimed.json()) as Booking;
  remember("esClaim", claimedBooking.id);
  await expect(page.getByText(text.es.done)).toBeVisible();
  expect(claimedBooking.state).toBe("ACTIVE");
  expect(await entryState(member, entry.id)).toBe("CONSOLIDATED");
  note("g-es", {
    booking: 201,
    claim: claimed.status(),
    join: joined.status(),
    release: released.body.state,
  });
});

test("T-09-40 (e) · 08 counts 3/week in the day+3 window with «Qualsevol»; 24 blocks a ring, never over bookings", async ({
  browser,
}) => {
  test.setTimeout(420_000);
  const member = await clubsSession(browser, BOOKER);
  const { page } = member;
  const slotsRead = page.waitForResponse(isCall("GET", /\/api\/v1\/training-slots$/u));
  const summaryRead = page.waitForResponse(isCall("GET", /\/api\/v1\/me\/training-summary$/u));
  await navigateClubRoute(page, "/entrenaments");
  const slots = (await (await slotsRead).json()) as TrainingSlots;
  const eligibility = (await (await summaryRead).json()) as TrainingSummary;
  // R-09-04: today + 3 days, cut by the api (`training.bookingWindowDays = 3`).
  expect(slots.days.map((day) => day.date)).toEqual([0, 1, 2, 3].map((n) => addDays(weekStart, n)));
  const days = page.getByRole("group", { name: "Dia" });
  await expect(days.getByRole("button")).toHaveCount(4);
  const dogChips = page.getByRole("button", {
    name: new RegExp(
      `^(?:${eligibility.eligibleDogs.map((dog) => escapeRegExp(dog.name)).join("|")})(?: ·| \\(|$)`,
      "u",
    ),
  });
  await expect(dogChips).toHaveCount(eligibility.eligibleDogs.length);
  await expect(page.getByText("Portes 2/3 entrenaments aquesta setmana")).toBeVisible();
  await shot(page, "08-entrenaments-core-375.png");

  // Wednesday (day +2), «Qualsevol» (the default ring chip), the first free morning cell.
  const counterRead = page.waitForResponse(isCall("GET", /\/api\/v1\/me\/training-summary$/u));
  await days.getByRole("button").nth(2).click();
  expect((await counterRead).status()).toBe(200);
  await expect(
    page
      .getByRole("group", { name: "Pista" })
      .getByRole("button", { exact: true, name: "Qualsevol" }),
  ).toHaveAttribute("aria-pressed", "true");
  const morning = page.getByRole("group", { name: "Matí" });
  const cell = morning.locator('[data-slot-state="free"]').first();
  const label = (await cell.getAttribute("aria-label")) ?? "";
  const time = label.split(",")[0] ?? "";
  await cell.click();
  const posting = page.waitForResponse(isCall("POST", /\/api\/v1\/training-bookings$/u));
  await page.getByRole("button", { name: /^Confirma /u }).click();
  const posted = await posting;
  expect(posted.status()).toBe(201);
  const training = (await posted.json()) as { id: string; ringId: string; startsAt: string };
  remember("training", training.id);
  // R-09-07 on 08: under «Qualsevol» the app sends the first FREE ring of the slot in the api's ring
  // order (S09 §2 row 08: «la preseleccionada»; R-09-07: «La UI … envia `ringId`»).
  const wednesday = slots.days[2];
  const postedBody = posted.request().postDataJSON() as {
    dogId: string;
    ringId?: string;
    startsAt: string;
  };
  const tapped = wednesday?.slots.find((slot) => slot.startsAt === postedBody.startsAt);
  if (tapped === undefined) throw new Error("The booked cell is not a slot of Wednesday's grid");
  const firstFree = slots.rings.find((ring) => tapped.rings[ring.id]?.state === "FREE");
  expect(postedBody).toEqual({
    dogId: eligibility.defaultDogId,
    ringId: firstFree?.id,
    startsAt: tapped.startsAt,
  });
  expect(training.ringId).toBe(firstFree?.id);
  await expect(page.getByText("Entrenament reservat")).toBeVisible();
  await expect(page.getByText("Portes 3/3 entrenaments aquesta setmana")).toBeVisible();
  await expect(
    page.getByText(
      "Has arribat al límit de 3 reserves per aquesta setmana: anul·la alguna de les properes per reservar-ne una altra.",
    ),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: /^Confirma/u })).toHaveCount(0);
  // A fourth, straight to the api: `409 TRAINING_LIMIT_REACHED` with the cancellable bookings.
  // Review #3: the seed's Wednesday has more free slots, so a missing one fails the test.
  const other = wednesday?.slots.find(
    (slot) => slot.anyFree && slot.bookable && slot.startsAt !== training.startsAt,
  );
  if (other === undefined) throw new Error("Wednesday has no other free slot for a fourth booking");
  const fourth = await call(member, "/training-bookings", "POST", {
    dogId: eligibility.defaultDogId,
    startsAt: other.startsAt,
  });
  expect(fourth.status).toBe(409);
  expect(fourth.body.code).toBe("TRAINING_LIMIT_REACHED");
  // The new booking's link in the limit message → its detail → cancel: back to 2/3 and FREE.
  await page.locator(`a[href="/entrenaments/${training.id}"]`).click();
  await page.waitForURL(`**/entrenaments/${training.id}`);
  const cancelling = page.waitForResponse(
    isCall("POST", new RegExp(`/api/v1/training-bookings/${training.id}/cancellation$`, "u")),
  );
  await page.getByRole("button", { name: "ANUL·LA LA RESERVA" }).click();
  await page.getByRole("dialog").getByRole("button", { exact: true, name: "ANUL·LA" }).click();
  expect((await cancelling).status()).toBe(200);
  await page.waitForURL("**/inici");
  await expect(page.getByText("Entrenament anul·lat")).toBeVisible();
  await navigateClubRoute(page, "/entrenaments");
  await page.getByRole("group", { name: "Dia" }).getByRole("button").nth(2).click();
  await expect(page.getByText("Portes 2/3 entrenaments aquesta setmana")).toBeVisible();
  await expect(
    page.getByRole("group", { name: "Matí" }).getByRole("button", { name: `${time}, lliure` }),
  ).toHaveAttribute("data-slot-state", "free");
  // R-09-07 on the core: a `POST` without `ringId` takes the first FREE ring in catalog order,
  // which is the order the api lists its rings in. Cancelled at once (h).
  const anyRing = await call<{ id?: string; ringId?: string }>(
    member,
    "/training-bookings",
    "POST",
    { dogId: eligibility.defaultDogId, startsAt: other.startsAt },
  );
  const anyRingCancelled =
    anyRing.body.id === undefined
      ? undefined
      : await call(member, `/training-bookings/${anyRing.body.id}/cancellation`, "POST", {});
  const otherFirstFree = slots.rings.find((ring) => other.rings[ring.id]?.state === "FREE");
  expect(anyRing.status).toBe(201);
  expect(anyRing.body.ringId).toBe(otherFirstFree?.id);
  expect(anyRingCancelled?.status).toBe(200);
  const trainings = await call<{ items: TrainingBookingItem[] }>(member, "/me/training-bookings");
  const seeded = trainings.body.items.find((item) => item.date === addDays(weekStart, 1));
  if (seeded === undefined) throw new Error("The seed's Tuesday training booking is missing");
  note("e-training", {
    anyRing: {
      cancelled: anyRingCancelled?.status ?? null,
      expectedRing: otherFirstFree?.name ?? null,
      ringId: anyRing.body.ringId ?? null,
      status: anyRing.status,
    },
    booked: posted.status(),
    fourth: { code: fourth.body.code, status: fourth.status },
    posted: { ring: firstFree?.name ?? null, withRingId: postedBody.ringId !== undefined },
    ringOrder: slots.rings.map((ring) => ring.name),
    window: slots.days.map((day) => day.date),
  });

  // 24 (instructor, 375): «Bloqueig» on the seeded training's ring, two contiguous cells.
  const instructor = await clubsSession(browser, INSTRUCTOR, "/instructor/avui");
  const ip = instructor.page;
  const blockDay = addDays(weekStart, 2);
  await navigateClubRoute(ip, `/instructor/pistes/${seeded.ringId}/reservar`);
  await expect(ip.getByRole("heading", { name: "Reservar o bloquejar pista" })).toBeVisible();
  await ip.getByRole("combobox", { name: "Dia" }).selectOption(blockDay);
  await ip.getByRole("combobox", { name: "Franja" }).selectOption("morning");
  await ip.getByRole("group", { name: "Tipus" }).getByRole("button", { name: "Bloqueig" }).click();
  await expect(ip.getByRole("group", { name: "Motiu" }).getByRole("button")).toHaveText([
    "Manteniment",
    "Altres",
  ]);
  await expect(ip.getByRole("button", { name: "Classe particular" })).toHaveCount(0);
  const cells = ip.getByRole("group", { name: "Hores de la franja" });
  await expect(cells.locator('[data-slot-state="free"]').first()).toBeVisible();
  const freeTimes = await cells
    .locator('[data-slot-state="free"]')
    .evaluateAll((buttons) =>
      buttons.map((button) => (button.getAttribute("aria-label") ?? "").split(",")[0] ?? ""),
    );
  const pad = (value: string) => value.padStart(5, "0");
  const pairs = freeTimes
    .map((value, index) => [value, freeTimes[index + 1] ?? ""] as const)
    .filter(([first, next]) => next !== "" && addMinutes(pad(first), 30) === pad(next));
  const [first, second] = pairs[0] ?? ["", ""];
  if (first === "") throw new Error("No two contiguous free cells on the ring that morning");
  await cells.getByRole("button", { name: `${first}, lliure` }).click();
  await cells.getByRole("button", { name: `${second}, lliure` }).click();
  await ip.getByRole("textbox", { name: "Nota" }).fill(`E5 ${runId}`);
  const to = shortTime(addMinutes(pad(second), 30));
  await expect(
    ip.getByText(
      `Ocupa la pista ${seeded.ringName} de ${first} a ${to}, surt al quadre global i al registre d'ús de pistes. No es vincula a cap alumne.`,
    ),
  ).toBeVisible();
  await shot(ip, "24-bloqueig-core-375.png");
  const blocking = ip.waitForResponse(isCall("POST", /\/api\/v1\/ring-blocks$/u));
  await ip.getByRole("button", { name: "Bloqueja la pista" }).click();
  const blocked = await blocking;
  expect(blocked.status()).toBe(201);
  const block = (await blocked.json()) as { id: string };
  remember("ringBlock", block.id);
  await ip.waitForURL(`**/instructor/avui?date=${blockDay}`);
  await expect(ip.getByText("Pista bloquejada")).toBeVisible();
  await expect(ip.locator(".ah-day-grid").getByText("Bloq.").first()).toBeVisible();

  // Over the seeded live training booking (Tuesday 11:00): `422 RING_HAS_BOOKINGS`, no force.
  const over = await call(instructor, "/ring-blocks", "POST", {
    from: clubInstant(seeded.date, seeded.startsAtLocal),
    kind: "BLOCK",
    note: `E5 ${runId}`,
    reason: "MAINTENANCE",
    ringId: seeded.ringId,
    to: clubInstant(seeded.date, addMinutes(seeded.startsAtLocal, 60)),
  });
  expect(over.status).toBe(422);
  expect(over.body.code).toBe("RING_HAS_BOOKINGS");
  await navigateClubRoute(ip, `/instructor/pistes/${seeded.ringId}/reservar`);
  await ip.getByRole("combobox", { name: "Dia" }).selectOption(seeded.date);
  await ip.getByRole("combobox", { name: "Franja" }).selectOption("morning");
  const taken = ip.getByRole("group", { name: "Hores de la franja" }).getByRole("button", {
    name: new RegExp(`^${escapeRegExp(shortTime(seeded.startsAtLocal))}, `, "u"),
  });
  // No force option: the taken cell cannot be picked (R-09-11, the instructor cannot force).
  await expect(taken).toBeDisabled();
  await expect(taken).not.toHaveAttribute("data-slot-state", "free");
  note("e-ring-block", {
    blocked: blocked.status(),
    over: { code: over.body.code, status: over.status },
  });

  // The block in the admin's week (D4) and in the ring-usage register (E5-W03). The register
  // starts on the device's week, so the address carries week 0 (`filter`, as D10's link does).
  const admin = await adminSession(browser);
  await navigateSpa(admin.page, `/calendari?estat=actives&setmana=${weekStart}`);
  const week = admin.page.getByRole("table", { name: /^Calendari de classes · del /u });
  const hour = (value: string) => escapeRegExp(value).replace(/^0/u, "0?");
  await expect(
    week.getByRole("button", {
      name: new RegExp(
        `^${escapeRegExp(seeded.ringName)} bloquejada · .+ ${hour(pad(first))}–${hour(addMinutes(pad(second), 30))}$`,
        "u",
      ),
    }),
  ).toHaveCount(1);
  const weekDates = `date:between:${weekStart},${addDays(weekStart, 6)}`;
  await navigateSpa(
    admin.page,
    `/entrenaments?vista=reserves&filter=${encodeURIComponent(weekDates)}`,
  );
  const register = admin.page.getByRole("region", { name: "Reserves d'entrenament" });
  await expect(
    register.getByRole("row").filter({ hasText: seeded.ringName }).first(),
  ).toBeVisible();
  await shot(admin.page, "entrenaments-registre-core-1280.png");
  const weekInstants = `from:between:${clubInstant(weekStart, "00:00")},${clubInstant(addDays(weekStart, 7), "00:00")}`;
  await navigateSpa(admin.page, "/tauler");
  await navigateSpa(
    admin.page,
    `/entrenaments?vista=bloquejos&filter=${encodeURIComponent(weekInstants)}`,
  );
  await expect(
    admin.page
      .getByRole("region", { name: "Bloquejos i reserves de pista" })
      .getByRole("row")
      .filter({ hasText: `E5 ${runId}` }),
  ).toHaveCount(1);
});

/**
 * Step 5: the known candidates for a contract discrepancy, answered by the core itself (no UI
 * offers them). Each must carry its code with the status the snapshot documents for it
 * (`openapi.json`, the generated types' source): a different status is a proposal for the report.
 */
test("E5-W04 step 5 · the core's statuses for JOB_UNKNOWN, SLOT_NOT_ON_GRID, DOG_ALREADY_BOOKED and OVERRIDE_NOT_ALLOWED", async ({
  browser,
}) => {
  test.setTimeout(300_000);
  const member = await clubsSession(browser, BOOKER);
  const trainings = await call<{ items: TrainingBookingItem[] }>(member, "/me/training-bookings");
  expect(trainings.status).toBe(200);
  // The seeded Tuesday training (live: (e) cancelled only its own booking).
  const seeded = trainings.body.items.find(
    (item) => item.date === addDays(weekStart, 1) && item.state === "ACTIVE",
  );
  if (seeded === undefined) throw new Error("The seed's Tuesday training booking is missing");
  const slots = await call<TrainingSlots>(
    member,
    `/training-slots?from=${weekStart}&to=${addDays(weekStart, 3)}&dogId=${encodeURIComponent(seeded.dogId)}`,
  );
  expect(slots.status).toBe(200);
  const otherRing = slots.body.rings.find((ring) => ring.id !== seeded.ringId);
  const free = slots.body.days
    .flatMap((day) => day.slots)
    .find((slot) => slot.anyFree && slot.bookable && slot.startsAt !== seeded.startsAt);
  if (otherRing === undefined || free === undefined) {
    throw new Error("The window has no other ring or no free slot to probe with");
  }
  const created: string[] = [];
  const probe = async (path: string, body: unknown, session: Session = member) => {
    const answer = await call<ApiProblem & { id?: string }>(session, path, "POST", body);
    if (answer.status === 201 && answer.body.id !== undefined) created.push(answer.body.id);
    return { code: answer.body.code ?? null, status: answer.status };
  };
  const observed = {
    // S09 R-09-03: a start off the 30 min grid.
    slotNotOnGrid: await probe("/training-bookings", {
      dogId: seeded.dogId,
      startsAt: new Date(Date.parse(free.startsAt) + 10 * 60_000).toISOString(),
    }),
    // S09 R-09-06 (T-09-18): the same dog, the same start, on another ring.
    dogAlreadyBooked: await probe("/training-bookings", {
      dogId: seeded.dogId,
      ringId: otherRing.id,
      startsAt: seeded.startsAt,
    }),
    // S09 R-09-16 (T-09-23): `override` with a token that is not an impersonation.
    overrideNotAllowed: await probe("/training-bookings", {
      dogId: seeded.dogId,
      override: { limit: true, reason: `E5 ${runId}` },
      startsAt: free.startsAt,
    }),
    // S15 §6: a process name that does not exist.
    jobUnknown: await probe(
      "/jobs/e5-unknown-process/trigger",
      { dryRun: true },
      await adminSession(browser),
    ),
  };
  // A probe the core accepted would leave a booking behind: it is cancelled at once, and the test fails.
  for (const id of created) {
    await call(member, `/training-bookings/${id}/cancellation`, "POST", {});
  }
  note("step5-statuses", observed);
  expect(created).toEqual([]);
  expect(observed).toEqual({
    dogAlreadyBooked: { code: "DOG_ALREADY_BOOKED", status: 422 },
    jobUnknown: { code: "JOB_UNKNOWN", status: 404 },
    overrideNotAllowed: { code: "OVERRIDE_NOT_ALLOWED", status: 403 },
    slotNotOnGrid: { code: "SLOT_NOT_ON_GRID", status: 400 },
  });
});

test("T-15-32/T-15-33 (f) · D11 simulates (nothing changes) and runs the risk review; D1 reports it; P9 by its run", async ({
  browser,
}) => {
  test.setTimeout(300_000);
  const admin = await adminSession(browser);
  const { page } = admin;
  await navigateSpa(page, "/parametres#processos");
  const card = page.getByRole("region", { name: "Processos automàtics" });
  const jobs = await call<{ items: { name: string }[] }>(admin, "/jobs");
  await expect(card.locator("li[data-job]")).toHaveCount(jobs.body.items.length);
  await expect(card.getByText("cada dia a les 7:30")).toBeVisible();

  const statuses = async () =>
    (await call<{ items: RiskReviewItem[] }>(admin, "/risk-review")).body.items.map(
      (item) => `${item.classId}:${item.status}`,
    );
  const before = await statuses();
  const simulating = page.waitForResponse(
    isCall("POST", /\/api\/v1\/jobs\/risk-review\/trigger$/u),
  );
  await card.getByRole("button", { name: "Simula Revisió de classes en risc" }).click();
  const simulated = await simulating;
  expect(simulated.status()).toBe(200);
  const simulatedRun = (await simulated.json()) as JobRunAnswer;
  expect(simulatedRun.dryRun).toBe(true);
  const plan = page.getByRole("dialog", {
    name: "Simulació: què faria ara · Revisió de classes en risc",
  });
  await expect(plan.getByText("Simulació: no s'ha aplicat cap canvi.")).toBeVisible();
  // Review #3: the modal lists every planned item (it waits for the list, never counts early).
  expect(simulatedRun.effects.items.length).toBeGreaterThan(0);
  const planList = plan.locator(".jobs-card__effects > ul:not(.jobs-card__errors) > li");
  await expect(planList).toHaveCount(simulatedRun.effects.items.length);
  const planItems = await planList.count();
  await plan.getByRole("button", { name: "Tanca" }).click();
  // R-15-08: a dry run writes nothing.
  expect(await statuses()).toEqual(before);

  const running = page.waitForResponse(isCall("POST", /\/api\/v1\/jobs\/risk-review\/trigger$/u));
  await card.getByRole("button", { name: "Executa ara Revisió de classes en risc" }).click();
  await page
    .getByRole("dialog", { name: "Executar «Revisió de classes en risc» ara" })
    .getByRole("button", { name: "Executa ara" })
    .click();
  const ran = await running;
  expect(ran.status()).toBe(200);
  const ranRun = (await ran.json()) as JobRunAnswer;
  await expect(card.getByText(/^Revisió de classes en risc: /u)).toBeVisible();
  // R-15-08 (T-15-06): the plan is what the real run then does, on the same data (the scheduler is
  // off, so nothing ran in between): as many items, the same ones without the `WOULD_` prefix.
  const itemKey = (item: JobEffectItem) =>
    `${item.entityType}:${item.entityId}:${item.action.replace(/^WOULD_/u, "")}`;
  expect(ranRun).toMatchObject({ dryRun: false, status: "SUCCEEDED" });
  expect(ranRun.effects.items).toHaveLength(planItems);
  expect(ranRun.effects.items.map(itemKey).sort()).toEqual(
    simulatedRun.effects.items.map(itemKey).sort(),
  );
  const after = await call<{ items: RiskReviewItem[] }>(admin, "/risk-review");

  // D1 (T-15-33): the card's first six rows, each with the status of the api's form A item.
  const riskRead = page.waitForResponse(isCall("GET", /\/api\/v1\/risk-review$/u));
  await navigateSpa(page, "/tauler");
  const shown = ((await (await riskRead).json()) as { items: RiskReviewItem[] }).items;
  const risk = page.locator(".dashboard-risk");
  const statusOf = (item: RiskReviewItem): RegExp | string => {
    const names = item.notified.map((person) => `${person.memberName} + ${person.dogName}`);
    if (item.status === "AUTO_CANCELLED") {
      return names.length === 0 ? "anul·lada" : `anul·lada · avisada ${names.join(", ")}`;
    }
    if (item.status === "AT_RISK") {
      return names.length === 0 ? "en risc" : `en risc · avisats ${names.join(", ")}`;
    }
    if (item.status === "WILL_CANCEL") return /^s'anul·larà \S+ a les \d+:\d{2}$/u;
    return "el club decidirà";
  };
  for (const item of shown.slice(0, 6)) {
    await expect(
      risk.locator(`.dashboard-risk__row[data-class-id="${item.classId}"] .ah-badge`),
    ).toHaveText(statusOf(item));
  }
  if (shown.length > 6) {
    await expect(risk.getByText(`+${String(shown.length - 6)} més`)).toBeVisible();
  }
  await shotOf(risk, page, "D1-risc-core-1280.png");

  // P9 `cleanup`: the seed's stack has no run of it yet at this instant, so [Executa ara]
  // (R-15-09) leaves one, and the card's runs drawer lists that JobRun.
  await navigateSpa(page, "/parametres#processos");
  const cleaning = page.waitForResponse(isCall("POST", /\/api\/v1\/jobs\/cleanup\/trigger$/u));
  await card.getByRole("button", { name: "Executa ara Neteja tècnica" }).click();
  await page
    .getByRole("dialog", { name: "Executar «Neteja tècnica» ara" })
    .getByRole("button", { name: "Executa ara" })
    .click();
  const cleaned = await cleaning;
  expect(cleaned.status()).toBe(200);
  const cleanupRun = (await cleaned.json()) as { runId: string; status: string };
  await expect(card.getByText(/^Neteja tècnica: /u)).toBeVisible();
  // The card reports the run's own status (the report records it: an api-side outcome).
  const runStatus: Record<string, string> = {
    FAILED: "fallida",
    PARTIAL: "parcial",
    SKIPPED: "omesa",
    SUCCEEDED: "correcta",
  };
  await expect(card.locator('li[data-job="cleanup"] .jobs-card__last')).toContainText(
    runStatus[cleanupRun.status] ?? cleanupRun.status,
  );
  await expect(card.locator('li[data-job="risk-review"] .jobs-card__last')).toContainText(
    "correcta",
  );
  await shotOf(card, page, "D11-processos-core-1280.png");
  await card.locator('li[data-job="cleanup"] .jobs-card__last').click();
  const drawer = page.getByRole("dialog", { name: "Execucions · Neteja tècnica" });
  await expect(drawer.getByRole("row").filter({ hasText: "manual" }).first()).toBeVisible();
  const cleanupRuns = await call<{ items: { runId: string; status: string; trigger: string }[] }>(
    admin,
    "/jobs/cleanup/runs",
  );
  expect(cleanupRuns.body.items.map((run) => run.runId)).toContain(cleanupRun.runId);
  note("f-risk", {
    after: after.body.items.map((item) => item.status),
    before: before.map((value) => value.split(":")[1]),
    cleanupRun,
    dryRun: {
      actions: [...new Set(simulatedRun.effects.items.map((item) => item.action))],
      planItems,
      status: simulated.status(),
    },
    run: { body: ranRun, status: ran.status() },
  });
});

test("E5-W04 (h) · cleanup: every booking, entry, training booking and block the run created is cancelled", async ({
  browser,
}) => {
  test.setTimeout(300_000);
  const { created } = readRecord();
  const outcome: Record<string, unknown> = {};
  const cancelBooking = async (email: string, key: string, locale: Locale = "ca") => {
    const id = created[key];
    if (id === undefined) return;
    const session = await clubsSession(browser, email, "/inici", locale);
    const answer = await call<Booking>(session, `/bookings/${id}/cancellation`, "POST", {});
    const current = await call<Booking>(session, `/bookings/${id}`);
    outcome[key] = { cancellation: answer.status, state: current.body.state };
    expect(current.body.state).toMatch(/^CANCELLED/u);
  };
  await cancelBooking(SWAPPER, "swapBooking");
  await cancelBooking(WAITER, "waiterClaim");
  await cancelBooking(ES_MEMBER, "esBooking", "es");
  await cancelBooking(ES_MEMBER, "esClaim", "es");
  // Review #3: the run's two waiting entries end consolidated by their claim; one left live by a
  // failed flow is cancelled here instead (never deleted), so no entry of the run stays waiting.
  const closeEntry = async (email: string, key: string, claimKey: string, locale: Locale) => {
    const id = created[key];
    if (id === undefined) return;
    const session = await clubsSession(browser, email, "/inici", locale);
    let state = await entryState(session, id);
    let cancellation: number | undefined;
    if (state === "ACTIVE" || state === "NOTIFIED") {
      cancellation = (await call(session, `/waitlist-entries/${id}/cancellation`, "POST", {}))
        .status;
      state = await entryState(session, id);
    }
    outcome[key] = { cancellation: cancellation ?? null, state };
    expect(state).toBe(created[claimKey] === undefined ? "CANCELLED" : "CONSOLIDATED");
  };
  await closeEntry(WAITER, "waiterEntry", "waiterClaim", "ca");
  await closeEntry(ES_MEMBER, "esEntry", "esClaim", "es");
  const bookerBooking = created.bookerBooking;
  if (bookerBooking !== undefined) await cancelBooking(BOOKER, "bookerBooking");
  const training = created.training;
  if (training !== undefined) {
    const session = await clubsSession(browser, BOOKER);
    const answer = await call(session, `/training-bookings/${training}/cancellation`, "POST", {});
    const current = await call<{ state: string }>(session, `/training-bookings/${training}`);
    outcome.training = { cancellation: answer.status, state: current.body.state };
    expect(current.body.state).toMatch(/^CANCELLED/u);
  }
  const blockId = created.ringBlock;
  if (blockId !== undefined) {
    const session = await clubsSession(browser, INSTRUCTOR, "/instructor/avui");
    const answer = await call<{ state?: string }>(
      session,
      `/ring-blocks/${blockId}/cancellation`,
      "POST",
      {},
    );
    outcome.ringBlock = { cancellation: answer.status, state: answer.body.state };
    expect(answer.status).toBe(200);
  }
  note("h-cleanup", outcome);
});

test("R-09-05 · 08 counts by session date: on Sunday the day+3 window reaches the next week, and a Monday booking moves only Monday's counter", async ({
  browser,
}) => {
  test.setTimeout(300_000);
  const opening = addDays(weekStart, 6);
  await closeSessions();
  // Sunday 19:50 club-local of week 0: before the week opens (the P1 test goes on at 19:55).
  expect((await setCoreClock(browser, clubInstant(opening, "19:50"))).status).toBe(200);
  const member = await clubsSession(browser, BOOKER);

  // Sunday counts the week of the seed's two trainings, Monday the next one; a booking made on
  // Sunday for Monday moves only Monday's counter (by booking date it would move Sunday's).
  const eligibility = await call<TrainingSummary>(member, "/me/training-summary");
  const trainingDog = eligibility.body.defaultDogId;
  if (trainingDog === null || trainingDog === undefined) throw new Error("No default training dog");
  const usedOn = async (date: string) =>
    (
      await call<TrainingSummary>(
        member,
        `/me/training-summary?dogId=${encodeURIComponent(trainingDog)}&date=${date}`,
      )
    ).body.counter.used;
  const monday = addDays(opening, 1);
  const trainingPage = member.page;
  const slotsRead = trainingPage.waitForResponse(isCall("GET", /\/api\/v1\/training-slots$/u));
  await navigateClubRoute(trainingPage, "/entrenaments");
  const trainingWindow = (await (await slotsRead).json()) as TrainingSlots;
  expect(trainingWindow.days.map((day) => day.date)).toEqual(
    [0, 1, 2, 3].map((n) => addDays(opening, n)),
  );
  const sundayBefore = await usedOn(opening);
  expect(sundayBefore).toBe(2);
  expect(await usedOn(monday)).toBe(0);
  const mondayCounter = trainingPage.waitForResponse(
    isCall("GET", /\/api\/v1\/me\/training-summary$/u),
  );
  await trainingPage.getByRole("group", { name: "Dia" }).getByRole("button").nth(1).click();
  expect((await mondayCounter).status()).toBe(200);
  await expect(trainingPage.getByText("Portes 0/3 entrenaments aquesta setmana")).toBeVisible();
  await trainingPage
    .getByRole("group", { name: "Matí" })
    .locator('[data-slot-state="free"]')
    .first()
    .click();
  const mondayPosting = trainingPage.waitForResponse(
    isCall("POST", /\/api\/v1\/training-bookings$/u),
  );
  await trainingPage.getByRole("button", { name: /^Confirma / }).click();
  const mondayPosted = await mondayPosting;
  expect(mondayPosted.status()).toBe(201);
  const mondayTraining = (await mondayPosted.json()) as { date: string; id: string };
  expect(mondayTraining.date).toBe(monday);
  await expect(trainingPage.getByText("Portes 1/3 entrenaments aquesta setmana")).toBeVisible();
  const sessionDate = { monday: await usedOn(monday), sunday: await usedOn(opening) };
  expect(sessionDate).toEqual({ monday: 1, sunday: sundayBefore });
  // Idempotence (h): cancelled at once, never left behind.
  const mondayCancelled = await call(
    member,
    `/training-bookings/${mondayTraining.id}/cancellation`,
    "POST",
    {},
  );
  expect(mondayCancelled.status).toBe(200);
  expect(await usedOn(monday)).toBe(0);
  note("r-09-05", {
    after: sessionDate,
    before: { monday: 0, sunday: sundayBefore },
    booked: { date: mondayTraining.date, status: mondayPosted.status() },
    cancelled: mondayCancelled.status,
    window: trainingWindow.days.map((day) => day.date),
  });
});

test("R-15-11 (f) · P1 with the clock advanced: NOT_YET_OPEN before Sunday 20:00, BOOKABLE by the clock at 20:01, and [Executa ara] opens the week", async ({
  browser,
}) => {
  test.setTimeout(420_000);
  const opening = addDays(weekStart, 6);
  const opensAt = clubInstant(opening, "20:00").replace(".000Z", "Z");
  await closeSessions();
  expect((await setCoreClock(browser, clubInstant(opening, "19:55"))).status).toBe(200);
  let member = await clubsSession(browser, BOOKER);
  const before = await open04(member);
  const row = before.classes.find(
    (item) => item.state === "NOT_YET_OPEN" && item.opensAt === opensAt,
  );
  if (row === undefined) throw new Error("No NOT_YET_OPEN row that opens on Sunday 20:00");
  await expect(classRow(member.page, row.id)).toContainText("Properament");
  const refused = member.page.waitForResponse(isCall("POST", /\/api\/v1\/seat-holds$/u));
  await classRow(member.page, row.id).getByRole("button").click();
  const refusal = await refused;
  // CATALEG_ERRORS §1 lists NOT_YET_OPEN in its 422 row.
  expect(refusal.status()).toBe(422);
  const notYetOpen = (await refusal.json()) as ApiProblem;
  expect(notYetOpen.code).toBe("NOT_YET_OPEN");
  expect(notYetOpen.details?.opensAt).toBe(opensAt);
  await expect(
    member.page.getByText(/^Disponible a partir de diumenge .+ a les 20 h\.$/u),
  ).toBeVisible();

  // Review #1: at 20:01 the row is BOOKABLE before P1 runs — the clock opens the week (S08 R-08-01;
  // S15 R-15-11: «W0/W1 són funcions del temps»), and the scheduler is off since the first test.
  await closeSessions();
  expect((await setCoreClock(browser, clubInstant(opening, "20:01"))).status).toBe(200);
  member = await clubsSession(browser, BOOKER);
  const byClock = await open04(member);
  const rowByClock = byClock.classes.find((item) => item.id === row.id);
  expect(rowByClock?.state).toBe("BOOKABLE");
  await expect(classRow(member.page, row.id)).toHaveAttribute("data-bookable-state", "BOOKABLE");

  // No scheduled run opened the week before [Executa ara] (they are all SKIPPED while it is off).
  interface RunItem {
    counters?: Record<string, number>;
    dryRun: boolean;
    scheduledFor: string;
    skipReason?: string | null;
    status: string;
    trigger: string;
  }
  const admin = await adminSession(browser);
  const runsBefore = await call<{ items: RunItem[] }>(admin, "/jobs/week-opening/runs");
  expect(runsBefore.status).toBe(200);
  expect(
    runsBefore.body.items.filter(
      (run) =>
        run.trigger !== "MANUAL" &&
        !run.dryRun &&
        run.status === "SUCCEEDED" &&
        Date.parse(run.scheduledFor) >= Date.parse(opensAt),
    ),
  ).toEqual([]);

  // P1's own effects (R-15-11, T-15-11): the run from D11 opens the week keyed by the next Sunday
  // (`WeekOpened.openedWeekKey`), over the active classes of that week.
  await navigateSpa(admin.page, "/parametres#processos");
  const card = admin.page.getByRole("region", { name: "Processos automàtics" });
  const triggering = admin.page.waitForResponse(
    isCall("POST", /\/api\/v1\/jobs\/week-opening\/trigger$/u),
  );
  await card.getByRole("button", { name: "Executa ara Obertura de la setmana" }).click();
  await admin.page
    .getByRole("dialog", { name: "Executar «Obertura de la setmana» ara" })
    .getByRole("button", { name: "Executa ara" })
    .click();
  const triggered = await triggering;
  expect(triggered.status()).toBe(200);
  const triggerBody = (await triggered.json()) as JobRunAnswer;
  expect(triggerBody).toMatchObject({ dryRun: false, status: "SUCCEEDED" });
  expect(triggerBody.effects.items).toContainEqual(
    expect.objectContaining({ action: "OPEN", entityId: addDays(opening, 7), entityType: "Week" }),
  );
  expect(triggerBody.effects.counters.activeClasses).toBeGreaterThan(0);
  await expect(card.getByText(/^Obertura de la setmana: /u)).toBeVisible();
  const runs = await call<{ items: RunItem[] }>(admin, "/jobs/week-opening/runs");
  note("f-p1", {
    before: { details: notYetOpen.details, status: refusal.status() },
    byClock: { state: rowByClock?.state ?? null },
    row: { opensAt: row.opensAt, startsAtLocal: row.startsAtLocal },
    runs: runs.body.items.slice(0, 3),
    runsBeforeTrigger: runsBefore.body.items.slice(0, 3).map((run) => ({
      scheduledFor: run.scheduledFor,
      skipReason: run.skipReason ?? null,
      status: run.status,
      trigger: run.trigger,
    })),
    trigger: { body: triggerBody, status: triggered.status() },
  });
});
