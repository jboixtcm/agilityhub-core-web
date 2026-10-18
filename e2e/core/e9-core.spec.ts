import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { type Browser, type Page, type Response } from "@playwright/test";

import {
  canonicalLayout6,
  centerCourseInRing,
  DEFAULT_MARKER_PHYSICAL_SIZE_M,
  parseSmarterTxt,
  resolvePlacedObstacles,
  runWarnings,
  type Ring as CoreRing,
} from "../../packages/course-core/src/index";

import { archivedPlacementBody, futureClassStarts } from "./e9-core-helpers";
import { expect, test } from "./oauth-token-log";

const clubsUrl = "http://127.0.0.1:4173";
const adminUrl = "http://127.0.0.1:4174";
const corePassword = requiredEnvironment("E1_CORE_PASSWORD");
const evidenceDirectory =
  process.env.CORE_EVIDENCE_DIRECTORY ?? resolve(process.cwd(), "roadmap/evidence/E9-W04");
const SMARTER = resolve(
  process.cwd(),
  "packages/course-core/fixtures/smarter/jp-s-sw_993483_sadesign.txt",
);

mkdirSync(evidenceDirectory, { recursive: true });

function requiredEnvironment(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === "") {
    throw new Error(`${name} is required`);
  }
  return value;
}

/** Every S16 exchange of the run: method, path, status, the phone it came from (no bodies). */
const courseCalls: string[] = [];
const S16_PATH =
  /\/api\/v1\/(me\/ring-setups|ring-setups|build-sessions|courses|placements|rings(\/[^/]+(\/geometry)?)?$)/u;

function record(page: Page, device: string) {
  page.on("response", (response) => {
    const url = new URL(response.url());
    if (!S16_PATH.test(url.pathname)) return;
    const query = url.searchParams.has("access_token") ? "?access_token=[redacted]" : url.search;
    courseCalls.push(
      `${device} ${response.request().method()} ${url.pathname}${query} → ${String(response.status())}`,
    );
  });
}

function note(name: string, value: unknown) {
  // A label such as «E9-W05 07» becomes `e9-w05-07`: no spaces in evidence file names.
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/gu, "-");
  writeFileSync(
    join(evidenceDirectory, `e9-core-${slug}.json`),
    `${JSON.stringify(value, null, 2)}\n`,
  );
}

async function screenshot(page: Page, name: string): Promise<void> {
  await page.evaluate(async () => document.fonts.ready);
  await page.screenshot({ fullPage: true, path: join(evidenceDirectory, name) });
}

async function submitPasswordLogin(page: Page): Promise<void> {
  const token = page.waitForResponse(
    (response) =>
      response.url().endsWith("/oauth2/token") &&
      response.request().method() === "POST" &&
      new URLSearchParams(response.request().postData() ?? "").get("grant_type") === "password",
  );
  await page.getByRole("button", { exact: true, name: "ENTRA" }).click({ noWaitAfter: true });
  expect((await token).status()).toBe(200);
}

/** The seeded club admin on clubs-admin; answers the bearer its first api call carried. */
async function adminBearer(browser: Browser): Promise<{ bearer: string; page: Page }> {
  const context = await browser.newContext({ viewport: { height: 900, width: 1280 } });
  await context.addInitScript(() => {
    localStorage.setItem("agilityhub.locale", "ca");
  });
  const page = await context.newPage();
  record(page, "admin");
  await page.goto(`${adminUrl}/entrar`);
  await page.getByLabel("Correu electrònic").fill("admin@example.test");
  const reveal = page.getByRole("button", { name: "Tinc contrasenya" });
  if (await reveal.isVisible()) await reveal.click();
  await page.getByLabel("Contrasenya").fill(corePassword);
  const request = page.waitForRequest(
    (candidate) =>
      new URL(candidate.url()).pathname.startsWith("/api/v1/") &&
      candidate.headers().authorization !== undefined,
  );
  await submitPasswordLogin(page);
  const bearer = (await request).headers().authorization;
  if (bearer === undefined) throw new Error("The admin page sent no bearer");
  await page.waitForURL("**/tauler");
  return { bearer, page };
}

/** The last bearer each members' app page sent to the api (its own calls, for `api`). */
const bearers = new WeakMap<Page, string>();

function bearerOf(page: Page): string {
  const bearer = bearers.get(page);
  if (bearer === undefined) throw new Error("The page sent no bearer yet");
  return bearer;
}

/** A member or an instructor on the members' app, 375 px (an instructor lands on 20). */
async function clubsPage(
  browser: Browser,
  email: string,
  landing: "/inici" | "/instructor/dia" | readonly ("/inici" | "/instructor/dia")[],
  device: string,
): Promise<Page> {
  const landings: readonly string[] = typeof landing === "string" ? [landing] : landing;
  const context = await browser.newContext({ viewport: { height: 812, width: 375 } });
  await context.addInitScript(() => {
    localStorage.setItem("agilityhub.locale", "ca");
  });
  const page = await context.newPage();
  record(page, device);
  page.on("request", (request) => {
    const authorization = request.headers().authorization;
    if (authorization !== undefined && new URL(request.url()).pathname.startsWith("/api/v1/")) {
      bearers.set(page, authorization);
    }
  });
  await page.goto(`${clubsUrl}/entrar`);
  await page.getByLabel("Correu electrònic").fill(email);
  const reveal = page.getByRole("button", { name: "Tinc contrasenya" });
  if (await reveal.isVisible()) await reveal.click();
  await page.getByLabel("Contrasenya", { exact: true }).fill(corePassword);
  await submitPasswordLogin(page);
  await page.waitForURL(
    (url) => landings.includes(url.pathname) || url.pathname === "/perfil-acces",
  );
  if (new URL(page.url()).pathname === "/perfil-acces") {
    // 03b: an account with more than one profile and none remembered chooses one first; a staff
    // member opens their own bookings as a member (07).
    await page
      .locator("button.profile-choice__card")
      .filter({ hasText: /^Com a alumn[ae]/u })
      .click();
    await page.waitForURL((url) => url.pathname === "/inici");
  }
  await expect(page.locator(".clubs-shell")).toBeVisible();
  return page;
}

/** In-app navigation (the app's own `popstate`). */
async function navigateSpa(page: Page, path: string): Promise<void> {
  await page.evaluate((nextPath) => {
    window.history.pushState(null, "", nextPath);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }, path);
}

interface ApiAnswer {
  body: unknown;
  status: number;
}

/** An api call from the admin's page (its origin's proxy, its bearer). */
async function api(
  page: Page,
  bearer: string,
  method: string,
  path: string,
  body?: unknown,
): Promise<ApiAnswer> {
  return page.evaluate(
    async ({ authorization, call, key, payload }) => {
      const response = await fetch(`/api/v1${call.path}`, {
        ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
        headers: {
          Authorization: authorization,
          ...(payload === undefined ? {} : { "Content-Type": "application/json" }),
          ...(call.method === "POST" ? { "Idempotency-Key": key } : {}),
        },
        method: call.method,
      });
      const text = await response.text();
      return { body: text === "" ? null : (JSON.parse(text) as unknown), status: response.status };
    },
    { authorization: bearer, call: { method, path }, key: randomUUID(), payload: body },
  );
}

