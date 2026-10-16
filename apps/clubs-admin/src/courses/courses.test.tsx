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
} from "@agilityhub/api-client/mocks";
import brandingCanicFixture from "@agilityhub/api-client/mocks/branding-canic";
import { server } from "@agilityhub/api-client/mocks/server";
import { AuthClient, MemoryRefreshTokenStore, SessionProvider } from "@agilityhub/auth";
import { parseSmarterTxt } from "@agilityhub/course-core";
import { createI18n } from "@agilityhub/i18n";
import { type Branding, BrandingProvider } from "@agilityhub/ui";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { Suspense, useState } from "react";
import { I18nextProvider } from "react-i18next";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import CoursesRoute from "./CoursesRoute";

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
    expect(patch.thumbnailFileKey).toMatch(/\/courses\/upload-\d+$/u);
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
    fireEvent.pointerMove(plan, { clientX: 600, clientY: 300, pointerId: 1 });
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
    fireEvent.pointerMove(plan, { clientX: 600, clientY: 300, pointerId: 1 });
    fireEvent.pointerUp(plan, { clientX: 600, clientY: 300, pointerId: 1 });
    fireEvent.click(screen.getByRole("button", { name: "DESA LA COL·LOCACIÓ" }));
    expect(
      await screen.findByText(
        "Només un administrador pot desar una col·locació amb avisos crítics.",
      ),
    ).toBeVisible();
    expect(screen.queryByRole("button", { name: "Desa igualment" })).toBeNull();
  });

  it("R-16-06 a stale placement is recalculated and PUT at the version the user edited; another save in between keeps the user's position", async () => {
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
    expect(courseState.placements.find((item) => item.id === stored.id)?.stale).toBe(false);
  });
});

describe("R-16-10 / R-16-07 a course's page: build sheet, register as set up, metadata", () => {
  it("R-16-10 the build sheet is a PDF made in the browser from the stored placement, never uploaded (the api's storage is 501)", async () => {
    const saved = captureDownloads();
    await renderRoute(`/recorreguts/${COURSE_IDS.jumping}`);
    await screen.findByRole("heading", { level: 1, name: "Jumping del dijous" });
    const row = (await screen.findByText("Dijous tarda")).closest("li");
    if (row === null) throw new Error("ROW_NOT_FOUND");
    expect(within(row).getByText("Geometria canviada: revisa la col·locació")).toBeVisible();
    fireEvent.click(within(row).getByRole("button", { name: "Full de muntatge" }));
    await waitFor(() => {
      expect(saved).toHaveLength(1);
    });
    expect(saved[0]?.type).toBe("application/pdf");
    const text = await pdfText(saved[0] ?? new Blob());
    expect(text.startsWith("%PDF-1.4")).toBe(true);
    expect(text).toContain("(Full de muntatge) Tj");
    expect(text).toContain("(Muntanya · 40,00 × 25,00 m · Dijous tarda) Tj");
    expect(requests("POST", /build-sheet$/u)).toHaveLength(0);
  });

  it("R-16-07 «Registra-ho com a muntat» names the setup it replaces, sends the placement under one key and reads the replacement", async () => {
    await renderRoute(`/recorreguts/${COURSE_IDS.jumping}`);
    const row = (await screen.findByText("Dijous tarda")).closest("li");
    if (row === null) throw new Error("ROW_NOT_FOUND");
    fireEvent.click(within(row).getByRole("button", { name: "Registra-ho com a muntat" }));
    const dialog = await screen.findByRole("dialog", { name: "Registra-ho com a muntat" });
    expect(
      await within(dialog).findByText(/^Substituirà el muntatge actual \(Jumping, de .+\)\.$/u),
    ).toBeVisible();
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
    expect(await post[0]?.body).toEqual({
      kind: "JUMPING",
      levelIds: [],
      placementId: PLACEMENT_IDS.muntanyaJumping,
      ringId: "ring-muntanya",
    });
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
    expect(screen.queryByRole("button", { name: "Desa" })).toBeNull();
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
});

describe("D16 «Geometria» (S16 §2, R-16-04/06/08)", () => {
  it("R-16-04 GEOMETRY_INVALID reads each violation by field and rule; a valid save goes at the stored version", async () => {
    await renderRoute("/pistes/ring-muntanya/geometria");
    const length = await screen.findByRole("textbox", { name: "Llargada (m)" });
    fireEvent.change(length, { target: { value: "70" } });
    fireEvent.click(screen.getByRole("button", { name: "DESA" }));
    expect(await screen.findByText("Llargada (m): ha de ser entre 10 i 60 m")).toBeVisible();
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
      [70, 4],
      [42, 4],
    ]);
    // The doors are kept as stored (they have their own editor).
    expect(bodies[1]?.doors).toHaveLength(2);
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
    expect(body.markers[0]?.markerUid).toBe(`${branding.club.slug}-carretera-a`);
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
