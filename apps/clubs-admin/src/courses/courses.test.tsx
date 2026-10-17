import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { createApiClient } from "@agilityhub/api-client";
import {
  COURSE_IDS,
  courseState,
  mockScenario,
  type MockScenario,
  PLACEMENT_IDS,
  resetCourseMockState,
  resetPlanningState,
  resetSettingsState,
  SETUP_IDS,
} from "@agilityhub/api-client/mocks";
import brandingCanicFixture from "@agilityhub/api-client/mocks/branding-canic";
import { server } from "@agilityhub/api-client/mocks/server";
import { AuthClient, MemoryRefreshTokenStore, SessionProvider } from "@agilityhub/auth";
import { canonicalLayout6, parseSmarterTxt } from "@agilityhub/course-core";
import { createI18n } from "@agilityhub/i18n";
import { type Branding, BrandingProvider } from "@agilityhub/ui";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { Suspense, useState } from "react";
import { I18nextProvider } from "react-i18next";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import CoursesRoute from "./CoursesRoute";
import { forgetSetupRefusals } from "./shared";

const branding: Branding = {
  ...brandingCanicFixture,
  theme: { ...brandingCanicFixture.theme, mode: "light" },
};

const SMARTER = resolve(
  process.cwd(),
  "../../packages/course-core/fixtures/smarter/jp-s-sw_993483_sadesign.txt",
);

interface Recorded {
  body: Promise<unknown>;
  idempotencyKey: string | null;
  method: string;
  url: URL;
}

let recorded: Recorded[] = [];

beforeAll(() => {
  server.listen({ onUnhandledRequest: "error" });
  server.events.on("request:start", ({ request }) => {
    const copy = request.clone();
    recorded.push({
      body:
        request.method === "GET"
          ? Promise.resolve(undefined)
          : copy
              .text()
              .then((text) => (text === "" ? undefined : (JSON.parse(text) as unknown)))
              .catch(() => undefined),
      idempotencyKey: request.headers.get("Idempotency-Key"),
      method: request.method,
      url: new URL(request.url),
    });
  });
});
beforeEach(() => {
  recorded = [];
  resetCourseMockState();
  resetPlanningState();
  resetSettingsState();
  forgetSetupRefusals();
  mockScenario("admin");
  window.history.replaceState(null, "", "/");
});
afterEach(() => {
  cleanup();
  server.resetHandlers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  mockScenario("admin");
});
afterAll(() => {
  server.close();
});

function requests(method: string, path: string | RegExp): Recorded[] {
  return recorded.filter(
    (item) =>
      item.method === method &&
      (typeof path === "string" ? item.url.pathname.endsWith(path) : path.test(item.url.pathname)),
  );
}

/** The route with its own navigation, as the app's shell does (path + query). */
function Routed({
  client,
  initial,
}: {
  client: ReturnType<typeof createApiClient>;
  initial: string;
}) {
  const [location, setLocation] = useState(initial);
  const url = new URL(location, window.location.origin);
  return (
    <Suspense fallback={null}>
      <CoursesRoute
        client={client}
        onNavigate={(path) => {
          navigations.push(path);
          window.history.pushState(null, "", path);
          setLocation(path);
        }}
        pathname={url.pathname}
        search={url.search}
      />
    </Suspense>
  );
}

let navigations: string[] = [];

async function renderRoute(path: string, scenario: MockScenario = "admin", brand = branding) {
  navigations = [];
  mockScenario(scenario);
  window.history.replaceState(null, "", path);
  const i18n = await createI18n({
    branding: brand,
    browserLanguages: ["ca"],
    initialNamespaces: ["admin-courses", "census", "common", "enums", "errors"],
    storage: undefined,
  });
  const auth = new AuthClient({
    apiBaseUrl: `${window.location.origin}/api/v1`,
    clientId: "clubs-admin",
    identityBaseUrl: window.location.origin,
    mockMode: true,
    mockRefreshTokenStore: new MemoryRefreshTokenStore(),
  });
  await auth.login(
    scenario === "instructor" ? "ivet.puig@example.test" : "aina.serra@example.test",
    "secret-password",
  );
  render(
    <I18nextProvider i18n={i18n}>
      <BrandingProvider branding={brand}>
        <SessionProvider client={auth}>
          <Routed
            client={createApiClient({ baseUrl: `${window.location.origin}/api/v1` })}
            initial={path}
          />
        </SessionProvider>
      </BrandingProvider>
    </I18nextProvider>,
  );
}

/** A club parameter changed the way the backoffice does it (an ADMIN's PUT at its version). */
async function setParameterAsAdmin(key: string, value: unknown) {
  mockScenario("admin");
  const client = createApiClient({ baseUrl: `${window.location.origin}/api/v1` });
  const current = await client.GET("/parameters/{key}", { params: { path: { key } } });
  if (current.data === undefined) throw new Error("PARAMETER_NOT_FOUND");
  const saved = await client.PUT("/parameters/{key}", {
    body: { value, version: current.data.version },
    params: { path: { key } },
  });
  if (saved.data === undefined) throw new Error("PARAMETER_NOT_SAVED");
  return saved.data;
}

/** `saveFile`'s object URL and hidden link: the blobs the page saved, in order. */
function captureDownloads(): Blob[] {
  const saved: Blob[] = [];
  vi.stubGlobal(
    "URL",
    Object.assign(URL, {
      createObjectURL: (blob: Blob) => {
        saved.push(blob);
        return "blob:mock";
      },
      revokeObjectURL: () => undefined,
    }),
  );
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
  return saved;
}

/** The stale placement (R-16-06) with a build sheet stored before its ring's geometry changed. */
function storeSheetOnStalePlacement(): void {
  const placement = courseState.placements.find(
    (item) => item.id === PLACEMENT_IDS.muntanyaJumping,
  );
  if (placement === undefined) throw new Error("PLACEMENT_NOT_FOUND");
  expect(placement.stale).toBe(true);
  placement.buildSheetFileKey = "club-1/courses/old-build-sheet";
}

async function pdfText(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  return Array.from(bytes, (byte) => String.fromCharCode(byte)).join("");
}

