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
  writeFileSync(
    join(evidenceDirectory, `e9-core-${name}.json`),
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

/** A member or an instructor on the members' app, 375 px (an instructor lands on 20). */
async function clubsPage(
  browser: Browser,
  email: string,
  landing: "/inici" | "/instructor/dia",
  device: string,
): Promise<Page> {
  const context = await browser.newContext({ viewport: { height: 812, width: 375 } });
  await context.addInitScript(() => {
    localStorage.setItem("agilityhub.locale", "ca");
  });
  const page = await context.newPage();
  record(page, device);
  await page.goto(`${clubsUrl}/entrar`);
  await page.getByLabel("Correu electrònic").fill(email);
  const reveal = page.getByRole("button", { name: "Tinc contrasenya" });
  if (await reveal.isVisible()) await reveal.click();
  await page.getByLabel("Contrasenya", { exact: true }).fill(corePassword);
  await submitPasswordLogin(page);
  await page.waitForURL((url) => url.pathname === landing);
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
  const rings = (await api(page, bearer, "GET", "/rings")).body as {
    items: { id: string; name: string; shortName: string }[];
  };
  const ring = rings.items.find((item) => item.name === "Muntanya") ?? rings.items[0];
  if (ring === undefined) throw new Error("No ring in the seed");
  const stored = await api(page, bearer, "GET", `/rings/${ring.id}/geometry`);
  const version = stored.status === 200 ? (stored.body as { version: number }).version : 0;
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

  const model = parseSmarterTxt(readFileSync(SMARTER, "utf8"), {
    sourceFileName: "jp-s-sw.txt",
  }).courseData;
  const courseName = `Jumping E9-W04 ${String(Date.now() % 10_000)}`;
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

  const setup = await api(page, bearer, "POST", "/ring-setups", {
    kind: "JUMPING",
    levelIds: [],
    placementId: placementBody.id,
    ringId: ring.id,
  });
  expect(setup.status).toBe(201);
  const seeded = {
    courseName,
    obstacles: placementBody.resolvedObstacles.length,
    placementId: placementBody.id,
    ringId: ring.id,
    setupId: (setup.body as { setup: { id: string } }).setup.id,
  };
  note("seeded", { ...seeded, warnings: warnings.map((warning) => warning.ruleId) });
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

test.afterAll(() => {
  writeFileSync(join(evidenceDirectory, "e9-core-course-calls.log"), `${courseCalls.join("\n")}\n`);
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
  await expect(member.getByText("muntat avui")).toBeVisible();
  await expect(member.getByRole("button", { name: "Marca com a desmuntat" })).toHaveCount(0);
  await expect(member.getByRole("button", { name: "Sessió de muntatge" })).toHaveCount(0);
  await screenshot(member, "core-visor-alumne-375.png");

  // 2. Two instructors' phones: A starts the live session, B joins with its code.
  const phoneA = await clubsPage(browser, "instructor@example.test", "/instructor/dia", "phoneA");
  const phoneB = await clubsPage(browser, "instructor.2@example.test", "/instructor/dia", "phoneB");
  await navigateSpa(phoneA, `/recorreguts/${seeded.setupId}`);
  await expect(phoneA.getByRole("img", { name: `Plànol de ${seeded.courseName}` })).toBeVisible();
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
  // An INSTRUCTOR's phone reads the ring through the catalog and its geometry (the first run of
  // this stage showed neither: `GET /rings/{id}` refuses an INSTRUCTOR): its name and, for each
  // obstacle, the two nearest markers a builder measures from.
  await expect(phoneB.getByText("Muntanya", { exact: true })).toBeVisible();
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
  await screenshot(phoneA, "core-registrat-375.png");

  // 6. The member reads it on the viewer of that ring too, drawn from the course (R-16-16).
  await navigateSpa(member, `/recorreguts/muntat/${other.id}`);
  await expect(member.getByRole("img", { name: `Plànol de ${seeded.courseName}` })).toBeVisible();
  await screenshot(member, "core-visor-alumne-biblioteca-375.png");
});
