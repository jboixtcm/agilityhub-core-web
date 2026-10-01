import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { inflateSync } from "node:zlib";

import type { Browser, BrowserContext, Locator, Page, Request, Response } from "@playwright/test";

import type { components } from "../../packages/api-client/src/generated/schema";

import { expect, test } from "./oauth-token-log";

// E6-W04 · S10 WP-10-G end to end against the published core with the E6 demo seed (api E6-T04,
// `scenario.attendance` of the image's `seeds/demo-canic.yaml`, dumped by the wrapper next to this
// run's evidence). The seed anchors week 0 on `E5_WEEK_START` (the club-local Monday after the
// run's day, `scripts/e2e-core.sh`); the scenario's sheet is that Monday's 08:30 class on Central
// (4 booked + 1 waiting on 5 seats). The core's test clock (`POST /test/clock`) moves through four
// instants, each after the sessions issued before it are closed (a move expires them):
//   1. Monday 04:00 — inside the sheet's window (R-10-03) and more than 4 h before 08:30, so an
//      instructor's «ha avisat» is in time (R-10-05) and frees the seat more than 30 min ahead;
//   2. Monday 09:46 — past `endsAt` 09:30 + `classes.finishGraceMinutes` 15 (P8, R-15-18);
//   3. Tuesday 08:00 — `messaging.noShowNoticeTime` of the next day (P3, R-10-06, R-15-13);
//   4. Wednesday 00:00 — the sheet's window closed (E7-W03 step 0e, E6-W04 review #3).
// The test titles carry S10's test ids (§11; E6-W04 review #5).
// The browsers keep their own clock (never faked); jobs run only from D11's [Simula]/[Executa ara].
// The seed's cast plays the task's people (ruling E65: invented names, never the mockups'):
// «Estel» = demo instructor 0, renamed Berta («instructor A»: the login whose own day selects the
// sheet's instructor, found in the first test); the second instructor = another instructor login
// («B»); «Laura + Duna» = Rita + Mel (census ordinal 12, `member.8@`, the cast's only member login);
// «Marc» = Martí + Sorra; «Anna» = Alba + Pinya; «Eva» = Nil + Trufa; «Pau» (waiting) = Iu + Gira.
// Rows are found by the api's ids and the screens' data attributes and roles.

const clubsUrl = "http://127.0.0.1:4173";
const adminUrl = "http://127.0.0.1:4174";
const coreUrl = requiredEnvironment("CORE_URL");
const corePassword = requiredEnvironment("E1_CORE_PASSWORD");
const mailboxDirectory = process.env.E1_MAILBOX_DIRECTORY;
const weekStart = process.env.E5_WEEK_START ?? requiredEnvironment("E4_WEEK_START");
const evidenceDirectory =
  process.env.CORE_EVIDENCE_DIRECTORY ?? resolve(process.cwd(), "roadmap/evidence/E6-W04");
const clubTimeZone = "Europe/Madrid";
const runId = Date.now().toString(36).slice(-6);
const desktop = { height: 900, width: 1280 };
const mobile = { height: 844, width: 375 };

/** `scripts/core-stack/club-canic.yaml` accounts; the seed renames their members (E6-T04). */
const ADMIN = "admin@example.test";
/**
 * The club file's instructor logins. Which one the seed made the sheet's teacher (demo instructor
 * 0, renamed Berta) is read from the core in the first test: on this image the demo instructors'
 * order is not tied to the logins (between runs 40 and 53 each of the three logins was the sheet's
 * teacher in some run). The teacher is «instructor A»; another instructor login is «B».
 */
const INSTRUCTOR_LOGINS = [
  "instructor@example.test",
  "instructor.2@example.test",
  "instructor.3@example.test",
] as const;
/** Census ordinal 12, renamed Rita, with Mel (her CAD dog moved up to A by the seed). */
const RITA = "member.8@example.test";
/** Census ordinal 5: `scenario.activityRegistrations` of `demo-canic.yaml` (the Torneig d'Estiu). */
const ACTIVITY_REGISTRANT = "member@example.test";
/** `activities[0].title.ca` of `demo-canic.yaml`, the activity that registration is for. */
const SEEDED_ACTIVITY = "Torneig d'Estiu 2026";

/** `scenario.attendance.cast` of `demo-canic.yaml` (fictional people and dogs). */
const cast = {
  alba: { dog: "Pinya", name: "Alba" },
  iu: { dog: "Gira", name: "Iu" },
  marti: { dog: "Sorra", name: "Martí" },
  nil: { dog: "Trufa", name: "Nil" },
  rita: { dog: "Mel", name: "Rita" },
} as const;
/** `scenario.attendance.history.classes[0].cancelledByClub.text`. */
const CLUB_CANCELLATION_TEXT =
  "La pista Central queda tancada aquest matí per manteniment (text fictici).";
/** `scenario.attendance.memberNote.text` and `observation` (the private one). */
const MEMBER_NOTE_TEXT =
  "La Mel s'espanta amb el túnel llarg: si us plau, comenceu amb el túnel recollit (text fictici).";
const OBSERVATION_TEXT =
  "Bona progressió en contactes; cal reforçar la sortida del túnel (observació fictícia).";

type Locale = "ca" | "es";

const text = {
  ca: {
    asInstructor: /^Com a instructora?/u,
    asMember: /^Com a alumn[ae]/u,
    email: "Correu electrònic",
    password: "Contrasenya",
  },
  es: {
    asInstructor: /^Como instructora?/u,
    asMember: /^Como alumn[ao]/u,
    email: "Correo electrónico",
    password: "Contraseña",
  },
} as const;

/** The sheet's literals (`instructor`, `enums` namespaces) checked in both passes (T-10-32). */
const sheetText = {
  ca: {
    alreadySent: "avís ja enviat",
    circles: (name: string) => `Assistència de ${name}`,
    dayTitle: "Grups del dia",
    noShow: "no presentat",
    notice: (time: string) => `ha avisat (${time})`,
    noticeWaitlist: "espera avisada",
    pending: "pendent",
    pendingSheet: "passar llista pendent",
    present: "present",
    save: "Desa",
    saved: "Llista desada",
    seatReleased: "plaça alliberada",
    stale: "Algú ha desat la llista fa un moment: revisa-la",
    waitlistTitle: (count: number) => `Llista d'espera (${String(count)})`,
    notified: "ha avisat",
  },
  es: {
    alreadySent: "aviso ya enviado",
    circles: (name: string) => `Asistencia de ${name}`,
    dayTitle: "Grupos del día",
    noShow: "no presentado",
    notice: (time: string) => `ha avisado (${time})`,
    noticeWaitlist: "espera avisada",
    pending: "pendiente",
    pendingSheet: "pasar lista pendiente",
    present: "presente",
    save: "Guarda",
    saved: "Lista guardada",
    seatReleased: "plaza liberada",
    stale: "Alguien ha guardado la lista hace un momento: revísala",
    waitlistTitle: (count: number) => `Lista de espera (${String(count)})`,
    notified: "ha avisado",
  },
} as const;

