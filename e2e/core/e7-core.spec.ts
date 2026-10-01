import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import type { Browser, BrowserContext, Locator, Page, Request, Response } from "@playwright/test";

import type { components } from "../../packages/api-client/src/generated/schema";

import { expect, test } from "./oauth-token-log";

// E7-W03 · S11 WP-11-F (web half) end to end against the published core with the E7 demo seed
// (api E7-T04, `messaging:` of the image's `seeds/demo-canic.yaml`, dumped by the wrapper next to
// this run's evidence). The stage seeds from `E5_WEEK_START` (the club-local Monday after the
// run's day, `scripts/e2e-core.sh`), so the E5 scenario's week-0 bookings exist: census ordinals 5
// (`member@`, «Laura» of T-11-39, Catalan) and 7 (`member.3@`, the second registrant, who picks
// «Castellano» on 12 before the cancellation: the seed has no `es` account) share Monday's 08:30
// class. The core's test clock (`POST /test/clock`) moves twice, each after the sessions issued
// before it are closed (a move expires them):
//   1. Monday 07:00 of week 0 (`scenario.demoNow`) — week 0 is open for the bookings the run adds
//      as each member through the api (the classes of steps c, d and h), and every class ahead;
//   2. two hours before the class of step (h) — P4 `reminders` sends N-13 (R-15-14).
// The browsers keep their own clock (never faked); jobs run only from D11's [Simula]/[Executa ara];
// e-mails are read from the private mailbox volume (`E1_MAILBOX_DIRECTORY`) only.
// Rows are found by the api's ids and the screens' data attributes (`data-class-id`,
// `data-notification-id`, `data-code`, `data-template-id`, `data-delivery-status`) and roles.

const clubsUrl = "http://127.0.0.1:4173";
const adminUrl = "http://127.0.0.1:4174";
const coreUrl = requiredEnvironment("CORE_URL");
const corePassword = requiredEnvironment("E1_CORE_PASSWORD");
const mailboxDirectory = requiredEnvironment("E1_MAILBOX_DIRECTORY");
const weekStart = process.env.E5_WEEK_START ?? requiredEnvironment("E4_WEEK_START");
const evidenceDirectory =
  process.env.CORE_EVIDENCE_DIRECTORY ?? resolve(process.cwd(), "roadmap/evidence/E7-W03");
const clubTimeZone = "Europe/Madrid";
const runId = Date.now().toString(36).slice(-6);
const desktop = { height: 900, width: 1280 };
const mobile = { height: 844, width: 375 };

/** `scripts/core-stack/club-canic.yaml` logins (the demo seed renames their members). */
const ADMIN = "admin@example.test";
/** Census ordinal 5: «Laura» of T-11-39 (Catalan). */
const MEMBER_CA = "member@example.test";
/** Census ordinal 7: the second registrant of the same seeded class (`es` from step b on). */
const MEMBER_ES = "member.3@example.test";
/** Census ordinal 8: the push subscription of step (f), one of the ten of step (e). */
const MEMBER_PUSH = "member.4@example.test";
/**
 * The ten fictional seed members of the announcement (e): the ten member logins, census ordinals
 * 5 to 14 (`member@` … `member.10@`), so their own feeds can be read.
 */
const TEN = [
  MEMBER_CA,
  ...Array.from({ length: 9 }, (_, index) => `member.${String(index + 2)}@example.test`),
];

/** The fictional texts of the run (every free-text field carries `runId`). */
const adminTexts = {
  a: `Classe anul·lada per la pluja — ${runId}`,
  c: `Classe anul·lada pel vent — ${runId}`,
  d: `Classe anul·lada per la calor — ${runId}`,
} as const;
/** Step (c)'s marker, added to the `ca` and `es` bodies of N-08a at D9. */
const templateMarker = ` (${runId})`;
/** `messaging.customTemplates[0]` of the demo seed (the `CUSTOM` `CLUB_NEWS` template). */
const customTemplate = {
  body: { ca: "jornada de portes obertes", es: "jornada de puertas abiertas" },
  title: { ca: "Comunicat del club", es: "Comunicado del club" },
} as const;
/** Fictional push subscription keys: the seed's own (`messaging.profiles[0].push`). */
const PUSH_KEYS = {
  auth: "IiIiIiIiIiIiIiIiIiIiIg",
  p256dh: "BHOSs0YsSaLk6TQZCHSDATUjNlrmU0Lvhn21nxNNQtPGmW1zAZmQRcHOFqToHw0VllmplTaYYZl3k2c-1Jjfrp8",
} as const;
const pushEndpoint = `https://push.example.test/${runId}`;

type Locale = "ca" | "es";

/** The literals the screens print (`auth`, `notifications`, `shell` namespaces), per locale. */
const ui = {
  ca: {
    appColumn: "App",
    asMember: /^Com a alumn[ae]/u,
    changeClass: "CANVIA DE CLASSE",
    email: "Correu electrònic",
    emailColumn: "Correu",
    emailFor: (label: string) => `Correu: ${label}`,
    language: "Idioma",
    logout: "Tanca la sessió",
    notices: "Avisos",
    password: "Contrasenya",
    push: "Vull rebre notificacions al mòbil quan hi hagi comunicats del club",
    reminder: "Recordatori de classe",
    reminderTwoHours: "2 h abans",
    rows: [
      "Operativa (reserves i canvis que has fet tu)",
      "Comunicats personals per a tu",
      "Canvis en reserves que has fet (fets pel club)",
      "Comunicats del club",
    ],
    sms: "+SMS",
    title: "Notificacions",
    viaSms: " · i per SMS",
  },
  es: {
    appColumn: "App",
    asMember: /^Como alumn[ao]/u,
    changeClass: "CAMBIA DE CLASE",
    email: "Correo electrónico",
    emailColumn: "Correo",
    emailFor: (label: string) => `Correo: ${label}`,
    language: "Idioma",
    logout: "Cierra la sesión",
    notices: "Avisos",
    password: "Contraseña",
    push: "Quiero recibir notificaciones en el móvil cuando haya comunicados del club",
    reminder: "Recordatorio de clase",
    reminderTwoHours: "2 h antes",
    rows: [
      "Operativa (reservas y cambios que has hecho tú)",
      "Comunicados personales para ti",
      "Cambios en reservas que has hecho (hechos por el club)",
      "Comunicados del club",
    ],
    sms: "+SMS",
    title: "Notificaciones",
    viaSms: " · y por SMS",
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
  to?: string;
}

// AGENTS rule 4: the api's answers are the generated contract's types, with `Pick` where the run
// reads a few fields. Only the run's own records (sessions, answers, the registry) are local.
type Schemas = components["schemas"];
type ApiProblem = Partial<Pick<Schemas["ApiError"], "code" | "details">>;
type MeNotification = Schemas["MeNotification"];
type MeNotifications = Schemas["MeNotifications"];
type MeHome = Pick<Schemas["MeHome"], "dogs" | "member" | "notifications" | "reservations">;
type Booking = Pick<
  Schemas["Booking"],
  "classSession" | "classSessionId" | "dog" | "dogId" | "id" | "state"
>;
type BookableClasses = Pick<Schemas["BookableClasses"], "classes" | "dog">;
type BookableClass = Schemas["BookableClass"];
type SeatHold = Pick<Schemas["SeatHoldResponse"], "id">;
type Branding = Pick<Schemas["BrandingResponse"], "locales" | "modules" | "pushPublicKey">;
type TemplateList = Schemas["MessageTemplateList"];
type TemplateDetail = Schemas["MessageTemplateDetail"];
type NotificationPage = Pick<Schemas["NotificationPage"], "items" | "totalItems">;
type NotificationRow = Schemas["NotificationListItem"];
type NotificationDetail = Schemas["NotificationDetail"];
type Preferences = Schemas["NotificationPreferences"];
type Announcement = Schemas["AnnouncementResult"];
type MemberPage = Pick<Schemas["ListPageMemberListItem"], "items" | "totalItems">;
type MemberRow = Schemas["MemberListItem"];
type CancellationPreview = Schemas["CancellationPreview"];
type ClassSession = Pick<Schemas["ClassSession"], "cancellation" | "id" | "state">;
type JobRunAnswer = Pick<Schemas["JobRun"], "dryRun" | "effects" | "errors" | "runId" | "status">;
type JobSummaries = Pick<Schemas["JobSummaries"], "items">;
type FaqEntries = Schemas["CatalogItemsFaqEntry"];
type FaqItem = FaqEntries["items"][number];
type PushCreated = Schemas["PushSubscriptionCreated"];
type Me = Pick<Schemas["Me"], "account">;

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

/** The instant of a club-local date and time (Europe/Madrid), as E5-W04/E6-W04 compute it. */
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

/** «8:30» from «08:30» (the bodies print club times without a leading zero). */
function shortTime(time: string): string {
  return time.replace(/^0(?=\d:)/u, "");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

/** A provider reference or an id for the report: its first characters only. */
function truncated(value: null | string | undefined): null | string {
  if (value === null || value === undefined || value === "") return null;
  return `${value.slice(0, 6)}…`;
}

const demoNow = clubInstant(weekStart, "07:00");
const registryPath = join(evidenceDirectory, "e7-core-run.json");

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

const EMAIL_PATTERN = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/gu;
const UUID_PATTERN = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/giu;
const OBJECT_ID_PATTERN = /\b[0-9a-f]{24}\b/giu;

/**
 * A seed login by its census ordinal (`accountEmails` of the demo seed: 0 = admin@ … 5 = member@,
 * 6 = member.2@ … 14 = member.10@), never by its address, in the committed evidence.
 */
function memberLabel(email: string): string {
  const logins = [
    ADMIN,
    "canic.admin@example.test",
    "instructor@example.test",
    "instructor.2@example.test",
    "instructor.3@example.test",
    ...TEN,
  ];
  const index = logins.indexOf(email.toLowerCase());
  return index === -1 ? "[e-mail]" : `#${String(index)}`;
}

/** The evidence's text: e-mails as census ordinals, ids truncated (Fixed conventions). */
function redactText(text: string): string {
  return text
    .replace(EMAIL_PATTERN, (email) => memberLabel(email))
    .replace(UUID_PATTERN, (id) => `${id.slice(0, 6)}…`)
    .replace(OBJECT_ID_PATTERN, (id) => `${id.slice(0, 6)}…`);
}

function redact(value: unknown): unknown {
  if (typeof value === "string") return redactText(value);
  if (Array.isArray(value)) return value.map(redact);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [redactText(key), redact(item)]),
    );
  }
  return value;
}

/** What a step proved (statuses, codes, counters), kept for the report. Never a token. */
function note(step: string, value: unknown): void {
  const record = readRecord();
  record.steps[redactText(step)] = redact(value);
  writeRecord(record);
}

/** The records the run created (full ids, in memory only), for the cleanup and the safety net. */
const created: Record<string, string> = {};