/** Move the isolated test core without leaking a session across the clock change. */
async function setTestClock(browser: Browser, instant: string): Promise<ApiAnswer> {
  const call = async (page: Page, authorization?: string): Promise<ApiAnswer> =>
    page.evaluate(
      async ({ auth, value }) => {
        const response = await fetch("/api/v1/test/clock", {
          body: JSON.stringify({ instant: value }),
          headers: {
            "Content-Type": "application/json",
            ...(auth === undefined ? {} : { Authorization: auth }),
          },
          method: "POST",
        });
        const text = await response.text();
        return {
          body: text === "" ? null : (JSON.parse(text) as unknown),
          status: response.status,
        };
      },
      { auth: authorization, value: instant },
    );

  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(`${adminUrl}/entrar`);
  let answer = await call(page);
  await context.close();
  if (answer.status === 401 || answer.status === 403) {
    const admin = await adminBearer(browser);
    answer = await call(admin.page, admin.bearer);
    await admin.page.context().close();
  }
  return answer;
}

/** Monday 06:00 of the future seed week, converted from Europe/Madrid wall time. */
function forcedClockInstant(): string {
  const date = requiredEnvironment("E5_WEEK_START");
  const wall = Date.parse(`${date}T06:00:00Z`);
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      day: "2-digit",
      hour: "2-digit",
      hourCycle: "h23",
      minute: "2-digit",
      month: "2-digit",
      timeZone: "Europe/Madrid",
      year: "numeric",
    })
      .formatToParts(new Date(wall))
      .map((part) => [part.type, part.value]),
  );
  const localAtWall = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
  );
  return new Date(wall - (localAtWall - wall)).toISOString();
}

interface Seeded {
  courseName: string;
  obstacles: number;
  placementId: string;
  ringId: string;
  setupId: string;
}

/**
 * What the E9 stage needs on the fresh seed, through the api as the club admin (the demo seed has
 * no course): Muntanya's geometry (40 × 20 m, the six canonical markers A–F), a course built from
 * a Smarter fixture by course-core, its placement (course-core's resolved obstacles and warnings,
 * R-16-01/05) and the setup that shows it (R-16-07).
 */
async function seedCourses(page: Page, bearer: string): Promise<Seeded> {
  const ring = await ensureGeometry(page, bearer);

  const model = parseSmarterTxt(readFileSync(SMARTER, "utf8"), {
    sourceFileName: "jp-s-sw.txt",
  }).courseData;
  return seedPlacedCourse(page, bearer, ring, model);
}

/**
 * Muntanya's geometry (40 × 20 m, the six canonical markers A–F), stored once per stage: each test
 * of the stage can run first.
 */
async function ensureGeometry(
  page: Page,
  bearer: string,
  ringId?: string,
): Promise<{ id: string; name: string }> {
  const rings = (await api(page, bearer, "GET", "/rings")).body as {
    items: { id: string; name: string; shortName: string }[];
  };
  const ring =
    ringId === undefined
      ? (rings.items.find((item) => item.name === "Muntanya") ?? rings.items[0])
      : rings.items.find((item) => item.id === ringId);
  if (ring === undefined) throw new Error("No ring in the seed");
  const stored = await api(page, bearer, "GET", `/rings/${ring.id}/geometry`);
  if (stored.status === 200) return ring;
  const version = 0;
  const geometry = await api(page, bearer, "PUT", `/rings/${ring.id}/geometry`, {
    borderClearanceM: 1,
    doors: [],
    lengthM: 40,
    markers: canonicalLayout6(40, 20).map((marker, index) => ({
      aprilTagId: 101 + index,
      id: `e9w04-marker-${marker.label}`,
      isActive: true,
      isFixed: true,
      label: marker.label,
      markerUid: `e9w04-muntanya-${marker.label.toLowerCase()}`,
      notes: null,
      physicalHeightM: DEFAULT_MARKER_PHYSICAL_SIZE_M,
      physicalWidthM: DEFAULT_MARKER_PHYSICAL_SIZE_M,
      role: "reference",
      rotationYDeg: 0,
      xM: marker.xMeters,
      yM: marker.yMeters,
      zM: 0,
    })),
    noGoZones: [],
    notes: null,
    orientationDeg: null,
    surface: null,
    version,
    widthM: 20,
  });
  expect(geometry.status).toBe(200);
  return ring;
}

/**
 * A course from the model, its placement on the ring and, unless `withSetup` is false (a planned
 * placement nobody has built yet), the setup that shows it (R-16-07).
 */
async function seedPlacedCourse(
  page: Page,
  bearer: string,
  ring: { id: string; name: string },
  model: ReturnType<typeof parseSmarterTxt>["courseData"],
  options: { label: string; withSetup: boolean } = { label: "E9-W04", withSetup: true },
): Promise<Seeded> {
  const courseName = `Jumping ${options.label} ${String(Date.now() % 10_000)}`;
  const course = await api(page, bearer, "POST", "/courses", {
    discipline: "JUMPING",
    levelIds: [],
    name: { ca: courseName },
    normalizedJson: model,
    schemaVersion: 1,
    source: "EDITOR",
    tags: [],
    visibility: "CLUB",
  });
  expect(course.status).toBe(201);
  const created = course.body as { id: string; version: number };

  // The ring as course-core reads it (course-ui's `ringToCore` of the geometry just stored).
  const coreRing: CoreRing = {
    borderClearanceMeters: 1,
    doors: [],
    id: ring.id,
    label: ring.name,
    lengthMeters: 40,
    noGoZones: [],
    obstacleInventory: {},
    widthMeters: 20,
  };
  const placement = centerCourseInRing(model, coreRing);
  const warnings = runWarnings(model, placement, coreRing);
  const placed = await api(page, bearer, "POST", "/placements", {
    courseId: created.id,
    courseVersion: created.version,
    force: warnings.some((warning) => warning.severity === "critical"),
    placementMode: "CENTERED",
    resolvedObstacles: resolvePlacedObstacles(model, placement).map((obstacle) => ({
      ...obstacle,
      numbers: [...obstacle.numbers],
    })),
    ringId: ring.id,
    transform: {
      flipX: placement.flipX,
      flipY: placement.flipY,
      offsetXM: placement.offsetXMeters,
      offsetYM: placement.offsetYMeters,
      rotationDeg: placement.rotationDegrees,
    },
    warnings,
  });
  expect(placed.status).toBe(201);
  const placementBody = placed.body as { id: string; resolvedObstacles: unknown[] };

  let setupId = "";
  if (options.withSetup) {
    const setup = await api(page, bearer, "POST", "/ring-setups", {
      kind: "JUMPING",
      levelIds: [],
      placementId: placementBody.id,
      ringId: ring.id,
    });
    expect(setup.status).toBe(201);
    setupId = (setup.body as { setup: { id: string } }).setup.id;
  }
  const seeded = {
    courseName,
    obstacles: placementBody.resolvedObstacles.length,
    placementId: placementBody.id,
    ringId: ring.id,
    setupId,
  };
  note(options.withSetup ? "seeded" : `seeded-${options.label}`, {
    ...seeded,
    warnings: warnings.map((warning) => warning.ruleId),
  });
  return seeded;
}