describe("T-16-15 D18 «Biblioteca de recorreguts» (S16 §2)", () => {
  it("T-16-15 the universal list: thumbnails, level, rings, and the owner chips filter the api's `owner`", async () => {
    await renderRoute("/recorreguts");
    await screen.findByRole("heading", { level: 1, name: "Biblioteca de recorreguts" });
    const jumping = (await screen.findByText("Jumping del dijous")).closest("tr");
    if (jumping === null) throw new Error("ROW_NOT_FOUND");
    // The thumbnail is decorative (`alt=""`): the row's name says what it is.
    expect(jumping.querySelector("img")).toHaveAttribute(
      "src",
      `https://files.example.test/thumbnails/${COURSE_IDS.jumping}.svg`,
    );
    expect(within(jumping).getByText("Mitjà")).toBeVisible();
    expect(within(jumping).getByText("Muntanya")).toBeVisible();
    // course-core's path length, to 0.1 m in the club's locale (R-16-17).
    expect(within(jumping).getByText(/^11 obstacles · \d+(,\d)? m$/u)).toBeVisible();
    const agility = screen.getByText("Agility C–D").closest("tr");
    expect(agility === null ? "" : within(agility).getByText("C–D").textContent).toBe("C–D");

    fireEvent.click(screen.getByRole("button", { name: "AgilityHub" }));
    await waitFor(() => {
      expect(screen.queryByText("Jumping del dijous")).toBeNull();
    });
    expect(screen.getByText("AH · Foundations 07")).toBeVisible();
    expect(screen.getByRole("button", { name: "AgilityHub" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(requests("GET", "/courses").at(-1)?.url.searchParams.getAll("filter")).toEqual([
      "owner:eq:AGILITYHUB",
    ]);
  });

  it("T-16-15 the tag and club-level filters (x-filterable `tag`, `levelId`) go to the api and read by name", async () => {
    await renderRoute("/recorreguts?filter=tag:eq:dijous");
    expect(await screen.findByText("Jumping del dijous")).toBeVisible();
    expect(screen.queryByText("Agility C–D")).toBeNull();
    expect(requests("GET", "/courses").at(-1)?.url.searchParams.getAll("filter")).toEqual([
      "tag:eq:dijous",
    ]);
    expect(screen.getAllByText(/Etiqueta/u).length).toBeGreaterThan(0);

    cleanup();
    await renderRoute("/recorreguts?filter=levelId:eq:level-c");
    expect(await screen.findByText("Agility C–D")).toBeVisible();
    expect(screen.queryByText("Jumping del dijous")).toBeNull();
    // The applied filter names the club's level (`GET /levels`), never its id.
    expect((await screen.findAllByText(/^Nivell del club = «C»/u)).length).toBeGreaterThan(0);
    expect(screen.queryByText(/level-c/u)).toBeNull();
  });

  it("T-16-15 importing a Smarter fixture: preview, signed upload, one keyed POST /courses with course-core's path length, then the thumbnail on the list", async () => {
    const painted: string[] = [];
    vi.stubGlobal(
      "OffscreenCanvas",
      class {
        getContext() {
          return new Proxy(
            {},
            {
              get: (_target, property) =>
                property === "canvas"
                  ? null
                  : (...args: unknown[]) =>
                      painted.push(`${String(property)}/${String(args.length)}`),
              set: () => true,
            },
          );
        }
        convertToBlob() {
          return Promise.resolve(new Blob(["png-bytes"], { type: "image/png" }));
        }
      },
    );
    await renderRoute("/recorreguts");
    await screen.findByText("Jumping del dijous");
    fireEvent.click(screen.getByRole("button", { name: "Nou recorregut" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Importa un fitxer Smarter (.txt)" }));
    const dialog = await screen.findByRole("dialog", { name: "Importa un fitxer Smarter" });
    const input = within(dialog).getByLabelText("Tria el fitxer .txt que exporta Smarter");
    fireEvent.change(input, {
      target: {
        files: [new File([readFileSync(SMARTER, "utf8")], "jp-s-sw.txt", { type: "text/plain" })],
      },
    });
    // The preview course-core parsed in the browser (R-16-02).
    await within(dialog).findByText(/obstacles$/u);
    fireEvent.click(within(dialog).getByRole("button", { name: "Desa el recorregut" }));
    await waitFor(() => {
      expect(navigations.at(-1)).toMatch(/^\/recorreguts\/course-\d+$/u);
    });

    const [source, thumbnail] = await Promise.all(
      requests("POST", "/courses/upload-urls").map((item) => item.body),
    );
    expect(source).toMatchObject({ contentType: "text/plain", purpose: "SMARTER_SOURCE" });
    expect(thumbnail).toMatchObject({ contentType: "image/png", purpose: "THUMBNAIL" });
    const created = requests("POST", "/api/v1/courses");
    expect(created).toHaveLength(1);
    expect(created[0]?.idempotencyKey).not.toBeNull();
    const body = (await created[0]?.body) as { pathLengthM: number; source: string };
    expect(body.source).toBe("SMARTER");
    expect(body.pathLengthM).toBeGreaterThan(0);
    const patch = (await requests("PATCH", /\/courses\/course-\d+$/u)[0]?.body) as {
      thumbnailFileKey: string;
    };
    // R-16-16: the key is the caller's club's ({clubId}/courses/{uuid}).
    expect(patch.thumbnailFileKey).toMatch(/^[\da-f-]{36}\/courses\/[\da-f-]{36}$/u);
    expect(painted.length).toBeGreaterThan(0);

    // Back on the list, the new course comes first (updatedAt,desc) with its stored thumbnail.
    cleanup();
    await renderRoute("/recorreguts");
    const title = parseSmarterTxt(readFileSync(SMARTER, "utf8"), { sourceFileName: "x.txt" })
      .courseData.title;
    const row = (await screen.findByText(title)).closest("tr");
    expect(row?.querySelector("img")?.getAttribute("src")).toMatch(
      /^https:\/\/files\.example\.test\/files\//u,
    );
  });
});

describe("T-16-04 / R-16-05 the placement editor", () => {
  it("T-16-04 live warnings in the reader's language; a drag far east makes them critical; the ADMIN saves with force under a new key", async () => {
    await renderRoute(`/recorreguts/${COURSE_IDS.jumping}/col-locacio`);
    await screen.findByRole("heading", { level: 1, name: "Col·locació a la pista" });
    expect(screen.getByRole("combobox", { name: "Pista" })).toHaveValue("ring-muntanya");
    // course-core's English messages never reach the screen.
    expect(screen.queryByText(/^Obstacle .* is /u)).toBeNull();

    const plan = screen.getByRole("img", { name: "Recorregut col·locat a Muntanya" });
    vi.spyOn(plan, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 600, 600));
    fireEvent.pointerDown(plan, { button: 0, clientX: 100, clientY: 300, pointerId: 1 });
    fireEvent.pointerMove(plan, { buttons: 1, clientX: 600, clientY: 300, pointerId: 1 });
    fireEvent.pointerUp(plan, { clientX: 600, clientY: 300, pointerId: 1 });
    expect(await screen.findAllByText(/queda fora de la pista\.$/u)).not.toHaveLength(0);
    expect(screen.getByText(/Hi ha \d+ avisos? crítics?\./u)).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "DESA LA COL·LOCACIÓ" }));
    expect(
      await screen.findByText(
        "Vols desar-la igualment? Quedarà registrat que l'has desada amb avisos crítics.",
      ),
    ).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Desa igualment" }));
    expect(await screen.findByText("Col·locació desada.")).toBeVisible();

    const posts = requests("POST", "/api/v1/placements");
    expect(posts).toHaveLength(2);
    const [first, second] = await Promise.all(posts.map((item) => item.body));
    expect(first).not.toHaveProperty("force");
    expect(second).toMatchObject({ force: true, ringId: "ring-muntanya" });
    expect(posts[0]?.idempotencyKey).not.toBe(posts[1]?.idempotencyKey);
    // Further saves update this placement (its id is in the address).
    expect(new URLSearchParams(window.location.search).get("colocacio")).toMatch(/^placement-/u);
  });

  it("R-16-05 an INSTRUCTOR reads why a critical placement is refused, with no force", async () => {
    await renderRoute(`/recorreguts/${COURSE_IDS.jumping}/col-locacio`, "instructor");
    const plan = await screen.findByRole("img", { name: "Recorregut col·locat a Muntanya" });
    vi.spyOn(plan, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 600, 600));
    fireEvent.pointerDown(plan, { button: 0, clientX: 100, clientY: 300, pointerId: 1 });
    fireEvent.pointerMove(plan, { buttons: 1, clientX: 600, clientY: 300, pointerId: 1 });
    fireEvent.pointerUp(plan, { clientX: 600, clientY: 300, pointerId: 1 });
    fireEvent.click(screen.getByRole("button", { name: "DESA LA COL·LOCACIÓ" }));
    expect(
      await screen.findByText(
        "Només un administrador pot desar una col·locació amb avisos crítics.",
      ),
    ).toBeVisible();
    expect(screen.queryByRole("button", { name: "Desa igualment" })).toBeNull();
  });

  it("R-16-06 a stale placement is recalculated and PUT at the version the user edited; another save in between keeps the user's position; what the editor does not edit survives", async () => {
    // What D7 or the calendar stored on the placement, which the editor does not show.
    const kept = {
      grades: ["G3"],
      mode: "FREE_FLOATING" as const,
      scheduledAt: "2026-10-22T16:00:00Z",
      sizes: ["M" as const, "L" as const],
      status: "ARCHIVED" as const,
      warningThresholdM: 2.5,
    };
    const placement = courseState.placements.find(
      (item) => item.id === PLACEMENT_IDS.muntanyaJumping,
    );
    if (placement === undefined) throw new Error("PLACEMENT_NOT_FOUND");
    Object.assign(placement, kept);
    await renderRoute(
      `/recorreguts/${COURSE_IDS.jumping}/col-locacio?colocacio=${PLACEMENT_IDS.muntanyaJumping}`,
    );
    expect(
      await screen.findByText(
        "La geometria de la pista ha canviat des que es va desar: revisa la col·locació i desa-la de nou.",
      ),
    ).toBeVisible();
    expect(screen.getByRole("combobox", { name: "Pista" })).toBeDisabled();
    // Another editor saves it first (version 2 → 3).
    const stored = courseState.placements.find((item) => item.id === PLACEMENT_IDS.muntanyaJumping);
    if (stored === undefined) throw new Error("PLACEMENT_NOT_FOUND");
    stored.version = 3;
    fireEvent.click(screen.getByRole("button", { name: "Mou a la dreta" }));
    fireEvent.click(screen.getByRole("button", { name: "DESA LA COL·LOCACIÓ" }));
    expect(
      await screen.findByText(
        "Algú ha desat aquesta col·locació mentrestant. Hem mantingut la teva posició: desa de nou per substituir-la.",
      ),
    ).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "DESA LA COL·LOCACIÓ" }));
    expect(await screen.findByText("Col·locació desada.")).toBeVisible();
    const puts = requests("PUT", `/placements/${PLACEMENT_IDS.muntanyaJumping}`);
    const [stale, fresh] = (await Promise.all(puts.map((item) => item.body))) as {
      transform: { offsetXM: number };
      version: number;
    }[];
    expect(stale?.version).toBe(2);
    expect(fresh?.version).toBe(3);
    // The user's own move survived the re-read.
    expect(fresh?.transform.offsetXM).toBe(stale?.transform.offsetXM);
    // PUT replaces the placement: both bodies carry what the user did not change (review #1).
    expect(stale).toMatchObject({ ...kept, name: "Dijous tarda" });
    expect(fresh).toMatchObject({ ...kept, name: "Dijous tarda" });
    expect(courseState.placements.find((item) => item.id === stored.id)).toMatchObject({
      ...kept,
      stale: false,
      version: 4,
    });
  });

  it("R-16-05 a course changed meanwhile: STALE_VERSION reads the course again, keeps the user's position, and the next save goes at the new course version", async () => {
    await renderRoute(
      `/recorreguts/${COURSE_IDS.jumping}/col-locacio?colocacio=${PLACEMENT_IDS.muntanyaJumping}`,
    );
    await screen.findByRole("button", { name: "Mou a la dreta" });
    // Another admin saves the course (version 3 → 4); the placement itself is unchanged.
    const course = courseState.courses.find((item) => item.id === COURSE_IDS.jumping);
    if (course === undefined) throw new Error("COURSE_NOT_FOUND");
    course.version = 4;
    fireEvent.click(screen.getByRole("button", { name: "Mou a la dreta" }));
    fireEvent.click(screen.getByRole("button", { name: "DESA LA COL·LOCACIÓ" }));
    expect(await screen.findByText(/^El recorregut ha canviat mentrestant\./u)).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "DESA LA COL·LOCACIÓ" }));
    expect(await screen.findByText("Col·locació desada.")).toBeVisible();
    const bodies = (await Promise.all(
      requests("PUT", `/placements/${PLACEMENT_IDS.muntanyaJumping}`).map((item) => item.body),
    )) as { courseVersion: number; transform: { offsetXM: number }; version: number }[];
    expect(bodies.map((body) => [body.courseVersion, body.version])).toEqual([
      [3, 2],
      [4, 2],
    ]);
    expect(bodies[1]?.transform.offsetXM).toBe(bodies[0]?.transform.offsetXM);
    expect(requests("GET", `/courses/${COURSE_IDS.jumping}`).length).toBeGreaterThan(1);
  });

  it("R-16-05 PLACEMENT_BLOCKED lists the api's critical warnings; a move clears the refusal, so «Desa igualment» never forces a position the api did not judge", async () => {
    await renderRoute(`/recorreguts/${COURSE_IDS.jumping}/col-locacio`);
    const plan = await screen.findByRole("img", { name: "Recorregut col·locat a Muntanya" });
    vi.spyOn(plan, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 600, 600));
    fireEvent.pointerDown(plan, { button: 0, clientX: 100, clientY: 300, pointerId: 1 });
    fireEvent.pointerMove(plan, { buttons: 1, clientX: 600, clientY: 300, pointerId: 1 });
    fireEvent.pointerUp(plan, { clientX: 600, clientY: 300, pointerId: 1 });
    fireEvent.click(screen.getByRole("button", { name: "DESA LA COL·LOCACIÓ" }));
    const refused = await screen.findByRole("list", { name: "Avisos crítics" });
    // `details.warnings`, in the reader's language (never course-core's English message).
    expect(within(refused).getAllByText(/queda fora de la pista\.$/u).length).toBeGreaterThan(0);
    expect(within(refused).queryByText(/ is /u)).toBeNull();
    expect(screen.getByRole("button", { name: "Desa igualment" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Mou a l'esquerra" }));
    expect(screen.queryByRole("button", { name: "Desa igualment" })).toBeNull();
    expect(screen.queryByRole("list", { name: "Avisos crítics" })).toBeNull();
  });

  it("R-16-05 a saved placement stays saved when the follow-up read fails: the address names it and further saves are updates", async () => {
    server.use(
      http.get("*/api/v1/placements/:id", () =>
        HttpResponse.json(
          { code: "INTERNAL_ERROR", details: null, message: "Boom", traceId: "trace" },
          { status: 500 },
        ),
      ),
    );
    await renderRoute(`/recorreguts/${COURSE_IDS.jumping}/col-locacio`);
    await screen.findByRole("img", { name: "Recorregut col·locat a Muntanya" });
    fireEvent.click(screen.getByRole("button", { name: "DESA LA COL·LOCACIÓ" }));
    expect(await screen.findByText("Col·locació desada.")).toBeVisible();
    await waitFor(() => {
      expect(requests("GET", /\/placements\/placement-[^/]+$/u)).toHaveLength(1);
    });
    expect(screen.queryByRole("alert")).toBeNull();
    const id = new URLSearchParams(window.location.search).get("colocacio");
    expect(id).toMatch(/^placement-/u);
    fireEvent.click(screen.getByRole("button", { name: "Mou a la dreta" }));
    fireEvent.click(screen.getByRole("button", { name: "DESA LA COL·LOCACIÓ" }));
    await waitFor(() => {
      expect(requests("PUT", `/placements/${id ?? ""}`)).toHaveLength(1);
    });
    expect(requests("POST", "/api/v1/placements")).toHaveLength(1);
  });
});