/** A record the run created: kept in memory, written truncated to the evidence. */
function remember(key: string, id: string): void {
  created[key] = id;
  const record = readRecord();
  record.created[key] = redactText(id);
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

/** The back office's `/entrar`: ADMIN lands on D1. */
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

async function loginClubs(page: Page, email: string, locale: Locale): Promise<void> {
  await page.goto(`${clubsUrl}/entrar`);
  await page.getByLabel(ui[locale].email).fill(email);
  await page.getByLabel(ui[locale].password, { exact: true }).fill(corePassword);
  // The app refreshes once it lands; a navigation that aborted that call would leave the browser
  // with the rotated-away cookie (`REFRESH_REUSED`), so the login waits for it as E1–E6 do.
  const routeRefresh = page.waitForResponse(isRefresh);
  await submitPasswordLogin(page);
  await page.waitForURL((url) => url.pathname === "/inici" || url.pathname === "/perfil-acces");
  expect((await routeRefresh).status()).toBe(200);
  if (new URL(page.url()).pathname === "/perfil-acces") {
    // 03b: an account with more than one profile and none remembered chooses one first.
    note(`profile-choice-${email}`, { locale });
    await page
      .locator("button.profile-choice__card")
      .filter({ hasText: ui[locale].asMember })
      .click();
    await page.waitForURL("**/inici");
  }
  await expect(page.locator(".clubs-shell")).toBeVisible();
  await settle(page, "/inici");
}

// One session per account, app and locale while the clock stays (the tests are serial): every
// login costs three `/oauth2/token` calls and the core allows 30 a minute per IP (S01 R-01-08).
const sessions = new Map<string, Session>();

async function clubsSession(
  browser: Browser,
  email: string,
  locale: Locale = "ca",
): Promise<Session> {
  const key = `clubs|${email}|${locale}`;
  const known = sessions.get(key);
  if (known !== undefined) return known;
  const context = await newContext(browser, mobile, locale);
  const page = await context.newPage();
  const bearer = bearerOf(page);
  await loginClubs(page, email, locale);
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
 * does not ask (reads that pick the rows, bookings the run adds, cleanup). Writes carry their own
 * `Idempotency-Key`.
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

/**
 * In-app navigation of either SPA (the session lives in memory: no reload, no refresh call). The
 * screens may rewrite their query (the lists' state), so only the path is waited for.
 */
async function goTo(page: Page, path: string): Promise<void> {
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
  const expected = new URL(path, clubsUrl).pathname;
  await expect.poll(() => new URL(page.url()).pathname).toBe(expected);
}

/** A route mounted again: a page already on `path` leaves it first, so it reads again. */
async function openRoute(page: Page, path: string, away: string): Promise<void> {
  if (new URL(page.url()).pathname === new URL(path, clubsUrl).pathname) await goTo(page, away);
  await goTo(page, path);
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

/** A capture of the page; `mask` covers personal data (an address, a phone) with a box. */
async function shot(
  page: Page,
  name: string,
  fullPage = true,
  mask: Locator[] = [],
): Promise<void> {
  await iconsPainted(page);
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
  await page.screenshot({ fullPage, mask, path: join(evidenceDirectory, name) });
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
  note(`clock-${instant}`, { status: answer.status });
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

function mailboxFiles(): Set<string> {
  try {
    return new Set(readdirSync(mailboxDirectory).filter((name) => name.endsWith(".json")));
  } catch {
    return new Set();
  }
}

/** The mailbox messages written after `previous` (the core's local mail sink). */
function newMessages(previous: ReadonlySet<string>): MailMessage[] {
  return [...mailboxFiles()]
    .filter((name) => !previous.has(name))
    .sort()
    .map((name) => JSON.parse(readFileSync(join(mailboxDirectory, name), "utf8")) as MailMessage);
}

/** The new messages to one address (a fictional seed login), apostrophes made straight. */
function messagesTo(address: string, previous: ReadonlySet<string>): MailMessage[] {
  return newMessages(previous)
    .filter((message) => (message.to ?? "").toLowerCase() === address.toLowerCase())
    .map((message) => ({ ...message, subject: (message.subject ?? "").replaceAll("’", "'") }));
}

/** Every text field of a mailbox message (its subject and bodies). */
function messageText(message: MailMessage): string {
  return [message.subject, message.text, message.html]
    .filter((value): value is string => typeof value === "string")
    .join("\n")
    .replaceAll("’", "'");
}

/** The mailbox evidence of a step: recipient, subject and whether the marker is in it. */
function mailEvidence(message: MailMessage, marker?: string) {
  return {
    marker: marker === undefined ? null : messageText(message).includes(marker),
    subject: message.subject ?? null,
    to: message.to ?? null,
  };
}

/** S05 R-05-22 (S11 R-11-14): entries by `order`, groups by their lowest `order`. */
function faqCategories(items: readonly FaqItem[]): string[] {
  const grouped = new Map<string, number>();
  [...items]
    .sort((left, right) => left.order - right.order)
    .forEach((item) => {
      if (!grouped.has(item.category)) grouped.set(item.category, item.order);
    });
  return [...grouped.entries()]
    .sort(([, left], [, right]) => left - right)
    .map(([category]) => category);
}

// ——— The run's shared data (the api's, read once in the first test). ———

interface Person {
  /** Her booking of the seeded class A. */
  bookingA: string;
  dogId: string;
  dogName: string;
  /** Her contact e-mail: the mailbox recipient (a fictional seed login). */
  email: string;
  firstName: string;
  memberId: string;
}

interface Scene {
  ca: Person;
  classA: { date: string; description: string; id: string; ringName: null | string; time: string };
  customTemplateId: string;
  es: Person;
  n08aTemplateId: string;
  /** N-08a's seeded texts per club language (`GET /message-templates/{id}`), with code keys. */
  n08aTexts: Pick<TemplateDetail, "bodyI18n" | "titleI18n">;
  pushPublicKey: null | string;
  /** Whether class A was booked by the run (no seeded class shared by both). */
  seededA: boolean;
  ten: { email: string; fullName: string; id: string }[];
}
let scene: Scene | undefined;

function theScene(): Scene {
  if (scene === undefined) throw new Error("The scene was not read (first test)");
  return scene;
}

/** The notifications the steps created and assert later (by the api's ids). */
const cards: Partial<Record<"aCa" | "aEs" | "cCa" | "cEs" | "dCa", MeNotification>> = {};

/**
 * The static parts of a template text (split on its `[[…]]` variables), whitespace collapsed:
 * a rendered text in that language holds every one of them (R-11-01, R-11-05).
 */
function staticParts(template: string | undefined): string[] {
  if (template === undefined) throw new Error("The template has no text in that language");
  return template
    .split(/\[\[[^\]]+\]\]/u)
    .map((part) => part.replace(/\s+/gu, " ").trim())
    .filter((part) => part !== "" && !part.includes("{"));
}

/** Every static part of `template` is in `rendered` (first letters may be capitalised, R-11-05). */
function expectRenderedFrom(rendered: string, template: string | undefined, label: string): void {
  const text = rendered.replace(/\s+/gu, " ").toLowerCase();
  const parts = staticParts(template);
  expect(parts.length, label).toBeGreaterThan(0);
  for (const part of parts) expect(text, `${label}: «${part}»`).toContain(part.toLowerCase());
}

function theCard(key: keyof typeof cards): MeNotification {
  const value = cards[key];
  if (value === undefined) throw new Error(`Step ${key} did not record its notification`);
  return value;
}

/** Step (f)'s upsert: the same endpoint posted again keeps its subscription id (R-11-07). */
let pushUpsertSameId: boolean | undefined;

/** The classes the run cancels or books (steps c, d and h). */
const classes: Partial<Record<"c" | "d" | "h", BookableClass>> = {};

function theClass(key: keyof typeof classes): BookableClass {
  const value = classes[key];
  if (value === undefined) throw new Error(`Step ${key} did not pick its class`);
  return value;
}

async function meHome(session: Session): Promise<MeHome> {
  const answer = await call<MeHome>(session, "/me/home");
  expect(answer.status, "GET /me/home").toBe(200);
  return answer.body;
}

async function feedOf(session: Session): Promise<MeNotifications> {
  const answer = await call<MeNotifications>(session, "/me/notifications?page=0&size=20");
  expect(answer.status, "GET /me/notifications").toBe(200);
  return answer.body;
}

/** Polls the account's feed (api reads) until a notification matches. */
async function waitForCard(
  session: Session,
  label: string,
  matches: (item: MeNotification) => boolean,
  timeout = 90_000,
): Promise<MeNotification> {
  let found: MeNotification | undefined;
  await expect
    .poll(
      async () => {
        found = (await feedOf(session)).items.find(matches);
        return found !== undefined;
      },
      { message: label, timeout },
    )
    .toBe(true);
  if (found === undefined) throw new Error(label);
  return found;
}

async function noticeDetail(admin: Session, id: string): Promise<NotificationDetail> {
  const answer = await call<NotificationDetail>(admin, `/notifications/${id}`);
  expect(answer.status, "GET /notifications/{id}").toBe(200);
  return answer.body;
}

/** The detail once none of `channels` is still `QUEUED` (the dispatcher ran). */
async function settledDetail(
  admin: Session,
  id: string,
  channels: readonly string[],
  timeout = 60_000,
): Promise<NotificationDetail> {
  let detail: NotificationDetail | undefined;
  await expect
    .poll(
      async () => {
        detail = await noticeDetail(admin, id);
        return detail.deliveries.some(
          (delivery) => channels.includes(delivery.channel) && delivery.status === "QUEUED",
        );
      },
      { message: `deliveries of ${id} still QUEUED`, timeout },
    )
    .toBe(false);
  if (detail === undefined) throw new Error("No notification detail");
  return detail;
}

function deliveryStates(detail: NotificationDetail) {
  return detail.deliveries.map((delivery) => ({
    attempts: delivery.attempts,
    channel: delivery.channel,
    providerRef: truncated(delivery.providerRef),
    status: delivery.status,
  }));
}

/** The club's newest notifications (the admin log's api read). */
async function recentNotices(admin: Session, code?: string): Promise<NotificationRow[]> {
  const filter = code === undefined ? "" : `&filter=${encodeURIComponent(`code:eq:${code}`)}`;
  const answer = await call<NotificationPage>(
    admin,
    `/notifications?page=0&size=200&sort=${encodeURIComponent("createdAt,desc")}${filter}`,
  );
  expect(answer.status, "GET /notifications").toBe(200);
  return answer.body.items;
}

async function bookingOf(session: Session, id: string): Promise<Booking> {
  const answer = await call<Booking>(session, `/bookings/${id}`);
  expect(answer.status, "GET /bookings/{id}").toBe(200);
  return answer.body;
}

/** The dog's 04 rows as the member reads them (`GET /me/bookable-classes`). */
async function bookableOf(session: Session, dogId: string): Promise<BookableClass[]> {
  const answer = await call<BookableClasses>(
    session,
    `/me/bookable-classes?dogId=${encodeURIComponent(dogId)}`,
  );
  expect(answer.status, "GET /me/bookable-classes").toBe(200);
  return answer.body.classes;
}

/**
 * Books a class as the member through the api (S08: the seat hold, then the booking) — the run
 * adds the bookings the steps need where the seed has none (said in the report).
 */
async function bookAs(session: Session, classId: string, dogId: string): Promise<Booking> {
  const hold = await call<SeatHold & ApiProblem>(session, "/seat-holds", "POST", {
    classSessionId: classId,
    dogId,
  });
  expect(hold.status, `POST /seat-holds ${hold.body.code ?? ""}`).toBe(201);
  const booking = await call<Booking & ApiProblem>(session, "/bookings", "POST", {
    seatHoldId: hold.body.id,
  });
  expect(booking.status, `POST /bookings ${booking.body.code ?? ""}`).toBe(201);
  return booking.body;
}

/** The member's BOOKABLE classes of week 0 after Monday, but `excluded`, by start. */
async function bookableAfterMonday(
  session: Session,
  dogId: string,
  excluded: readonly string[],
): Promise<BookableClass[]> {
  return (await bookableOf(session, dogId))
    .filter(
      (item) =>
        item.state === "BOOKABLE" &&
        !excluded.includes(item.id) &&
        item.startsAtLocal.slice(0, 10) > weekStart,
    )
    .sort((left, right) => left.startsAtLocal.localeCompare(right.startsAtLocal));
}

/**
 * D4 → D4c (E4-W02): the week of `weekStart`, the class by its `data-class-id`, [ANUL·LA LA
 * CLASSE], the admin's text and the confirmation; the api's answers.
 */
async function cancelAtD4c(
  admin: Session,
  classId: string,
  adminText: string,
): Promise<{ cancellation: ClassSession["cancellation"]; preview: CancellationPreview }> {
  const { page } = admin;
  const calendarRead = page.waitForResponse(isCall("GET", /\/api\/v1\/weeks\/[^/]+\/calendar$/u));
  await openRoute(page, `/calendari?estat=actives&setmana=${weekStart}`, "/tauler");
  expect((await calendarRead).status(), "GET /weeks/{id}/calendar").toBe(200);
  const cell = page.locator(`[data-class-id="${classId}"]`);
  await expect(cell).toHaveCount(1);
  await cell.click();
  const card = page.getByRole("region", { name: /^Classe seleccionada/u });
  await expect(card).toBeVisible();
  const previewing = page.waitForResponse(
    isCall("GET", new RegExp(`/api/v1/class-sessions/${classId}/cancellation-preview$`, "u")),
  );
  await card.getByRole("button", { name: "ANUL·LA LA CLASSE" }).click();
  const previewResponse = await previewing;
  expect(previewResponse.status(), "GET /class-sessions/{id}/cancellation-preview").toBe(200);
  const preview = (await previewResponse.json()) as CancellationPreview;
  const modal = page.getByRole("dialog", { name: /^Anul·lar la classe — /u });
  await expect(modal).toBeVisible();
  if (preview.bookings.length > 0) {
    await expect(
      modal.getByRole("table", { name: "Alumnes inscrits" }).getByRole("row"),
    ).toHaveCount(preview.bookings.length);
  }
  const confirm = modal.getByRole("button", { name: /^ANUL·LA I AVISA/u });
  await expect(confirm).toBeDisabled();
  await modal.getByLabel("Text de l'avís").fill(adminText);
  await expect(confirm).toBeEnabled();
  const posting = page.waitForResponse(
    isCall("POST", new RegExp(`/api/v1/class-sessions/${classId}/cancellation$`, "u")),
  );
  await confirm.click();
  const response = await posting;
  expect(response.status(), "POST /class-sessions/{id}/cancellation").toBe(200);
  const cancelled = (await response.json()) as ClassSession;
  expect(cancelled.state).toBe("CANCELLED");
  await expect(modal).toHaveCount(0);
  return { cancellation: cancelled.cancellation, preview };
}

/** Screen 11 by address: the page's own feed read and its read-all answer (R-11-10). */
async function open11(
  page: Page,
): Promise<{ feed: MeNotifications; readAll: { status: number; unreadCount: number | null } }> {
  const reading = page.waitForResponse(isCall("GET", /\/api\/v1\/me\/notifications$/u));
  const marking = page.waitForResponse(isCall("POST", /\/api\/v1\/me\/notifications\/read-all$/u));
  await openRoute(page, "/notificacions", "/inici");
  const read = await reading;
  expect(read.status(), "GET /me/notifications").toBe(200);
  const feed = (await read.json()) as MeNotifications;
  const marked = await marking;
  const markedBody = (await marked.json()) as Partial<Schemas["ReadResult"]>;
  await expect(page.locator(".notification-card").first()).toBeVisible();
  return {
    feed,
    readAll: { status: marked.status(), unreadCount: markedBody.unreadCount ?? null },
  };
}

function feedCard(page: Page, id: string): Locator {
  return page.locator(`.notification-card[data-notification-id="${id}"]`);
}

/** A card as a reader sees it: code · icon · tone · border · title · body · meta · button. */
async function cardView(card: Locator) {
  return card.evaluate((element) => {
    const icon = element.querySelector(".notification-card__icon use")?.getAttribute("href") ?? "";
    const style = getComputedStyle(element);
    const button = element.querySelector("button");
    const text = (selector: string) =>
      (element.querySelector(selector)?.textContent ?? "").replace(/\s+/gu, " ").trim();
    return {
      body: text(".notification-card__body"),
      borderLeft: `${style.borderLeftStyle} ${style.borderLeftWidth}`,
      button: button === null ? null : button.textContent.trim(),
      buttonDisabled: button?.disabled ?? null,
      code: element.getAttribute("data-code"),
      icon: icon.slice(icon.indexOf("#i-") + 3),
      meta: text(".notification-card__meta"),
      tone:
        [...element.classList]
          .find(
            (name) =>
              name.startsWith("notification-card--") &&
              !["notification-card--unread", "notification-card--link"].includes(name),
          )
          ?.replace("notification-card--", "") ?? null,
      title: text(".notification-card__title"),
    };
  });
}

/** Screen 03 by address: the page's own `GET /me/home` answer and the bell's state. */
async function open03(page: Page): Promise<{ dot: number; ringing: number; unread: number }> {
  const home = await openAndRead<MeHome>(
    page,
    "/inici",
    "/perfil",
    isCall("GET", /\/api\/v1\/me\/home$/u),
  );
  await expect(page.locator(".home-header__bell")).toBeVisible();
  const ringing = page.locator(".home-header__bell .home-header__bell-icon--ringing");
  const dot = page.locator(".home-header__bell .home-header__dot");
  if (home.notifications.unreadCount > 0) {
    await expect(ringing).toHaveCount(1);
  } else {
    await expect(ringing).toHaveCount(0);
  }
  return {
    dot: await dot.count(),
    ringing: await ringing.count(),
    unread: home.notifications.unreadCount,
  };
}

/** Screen 12 by address: the page's own `GET /me/notification-preferences` answer. */
async function open12(page: Page): Promise<Preferences> {
  const preferences = await openAndRead<Preferences>(
    page,
    "/perfil",
    "/inici",
    isCall("GET", /\/api\/v1\/me\/notification-preferences$/u),
  );
  await expect(page.locator(".profile-notices__row").first()).toBeVisible();
  return preferences;
}

function isMembersList(q: null | string) {
  return (response: Response) =>
    isCall("GET", /\/api\/v1\/members$/u)(response) &&
    new URL(response.url()).searchParams.get("q") === q;
}

/**
 * The scene (the api's ids): the ten logins' members (admin reads), the N-08a and the seeded
 * `CUSTOM` `CLUB_NEWS` templates, and class A — the earliest class of week 0 both registrants
 * hold a live booking in (E5's scenario: Monday 08:30 on the ring Muntanya); without one the run
 * books both into the first class they can both take, and says so.
 */
async function findScene(browser: Browser, admin: Session, pushKey: null | string): Promise<Scene> {
  const ten: Scene["ten"] = [];
  const contacts: Record<string, { emails: number; phones: number }> = {};
  for (const email of TEN) {
    const answer = await call<MemberPage>(admin, `/members?q=${encodeURIComponent(email)}&size=20`);
    expect(answer.status, `GET /members?q=… (${memberLabel(email)})`).toBe(200);
    const row = (answer.body.items as MemberRow[]).find(
      (item) => item.contact?.emails.some((entry) => entry.email.toLowerCase() === email) === true,
    );
    if (row === undefined) {
      note("scene-missing-member", { email, rows: answer.body.items.length });
      throw new Error(`No member has the contact e-mail of ${memberLabel(email)}`);
    }
    ten.push({ email, fullName: row.fullName ?? "", id: row.id });
    contacts[email] = {
      emails: row.contact?.emails.length ?? 0,
      phones: row.contact?.phones.length ?? 0,
    };
  }
  const templates = await call<TemplateList>(admin, "/message-templates");
  expect(templates.status, "GET /message-templates").toBe(200);
  const n08a = templates.body.items.find((item) => item.code === "N-08a");
  const custom = templates.body.items.find(
    (item) => item.kind === "CUSTOM" && item.category === "CLUB_NEWS" && item.enabled,
  );
  note("scene-templates", {
    countsByCategory: templates.body.countsByCategory,
    custom: custom === undefined ? null : { name: custom.name, push: custom.push },
    items: templates.body.items.length,
    n08a:
      n08a === undefined
        ? null
        : { caps: n08a.caps, customized: n08a.customized, matrix: n08a.matrix, push: n08a.push },
  });
  if (n08a === undefined || custom === undefined) {
    throw new Error("The seed has no N-08a template or no CUSTOM CLUB_NEWS template");
  }
  // N-08a's own texts per language: what a `ca` and an `es` notice are rendered from (b, c).
  const n08aDetail = await call<TemplateDetail>(admin, `/message-templates/${n08a.id}`);
  expect(n08aDetail.status, "GET /message-templates/{id}").toBe(200);
  expect(Object.keys(n08aDetail.body.bodyI18n)).toEqual(expect.arrayContaining(["ca", "es"]));

  const caSession = await clubsSession(browser, MEMBER_CA, "ca");
  const esSession = await clubsSession(browser, MEMBER_ES, "es");
  const live = async (session: Session) => {
    const home = await meHome(session);
    const bookings: Booking[] = [];
    for (const row of home.reservations.filter(
      (item) => item.type === "CLASS" && item.state === "CONFIRMED",
    )) {
      bookings.push(await bookingOf(session, row.id));
    }
    return { bookings, home };
  };
  const caLive = await live(caSession);
  const esLive = await live(esSession);
  let pair = caLive.bookings
    .map((caBooking) => ({
      ca: caBooking,
      es: esLive.bookings.find((item) => item.classSessionId === caBooking.classSessionId),
    }))
    .filter((item): item is { ca: Booking; es: Booking } => item.es !== undefined)
    .sort((left, right) =>
      left.ca.classSession.startsAtLocal.localeCompare(right.ca.classSession.startsAtLocal),
    )[0];
  const seededA = pair !== undefined;
  if (pair === undefined) {
    // Not the seed of this image: both book the first class their own dogs can both take.
    for (const caDog of caLive.home.dogs.filter((dog) => dog.own)) {
      for (const esDog of esLive.home.dogs.filter((dog) => dog.own)) {
        const esIds = new Set(
          (await bookableAfterMonday(esSession, esDog.id, [])).map((item) => item.id),
        );
        const shared = (await bookableAfterMonday(caSession, caDog.id, [])).find((item) =>
          esIds.has(item.id),
        );
        if (shared !== undefined && pair === undefined) {
          pair = {
            ca: await bookAs(caSession, shared.id, caDog.id),
            es: await bookAs(esSession, shared.id, esDog.id),
          };
        }
      }
    }
  }
  note("scene-bookings", {
    ca: caLive.bookings.map((item) => item.classSession.startsAtLocal),
    es: esLive.bookings.map((item) => item.classSession.startsAtLocal),
    seededA,
  });
  if (pair === undefined) throw new Error("The two registrants share no class and can book none");
  const person = (email: string, home: MeHome, booking: Booking): Person => ({
    bookingA: booking.id,
    dogId: booking.dogId,
    dogName: booking.dog.name,
    email,
    firstName: home.member.firstName,
    memberId: home.member.id,
  });
  const caPerson = person(MEMBER_CA, caLive.home, pair.ca);
  const esPerson = person(MEMBER_ES, esLive.home, pair.es);
  for (const item of [caPerson, esPerson]) {
    expect(ten.find((member) => member.email === item.email)?.id).toBe(item.memberId);
  }
  const [date = "", time = ""] = pair.ca.classSession.startsAtLocal.split("T");
  note("scene-contacts", contacts);
  return {
    ca: caPerson,
    classA: {
      date,
      description: pair.ca.classSession.description,
      id: pair.ca.classSessionId,
      ringName: pair.ca.classSession.ringName ?? null,
      time,
    },
    customTemplateId: custom.id,
    es: esPerson,
    n08aTemplateId: n08a.id,
    n08aTexts: { bodyI18n: n08aDetail.body.bodyI18n, titleI18n: n08aDetail.body.titleI18n },
    pushPublicKey: pushKey,
    seededA,
    ten,
  };
}

test.describe.configure({ mode: "serial" });

/** The processes the preflight switched off (switched on again in `afterAll`). */
let jobsSwitchedOff: string[] = [];

// Even after a failure: the core's clock back to the real instant first (the processes never run
// at the test clock, as E6-W04 does now), then the safety net — a template step (c) left
// customized, the e-mail preference step (d) left off, the push subscription step (f) left
// registered — and last the processes back on.
test.afterAll(async ({ browser }) => {
  test.setTimeout(300_000);
  await closeSessions();
  const restored = await setCoreClock(browser, new Date().toISOString());
  note("j-clock-restored", { status: restored.status });
  const admin = await adminSession(browser);
  const safety: Record<string, number> = {};
  if (created.templateEdited !== undefined && created.templateReset === undefined) {
    safety.templateReset = (
      await call(admin, `/message-templates/${created.templateEdited}/reset`, "POST")
    ).status;
  }
  if (created.clubChangesOff !== undefined && created.clubChangesOn === undefined) {
    safety.clubChanges = (
      await call(admin, `/members/${created.clubChangesOff}/notification-preferences`, "PUT", {
        emailByCategory: { CLUB_CHANGES: true },
      })
    ).status;
  }
  if (created.pushSubscription !== undefined && created.pushDeleted === undefined) {
    const push = await clubsSession(browser, MEMBER_PUSH, "ca");
    safety.pushDelete = (
      await call(push, `/push-subscriptions/${created.pushSubscription}`, "DELETE")
    ).status;
  }
  note("afterAll-safety-net", safety);
  let switchedOn: Record<string, { enabled: boolean | null; status: number }> = {};
  if (jobsSwitchedOff.length > 0) {
    switchedOn = await switchJobs(admin, jobsSwitchedOff, true);
    note("jobs-switched-on", switchedOn);
  }
  await closeSessions();
  expect(restored.status).toBe(200);
  for (const answer of Object.values(switchedOn)) {
    expect(answer).toEqual({ enabled: true, status: 200 });
  }
});

test("E7-W03 steps 1–2 · preflight (the S11 answers, the VAPID key, the jobs), the processes off, POST /test/clock to demoNow (Monday 07:00), the parameters and the scene read from the core", async ({
  browser,
}) => {
  test.setTimeout(420_000);
  writeRecord({ created: {}, runId, steps: {}, weekStart });
  note("instants", { coreUrl, demoNow, weekStart });
  // At the real instant: the S11 surface answers (never 501).
  const before = await adminSession(browser);
  const preflight = {
    meNotifications: (await call(before, "/me/notifications?page=0&size=20")).status,
    messageTemplates: (await call(before, "/message-templates")).status,
    notifications: (await call(before, "/notifications?page=0&size=20")).status,
  };
  note("preflight", preflight);
  expect(preflight).toEqual({ meNotifications: 200, messageTemplates: 200, notifications: 200 });
  const branding = await call<Branding>(before, "/branding");
  expect(branding.status, "GET /branding").toBe(200);
  note("branding", {
    locales: branding.body.locales,
    modules: branding.body.modules,
    pushPublicKey:
      branding.body.pushPublicKey === null
        ? null
        : `present (${String(branding.body.pushPublicKey.length)} chars)`,
  });
  // The club file keeps SMS and PUSH on (and FAQ for screen 30).
  expect(branding.body.modules).toEqual(expect.arrayContaining(["FAQ", "PUSH", "SMS"]));
  // The processes go off before any clock move (E5-W04 review #10): no catch-up races the run.
  const listed = await call<JobSummaries>(before, "/jobs");
  expect(listed.status, "GET /jobs").toBe(200);
  expect(listed.body.items.map((job) => job.name)).toContain("reminders");
  const enabledJobs = listed.body.items.filter((job) => job.enabled).map((job) => job.name);
  jobsSwitchedOff = enabledJobs;
  note(JOBS_SWITCHED_OFF, enabledJobs);
  const switchedOff = await switchJobs(before, enabledJobs, false);
  for (const answer of Object.values(switchedOff)) {
    expect(answer).toEqual({ enabled: false, status: 200 });
  }
  // Step 2: the clock, detected once (the reminder step needs it; every other step uses it too).
  const clock = await setCoreClock(browser, demoNow);
  note("clock", { instant: demoNow, status: clock.status });
  expect(clock.status, "POST /test/clock").toBe(200);
  const admin = await adminSession(browser);
  const parameters: Record<string, unknown> = {};
  for (const key of [
    "bookings.lateCancelThresholdMinutes",
    "waitlist.notifyThresholdMinutes",
    "messaging.reminderOptionsMinutes",
    "messaging.sms.monthlyCap",
  ]) {
    const answer = await call<Partial<Pick<Schemas["Parameter"], "value">> | null>(
      admin,
      `/parameters/${key}`,
    );
    parameters[key] = answer.status === 200 ? answer.body?.value : `HTTP ${String(answer.status)}`;
  }
  note("parameters", parameters);
  expect(parameters).toMatchObject({
    "bookings.lateCancelThresholdMinutes": 240,
    "waitlist.notifyThresholdMinutes": 30,
  });
  scene = await findScene(browser, admin, branding.body.pushPublicKey);
  // Ids truncated and members by census ordinal (`note`); N-08a's texts stay out of the record.
  note("scene", {
    ...scene,
    n08aTexts: { locales: Object.keys(scene.n08aTexts.bodyI18n) },
    pushPublicKey: scene.pushPublicKey === null ? null : "present",
  });
});

test("T-11-35 (b) R-11-15 · screen 12: the second registrant picks «Castellano» (PATCH /me {locale: es} → 200) before the cancellation — the seed has no es account", async ({
  browser,
}) => {
  test.setTimeout(300_000);
  const es = await clubsSession(browser, MEMBER_ES, "es");
  const preferences = await open12(es.page);
  expect(preferences.locale).toBe("ca");
  expect(preferences.availableLocales).toEqual(expect.arrayContaining(["ca", "es"]));
  // `messaging.reminderOptionsMinutes` as 12 reads it (CATALEG_PARAMETRES).
  expect(preferences.reminderOptionsMinutes).toEqual([60, 120, 240, 360, 720, 1440]);
  expect(preferences.modules).toEqual({ push: true, sms: true });
  // Screen 12's «Idioma» card (the shell's header has a language select of its own).
  const language = es.page
    .locator(".profile-language-card")
    .getByRole("combobox", { exact: true, name: ui.es.language });
  await expect(language).toHaveValue("ca");
  const patching = es.page.waitForResponse(isCall("PATCH", /\/api\/v1\/me$/u));
  await language.selectOption("es");
  const patched = await patching;
  expect(patched.status(), "PATCH /me").toBe(200);
  expect(((await patched.json()) as Me).account.locale).toBe("es");
  expect(patched.request().postDataJSON()).toMatchObject({ locale: "es" });
  const after = await call<Preferences>(es, "/me/notification-preferences");
  expect(after.body.locale).toBe("es");
  remember("localeEs", theScene().es.memberId);
  note("b-locale", { patch: patched.status(), preferencesLocale: after.body.locale });
});

test("T-11-39 (a)(b)(g) R-11-01 R-11-02 R-11-10 R-11-11 · D4c cancels the seeded class → N-08a on 11 first with the x icon, ERROR tone, its border and « · i per SMS», the bell quiet after read-all, [CANVIA DE CLASSE] → 04 with her dog; the mailbox message per registrant; the es registrant in Spanish; the SMS delivery", async ({
  browser,
}) => {
  test.setTimeout(480_000);
  const { ca, classA, es, n08aTexts } = theScene();
  const admin = await adminSession(browser);
  const caSession = await clubsSession(browser, MEMBER_CA, "ca");
  const esSession = await clubsSession(browser, MEMBER_ES, "es");
  const mailboxBefore = mailboxFiles();
  const n08aBefore = new Set((await recentNotices(admin, "N-08a")).map((row) => row.id));

  const { cancellation, preview } = await cancelAtD4c(admin, classA.id, adminTexts.a);
  expect(cancellation?.adminText).toBe(adminTexts.a);
  note("a-cancellation", {
    affectedBookings: cancellation?.affectedBookings ?? null,
    affectedWaitlist: cancellation?.affectedWaitlist ?? null,
    previewBookings: preview.bookings.length,
    reason: cancellation?.reason ?? null,
    waitlistCount: preview.waitlistCount,
  });

  // The engine's N-08a for each registrant, once the SMS left (« · i per SMS» needs SENT).
  const isNotice = (text: string) => (item: MeNotification) =>
    item.code === "N-08a" && item.body.includes(text) && item.channels.includes("SMS");
  cards.aCa = await waitForCard(
    caSession,
    "N-08a (a) with SMS for the ca member",
    isNotice(adminTexts.a),
  );
  cards.aEs = await waitForCard(
    esSession,
    "N-08a (a) with SMS for the es member",
    isNotice(adminTexts.a),
  );
  const aCa = theCard("aCa");
  const aEs = theCard("aEs");

  // (a) The bell rang on 03 before the visit.
  const bellBefore = await open03(caSession.page);
  expect(bellBefore.unread).toBeGreaterThan(0);
  expect(bellBefore).toMatchObject({ dot: 1, ringing: 1 });

  // 11: the new card first, as mockup 11's first one, and the visit's read-all.
  const { feed, readAll } = await open11(caSession.page);
  expect(feed.items[0]?.id).toBe(aCa.id);
  expect(readAll).toEqual({ status: 200, unreadCount: 0 });
  const first = caSession.page.locator(".notification-card").first();
  await expect(first).toHaveAttribute("data-notification-id", aCa.id);
  const view = await cardView(first);
  expect(view).toMatchObject({
    button: ui.ca.changeClass,
    buttonDisabled: false,
    code: "N-08a",
    icon: "x",
    title: aCa.title,
    tone: "error",
  });
  expect(view.borderLeft).toMatch(/^solid [1-9]/u);
  expect(view.meta.endsWith(ui.ca.viaSms)).toBe(true);
  // The body: the class's date, time and description, her dog and the quoted admin text (S11 §8).
  const classDay = classA.date === weekStart ? "avui" : null;
  expect(view.body).toBe(aCa.body.replace(/\s+/gu, " ").trim());
  expect(view.body).toContain(shortTime(classA.time));
  expect(view.body).toContain(classA.description);
  expect(view.body).toContain(ca.dogName);
  expect(view.body).toContain(`«${adminTexts.a}»`);
  if (classDay !== null) expect(view.body.toLowerCase()).toContain(classDay);
  // Rendered from N-08a's Catalan texts (R-11-01: her account's language).
  expect(aCa.title).toBe(n08aTexts.titleI18n.ca);
  expectRenderedFrom(aCa.body, n08aTexts.bodyI18n.ca, "the ca body of (a)");
  expect(aCa.action).toMatchObject({ enabled: true, type: "CHANGE_CLASS" });
  expect(aCa.action?.params.dogId).toBe(ca.dogId);
  await shot(caSession.page, "11-notificacions-core-375.png");

  // [CANVIA DE CLASSE] → 04 with her dog chosen (the chip, not only the query).
  const bookableRead = caSession.page.waitForResponse(
    (response) =>
      isCall("GET", /\/api\/v1\/me\/bookable-classes$/u)(response) &&
      new URL(response.url()).searchParams.get("dogId") === ca.dogId,
  );
  await first.getByRole("button", { exact: true, name: ui.ca.changeClass }).click();
  await caSession.page.waitForURL(
    (url) => url.pathname === "/reservar" && url.searchParams.get("dogId") === ca.dogId,
  );
  expect((await bookableRead).status(), "GET /me/bookable-classes?dogId").toBe(200);
  const chip = caSession.page.getByRole("button", {
    name: new RegExp(`^${escapeRegExp(ca.dogName)}(?: ·| \\(|$)`, "u"),
  });
  await expect(chip).toHaveAttribute("aria-pressed", "true");

  // The bell is quiet after the visit, and GET /me/home agrees (R-11-10).
  const bellAfter = await open03(caSession.page);
  expect(bellAfter).toEqual({ dot: 0, ringing: 0, unread: 0 });
  expect((await meHome(caSession)).notifications.unreadCount).toBe(0);

  // (b) The es registrant: the same notification in Spanish; the ca one stays in Catalan.
  const esFeed = await open11(esSession.page);
  expect(esFeed.feed.items[0]?.id).toBe(aEs.id);
  const esView = await cardView(feedCard(esSession.page, aEs.id));
  expect(esView).toMatchObject({
    button: ui.es.changeClass,
    code: "N-08a",
    icon: "x",
    tone: "error",
  });
  expect(esView.meta.endsWith(ui.es.viaSms)).toBe(true);
  expect(esView.body).toContain(`«${adminTexts.a}»`);
  expect(esView.body).toContain(es.dogName);
  // In Spanish: N-08a's `es` title, and every static part of its `es` body (R-11-01).
  expect(aEs.title).toBe(n08aTexts.titleI18n.es);
  expect(aEs.title).not.toBe(aCa.title);
  expect(esView.title).toBe(n08aTexts.titleI18n.es);
  expectRenderedFrom(aEs.body, n08aTexts.bodyI18n.es, "the es body of (b)");
  expectRenderedFrom(esView.body, n08aTexts.bodyI18n.es, "the es card of (b) on 11");
  const caDetail = await settledDetail(admin, aCa.id, ["EMAIL", "SMS"]);
  const esDetail = await settledDetail(admin, aEs.id, ["EMAIL", "SMS"]);
  expect(caDetail.locale).toBe("ca");
  expect(esDetail.locale).toBe("es");
  // R-11-15: what she had before the change stays as it was rendered, in Catalan.
  const esOlder = (await feedOf(esSession)).items.filter((item) => item.id !== aEs.id);
  const olderShown = esOlder[0];
  if (olderShown === undefined) throw new Error("The es member has no older notification");
  const olderDetail = await noticeDetail(admin, olderShown.id);
  expect(olderDetail.locale).toBe("ca");
  await shot(esSession.page, "11-notificacions-es-core-375.png");

  // The mailbox: one message to each registrant, whose subject is the card's title.
  await expect
    .poll(() => messagesTo(ca.email, mailboxBefore).length, { timeout: 60_000 })
    .toBeGreaterThan(0);
  await expect
    .poll(() => messagesTo(es.email, mailboxBefore).length, { timeout: 60_000 })
    .toBeGreaterThan(0);
  const toCa = messagesTo(ca.email, mailboxBefore);
  const toEs = messagesTo(es.email, mailboxBefore);
  expect(toCa.map((message) => message.subject)).toEqual([aCa.title.replaceAll("’", "'")]);
  expect(toEs.map((message) => message.subject)).toEqual([aEs.title.replaceAll("’", "'")]);
  expect(messageText(toCa[0] ?? {})).toContain(adminTexts.a);
  expect(messageText(toEs[0] ?? {})).toContain(adminTexts.a);

  // (g) The SMS: the local stack's fake/log sender, SENT (or QUEUED). The stack passes no Twilio
  // credentials to the core (and a real sender would text the seed's fictional numbers): the
  // real SMS is a staging check.
  const sms = caDetail.deliveries.filter((delivery) => delivery.channel === "SMS");
  console.log("real SMS skipped: no Twilio credentials");
  expect(sms.length).toBeGreaterThan(0);
  for (const delivery of sms) expect(["QUEUED", "SENT"]).toContain(delivery.status);

  // R-11-02: one notification per dog and audience — the registrants, the class's instructor and
  // the club's admins (staff texts are product copy), all about class A.
  let fresh: NotificationDetail[] = [];
  await expect
    .poll(
      async () => {
        const rows = (await recentNotices(admin, "N-08a")).filter((row) => !n08aBefore.has(row.id));
        fresh = [];
        for (const row of rows) fresh.push(await noticeDetail(admin, row.id));
        const audiences = fresh.map((item) => item.audience);
        return {
          admins: audiences.includes("ADMINS"),
          instructors: audiences.includes("INSTRUCTORS"),
          members: audiences.filter((audience) => audience === "MEMBER").length,
        };
      },
      { timeout: 60_000 },
    )
    .toEqual({
      admins: true,
      instructors: true,
      members: preview.bookings.length + preview.waitlistCount,
    });
  for (const item of fresh) expect(item.subject.classSessionId).toBe(classA.id);

  note("a-b-g", {
    bell: { after: bellAfter, before: bellBefore },
    card: { ...view, body: "(asserted)" },
    esCard: { ...esView, body: "(asserted)" },
    esOlder: { code: olderShown.code, locale: olderDetail.locale, title: olderShown.title },
    locales: { ca: caDetail.locale, es: esDetail.locale },
    mailbox: {
      ca: toCa.map((message) => mailEvidence(message, adminTexts.a)),
      es: toEs.map((message) => mailEvidence(message, adminTexts.a)),
    },
    r1102: fresh.map((item) => ({
      audience: item.audience ?? null,
      deliveries: deliveryStates(item),
      locale: item.locale,
    })),
    readAll,
    // S11 §8's seed body has no ring (mockup 11 and §6's example print «· Central»): recorded.
    ringInBody: classA.ringName === null ? null : aCa.body.includes(classA.ringName),
    smsDeliveries: deliveryStates(caDetail).filter((delivery) => delivery.channel === "SMS"),
    titles: { ca: aCa.title, es: aEs.title },
  });
});

test("T-11-37 (c) R-11-12 · D9 edits N-08a's ca and es bodies with the run's marker, [DESA] → 200; the next cancellation carries it in each registrant's language while the cards of (a)/(b) stay as they were; «Restaura el text per defecte» → not customized", async ({
  browser,
}) => {
  test.setTimeout(480_000);
  const { ca, es, n08aTemplateId } = theScene();
  const admin = await adminSession(browser);
  const { page } = admin;

  // D9: the N-08a row by its id, the editor, both bodies with the marker, [DESA].
  const listRead = page.waitForResponse(isCall("GET", /\/api\/v1\/message-templates$/u));
  await openRoute(page, "/comunicats", "/tauler");
  expect((await listRead).status(), "GET /message-templates").toBe(200);
  const detailRead = page.waitForResponse(
    isCall("GET", new RegExp(`/api/v1/message-templates/${n08aTemplateId}$`, "u")),
  );
  await page.locator(`[data-template-id="${n08aTemplateId}"]`).click();
  const detailResponse = await detailRead;
  expect(detailResponse.status(), "GET /message-templates/{id}").toBe(200);
  const before = (await detailResponse.json()) as TemplateDetail;
  expect(before.customized).toBe(false);
  const editor = page.getByRole("region", { name: "Editor de la plantilla" });
  await expect(editor).toBeVisible();
  const bodyField = editor.locator("#template-body");
  const language = editor.getByLabel("Idioma del text", { exact: true });
  for (const locale of ["ca", "es"] as const) {
    await language.selectOption(locale);
    const text = await bodyField.inputValue();
    expect(text.length).toBeGreaterThan(0);
    await bodyField.fill(`${text}${templateMarker}`);
  }
  const saving = page.waitForResponse(
    isCall("PUT", new RegExp(`/api/v1/message-templates/${n08aTemplateId}$`, "u")),
  );
  await editor.getByRole("button", { exact: true, name: "DESA" }).click();
  const saved = await saving;
  expect(saved.status(), "PUT /message-templates/{id}").toBe(200);
  remember("templateEdited", n08aTemplateId);
  const edited = (await saved.json()) as TemplateDetail;
  expect(edited.customized).toBe(true);
  expect(edited.bodyI18n.ca?.endsWith(templateMarker)).toBe(true);
  expect(edited.bodyI18n.es?.endsWith(templateMarker)).toBe(true);
  await expect(editor.getByRole("button", { name: "Restaura el text per defecte" })).toBeVisible();
  await language.selectOption("ca");
  await shot(page, "D9-comunicats-core-1280.png");

  // The same two members book a class both can take (the api as each member: the seed has
  // none they share after A), and D4c cancels it.
  const caSession = await clubsSession(browser, MEMBER_CA, "ca");
  const esSession = await clubsSession(browser, MEMBER_ES, "es");
  const esIds = new Set(
    (await bookableAfterMonday(esSession, es.dogId, [theScene().classA.id])).map((item) => item.id),
  );
  const shared = (await bookableAfterMonday(caSession, ca.dogId, [theScene().classA.id])).find(
    (item) => esIds.has(item.id),
  );
  if (shared === undefined) throw new Error("The two members share no BOOKABLE class for (c)");
  classes.c = shared;
  const caBooking = await bookAs(caSession, shared.id, ca.dogId);
  const esBooking = await bookAs(esSession, shared.id, es.dogId);
  remember("bookingCca", caBooking.id);
  remember("bookingCes", esBooking.id);
  await cancelAtD4c(admin, shared.id, adminTexts.c);
  const isNotice = (item: MeNotification) =>
    item.code === "N-08a" && item.body.includes(adminTexts.c);
  cards.cCa = await waitForCard(caSession, "N-08a (c) for the ca member", isNotice);
  cards.cEs = await waitForCard(esSession, "N-08a (c) for the es member", isNotice);
  const cCa = theCard("cCa");
  const cEs = theCard("cEs");
  expect(cCa.body.endsWith(templateMarker)).toBe(true);
  expect(cEs.body.endsWith(templateMarker)).toBe(true);
  expect(cCa.title).toBe(theCard("aCa").title);
  expect(cEs.title).toBe(theCard("aEs").title);
  // Each in her language: the edited `ca` and `es` bodies (the marker included) rendered in full.
  expectRenderedFrom(cCa.body, edited.bodyI18n.ca, "the ca body of (c)");
  expectRenderedFrom(cEs.body, edited.bodyI18n.es, "the es body of (c)");
  expect(cEs.title).toBe(theScene().n08aTexts.titleI18n.es);
  const cCaDetail = await noticeDetail(admin, cCa.id);
  const cEsDetail = await noticeDetail(admin, cEs.id);
  expect(cCaDetail.locale).toBe("ca");
  expect(cEsDetail.locale).toBe("es");
  const aCaDetail = await noticeDetail(admin, theCard("aCa").id);
  expect(cCaDetail.templateVersion ?? 0).toBeGreaterThan(aCaDetail.templateVersion ?? 0);

  // The history is frozen (R-11-12): the cards of (a)/(b) on screen, as they were rendered.
  await open11(caSession.page);
  await expect(feedCard(caSession.page, cCa.id).locator(".notification-card__body")).toContainText(
    templateMarker.trim(),
  );
  await expect(
    feedCard(caSession.page, theCard("aCa").id).locator(".notification-card__body"),
  ).toHaveText(theCard("aCa").body);
  await open11(esSession.page);
  await expect(feedCard(esSession.page, cEs.id).locator(".notification-card__body")).toContainText(
    templateMarker.trim(),
  );
  await expect(
    feedCard(esSession.page, theCard("aEs").id).locator(".notification-card__body"),
  ).toHaveText(theCard("aEs").body);
  const cEsShown = await cardView(feedCard(esSession.page, cEs.id));
  expect(cEsShown.title).toBe(theScene().n08aTexts.titleI18n.es);
  expectRenderedFrom(cEsShown.body, edited.bodyI18n.es, "the es card of (c) on 11");

  // «Restaura el text per defecte» → the seed again, no longer customized.
  await openRoute(page, `/comunicats?template=${n08aTemplateId}`, "/tauler");
  const reopened = page.getByRole("region", { name: "Editor de la plantilla" });
  await reopened.getByRole("button", { name: "Restaura el text per defecte" }).click();
  const confirm = page.getByRole("dialog", {
    name: "Vols restaurar el text per defecte d'aquesta plantilla?",
  });
  const resetting = page.waitForResponse(
    isCall("POST", new RegExp(`/api/v1/message-templates/${n08aTemplateId}/reset$`, "u")),
  );
  await confirm.getByRole("button", { exact: true, name: "Restaura" }).click();
  const reset = await resetting;
  expect(reset.status(), "POST /message-templates/{id}/reset").toBe(200);
  remember("templateReset", n08aTemplateId);
  const restored = (await reset.json()) as TemplateDetail;
  expect(restored.customized).toBe(false);
  expect(restored.bodyI18n.ca?.includes(templateMarker)).toBe(false);
  expect(restored.bodyI18n.es?.includes(templateMarker)).toBe(false);
  expect(restored.bodyI18n).toEqual(theScene().n08aTexts.bodyI18n);
  await expect(reopened.getByRole("button", { name: "Restaura el text per defecte" })).toHaveCount(
    0,
  );
  const reread = await call<TemplateDetail>(admin, `/message-templates/${n08aTemplateId}`);
  expect(reread.body.customized).toBe(false);
  note("c-template", {
    class: { description: shared.description, startsAtLocal: shared.startsAtLocal },
    marker: templateMarker,
    put: saved.status(),
    reset: reset.status(),
    templateVersions: {
      aNotice: aCaDetail.templateVersion ?? null,
      afterReset: restored.version,
      cNotice: cCaDetail.templateVersion ?? null,
      edited: edited.version,
      read: before.version,
    },
    titles: { ca: cCa.title, es: cEs.title },
  });
});

test("T-11-35 T-11-38 (d) R-11-03 R-11-04 · screen 12 turns «Canvis en reserves…» off under «Correu»: the next N-08a reaches the feed with « · i per SMS» and no e-mail, the log shows EMAIL «omès per preferència» and APP «lliurat»; D10 turns it back on and 12 shows it", async ({
  browser,
}) => {
  test.setTimeout(480_000);
  const { ca } = theScene();
  const admin = await adminSession(browser);
  const caSession = await clubsSession(browser, MEMBER_CA, "ca");
  const { page } = caSession;

  // Screen 12 (mockup 12's defaults), then the e-mail of CLUB_CHANGES off.
  const shown = await open12(page);
  expect(shown.emailByCategory).toMatchObject({
    CLUB_CHANGES: true,
    OPERATIONAL: false,
    PERSONAL: true,
  });
  expect(shown.smsFixed).toBe(true);
  await expect(page.locator(".profile-notices__row > span:first-child")).toHaveText([
    ...ui.ca.rows,
  ]);
  const clubChanges = page.getByRole("switch", {
    exact: true,
    name: ui.ca.emailFor(ui.ca.rows[2]),
  });
  await expect(clubChanges).toHaveAttribute("aria-checked", "true");
  await expect(
    page.locator(".profile-notices__row").filter({ hasText: ui.ca.rows[2] }),
  ).toContainText(ui.ca.sms);
  await shot(page, "12-avisos-core-375.png");
  const saving = page.waitForResponse(isCall("PUT", /\/api\/v1\/me\/notification-preferences$/u));
  await clubChanges.click();
  const saved = await saving;
  expect(saved.status(), "PUT /me/notification-preferences").toBe(200);
  expect(saved.request().postDataJSON()).toMatchObject({
    emailByCategory: { CLUB_CHANGES: false },
  });
  remember("clubChangesOff", ca.memberId);
  await expect(clubChanges).toHaveAttribute("aria-checked", "false");

  // A third class: booked as her (api), cancelled at D4c.
  const excluded = [theScene().classA.id, theClass("c").id];
  const third = (await bookableAfterMonday(caSession, ca.dogId, excluded))[0];
  if (third === undefined) throw new Error("No BOOKABLE class left for (d)");
  classes.d = third;
  const booking = await bookAs(caSession, third.id, ca.dogId);
  remember("bookingD", booking.id);
  const mailboxBefore = mailboxFiles();
  await cancelAtD4c(admin, third.id, adminTexts.d);
  cards.dCa = await waitForCard(
    caSession,
    "N-08a (d) with SMS",
    (item) =>
      item.code === "N-08a" && item.body.includes(adminTexts.d) && item.channels.includes("SMS"),
  );
  const dCa = theCard("dCa");
  const detail = await settledDetail(admin, dCa.id, ["EMAIL", "SMS"]);
  const byChannel = (channel: string) =>
    detail.deliveries
      .filter((delivery) => delivery.channel === channel)
      .map((delivery) => delivery.status);
  expect(byChannel("APP")).toEqual(["DELIVERED"]);
  expect(byChannel("EMAIL")).toEqual(["SKIPPED_BY_PREFERENCE"]);
  // SMS is never removed by a preference (R-11-04, «+SMS»).
  expect(byChannel("SMS").length).toBeGreaterThan(0);
  expect(messagesTo(ca.email, mailboxBefore)).toEqual([]);

  // Her feed: the card with « · i per SMS».
  const { feed } = await open11(page);
  expect(feed.items[0]?.id).toBe(dCa.id);
  const view = await cardView(feedCard(page, dCa.id));
  expect(view.meta.endsWith(ui.ca.viaSms)).toBe(true);

  // The admin log, filtered by N-08a: her row with EMAIL «omès per preferència» and APP «lliurat».
  const logRead = admin.page.waitForResponse(
    (response) =>
      isCall("GET", /\/api\/v1\/notifications$/u)(response) &&
      new URL(response.url()).searchParams.getAll("filter").includes("code:eq:N-08a"),
  );
  await openRoute(
    admin.page,
    `/notificacions?filter=${encodeURIComponent("code:eq:N-08a")}`,
    "/tauler",
  );
  expect((await logRead).status(), "GET /notifications?filter=code:eq:N-08a").toBe(200);
  const row = admin.page.locator(`tr[data-notification-id="${dCa.id}"]`);
  await expect(row).toHaveAttribute("data-code", "N-08a");
  await expect(row).toHaveAttribute("data-member-id", ca.memberId);
  const emailChip = row.locator(
    '[data-channel="EMAIL"][data-delivery-status="SKIPPED_BY_PREFERENCE"]',
  );
  await expect(emailChip).toHaveText("Correu · omès per preferència");
  await expect(row.locator('[data-channel="APP"][data-delivery-status="DELIVERED"]')).toHaveText(
    "App · lliurat",
  );
  await iconsPainted(admin.page);
  await shot(admin.page, "log-notificacions-n08a-core-1280.png");

  // D10 on her record: the same block, turned back on (audited PUT).
  const d10Read = admin.page.waitForResponse(
    isCall("GET", new RegExp(`/api/v1/members/${ca.memberId}/notification-preferences$`, "u")),
  );
  await openRoute(admin.page, `/abonats/${ca.memberId}`, "/tauler");
  const d10 = (await (await d10Read).json()) as Preferences;
  expect(d10.emailByCategory.CLUB_CHANGES).toBe(false);
  const block = admin.page.locator(".notification-preferences");
  await expect(
    block.getByRole("heading", { name: "Preferències d'avisos (mantenibles aquí i al perfil)" }),
  ).toBeVisible();
  const d10Switch = block.getByRole("switch", {
    exact: true,
    name: "Correu: Canvis en reserves (fets pel club)",
  });
  await expect(d10Switch).toHaveAttribute("aria-checked", "false");
  const d10Saving = admin.page.waitForResponse(
    isCall("PUT", new RegExp(`/api/v1/members/${ca.memberId}/notification-preferences$`, "u")),
  );
  await d10Switch.click();
  const d10Saved = await d10Saving;
  expect(d10Saved.status(), "PUT /members/{id}/notification-preferences").toBe(200);
  expect(d10Saved.request().postDataJSON()).toMatchObject({
    emailByCategory: { CLUB_CHANGES: true },
  });
  remember("clubChangesOn", ca.memberId);
  await expect(d10Switch).toHaveAttribute("aria-checked", "true");
  await block.scrollIntoViewIfNeeded();
  // Her contact row (e-mail and phone) is masked in the capture (no personal data in evidence).
  const contactRow = admin.page
    .locator(".census-record__data-row")
    .filter({ has: admin.page.locator("dt", { hasText: /^Contacte$/u }) })
    .locator("dd");
  await expect(contactRow).toHaveCount(1);
  await shot(admin.page, "D10-preferencies-core-1280.png", true, [contactRow]);

  // Screen 12 shows what D10 saved (the same block, two screens).
  const again = await open12(page);
  expect(again.emailByCategory.CLUB_CHANGES).toBe(true);
  await expect(
    page.getByRole("switch", { exact: true, name: ui.ca.emailFor(ui.ca.rows[2]) }),
  ).toHaveAttribute("aria-checked", "true");
  note("d-matrix", {
    class: { description: third.description, startsAtLocal: third.startsAtLocal },
    d10Put: d10Saved.status(),
    deliveries: deliveryStates(detail),
    mailboxForHer: 0,
    meta: view.meta,
    put12: saved.status(),
  });
});

test("T-11-35 (f) R-11-07 · web push in context: no permission prompt at boot nor on 12; turning the push switch on asks once and POST /push-subscriptions → 201 with the stubbed PushManager.subscribe", async ({
  browser,
}) => {
  test.setTimeout(300_000);
  const { pushPublicKey } = theScene();
  const context = await browser.newContext({ viewport: mobile });
  await context.grantPermissions(["notifications"], { origin: clubsUrl });
  await context.addInitScript((value) => {
    localStorage.setItem("agilityhub.locale", value);
  }, "ca");
  // The browser's push service is a stand-in: `PushManager.subscribe` returns a fictional
  // endpoint with the seed's fictional keys; `Notification.requestPermission` is counted.
  await context.addInitScript(
    ({ auth, endpoint, p256dh }) => {
      const state = { requests: [] as string[], subscribed: 0 };
      Reflect.set(window, "__e7Push", state);
      if (!("Notification" in window) || !("PushManager" in window)) return;
      const request = Notification.requestPermission.bind(Notification);
      Reflect.set(Notification, "requestPermission", () => {
        state.requests.push(window.location.pathname);
        return request();
      });
      const subscription = {
        endpoint,
        expirationTime: null,
        getKey: () => null,
        options: { applicationServerKey: null, userVisibleOnly: true },
        toJSON: () => ({ endpoint, expirationTime: null, keys: { auth, p256dh } }),
        unsubscribe: () => Promise.resolve(true),
      };
      const subscribe = () => {
        state.subscribed += 1;
        return Promise.resolve(subscription);
      };
      const current = () => Promise.resolve(state.subscribed > 0 ? subscription : null);
      Reflect.set(PushManager.prototype, "subscribe", subscribe);
      Reflect.set(PushManager.prototype, "getSubscription", current);
      Reflect.set(window, "__e7PushRegistration", {
        pushManager: { getSubscription: current, subscribe },
        scope: `${window.location.origin}/`,
      });
    },
    { auth: PUSH_KEYS.auth, endpoint: pushEndpoint, p256dh: PUSH_KEYS.p256dh },
  );
  // Without a VAPID key on this stack (`pushPublicKey` null: the product has none here) the app
  // rightly subscribes nothing; the stand-in browser then gets a fictional public key (the seed's
  // P-256 point) through its own `GET /branding`, said in the report.
  const injectedKey = pushPublicKey === null;
  if (injectedKey) {
    await context.route(
      (url) => url.pathname === "/api/v1/branding",
      async (route) => {
        const response = await route.fetch();
        const json = (await response.json()) as Record<string, unknown>;
        await route.fulfill({ json: { ...json, pushPublicKey: PUSH_KEYS.p256dh }, response });
      },
    );
  }
  const page = await context.newPage();
  const bearer = bearerOf(page);
  await loginClubs(page, MEMBER_PUSH, "ca");
  await expect.poll(bearer).toBeDefined();
  const session = { bearer, context, page };
  sessions.set(`clubs|${MEMBER_PUSH}|push`, session);
  const requests = () =>
    page.evaluate(() => (Reflect.get(window, "__e7Push") as { requests: string[] }).requests);
  // Never at boot (R-11-07).
  expect(await requests()).toEqual([]);
  await open12(page);
  expect(await requests()).toEqual([]);
  // The app's worker registration is handed to its push module (the dev server registers no
  // worker: `devOptions.enabled = false`), from the module the page itself loaded.
  const moduleUrl = await page.evaluate(
    () =>
      performance
        .getEntriesByType("resource")
        .map((entry) => entry.name)
        .find((name) => new URL(name).pathname === "/src/notifications/push.ts") ??
      "/src/notifications/push.ts",
  );
  await page.addScriptTag({
    content: `import { setPushRegistration } from ${JSON.stringify(moduleUrl)}; setPushRegistration(window.__e7PushRegistration); window.__e7PushHanded = true;`,
    type: "module",
  });
  await page.waitForFunction(() => Reflect.get(window, "__e7PushHanded") === true);

  const pushSwitch = page.getByRole("switch", { exact: true, name: ui.ca.push });
  await expect(pushSwitch).toHaveAttribute("aria-checked", "true");
  // Off first (the default is on): no prompt.
  let saving = page.waitForResponse(isCall("PUT", /\/api\/v1\/me\/notification-preferences$/u));
  await pushSwitch.click();
  expect((await saving).status(), "PUT /me/notification-preferences").toBe(200);
  await expect(pushSwitch).toHaveAttribute("aria-checked", "false");
  expect(await requests()).toEqual([]);
  // On: the permission is asked once, in context, and the subscription goes to the api.
  saving = page.waitForResponse(isCall("PUT", /\/api\/v1\/me\/notification-preferences$/u));
  const subscribing = page.waitForResponse(isCall("POST", /\/api\/v1\/push-subscriptions$/u));
  await pushSwitch.click();
  const subscribed = await subscribing;
  expect(subscribed.status(), "POST /push-subscriptions").toBe(201);
  const created = (await subscribed.json()) as PushCreated;
  remember("pushSubscription", created.id);
  expect((await saving).status(), "PUT /me/notification-preferences").toBe(200);
  await expect(pushSwitch).toHaveAttribute("aria-checked", "true");
  expect(await requests()).toEqual(["/perfil"]);
  const sent = subscribed.request().postDataJSON() as Schemas["PushSubscriptionRequest"];
  expect(sent).toMatchObject({ endpoint: pushEndpoint, keys: PUSH_KEYS });
  const stored = await page.evaluate(() => localStorage.getItem("agilityhub.push.subscription.v1"));
  expect(JSON.parse(stored ?? "{}")).toEqual({ id: created.id });
  await expect(
    page.getByText("Activa les notificacions al navegador per rebre-les al mòbil"),
  ).toHaveCount(0);
  // The api keeps one subscription per endpoint (an upsert, R-11-07).
  const again = await call<PushCreated & ApiProblem>(session, "/push-subscriptions", "POST", {
    deviceLabel: sent.deviceLabel ?? null,
    endpoint: pushEndpoint,
    keys: PUSH_KEYS,
  });
  pushUpsertSameId = again.body.id === created.id;
  note("f-push", {
    deviceLabel: sent.deviceLabel ?? null,
    injectedKey,
    permissionRequests: await requests(),
    post: subscribed.status(),
    upsert: { sameId: pushUpsertSameId, status: again.status },
  });
  expect([200, 201]).toContain(again.status);
});

test("T-11-38 T-11-18 (e) R-11-13 · D5 selects the ten fictional members, «Enviar comunicat» with the seeded CUSTOM template, «S'enviarà a 10 abonats», [ENVIA] → 202; the log lists ten rows of one batch; one of them sees it in her feed, a member outside it does not; the filter shape counts what D5 lists; the push subscription is deleted at logout", async ({
  browser,
}) => {
  test.setTimeout(480_000);
  const { ca, customTemplateId, es, ten } = theScene();
  const admin = await adminSession(browser);
  const { page } = admin;
  const sends: {
    body: Announcement & ApiProblem;
    dryRun: boolean;
    recipients: Schemas["AnnouncementRecipients"];
    status: number;
    templateId: string;
  }[] = [];
  const onSend = async (response: Response) => {
    if (!isCall("POST", /\/api\/v1\/message-templates\/[^/]+\/send$/u)(response)) return;
    const request = response.request().postDataJSON() as Schemas["AnnouncementRequest"];
    sends.push({
      body: (await response.json()) as Announcement & ApiProblem,
      dryRun: request.dryRun,
      recipients: request.recipients,
      status: response.status(),
      templateId: apiPath(response).split("/")[4] ?? "",
    });
  };
  page.on("response", (response) => {
    void onSend(response);
  });
  const known = new Set((await recentNotices(admin)).map((row) => row.id));

  // D5: the search, then the ten rows ticked.
  const listRead = page.waitForResponse(isMembersList(null));
  await openRoute(page, "/abonats", "/tauler");
  expect((await listRead).status(), "GET /members").toBe(200);
  const searched = page.waitForResponse(isMembersList("member"));
  await page.getByRole("searchbox", { name: "Cerca per nom, DNI, gos…" }).fill("member");
  const searchAnswer = await searched;
  expect(searchAnswer.status(), "GET /members?q=member").toBe(200);
  const listed = (await searchAnswer.json()) as MemberPage;
  for (const member of ten) {
    const box = page.getByRole("checkbox", { exact: true, name: `Selecciona ${member.fullName}` });
    await expect(box).toBeVisible();
    await box.check();
  }
  const bulk = page.locator(".ah-universal-list__bulk");
  await bulk.getByRole("button", { exact: true, name: "Enviar comunicat" }).click();
  const dialog = page.getByRole("dialog", { name: "Enviar comunicat" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("10 abonats seleccionats", { exact: true })).toBeVisible();
  const template = dialog.getByLabel("Plantilla", { exact: true });
  await expect(template.locator(`option[value="${customTemplateId}"]`)).toHaveCount(1);
  if ((await template.inputValue()) !== customTemplateId)
    await template.selectOption(customTemplateId);
  await expect
    .poll(
      () =>
        sends.find(
          (item) => item.dryRun && item.templateId === customTemplateId && item.status === 200,
        )?.body.recipientCount,
    )
    .toBe(10);
  await expect(dialog.getByText("S'enviarà a 10 abonats", { exact: true })).toBeVisible();
  await iconsPainted(dialog);
  // The modal is fixed to the viewport: the list behind it from its top (D5's title and search).
  await page.evaluate(() => {
    window.scrollTo(0, 0);
  });
  await shot(page, "D9-enviar-comunicat-core-1280.png", false);
  await dialog
    .getByRole("checkbox", { name: "Confirmo que vull enviar aquest comunicat a 10 abonats" })
    .check();
  const posting = page.waitForResponse(
    (response) =>
      isCall(
        "POST",
        new RegExp(`/api/v1/message-templates/${customTemplateId}/send$`, "u"),
      )(response) && !(response.request().postDataJSON() as Schemas["AnnouncementRequest"]).dryRun,
  );
  await dialog.getByRole("button", { exact: true, name: "ENVIA" }).click();
  const posted = await posting;
  expect(posted.status(), "POST /message-templates/{id}/send").toBe(202);
  const result = (await posted.json()) as Announcement;
  expect(result.recipientCount).toBe(10);
  expect(result.batchId ?? "").not.toBe("");
  const sentTo = (posted.request().postDataJSON() as Schemas["AnnouncementRequest"]).recipients;
  expect([...(sentTo.memberIds ?? [])].sort()).toEqual(ten.map((member) => member.id).sort());
  await expect(page.getByText("Comunicat enviat a 10 abonats")).toBeVisible();

  // The log: ten new rows, one per member, one code — the batch of the 202.
  const tenIds = new Set(ten.map((member) => member.id));
  let batch: NotificationRow[] = [];
  await expect
    .poll(
      async () => {
        batch = (await recentNotices(admin)).filter(
          (row) => !known.has(row.id) && tenIds.has(row.recipient?.memberId ?? ""),
        );
        return batch.length;
      },
      { timeout: 60_000 },
    )
    .toBe(10);
  const codes = [...new Set(batch.map((row) => row.code ?? ""))];
  expect(codes).toHaveLength(1);
  const code = codes[0] ?? "";
  expect(code).not.toBe("");
  expect(new Set(batch.map((row) => row.recipient?.memberId)).size).toBe(10);
  const others = (await recentNotices(admin, code)).filter(
    (row) => !known.has(row.id) && !tenIds.has(row.recipient?.memberId ?? ""),
  );
  expect(others).toEqual([]);
  // One batch (the log exposes no batch id): the ten rows share the event's one instant, and come
  // from one `AnnouncementSent` of the seeded template.
  const batchInstants = [...new Set(batch.map((row) => row.createdAt ?? ""))];
  expect(batchInstants).toHaveLength(1);
  const batchSample = await noticeDetail(admin, batch[0]?.id ?? "");
  expect(batchSample.eventType).toBe("AnnouncementSent");
  expect(batchSample.templateId).toBe(customTemplateId);
  // The push subscription of (f) is the api's: her announcement has a PUSH delivery to it.
  const pushMember = ten.find((member) => member.email === MEMBER_PUSH);
  const pushRow = batch.find((row) => row.recipient?.memberId === pushMember?.id);
  if (pushRow === undefined) throw new Error("No announcement row for the push member");
  let pushDetail = await noticeDetail(admin, pushRow.id);
  try {
    // The sender's answer for the fictional endpoint (a retry keeps it QUEUED: recorded as is).
    await expect
      .poll(
        async () => {
          pushDetail = await noticeDetail(admin, pushRow.id);
          return (
            pushDetail.deliveries.find((delivery) => delivery.channel === "PUSH")?.status ?? null
          );
        },
        { timeout: 30_000 },
      )
      .not.toBe("QUEUED");
  } catch {
    note("e-push-still-queued", deliveryStates(pushDetail));
  }
  const pushStatus = pushDetail.deliveries.find((delivery) => delivery.channel === "PUSH")?.status;
  if (pushStatus === undefined) {
    // No PUSH delivery on an announcement: the subscription is proven by the upsert of (f).
    expect(pushUpsertSameId).toBe(true);
  } else {
    expect(["QUEUED", "SENT", "DELIVERED", "FAILED"]).toContain(pushStatus);
  }
  const logRead = page.waitForResponse(
    (response) =>
      isCall("GET", /\/api\/v1\/notifications$/u)(response) &&
      new URL(response.url()).searchParams.getAll("filter").includes(`code:eq:${code}`),
  );
  await openRoute(
    page,
    `/notificacions?filter=${encodeURIComponent(`code:eq:${code}`)}`,
    "/tauler",
  );
  expect((await logRead).status(), `GET /notifications?filter=code:eq:${code}`).toBe(200);
  for (const row of batch) {
    await expect(page.locator(`tr[data-notification-id="${row.id}"]`)).toHaveAttribute(
      "data-code",
      code,
    );
  }
  await expect(
    page.locator(`tr[data-notification-id="${batch[0]?.id ?? ""}"] [data-channel="APP"]`),
  ).toHaveAttribute("data-delivery-status", "DELIVERED");
  await shot(page, "log-notificacions-core-1280.png");

  // One of the ten sees it in her feed with the club's text (in her language); admin@ (a member
  // outside the selection) does not.
  const caSession = await clubsSession(browser, MEMBER_CA, "ca");
  const { feed } = await open11(caSession.page);
  const announcement = feed.items[0];
  expect(announcement?.title).toBe(customTemplate.title.ca);
  expect(announcement?.body).toContain(ca.firstName);
  expect(announcement?.body).toContain(customTemplate.body.ca);
  const view = await cardView(caSession.page.locator(".notification-card").first());
  expect(view).toMatchObject({ code, title: customTemplate.title.ca });
  const esSession = await clubsSession(browser, MEMBER_ES, "es");
  const esAnnouncement = (await feedOf(esSession)).items.find((item) => item.code === code);
  expect(esAnnouncement?.title).toBe(customTemplate.title.es);
  expect(esAnnouncement?.body).toContain(customTemplate.body.es);
  expect(esAnnouncement?.body).toContain(es.firstName);
  const outside = (await feedOf(admin)).items.filter(
    (item) => item.code === code || item.title === customTemplate.title.ca,
  );
  expect(outside).toEqual([]);

  // The filter shape: D5's own query (status Alta + the search) — the dry run counts what D5 lists.
  const again = page.waitForResponse(isMembersList(null));
  await openRoute(page, "/abonats", "/tauler");
  expect((await again).status()).toBe(200);
  const searchedAgain = page.waitForResponse(isMembersList("member"));
  await page.getByRole("searchbox", { name: "Cerca per nom, DNI, gos…" }).fill("member");
  const shown = (await (await searchedAgain).json()) as MemberPage;
  // What D5 renders for its query (one page holds them all here).
  const d5Rows = page.locator(".census-page table tbody tr");
  await expect(d5Rows).toHaveCount(shown.items.length);
  sends.length = 0;
  await page
    .locator(".census-page__header")
    .getByRole("button", { exact: true, name: "Enviar comunicat" })
    .click();
  const filterDialog = page.getByRole("dialog", { name: "Enviar comunicat" });
  await expect(filterDialog.getByText("Els abonats dels filtres del llistat")).toBeVisible();
  const filterTemplate = filterDialog.getByLabel("Plantilla", { exact: true });
  if ((await filterTemplate.inputValue()) !== customTemplateId) {
    await filterTemplate.selectOption(customTemplateId);
  }
  let dry: (typeof sends)[number] | undefined;
  await expect
    .poll(() => {
      dry = sends.find(
        (item) => item.dryRun && item.templateId === customTemplateId && item.status === 200,
      );
      return dry?.body.recipientCount ?? null;
    })
    .toBe(shown.totalItems);
  expect(dry?.recipients.memberIds ?? null).toBeNull();
  expect(dry?.recipients.q).toBe("member");
  const count = shown.totalItems;
  // The rows D5 shows are the dry run's count.
  const d5Rendered = await d5Rows.count();
  expect(d5Rendered).toBe(dry?.body.recipientCount);
  await expect(
    filterDialog.getByText(new RegExp(`^S'enviarà a ${String(count)} abonats?$`, "u")),
  ).toBeVisible();
  await filterDialog.getByRole("checkbox", { name: /^Confirmo que vull enviar/u }).check();
  const filterPosting = page.waitForResponse(
    (response) =>
      isCall(
        "POST",
        new RegExp(`/api/v1/message-templates/${customTemplateId}/send$`, "u"),
      )(response) && !(response.request().postDataJSON() as Schemas["AnnouncementRequest"]).dryRun,
  );
  await filterDialog.getByRole("button", { exact: true, name: "ENVIA" }).click();
  const filterPosted = await filterPosting;
  expect(filterPosted.status(), "POST /message-templates/{id}/send (filters)").toBe(202);
  const filterResult = (await filterPosted.json()) as Announcement;
  expect(filterResult.recipientCount).toBe(count);

  // (j) The push subscription goes with the logout of its device (R-11-07): DELETE → 204.
  const push = sessions.get(`clubs|${MEMBER_PUSH}|push`);
  let deleted: null | number = null;
  if (push !== undefined) {
    await open12(push.page);
    const deleting = push.page.waitForResponse(
      isCall("DELETE", /\/api\/v1\/push-subscriptions\/[^/]+$/u),
    );
    await push.page.getByRole("button", { exact: true, name: ui.ca.logout }).click();
    deleted = (await deleting).status();
    await push.page.waitForURL((url) => url.pathname !== "/perfil");
    await push.context.close();
    sessions.delete(`clubs|${MEMBER_PUSH}|push`);
    remember("pushDeleted", String(deleted));
  }
  expect(deleted).toBe(204);
  note("e-announcement", {
    batch: {
      batchId: truncated(result.batchId),
      code,
      createdAt: batchInstants,
      eventType: batchSample.eventType ?? null,
      rows: batch.length,
    },
    filterShape: {
      d5RenderedRows: d5Rendered,
      d5TotalItems: count,
      dryRunCount: dry?.body.recipientCount ?? null,
      filters: dry?.recipients.filters ?? null,
      sent: filterPosted.status(),
      sentCount: filterResult.recipientCount,
    },
    listedBySearch: listed.totalItems,
    outsideFeed: outside.length,
    pushDelete: deleted,
    pushDelivery: pushStatus ?? null,
    rows: batch.map((row) => ({
      channels: row.channels ?? [],
      member: memberLabel(ten.find((member) => member.id === row.recipient?.memberId)?.email ?? ""),
    })),
    selection: { dryRun: 10, status: posted.status() },
    titles: { ca: announcement?.title ?? null, es: esAnnouncement?.title ?? null },
  });
});

/**
 * Step 5: S11's refusals that no screen of the run sends, answered by the core itself. Each answer
 * is recorded against the status the published contract declares and the one S11 §6 documents
 * (step 5's proposals); the gate is only that none of them changed anything — a write the core
 * accepted by mistake is undone, recorded and fails the test.
 */
test("T-11-12 T-11-16 T-11-18 T-11-20 T-11-21 E7-W03 step 5 · the core's codes and statuses for STALE_VERSION, TEMPLATE_MANDATORY, CHANNEL_NOT_ALLOWED, TEMPLATE_NOT_CATALOG, TEMPLATE_NOT_SENDABLE, NO_RECIPIENTS, INVALID_REMINDER_OPTION and PUSH_SUBSCRIPTION_INVALID", async ({
  browser,
}) => {
  test.setTimeout(300_000);
  const { ca, customTemplateId, n08aTemplateId } = theScene();
  const admin = await adminSession(browser);
  const caSession = await clubsSession(browser, MEMBER_CA, "ca");
  const read = await call<TemplateDetail>(admin, `/message-templates/${n08aTemplateId}`);
  expect(read.status).toBe(200);
  const detail = read.body;
  const update = (
    change: Partial<Schemas["MessageTemplateUpdateRequest"]>,
  ): Schemas["MessageTemplateUpdateRequest"] => ({
    body: detail.bodyI18n,
    color: detail.color,
    enabled: detail.enabled,
    icon: detail.icon,
    matrix: detail.matrix,
    smsBody: detail.smsBodyI18n ?? null,
    title: detail.titleI18n,
    version: detail.version,
    ...change,
  });
  const probe = async (session: Session, path: string, method: string, body?: unknown) => {
    const answer = await call<ApiProblem & { id?: string }>(session, path, method, body);
    return { code: answer.body.code ?? null, id: answer.body.id ?? null, status: answer.status };
  };
  const observed = {
    channelNotAllowed: await probe(
      admin,
      `/message-templates/${n08aTemplateId}`,
      "PUT",
      update({
        matrix: { ...detail.matrix, INSTRUCTORS: { ...detail.matrix.INSTRUCTORS, SMS: true } },
      }),
    ),
    invalidReminderOption: await probe(caSession, "/me/notification-preferences", "PUT", {
      reminderMinutesBefore: 7,
    }),
    noRecipients: await probe(admin, `/message-templates/${customTemplateId}/send`, "POST", {
      dryRun: false,
      recipients: { filters: ["status:eq:ACTIVE"], q: `ningu-${runId}` },
    }),
    pushSubscriptionInvalid: await probe(caSession, "/push-subscriptions", "POST", {
      endpoint: `https://push.example.test/invalid-${runId}`,
      keys: { auth: "AAAA", p256dh: "AAAA" },
    }),
    staleVersion: await probe(
      admin,
      `/message-templates/${n08aTemplateId}`,
      "PUT",
      update({ version: detail.version - 1 }),
    ),
    // Only on a mandatory template (the catalog's N-08a is one): never disable another.
    templateMandatory: detail.mandatory
      ? await probe(
          admin,
          `/message-templates/${n08aTemplateId}`,
          "PUT",
          update({ enabled: false }),
        )
      : null,
    templateNotCatalog: await probe(admin, `/message-templates/${customTemplateId}/reset`, "POST"),
    templateNotSendable: await probe(admin, `/message-templates/${n08aTemplateId}/send`, "POST", {
      dryRun: true,
      recipients: { memberIds: [ca.memberId] },
    }),
  };
  // Observed against what the generated contract declares and what S11 §6 documents (recorded for
  // step 5's proposals, never a gate: a core change must not fail the run).
  const documented: Record<keyof typeof observed, { code: string; contract: number; s11: number }> =
    {
      channelNotAllowed: { code: "CHANNEL_NOT_ALLOWED", contract: 422, s11: 400 },
      invalidReminderOption: { code: "INVALID_REMINDER_OPTION", contract: 422, s11: 400 },
      noRecipients: { code: "NO_RECIPIENTS", contract: 422, s11: 422 },
      pushSubscriptionInvalid: { code: "PUSH_SUBSCRIPTION_INVALID", contract: 422, s11: 400 },
      staleVersion: { code: "STALE_VERSION", contract: 409, s11: 409 },
      templateMandatory: { code: "TEMPLATE_MANDATORY", contract: 422, s11: 409 },
      templateNotCatalog: { code: "TEMPLATE_NOT_CATALOG", contract: 422, s11: 409 },
      templateNotSendable: { code: "TEMPLATE_NOT_SENDABLE", contract: 422, s11: 409 },
    };
  note(
    "step5-statuses",
    Object.fromEntries(
      Object.entries(observed).map(([key, answer]) => {
        const expected = documented[key as keyof typeof observed];
        return [
          key,
          answer === null
            ? { skipped: "N-08a is not mandatory on this core" }
            : {
                ...expected,
                matchesContract:
                  answer.code === expected.code && answer.status === expected.contract,
                observed: { code: answer.code, status: answer.status },
              },
        ];
      }),
    ),
  );
  // Anything the core accepted by mistake is undone (never left for the next steps).
  const undone: Record<string, number> = {};
  const after = await call<TemplateDetail>(admin, `/message-templates/${n08aTemplateId}`);
  if (after.body.version !== detail.version || !after.body.enabled) {
    undone.templateReset = (
      await call(admin, `/message-templates/${n08aTemplateId}/reset`, "POST")
    ).status;
  }
  if (observed.invalidReminderOption.status === 200) {
    undone.reminder = (
      await call(caSession, "/me/notification-preferences", "PUT", { reminderMinutesBefore: null })
    ).status;
  }
  if (observed.pushSubscriptionInvalid.id !== null) {
    undone.push = (
      await call(caSession, `/push-subscriptions/${observed.pushSubscriptionInvalid.id}`, "DELETE")
    ).status;
  }
  note("step5-undone", undone);
  // The gate: nothing the probes sent changed anything.
  expect(undone).toEqual({});
});

test("T-11-36 T-11-34 T-11-35 (i) R-11-14 · screen 30: the FAQ groups in R-05-22's order, the exclusive accordion and «Normes»; the es pass of 11 and 12: « · y por SMS», [CAMBIA DE CLASE] and the preference rows in Spanish", async ({
  browser,
}) => {
  test.setTimeout(420_000);
  const caSession = await clubsSession(browser, MEMBER_CA, "ca");
  const { page } = caSession;
  const faqRead = page.waitForResponse(isCall("GET", /\/api\/v1\/faq-entries$/u));
  const pagesRead = page.waitForResponse(isCall("GET", /\/api\/v1\/club-pages$/u));
  await openRoute(page, "/info", "/inici");
  const faqResponse = await faqRead;
  expect(faqResponse.status(), "GET /faq-entries").toBe(200);
  expect((await pagesRead).status(), "GET /club-pages").toBe(200);
  const faq = (await faqResponse.json()) as FaqEntries;
  const active = faq.items.filter((item) => item.active);
  expect(active.length).toBeGreaterThan(1);
  await expect(page.getByRole("heading", { level: 1, name: "Info" })).toBeVisible();
  await expect(page.locator(".info-faq section > h2")).toHaveText(faqCategories(active));
  const questions = page.locator(".info-faq__item > button");
  const firstQuestion = questions.nth(0);
  const secondQuestion = questions.nth(1);
  await firstQuestion.click();
  await expect(firstQuestion).toHaveAttribute("aria-expanded", "true");
  await secondQuestion.click();
  await expect(secondQuestion).toHaveAttribute("aria-expanded", "true");
  await expect(firstQuestion).toHaveAttribute("aria-expanded", "false");
  await expect(page.locator(".info-faq__answer")).toHaveCount(1);
  await shot(page, "30-info-core-375.png");
  const rules = page.getByRole("tab", { exact: true, name: "Normes" });
  await rules.click();
  await expect(rules).toHaveAttribute("aria-selected", "true");
  // The page's own title (its Markdown body may open with the same heading).
  const rulesTitle = page.locator(".info-club-page > h2").first();
  await expect(rulesTitle).toBeVisible();

  // The es pass of (a) and (d) on the same account: the UI's literals in Spanish, the bodies as
  // they were rendered (in Catalan, R-11-15).
  const esView = await clubsSession(browser, MEMBER_CA, "es");
  await open11(esView.page);
  await expect(esView.page.getByRole("heading", { level: 1, name: ui.es.title })).toBeVisible();
  for (const key of ["aCa", "dCa"] as const) {
    const view = await cardView(feedCard(esView.page, theCard(key).id));
    expect(view.meta.endsWith(ui.es.viaSms)).toBe(true);
    expect(view.button).toBe(ui.es.changeClass);
    expect(view.title).toBe(theCard(key).title);
  }
  await open12(esView.page);
  await expect(esView.page.locator(".profile-notices__header")).toContainText(ui.es.notices);
  await expect(esView.page.locator(".profile-notices__header small")).toHaveText([
    ui.es.appColumn,
    ui.es.emailColumn,
  ]);
  await expect(esView.page.locator(".profile-notices__row > span:first-child")).toHaveText([
    ...ui.es.rows,
  ]);
  await expect(
    esView.page.getByRole("switch", { exact: true, name: ui.es.emailFor(ui.es.rows[2]) }),
  ).toHaveAttribute("aria-checked", "true");
  await expect(esView.page.getByLabel(ui.es.reminder, { exact: true })).toBeVisible();
  await expect(esView.page.getByRole("switch", { exact: true, name: ui.es.push })).toBeVisible();
  note("i-info-es", {
    faqGroups: faqCategories(active),
    faqItems: active.length,
    rulesTitle: await rulesTitle.textContent(),
  });
});

test("T-11-35 (h) R-11-16 R-15-14 · «Recordatori de classe: 2 h abans» on 12, the clock two hours before her class, D11's [Simula] lists her booking and changes nothing, [Executa ara] gives one N-13 with the clock icon and no e-mail, a second run gives none", async ({
  browser,
}) => {
  test.setTimeout(480_000);
  const { ca } = theScene();
  let caSession = await clubsSession(browser, MEMBER_CA, "ca");
  const excluded = [theScene().classA.id, theClass("c").id, theClass("d").id];
  const options = await bookableAfterMonday(caSession, ca.dogId, excluded);
  const last = options.at(-1);
  if (last === undefined) throw new Error("No BOOKABLE class left for (h)");
  classes.h = last;
  const booking = await bookAs(caSession, last.id, ca.dogId);
  remember("bookingH", booking.id);
  await open12(caSession.page);
  const reminder = caSession.page.getByLabel(ui.ca.reminder, { exact: true });
  await expect(reminder).toHaveValue("");
  const saving = caSession.page.waitForResponse(
    isCall("PUT", /\/api\/v1\/me\/notification-preferences$/u),
  );
  await reminder.selectOption({ label: ui.ca.reminderTwoHours });
  const saved = await saving;
  expect(saved.status(), "PUT /me/notification-preferences").toBe(200);
  expect(saved.request().postDataJSON()).toMatchObject({ reminderMinutesBefore: 120 });
  remember("reminderSet", ca.memberId);

  // The clock: exactly `startsAt − 120 min` (R-15-14: due when startsAt − lead ≤ now).
  const [date = "", time = ""] = last.startsAtLocal.split("T");
  const due = new Date(Date.parse(clubInstant(date, time)) - 120 * 60_000).toISOString();
  expect((await setCoreClock(browser, due)).status, "POST /test/clock").toBe(200);
  const admin = await adminSession(browser);
  caSession = await clubsSession(browser, MEMBER_CA, "ca");
  // Her N-13s for this booking (the log's `subject.bookingId`), never «any N-13».
  const n13 = async (): Promise<NotificationDetail[]> => {
    const found: NotificationDetail[] = [];
    for (const row of (await recentNotices(admin, "N-13")).filter(
      (item) => item.recipient?.memberId === ca.memberId,
    )) {
      const item = await noticeDetail(admin, row.id);
      if (item.subject.bookingId === booking.id) found.push(item);
    }
    return found;
  };
  expect(await n13()).toEqual([]);
  await goTo(admin.page, "/parametres#processos");
  const mailboxBefore = mailboxFiles();

  const plan = await runJob(admin, "reminders", "Recordatoris", true);
  expect(plan.dryRun).toBe(true);
  expect(plan.effects.items.map((item) => item.entityId)).toContain(booking.id);
  const planDialog = admin.page.getByRole("dialog", {
    name: "Simulació: què faria ara · Recordatoris",
  });
  await expect(planDialog.getByText("Simulació: no s'ha aplicat cap canvi.")).toBeVisible();
  // Her booking's row in the simulation (the card prints each effect's entity and action).
  const planRow = planDialog.getByText(booking.id).first();
  await expect(planRow).toBeVisible();
  const planRowText = (await planRow.textContent()) ?? "";
  await planDialog.getByRole("button", { name: "Tanca" }).first().click();
  // R-15-08: a dry run writes nothing.
  expect(await n13()).toEqual([]);

  const run = await runJob(admin, "reminders", "Recordatoris", false);
  expect(run).toMatchObject({ dryRun: false, status: "SUCCEEDED" });
  expect(run.effects.items.map((item) => item.entityId)).toContain(booking.id);
  await expect.poll(async () => (await n13()).length, { timeout: 60_000 }).toBe(1);
  const reminderNotice = (await n13())[0];
  if (reminderNotice === undefined) throw new Error("No N-13 for her booking");
  const reminderCard = (await feedOf(caSession)).items.find(
    (item) => item.id === reminderNotice.id,
  );
  if (reminderCard === undefined) throw new Error("Her N-13 is not in her feed");
  const detail = await settledDetail(admin, reminderCard.id, ["EMAIL", "PUSH"], 30_000).catch(() =>
    noticeDetail(admin, reminderCard.id),
  );
  // OPERATIONAL is off by default (R-11-04): no e-mail.
  expect(messagesTo(ca.email, mailboxBefore)).toEqual([]);
  expect(
    detail.deliveries
      .filter((delivery) => delivery.channel === "EMAIL")
      .map((delivery) => delivery.status),
  ).not.toContain("SENT");
  const { feed } = await open11(caSession.page);
  expect(feed.items[0]?.id).toBe(reminderCard.id);
  const view = await cardView(caSession.page.locator(".notification-card").first());
  expect(view).toMatchObject({ code: "N-13", icon: "clock" });
  expect(view.body).toContain(ca.dogName);

  // A second run sends nothing (`reminderSentAt`, R-11-09).
  const second = await runJob(admin, "reminders", "Recordatoris", false);
  expect(second.status).toBe("SUCCEEDED");
  expect(second.effects.items.map((item) => item.entityId)).not.toContain(booking.id);
  expect((await n13()).length).toBe(1);
  expect(messagesTo(ca.email, mailboxBefore)).toEqual([]);
  note("h-reminder", {
    class: { description: last.description, startsAtLocal: last.startsAtLocal },
    clock: due,
    deliveries: deliveryStates(detail),
    plan: {
      counters: plan.effects.counters,
      dialogRow: planRowText,
      items: plan.effects.items.length,
      status: plan.status,
    },
    run: { counters: run.effects.counters, items: run.effects.items.length, status: run.status },
    second: {
      counters: second.effects.counters,
      items: second.effects.items.length,
      status: second.status,
    },
    title: reminderCard.title,
    view: { ...view, body: "(asserted)" },
  });
});

test("(j) cleanup for idempotence · the reminder back to «Mai», the run's booking cancelled, the es member back to Catalan; the template is the seed's, the matrix restored and the push subscription deleted", async ({
  browser,
}) => {
  test.setTimeout(300_000);
  const { ca, n08aTemplateId } = theScene();
  const caSession = await clubsSession(browser, MEMBER_CA, "ca");
  const reminder = await call<Preferences>(caSession, "/me/notification-preferences", "PUT", {
    reminderMinutesBefore: null,
  });
  const bookingH = created.bookingH;
  const cancelled =
    bookingH === undefined
      ? null
      : await call<Pick<Schemas["Booking"], "state">>(
          caSession,
          `/bookings/${bookingH}/cancellation`,
          "POST",
          {},
        );
  const esSession = await clubsSession(browser, MEMBER_ES, "es");
  const locale = await call<Me>(esSession, "/me", "PATCH", { locale: "ca" });
  const admin = await adminSession(browser);
  const template = await call<TemplateDetail>(admin, `/message-templates/${n08aTemplateId}`);
  const preferences = await call<Preferences>(
    admin,
    `/members/${ca.memberId}/notification-preferences`,
  );
  note("j-cleanup", {
    booking: cancelled === null ? null : { state: cancelled.body.state, status: cancelled.status },
    clubChanges: preferences.body.emailByCategory.CLUB_CHANGES,
    locale: { locale: locale.body.account.locale, status: locale.status },
    pushDeleted: created.pushDeleted ?? null,
    reminder: { minutes: reminder.body.reminderMinutesBefore ?? null, status: reminder.status },
    templateCustomized: template.body.customized,
  });
  expect(reminder.status).toBe(200);
  expect(reminder.body.reminderMinutesBefore ?? null).toBeNull();
  expect(cancelled?.status).toBe(200);
  expect(locale.status).toBe(200);
  expect(locale.body.account.locale).toBe("ca");
  expect(template.body.customized).toBe(false);
  expect(preferences.body.emailByCategory.CLUB_CHANGES).toBe(true);
  expect(created.pushDeleted).toBe("204");
});