function obstacleList(page: Page) {
  return page.getByRole("list", { name: "Obstacles" });
}

function isFinish(response: Response): boolean {
  return (
    response.request().method() === "POST" &&
    /\/build-sessions\/[^/]+\/finish$/u.test(new URL(response.url()).pathname)
  );
}

let forcedClockMoved = false;
let forcedCoreNow: Date | undefined;

test.beforeAll(async ({ browser }) => {
  if (process.env.E9_FORCE_BARE_RING_UNDO !== "1") return;
  const instant = forcedClockInstant();
  const answer = await setTestClock(browser, instant);
  note("forced-clock", { instant, status: answer.status });
  expect(answer.status, "POST /test/clock for the forced bare-ring evidence run").toBe(200);
  forcedClockMoved = true;
  forcedCoreNow = new Date(instant);
});

test.afterAll(async ({ browser }) => {
  writeFileSync(join(evidenceDirectory, "e9-core-course-calls.log"), `${courseCalls.join("\n")}\n`);
  if (!forcedClockMoved) return;
  const restored = await setTestClock(browser, new Date().toISOString());
  note("forced-clock-restored", { status: restored.status });
  expect(restored.status, "restore POST /test/clock after forced bare-ring evidence").toBe(200);
});

test("E9-W04 · T-16-16 against the core: the member's viewer, registering, and a build session on two phones (R-16-09, R-16-07, R-16-11)", async ({
  browser,
}) => {
  test.setTimeout(420_000);
  const admin = await adminBearer(browser);
  const seeded = await seedCourses(admin.page, admin.bearer);

  // 1. A member opens the ring's viewer: read-only, the api's member projection (R-16-09).
  const member = await clubsPage(browser, "member@example.test", "/inici", "member");
  await navigateSpa(member, `/recorreguts/muntat/${seeded.ringId}`);
  await expect(member.getByText("Jumping", { exact: true })).toBeVisible();
  await expect(
    member.getByText(forcedCoreNow === undefined ? "muntat avui" : /^muntat /u),
  ).toBeVisible();
  await expect(member.getByRole("button", { name: "Marca com a desmuntat" })).toHaveCount(0);
  await expect(member.getByRole("button", { name: "Sessió de muntatge" })).toHaveCount(0);
  await screenshot(member, "core-visor-alumne-375.png");

  // 2. Two instructors' phones: A starts the live session, B joins with its code.
  const phoneA = await clubsPage(browser, "instructor@example.test", "/instructor/dia", "phoneA");
  const phoneB = await clubsPage(browser, "instructor.2@example.test", "/instructor/dia", "phoneB");
  await navigateSpa(phoneA, `/recorreguts/${seeded.setupId}`);
  await expect(phoneA.getByRole("img", { name: `Plànol de ${seeded.courseName}` })).toBeVisible();
  await expect(
    phoneA.getByText(forcedCoreNow === undefined ? /^muntat avui per /u : /^muntat .+ per /u),
  ).toBeVisible();
  await screenshot(phoneA, "core-visor-instructor-375.png");
  const started = phoneA.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname === "/api/v1/build-sessions",
  );
  await phoneA.getByRole("button", { name: "Sessió de muntatge" }).click();
  const startedResponse = await started;
  expect(startedResponse.status()).toBe(201);
  expect(startedResponse.request().headers()["idempotency-key"]).toMatch(/[0-9a-f-]{36}/u);
  const session = (await startedResponse.json()) as { id: string; joinCode: string };
  await phoneA.waitForURL(`**/instructor/muntatge/${session.id}`);
  await expect(obstacleList(phoneA).getByRole("button")).toHaveCount(seeded.obstacles);
  // The live transport: the core's SSE stream with the token as a query parameter (R-16-11).
  await expect
    .poll(() =>
      courseCalls.some((line) =>
        line.startsWith(`phoneA GET /api/v1/build-sessions/${session.id}/events?access_token=`),
      ),
    )
    .toBe(true);

  await navigateSpa(phoneB, `/recorreguts/${seeded.setupId}`);
  await phoneB.getByLabel("Codi d'una sessió de muntatge").fill(session.joinCode.toLowerCase());
  await phoneB.getByRole("button", { name: "Uneix-t'hi" }).click();
  await phoneB.waitForURL(`**/instructor/muntatge/${session.id}`);
  await expect(obstacleList(phoneB).getByRole("button")).toHaveCount(seeded.obstacles);
  // E9-T07: an INSTRUCTOR reads the ring record directly (`GET /rings/{id}`), with its geometry:
  // its name and, for each obstacle, the two nearest markers a builder measures from.
  await expect(phoneB.getByText("Muntanya", { exact: true })).toBeVisible();
  await expect
    .poll(() =>
      courseCalls.some((line) => /^phoneB GET \/api\/v1\/rings\/[^/]+ → 200$/u.test(line)),
    )
    .toBe(true);
  await expect(
    obstacleList(phoneB)
      .getByRole("button")
      .nth(0)
      .getByText(/ · [A-F] a \d+,\d{2} m · [A-F] a /u),
  ).toBeVisible();

  // 3. Each tap reaches the other phone through the stream (R-16-11: «< 2 s» on the api side).
  const firstA = obstacleList(phoneA).getByRole("button").nth(0);
  const firstB = obstacleList(phoneB).getByRole("button").nth(0);
  const tapAt = Date.now();
  await firstA.click();
  await expect(firstB).toHaveAccessibleName(/col·locat\. Toca per passar a per revisar\.$/u, {
    timeout: 5000,
  });
  const seenAfterMs = Date.now() - tapAt;
  const secondA = obstacleList(phoneA).getByRole("button").nth(1);
  const secondB = obstacleList(phoneB).getByRole("button").nth(1);
  await secondB.click();
  await expect(secondA).toHaveAccessibleName(/col·locat\. Toca per passar a per revisar\.$/u, {
    timeout: 5000,
  });
  note("live", { seenOnTheOtherPhoneAfterMs: seenAfterMs });
  await expect(phoneA.getByText("en curs", { exact: true })).toBeVisible();
  await expect(phoneB.getByText("en curs", { exact: true })).toBeVisible();
  await screenshot(phoneA, "core-sessio-telefon-a-375.png");
  await screenshot(phoneB, "core-sessio-telefon-b-375.png");

  // 4. FINALITZA on A registers the setup (an INSTRUCTOR with courses.allowInstructorPublish on);
  // B learns the session closed from the stream's `finished`.
  const finished = phoneA.waitForResponse(isFinish);
  await phoneA.getByRole("button", { name: "FINALITZA" }).click();
  const finishedResponse = await finished;
  expect(finishedResponse.status()).toBe(200);
  const closed = (await finishedResponse.json()) as { setupId: string | null; status: string };
  expect(closed.status).toBe("COMPLETED");
  expect(closed.setupId).not.toBeNull();
  await expect(phoneA.getByText("Sessió acabada: el muntatge ha quedat registrat.")).toBeVisible();
  await expect(phoneB.getByText("La sessió de muntatge s'ha acabat.")).toBeVisible({
    timeout: 10_000,
  });
  await expect(phoneB.getByRole("button", { name: "FINALITZA" })).toHaveCount(0);
  await screenshot(phoneB, "core-sessio-tancada-telefon-b-375.png");

  // E9-W06 / R-16-16: the setup the build session renewed is still placement-only. The member
  // projection carries its course and ring frame, so the 375 px viewer draws the numbered plan.
  await navigateSpa(member, `/recorreguts/muntat/${seeded.ringId}`);
  const builtPlan = member.getByRole("img", { name: `Plànol de ${seeded.courseName}` });
  await expect(builtPlan).toBeVisible();
  await expect(builtPlan.getByText("1", { exact: true }).first()).toBeVisible();
  await screenshot(member, "core-visor-alumne-muntatge-375.png");

  // 5. «Registra què hi ha muntat» on another ring in three taps: the library's course (T-16-16).
  const rings = (await api(admin.page, admin.bearer, "GET", "/rings")).body as {
    items: { id: string; name: string }[];
  };
  const other = rings.items.find((item) => item.id !== seeded.ringId);
  if (other === undefined) throw new Error("A second ring is needed");
  await navigateSpa(phoneA, `/instructor/pistes/${other.id}/muntat`);
  await expect(
    phoneA.getByRole("heading", { level: 1, name: "Registra què hi ha muntat" }),
  ).toBeVisible();
  await phoneA.getByRole("button", { exact: true, name: "Jumping" }).click();
  await phoneA.getByRole("button", { name: "Un recorregut de la biblioteca" }).click();
  await phoneA.getByRole("radio", { name: new RegExp(seeded.courseName, "u") }).check();
  const registered = phoneA.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname === "/api/v1/ring-setups",
  );
  await phoneA.getByRole("button", { name: "REGISTRA" }).click();
  expect((await registered).status()).toBe(201);
  await expect(phoneA.getByText(/^Registrat com a muntat/u)).toBeVisible();
  await expect(phoneA.getByRole("img", { name: `Plànol de ${seeded.courseName}` })).toBeVisible();
  await screenshot(phoneA, "core-registrat-375.png");

  // 6. The member reads it on the viewer of that ring too, drawn from the course (R-16-16).
  await navigateSpa(member, `/recorreguts/muntat/${other.id}`);
  await expect(member.getByRole("img", { name: `Plànol de ${seeded.courseName}` })).toBeVisible();
  await screenshot(member, "core-visor-alumne-biblioteca-375.png");
});