describe("R-16-10 / R-16-07 a course's page: build sheet, register as set up, metadata", () => {
  it("R-16-10 the build sheet is a PDF made in the browser from the stored placement, stored for it (BUILD_SHEET upload + POST build-sheet), and the stored one is offered", async () => {
    const saved = captureDownloads();
    await renderRoute(`/recorreguts/${COURSE_IDS.agility}`);
    await screen.findByRole("heading", { level: 1, name: "Agility C–D" });
    const row = (await screen.findByText("Lliga social · recorregut 1")).closest("li");
    if (row === null) throw new Error("ROW_NOT_FOUND");
    fireEvent.click(within(row).getByRole("button", { name: "Full de muntatge" }));
    await waitFor(() => {
      expect(
        requests("POST", `/placements/${PLACEMENT_IDS.centralLeague}/build-sheet`),
      ).toHaveLength(1);
    });
    expect(saved[0]?.type).toBe("application/pdf");
    const text = await pdfText(saved[0] ?? new Blob());
    expect(text.startsWith("%PDF-1.4")).toBe(true);
    expect(text).toContain("(Full de muntatge) Tj");
    expect(text).toContain("(Central · ");
    const [upload] = await Promise.all(
      requests("POST", "/courses/upload-urls").map((item) => item.body),
    );
    expect(upload).toMatchObject({ contentType: "application/pdf", purpose: "BUILD_SHEET" });
    const attach = (await requests("POST", /build-sheet$/u)[0]?.body) as { fileKey: string };
    await waitFor(() => {
      expect(
        courseState.placements.find((item) => item.id === PLACEMENT_IDS.centralLeague)
          ?.buildSheetFileKey,
      ).toBe(attach.fileKey);
    });

    // «Full desat» downloads what the api stores (GET, application/pdf).
    fireEvent.click(within(row).getByRole("button", { name: "Full desat" }));
    await waitFor(() => {
      expect(saved).toHaveLength(2);
    });
    expect(requests("GET", `/placements/${PLACEMENT_IDS.centralLeague}/build-sheet`)).toHaveLength(
      1,
    );
    expect(saved[1]?.type).toBe("application/pdf");
  });

  it("R-16-06 a stale placement's build sheet is disabled and points to «Revisa» (its obstacles no longer match the ring)", async () => {
    await renderRoute(`/recorreguts/${COURSE_IDS.jumping}`);
    const row = (await screen.findByText("Dijous tarda")).closest("li");
    if (row === null) throw new Error("ROW_NOT_FOUND");
    expect(within(row).getByText("Geometria canviada: revisa la col·locació")).toBeVisible();
    const sheet = within(row).getByRole("button", { name: "Full de muntatge" });
    expect(sheet).toBeDisabled();
    expect(sheet).toHaveAccessibleDescription(
      "La geometria de la pista ha canviat: revisa la col·locació abans de treure'n el full de muntatge.",
    );
    expect(within(row).getByRole("button", { name: "Revisa" })).toBeEnabled();
  });

  it("R-16-06 / T-16-19 E9-W05 #1 a stale placement's stored sheet («Full desat») is disabled too, with the same reason as «Full de muntatge»", async () => {
    storeSheetOnStalePlacement();
    await renderRoute(`/recorreguts/${COURSE_IDS.jumping}`);
    const row = (await screen.findByText("Dijous tarda")).closest("li");
    if (row === null) throw new Error("ROW_NOT_FOUND");
    const stored = within(row).getByRole("button", { name: "Full desat" });
    // The stored PDF was made from the obstacles and marker distances of the old geometry.
    expect(stored).toBeDisabled();
    expect(stored).toHaveAccessibleDescription(
      "La geometria de la pista ha canviat: revisa la col·locació abans de treure'n el full de muntatge.",
    );
    fireEvent.click(stored);
    expect(requests("GET", `/placements/${PLACEMENT_IDS.muntanyaJumping}/build-sheet`)).toHaveLength(
      0,
    );
  });

  it("R-16-06 / T-16-19 E9-W05 #1 the editor disables a stale placement's stored sheet until it is saved", async () => {
    storeSheetOnStalePlacement();
    await renderRoute(
      `/recorreguts/${COURSE_IDS.jumping}/col-locacio?colocacio=${PLACEMENT_IDS.muntanyaJumping}`,
    );
    const stored = await screen.findByRole("button", { name: "Full desat" });
    expect(stored).toBeDisabled();
    expect(stored).toHaveAccessibleDescription(
      "La geometria de la pista ha canviat: desa la col·locació per poder treure'n el full de muntatge.",
    );
    expect(screen.getByRole("button", { name: "Full de muntatge" })).toBeDisabled();
  });

  it("R-16-10 a ring without geometry reads errors:RING_WITHOUT_GEOMETRY, never a generic error", async () => {
    await renderRoute(`/recorreguts/${COURSE_IDS.agility}`);
    const row = (await screen.findByText("Lliga social · recorregut 1")).closest("li");
    if (row === null) throw new Error("ROW_NOT_FOUND");
    Reflect.deleteProperty(courseState.geometries, "ring-central");
    fireEvent.click(within(row).getByRole("button", { name: "Full de muntatge" }));
    expect(await within(row).findByRole("alert")).toHaveTextContent(
      "Aquesta pista no té geometria.",
    );
  });

  it("R-16-07 «Registra-ho com a muntat» waits for the active setup, names it, sends the placement with the course's levels under one key and reads the replacement", async () => {
    const course = courseState.courses.find((item) => item.id === COURSE_IDS.jumping);
    if (course === undefined) throw new Error("COURSE_NOT_FOUND");
    course.levelIds = ["level-c"];
    // The ring's setups answer late: REGISTRA waits for them.
    let release: () => void = () => undefined;
    const answered = new Promise<void>((resolve) => {
      release = resolve;
    });
    server.use(
      http.get("*/api/v1/rings/:id/setups", async () => {
        await answered;
        return undefined;
      }),
    );
    await renderRoute(`/recorreguts/${COURSE_IDS.jumping}`);
    const row = (await screen.findByText("Dijous tarda")).closest("li");
    if (row === null) throw new Error("ROW_NOT_FOUND");
    fireEvent.click(within(row).getByRole("button", { name: "Registra-ho com a muntat" }));
    const dialog = await screen.findByRole("dialog", { name: "Registra-ho com a muntat" });
    expect(within(dialog).getByRole("button", { name: "REGISTRA" })).toBeDisabled();
    release();
    expect(
      await within(dialog).findByText(/^Substituirà el muntatge actual \(Jumping, de .+\)\.$/u),
    ).toBeVisible();
    expect(within(dialog).getByRole("button", { name: "REGISTRA" })).toBeEnabled();
    expect(within(dialog).getByRole("combobox", { name: "Què hi ha muntat?" })).toHaveValue(
      "JUMPING",
    );
    fireEvent.click(within(dialog).getByRole("button", { name: "REGISTRA" }));
    expect(
      await screen.findByText(
        "Registrat com a muntat a Muntanya; substitueix el muntatge anterior.",
      ),
    ).toBeVisible();
    const post = requests("POST", "/ring-setups");
    expect(post).toHaveLength(1);
    expect(post[0]?.idempotencyKey).not.toBeNull();
    // R-16-09: the students read the course's level with the setup.
    expect(await post[0]?.body).toEqual({
      agilityhubLevel: "MEDIUM",
      kind: "JUMPING",
      levelIds: ["level-c"],
      placementId: PLACEMENT_IDS.muntanyaJumping,
      ringId: "ring-muntanya",
    });
  });

  it("R-16-07 an INSTRUCTOR refused by the api (courses.allowInstructorPublish off, unreadable to them) is told why, and the action is no longer offered", async () => {
    await setParameterAsAdmin("courses.allowInstructorPublish", false);
    await renderRoute(`/recorreguts/${COURSE_IDS.jumping}`, "instructor");
    const row = (await screen.findByText("Dijous tarda")).closest("li");
    if (row === null) throw new Error("ROW_NOT_FOUND");
    // MATRIU_PERMISOS: `/parameters` answers 403 to an INSTRUCTOR, so the switch is unknown.
    fireEvent.click(within(row).getByRole("button", { name: "Registra-ho com a muntat" }));
    const dialog = await screen.findByRole("dialog", { name: "Registra-ho com a muntat" });
    await within(dialog).findByText(/^Substituirà el muntatge actual/u);
    fireEvent.click(within(dialog).getByRole("button", { name: "REGISTRA" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "En aquest club només l'administració pot registrar què hi ha muntat.",
    );
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel·la" }));
    await waitFor(() => {
      expect(screen.queryByRole("button", { name: "Registra-ho com a muntat" })).toBeNull();
    });
    expect(screen.getByRole("button", { name: "Duplica" })).toBeVisible();
  });

  it("R-16-07 with courses.allowInstructorPublish readable and off, an INSTRUCTOR is never offered «Registra-ho com a muntat»; an ADMIN always is", async () => {
    const parameter = await setParameterAsAdmin("courses.allowInstructorPublish", false);
    server.use(
      http.get("*/api/v1/parameters/courses.allowInstructorPublish", () =>
        HttpResponse.json(parameter),
      ),
    );
    await renderRoute(`/recorreguts/${COURSE_IDS.jumping}`, "instructor");
    await screen.findByText("Dijous tarda");
    await waitFor(() => {
      expect(screen.queryByRole("button", { name: "Registra-ho com a muntat" })).toBeNull();
    });
    expect(screen.getByRole("button", { name: "Duplica" })).toBeVisible();

    cleanup();
    await renderRoute(`/recorreguts/${COURSE_IDS.jumping}`, "admin");
    await screen.findByText("Dijous tarda");
    expect(screen.getAllByRole("button", { name: "Registra-ho com a muntat" })).toHaveLength(2);
  });

  it("R-16-07 E9-W05 #7b a FORBIDDEN refusal names courses.allowInstructorPublish only to an INSTRUCTOR; an ADMIN reads the generic error and keeps the action", async () => {
    server.use(
      http.post("*/api/v1/ring-setups", () =>
        HttpResponse.json(
          { code: "FORBIDDEN", details: null, message: "Forbidden", traceId: "trace" },
          { status: 403 },
        ),
      ),
    );
    const refuse = async () => {
      const row = (await screen.findByText("Dijous tarda")).closest("li");
      if (row === null) throw new Error("ROW_NOT_FOUND");
      fireEvent.click(within(row).getByRole("button", { name: "Registra-ho com a muntat" }));
      const dialog = await screen.findByRole("dialog", { name: "Registra-ho com a muntat" });
      await within(dialog).findByText(/^Substituirà el muntatge actual/u);
      fireEvent.click(within(dialog).getByRole("button", { name: "REGISTRA" }));
      const alert = await within(dialog).findByRole("alert");
      fireEvent.click(within(dialog).getByRole("button", { name: "Cancel·la" }));
      return alert.textContent;
    };

    // An ADMIN is never refused by the switch: the refusal is another one (e.g. impersonation).
    await renderRoute(`/recorreguts/${COURSE_IDS.jumping}`, "admin");
    expect(await refuse()).toBe("No teniu permís per fer aquesta acció.");
    expect(screen.getAllByRole("button", { name: "Registra-ho com a muntat" })).toHaveLength(2);

    cleanup();
    await renderRoute(`/recorreguts/${COURSE_IDS.jumping}`, "instructor");
    expect(await refuse()).toBe(
      "En aquest club només l'administració pot registrar què hi ha muntat.",
    );
  });

  it("R-16-07 E9-W05 #7c an INSTRUCTOR refused once is offered «Registra-ho com a muntat» again, without a reload, once courses.allowInstructorPublish reads true", async () => {
    await setParameterAsAdmin("courses.allowInstructorPublish", false);
    await renderRoute(`/recorreguts/${COURSE_IDS.jumping}`, "instructor");
    const row = (await screen.findByText("Dijous tarda")).closest("li");
    if (row === null) throw new Error("ROW_NOT_FOUND");
    fireEvent.click(within(row).getByRole("button", { name: "Registra-ho com a muntat" }));
    const dialog = await screen.findByRole("dialog", { name: "Registra-ho com a muntat" });
    await within(dialog).findByText(/^Substituirà el muntatge actual/u);
    fireEvent.click(within(dialog).getByRole("button", { name: "REGISTRA" }));
    await within(dialog).findByRole("alert");
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel·la" }));
    await waitFor(() => {
      expect(screen.queryByRole("button", { name: "Registra-ho com a muntat" })).toBeNull();
    });

    // The admin turns the switch back on, and the instructor can now read it (same tab).
    cleanup();
    const parameter = await setParameterAsAdmin("courses.allowInstructorPublish", true);
    server.use(
      http.get("*/api/v1/parameters/courses.allowInstructorPublish", () =>
        HttpResponse.json(parameter),
      ),
    );
    await renderRoute(`/recorreguts/${COURSE_IDS.jumping}`, "instructor");
    await screen.findByText("Dijous tarda");
    expect(
      await screen.findAllByRole("button", { name: "Registra-ho com a muntat" }),
    ).toHaveLength(2);
  });

  it("optimistic locking: after 409 STALE_VERSION the course is read again and only the user's own edits are put back", async () => {
    await renderRoute(`/recorreguts/${COURSE_IDS.jumping}`);
    const notes = await screen.findByRole("textbox", { name: "Notes" });
    fireEvent.change(notes, { target: { value: "Per al grup de dijous i divendres." } });
    // Another admin renames the designer meanwhile (version 3 → 4).
    const stored = courseState.courses.find((item) => item.id === COURSE_IDS.jumping);
    if (stored === undefined) throw new Error("COURSE_NOT_FOUND");
    Object.assign(stored, { designerName: "Joan Pons", version: 4 });
    fireEvent.click(screen.getByRole("button", { name: "Desa" }));
    expect(await screen.findByText(/^Algú ha canviat el recorregut mentrestant\./u)).toBeVisible();
    expect(screen.getByRole("textbox", { name: "Autor" })).toHaveValue("Joan Pons");
    expect(screen.getByRole("textbox", { name: "Notes" })).toHaveValue(
      "Per al grup de dijous i divendres.",
    );
    fireEvent.click(screen.getByRole("button", { name: "Desa" }));
    expect(await screen.findByText("Canvis desats.")).toBeVisible();
    const patches = requests("PATCH", `/courses/${COURSE_IDS.jumping}`);
    const [first, second] = await Promise.all(patches.map((item) => item.body));
    expect(first).toEqual({ notes: "Per al grup de dijous i divendres.", version: 3 });
    expect(second).toEqual({ notes: "Per al grup de dijous i divendres.", version: 4 });
  });

  it("R-16-03 an AgilityHub course is read-only and copied to the club (one keyed POST)", async () => {
    await renderRoute(`/recorreguts/${COURSE_IDS.foundations}`);
    await screen.findByRole("heading", { level: 1, name: "AH · Foundations 07" });
    // Nothing that writes the library course: no metadata, share, duplicate, delete, placement
    // or setup (R-16-03: it is copied to the club first).
    for (const name of [
      "Desa",
      "Elimina",
      "Duplica",
      "Col·loca en una pista",
      "Registra-ho com a muntat",
    ]) {
      expect(screen.queryByRole("button", { name })).toBeNull();
    }
    expect(screen.queryByRole("switch", { name: "Comparteix amb el club" })).toBeNull();
    expect(screen.queryByRole("region", { name: "Col·locacions" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Copia al club" }));
    const dialog = await screen.findByRole("dialog", { name: "Copia al club" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Copia al club" }));
    await waitFor(() => {
      expect(navigations.at(-1)).toMatch(/^\/recorreguts\/course-\d+$/u);
    });
    const copies = requests("POST", "/copy-to-club");
    expect(copies).toHaveLength(1);
    expect(copies[0]?.idempotencyKey).not.toBeNull();
  });

  it("optimistic locking: «Comparteix amb el club» after 409 STALE_VERSION reads the course again and the next change goes at its version", async () => {
    await renderRoute(`/recorreguts/${COURSE_IDS.jumping}`);
    const share = await screen.findByRole("switch", { name: "Comparteix amb el club" });
    expect(share).toBeChecked();
    const stored = courseState.courses.find((item) => item.id === COURSE_IDS.jumping);
    if (stored === undefined) throw new Error("COURSE_NOT_FOUND");
    Object.assign(stored, { notes: "Canviat per una altra persona.", version: 4 });
    fireEvent.click(share);
    expect(
      await screen.findByText(
        /^Algú ha canviat el recorregut mentrestant\. L'hem tornat a carregar: torna a triar/u,
      ),
    ).toBeVisible();
    expect(screen.getByRole("textbox", { name: "Notes" })).toHaveValue(
      "Canviat per una altra persona.",
    );
    fireEvent.click(screen.getByRole("switch", { name: "Comparteix amb el club" }));
    await waitFor(() => {
      expect(courseState.courses.find((item) => item.id === COURSE_IDS.jumping)?.visibility).toBe(
        "PRIVATE",
      );
    });
    const bodies = await Promise.all(
      requests("PATCH", `/courses/${COURSE_IDS.jumping}`).map((item) => item.body),
    );
    expect(bodies).toEqual([
      { version: 3, visibility: "PRIVATE" },
      { version: 4, visibility: "PRIVATE" },
    ]);
  });
});

describe("D16 «Geometria» (S16 §2, R-16-04/06/08)", () => {
  it("A8b E9-W05 #7d the marker sizes print with the reader's decimal separator (ICU number, never the raw value)", async () => {
    const read = async (language: "ca" | "en" | "es") => {
      const i18n = await createI18n({
        // A club that offers the three product locales, so the reader's language is the one used.
        branding: { ...branding, locales: ["ca", "es", "en"] },
        browserLanguages: [language],
        initialNamespaces: ["admin-courses"],
        storage: undefined,
      });
      return [
        i18n.t("admin-courses:markerSheet.size", { mm: 150.5 }),
        i18n.t("admin-courses:geometry.markerSheetTooLarge", { labels: "B", mm: 195.9 }),
      ];
    };
    expect(await read("ca")).toEqual([
      "Mida impresa: 150,5 mm (amb el marge blanc)",
      "B: fan més de 195,9 mm i no caben a la pàgina a mida real.",
    ]);
    expect(await read("es")).toEqual([
      "Tamaño impreso: 150,5 mm (con el margen blanco)",
      "B: miden más de 195,9 mm y no caben en la página a tamaño real.",
    ]);
    expect(await read("en")).toEqual([
      "Printed size: 150.5 mm (white margin included)",
      "B: larger than 195.9 mm, they do not fit on the page at real size.",
    ]);
  });

  it("R-16-04 GEOMETRY_INVALID reads each violation by field and rule; a valid save goes at the stored version", async () => {
    await renderRoute("/pistes/ring-muntanya/geometria");
    await screen.findByRole("textbox", { name: "Llargada (m)" });
    // A no-go rectangle outside the ring: only the api judges it.
    fireEvent.click(screen.getByRole("button", { name: "Afegeix una zona" }));
    fireEvent.change(screen.getByRole("textbox", { name: "x de Zona (m)" }), {
      target: { value: "90" },
    });
    fireEvent.click(screen.getByRole("button", { name: "DESA" }));
    const alert = await screen.findByRole("alert");
    expect(within(alert).getByText("Zona «Zona»: ha de quedar dins de la pista")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Treu la zona Zona" }));
    const length = screen.getByRole("textbox", { name: "Llargada (m)" });
    fireEvent.change(length, { target: { value: "42" } });
    fireEvent.click(screen.getByRole("button", { name: "DESA" }));
    expect(await screen.findByText("Geometria desada.")).toBeVisible();
    const puts = requests("PUT", "/rings/ring-muntanya/geometry");
    const bodies = (await Promise.all(puts.map((item) => item.body))) as {
      doors: unknown[];
      lengthM: number;
      version: number;
    }[];
    expect(bodies.map((body) => [body.lengthM, body.version])).toEqual([
      [40, 4],
      [42, 4],
    ]);
    // The doors are kept as stored (they have their own editor).
    expect(bodies[1]?.doors).toHaveLength(2);
  });

  it("R-16-04 checked before sending: [10, 60], numbers, ≥ 3 active markers not on one line — nothing is sent until the form passes", async () => {
    await renderRoute("/pistes/ring-muntanya/geometria");
    const length = await screen.findByRole("textbox", { name: "Llargada (m)" });
    fireEvent.change(length, { target: { value: "70" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Amplada (m)" }), {
      target: { value: "vint" },
    });
    fireEvent.click(screen.getByRole("button", { name: "DESA" }));
    const alert = await screen.findByRole("alert");
    expect(within(alert).getByText("Revisa aquests camps abans de desar:")).toBeVisible();
    expect(within(alert).getByText("Llargada (m): ha de ser entre 10 i 60 m")).toBeVisible();
    expect(within(alert).getByText("Amplada (m): ha de ser un número")).toBeVisible();
    fireEvent.change(length, { target: { value: "40" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Amplada (m)" }), {
      target: { value: "25" },
    });
    // Every active marker on the line y = 0.
    for (const label of ["A", "B", "C", "D"]) {
      const y = screen.queryByRole("textbox", { name: `y del marcador ${label} (m)` });
      if (y !== null) fireEvent.change(y, { target: { value: "0" } });
    }
    fireEvent.click(screen.getByRole("button", { name: "DESA" }));
    expect(
      await screen.findByText(
        "Marcadors de calibratge: els marcadors actius no poden estar en línia recta",
      ),
    ).toBeVisible();
    expect(requests("PUT", "/rings/ring-muntanya/geometry")).toHaveLength(0);
  });

  it("R-16-04 a violation on a field the form does not name reads a translated generic text, never the raw path", async () => {
    server.use(
      http.put("*/api/v1/rings/:id/geometry", () =>
        HttpResponse.json(
          {
            code: "GEOMETRY_INVALID",
            details: { violations: [{ path: "calibration.origin", rule: "OUT_OF_RANGE" }] },
            message: "Geometry invalid",
            traceId: "trace",
          },
          { status: 422 },
        ),
      ),
    );
    await renderRoute("/pistes/ring-muntanya/geometria");
    fireEvent.click(await screen.findByRole("button", { name: "DESA" }));
    const alert = await screen.findByRole("alert");
    expect(within(alert).getByText("Un altre camp: ha de ser entre 10 i 60 m")).toBeVisible();
    expect(within(alert).queryByText(/calibration/u)).toBeNull();
  });

  it("R-16-06 / R-16-08 the history: the active setup on a stale placement warns the instructor; a replaced one reads «Substituït»", async () => {
    await renderRoute("/pistes/ring-muntanya/geometria");
    const history = await screen.findByRole("region", { name: "Muntatges" });
    expect(
      await within(history).findByText("Geometria canviada: revisa la col·locació"),
    ).toBeVisible();
    expect(within(history).getByText("Substituït")).toBeVisible();
    expect(within(history).getByText("Caducat")).toBeVisible();
    fireEvent.click(within(history).getByRole("link", { name: "Revisa-la" }));
    expect(navigations.at(-1)).toBe(
      `/recorreguts/${COURSE_IDS.jumping}/col-locacio?colocacio=${PLACEMENT_IDS.muntanyaJumping}`,
    );
  });

  it("a ring without geometry reads the spec's text and gets one with the six canonical markers (PUT version 0)", async () => {
    await renderRoute("/pistes/ring-carretera/geometria");
    expect(
      await screen.findByText(
        "Aquesta pista no té geometria: només s'hi poden registrar muntatges amb foto o plànol.",
      ),
    ).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Afegeix la geometria" }));
    fireEvent.click(await screen.findByRole("button", { name: "DESA" }));
    expect(await screen.findByText("Geometria desada.")).toBeVisible();
    const body = (await requests("PUT", "/rings/ring-carretera/geometry")[0]?.body) as {
      markers: { aprilTagId: number; label: string; markerUid: string }[];
      version: number;
    };
    expect(body.version).toBe(0);
    expect(body.markers.map((marker) => marker.label)).toEqual(["A", "B", "C", "D", "E", "F"]);
    expect(new Set(body.markers.map((marker) => marker.aprilTagId)).size).toBe(6);
    // The planner's uid: the club's slug (the venue), the ring and the label.
    expect(body.markers[0]?.markerUid).toBe(`${branding.club.slug ?? ""}-carretera-a`);
  });

  it("R-16-04 the default markers of a new geometry follow the typed size while untouched; a new marker takes the next free letter", async () => {
    await renderRoute("/pistes/ring-carretera/geometria");
    fireEvent.click(await screen.findByRole("button", { name: "Afegeix la geometria" }));
    fireEvent.change(await screen.findByRole("textbox", { name: "Llargada (m)" }), {
      target: { value: "22" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "Amplada (m)" }), {
      target: { value: "30" },
    });
    const layout = canonicalLayout6(22, 30);
    for (const marker of layout) {
      expect(
        screen.getByRole("textbox", { name: `x del marcador ${marker.label} (m)` }),
      ).toHaveValue(String(Math.round(marker.xMeters * 1000) / 1000));
    }
    // Removing B and adding one gives B again (never a repeated letter).
    fireEvent.click(screen.getByRole("button", { name: "Treu el marcador B" }));
    fireEvent.click(screen.getByRole("button", { name: "Afegeix un marcador" }));
    expect(screen.getByRole("textbox", { name: "Nom del marcador 6" })).toHaveValue("B");
    // A touched layout no longer follows the size.
    fireEvent.change(screen.getByRole("textbox", { name: "Llargada (m)" }), {
      target: { value: "24" },
    });
    expect(
      screen.getByRole("textbox", { name: `x del marcador ${layout[0]?.label ?? ""} (m)` }),
    ).toHaveValue(String(Math.round((layout[0]?.xMeters ?? 0) * 1000) / 1000));
  });

  it("A8b no marker sheet without an active marker, nor one that would print a marker smaller than its stored size", async () => {
    const geometry = courseState.geometries["ring-muntanya"];
    if (geometry === undefined) throw new Error("GEOMETRY_NOT_FOUND");
    courseState.geometries["ring-muntanya"] = {
      ...geometry,
      markers: geometry.markers.map((marker, index) =>
        index === 0 ? { ...marker, physicalHeightM: 0.25, physicalWidthM: 0.25 } : marker,
      ),
    };
    await renderRoute("/pistes/ring-muntanya/geometria");
    const button = await screen.findByRole("button", { name: "Full de marcadors" });
    await waitFor(() => {
      expect(button).toBeDisabled();
    });
    expect(button).toHaveAccessibleDescription(
      "A: fan més de 190 mm i no caben a la pàgina a mida real.",
    );

    cleanup();
    courseState.geometries["ring-muntanya"] = {
      ...geometry,
      markers: geometry.markers.map((marker) => ({ ...marker, isActive: false })),
    };
    await renderRoute("/pistes/ring-muntanya/geometria");
    const none = await screen.findByRole("button", { name: "Full de marcadors" });
    await waitFor(() => {
      expect(none).toHaveAccessibleDescription(
        "Cap marcador actiu: activa'n almenys un per treure el full.",
      );
    });
    expect(none).toBeDisabled();
  });

  it("R-16-08 «Substituït» compares instants, not strings: the same moment written with milliseconds still reads as a replacement", async () => {
    const dismantled = courseState.setups.find((item) => item.id === SETUP_IDS.muntanyaDismantled);
    const active = courseState.setups.find((item) => item.id === SETUP_IDS.muntanyaActive);
    if (dismantled === undefined || active === undefined) throw new Error("SETUP_NOT_FOUND");
    // The same instant as the replacing setup's `builtAt`, written with milliseconds (E9-W04: the
    // mock world's dates are relative to its day).
    dismantled.dismantledAt = new Date(active.builtAt).toISOString();
    await renderRoute("/pistes/ring-muntanya/geometria");
    const history = await screen.findByRole("region", { name: "Muntatges" });
    expect(await within(history).findByText("Substituït")).toBeVisible();
  });

  it("A8b the marker sheet: one PDF page per active stored marker, made here", async () => {
    const saved = captureDownloads();
    await renderRoute("/pistes/ring-muntanya/geometria");
    fireEvent.click(await screen.findByRole("button", { name: "Full de marcadors" }));
    await waitFor(() => {
      expect(saved).toHaveLength(1);
    });
    const text = await pdfText(saved[0] ?? new Blob());
    expect(text.match(/\/Type \/Page /gu)).toHaveLength(4);
    expect(text).toContain("(Marcador A) Tj");
    expect(text).toContain("(club-muntanya-a · AprilTag 36h11 núm. 101) Tj");
  });

  it("optimistic locking: a geometry saved meanwhile is read again with the user's own edits on top", async () => {
    await renderRoute("/pistes/ring-central/geometria");
    const notes = await screen.findByRole("textbox", { name: "Notes" });
    fireEvent.change(notes, { target: { value: "Cal reposar sorra a la cantonada C." } });
    await act(async () => {
      const geometry = courseState.geometries["ring-central"];
      if (geometry === undefined) throw new Error("GEOMETRY_NOT_FOUND");
      courseState.geometries["ring-central"] = { ...geometry, version: 2, widthM: 27 };
      await Promise.resolve();
    });
    fireEvent.click(screen.getByRole("button", { name: "DESA" }));
    expect(await screen.findByText(/^Algú ha canviat la geometria mentrestant\./u)).toBeVisible();
    expect(screen.getByRole("textbox", { name: "Amplada (m)" })).toHaveValue("27");
    expect(screen.getByRole("textbox", { name: "Notes" })).toHaveValue(
      "Cal reposar sorra a la cantonada C.",
    );
    fireEvent.click(screen.getByRole("button", { name: "DESA" }));
    expect(await screen.findByText("Geometria desada.")).toBeVisible();
    expect(courseState.geometries["ring-central"]?.notes).toBe(
      "Cal reposar sorra a la cantonada C.",
    );
  });
});