/** Screen 25's literals (`history`, `enums:historyState`) in both passes (R-10-14, T-10-32). */
const historyText = {
  ca: {
    all: "Tots",
    byClub: (message: string) => `«${message}»`,
    byMemberLate: /^Per tu, el \d{1,2}\/\d{1,2} a les \d{1,2}:\d{2} · compta com a feta$/u,
    cancelled: "anul·lada",
    cancelledByClub: "cancel·lada pel club",
    cancelledLate: "anul·lada tard",
    done: "feta",
    noShow: "no presentat",
    noShowDetail: "Sense avís previ · compta com a feta",
    noticeInTime: "Vas avisar el club, dins termini · no compta",
    title: "Històric",
  },
  es: {
    all: "Todos",
    byClub: (message: string) => `«${message}»`,
    byMemberLate: /^Por ti, el \d{1,2}\/\d{1,2} a las \d{1,2}:\d{2} · cuenta como hecha$/u,
    cancelled: "anulada",
    cancelledByClub: "cancelada por el club",
    cancelledLate: "anulada tarde",
    done: "hecha",
    noShow: "no presentado",
    noShowDetail: "Sin aviso previo · cuenta como hecha",
    noticeInTime: "Avisaste al club, dentro de plazo · no cuenta",
    title: "Historial",
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

/** A message of the core's local mailbox (`MAIL_LOCAL_DIRECTORY`): a file, not an api answer. */
interface MailMessage {
  html?: string;
  subject?: string;
  text?: string;
  to?: string | string[];
}

// AGENTS rule 4: the api's answers are the generated contract's types, with `Pick` where the run
// reads a few fields. Only the run's own records (sessions, answers, the registry) are local.
type Schemas = components["schemas"];
type ApiProblem = Partial<Pick<Schemas["ApiError"], "code" | "details">>;
type InstructorDay = Pick<Schemas["InstructorDay"], "classes" | "date" | "selectedInstructorId">;
type DayClass = Schemas["InstructorDayClass"];
type AttendanceSheet = Schemas["AttendanceSheet"];
type AttendanceRow = Schemas["AttendanceRow"];
type AttendanceState = AttendanceRow["state"];
type InstructorCard = Pick<
  Schemas["InstructorCard"],
  "dog" | "instructorNote" | "lastClasses" | "metrics" | "observations" | "tasks"
>;
type InstructorWeek = Pick<Schemas["InstructorWeek"], "cells" | "trainingSlotMinutes" | "week">;
type Task = Schemas["Task"];
type TaskList = Schemas["TaskList"];
type UploadUrl = Pick<Schemas["UploadUrl"], "expiresAt" | "fileKey" | "uploadUrl">;
type AttachmentList = Schemas["AttachmentList"];
type MeDogs = Pick<Schemas["MeDogs"], "dogs">;
type MemberHistory = Schemas["MemberHistory"];
type HistoryItem = Schemas["HistoryItem"];
type FollowupPage = Pick<Schemas["FollowupPage"], "items" | "totalItems">;
type FollowupItem = Schemas["FollowupItem"];
type UnreadCount = Schemas["FollowupUnreadCount"];
type FilterValues = Schemas["FilterValues"];
type JobRunAnswer = Pick<Schemas["JobRun"], "dryRun" | "effects" | "errors" | "runId" | "status">;
type JobEffectItem = Schemas["JobEffectItem"];
type JobSummaries = Pick<Schemas["JobSummaries"], "items">;
type WaitlistEntry = Pick<Schemas["WaitlistEntry"], "id" | "notifiedAt" | "state">;

interface RunRecord {
  created: Record<string, string>;
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

/** The instant of a club-local date and time (Europe/Madrid), as E5-W04's spec computes it. */
function clubInstant(date: string, time: string): string {
  const wall = Date.parse(`${date}T${time}:00Z`);
  const halfDay = 12 * 60 * 60_000;
  const offsets = [
    ...new Set([wall - halfDay, wall + halfDay].map((at) => zoneOffsetMinutes(at, clubTimeZone))),
  ].sort((first, second) => second - first);
  const valid = offsets.find(
    (offset) => zoneOffsetMinutes(wall - offset * 60_000, clubTimeZone) === offset,
  );
  const offset = valid ?? Math.min(...offsets);
  return new Date(wall - offset * 60_000).toISOString();
}

/** Plain-date arithmetic (UTC noon, never formatted in a zone). */
function addDays(date: string, days: number): string {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

/** «8:30» from «08:30» (the screens print club times without a leading zero). */
function shortTime(time: string): string {
  return time.replace(/^0(?=\d:)/u, "");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

/** R-10-00: «{guia} + {gos}», the guide being `handlerName ?? memberFirstName`. */
function studentName(
  row: Pick<Schemas["AttendanceRow"], "dogName" | "handlerName" | "memberFirstName">,
): string {
  return `${row.handlerName ?? row.memberFirstName} + ${row.dogName}`;
}

/**
 * The instants of the run (club-local, Europe/Madrid); the last one, Wednesday 00:00, is past the
 * Monday sheet's `T1` (Tuesday 23:59:59 with `attendance.editDays` 1, R-10-03).
 */
const instants = {
  finished: clubInstant(weekStart, "09:46"),
  monday: clubInstant(weekStart, "04:00"),
  nextMorning: clubInstant(addDays(weekStart, 1), "08:00"),
  windowClosed: clubInstant(addDays(weekStart, 2), "00:00"),
};
const registryPath = join(evidenceDirectory, "e6-core-run.json");

function readRecord(): RunRecord {
  try {
    return JSON.parse(readFileSync(registryPath, "utf8")) as RunRecord;
  } catch {
    return { created: {}, runId, steps: {}, weekStart };
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

/** An id the run created, deleted (logically) at the end (j). */
function remember(key: string, id: string): void {
  const record = readRecord();
  record.created[key] = id;
  writeRecord(record);
}

function apiPath(response: Request | Response): string {
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

const SHEET_PATH = /\/api\/v1\/class-sessions\/[^/]+\/attendance$/u;

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
  const context = await browser.newContext({ acceptDownloads: true, viewport });
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

/** The back office's `/entrar` (D-screens): ADMIN lands on D1, an INSTRUCTOR on an empty shell. */
async function loginAdmin(page: Page, email: string): Promise<void> {
  await page.goto(`${adminUrl}/entrar`);
  await page.getByLabel("Correu electrònic").fill(email);
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

// E6-W01 round 2 #7 (ruling E71): an instructor lands on 20 (`/instructor/dia`).
async function loginClubs(
  page: Page,
  email: string,
  landing: "/inici" | "/instructor/dia",
  locale: Locale,
): Promise<void> {
  await page.goto(`${clubsUrl}/entrar`);
  await page.getByLabel(text[locale].email).fill(email);
  await page.getByLabel(text[locale].password, { exact: true }).fill(corePassword);
  // The app refreshes once it lands; a navigation that aborted that call would leave the browser
  // with the rotated-away cookie (`REFRESH_REUSED`), so the login waits for it as E1–E5 do.
  const routeRefresh = page.waitForResponse(isRefresh);
  await submitPasswordLogin(page);
  await page.waitForURL((url) => url.pathname === landing || url.pathname === "/perfil-acces");
  expect((await routeRefresh).status()).toBe(200);
  if (new URL(page.url()).pathname === "/perfil-acces") {
    // 03b: an account with more than one profile and none remembered chooses one first.
    note(`profile-choice-${email}`, { landing });
    await page
      .locator("button.profile-choice__card")
      .filter({ hasText: landing === "/inici" ? text[locale].asMember : text[locale].asInstructor })
      .click();
    await page.waitForURL(`**${landing}`);
  }
  await expect(page.locator(".clubs-shell")).toBeVisible();
}

// One session per account, app and locale while the clock stays (the tests are serial): every
// login costs three `/oauth2/token` calls and the core allows 30 a minute per IP (S01 R-01-08).
const sessions = new Map<string, Session>();

async function clubsSession(
  browser: Browser,
  email: string,
  landing: "/inici" | "/instructor/dia",
  locale: Locale = "ca",
): Promise<Session> {
  const key = `clubs|${email}|${locale}`;
  const known = sessions.get(key);
  if (known !== undefined) return known;
  const context = await newContext(browser, mobile, locale);
  const page = await context.newPage();
  const bearer = bearerOf(page);
  await loginClubs(page, email, landing, locale);
  await expect.poll(bearer).toBeDefined();
  const session = { bearer, context, page };
  sessions.set(key, session);
  return session;
}

async function adminSession(browser: Browser, email: string = ADMIN): Promise<Session> {
  const key = `admin|${email}`;
  const known = sessions.get(key);
  if (known !== undefined) return known;
  const context = await newContext(browser, desktop);
  const page = await context.newPage();
  const bearer = bearerOf(page);
  await loginAdmin(page, email);
  await expect.poll(bearer).toBeDefined();
  const session = { bearer, context, page };
  sessions.set(key, session);
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
  session: Page | Session,
  path: string,
  method = "GET",
  body?: unknown,
): Promise<CoreAnswer<Body>> {
  const page = "page" in session ? session.page : session;
  const authorization = "page" in session ? session.bearer() : undefined;
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

/** In-app navigation of either SPA (the session lives in memory: no reload, no refresh call). */
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

/** A route mounted again: a page already on `path` leaves it first, so it reads again. */
async function openRoute(page: Page, path: string, away: string): Promise<void> {
  const target = new URL(path, clubsUrl);
  if (new URL(page.url()).pathname === target.pathname) await navigateSpa(page, away);
  await navigateSpa(page, path);
}

/** Opens `path` and returns the page's own answer to the call `matches` (the one it draws from). */
async function openAndRead<Body>(
  page: Page,
  path: string,
  away: string,
  matches: (response: Response) => boolean,
): Promise<Body> {
  const read = page.waitForResponse(matches);
  await openRoute(page, path, away);
  const response = await read;
  expect(response.status(), `${response.request().method()} ${apiPath(response)}`).toBe(200);
  return (await response.json()) as Body;
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
  await scope.screenshot({ path: join(evidenceDirectory, name) });
}

/**
 * `POST /test/clock {instant}` (api E5-T06/E6-T04, `test`/`local` profiles only). Moving the clock
 * expires the sessions issued before, so it runs before any login of the step: anonymously when
 * the core allows it, else with a throwaway admin session.
 */
async function setCoreClock(browser: Browser, instant: string): Promise<CoreAnswer<unknown>> {
  await closeSessions();
  const context = await newContext(browser, desktop);
  const page = await context.newPage();
  await page.goto(`${adminUrl}/entrar`);
  let answer = await call<unknown>(page, "/test/clock", "POST", { instant });
  if (answer.status === 401 || answer.status === 403) {
    const bearer = bearerOf(page);
    await loginAdmin(page, ADMIN);
    await expect.poll(bearer).toBeDefined();
    answer = await call<unknown>({ bearer, context, page }, "/test/clock", "POST", { instant });
  }
  await context.close();
  note(`clock-${instant}`, answer);
  return answer;
}

/** `PUT /jobs/{name}/switch {enabled}` for each process: the api's answers, by name. */
async function switchJobs(
  admin: Session,
  names: readonly string[],
  enabled: boolean,
): Promise<Record<string, { enabled: boolean | null; status: number }>> {
  const answers: Record<string, { enabled: boolean | null; status: number }> = {};
  for (const name of names) {
    const answer = await call<Partial<Schemas["JobSwitchResponse"]>>(
      admin,
      `/jobs/${name}/switch`,
      "PUT",
      { enabled },
    );
    answers[name] = { enabled: answer.body.enabled ?? null, status: answer.status };
  }
  return answers;
}

const JOBS_SWITCHED_OFF = "jobs-switched-off";

function mailboxFiles(): Set<string> {
  if (mailboxDirectory === undefined) return new Set();
  try {
    return new Set(readdirSync(mailboxDirectory).filter((name) => name.endsWith(".json")));
  } catch {
    return new Set();
  }
}

/** The mailbox messages written after `previous` (the core's local mail sink). */
function newMessages(previous: ReadonlySet<string>): MailMessage[] {
  if (mailboxDirectory === undefined) return [];
  return [...mailboxFiles()]
    .filter((name) => !previous.has(name))
    .sort()
    .map((name) => JSON.parse(readFileSync(join(mailboxDirectory, name), "utf8")) as MailMessage);
}

/** Every text field of a mailbox message (its subject and bodies), apostrophes made straight. */
function messageText(message: MailMessage): string {
  return Object.values(message as Record<string, unknown>)
    .flatMap((value) =>
      typeof value === "string"
        ? [value]
        : Array.isArray(value)
          ? value.filter((item): item is string => typeof item === "string")
          : [],
    )
    .join("\n")
    .replaceAll("’", "'");
}

/** «5 d'octubre» of a plain date, as the club's long dates read (straight apostrophe). */
function caDayMonth(date: string): string {
  return new Intl.DateTimeFormat("ca", { day: "numeric", month: "long", timeZone: "UTC" })
    .format(new Date(`${date}T12:00:00Z`))
    .replaceAll("’", "'");
}

/** A message for the report: subject and recipients' domains only (never an address). */
function messageSummary(message: MailMessage) {
  const recipients = Array.isArray(message.to) ? message.to : [message.to ?? ""];
  return {
    domains: recipients.map((value) => value.split("@")[1] ?? ""),
    fields: Object.keys(message).sort(),
    subject: message.subject ?? null,
  };
}

/** The sheet as the api answers it now (an api read, never the screen's). */
async function readSheet(session: Session, classId: string): Promise<AttendanceSheet> {
  const answer = await call<AttendanceSheet>(session, `/class-sessions/${classId}/attendance`);
  expect(answer.status, "GET /class-sessions/{id}/attendance").toBe(200);
  return answer.body;
}

function rowOf(sheet: AttendanceSheet, dog: string): AttendanceRow {
  const row = sheet.rows.find((item) => item.dogName === dog);
  if (row === undefined) throw new Error(`The sheet has no row for ${dog}`);
  return row;
}

/** The states of the cast's four rows, by the task's names. */
function castStates(sheet: AttendanceSheet): Record<string, AttendanceState> {
  return Object.fromEntries(sheet.rows.map((row) => [row.dogName, row.state]));
}

/** Screen 21's row of `name` («Rita + Mel»): its radio group carries the name. */
function sheetRow(page: Page, name: string): Locator {
  return page.locator("li.instructor-sheet__row").filter({
    has: page.locator(".instructor-sheet__who > strong", {
      hasText: new RegExp(`^${escapeRegExp(name)}$`, "u"),
    }),
  });
}

/** «1 pendent» · «2 pendents» and «1 feta» · «2 fetes» (`instructor:card.taskPending/taskDone`). */
function pendingLabel(count: number): string {
  return count === 1 ? "1 pendent" : `${String(count)} pendents`;
}

function doneLabel(count: number): string {
  return count === 1 ? "1 feta" : `${String(count)} fetes`;
}

function circle(page: Page, locale: Locale, name: string, state: string): Locator {
  return page
    .getByRole("radiogroup", { exact: true, name: sheetText[locale].circles(name) })
    .getByRole("radio", { exact: true, name: state });
}

function stateLabel(locale: Locale, state: AttendanceState): string {
  const labels = sheetText[locale];
  if (state === "PRESENT") return labels.present;
  if (state === "NO_SHOW") return labels.noShow;
  if (state === "NOTIFIED") return labels.notified;
  return labels.pending;
}

/** Each row's checked circle on 21 equals `states` (by the row's name). */
async function expectCircles(
  page: Page,
  locale: Locale,
  states: Readonly<Record<string, AttendanceState>>,
): Promise<void> {
  for (const [name, state] of Object.entries(states)) {
    await expect(circle(page, locale, name, stateLabel(locale, state))).toHaveAttribute(
      "aria-checked",
      "true",
    );
  }
}

/** Opens 21 by address and returns the page's own `GET` of the sheet. */
async function open21(page: Page, classId: string): Promise<AttendanceSheet> {
  return openAndRead<AttendanceSheet>(
    page,
    `/instructor/classes/${classId}`,
    "/instructor/alumnes",
    isCall("GET", SHEET_PATH),
  );
}

/** A full reload of 21 (the session's refresh, then the sheet read again from the api). */
async function reload21(session: Session, classId: string): Promise<AttendanceSheet> {
  const { page } = session;
  // The dev server mounts twice (React's StrictMode), so a read of the page before the reload can
  // still be on its way: the page's reload is awaited by its refresh and its rows on screen, and
  // the list compared with them is the api's own answer.
  const refreshed = page.waitForResponse(isRefresh);
  await page.reload();
  expect((await refreshed).status()).toBe(200);
  await expect(page.locator("li.instructor-sheet__row").first()).toBeVisible();
  return readSheet(session, classId);
}

/** [DESA] on 21 and the api's answer to that `PUT`. */
async function save21(
  page: Page,
  locale: Locale = "ca",
): Promise<{ body: AttendanceSheet & ApiProblem; request: unknown; status: number }> {
  const saving = page.waitForResponse(isCall("PUT", SHEET_PATH));
  await page.getByRole("button", { exact: true, name: sheetText[locale].save }).click();
  const response = await saving;
  return {
    body: (await response.json()) as AttendanceSheet & ApiProblem,
    request: response.request().postDataJSON(),
    status: response.status(),
  };
}

/** The class card of 20 (`/instructor/dia?date=`), and the page's own day answer. */
async function open20(
  page: Page,
  date: string,
): Promise<{ classItem: DayClass; day: InstructorDay }> {
  const day = await openAndRead<InstructorDay>(
    page,
    `/instructor/dia?date=${date}`,
    "/instructor/alumnes",
    // That date's read (the landing's own read is for the browser's today).
    (response) =>
      isCall("GET", /\/api\/v1\/instructor\/day$/u)(response) &&
      new URL(response.url()).searchParams.get("date") === date,
  );
  // The scenario's sheet, on its teacher's own day.
  const classItem = day.classes.find((item) => item.id === theScene().classId);
  if (classItem === undefined) {
    note(`open20-missing-${date}`, {
      classes: day.classes.map((item) => ({
        description: item.displayDescription,
        ring: item.ring?.name ?? null,
        start: item.startTime,
        state: item.state,
      })),
      date: day.date,
      selectedInstructorId: day.selectedInstructorId ?? null,
      url: page.url(),
    });
    throw new Error("The instructor's day does not list the scenario's class");
  }
  return { classItem, day };
}

/**
 * D11's «Processos automàtics» card (E5-W03): [Simula] or [Executa ara] of one process and the
 * api's answer to its `POST /jobs/{name}/trigger`.
 */
async function runJob(
  admin: Session,
  job: string,
  label: string,
  dryRun: boolean,
): Promise<JobRunAnswer> {
  const { page } = admin;
  const card = page.getByRole("region", { name: "Processos automàtics" });
  await expect(card.locator(`li[data-job="${job}"]`)).toBeVisible();
  const triggering = page.waitForResponse(
    isCall("POST", new RegExp(`/api/v1/jobs/${escapeRegExp(job)}/trigger$`, "u")),
  );
  if (dryRun) {
    await card.getByRole("button", { exact: true, name: `Simula ${label}` }).click();
  } else {
    await card.getByRole("button", { exact: true, name: `Executa ara ${label}` }).click();
    await page
      .getByRole("dialog", { name: `Executar «${label}» ara` })
      .getByRole("button", { exact: true, name: "Executa ara" })
      .click();
  }
  const triggered = await triggering;
  expect(triggered.status(), `POST /jobs/${job}/trigger`).toBe(200);
  return (await triggered.json()) as JobRunAnswer;
}

/**
 * D14's own list read in its default view (no filter): the page also counts values with filtered
 * `GET /followup` reads (step 0c), which are not the rows on screen.
 */
function isFollowupList(response: Response): boolean {
  return (
    isCall("GET", /\/api\/v1\/followup$/u)(response) &&
    !new URL(response.url()).searchParams.has("filter")
  );
}

/** The back office's unread counter read again on the window's focus (S10 R-10-13, E6-W03). */
async function refocusUnread(page: Page): Promise<number> {
  const read = page.waitForResponse(isCall("GET", /\/api\/v1\/followup\/unread-count$/u));
  await page.evaluate(() => {
    window.dispatchEvent(new Event("focus"));
  });
  const response = await read;
  expect(response.status()).toBe(200);
  return ((await response.json()) as UnreadCount).count;
}

/** An effect item's entity (R-15-08: the plan names what the run then changes). */
function itemKey(item: JobEffectItem): string {
  return `${item.entityType}:${item.entityId}`;
}

/**
 * The PDF's objects as text: the file itself and each `FlateDecode` stream inflated. A PDF 1.5+
 * keeps its page objects inside a compressed object stream (`/Type /ObjStm`), as the core's does.
 */
function pdfText(bytes: Buffer): string {
  const raw = bytes.toString("latin1");
  const parts = [raw];
  let from = 0;
  for (;;) {
    const start = raw.indexOf("stream", from);
    if (start === -1) break;
    const end = raw.indexOf("endstream", start + 6);
    if (end === -1) break;
    from = end + 9;
    // `endstream` itself contains «stream»: only a keyword that opens a stream counts.
    if (raw.slice(start - 3, start) === "end") continue;
    const bodyStart = start + 6 + (raw.startsWith("\r\n", start + 6) ? 2 : 1);
    try {
      parts.push(inflateSync(bytes.subarray(bodyStart, end)).toString("latin1"));
    } catch {
      // Not a deflated stream (or trailing bytes the inflater refuses): left out.
    }
  }
  return parts.join("\n");
}

/** The PDF's page boxes (`/MediaBox [x0 y0 x1 y1]`), in the file or in its object streams. */
function mediaBoxes(bytes: Buffer): { height: number; width: number }[] {
  const source = pdfText(bytes);
  const boxes: { height: number; width: number }[] = [];
  const pattern = /\/MediaBox\s*\[\s*(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s*\]/gu;
  for (const match of source.matchAll(pattern)) {
    const [x0, y0, x1, y1] = match.slice(1, 5).map(Number);
    if (x0 === undefined || y0 === undefined || x1 === undefined || y1 === undefined) continue;
    boxes.push({ height: y1 - y0, width: x1 - x0 });
  }
  return boxes;
}

// The run's shared ids (the api's, read once in the first test and kept in the registry too).
interface Scene {
  /** The sheet teacher's Instructor (`selectedInstructorId` of her own 20). */
  bertaId: string;
  classId: string;
  entryId: string;
  /** The login of the sheet's teacher, and another instructor's login. */
  instructorA: string;
  instructorB: string;
  melId: string;
  names: Record<keyof typeof cast, string>;
}
let scene: Scene | undefined;

function theScene(): Scene {
  if (scene === undefined) throw new Error("The scenario's sheet was not read (first test)");
  return scene;
}

/** The tasks the run creates, deleted at the end (j): key → creator's account. */
function taskOwners(): Record<string, string> {
  return { taskA: theScene().instructorA, taskB: theScene().instructorB };
}

/**
 * The scenario's sheet (`scenario.attendance.sheet`): the Monday 08:30 class whose rows have Mel,
 * found through each instructor's day as the admin reads it; then the login whose own 20 selects
 * that class's instructor (`selectedInstructorId`, R-10-01) and another instructor's login.
 */
async function findScene(admin: Session): Promise<Scene> {
  const adminDay = await call<Pick<Schemas["InstructorDay"], "instructors">>(
    admin,
    `/instructor/day?date=${weekStart}`,
  );
  expect(adminDay.status).toBe(200);
  let found: { instructorId: string; sheet: AttendanceSheet } | undefined;
  const looked: Record<string, string[]> = {};
  for (const instructor of adminDay.body.instructors) {
    const day = await call<InstructorDay>(
      admin,
      `/instructor/day?date=${weekStart}&instructorId=${instructor.id}`,
    );
    looked[instructor.shortName] = day.body.classes.map((item) => item.startTime);
    for (const item of day.body.classes.filter((entry) => entry.startTime === "08:30")) {
      const sheet = await readSheet(admin, item.id);
      if (sheet.rows.some((row) => row.dogName === cast.rita.dog)) {
        found = { instructorId: instructor.id, sheet };
      }
    }
  }
  if (found === undefined) {
    note("scene-missing", looked);
    throw new Error("No instructor's Monday 08:30 class has the seed's sheet (Mel)");
  }
  const { instructorId, sheet } = found;
  // Each Instructor's member and its contact e-mails, as the admin reads them (S05 §6, S03 §6):
  // the login whose address is the teacher's is instructor A, another instructor login is B.
  const catalog = await call<Pick<Schemas["CatalogItemsInstructor"], "items">>(
    admin,
    "/instructors",
  );
  expect(catalog.status).toBe(200);
  const logins: Record<string, null | string> = {};
  for (const item of catalog.body.items) {
    const memberId = "memberId" in item ? item.memberId : undefined;
    if (memberId === undefined) continue;
    const member = await call<Pick<Schemas["Member"], "contactEmails">>(
      admin,
      `/members/${memberId}`,
    );
    const emails =
      member.status === 200 ? member.body.contactEmails.map((entry) => entry.email) : [];
    for (const email of INSTRUCTOR_LOGINS) {
      if (emails.some((value) => value.toLowerCase() === email)) logins[email] = item.id;
    }
  }
  const instructorA = INSTRUCTOR_LOGINS.find((email) => logins[email] === instructorId);
  const instructorB = INSTRUCTOR_LOGINS.find(
    (email) => email !== instructorA && logins[email] !== undefined,
  );
  const rows = Object.fromEntries(
    (Object.keys(cast) as (keyof typeof cast)[]).map((key) => [
      key,
      sheet.rows.find((row) => row.dogName === cast[key].dog),
    ]),
  );
  const entry = sheet.waitlist?.entries.find((item) => item.dogName === cast.iu.dog);
  const mel = rows.rita;
  note("scene-discovery", {
    classInstructor: sheet.classSession.instructorName ?? null,
    entry: entry === undefined ? null : { name: studentName(entry), state: entry.state },
    logins: Object.fromEntries(
      Object.entries(logins).map(([email, id]) => [
        email,
        id === instructorId ? "teacher" : "other",
      ]),
    ),
    rows: sheet.rows.map((row) => row.dogName),
  });
  if (instructorA === undefined || instructorB === undefined) {
    throw new Error("No instructor login teaches the seed's sheet, or no other login");
  }
  if (mel === undefined || entry === undefined) {
    throw new Error("The scenario's sheet is not the seed's (Mel or Gira missing)");
  }
  return {
    bertaId: instructorId,
    classId: sheet.classSession.id,
    entryId: entry.entryId,
    instructorA,
    instructorB,
    melId: mel.dogId,
    names: Object.fromEntries(
      (Object.keys(cast) as (keyof typeof cast)[]).map((key) => {
        const row = key === "iu" ? entry : rows[key];
        return [key, row === undefined ? `${cast[key].name} + ${cast[key].dog}` : studentName(row)];
      }),
    ) as Record<keyof typeof cast, string>,
  };
}

/** A refusal for the registry: its status, code and the names of its details (never values). */
function refusal(answer: CoreAnswer<ApiProblem>) {
  return {
    code: answer.body.code ?? null,
    detailKeys: Object.keys(answer.body.details ?? {}).sort(),
    status: answer.status,
  };
}

/**
 * A class of `date` with a live `PENDING` row, never the scenario's: each instructor's day as the
 * admin reads it, then the sheet as `reader` reads it (the probes of E6-W04 review #3).
 */
async function classWithPendingRow(
  admin: Session,
  reader: Session,
  date: string,
): Promise<
  | {
      canMarkNotice: boolean;
      canMarkPresence: boolean;
      classId: string;
      row: AttendanceRow;
      version: number;
    }
  | undefined
> {
  const adminDay = await call<Pick<Schemas["InstructorDay"], "instructors">>(
    admin,
    `/instructor/day?date=${date}`,
  );
  expect(adminDay.status).toBe(200);
  for (const instructor of adminDay.body.instructors) {
    const day = await call<InstructorDay>(
      admin,
      `/instructor/day?date=${date}&instructorId=${instructor.id}`,
    );
    for (const item of day.body.classes) {
      if (item.id === theScene().classId || item.state !== "ACTIVE" || item.booked === 0) continue;
      const sheet = await readSheet(reader, item.id);
      const row = sheet.rows.find((entry) => entry.state === "PENDING" && !entry.final);
      if (row !== undefined) {
        return {
          canMarkNotice: sheet.sheet.canMarkNotice,
          canMarkPresence: sheet.sheet.canMarkPresence,
          classId: item.id,
          row,
          version: sheet.sheet.version,
        };
      }
    }
  }
  return undefined;
}

test.describe.configure({ mode: "serial" });

// The core's clock goes back to the real instant and then the processes back on, even after a
// failure: switched on first, they would catch up at the run's last test instant (E6-W04 review).
test.afterAll(async ({ browser }) => {
  test.setTimeout(300_000);
  await closeSessions();
  const restored = await setCoreClock(browser, new Date().toISOString());
  note("j-clock-restored", { status: restored.status });
  const switchedOff = (readRecord().steps[JOBS_SWITCHED_OFF] as string[] | undefined) ?? [];
  let switchedOn: Record<string, { enabled: boolean | null; status: number }> = {};
  if (switchedOff.length > 0) {
    switchedOn = await switchJobs(await adminSession(browser), switchedOff, true);
    note("jobs-switched-on", switchedOn);
  }
  expect(restored.status).toBe(200);
  for (const answer of Object.values(switchedOn)) {
    expect(answer).toEqual({ enabled: true, status: 200 });
  }
});

test("E6-W04 step 2 · preflight (S10 answers), the processes off, POST /test/clock to Monday 04:00 and the parameters the flows read", async ({
  browser,
}) => {
  test.setTimeout(300_000);
  writeRecord({ created: {}, runId, steps: {}, weekStart });
  note("instants", instants);
  // At the real instant: the S10 surface answers (never 501), and the scheduler's processes go
  // off before any clock move (E5-W04 review #10), so no catch-up races the scenario.
  const before = await adminSession(browser);
  const preflight = {
    followup: (await call(before, "/followup?page=0&size=20")).status,
    instructorDay: (await call(before, `/instructor/day?date=${weekStart}`)).status,
  };
  note("preflight", preflight);
  expect(preflight.instructorDay).not.toBe(501);
  expect(preflight.followup).not.toBe(501);
  const listed = await call<JobSummaries>(before, "/jobs");
  expect(listed.status).toBe(200);
  // Since api E7-T04 the core lists P4 `reminders` (S15 R-15-01, R-15-14): its row as the core
  // sends it, next to the MSW catalog's (`fixtures/jobs.ts`: `REMINDERS`, no module, continuous).
  const reminders = listed.body.items.find((job) => job.name === "reminders");
  note("jobs-listed", {
    names: listed.body.items.map((job) => job.name),
    reminders:
      reminders === undefined
        ? null
        : {
            counters: Object.keys(reminders.lastRun?.counters ?? {}).sort(),
            enabled: reminders.enabled,
            jobName: reminders.jobName,
            lastRun: reminders.lastRun?.status ?? null,
            module: reminders.module ?? null,
            nextScheduledForLocal: reminders.nextScheduledForLocal ?? null,
            schedule: reminders.schedule,
          },
  });
  expect(reminders).toMatchObject({
    jobName: "REMINDERS",
    module: null,
    schedule: { kind: "CONTINUOUS" },
  });
  const enabledJobs = listed.body.items.filter((job) => job.enabled).map((job) => job.name);
  note(JOBS_SWITCHED_OFF, enabledJobs);
  const switchedOff = await switchJobs(before, enabledJobs, false);
  note("jobs-switch-off-answers", switchedOff);
  for (const answer of Object.values(switchedOff)) {
    expect(answer).toEqual({ enabled: false, status: 200 });
  }
  // Step 2: the clock is required (every flow needs the sheet's day); its answer is recorded.
  const clock = await setCoreClock(browser, instants.monday);
  note("clock", { coreUrl, instant: instants.monday, status: clock.status });
  expect(clock.status).toBe(200);
  const admin = await adminSession(browser);
  const parameters: Record<string, unknown> = {};
  for (const key of [
    "bookings.lateCancelThresholdMinutes",
    "waitlist.mode",
    "waitlist.notifyThresholdMinutes",
    "attendance.editDays",
    "messaging.noShowNoticeTime",
    "classes.finishGraceMinutes",
    "bookings.instructorLastMinuteNotice",
  ]) {
    const answer = await call<Partial<Pick<Schemas["Parameter"], "value">> | null>(
      admin,
      `/parameters/${key}`,
    );
    parameters[key] = answer.status === 200 ? answer.body?.value : `HTTP ${String(answer.status)}`;
  }
  note("parameters", parameters);
  expect(parameters).toMatchObject({
    "attendance.editDays": 1,
    "bookings.lateCancelThresholdMinutes": 240,
    "classes.finishGraceMinutes": 15,
    "messaging.noShowNoticeTime": "08:00",
    "waitlist.notifyThresholdMinutes": 30,
  });
  const jobs = await call<JobSummaries>(admin, "/jobs");
  expect(jobs.body.items.filter((job) => job.enabled).map((job) => job.name)).toEqual([]);
  scene = await findScene(admin);
  note("scene", scene);
});

// Monday 04:00: the sheet, the agenda, the tasks and the follow-up; the run's tasks are deleted in
// the group's failure-safe `afterAll` while the clock is still here (j).
test.describe("Monday 04:00", () => {
  test.afterAll(async ({ browser }) => {
    test.setTimeout(300_000);
    const { created } = readRecord();
    const outcome: Record<string, unknown> = {};
    for (const [key, owner] of Object.entries(scene === undefined ? {} : taskOwners())) {
      const id = created[key];
      if (id === undefined) continue;
      try {
        const session = await clubsSession(browser, owner, "/instructor/dia");
        const deleted = await call(session, `/tasks/${id}`, "DELETE");
        const after = await call<TaskList>(session, `/tasks?dogId=${theScene().melId}`);
        outcome[key] = {
          delete: deleted.status,
          listed: after.body.items.some((task) => task.id === id),
        };
      } catch (error) {
        outcome[key] = { error: error instanceof Error ? error.message.split("\n")[0] : error };
      }
    }
    note("j-tasks-deleted", outcome);
    for (const value of Object.values(outcome)) {
      expect(value).toMatchObject({ listed: false });
    }
  });

  test("T-10-28 (f) 22 · the seeded month gives the card's metrics (86%, 7 classes, 2,3 a week) and its three blocks, before anything is marked", async ({
    browser,
  }) => {
    test.setTimeout(300_000);
    const { instructorA, melId } = theScene();
    const berta = await clubsSession(browser, instructorA, "/instructor/dia");
    const card = await openAndRead<InstructorCard>(
      berta.page,
      `/instructor/alumnes/${melId}`,
      "/instructor/dia",
      isCall("GET", /\/api\/v1\/dogs\/[^/]+\/instructor-card$/u),
    );
    note("f-22-card", {
      lastClasses: card.lastClasses.map((item) => ({ date: item.date, state: item.displayState })),
      metrics: card.metrics,
      noteText: card.instructorNote?.text ?? null,
      observations: card.observations?.text ?? null,
      tasks: card.tasks,
    });
    // R-10-08: the seed's 30 days hold present 6, no-show 1, notified in time 1 and ten trainings.
    expect(card.metrics).toMatchObject({
      attendancePct: 86,
      classesCounted: 7,
      noShow: 1,
      notified: 1,
      present: 6,
    });
    expect(card.metrics.trainingsPerWeek).toBeCloseTo(2.3, 1);
    // The seed's two tasks: one pending with its attachment, one done by Rita.
    expect(card.tasks).toMatchObject({ doneCount: 1, pendingCount: 1 });
    const metrics = berta.page.locator(".instructor-card__metrics");
    await expect(metrics.locator("dd")).toHaveText(["86%", "7", "2,3"]);
    await expect(metrics.locator("dt")).toHaveText([
      "assistència 30 dies",
      "classes 30 dies",
      "entren./setm. 30 dies",
    ]);
    await expect(berta.page.getByRole("heading", { name: "5 darreres classes" })).toBeVisible();
    // The three TASKS blocks (R-10-09): the member's note, the tasks' counters, the observations.
    await expect(
      berta.page.getByRole("heading", { name: "Notes als instructors (de l'alumne)" }),
    ).toBeVisible();
    await expect(berta.page.getByText(MEMBER_NOTE_TEXT)).toBeVisible();
    await expect(
      berta.page.getByRole("heading", { name: "Tasques (les veu i marca l'alumne)" }),
    ).toBeVisible();
    await expect(berta.page.locator(".instructor-card__tasks")).toContainText(
      pendingLabel(card.tasks?.pendingCount ?? -1),
    );
    await expect(berta.page.locator(".instructor-card__tasks")).toContainText(
      doneLabel(card.tasks?.doneCount ?? -1),
    );
    await expect(
      berta.page.getByRole("heading", { name: "Observacions (privades)" }),
    ).toBeVisible();
    await expect(berta.page.getByText(OBSERVATION_TEXT)).toBeVisible();
    await shot(berta.page, "22-fitxa-core-375.png");
  });

  test("T-10-27 T-10-23 (a)(c) 20 → 21 · the seeded class, Rita present and Nil «no presentat» against the second instructor's save: 409 STALE_VERSION, the merge keeps them, the second [DESA] saves", async ({
    browser,
  }) => {
    test.setTimeout(420_000);
    const { classId, names } = theScene();
    const berta = await clubsSession(browser, theScene().instructorA, "/instructor/dia");
    const { page } = berta;

    // 20: the seeded Monday 8:30 with «4/5», the hourglass «1» and «passar llista pendent».
    const { classItem } = await open20(page, weekStart);
    expect(classItem).toMatchObject({ booked: 4, capacity: 5, id: classId, waiting: 1 });
    expect(classItem.attendance.status).toBe("PENDING");
    const classCard = page.locator(
      `a.instructor-day__class[href="/instructor/classes/${classId}"]`,
    );
    await expect(classCard).toContainText("4/5");
    await expect(classCard.locator(".instructor-day__waiting")).toContainText("1");
    await expect(classCard.locator(".instructor-day__waiting .ah-sr-only")).toHaveText(
      "1 en llista d'espera",
    );
    await expect(classCard).toContainText(sheetText.ca.pendingSheet);
    await expect(
      page.getByRole("heading", { level: 1, name: sheetText.ca.dayTitle }),
    ).toBeVisible();
    await shot(page, "20-grups-del-dia-core-375.png");

    // Tap → 21: four rows in `bookedAt` order and «Llista d'espera (1)» with Iu.
    const sheetRead = page.waitForResponse(isCall("GET", SHEET_PATH));
    await classCard.click();
    await page.waitForURL(`**/instructor/classes/${classId}`);
    const sheet = (await (await sheetRead).json()) as AttendanceSheet;
    const order = [names.rita, names.marti, names.alba, names.nil];
    expect(sheet.rows.map(studentName)).toEqual(order);
    await expect(page.locator("li.instructor-sheet__row .instructor-sheet__who strong")).toHaveText(
      order,
    );
    expect(sheet.rows.map((row) => row.state)).toEqual([
      "PENDING",
      "PENDING",
      "PENDING",
      "PENDING",
    ]);
    expect(sheet.sheet).toMatchObject({ canMarkNotice: true, canMarkPresence: true });
    await expect(page.locator(".instructor-sheet__meta")).toContainText("4/5");
    await expect(page.getByRole("heading", { name: sheetText.ca.waitlistTitle(1) })).toBeVisible();
    await expect(page.locator(".instructor-sheet__waitlist li strong")).toHaveText([names.iu]);
    const versionRead = sheet.sheet.version;

    // (a) Rita present and Nil «no presentat», chosen locally (nothing is sent on a tap).
    let puts = 0;
    page.on("request", (request) => {
      if (request.method() === "PUT" && SHEET_PATH.test(apiPath(request))) puts += 1;
    });
    await circle(page, "ca", names.rita, sheetText.ca.present).click();
    await circle(page, "ca", names.nil, sheetText.ca.noShow).click();
    expect(puts).toBe(0);

    // (c) The second instructor opens the same sheet and saves Martí «no presentat» first.
    const other = await clubsSession(browser, theScene().instructorB, "/instructor/dia");
    const otherSheet = await open21(other.page, classId);
    expect(otherSheet.sheet.version).toBe(versionRead);
    await circle(other.page, "ca", names.marti, sheetText.ca.noShow).click();
    const otherSave = await save21(other.page);
    expect(otherSave.status).toBe(200);
    await expect(other.page.getByText(sheetText.ca.saved)).toBeVisible();

    // The first session saves its two rows on the version it read → 409, the toast, the list
    // with the other person's change, and its own two choices kept (R-10-04).
    const stale = await save21(page);
    expect(stale.status).toBe(409);
    expect(stale.body.code).toBe("STALE_VERSION");
    expect(stale.request).toEqual({
      items: [
        { bookingId: rowOf(sheet, cast.rita.dog).bookingId, state: "PRESENT" },
        { bookingId: rowOf(sheet, cast.nil.dog).bookingId, state: "NO_SHOW" },
      ],
      version: versionRead,
    });
    await expect(page.getByText(sheetText.ca.stale)).toBeVisible();
    await expectCircles(page, "ca", {
      [names.alba]: "PENDING",
      [names.marti]: "NO_SHOW",
      [names.nil]: "NO_SHOW",
      [names.rita]: "PRESENT",
    });
    const saved = await save21(page);
    expect(saved.status).toBe(200);
    await expect(page.getByText(sheetText.ca.saved)).toBeVisible();
    const savedStates = castStates(saved.body);
    expect(savedStates).toEqual({
      [cast.alba.dog]: "PENDING",
      [cast.marti.dog]: "NO_SHOW",
      [cast.nil.dog]: "NO_SHOW",
      [cast.rita.dog]: "PRESENT",
    });
    // The summary carries who saved and when; the version moved past the other person's save.
    expect(saved.body.sheet.savedByName ?? "").not.toBe("");
    expect(saved.body.sheet.savedAt ?? "").not.toBe("");
    expect(saved.body.sheet.version).toBeGreaterThan(otherSave.body.sheet.version);
    expect(rowOf(saved.body, cast.nil.dog).noShowNotice?.sentAt ?? null).toBeNull();
    await expect(sheetRow(page, names.nil)).toContainText("no presentat → avís demà a les 8:00");

    // After a reload the circles stay set: they are the api's.
    const reloaded = await reload21(berta, classId);
    expect(castStates(reloaded)).toEqual(savedStates);
    await expectCircles(page, "ca", {
      [names.alba]: "PENDING",
      [names.marti]: "NO_SHOW",
      [names.nil]: "NO_SHOW",
      [names.rita]: "PRESENT",
    });
    await shot(page, "21-passar-llista-core-375.png");
    note("a-c-sheet", {
      a: {
        afterReload: castStates(reloaded),
        savedAt: saved.body.sheet.savedAt ?? null,
        savedByName: saved.body.sheet.savedByName ?? null,
        status: saved.status,
        version: saved.body.sheet.version,
      },
      c: {
        otherSave: { status: otherSave.status, version: otherSave.body.sheet.version },
        stale: { code: stale.body.code ?? null, status: stale.status },
        versionRead,
      },
      order: sheet.rows.map(studentName),
      twentyCard: {
        booked: classItem.booked,
        capacity: classItem.capacity,
        waiting: classItem.waiting,
      },
    });
  });

  test("T-10-11 T-10-27 (b) R-10-05 · «ha avisat» more than 4 h ahead: CANCELLED, the seat released, the waitlist notified; the row stays, final and inert", async ({
    browser,
  }) => {
    test.setTimeout(300_000);
    const { classId, entryId, names } = theScene();
    const berta = await clubsSession(browser, theScene().instructorA, "/instructor/dia");
    const { page } = berta;
    await open21(page, classId);
    const mailboxBefore = mailboxFiles();
    await circle(page, "ca", names.alba, sheetText.ca.notified).click();
    const saved = await save21(page);
    expect(saved.status).toBe(200);
    const alba = rowOf(saved.body, cast.alba.dog);
    expect(alba).toMatchObject({ final: true, state: "NOTIFIED" });
    expect(alba.notice).toMatchObject({
      afterClassEnd: false,
      bookingState: "CANCELLED",
      late: false,
      seatReleased: true,
      waitlistNotified: true,
    });
    // R-10-02: the row stays on the sheet while the count drops to 3/5.
    expect(saved.body.classSession.booked).toBe(3);
    await expect(page.locator(".instructor-sheet__meta")).toContainText("3/5");
    const row = sheetRow(page, names.alba);
    await expect(row).toBeVisible();
    await expect(
      row.getByText(sheetText.ca.notice(shortTime(alba.notice?.atLocal ?? "")), { exact: true }),
    ).toBeVisible();
    await expect(row.getByText(sheetText.ca.seatReleased, { exact: true })).toBeVisible();
    await expect(row.getByText(sheetText.ca.noticeWaitlist, { exact: true })).toBeVisible();

    // Iu's entry is NOTIFIED (ALL_AT_ONCE); N-15 itself is E7's feed (screen 11), out of scope here.
    await expect
      .poll(
        async () =>
          (await readSheet(berta, classId)).waitlist?.entries.find(
            (item) => item.entryId === entryId,
          )?.state,
        { timeout: 30_000 },
      )
      .toBe("NOTIFIED");
    const admin = await adminSession(browser);
    const entry = await call<ApiProblem & Partial<WaitlistEntry>>(
      admin,
      `/waitlist-entries/${entryId}`,
    );
    // Iu's own entry, as the admin reads it: notified by the released seat (R-10-05, S08).
    expect({ state: entry.body.state, status: entry.status }).toEqual({
      state: "NOTIFIED",
      status: 200,
    });
    const n15Mail = newMessages(mailboxBefore).map(messageSummary);

    // The final row is inert: no circle can be chosen, and a forced tap sends nothing.
    let puts = 0;
    page.on("request", (request) => {
      if (request.method() === "PUT" && SHEET_PATH.test(apiPath(request))) puts += 1;
    });
    const group = page.getByRole("radiogroup", {
      exact: true,
      name: sheetText.ca.circles(names.alba),
    });
    await expect(group).toHaveAttribute("aria-disabled", "true");
    for (const state of [sheetText.ca.pending, sheetText.ca.present, sheetText.ca.noShow]) {
      const radio = group.getByRole("radio", { exact: true, name: state });
      await expect(radio).toBeDisabled();
      await radio.click({ force: true });
    }
    await expect(circle(page, "ca", names.alba, sheetText.ca.notified)).toHaveAttribute(
      "aria-checked",
      "true",
    );
    await expect(page.getByRole("button", { exact: true, name: sheetText.ca.save })).toBeDisabled();
    expect(puts).toBe(0);
    await shot(page, "21-ha-avisat-core-375.png");
    note("b-notice", {
      booked: saved.body.classSession.booked,
      entry: { adminRead: entry.status, state: entry.body.state ?? null },
      forcedPuts: puts,
      mailboxAfterNotice: n15Mail,
      notice: alba.notice,
      status: saved.status,
    });
  });

  test("T-10-29 (d) D12 · the week with the class, a training at half height and a block; the panel cycles Martí to «present» through the same contract; the week PDF", async ({
    browser,
  }) => {
    test.setTimeout(420_000);
    const { classId, names } = theScene();
    const desk = await adminSession(browser, theScene().instructorA);
    const { page } = desk;
    const week = await openAndRead<InstructorWeek>(
      page,
      `/agenda?setmana=${weekStart}`,
      "/seguiment",
      isCall("GET", /\/api\/v1\/instructor\/week$/u),
    );
    const cell = week.cells.find((item) => item.kind === "CLASS" && item.classId === classId);
    if (cell === undefined) throw new Error("D12's week has no cell for the scenario's class");
    const trainings = week.cells.filter((item) => item.kind === "TRAINING");
    const blocks = week.cells.filter((item) => item.kind === "BLOCK");
    expect(trainings.length).toBeGreaterThan(0);
    expect(blocks.length).toBeGreaterThan(0);
    await expect(page.locator(".week-agenda__half")).toHaveCount(trainings.length);
    await expect(page.locator(".week-agenda__block")).toHaveCount(blocks.length);
    if (week.trainingSlotMinutes != null) {
      await expect(page.locator(".week-agenda__legend")).toContainText(
        `mitja alçada: ${String(week.trainingSlotMinutes)} min`,
      );
    }
    const grid = page.getByRole("table", { name: /^Agenda de la setmana del /u });
    const slot = grid
      .locator("tbody tr")
      .filter({
        has: page.locator("th", {
          hasText: new RegExp(`^${escapeRegExp(shortTime(cell.time))}$`, "u"),
        }),
      })
      .locator("td.ah-schedule-grid__slot")
      .nth(0);
    const classButton = slot.getByRole("button").filter({ hasText: cell.ringName ?? "" });
    await expect(classButton).toHaveCount(1);
    await expect(classButton).toContainText(
      `${String(cell.booked ?? 0)}/${String(cell.capacity ?? 0)}`,
    );
    await shot(page, "D12-agenda-core-1280.png");

    // The panel: the same rows as 21, each name linking to D13; Martí cycles to «present».
    const sheetRead = page.waitForResponse(isCall("GET", SHEET_PATH));
    await classButton.click();
    const sheet = (await (await sheetRead).json()) as AttendanceSheet;
    const panel = page.locator(".week-agenda__panel");
    const links = panel.locator("a.week-agenda__student");
    await expect(links).toHaveText(sheet.rows.map(studentName));
    for (const [index, row] of sheet.rows.entries()) {
      await expect(links.nth(index)).toHaveAttribute("href", `/alumnes/${row.dogId}`);
    }
    const marti = rowOf(sheet, cast.marti.dog);
    expect(marti.state).toBe("NO_SHOW");
    const badge = (state: string) =>
      panel.getByRole("button", { exact: true, name: `Assistència de ${names.marti}: ${state}` });
    await badge("no presentat").click();
    await badge("pendent").click();
    await expect(badge("present")).toBeVisible();
    const saving = page.waitForResponse(isCall("PUT", SHEET_PATH));
    await panel.getByRole("button", { exact: true, name: "Desa la llista" }).click();
    const saved = await saving;
    expect(saved.status()).toBe(200);
    expect(saved.request().postDataJSON()).toEqual({
      items: [{ bookingId: marti.bookingId, state: "PRESENT" }],
      version: sheet.sheet.version,
    });
    const savedSheet = (await saved.json()) as AttendanceSheet;
    expect(rowOf(savedSheet, cast.marti.dog).state).toBe("PRESENT");
    await expect(panel.getByText("Llista desada")).toBeVisible();
    await shotOf(panel, page, "D12-llista-assistents-core-1280.png");

    // [PDF]: a download of the same week, a landscape PDF (R-10-15).
    const exportRead = page.waitForResponse(isCall("GET", /\/api\/v1\/instructor\/week\/export$/u));
    const downloading = page.waitForEvent("download");
    await page.getByRole("button", { exact: true, name: "PDF" }).click();
    const exported = await exportRead;
    const download = await downloading;
    const pdfPath = join(evidenceDirectory, "agenda-setmana-core.pdf");
    await download.saveAs(pdfPath);
    const bytes = readFileSync(pdfPath);
    const boxes = mediaBoxes(bytes);
    const pdf = {
      boxes,
      // A page turned by `/Rotate` would swap the box's sides: none is expected.
      rotate: pdfText(bytes).match(/\/Rotate\s+-?\d+/gu) ?? [],
      contentType: exported.headers()["content-type"] ?? null,
      firstBytes: bytes.subarray(0, 8).toString("latin1"),
      size: statSync(pdfPath).size,
      status: exported.status(),
      suggestedFilename: download.suggestedFilename(),
    };
    note("d-pdf", pdf);
    expect(pdf.status).toBe(200);
    expect(pdf.contentType ?? "").toMatch(/^application\/pdf/u);
    expect(pdf.firstBytes.startsWith("%PDF-")).toBe(true);
    expect(pdf.size).toBeGreaterThan(1000);
    expect(pdf.suggestedFilename).toBe(`agenda-${weekStart}.pdf`);
    expect(boxes.length).toBeGreaterThan(0);
    for (const box of boxes) expect(box.width).toBeGreaterThan(box.height);
    expect(pdf.rotate.filter((value) => !/\s0$/u.test(value) && !/\s180$/u.test(value))).toEqual(
      [],
    );

    // The mobile sheet shows D12's change after a reload (both directions, one contract).
    const berta = await clubsSession(browser, theScene().instructorA, "/instructor/dia");
    await open21(berta.page, classId);
    const reloaded = await reload21(berta, classId);
    expect(rowOf(reloaded, cast.marti.dog).state).toBe("PRESENT");
    await expectCircles(berta.page, "ca", { [names.marti]: "PRESENT" });
    note("d-agenda", {
      blocks: blocks.length,
      cell: {
        booked: cell.booked,
        capacity: cell.capacity,
        state: cell.state,
        waiting: cell.waiting,
      },
      saved: { items: 1, status: saved.status(), version: savedSheet.sheet.version },
      trainingSlotMinutes: week.trainingSlotMinutes ?? null,
      trainings: trainings.length,
    });
  });

  test("T-10-28 T-10-15 (f) 26 → D13 → 13 · a task with a real signed upload, edited, done and reopened; D13 shows it with the counters; Rita sees it on her screens, completes it as a member, and no /me answer carries DOG_OBSERVATIONS", async ({
    browser,
  }) => {
    test.setTimeout(420_000);
    const { melId } = theScene();
    const berta = await clubsSession(browser, theScene().instructorA, "/instructor/dia");
    const { page } = berta;
    const taskText = `Salts curts amb recompensa al final (E6 ${runId}, text fictici).`;
    const editedText = `Salts curts amb recompensa al final, tres cops al dia (E6 ${runId}, text fictici).`;
    const fileName = `e6-${runId}.jpg`;
    const fileBytes = Buffer.from(`fictional task attachment ${runId}`);
    await openAndRead<TaskList>(
      page,
      `/instructor/alumnes/${melId}/tasques`,
      "/instructor/dia",
      isCall("GET", /\/api\/v1\/tasks$/u),
    );
    await expect(page.getByRole("heading", { level: 1 })).toContainText(theScene().names.rita);
    await page.getByRole("button", { exact: true, name: "Afegir" }).click();
    const form = page.getByRole("form", { name: "Nova tasca" });
    await form.getByLabel("Text de la tasca nova").fill(taskText);
    await form.locator('input[type="file"]').setInputFiles({
      buffer: fileBytes,
      mimeType: "image/jpeg",
      name: fileName,
    });
    await expect(form.locator(".ah-attachment-chip")).toContainText(fileName);
    // The real signed-url flow: `POST /attachments/upload-url`, the `PUT` of the file to the
    // storage's url, then `POST /tasks` with its `fileKey` (CONVENCIONS_API §5, R-10-11).
    const puts: { status: number; url: string }[] = [];
    page.on("response", (response) => {
      if (response.request().method() === "PUT") {
        puts.push({ status: response.status(), url: response.url() });
      }
    });
    const signing = page.waitForResponse(isCall("POST", /\/api\/v1\/attachments\/upload-url$/u));
    const creating = page.waitForResponse(isCall("POST", /\/api\/v1\/tasks$/u));
    await form.getByRole("button", { exact: true, name: "Afegeix" }).click();
    const signed = await signing;
    expect(signed.status()).toBeLessThan(300);
    const grant = (await signed.json()) as UploadUrl;
    const created = await creating;
    expect(created.status()).toBe(201);
    // Only the url's host and path go to the evidence (its query carries the signature).
    const target = new URL(grant.uploadUrl, page.url());
    const upload = puts.find((item) => {
      const url = new URL(item.url);
      return url.host === target.host && url.pathname === target.pathname;
    });
    note("f-upload", {
      grant: {
        absolute: /^[a-z][a-z0-9+.-]*:/iu.test(grant.uploadUrl),
        host: target.host,
        path: target.pathname.split("/").slice(0, 4).join("/"),
      },
      puts: puts.map((item) => ({
        host: new URL(item.url).host,
        path: new URL(item.url).pathname.split("/").slice(0, 4).join("/"),
        status: item.status,
      })),
    });
    expect(upload?.status ?? 0).toBeGreaterThanOrEqual(200);
    expect(upload?.status ?? 0).toBeLessThan(300);
    const task = (await created.json()) as Task;
    remember("taskA", task.id);
    expect(task.attachments.map((item) => item.name)).toEqual([fileName]);
    // The grant's length on the core's clock (the task's `createdAt`); the browser's clock is the
    // real one, days behind the test clock.
    const grantMinutes = (Date.parse(grant.expiresAt) - Date.parse(task.createdAt)) / 60_000;
    const item = page
      .locator("li.ah-task")
      .filter({ has: page.locator(".ah-attachment-chip", { hasText: fileName }) });
    await expect(item).toHaveCount(1);
    await expect(item.locator(".ah-task__text")).toHaveText(taskText);

    // The pencil: the text, with the version the edit opened at.
    await item.getByRole("button", { exact: true, name: "Edita la tasca" }).click();
    await item.getByLabel("Text de la tasca").fill(editedText);
    const patching = page.waitForResponse(isCall("PATCH", /\/api\/v1\/tasks\/[^/]+$/u));
    await item.getByRole("button", { exact: true, name: "Desa" }).click();
    expect((await patching).status()).toBe(200);
    await expect(item.locator(".ah-task__text")).toHaveText(editedText);

    // Done, then pending again.
    const completing = page.waitForResponse(
      isCall("POST", /\/api\/v1\/tasks\/[^/]+\/completion$/u),
    );
    await item.getByRole("button", { exact: true, name: "Marca-la com a feta" }).click();
    expect((await completing).status()).toBe(200);
    await expect(item.locator(".ah-badge").first()).toHaveText("feta");
    await expect(item.locator(".ah-task__meta")).toContainText(/feta per (?:la |el |l’|l')?\S/u);
    const reopening = page.waitForResponse(isCall("POST", /\/api\/v1\/tasks\/[^/]+\/reopening$/u));
    await item.getByRole("button", { exact: true, name: "Torna-la a pendent" }).click();
    expect((await reopening).status()).toBe(200);
    await expect(item.locator(".ah-badge").first()).toHaveText("pendent");

    // The clip opens a fresh signed url (R-10-11) in a new tab.
    const fresh = page.waitForResponse(isCall("GET", /\/api\/v1\/attachments$/u));
    const popupOpened = page.context().waitForEvent("page");
    await item.locator(".ah-task__meta .ah-attachment-chip__open").click();
    const freshAnswer = await fresh;
    expect(freshAnswer.status()).toBe(200);
    const freshUrl = ((await freshAnswer.json()) as AttachmentList).items.find(
      (entry) => entry.name === fileName,
    )?.url;
    const popup = await popupOpened;
    const popupUrl = new URL(
      popup.url() === "about:blank" ? (freshUrl ?? "about:blank") : popup.url(),
    );
    await popup.close();
    // The file behind that signed url is the one uploaded (read from the page, no bearer).
    const opened =
      freshUrl === undefined
        ? null
        : await page.evaluate(async (url) => {
            const response = await fetch(url);
            return { size: (await response.arrayBuffer()).byteLength, status: response.status };
          }, freshUrl);
    expect(opened).toEqual({ size: fileBytes.byteLength, status: 200 });
    await shot(page, "26-tasques-core-375.png");

    // D13 (1280): the same task with its clip, and the counters, on the record and in the drawer.
    const desk = await adminSession(browser, theScene().instructorA);
    const card = await openAndRead<InstructorCard>(
      desk.page,
      `/alumnes/${melId}`,
      "/agenda",
      isCall("GET", /\/api\/v1\/dogs\/[^/]+\/instructor-card$/u),
    );
    const recordTask = desk.page
      .locator(".student-record__tasks li")
      .filter({ hasText: editedText });
    await expect(recordTask).toHaveCount(1);
    await expect(recordTask.locator("svg.ah-icon")).toHaveCount(1);
    const head = desk.page.locator(".student-record__block-head");
    expect(card.tasks).toMatchObject({ doneCount: 1, pendingCount: 2 });
    await expect(head).toContainText(pendingLabel(card.tasks?.pendingCount ?? -1));
    await expect(head).toContainText(doneLabel(card.tasks?.doneCount ?? -1));
    await shot(desk.page, "D13-fitxa-core-1280.png");
    await desk.page.getByRole("button", { name: "Gestionar tasques i notes" }).click();
    const drawer = desk.page.getByRole("dialog", { name: "Gestionar tasques i notes" });
    const drawerTask = drawer
      .locator("li.ah-task")
      .filter({ has: desk.page.locator(".ah-attachment-chip", { hasText: fileName }) });
    await expect(drawerTask.locator(".ah-task__text")).toHaveText(editedText);
    await shotOf(drawer, desk.page, "D13-calaix-core-1280.png");
    await drawer.getByRole("button", { name: "Tanca" }).first().click();

    // Rita (375): the task on 13 with its attachment; the file itself opens through her own read.
    const meBodies: { body: string; path: string }[] = [];
    const rita = await clubsSession(browser, RITA, "/inici");
    rita.page.on("response", (response) => {
      const path = apiPath(response);
      if (!path.startsWith("/api/v1/me")) return;
      void response
        .text()
        .then((body) => meBodies.push({ body, path }))
        .catch(() => undefined);
    });
    const dogs = await openAndRead<MeDogs>(
      rita.page,
      "/gossos",
      "/inici",
      isCall("GET", /\/api\/v1\/me\/dogs$/u),
    );
    const meDog = dogs.dogs.find((dog) => dog.id === melId);
    const meTask = meDog?.tasks?.items.find((entry) => entry.id === task.id);
    expect(meTask).toMatchObject({ attachmentsCount: 1, text: editedText });
    const dogTask = rita.page.locator("li.dog-task").filter({ hasText: editedText });
    await expect(dogTask).toHaveCount(1);
    await expect(dogTask).toContainText("1 adjunt");
    const memberAttachments = await call<ApiProblem & Partial<AttachmentList>>(
      rita,
      `/attachments?entityType=TASK&entityId=${task.id}`,
    );
    const memberItems =
      memberAttachments.status === 200 ? (memberAttachments.body.items ?? []) : [];
    const memberUrl = memberItems.find((entry) => entry.name === fileName)?.url;
    const memberFile =
      memberUrl === undefined
        ? null
        : await rita.page.evaluate(async (url) => {
            const response = await fetch(url);
            return { size: (await response.arrayBuffer()).byteLength, status: response.status };
          }, memberUrl);
    // Her other screens read `/me/*` too: none carries the private observations (R-10-12).
    await openAndRead<MemberHistory>(
      rita.page,
      "/historic",
      "/inici",
      isCall("GET", /\/api\/v1\/me\/history$/u),
    );
    await openAndRead<unknown>(
      rita.page,
      "/inici",
      "/gossos",
      isCall("GET", /\/api\/v1\/me\/home$/u),
    );
    await expect.poll(() => meBodies.length).toBeGreaterThanOrEqual(3);
    const leaks = meBodies
      .filter(({ body }) => body.includes("DOG_OBSERVATIONS") || body.includes(OBSERVATION_TEXT))
      .map(({ path }) => path);
    note("f-tasks", {
      attachmentGrantMinutes: Math.round(grantMinutes * 10) / 10,
      d13: { tasks: card.tasks },
      member: {
        attachments: {
          code: memberAttachments.body.code ?? null,
          count: memberItems.length,
          status: memberAttachments.status,
        },
        file: memberFile,
        meDogTask: meTask ?? null,
        meResponses: [...new Set(meBodies.map(({ path }) => path))],
        observationLeaks: leaks,
      },
      popup: { host: popupUrl.host, path: popupUrl.pathname.split("/").slice(0, 3).join("/") },
      task: { attachments: task.attachments.length, created: created.status(), id: task.id },
    });
    expect(leaks).toEqual([]);
    expect(memberAttachments.status).toBe(200);
    expect(memberFile).toEqual({ size: fileBytes.byteLength, status: 200 });

    // Step 0b (R-10-10): Rita completes the task on 13 and D13 says who did it.
    await openAndRead<MeDogs>(
      rita.page,
      "/gossos",
      "/inici",
      isCall("GET", /\/api\/v1\/me\/dogs$/u),
    );
    const check = rita.page.getByRole("checkbox", { name: editedText });
    await expect(check).toHaveAttribute("aria-checked", "false");
    const memberCompleting = rita.page.waitForResponse(
      isCall("POST", new RegExp(`/api/v1/tasks/${task.id}/completion$`, "u")),
    );
    await check.click();
    const memberCompleted = await memberCompleting;
    expect(memberCompleted.status()).toBe(200);
    const doneTask = (await memberCompleted.json()) as Task;
    expect(doneTask.state).toBe("DONE");
    expect(doneTask.doneBy?.role).toBe("MEMBER");
    await expect(check).toHaveAttribute("aria-checked", "true");
    const doneByRita = new RegExp(
      `feta per (?:la |el |l'|l’)?${escapeRegExp(cast.rita.name)}\\b`,
      "u",
    );
    await expect(dogTask).toContainText(doneByRita);
    const recordAgain = await openAndRead<InstructorCard>(
      desk.page,
      `/alumnes/${melId}`,
      "/agenda",
      isCall("GET", /\/api\/v1\/dogs\/[^/]+\/instructor-card$/u),
    );
    expect(recordAgain.tasks).toMatchObject({ doneCount: 2, pendingCount: 1 });
    await desk.page.getByRole("button", { name: "Gestionar tasques i notes" }).click();
    const doneInDrawer = desk.page
      .getByRole("dialog", { name: "Gestionar tasques i notes" })
      .locator("li.ah-task")
      .filter({ hasText: editedText });
    await expect(doneInDrawer.locator(".ah-task__meta")).toContainText(doneByRita);
    note("f-member-completion", {
      d13: recordAgain.tasks,
      doneBy: {
        displayName: doneTask.doneBy?.displayName ?? null,
        role: doneTask.doneBy?.role ?? null,
      },
      status: memberCompleted.status(),
    });
  });

  test("T-10-30 T-10-18 (h) D14 · per-account unread marks: instructor A reads the member's note, unread for instructor B too, and then everything; B still has them unread (the note after A's read as well), never the task she wrote; D14's filter values and search on the core", async ({
    browser,
  }) => {
    test.setTimeout(420_000);
    const { melId } = theScene();
    // Instructor B writes a task on Mel (her own: never unread for her).
    const otherMobile = await clubsSession(browser, theScene().instructorB, "/instructor/dia");
    const created = await call<Task>(otherMobile, "/tasks", "POST", {
      dogId: melId,
      text: `Treball de quiets a la taula (E6 ${runId}, instructora B, text fictici).`,
    } satisfies Schemas["TaskCreateRequest"]);
    expect(created.status).toBe(201);
    remember("taskB", created.body.id);
    const bBefore = await call<UnreadCount>(otherMobile, "/followup/unread-count");
    // B's own marks, read with her bearer (R-10-13: `readItemIds` and `readAllAt` are per account).
    const bUnread = async (id: string): Promise<boolean | null> => {
      const answer = await call<FollowupPage>(otherMobile, "/followup?page=0&size=50");
      expect(answer.status).toBe(200);
      return answer.body.items.find((row) => row.id === id)?.unread ?? null;
    };
    // E6-W04 review #2: A reads a row B has unread too — the member's note on Mel (written by Rita,
    // so `author ≠ me` for both) —, never B's own task, which is never unread for B.
    const bList = await call<FollowupPage>(otherMobile, "/followup?page=0&size=50");
    expect(bList.status).toBe(200);
    const noteForB = bList.body.items.find(
      (row) => row.dogId === melId && row.kind === "MEMBER_NOTE",
    );
    if (noteForB === undefined) throw new Error("B's follow-up has no member note on Mel");
    const bNoteBefore = noteForB.unread ?? null;
    expect(bNoteBefore).toBe(true);

    const desk = await adminSession(browser, theScene().instructorA);
    const { page } = desk;
    const list = await openAndRead<FollowupPage>(page, "/seguiment", "/agenda", isFollowupList);
    // The shell reads its counter on load, on focus and every 60 s: the session was opened in (d),
    // before the two new tasks, so the window's focus reads it again (as a returning user does).
    const aBefore = await refocusUnread(page);
    const melRows = list.items.filter((row) => row.dogId === melId);
    note("h-list-a", {
      rows: list.items.map((row) => ({
        kind: row.kind ?? null,
        mel: row.dogId === melId,
        unread: row.unread ?? null,
      })),
      totalItems: list.totalItems,
    });
    const noteRow = melRows.find((row) => row.kind === "MEMBER_NOTE");
    if (noteRow === undefined) throw new Error("D14 does not list the member's note on Mel");
    expect(noteRow.id).toBe(noteForB.id);
    expect(noteRow.unread).toBe(true);
    expect(melRows.filter((row) => row.kind === "TASK").length).toBeGreaterThanOrEqual(2);
    const taskBRow = list.items.find((row) => row.taskId === created.body.id);
    if (taskBRow === undefined) throw new Error("D14 does not list instructor B's task");
    expect(taskBRow.unread).toBe(true);
    expect(aBefore).toBeGreaterThan(0);
    await expect(page.locator(".followup__title .ah-badge")).toHaveText(
      aBefore === 1 ? "1 pendent de llegir" : `${String(aBefore)} pendents de llegir`,
    );
    await expect(
      page.locator('a.ah-sidebar__entry[href="/seguiment"] .ah-sidebar__count'),
    ).toHaveText(String(aBefore));
    const unreadRows = page.locator("tbody tr.followup__row--unread");
    await expect(unreadRows).toHaveCount(list.items.filter((row) => row.unread === true).length);
    await expect(page.getByText(MEMBER_NOTE_TEXT.slice(0, 40))).toBeVisible();
    await shot(page, "D14-seguiment-core-1280.png");

    // A reads the note's row: its read goes to the api, the counter drops and D13 opens.
    const noteLine = page.locator(`tbody tr[data-followup-id="${noteRow.id}"]`);
    await expect(noteLine).toHaveAttribute("data-unread", "true");
    const reading = page.waitForResponse(
      isCall("POST", new RegExp(`/api/v1/followup/${escapeRegExp(noteRow.id)}/read$`, "u")),
    );
    await noteLine.getByRole("link").first().click();
    expect((await reading).status()).toBeLessThan(300);
    await page.waitForURL(`**/alumnes/${melId}`);
    await expect
      .poll(async () => (await call<UnreadCount>(desk, "/followup/unread-count")).body.count)
      .toBe(aBefore - 1);
    const back = await openAndRead<FollowupPage>(page, "/seguiment", "/agenda", isFollowupList);
    expect(back.items.find((row) => row.id === noteRow.id)?.unread).toBe(false);
    // Only that row: B's task is still unread for A until the read-all.
    expect(back.items.find((row) => row.id === taskBRow.id)?.unread).toBe(true);
    await expect(noteLine).toHaveAttribute("data-unread", "false");
    await expect(noteLine).not.toHaveClass(/followup__row--unread/u);
    await expect(page.locator(".followup__title .ah-badge")).toContainText(String(aBefore - 1));
    // A's read is A's: the same row is still unread for B, before A's read-all.
    const bNoteAfterRead = await bUnread(noteRow.id);
    expect(bNoteAfterRead).toBe(true);

    // «Marcar-ho tot com a llegit» → 0.
    const readingAll = page.waitForResponse(isCall("POST", /\/api\/v1\/followup\/read-all$/u));
    await page.getByRole("button", { name: "Marcar-ho tot com a llegit" }).click();
    expect((await readingAll).status()).toBeLessThan(300);
    await expect(page.locator(".followup__title .ah-badge")).toHaveText("0 pendents de llegir");
    await expect(unreadRows).toHaveCount(0);
    const aAfter = (await call<UnreadCount>(desk, "/followup/unread-count")).body.count;
    expect(aAfter).toBe(0);

    // Instructor B (1280): her marks are hers (R-10-13).
    const other = await adminSession(browser, theScene().instructorB);
    const otherList = await openAndRead<FollowupPage>(
      other.page,
      "/seguiment",
      "/agenda",
      isFollowupList,
    );
    const bAfter = await refocusUnread(other.page);
    expect(bAfter).toBe(bBefore.body.count);
    expect(bAfter).toBeGreaterThan(0);
    const ownRow = otherList.items.find((row) => row.taskId === created.body.id);
    expect(ownRow?.unread).toBe(false);
    const bNoteAfterReadAll = otherList.items.find((row) => row.id === noteRow.id)?.unread ?? null;
    expect(bNoteAfterReadAll).toBe(true);
    const stillUnread = otherList.items.filter(
      (row) => row.dogId === melId && row.id !== ownRow?.id,
    );
    for (const row of stillUnread) expect(row.unread, row.id).toBe(true);
    await expect(other.page.locator(`tbody tr[data-followup-id="${noteRow.id}"]`)).toHaveAttribute(
      "data-unread",
      "true",
    );
    await expect(other.page.locator(".followup__title .ah-badge")).toContainText(String(bAfter));
    note("h-unread", {
      a: {
        after: aAfter,
        afterOneRead: aBefore - 1,
        before: aBefore,
        readRow: noteRow.kind ?? null,
      },
      b: {
        after: bAfter,
        before: bBefore.body.count,
        note: { afterARead: bNoteAfterRead, afterAReadAll: bNoteAfterReadAll, before: bNoteBefore },
        ownTaskUnread: ownRow?.unread ?? null,
      },
      rows: list.items.map((row: FollowupItem) => ({
        author: row.authorName ?? null,
        kind: row.kind ?? null,
        unread: row.unread ?? null,
      })),
    });

    // E6-W04 review #7, on B's D14: the filter menu's «Creador» values come from
    // `GET /followup/filter-values` (E75), each counted over the whole set; the search box sends
    // `q`, which reaches the tasks' text (the run's two tasks carry its id).
    const otherPage = other.page;
    const valuesOf = (field: string, q: null | string) => (response: Response) => {
      const params = new URL(response.url()).searchParams;
      return (
        isCall("GET", /\/api\/v1\/followup\/filter-values$/u)(response) &&
        params.get("field") === field &&
        params.get("q") === q
      );
    };
    // The menu's selects are named by their wrapping label plus the option they show («Columna
    // Tipus»), hence the names' starts.
    await otherPage.locator(".ah-universal-list__filter-menu > summary").click();
    const valuesRead = otherPage.waitForResponse(valuesOf("authorAccountId", null));
    await otherPage.getByRole("combobox", { name: /^Columna\b/u }).selectOption("authorAccountId");
    const valuesAnswer = await valuesRead;
    expect(valuesAnswer.status()).toBe(200);
    const authorValues = (await valuesAnswer.json()) as FilterValues;
    const countOf = (values: FilterValues) =>
      values.values.reduce((sum, value) => sum + value.count, 0);
    expect(authorValues.field).toBe("authorAccountId");
    expect(authorValues.values.map((value) => value.label)).toEqual(
      expect.arrayContaining([...new Set(otherList.items.map((row) => row.authorName ?? ""))]),
    );
    expect(countOf(authorValues)).toBe(otherList.totalItems);
    const valueSelect = otherPage.getByRole("combobox", { name: /^Valor\b/u });
    for (const value of authorValues.values) {
      const option = `${value.label} (${String(value.count)})`;
      await expect(
        valueSelect.locator("option", { hasText: new RegExp(`^${escapeRegExp(option)}$`, "u") }),
      ).toHaveCount(1);
    }
    const searching = otherPage.waitForResponse(
      (response) =>
        isFollowupList(response) && new URL(response.url()).searchParams.get("q") === runId,
    );
    const narrowing = otherPage.waitForResponse(valuesOf("authorAccountId", runId));
    await otherPage.getByRole("searchbox", { name: "Cerca al seguiment" }).fill(runId);
    const searchAnswer = await searching;
    expect(searchAnswer.status()).toBe(200);
    const searched = (await searchAnswer.json()) as FollowupPage;
    expect(searched.items.map((row) => row.taskId ?? row.id).sort()).toEqual(
      [readRecord().created.taskA ?? "(f) created no task", created.body.id].sort(),
    );
    await expect(otherPage.locator("tbody tr[data-followup-id]")).toHaveCount(2);
    const narrowedAnswer = await narrowing;
    expect(narrowedAnswer.status()).toBe(200);
    const narrowed = (await narrowedAnswer.json()) as FilterValues;
    expect(countOf(narrowed)).toBe(2);
    note("h-d14-reads", {
      filterValues: {
        field: authorValues.field,
        status: valuesAnswer.status(),
        sumOfCounts: countOf(authorValues),
        totalItems: otherList.totalItems,
        values: authorValues.values.map((value) => ({ count: value.count, label: value.label })),
      },
      search: {
        narrowedValues: narrowed.values.map((value) => ({
          count: value.count,
          label: value.label,
        })),
        rows: searched.items.map((row) => row.kind ?? null),
        status: searchAnswer.status(),
        totalItems: searched.totalItems,
      },
    });
  });

  /**
   * Step 5: S10's refusals that no screen sends, answered by the core itself: each must carry its
   * code with the status S10 §2 documents (422 for the rules; `MEMBER → 403` on the card). None of
   * them changes anything.
   */
  test("T-10-02 T-10-15 T-10-22 E6-W04 step 5 · the core's statuses for ATTENDANCE_NOTIFIED_FINAL, TASK_ALREADY_DONE (a second completion), TASK_NOT_DONE and a member's read of the instructor card", async ({
    browser,
  }) => {
    test.setTimeout(300_000);
    const { classId, melId } = theScene();
    const berta = await clubsSession(browser, theScene().instructorA, "/instructor/dia");
    const sheet = await readSheet(berta, classId);
    const tasks = await call<TaskList>(berta, `/tasks?dogId=${melId}&includeDone=true`);
    expect(tasks.status).toBe(200);
    const done = tasks.body.items.find((task) => task.state === "DONE");
    const pending = tasks.body.items.find((task) => task.state === "PENDING");
    if (done === undefined || pending === undefined) {
      throw new Error("Mel has no done or no pending task to probe with");
    }
    const probe = async (session: Session, path: string, method: string, body?: unknown) => {
      const answer = await call(session, path, method, body);
      return { code: answer.body.code ?? null, status: answer.status };
    };
    const rita = await clubsSession(browser, RITA, "/inici");
    const observed = {
      // R-10-03: a saved «ha avisat» is final (T-10-02).
      notifiedFinal: await probe(berta, `/class-sessions/${classId}/attendance`, "PUT", {
        items: [{ bookingId: rowOf(sheet, cast.alba.dog).bookingId, state: "PRESENT" }],
        version: sheet.sheet.version,
      } satisfies Schemas["AttendanceSaveRequest"]),
      taskAlreadyDone: await probe(berta, `/tasks/${done.id}/completion`, "POST", {}),
      taskNotDone: await probe(berta, `/tasks/${pending.id}/reopening`, "POST", {}),
      // `GET /dogs/{id}/instructor-card`: «MEMBER → 403» (the observations never reach a member).
      memberCard: await probe(rita, `/dogs/${melId}/instructor-card`, "GET"),
    };
    const after = await readSheet(berta, classId);
    note("step5-statuses", observed);
    expect(after.sheet.version).toBe(sheet.sheet.version);
    expect(observed).toEqual({
      memberCard: { code: "FORBIDDEN", status: 403 },
      notifiedFinal: { code: "ATTENDANCE_NOTIFIED_FINAL", status: 422 },
      taskAlreadyDone: { code: "TASK_ALREADY_DONE", status: 422 },
      taskNotDone: { code: "TASK_NOT_DONE", status: 422 },
    });
  });

  /**
   * E6-W04 review #3 (E7-W03 step 0e): the other S10 codes that moved to 422 and one call reaches,
   * and `IMPERSONATION_DENIED`. Every probe is refused, so nothing changes; the one parameter a
   * probe needs (`bookings.instructorLastMinuteNotice`) goes back to its value, even on a failure.
   * `ATTENDANCE_WINDOW_CLOSED` needs Wednesday's clock: the last test.
   */
  test("T-10-01 T-10-11 T-10-22 E6-W04 review #3 · the core's statuses for ATTENDANCE_NOT_OPEN (Tuesday's class), ATTENDANCE_BOOKING_NOT_ACTIVE (a late-cancelled booking, as ADMIN), INSTRUCTOR_NOTICE_DISABLED (the parameter off) and IMPERSONATION_DENIED (an impersonated GET /instructor/day and GET /followup)", async ({
    browser,
  }) => {
    test.setTimeout(420_000);
    const { classId, melId } = theScene();
    const admin = await adminSession(browser);
    const berta = await clubsSession(browser, theScene().instructorA, "/instructor/dia");
    const rita = await clubsSession(browser, RITA, "/inici");
    const observed: Record<string, unknown> = {};
    // Each answer goes to the registry at once: a later failure keeps the earlier ones.
    const record = (key: string, value: unknown) => {
      observed[key] = value;
      note("review3-statuses", observed);
    };

    // R-10-03: before `T0` (00:00 of the class's day) an instructor cannot mark: Tuesday's class
    // at Monday 04:00.
    const tuesday = await classWithPendingRow(admin, berta, addDays(weekStart, 1));
    if (tuesday === undefined) throw new Error("No Tuesday class of week 0 has a pending row");
    const notOpen = await call(berta, `/class-sessions/${tuesday.classId}/attendance`, "PUT", {
      items: [{ bookingId: tuesday.row.bookingId, state: "PRESENT" }],
      version: tuesday.version,
    } satisfies Schemas["AttendanceSaveRequest"]);
    record("notOpen", { ...refusal(notOpen), canMarkPresence: tuesday.canMarkPresence });
    expect((await readSheet(berta, tuesday.classId)).sheet.version).toBe(tuesday.version);

    // R-10-04 (3): a booking neither live nor NOTIFIED — the seed's late cancellation of Mel
    // (`CANCELLED_LATE` on 25) — on its own class, as ADMIN (never outside the window).
    const history = await call<MemberHistory>(rita, `/me/history?dogId=${melId}`);
    expect(history.status).toBe(200);
    const late = history.body.items.find(
      (item) => item.type === "CLASS" && item.state === "CANCELLED_LATE",
    );
    if (late === undefined) throw new Error("Rita's history has no late cancellation of Mel");
    const booking = await call<Partial<Pick<Schemas["Booking"], "classSessionId" | "state">>>(
      admin,
      `/bookings/${late.id}`,
    );
    expect(booking.status).toBe(200);
    const lateClassId = booking.body.classSessionId ?? "";
    const lateSheet = await readSheet(admin, lateClassId);
    const notActive = await call(admin, `/class-sessions/${lateClassId}/attendance`, "PUT", {
      items: [{ bookingId: late.id, state: "PRESENT" }],
      version: lateSheet.sheet.version,
    } satisfies Schemas["AttendanceSaveRequest"]);
    record("bookingNotActive", {
      ...refusal(notActive),
      bookingState: booking.body.state ?? null,
      detailIsTheBooking: notActive.body.details?.bookingId === late.id,
      inSheet: lateSheet.rows.some((row) => row.bookingId === late.id),
    });
    expect((await readSheet(admin, lateClassId)).sheet.version).toBe(lateSheet.sheet.version);

    // R-10-03: «ha avisat» with `bookings.instructorLastMinuteNotice = false`, on another Monday
    // class (never the scenario's). The sheet must say so first (`canMarkNotice` reads the
    // parameter through the api's cache): a «ha avisat» the core still took would cancel a booking.
    const monday = await classWithPendingRow(admin, berta, weekStart);
    if (monday === undefined) throw new Error("No other Monday class of week 0 has a pending row");
    // With the parameter on, «ha avisat» is allowed on that sheet: the 422 is the parameter's.
    expect(monday.canMarkNotice).toBe(true);
    const key = "bookings.instructorLastMinuteNotice";
    const parameter = await call<Partial<Schemas["Parameter"]>>(admin, `/parameters/${key}`);
    expect(parameter.status).toBe(200);
    expect(parameter.body.value).toBe(true);
    const reason = `E7-W03 ${runId}: INSTRUCTOR_NOTICE_DISABLED probe (text fictici)`;
    const noticeAllowed = async () => (await readSheet(berta, monday.classId)).sheet.canMarkNotice;
    const switched: Record<string, unknown> = { isOverride: parameter.body.isOverride ?? null };
    try {
      const off = await call<Partial<Schemas["Parameter"]>>(admin, `/parameters/${key}`, "PUT", {
        reason,
        value: false,
        version: parameter.body.version ?? 0,
      } satisfies Schemas["ParameterUpdate"]);
      switched.off = off.status;
      expect(off.status).toBe(200);
      await expect.poll(noticeAllowed, { timeout: 90_000 }).toBe(false);
      const sheet = await readSheet(berta, monday.classId);
      const disabled = await call(berta, `/class-sessions/${monday.classId}/attendance`, "PUT", {
        items: [{ bookingId: monday.row.bookingId, state: "NOTIFIED" }],
        version: sheet.sheet.version,
      } satisfies Schemas["AttendanceSaveRequest"]);
      record("noticeDisabled", refusal(disabled));
      expect((await readSheet(berta, monday.classId)).sheet.version).toBe(sheet.sheet.version);
    } finally {
      const latest = await call<Partial<Schemas["Parameter"]>>(admin, `/parameters/${key}`);
      if (latest.body.value !== parameter.body.value) {
        // Back to the club's own value: the override removed when there was none before.
        const restored =
          parameter.body.isOverride === true
            ? await call(admin, `/parameters/${key}`, "PUT", {
                reason,
                value: parameter.body.value,
                version: latest.body.version ?? 0,
              } satisfies Schemas["ParameterUpdate"])
            : await call(admin, `/parameters/${key}`, "DELETE");
        switched.restored = restored.status;
      }
      note("review3-parameter", switched);
    }
    await expect.poll(noticeAllowed, { timeout: 90_000 }).toBe(true);
    expect(
      (await call<Partial<Schemas["Parameter"]>>(admin, `/parameters/${key}`)).body.value,
    ).toBe(true);

    // T-10-22: a token of «Entra com l'abonat» (S01 R-01-09) for Rita on the instructor endpoints,
    // sent from the club app as the handoff's session would; `/me` answers it (the token works).
    // The token stays in memory, never in the evidence.
    const memberId = rowOf(await readSheet(admin, classId), cast.rita.dog).memberId;
    const grant = await call<Partial<Schemas["ImpersonationTokenResponse"]>>(
      admin,
      `/members/${memberId}/impersonation-token`,
      "POST",
      {
        reason: `E7-W03 ${runId}: IMPERSONATION_DENIED probe (text fictici)`,
      } satisfies Schemas["ImpersonationRequest"],
    );
    expect(grant.status).toBe(201);
    const token = grant.body.token ?? "";
    const impersonated: Session = {
      bearer: () => `Bearer ${token}`,
      context: rita.context,
      page: rita.page,
    };
    record("impersonationGrant", grant.status);
    record("impersonatedMe", (await call(impersonated, "/me")).status);
    record(
      "impersonatedDay",
      refusal(await call(impersonated, `/instructor/day?date=${weekStart}`)),
    );
    record("impersonatedFollowup", refusal(await call(impersonated, "/followup?page=0&size=20")));
    expect(observed).toMatchObject({
      bookingNotActive: {
        code: "ATTENDANCE_BOOKING_NOT_ACTIVE",
        detailIsTheBooking: true,
        status: 422,
      },
      impersonatedDay: { code: "IMPERSONATION_DENIED", status: 403 },
      impersonatedFollowup: { code: "IMPERSONATION_DENIED", status: 403 },
      impersonatedMe: 200,
      noticeDisabled: { code: "INSTRUCTOR_NOTICE_DISABLED", status: 422 },
      notOpen: { canMarkPresence: false, code: "ATTENDANCE_NOT_OPEN", status: 422 },
    });
  });
});

test("(e) P8 at 09:46 from D11: the dry run plans the class and the waiting entry and writes nothing; the run finishes it, the sheet stays markable and the entry leaves the waitlist", async ({
  browser,
}) => {
  test.setTimeout(420_000);
  const { classId, entryId } = theScene();
  expect((await setCoreClock(browser, instants.finished)).status).toBe(200);
  const admin = await adminSession(browser);
  await navigateSpa(admin.page, "/parametres#processos");
  const before = await readSheet(admin, classId);
  expect(before.classSession.state).toBe("ACTIVE");
  const entryBefore = before.waitlist?.entries.find((item) => item.entryId === entryId)?.state;

  const plan = await runJob(admin, "class-finishing", "Tancament de classes", true);
  expect(plan.dryRun).toBe(true);
  const planIds = plan.effects.items.map((item) => item.entityId);
  expect(planIds).toContain(classId);
  expect(planIds).toContain(entryId);
  const dialog = admin.page.getByRole("dialog", {
    name: "Simulació: què faria ara · Tancament de classes",
  });
  await expect(dialog.getByText("Simulació: no s'ha aplicat cap canvi.")).toBeVisible();
  await expect(dialog).toContainText(classId);
  await expect(dialog).toContainText(entryId);
  await dialog.getByRole("button", { name: "Tanca" }).first().click();
  // R-15-08: a dry run writes nothing.
  const afterPlan = await readSheet(admin, classId);
  expect(afterPlan.classSession.state).toBe("ACTIVE");
  expect(afterPlan.waitlist?.entries.find((item) => item.entryId === entryId)?.state).toBe(
    entryBefore,
  );

  const run = await runJob(admin, "class-finishing", "Tancament de classes", false);
  expect(run).toMatchObject({ dryRun: false, status: "SUCCEEDED" });
  expect(run.effects.items.map(itemKey).sort()).toEqual(plan.effects.items.map(itemKey).sort());
  const finished = await readSheet(admin, classId);
  expect(finished.classSession.state).toBe("FINISHED");
  const entryAfter = await call<ApiProblem & Partial<WaitlistEntry>>(
    admin,
    `/waitlist-entries/${entryId}`,
  );

  // The sheet is still markable until T1 (R-10-03), and Iu is gone from its waitlist block.
  const berta = await clubsSession(browser, theScene().instructorA, "/instructor/dia");
  const sheet = await open21(berta.page, classId);
  expect(sheet.classSession.state).toBe("FINISHED");
  expect(sheet.sheet.canMarkPresence).toBe(true);
  expect(
    sheet.waitlist?.entries.some(
      (item) => item.entryId === entryId && ["ACTIVE", "NOTIFIED"].includes(item.state),
    ) ?? false,
  ).toBe(false);
  await expect(circle(berta.page, "ca", theScene().names.rita, sheetText.ca.pending)).toBeEnabled();
  await expect(berta.page.locator(".instructor-sheet__waitlist")).toHaveCount(
    (sheet.waitlist?.entries.length ?? 0) > 0 ? 1 : 0,
  );
  await expect(
    berta.page.locator(".instructor-sheet__waitlist li strong", { hasText: theScene().names.iu }),
  ).toHaveCount(0);

  // D12: the api's cell is FINISHED (whether D12 dims it is recorded: S10 R-10-15).
  const desk = await adminSession(browser, theScene().instructorA);
  const week = await openAndRead<InstructorWeek>(
    desk.page,
    `/agenda?setmana=${weekStart}`,
    "/seguiment",
    isCall("GET", /\/api\/v1\/instructor\/week$/u),
  );
  const cell = week.cells.find((item) => item.classId === classId);
  expect(cell?.state).toBe("FINISHED");
  const finishedCell = desk.page
    .getByRole("table", { name: /^Agenda de la setmana del /u })
    .locator("tbody tr")
    .filter({
      has: desk.page.locator("th", {
        hasText: new RegExp(`^${escapeRegExp(shortTime(cell?.time ?? "08:30"))}$`, "u"),
      }),
    })
    .locator("td.ah-schedule-grid__slot")
    .nth(0)
    .getByRole("button")
    .filter({ hasText: cell?.ringName ?? "" });
  await expect(finishedCell).toHaveCount(1);
  const finishedClasses = (await finishedCell.getAttribute("class")) ?? "";
  // R-10-15 dims FINISHED and CANCELLED classes (D12 dims a FINISHED one since E6-W04).
  expect(finishedClasses).toContain("ah-schedule-cell--muted");
  expect(finishedClasses).not.toContain("ah-schedule-cell--struck");
  // Counted once D12 has drawn the week (E6-W04 review #4): the finished cell is one of them.
  const dimmed = await desk.page.locator(".ah-schedule-cell--muted").count();
  expect(dimmed).toBeGreaterThanOrEqual(1);
  note("e-p8", {
    d12FinishedCellMuted: finishedClasses.includes("ah-schedule-cell--muted"),
    dimmedCellsOnD12: dimmed,
    entry: {
      after: entryAfter.body.state ?? `HTTP ${String(entryAfter.status)}`,
      before: entryBefore ?? null,
    },
    plan: {
      counters: plan.effects.counters,
      items: plan.effects.items.length,
      status: plan.status,
    },
    run: {
      counters: run.effects.counters,
      errors: run.errors,
      items: run.effects.items.length,
      status: run.status,
    },
    sheet: {
      canMarkPresence: sheet.sheet.canMarkPresence,
      editableUntil: sheet.sheet.editableUntil,
      state: sheet.classSession.state,
      waitlist: sheet.waitlist?.entries.map((item) => item.state) ?? [],
    },
  });
});

test("T-10-26 (e) P3 at Tuesday 08:00 from D11: Nil's row says «avís ja enviat», one N-19, and a second run sends nothing new", async ({
  browser,
}) => {
  test.setTimeout(420_000);
  const { classId, names } = theScene();
  expect((await setCoreClock(browser, instants.nextMorning)).status).toBe(200);
  const admin = await adminSession(browser);
  await navigateSpa(admin.page, "/parametres#processos");
  const mailboxBefore = mailboxFiles();
  const first = await runJob(admin, "no-show-notices", "Avisos de no presentat", false);
  expect(first).toMatchObject({ dryRun: false, status: "SUCCEEDED" });
  await expect
    .poll(
      async () => rowOf(await readSheet(admin, classId), cast.nil.dog).noShowNotice?.sentAt ?? null,
      {
        timeout: 60_000,
      },
    )
    .not.toBeNull();
  const afterFirst = newMessages(mailboxBefore);
  // N-19's e-mail (the core stored it as EMAIL SENT, `e6-notifications.json`): the message that
  // names Nil's dog or the class's date. Its date must be the class's, never «ahir» (R-10-06).
  const classDay = caDayMonth(weekStart);
  const flags = (message: MailMessage) => {
    const body = messageText(message);
    return {
      ...messageSummary(message),
      ahir: /\bahir\b/iu.test(body),
      classDay: body.includes(classDay),
      dog: body.includes(cast.nil.dog),
      member: body.includes(cast.nil.name),
      // N-19's title in the notification catalog (S11 §3).
      title: (message.subject ?? "").replaceAll("’", "'") === "T'hem trobat a faltar",
    };
  };
  const isN19 = (message: MailMessage) => {
    const found = flags(message);
    return found.title || found.dog || found.classDay;
  };
  const n19 = afterFirst.filter(isN19);
  const mailboxMiddle = mailboxFiles();
  const second = await runJob(admin, "no-show-notices", "Avisos de no presentat", false);
  expect(second.status).toBe("SUCCEEDED");
  const afterSecond = newMessages(mailboxMiddle);
  const card = admin.page.getByRole("region", { name: "Processos automàtics" });
  await shotOf(card, admin.page, "D11-processos-e6-core-1280.png");

  // 21: Nil's row now says the notice went (the `NotificationSent` consumer wrote `sentAt`).
  const berta = await clubsSession(browser, theScene().instructorA, "/instructor/dia");
  const sheet = await open21(berta.page, classId);
  expect(rowOf(sheet, cast.nil.dog).noShowNotice?.sentAt ?? null).not.toBeNull();
  await expect(sheetRow(berta.page, names.nil)).toContainText(sheetText.ca.alreadySent);
  note("e-p3", {
    first: {
      counters: first.effects.counters,
      errors: first.errors,
      items: first.effects.items.length,
    },
    mailbox: {
      afterFirst: afterFirst.map(flags),
      afterSecond: afterSecond.map(flags),
      classDay,
      n19: n19.length,
    },
    noShowNotice: rowOf(sheet, cast.nil.dog).noShowNotice ?? null,
    second: {
      counters: second.effects.counters,
      errors: second.errors,
      items: second.effects.items.length,
    },
  });
  // The second run has nothing left to send (the batch is idempotent; bin/e6-smoke proves the
  // outbox side api-side); the mailbox, when the stack delivers N-19 by e-mail, holds one.
  // T-15-16: «segona execució → 0».
  expect(first.effects.items.length).toBeGreaterThan(0);
  expect(second.effects.items).toEqual([]);
  expect(afterSecond.filter(isN19)).toEqual([]);
  // One N-19 e-mail (EMAIL is on for it, `e6-notifications.json`), with the class's whole date
  // (S11 T-11-33: «la data de la classe escrita sencera, mai “ahir”»).
  expect(n19.map(flags)).toEqual([expect.objectContaining({ ahir: false, classDay: true })]);
});

/** Screen 25's rows as the page draws them, checked against its own `GET /me/history`. */
async function checkHistory(
  page: Page,
  locale: Locale,
  melId: string,
): Promise<Record<string, unknown>> {
  const labels = historyText[locale];
  const history = await openAndRead<MemberHistory>(
    page,
    "/historic",
    "/inici",
    isCall("GET", /\/api\/v1\/me\/history$/u),
  );
  await expect(page.getByRole("heading", { level: 1, name: labels.title })).toBeVisible();
  const rows = page.locator(".history-screen__list > li");
  await expect(rows).toHaveCount(history.items.length);
  const rowAt = (item: HistoryItem) => rows.nth(history.items.indexOf(item));
  const mel = history.items.filter((item) => item.type === "CLASS" && item.dogId === melId);
  const find = (predicate: (item: HistoryItem) => boolean, what: string): HistoryItem => {
    const found = mel.find(predicate);
    if (found === undefined) throw new Error(`Rita's history has no ${what} row for Mel`);
    return found;
  };
  // The Monday class she was marked present in, the seeded no-show, the club's cancellation with
  // its quoted message, the late cancellation and her own in-time notice.
  const today = find((item) => item.date === weekStart, "week-0 Monday");
  expect(today.state).toBe("DONE");
  await expect(rowAt(today).locator(".history-row__badge")).toHaveText(labels.done);
  const noShow = find((item) => item.state === "NO_SHOW", "NO_SHOW");
  await expect(rowAt(noShow).locator(".history-row__badge")).toHaveText(labels.noShow);
  await expect(rowAt(noShow).locator(".history-row__detail")).toHaveText(labels.noShowDetail);
  const byClub = find((item) => item.state === "CANCELLED_BY_CLUB", "CANCELLED_BY_CLUB");
  await expect(rowAt(byClub).locator(".history-row__badge")).toHaveText(labels.cancelledByClub);
  await expect(rowAt(byClub).locator(".history-row__detail")).toHaveText(
    labels.byClub(CLUB_CANCELLATION_TEXT),
  );
  const late = find((item) => item.state === "CANCELLED_LATE", "CANCELLED_LATE");
  await expect(rowAt(late).locator(".history-row__badge")).toHaveText(labels.cancelledLate);
  await expect(rowAt(late).locator(".history-row__detail")).toHaveText(labels.byMemberLate);
  const notice = find(
    (item) => item.detail?.kind === "INSTRUCTOR_NOTICE_IN_TIME",
    "INSTRUCTOR_NOTICE_IN_TIME",
  );
  await expect(rowAt(notice).locator(".history-row__detail")).toHaveText(labels.noticeInTime);
  // Alba's «ha avisat» of this Monday is hers: Rita's account shows no notice row of week 0 and
  // no row of Alba's dog.
  expect(
    history.items.filter(
      (item) =>
        item.date >= weekStart && item.detail?.kind.startsWith("INSTRUCTOR_NOTICE") === true,
    ),
  ).toEqual([]);
  expect(history.items.some((item) => item.dogName === cast.alba.dog)).toBe(false);
  // E6-W04 review #7: the ACTIVITY rows. One whose activity has a page (`activityId`, E74/E75)
  // links `/activitats/{activityId}`; the others are plain text.
  const activities = history.items.filter((item) => item.type === "ACTIVITY");
  for (const item of activities) {
    const link = rowAt(item).locator("a.history-row__link");
    if (item.activityId == null) {
      await expect(link).toHaveCount(0);
    } else {
      await expect(link).toHaveAttribute(
        "href",
        `/activitats/${encodeURIComponent(item.activityId)}`,
      );
    }
  }
  // «Tots» is the default and the chips are the api's dogs (a family-group dog with its owner):
  // Rita's family group has dogs that are not hers, so the chips are always there.
  expect(history.showDog).toBe(true);
  expect(history.dogs.some((dog) => !dog.own)).toBe(true);
  if (history.showDog) {
    await expect(page.getByRole("button", { exact: true, name: labels.all })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    for (const dog of history.dogs) {
      await expect(
        page.getByRole("button", {
          name: new RegExp(`^${escapeRegExp(dog.name)}(?: ·| \\(|$)`, "u"),
        }),
      ).toBeVisible();
    }
  }
  return {
    activityRows: activities.map((item) => ({
      activityId: item.activityId ?? null,
      date: item.date,
      state: item.state,
    })),
    dogs: history.dogs.map((dog) => ({ name: dog.name, own: dog.own })),
    melRows: mel.map((item) => ({
      date: item.date,
      detail: item.detail?.kind ?? null,
      state: item.state,
    })),
    monthsVisible: history.monthsVisible,
    rows: history.items.length,
    showDog: history.showDog,
    types: history.types,
  };
}

test("T-10-31 (g) 25 · Rita's history: the Monday class «feta», the seeded no-show, the club's cancellation with its message, the late cancellation; Alba's notice never on her account; an activity row with its activityId links the activity's page", async ({
  browser,
}) => {
  test.setTimeout(300_000);
  const rita = await clubsSession(browser, RITA, "/inici");
  const shown = await checkHistory(rita.page, "ca", theScene().melId);
  await shot(rita.page, "25-historic-core-375.png");
  // E6-W04 review #7: `HistoryItem.activityId` on the core (E74/E75). Rita has no activity row and
  // the seed's only activity registration of a login (`scenario.activityRegistrations`: member 5,
  // the Torneig d'Estiu of week 2) is live and future, so not on 25 (R-10-14). That member cancels
  // it: a cancelled registration is on 25 («anul·lada»), and while the activity stays PUBLISHED its
  // row carries `activityId`, links `/activitats/{activityId}`, and that page answers her.
  const registrant = await clubsSession(browser, ACTIVITY_REGISTRANT, "/inici");
  const before = await call<MemberHistory>(registrant, "/me/history");
  expect(before.status).toBe(200);
  const activities = await call<Pick<Schemas["MeActivities"], "mine">>(
    registrant,
    "/me/activities",
  );
  expect(activities.status).toBe(200);
  const registration = activities.body.mine.find(
    (item) => item.state === "ACTIVE" && item.activity.title === SEEDED_ACTIVITY,
  );
  if (registration === undefined) throw new Error("member 5 has no live Torneig registration");
  const cancelled = await call<Partial<Pick<Schemas["ActivityRegistration"], "state">>>(
    registrant,
    `/activity-registrations/${registration.id}/cancellation`,
    "POST",
    {} satisfies Schemas["RegistrationCancellationRequest"],
  );
  expect({ state: cancelled.body.state, status: cancelled.status }).toEqual({
    state: "CANCELLED",
    status: 200,
  });
  const history = await openAndRead<MemberHistory>(
    registrant.page,
    "/historic",
    "/inici",
    isCall("GET", /\/api\/v1\/me\/history$/u),
  );
  const row = history.items.find((item) => item.type === "ACTIVITY" && item.id === registration.id);
  const activityRow = {
    activityId: row?.activityId ?? null,
    isTheActivity: row?.activityId === registration.activityId,
    rowsBefore: before.body.items.filter((item) => item.type === "ACTIVITY").length,
    state: row?.state ?? null,
  };
  note("g-history", { ...shown, activityRow });
  expect(activityRow).toMatchObject({ isTheActivity: true, state: "CANCELLED" });
  if (row === undefined) throw new Error("25 has no row for the cancelled registration");
  const line = registrant.page
    .locator(".history-screen__list > li")
    .nth(history.items.indexOf(row));
  await expect(line.locator(".history-row__badge")).toHaveText(historyText.ca.cancelled);
  await expect(line.locator("a.history-row__link")).toHaveAttribute(
    "href",
    `/activitats/${encodeURIComponent(registration.activityId)}`,
  );
  const detail = await call<Partial<Pick<Schemas["MemberActivityDetail"], "id">>>(
    registrant,
    `/me/activities/${registration.activityId}`,
  );
  note("g-history", { ...shown, activityRow: { ...activityRow, page: detail.status } });
  expect({ id: detail.body.id, status: detail.status }).toEqual({
    id: registration.activityId,
    status: 200,
  });
});

test("(i) es · T-10-32 on real data: 20 and 21 in Spanish (a save round trip that leaves the states), and 25's badges and detail lines", async ({
  browser,
}) => {
  test.setTimeout(420_000);
  const { classId, names } = theScene();
  const berta = await clubsSession(browser, theScene().instructorA, "/instructor/dia", "es");
  const { page } = berta;
  await open20(page, weekStart);
  await expect(page.getByRole("heading", { level: 1, name: sheetText.es.dayTitle })).toBeVisible();
  const sheet = await open21(page, classId);
  const alba = rowOf(sheet, cast.alba.dog);
  await expect(page.locator(".instructor-sheet__meta")).toContainText("3/5");
  const albaRow = sheetRow(page, names.alba);
  await expect(
    albaRow.getByText(sheetText.es.notice(shortTime(alba.notice?.atLocal ?? "")), { exact: true }),
  ).toBeVisible();
  await expect(albaRow.getByText(sheetText.es.seatReleased, { exact: true })).toBeVisible();
  await expect(albaRow.getByText(sheetText.es.noticeWaitlist, { exact: true })).toBeVisible();
  await expect(sheetRow(page, names.nil)).toContainText(sheetText.es.alreadySent);
  const states = castStates(sheet);
  await expectCircles(page, "es", {
    [names.alba]: "NOTIFIED",
    [names.marti]: "PRESENT",
    [names.nil]: "NO_SHOW",
    [names.rita]: "PRESENT",
  });
  // A save in Spanish and back: Rita to «pendiente» and «presente» again (the window is open
  // until T1, R-10-03), so the seed's states stay.
  await circle(page, "es", names.rita, sheetText.es.pending).click();
  const away = await save21(page, "es");
  expect(away.status).toBe(200);
  await expect(page.getByText(sheetText.es.saved)).toBeVisible();
  await circle(page, "es", names.rita, sheetText.es.present).click();
  const back = await save21(page, "es");
  expect(back.status).toBe(200);
  expect(castStates(back.body)).toEqual(states);

  const rita = await clubsSession(browser, RITA, "/inici", "es");
  const shown = await checkHistory(rita.page, "es", theScene().melId);
  await shot(rita.page, "25-historic-core-es-375.png");
  note("i-es", {
    history: shown,
    roundTrip: [away.status, back.status],
    states: castStates(back.body),
  });
});

// E6-W04 review #3: the last instant. At Wednesday 00:00 the Monday sheet is past `T1` (Tuesday
// 23:59:59, `attendance.editDays` 1): 21 shows its circles inert and the core refuses a save.
test("T-10-01 T-10-27 E6-W04 review #3 · at Wednesday 00:00 the Monday sheet is closed to an instructor: 21's circles inert, and a PUT answers 422 ATTENDANCE_WINDOW_CLOSED with its editableUntil; nothing changes", async ({
  browser,
}) => {
  test.setTimeout(300_000);
  const { classId, names } = theScene();
  expect((await setCoreClock(browser, instants.windowClosed)).status).toBe(200);
  const berta = await clubsSession(browser, theScene().instructorA, "/instructor/dia");
  const sheet = await open21(berta.page, classId);
  expect(sheet.sheet).toMatchObject({ canMarkNotice: false, canMarkPresence: false });
  for (const name of [names.rita, names.marti, names.nil]) {
    await expect(
      berta.page.getByRole("radiogroup", { exact: true, name: sheetText.ca.circles(name) }),
    ).toHaveAttribute("aria-disabled", "true");
  }
  // A forced tap on Rita's «pendent» changes nothing: her circle stays «present», nothing is sent.
  let puts = 0;
  berta.page.on("request", (request) => {
    if (request.method() === "PUT" && SHEET_PATH.test(apiPath(request))) puts += 1;
  });
  const pending = circle(berta.page, "ca", names.rita, sheetText.ca.pending);
  await expect(pending).toBeDisabled();
  await pending.click({ force: true });
  await expectCircles(berta.page, "ca", { [names.rita]: "PRESENT" });
  await expect(pending).toHaveAttribute("aria-checked", "false");
  expect(puts).toBe(0);
  const closed = await call(berta, `/class-sessions/${classId}/attendance`, "PUT", {
    items: [{ bookingId: rowOf(sheet, cast.rita.dog).bookingId, state: "PENDING" }],
    version: sheet.sheet.version,
  } satisfies Schemas["AttendanceSaveRequest"]);
  const after = await readSheet(berta, classId);
  // The same instant as the sheet's `editableUntil` (`details.editableUntil`, the snapshot's PUT).
  const detailUntil = Date.parse(String(closed.body.details?.editableUntil));
  note("window-closed", {
    ...refusal(closed),
    editableUntil: sheet.sheet.editableUntil,
    editableUntilInDetails: detailUntil === Date.parse(sheet.sheet.editableUntil),
    sheet: {
      canMarkNotice: sheet.sheet.canMarkNotice,
      canMarkPresence: sheet.sheet.canMarkPresence,
    },
    versionKept: after.sheet.version === sheet.sheet.version,
  });
  expect(refusal(closed)).toMatchObject({ code: "ATTENDANCE_WINDOW_CLOSED", status: 422 });
  expect(detailUntil).toBe(Date.parse(sheet.sheet.editableUntil));
  expect(after.sheet.version).toBe(sheet.sheet.version);
  expect(castStates(after)).toEqual(castStates(sheet));
});