/**
 * The signed uploads of `POST /courses/upload-urls`: each grant's purpose, and the PUT of the file
 * to its url (host, the first path segments and the status: never the signature or the key).
 */
function recordUploads(page: Page): () => Promise<string[]> {
  const grants: Promise<{ line: string; target: string }>[] = [];
  const puts: { status: number; url: URL }[] = [];
  const short = (url: URL) => `${url.host}${url.pathname.split("/").slice(0, 4).join("/")}/…`;
  page.on("response", (response) => {
    const url = new URL(response.url());
    const method = response.request().method();
    if (method === "POST" && url.pathname === "/api/v1/courses/upload-urls") {
      const purpose =
        (JSON.parse(response.request().postData() ?? "{}") as { purpose?: string }).purpose ?? "?";
      grants.push(
        response.json().then((grant: { uploadUrl: string }) => {
          const target = new URL(grant.uploadUrl, response.url());
          return {
            line: `grant ${purpose} → ${String(response.status())} (${short(target)})`,
            target: `${target.host}${target.pathname}`,
          };
        }),
      );
    }
    if (method === "PUT") puts.push({ status: response.status(), url });
  });
  return async () => {
    const answered = await Promise.all(grants);
    return answered.flatMap((grant) => [
      grant.line,
      ...puts
        .filter((put) => `${put.url.host}${put.url.pathname}` === grant.target)
        .map((put) => `PUT ${short(put.url)} → ${String(put.status)}`),
    ]);
  };
}

function isCall(method: string, path: RegExp) {
  return (response: Response) =>
    response.request().method() === method && path.test(new URL(response.url()).pathname);
}

test("E9-W05 · T-16-15 against the core: D18's library and import wizard, the course page, the placement editor, the stored build sheet and «Registra-ho com a muntat» (R-16-02, R-16-05, R-16-10, R-16-07)", async ({
  browser,
}) => {
  test.setTimeout(420_000);
  const admin = await adminBearer(browser);
  const ring = await ensureGeometry(admin.page, admin.bearer);
  const page = admin.page;
  const readUploads = recordUploads(page);

  // 1. D18 from the sidebar: the club's library on the real core.
  await page.getByRole("link", { exact: true, name: "Recorreguts" }).click();
  await page.waitForURL("**/recorreguts**");
  await expect(
    page.getByRole("heading", { level: 1, name: "Biblioteca de recorreguts" }),
  ).toBeVisible();
  await expect(page.getByRole("table", { name: "Llistat de recorreguts" })).toBeVisible();
  await screenshot(page, "core-D18-biblioteca-1280.png");

  // 2. The import wizard: a Smarter file read in the browser (R-16-02), its source and thumbnail
  // uploaded through `POST /courses/upload-urls`, then `POST /courses`.
  await page.getByRole("button", { name: "Nou recorregut" }).click();
  await page.getByRole("menuitem", { name: "Importa un fitxer Smarter (.txt)" }).click();
  const dialog = page.getByRole("dialog", { name: "Importa un fitxer Smarter" });
  await dialog.getByLabel("Tria el fitxer .txt que exporta Smarter").setInputFiles(SMARTER);
  await expect(dialog.getByText(/obstacles$/u).first()).toBeVisible();
  await screenshot(page, "core-D18-importa-1280.png");
  const creating = page.waitForResponse(isCall("POST", /^\/api\/v1\/courses$/u));
  await dialog.getByRole("button", { name: "Desa el recorregut" }).click();
  const createdResponse = await creating;
  expect(createdResponse.status()).toBe(201);
  expect(createdResponse.request().headers()["idempotency-key"]).toMatch(/[0-9a-f-]{36}/u);
  const course = (await createdResponse.json()) as { id: string; name: string };
  await page.waitForURL(`**/recorreguts/${course.id}`);
  await expect(page.getByRole("tab", { name: "Plànol" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("img", { name: /^Plànol de / }).first()).toBeVisible();
  await screenshot(page, "core-D18-recorregut-1280.png");

  // 3. The placement editor on the ring with geometry, saved (with `force` when the api refuses
  // critical warnings, R-16-05: the ADMIN confirms).
  await page.getByRole("button", { name: "Col·loca en una pista" }).click();
  await page.waitForURL(/\/col-locacio(\?.*)?$/u);
  await expect(
    page.getByRole("img", { name: `Recorregut col·locat a ${ring.name}` }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Centra" }).click();
  await page.getByLabel("Nom de la col·locació").fill("Dissabte matí E9-W05");
  const placing = page.waitForResponse(isCall("POST", /^\/api\/v1\/placements$/u));
  await page.getByRole("button", { name: "DESA LA COL·LOCACIÓ" }).click();
  let placedResponse = await placing;
  const forced = placedResponse.status() === 422;
  if (forced) {
    expect(((await placedResponse.json()) as { code: string }).code).toBe("PLACEMENT_BLOCKED");
    await expect(
      page.getByText(
        "Vols desar-la igualment? Quedarà registrat que l'has desada amb avisos crítics.",
      ),
    ).toBeVisible();
    await screenshot(page, "core-D18-col-locacio-force-1280.png");
    const forcing = page.waitForResponse(isCall("POST", /^\/api\/v1\/placements$/u));
    await page.getByRole("button", { name: "Desa igualment" }).click();
    placedResponse = await forcing;
  }
  expect(placedResponse.status()).toBe(201);
  const placement = (await placedResponse.json()) as { id: string; ringId: string };
  expect(placement.ringId).toBe(ring.id);
  await expect(page.getByText("Col·locació desada.")).toBeVisible();
  await screenshot(page, "core-D18-col-locacio-1280.png");

  // 4. The build sheet: rendered in the browser, uploaded (BUILD_SHEET) and bound to the placement
  // (R-16-10), then offered back from the core («Full desat», T-16-19).
  const binding = page.waitForResponse(
    isCall("POST", new RegExp(`^/api/v1/placements/${placement.id}/build-sheet$`, "u")),
  );
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Full de muntatge" }).click();
  const sheet = await download;
  expect(sheet.suggestedFilename()).toMatch(/\.pdf$/u);
  await sheet.saveAs(join(evidenceDirectory, "core-full-de-muntatge.pdf"));
  expect((await binding).status()).toBe(200);
  const reading = page.waitForResponse(
    isCall("GET", new RegExp(`^/api/v1/placements/${placement.id}/build-sheet$`, "u")),
  );
  const storedDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Full desat" }).click();
  expect((await reading).status()).toBe(200);
  const stored = await storedDownload;
  expect(stored.suggestedFilename()).toMatch(/\.pdf$/u);
  await stored.saveAs(join(evidenceDirectory, "core-full-de-muntatge-desat.pdf"));

  // 5. «Registra-ho com a muntat» from the editor: the ring's setup now shows this placement.
  await page.getByRole("button", { name: "Registra-ho com a muntat" }).click();
  const setupDialog = page.getByRole("dialog", { name: "Registra-ho com a muntat" });
  await expect(setupDialog).toBeVisible();
  await screenshot(page, "core-D18-registra-1280.png");
  const registering = page.waitForResponse(isCall("POST", /^\/api\/v1\/ring-setups$/u));
  await setupDialog.getByRole("button", { name: "REGISTRA" }).click();
  const registered = await registering;
  expect(registered.status()).toBe(201);
  const setup = (await registered.json()) as { setup: { placementId: string | null } };
  expect(setup.setup.placementId).toBe(placement.id);
  await expect(
    page.getByText(new RegExp(`^Registrat com a muntat a ${ring.name}`, "u")),
  ).toBeVisible();

  // 6. Back in the library (in-app links): the import is set up on that ring.
  await page.getByRole("link", { name: `‹ ${course.name}` }).click();
  await page.getByRole("link", { name: "‹ Biblioteca de recorreguts" }).click();
  const row = page.getByRole("row").filter({ hasText: course.name }).first();
  await expect(row).toContainText(ring.name);
  await screenshot(page, "core-D18-biblioteca-importat-1280.png");

  const uploads = await readUploads();
  note("admin", {
    course: { id: course.id, name: course.name },
    forced,
    placementId: placement.id,
    ring: ring.name,
    uploads,
  });
  // Every grant the flow asked for (the import's and the build sheet's) was followed by its PUT to
  // the storage, and every one succeeded.
  const grants = uploads.filter((line) => line.startsWith("grant "));
  const puts = uploads.filter((line) => line.startsWith("PUT "));
  expect(grants.some((line) => line.startsWith("grant BUILD_SHEET → 201"))).toBe(true);
  expect(puts).toHaveLength(grants.length);
  expect(puts.every((line) => / → 2\d\d$/u.test(line))).toBe(true);
});

interface PlannedClass {
  bookingId: string;
  classSessionId: string;
  placementId: string;
  courseName: string;
  /** A one-off class the test added to the week (cancelled at its end). */
  createdForTheTest: boolean;
}

/**
 * What a test changed on the stage's core (E9-W05 round 2 #2): each mutable resource is undone in
 * reverse order, so the next test (or retry) finds the seed's preconditions. A LIVE build session
 * has no abandon operation in E9-T07; the note records that it remains open until P9 closes it.
 */
type Undo = { label: string; run: () => Promise<ApiAnswer> }[];

/** Runs every undo step, newest first; a step that fails never stops the others. */
async function runUndo(undo: Undo): Promise<string[]> {
  const problems: string[] = [];
  for (const step of [...undo].reverse()) {
    try {
      const answer = await step.run();
      if (answer.status >= 300) {
        problems.push(`${step.label} → ${String(answer.status)} ${codeOf(answer)}`);
      }
    } catch (error) {
      problems.push(`${step.label}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return problems;
}

/** What the running test changed on the core; `afterEach` undoes it. */
let pendingUndo: Undo = [];
let liveSessionsLeftForP9: string[] = [];

// After every test, a timed-out one included: the undo runs, newest first. An undo that fails
// fails a test that passed, and is only attached to one that already failed (never hiding its
// first error).
test.afterEach(async () => {
  if (pendingUndo.length === 0) return;
  const testInfo = test.info();
  const undo = pendingUndo;
  pendingUndo = [];
  const liveSessions = liveSessionsLeftForP9;
  liveSessionsLeftForP9 = [];
  const problems = await runUndo(undo);
  note("undo", {
    liveSessionsLeftForP9: liveSessions,
    note:
      liveSessions.length === 0
        ? "No LIVE build session left open"
        : "No abandon operation: each LIVE session stays open until P9 closes it",
    problems,
    steps: undo.map((step) => step.label),
    testStatus: testInfo.status,
  });
  if (problems.length === 0) return;
  testInfo.annotations.push({ description: problems.join("; "), type: "undo failed" });
  if (testInfo.status === testInfo.expectedStatus) {
    throw new Error(`The test could not undo its changes: ${problems.join("; ")}`);
  }
});

/** `DELETE /rings/{id}/geometry` at its stored version (R-16-04). */
async function deleteGeometry(
  admin: { bearer: string; page: Page },
  ringId: string,
): Promise<ApiAnswer> {
  const stored = await api(admin.page, admin.bearer, "GET", `/rings/${ringId}/geometry`);
  if (stored.status !== 200) return stored;
  const version = (stored.body as { version: number }).version;
  return api(
    admin.page,
    admin.bearer,
    "DELETE",
    `/rings/${ringId}/geometry?version=${String(version)}`,
  );
}

/** `PUT /placements/{id}` with `status: ARCHIVED`: the stored placement, archived (its geometry can go). */
async function archivePlacement(
  admin: { bearer: string; page: Page },
  placementId: string,
): Promise<ApiAnswer> {
  const stored = await api(admin.page, admin.bearer, "GET", `/placements/${placementId}`);
  if (stored.status !== 200) return stored;
  const placement = stored.body as Record<string, unknown>;
  return api(
    admin.page,
    admin.bearer,
    "PUT",
    `/placements/${placementId}`,
    archivedPlacementBody(placement),
  );
}

/** `PATCH /class-sessions/{id} {placementId}` at the class's stored version (R-16-13). */
async function planClass(
  admin: { bearer: string; page: Page },
  classSessionId: string,
  placementId: string | null,
): Promise<ApiAnswer & { previous: string | null }> {
  const session = await api(admin.page, admin.bearer, "GET", `/class-sessions/${classSessionId}`);
  const stored = session.body as { placementId?: string | null; version: number };
  const patched = await api(
    admin.page,
    admin.bearer,
    "PATCH",
    `/class-sessions/${classSessionId}`,
    {
      placementId,
      version: stored.version,
    },
  );
  return { ...patched, previous: stored.placementId ?? null };
}

/** Today's date and time at the club («YYYY-MM-DD», «HH:mm»). */
function clubNow(timeZone: string, instant = new Date()): { date: string; time: string } {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      day: "2-digit",
      hour: "2-digit",
      hourCycle: "h23",
      minute: "2-digit",
      month: "2-digit",
      timeZone,
      year: "numeric",
    })
      .formatToParts(instant)
      .map((part) => [part.type, part.value]),
  );
  return {
    date: `${parts.year ?? ""}-${parts.month ?? ""}-${parts.day ?? ""}`,
    time: `${parts.hour ?? ""}:${parts.minute ?? ""}`,
  };
}

function addDays(date: string, days: number): string {
  const day = new Date(`${date}T12:00:00Z`);
  day.setUTCDate(day.getUTCDate() + days);
  return day.toISOString().slice(0, 10);
}

/** A one-off class the test may add to the seeded week: its day, times and an instructor. */
interface NewClassSlot {
  date: string;
  endTime: string;
  instructorIds: string[];
  startTime: string;
}

/**
 * Free hours on `ringId` left in the seeded (VALIDATED) week, from the admin's day grid (instructor
 * view): from the club-local today (an hour or more from now) to Sunday, two per day at most, with
 * the instructors of a class of that week. Each day grid read is noted (the evidence of a run that
 * finds none).
 */
async function newClassSlots(
  admin: { bearer: string; page: Page },
  ringId: string,
): Promise<NewClassSlot[]> {
  // The club's zone comes with any day grid.
  const utcToday = new Date().toISOString().slice(0, 10);
  const probe = await api(admin.page, admin.bearer, "GET", `/day-grid?date=${utcToday}`);
  const timeZone = (probe.body as { timeZone?: string } | null)?.timeZone ?? "Europe/Madrid";
  const now = clubNow(timeZone, forcedCoreNow);
  const hour = Number(now.time.slice(0, 2));
  const slots: Omit<NewClassSlot, "instructorIds">[] = [];
  const seen: string[] = [];
  for (let offset = 0; offset < 7; offset += 1) {
    const date = addDays(now.date, offset);
    const grid = await api(
      admin.page,
      admin.bearer,
      "GET",
      `/day-grid?date=${date}&view=instructor`,
    );
    if (grid.status !== 200) {
      seen.push(`${date}: GET /day-grid → ${String(grid.status)} ${codeOf(grid)}`);
      break;
    }
    const day = grid.body as {
      dayOfWeek: string;
      rows: {
        cells: { classId?: string; kind: string; ringId?: string | null; state?: string }[];
        time: string;
      }[];
    };
    seen.push(
      `${date} ${day.dayOfWeek}: ${day.rows
        .map(
          (row) =>
            `${row.time} ${row.cells.map((cell) => `${cell.kind}/${cell.state ?? "-"}`).join("+")}`,
        )
        .join(", ")}`,
    );
    // The hours a cell of the ring touches (a 16:30 class keeps 16:00 and 17:00 busy).
    const busy = new Set(
      day.rows
        .filter((row) => row.cells.some((cell) => cell.ringId === ringId))
        .flatMap((row) => {
          const start = Number(row.time.slice(0, 2));
          return row.time.endsWith(":00") ? [start] : [start, start + 1];
        }),
    );
    const first = offset === 0 ? hour + 2 : 10;
    const free = futureClassStarts(first, busy);
    for (const start of new Set(free)) {
      slots.push({
        date,
        endTime: `${String(start + 1).padStart(2, "0")}:00`,
        startTime: `${String(start).padStart(2, "0")}:00`,
      });
    }
    if (day.dayOfWeek === "SUNDAY") break;
  }
  // Sunday has no seeded class from which to recover an instructor. The catalog is the canonical
  // source and lets the run create a future Sunday class without ever considering a past slot.
  const instructors = await api(admin.page, admin.bearer, "GET", "/instructors");
  const instructor = (
    instructors.status === 200
      ? (instructors.body as { items: { active: boolean; id: string }[] }).items
      : []
  ).find((item) => item.active);
  const instructorIds = instructor === undefined ? [] : [instructor.id];
  note("new-class-slots", { clubNow: now, instructorIds, seen, slots, timeZone });
  return instructorIds.length === 0 ? [] : slots.map((slot) => ({ ...slot, instructorIds }));
}

interface Candidate {
  /** The account's ACTIVE booking on the class; "" = to book. */
  bookingId: string;
  /** The class; "" for a class the test creates (`create`). */
  id: string;
  /** A one-off class for the dog's level the admin adds to the week (cancelled at the end). */
  create?: NewClassSlot;
  ringId: string | undefined;
}

/**
 * A staff member's own booking on a class of a ring with a placement, and that placement planned
 * for the class (R-16-13, `PATCH /class-sessions/{id} {placementId}`): screen 07 of a staff member.
 * An ACTIVE booking the account already has comes first; then a class it can book as a member does
 * (`/me/bookable-classes` → `POST /seat-holds` → `POST /bookings`); last, a one-off class for the
 * dog's level that the admin adds to the seeded week on the planned ring (`POST /class-sessions`;
 * the seed's puppy has no CAD class after Saturday 09:30, and nothing is seeded on Sunday). `string`
 * when none is possible on the run's day: the reason. Every change it makes goes onto `undo`.
 */
async function plannedClassOf(
  phone: Page,
  admin: { bearer: string; page: Page },
  planned: Seeded,
  model: ReturnType<typeof parseSmarterTxt>["courseData"],
  undo: Undo,
): Promise<PlannedClass | string> {
  const bearer = bearerOf(phone);
  /** Why each candidate was passed over (the evidence of a leg that did not run). */
  const reasons: string[] = [];
  const dogs = await api(phone, bearer, "GET", "/me/dogs");
  if (dogs.status !== 200) return `GET /me/dogs → ${String(dogs.status)}`;
  const dog = (dogs.body as { dogs: { id: string; status: string }[] }).dogs.find(
    (item) => item.status === "ACTIVE",
  );
  if (dog === undefined) return "the account has no ACTIVE dog";
  const rings = (await api(admin.page, admin.bearer, "GET", "/rings")).body as {
    items: { id: string; name: string }[];
  };
  const ringIdOf = (name: string | null | undefined) =>
    rings.items.find((ring) => ring.name === name)?.id;
  const own = await api(phone, bearer, "GET", "/me/bookings");
  const booked: Candidate[] = (
    own.status === 200
      ? (
          own.body as {
            items: {
              classSession: { ringName?: string | null };
              classSessionId: string;
              id: string;
              state: string;
            }[];
          }
        ).items
      : []
  )
    .filter((item) => item.state === "ACTIVE" && (item.classSession.ringName ?? null) !== null)
    .map((item) => ({
      bookingId: item.id,
      id: item.classSessionId,
      ringId: ringIdOf(item.classSession.ringName),
    }));
  const bookable = await api(phone, bearer, "GET", `/me/bookable-classes?dogId=${dog.id}`);
  if (bookable.status !== 200) return `GET /me/bookable-classes → ${String(bookable.status)}`;
  const offer = bookable.body as {
    classes: { id: string; ringName: string | null; state: string }[];
    dog: { levelId?: string | null };
  };
  const classes: Candidate[] = offer.classes
    .filter((item) => item.state === "BOOKABLE" && item.ringName !== null)
    .map((item) => ({ bookingId: "", id: item.id, ringId: ringIdOf(item.ringName) }));
  const levelId = offer.dog.levelId ?? null;
  // Within each source, the planned placement's ring first.
  const byRing = (items: readonly Candidate[]) => [
    ...items.filter((item) => item.ringId === planned.ringId),
    ...items.filter((item) => item.ringId !== planned.ringId),
  ];

  const tryCandidate = async (candidate: Candidate): Promise<PlannedClass | undefined> => {
    const ring = rings.items.find((item) => item.id === candidate.ringId);
    if (ring === undefined) {
      reasons.push(`${candidate.id}: its ring is not in GET /rings`);
      return undefined;
    }
    let classId = candidate.id;
    if (candidate.create !== undefined) {
      if (levelId === null) {
        reasons.push(`${ring.name}: the dog has no level to create a class for`);
        return undefined;
      }
      const slot = candidate.create;
      const created = await api(admin.page, admin.bearer, "POST", "/class-sessions", {
        date: slot.date,
        endTime: slot.endTime,
        instructorIds: slot.instructorIds,
        levelIds: [levelId],
        ringId: ring.id,
        startTime: slot.startTime,
      });
      const createdClass = created.body as { id?: string; state?: string } | null;
      if (created.status !== 201 || createdClass?.id === undefined) {
        reasons.push(
          `${ring.name} ${slot.date} ${slot.startTime}: POST /class-sessions → ${String(created.status)} ${codeOf(created)}`,
        );
        return undefined;
      }
      const createdId = createdClass.id;
      classId = createdId;
      undo.push({
        label: `POST /class-sessions/${createdId}/cancellation`,
        run: () =>
          api(admin.page, admin.bearer, "POST", `/class-sessions/${createdId}/cancellation`, {
            reason: "DELETED",
          }),
      });
    }
    let placementId = ring.id === planned.ringId ? planned.placementId : "";
    let courseName = planned.courseName;
    if (placementId === "") {
      const placements = await api(
        admin.page,
        admin.bearer,
        "GET",
        `/placements?ringId=${ring.id}`,
      );
      const first = (placements.body as { courseId: string; id: string }[] | null)?.[0];
      if (placements.status === 200 && first !== undefined) {
        const course = await api(admin.page, admin.bearer, "GET", `/courses/${first.courseId}`);
        placementId = first.id;
        courseName = (course.body as { name: string }).name;
      } else {
        // A ring nobody has placed a course on: the canonical geometry when it has none (a
        // ring that already has one keeps it, and is skipped), then a planned placement there.
        const stored = await api(admin.page, admin.bearer, "GET", `/rings/${ring.id}/geometry`);
        if (stored.status === 200) {
          reasons.push(`${ring.name}: a geometry and no placement`);
          return undefined;
        }
        const target = await ensureGeometry(admin.page, admin.bearer, ring.id);
        undo.push({
          label: `DELETE /rings/${ring.id}/geometry`,
          run: () => deleteGeometry(admin, ring.id),
        });
        const made = await seedPlacedCourse(admin.page, admin.bearer, target, model, {
          label: "E9-W05 07",
          withSetup: false,
        });
        undo.push({
          label: `PUT /placements/${made.placementId} ARCHIVED`,
          run: () => archivePlacement(admin, made.placementId),
        });
        placementId = made.placementId;
        courseName = made.courseName;
      }
    }
    let bookingId = candidate.bookingId;
    if (bookingId === "") {
      const hold = await api(phone, bearer, "POST", "/seat-holds", {
        classSessionId: classId,
        dogId: dog.id,
      });
      if (hold.status !== 201 && hold.status !== 200) {
        reasons.push(`${ring.name}: POST /seat-holds → ${String(hold.status)} ${codeOf(hold)}`);
        return undefined;
      }
      const booking = await api(phone, bearer, "POST", "/bookings", {
        seatHoldId: (hold.body as { id: string }).id,
      });
      if (booking.status !== 201 && booking.status !== 200) {
        reasons.push(`${ring.name}: POST /bookings → ${String(booking.status)} ${codeOf(booking)}`);
        return undefined;
      }
      const madeBooking = (booking.body as { id: string }).id;
      bookingId = madeBooking;
      undo.push({
        label: `POST /bookings/${madeBooking}/cancellation`,
        run: () => api(phone, bearerOf(phone), "POST", `/bookings/${madeBooking}/cancellation`, {}),
      });
    }
    const patched = await planClass(admin, classId, placementId);
    // A finished class may refuse the edit: the next candidate.
    if (patched.status !== 200) {
      reasons.push(
        `${ring.name}: PATCH /class-sessions → ${String(patched.status)} ${codeOf(patched)}`,
      );
      return undefined;
    }
    const classSessionId = classId;
    undo.push({
      label: `PATCH /class-sessions/${classSessionId} {placementId: ${patched.previous ?? "null"}}`,
      run: () => planClass(admin, classSessionId, patched.previous),
    });
    return {
      bookingId,
      classSessionId,
      courseName,
      createdForTheTest: candidate.create !== undefined,
      placementId,
    };
  };

  // E9-W06 evidence: one run deliberately creates the one-off class on a ring with neither
  // geometry nor placement. That makes the cleanup archive the created placement and only then
  // delete the geometry; `e9-core-undo.json` is the receipt for both successful operations.
  if (process.env.E9_FORCE_BARE_RING_UNDO === "1") {
    let bareRingId: string | undefined;
    for (const ring of rings.items) {
      if (ring.id === planned.ringId) continue;
      const geometry = await api(admin.page, admin.bearer, "GET", `/rings/${ring.id}/geometry`);
      const placements = await api(
        admin.page,
        admin.bearer,
        "GET",
        `/placements?ringId=${ring.id}`,
      );
      const placementRows = Array.isArray(placements.body) ? placements.body : [];
      if (geometry.status === 404 && placements.status === 200 && placementRows.length === 0) {
        bareRingId = ring.id;
        break;
      }
    }
    if (bareRingId === undefined) return "the forced bare-ring run found no geometry-less ring";
    const slots = await newClassSlots(admin, bareRingId);
    note("forced-bare-ring", { ringId: bareRingId, slots });
    if (slots.length === 0) {
      return "the forced bare-ring run found no future free hour this week; no class was tried";
    }
    for (const slot of slots.slice(0, 3)) {
      const found = await tryCandidate({
        bookingId: "",
        create: slot,
        id: "",
        ringId: bareRingId,
      });
      if (found !== undefined) return found;
    }
    return `the forced bare-ring run could not use its future slots: ${reasons.join("; ")}`;
  }

  // Own bookings first, then bookable classes, then (at most three tries) a one-off class.
  for (const candidate of [...byRing(booked), ...byRing(classes)]) {
    const found = await tryCandidate(candidate);
    if (found !== undefined) return found;
  }
  const slots = await newClassSlots(admin, planned.ringId);
  if (slots.length === 0) {
    return `no future free hour remains this week for a one-off class (${String(booked.length)} own bookings, ${String(classes.length)} bookable): ${reasons.join("; ")}`;
  }
  for (const slot of slots.slice(0, 3)) {
    const found = await tryCandidate({
      bookingId: "",
      create: slot,
      id: "",
      ringId: planned.ringId,
    });
    if (found !== undefined) return found;
  }
  return `no usable class (${String(booked.length)} own bookings, ${String(classes.length)} bookable, ${String(slots.length)} free hours for a one-off class this week): ${reasons.join("; ")}`;
}

function codeOf(answer: ApiAnswer): string {
  const body = answer.body as { code?: string } | null;
  return body?.code ?? "";
}

/** `PUT /members/{id}/roles` as the club admin (S03 R-03-10): the account's membership roles. */
async function setRoles(
  admin: { bearer: string; page: Page },
  memberId: string,
  roles: readonly string[],
): Promise<ApiAnswer> {
  return api(admin.page, admin.bearer, "PUT", `/members/${memberId}/roles`, { roles });
}

test("E9-W05 · T-16-16 against the core: a planned placement built from 07 on the phone, joined from a ring with no setup (R-16-13, R-16-11, WP-16-F′)", async ({
  browser,
}) => {
  test.setTimeout(420_000);
  const admin = await adminBearer(browser);
  const ring = await ensureGeometry(admin.page, admin.bearer);
  const model = parseSmarterTxt(readFileSync(SMARTER, "utf8"), {
    sourceFileName: "jp-s-sw.txt",
  }).courseData;
  // A placement nobody has built: no setup shows it (R-16-13's «Recorregut previst»).
  const planned = await seedPlacedCourse(admin.page, admin.bearer, ring, model, {
    label: "E9-W05",
    withSetup: false,
  });
  // A staff member who also trains a dog: the seeded member gets the INSTRUCTOR role too (the demo
  // seed's instructor logins are not members, `GET /me/dogs` → 403, and the seed has no account
  // that is both), and signs in again to carry it. Everything the test changes on the stage's core
  // (the roles, a booking, the class's levels and plan, a bare ring's geometry and placement) goes
  // onto `pendingUndo`, which `afterEach` undoes whatever happens (a timeout included).
  const asMember = await clubsPage(browser, "member@example.test", "/inici", "member07");
  const me = await api(asMember, bearerOf(asMember), "GET", "/me");
  const membership = (me.body as { membership: { memberId: string; roles: string[] } }).membership;
  await asMember.context().close();
  const promoted = await setRoles(admin, membership.memberId, [
    ...new Set([...membership.roles, "INSTRUCTOR"]),
  ]);
  pendingUndo.push({
    label: `PUT /members/${membership.memberId}/roles ${membership.roles.join("+")}`,
    run: () => setRoles(admin, membership.memberId, membership.roles),
  });
  expect(promoted.status).toBe(200);
  await plannedFrom07(browser, admin, planned, model, pendingUndo);
});

async function plannedFrom07(
  browser: Browser,
  admin: { bearer: string; page: Page },
  planned: Seeded,
  model: ReturnType<typeof parseSmarterTxt>["courseData"],
  undo: Undo,
): Promise<void> {
  const phoneA = await clubsPage(
    browser,
    "member@example.test",
    ["/inici", "/instructor/dia"],
    "phoneA",
  );
  const phoneB = await clubsPage(browser, "instructor.2@example.test", "/instructor/dia", "phoneB");

  // 1. Screen 07 of a staff member's own booking: «Recorregut previst» with [Sessió de muntatge].
  const plannedClass = await plannedClassOf(phoneA, admin, planned, model, undo);
  if (typeof plannedClass === "string") {
    // The leg is what the test is for (E9-W05 round 2 #3): when the run's day leaves no class to
    // book, the test fails with the reason, never passes without it.
    note("planned-07", { notRun: plannedClass });
    throw new Error(`07's «Recorregut previst» leg could not run: ${plannedClass}`);
  }
  await navigateSpa(phoneA, `/reserves/${plannedClass.bookingId}`);
  await expect(phoneA.getByText(`Recorregut previst: ${plannedClass.courseName}`)).toBeVisible();
  await screenshot(phoneA, "core-07-recorregut-previst-instructor-375.png");
  const starting = phoneA.waitForResponse(isCall("POST", /^\/api\/v1\/build-sessions$/u));
  await phoneA.getByRole("button", { name: "Sessió de muntatge" }).click();
  const startedResponse = await starting;
  expect(startedResponse.status()).toBe(201);
  expect(startedResponse.request().headers()["idempotency-key"]).toMatch(/[0-9a-f-]{36}/u);
  expect(
    (JSON.parse(startedResponse.request().postData() ?? "{}") as { placementId?: string })
      .placementId,
  ).toBe(plannedClass.placementId);
  const session = (await startedResponse.json()) as { id: string; joinCode: string };
  liveSessionsLeftForP9.push(session.id);
  await phoneA.waitForURL(`**/instructor/muntatge/${session.id}`);
  await expect(obstacleList(phoneA).getByRole("button").first()).toBeVisible();
  await screenshot(phoneA, "core-07-sessio-iniciada-375.png");
  note("planned-07", {
    bookingId: plannedClass.bookingId,
    classSessionId: plannedClass.classSessionId,
    placementId: plannedClass.placementId,
    sessionId: session.id,
    createdForTheTest: plannedClass.createdForTheTest,
  });

  // 2. Phone B opens the viewer of a ring with no setup: staff get the join-by-code form there.
  const setups = await api(phoneB, bearerOf(phoneB), "GET", "/me/ring-setups");
  expect(setups.status).toBe(200);
  const bare = (setups.body as { ringId: string; setup?: unknown }[]).find(
    (item) => item.setup === null || item.setup === undefined,
  );
  if (bare === undefined) throw new Error("Every ring has a setup: no ring to open bare");
  await navigateSpa(phoneB, `/recorreguts/muntat/${bare.ringId}`);
  await expect(phoneB.getByText("Sense recorregut registrat")).toBeVisible();
  await phoneB.getByLabel("Codi d'una sessió de muntatge").fill(session.joinCode.toLowerCase());
  await screenshot(phoneB, "core-visor-sense-muntatge-unir-375.png");
  await phoneB.getByRole("button", { name: "Uneix-t'hi" }).click();
  await phoneB.waitForURL(`**/instructor/muntatge/${session.id}`);
  await expect(obstacleList(phoneB).getByRole("button").first()).toBeVisible();
  note("join-bare-ring", { ringId: bare.ringId, sessionId: session.id });
}
