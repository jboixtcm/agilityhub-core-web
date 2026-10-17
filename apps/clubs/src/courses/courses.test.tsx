import {
  courseState,
  mockScenario,
  type MockScenario,
  PLACEMENT_IDS,
  SETUP_IDS,
} from "@agilityhub/api-client/mocks";
import { server } from "@agilityhub/api-client/mocks/server";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { apiClient, renderApp } from "../booking/test-utils";
import { recordRequests, setupTrainingWorld } from "../training/test-utils";

import { nextStatus } from "./BuildSessionPage";

setupTrainingWorld();

beforeEach(() => {
  // jsdom has no object URLs: the photo's preview gets a stand-in.
  vi.stubGlobal(
    "URL",
    Object.assign(URL, {
      createObjectURL: vi.fn(() => "blob:preview"),
      revokeObjectURL: vi.fn(),
    }),
  );
});

function bodiesOf(record: ReturnType<typeof recordRequests>, path: string): unknown[] {
  return record.bodies.get(path) ?? [];
}

async function viewer(path: string, scenario: MockScenario) {
  await renderApp(path, { scenario });
}

describe("T-16-16 the viewer from 08, 10 and 07 (S16 §2, R-16-09)", () => {
  it("08: the ring's line «Muntanya: Jumping · nivell C–D · muntat ahir» opens the viewer, read-only for a MEMBER", async () => {
    await renderApp("/entrenaments", { scenario: "member" });
    const line = await screen.findByRole("link", {
      name: "Muntanya: Jumping · nivell C–D · muntat ahir",
    });
    expect(screen.getByRole("link", { name: "Central: Fun · muntat fa 2 dies" })).toBeVisible();
    fireEvent.click(line);
    await waitFor(() => {
      expect(window.location.pathname).toBe(`/recorreguts/${SETUP_IDS.muntanyaActive}`);
    });
    expect(await screen.findByRole("heading", { level: 1, name: "Muntanya" })).toBeVisible();
    expect(await screen.findByText("Jumping · nivell C–D")).toBeVisible();
    expect(screen.getByText("muntat ahir")).toBeVisible();
    // R-16-09: a MEMBER reads no placement (R-16-16): the course's thumbnail the api signs.
    expect(await screen.findByRole("img", { name: "Foto o plànol del muntatge" })).toBeVisible();
    for (const action of [
      "Marca com a desmuntat",
      "Sessió de muntatge",
      "Registra què hi ha muntat",
    ]) {
      expect(screen.queryByRole("button", { name: action })).not.toBeInTheDocument();
    }
  });

  it("10: the course icon in Muntanya's header opens its setup; a ring without one has no icon", async () => {
    await renderApp("/avui", { scenario: "member" });
    const icon = await screen.findByRole("button", { name: "Recorregut muntat a Muntanya" });
    expect(
      screen.queryByRole("button", { name: /Registra què hi ha muntat/u }),
    ).not.toBeInTheDocument();
    fireEvent.click(icon);
    await waitFor(() => {
      expect(window.location.pathname).toBe(`/recorreguts/${SETUP_IDS.muntanyaActive}`);
    });
    expect(await screen.findByText("Jumping · nivell C–D")).toBeVisible();
  });

  it("07: «A la pista hi ha muntat: …» opens the viewer and «Recorregut previst: Agility C–D» names the planned course (R-16-13)", async () => {
    await renderApp("/reserves/booking-duna-mon3", { scenario: "member" });
    const setup = await screen.findByRole("link", {
      name: /^A la pista hi ha muntat: Fun · muntat fa \d dies$/u,
    });
    expect(setup).toHaveAttribute("href", `/recorreguts/${SETUP_IDS.centralPhoto}`);
    expect(screen.getByText("Recorregut previst: Agility C–D")).toBeVisible();
    // T-16-16: a MEMBER reads the planned course as a line, with no build session to start.
    expect(screen.queryByRole("button", { name: "Sessió de muntatge" })).not.toBeInTheDocument();
  });

  it("a photo setup shows its photo; «previst fins» is the club's day", async () => {
    const central = courseState.setups.find((item) => item.id === SETUP_IDS.centralPhoto);
    if (central === undefined) throw new Error("SETUP_NOT_FOUND");
    central.expectedUntil = "2026-08-06";
    await viewer(`/recorreguts/${SETUP_IDS.centralPhoto}`, "member");
    const photo = await screen.findByRole("img", { name: "Foto o plànol del muntatge" });
    expect(photo).toHaveAttribute("src", central.imageUrl);
    expect(screen.getByText("previst fins dijous, 6 d’agost")).toBeVisible();
  });

  it("R-16-16: a setup registered from the library draws its course in 2D for a MEMBER, with zoom and a quarter turn", async () => {
    const central = courseState.setups.find((item) => item.id === SETUP_IDS.centralPhoto);
    if (central === undefined) throw new Error("SETUP_NOT_FOUND");
    Object.assign(central, { courseId: "course-agility-c-d", imageFileKey: null, imageUrl: null });
    await viewer(`/recorreguts/${SETUP_IDS.centralPhoto}`, "member");
    expect(await screen.findByRole("img", { name: "Plànol de Agility C–D" })).toBeVisible();
    expect(screen.getByText("Recorregut: Agility C–D")).toBeVisible();
    const zoomOut = screen.getByRole("button", { name: "Redueix" });
    expect(zoomOut).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Amplia" }));
    expect(screen.getByText("150 %")).toBeVisible();
    expect(zoomOut).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Gira un quart de volta" }));
    const plan = screen.getByTestId("course-viewer-2d").firstElementChild as HTMLElement;
    expect(plan.style.getPropertyValue("--course-viewer-rotate")).toBe("90deg");
    expect(plan.style.getPropertyValue("--course-viewer-scale")).toBe("1.5");
  });

  it("T-16-09 / R-16-09: with courses.showSetupToMembers off a MEMBER reads «Sense recorregut registrat» and no setup", async () => {
    await viewer("/recorreguts/muntat/ring-muntanya", "memberSetupHidden");
    expect(await screen.findByText("Sense recorregut registrat")).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Registra què hi ha muntat" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Codi d'una sessió de muntatge")).not.toBeInTheDocument();
  });

  it("T-16-09 / R-16-09: a setup the api hides from a MEMBER (404) reads that it is no longer shown", async () => {
    await viewer(`/recorreguts/${SETUP_IDS.muntanyaActive}`, "memberSetupHidden");
    expect(await screen.findByText("Aquest muntatge ja no es mostra.")).toBeVisible();
  });

  it("R-16-15: without COURSES there is no line on 08, no icon on 10 and the viewer is not available", async () => {
    await renderApp("/entrenaments", { scenario: "memberNoCourses" });
    await screen.findByRole("group", { name: "Pista" });
    expect(screen.queryByRole("link", { name: /^Muntanya:/u })).not.toBeInTheDocument();
    window.history.pushState(null, "", `/recorreguts/${SETUP_IDS.muntanyaActive}`);
    window.dispatchEvent(new PopStateEvent("popstate"));
    expect(await screen.findByText("No disponible")).toBeVisible();
  });
});

describe("the instructor's viewer, «Registra què hi ha muntat» and the build session (S16 §2)", () => {
  it("R-16-06 / R-16-16: staff see the course placed on the ring and «Geometria canviada: revisa la col·locació»", async () => {
    await viewer(`/recorreguts/${SETUP_IDS.muntanyaActive}`, "instructor");
    expect(await screen.findByText("Geometria canviada: revisa la col·locació")).toBeVisible();
    expect(await screen.findByRole("img", { name: /^Plànol de / })).toBeVisible();
    expect(screen.getByRole("button", { name: "Sessió de muntatge" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Marca com a desmuntat" })).toBeVisible();
  });

  it("23: a ring with a setup has its course icon; the others the cone to «Registra què hi ha muntat» (S16 §13-3)", async () => {
    await renderApp("/instructor/avui", { scenario: "instructor" });
    expect(
      await screen.findByRole("button", { name: "Recorregut muntat a Muntanya" }),
    ).toBeVisible();
    const cone = await screen.findByRole("button", {
      name: "Registra què hi ha muntat a Carretera",
    });
    fireEvent.click(cone);
    await waitFor(() => {
      expect(window.location.pathname).toBe("/instructor/pistes/ring-carretera/muntat");
    });
    expect(
      await screen.findByRole("heading", { level: 1, name: "Registra què hi ha muntat" }),
    ).toBeVisible();
  });

  it("T-16-16 R-16-07: registered in under five taps (ring preselected → kind → photo → REGISTRA), one key, the viewer after", async () => {
    const record = recordRequests();
    await renderApp("/instructor/pistes/ring-carretera/muntat", { scenario: "instructor" });
    const kinds = await screen.findByRole("group", { name: "Què hi ha muntat?" });
    expect(
      await within(screen.getByRole("group", { name: "Pista" })).findByRole("button", {
        name: "Carretera",
      }),
    ).toHaveAttribute("aria-pressed", "true");
    // Three interactions and nothing else: kind, photo, REGISTRA. REGISTRA is enabled right after
    // the kind and the photo, with no other control touched (review E9-W04 #7).
    fireEvent.click(within(kinds).getByRole("button", { name: "Jumping" }));
    const photo = new File(["photo"], "pista.jpg", { type: "image/jpeg" });
    fireEvent.change(screen.getByLabelText("Fes una foto o tria'n una"), {
      target: { files: [photo] },
    });
    const submit = screen.getByRole("button", { name: "REGISTRA" });
    await waitFor(() => {
      expect(submit).toBeEnabled();
    });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    fireEvent.click(submit);
    await waitFor(() => {
      expect(window.location.pathname).toMatch(/^\/recorreguts\/setup-/u);
    });
    expect(await screen.findByText("Registrat com a muntat.")).toBeVisible();
    expect(await screen.findByRole("img", { name: "Foto o plànol del muntatge" })).toBeVisible();
    const [body] = bodiesOf(record, "/ring-setups") as Record<string, unknown>[];
    expect(body).toMatchObject({ kind: "JUMPING", levelIds: [], ringId: "ring-carretera" });
    expect(body?.imageFileKey).toEqual(expect.stringMatching(/\/courses\//u));
    expect(body).not.toHaveProperty("courseId");
    expect(record.list.filter((line) => line.startsWith("POST /ring-setups"))).toHaveLength(1);
  });

  it("R-16-07: on a ring with a setup, REGISTRA names what it replaces and the viewer says it replaced it", async () => {
    await renderApp("/instructor/pistes/ring-muntanya/muntat", { scenario: "instructor" });
    expect(
      await screen.findByText(/^Substituirà el muntatge actual \(Jumping, de \d+ d’agost\)\.$/u),
    ).toBeVisible();
    fireEvent.change(screen.getByLabelText("Fes una foto o tria'n una"), {
      target: { files: [new File(["photo"], "pista.jpg", { type: "image/jpeg" })] },
    });
    fireEvent.click(screen.getByRole("button", { name: "REGISTRA" }));
    expect(
      await screen.findByText("Registrat com a muntat; substitueix el muntatge anterior."),
    ).toBeVisible();
  });

  it("R-16-07: a course of the library goes as courseId; without a choice REGISTRA says what is missing", async () => {
    const record = recordRequests();
    await renderApp("/instructor/pistes/ring-carretera/muntat", { scenario: "instructor" });
    const sources = await screen.findByRole("group", { name: "D'on surt?" });
    fireEvent.click(
      within(sources).getByRole("button", { name: "Un recorregut de la biblioteca" }),
    );
    const submit = screen.getByRole("button", { name: "REGISTRA" });
    await waitFor(() => {
      expect(submit).toBeEnabled();
    });
    fireEvent.click(submit);
    expect(await screen.findByText("Tria un recorregut de la llista.")).toBeVisible();
    fireEvent.click(await screen.findByRole("radio", { name: /Agility C–D/u }));
    fireEvent.click(submit);
    await screen.findByText("Registrat com a muntat.");
    const [body] = bodiesOf(record, "/ring-setups") as Record<string, unknown>[];
    expect(body).toMatchObject({ courseId: "course-agility-c-d", kind: "AGILITY" });
    expect(body).not.toHaveProperty("imageFileKey");
  });

  it("R-16-07 / CONVENCIONS_API §7: a lost answer keeps the key, the photo is not uploaded twice, and the api's refusal stays in the form", async () => {
    const record = recordRequests();
    let failures = 1;
    server.use(
      http.post("*/api/v1/ring-setups", () => {
        if (failures > 0) {
          failures -= 1;
          return HttpResponse.json(
            { code: "INTERNAL_ERROR", details: {}, message: "boom", traceId: "t" },
            { status: 500 },
          );
        }
        return undefined;
      }),
    );
    await renderApp("/instructor/pistes/ring-carretera/muntat", { scenario: "instructor" });
    fireEvent.change(await screen.findByLabelText("Fes una foto o tria'n una"), {
      target: { files: [new File(["photo"], "pista.jpg", { type: "image/jpeg" })] },
    });
    const submit = screen.getByRole("button", { name: "REGISTRA" });
    await waitFor(() => {
      expect(submit).toBeEnabled();
    });
    fireEvent.click(submit);
    expect(await screen.findByRole("alert")).toHaveTextContent(/./u);
    fireEvent.click(submit);
    await screen.findByText("Registrat com a muntat.");
    const keys = record.list
      .map((line, index) => ({ index, line }))
      .filter(({ line }) => line.startsWith("POST /ring-setups"));
    expect(keys).toHaveLength(2);
    expect(new Set(record.keys.slice(-2)).size).toBe(1);
    expect(record.list.filter((line) => line.startsWith("POST /courses/upload-urls"))).toHaveLength(
      1,
    );
  });

  it("R-16-07: an INSTRUCTOR refused by the api (courses.allowInstructorPublish off) reads why, in the form", async () => {
    await renderApp("/instructor/pistes/ring-carretera/muntat", {
      scenario: "instructorNoPublish",
    });
    fireEvent.change(await screen.findByLabelText("Fes una foto o tria'n una"), {
      target: { files: [new File(["photo"], "pista.jpg", { type: "image/jpeg" })] },
    });
    const submit = screen.getByRole("button", { name: "REGISTRA" });
    await waitFor(() => {
      expect(submit).toBeEnabled();
    });
    fireEvent.click(submit);
    expect(
      await screen.findByText(
        "En aquest club només l'administració pot registrar què hi ha muntat.",
      ),
    ).toBeVisible();
    expect(window.location.pathname).toBe("/instructor/pistes/ring-carretera/muntat");
  });

  it("R-16-08: [Marca com a desmuntat] asks first, sends one keyed dismantle and the viewer reads «Desmuntat»", async () => {
    const record = recordRequests();
    await viewer(`/recorreguts/${SETUP_IDS.centralPhoto}`, "instructor");
    fireEvent.click(await screen.findByRole("button", { name: "Marca com a desmuntat" }));
    expect(
      screen.getByText(
        "El muntatge de Central deixarà de sortir als quadres i a la reserva d'entrenaments.",
      ),
    ).toBeVisible();
    const confirm = screen.getAllByRole("button", { name: "Marca com a desmuntat" }).at(-1);
    if (confirm === undefined) throw new Error("NO_CONFIRM");
    fireEvent.click(confirm);
    expect(await screen.findByText("Marcat com a desmuntat.")).toBeVisible();
    expect(await screen.findByText("Desmuntat")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Marca com a desmuntat" })).not.toBeInTheDocument();
    expect(
      record.list.filter(
        (line) => line === `POST /ring-setups/${SETUP_IDS.centralPhoto}/dismantle`,
      ),
    ).toHaveLength(1);
  });

  it("T-16-10 R-16-11: [Sessió de muntatge] starts a live session; a tap moves an obstacle, another phone's tap arrives by polling, FINALITZA registers the setup", async () => {
    const record = recordRequests();
    await viewer(`/recorreguts/${SETUP_IDS.muntanyaActive}`, "instructor");
    fireEvent.click(await screen.findByRole("button", { name: "Sessió de muntatge" }));
    await waitFor(() => {
      expect(window.location.pathname).toMatch(/^\/instructor\/muntatge\//u);
    });
    const sessionId = window.location.pathname.split("/").at(-1) ?? "";
    const [created] = bodiesOf(record, "/build-sessions") as Record<string, unknown>[];
    expect(created).toEqual({ live: true, placementId: "placement-muntanya-dijous" });
    const list = await screen.findByRole("list", { name: "Obstacles" });
    expect(screen.getByText(/^Codi per unir-s'hi:/u)).toBeVisible();
    const rows = within(list).getAllByRole("button");
    expect(rows.length).toBeGreaterThan(1);
    const [first, second] = rows;
    if (first === undefined || second === undefined) throw new Error("NO_OBSTACLES");
    expect(first).toHaveAccessibleName(/pendent\. Toca per passar a col·locat\.$/u);
    expect(screen.getByText("sense començar")).toBeVisible();
    // Where it goes: metres from the ring's origin, the heading and the two nearest markers.
    expect(
      within(first).getByText(/^x \d+,\d{2} m, y \d+,\d{2} m · -?\d+° · [A-F] a /u),
    ).toBeVisible();
    fireEvent.click(first);
    await waitFor(() => {
      expect(first).toHaveAccessibleName(/col·locat\. Toca per passar a per revisar\.$/u);
    });
    // R-16-11: the first change makes the session IN_PROGRESS.
    expect(screen.getByText("en curs")).toBeVisible();

    // Another phone places the second obstacle (the api's last write wins, R-16-11).
    const session = courseState.buildSessions.find((item) => item.id === sessionId);
    const obstacleId = session?.obstacles[1]?.obstacleId ?? "";
    await apiClient().PATCH("/build-sessions/{id}/obstacles/{obstacleId}", {
      body: { status: "PLACED" },
      params: { path: { id: sessionId, obstacleId } },
    });
    await waitFor(
      () => {
        expect(second).toHaveAccessibleName(/col·locat\. Toca per passar a per revisar\.$/u);
      },
      { timeout: 6000 },
    );

    fireEvent.click(screen.getByRole("button", { name: "FINALITZA" }));
    expect(
      await screen.findByText("Sessió acabada: el muntatge ha quedat registrat."),
    ).toBeVisible();
    expect(window.location.pathname).toMatch(/^\/recorreguts\/setup-/u);
    expect(
      record.list.filter((line) => line === `POST /build-sessions/${sessionId}/finish`),
    ).toHaveLength(1);
  });

  it("T-16-10 R-16-11: a second phone joins with the session's code (case-insensitive)", async () => {
    mockScenario("instructor");
    const created = await apiClient().POST("/build-sessions", {
      body: { live: true, placementId: "placement-muntanya-dijous" },
      headers: { "Idempotency-Key": "join-test-key" },
    });
    const code = created.data?.joinCode ?? "";
    await viewer(`/recorreguts/${SETUP_IDS.muntanyaActive}`, "instructor");
    fireEvent.change(await screen.findByLabelText("Codi d'una sessió de muntatge"), {
      target: { value: code.toLowerCase() },
    });
    fireEvent.click(screen.getByRole("button", { name: "Uneix-t'hi" }));
    await waitFor(() => {
      expect(window.location.pathname).toBe(`/instructor/muntatge/${created.data?.id ?? ""}`);
    });
    expect(await screen.findByRole("list", { name: "Obstacles" })).toBeVisible();
  });

  it("R-16-11 / R-16-16: an unknown build session (or another club's) reads that it does not exist", async () => {
    await renderApp("/instructor/muntatge/session-unknown", { scenario: "instructor" });
    expect(
      await screen.findByText("Aquesta sessió de muntatge no existeix o no és d'aquest club."),
    ).toBeVisible();
  });

  it("R-16-11: an unknown code reads that no open session has it, beside the field", async () => {
    await viewer(`/recorreguts/${SETUP_IDS.muntanyaActive}`, "instructor");
    fireEvent.change(await screen.findByLabelText("Codi d'una sessió de muntatge"), {
      target: { value: "ZZZZZZ" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Uneix-t'hi" }));
    expect(await screen.findByText("No hi ha cap sessió oberta amb aquest codi.")).toBeVisible();
  });

  it("R-16-11 / E118: an INSTRUCTOR's finish without courses.allowInstructorPublish registers no setup and says so", async () => {
    mockScenario("instructorNoPublish");
    const created = await apiClient().POST("/build-sessions", {
      body: { live: true, placementId: "placement-muntanya-dijous" },
      headers: { "Idempotency-Key": "no-publish-key" },
    });
    await renderApp(`/instructor/muntatge/${created.data?.id ?? ""}`, {
      scenario: "instructorNoPublish",
    });
    fireEvent.click(await screen.findByRole("button", { name: "FINALITZA" }));
    expect(
      await screen.findByText(
        "Sessió acabada. En aquest club, l'administració registra què hi ha muntat.",
      ),
    ).toBeVisible();
    expect(screen.queryByRole("button", { name: "FINALITZA" })).not.toBeInTheDocument();
  });
});

describe("E9-W05: building a planned course from the phone, ADMIN-only sessions, the photo's type", () => {
  it("T-16-16 · staff start a build session from 07's «Recorregut previst»: one key per payload, the error in place, then the session (R-16-11, R-16-13)", async () => {
    const record = recordRequests();
    let failures = 1;
    server.use(
      http.post("*/api/v1/build-sessions", () => {
        if (failures > 0) {
          failures -= 1;
          return HttpResponse.json(
            { code: "INTERNAL_ERROR", details: {}, message: "boom", traceId: "t" },
            { status: 500 },
          );
        }
        return undefined;
      }),
    );
    await renderApp("/reserves/booking-duna-mon3", { scenario: "instructor" });
    expect(await screen.findByText("Recorregut previst: Agility C–D")).toBeVisible();
    const start = screen.getByRole("button", { name: "Sessió de muntatge" });
    fireEvent.click(start);
    expect(await screen.findByRole("alert")).toHaveTextContent(/./u);
    expect(window.location.pathname).toBe("/reserves/booking-duna-mon3");
    await waitFor(() => {
      expect(start).toBeEnabled();
    });
    fireEvent.click(start);
    await waitFor(() => {
      expect(window.location.pathname).toMatch(/^\/instructor\/muntatge\//u);
    });
    expect(await screen.findByRole("list", { name: "Obstacles" })).toBeVisible();
    const bodies = bodiesOf(record, "/build-sessions");
    expect(bodies).toEqual([
      { live: true, placementId: PLACEMENT_IDS.centralLeague },
      { live: true, placementId: PLACEMENT_IDS.centralLeague },
    ]);
    const posts = record.list.filter((line) => line === "POST /build-sessions");
    expect(posts).toHaveLength(2);
    expect(new Set(record.keys.slice(0, 2)).size).toBe(1);
  });

  it("T-16-16 · E9-W05 round 2 #7: no [Sessió de muntatge] on 07 when the ring's ACTIVE setup already shows the planned placement (R-16-13)", async () => {
    const central = courseState.setups.find((item) => item.id === SETUP_IDS.centralPhoto);
    if (central === undefined) throw new Error("Central has no photo setup in the mocks");
    central.placementId = PLACEMENT_IDS.centralLeague;
    const record = recordRequests();
    await renderApp("/reserves/booking-duna-mon3", { scenario: "instructor" });
    expect(await screen.findByText("Recorregut previst: Agility C–D")).toBeVisible();
    await waitFor(() => {
      expect(record.list).toContain(`GET /ring-setups/${SETUP_IDS.centralPhoto}`);
    });
    expect(screen.queryByRole("button", { name: "Sessió de muntatge" })).not.toBeInTheDocument();
  });

  it("T-16-16 · a ring with no setup offers staff the join-by-code form (R-16-11)", async () => {
    mockScenario("instructor");
    const created = await apiClient().POST("/build-sessions", {
      body: { live: true, placementId: "placement-muntanya-dijous" },
      headers: { "Idempotency-Key": "join-empty-ring-key" },
    });
    await viewer("/recorreguts/muntat/ring-carretera", "instructor");
    expect(await screen.findByText("Sense recorregut registrat")).toBeVisible();
    fireEvent.change(screen.getByLabelText("Codi d'una sessió de muntatge"), {
      target: { value: created.data?.joinCode ?? "" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Uneix-t'hi" }));
    await waitFor(() => {
      expect(window.location.pathname).toBe(`/instructor/muntatge/${created.data?.id ?? ""}`);
    });
  });

  it("R-16-09 · E9-W05 round 2 #7: the api's levelLabel that is an AgilityHub level code reads translated in the viewer's heading", async () => {
    // No club levels: `/me/ring-setups` sends the setup's AgilityHub level code as levelLabel.
    const active = courseState.setups.find((item) => item.id === SETUP_IDS.muntanyaActive);
    if (active === undefined) throw new Error("Muntanya has no ACTIVE setup in the mocks");
    Object.assign(active, { agilityhubLevel: "MEDIUM", levelIds: [] });
    await viewer("/recorreguts/muntat/ring-muntanya", "member");
    expect(await screen.findByText("Jumping · nivell Mitjà")).toBeVisible();
    expect(screen.queryByText(/MEDIUM/u)).not.toBeInTheDocument();
  });

  it("R-16-09 · an ADMIN session refused by /me/ring-setups (403) opens the ring's setup from its history", async () => {
    const record = recordRequests();
    server.use(
      http.get("*/api/v1/me/ring-setups", () =>
        HttpResponse.json(
          { code: "FORBIDDEN", details: {}, message: "Forbidden", traceId: "t" },
          { status: 403 },
        ),
      ),
    );
    await viewer("/recorreguts/muntat/ring-muntanya", "admin");
    expect(await screen.findByText(/^Jumping/u)).toBeVisible();
    expect(screen.queryByText("No s'ha pogut carregar el muntatge.")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sessió de muntatge" })).toBeVisible();
    expect(record.list.some((line) => line.startsWith("GET /rings/ring-muntanya/setups"))).toBe(
      true,
    );
  });

  it("R-16-07 · a photo without an image type is refused on the photo field before any upload grant", async () => {
    const record = recordRequests();
    await renderApp("/instructor/pistes/ring-carretera/muntat", { scenario: "instructor" });
    const input = await screen.findByLabelText("Fes una foto o tria'n una");
    const submit = screen.getByRole("button", { name: "REGISTRA" });
    await waitFor(() => {
      expect(submit).toBeEnabled();
    });
    for (const type of ["", "application/pdf"]) {
      fireEvent.change(input, { target: { files: [new File(["photo"], "pista.heic", { type })] } });
      fireEvent.click(submit);
      expect(await screen.findByRole("alert")).toHaveTextContent(
        "Aquest tipus de fitxer no està permès.",
      );
      expect(input).toHaveAttribute("aria-describedby", "setup-photo-error");
    }
    expect(record.list.some((line) => line.startsWith("POST /courses/upload-urls"))).toBe(false);
    expect(record.list.some((line) => line.startsWith("POST /ring-setups"))).toBe(false);
  });

  it("R-16-11 · leaving the session while FINALITZA runs: its late answer does not take the user back to the setup", async () => {
    mockScenario("instructor");
    const created = await apiClient().POST("/build-sessions", {
      body: { live: true, placementId: "placement-muntanya-dijous" },
      headers: { "Idempotency-Key": "finish-unmount-key" },
    });
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let finishing = false;
    server.use(
      http.post("*/api/v1/build-sessions/:id/finish", async () => {
        finishing = true;
        await gate;
        return undefined;
      }),
    );
    await renderApp(`/instructor/muntatge/${created.data?.id ?? ""}`, { scenario: "instructor" });
    fireEvent.click(await screen.findByRole("button", { name: "FINALITZA" }));
    await waitFor(() => {
      expect(finishing).toBe(true);
    });
    window.history.pushState(null, "", "/instructor/avui");
    window.dispatchEvent(new PopStateEvent("popstate"));
    // The session page itself is gone (its button only changes to the pending label while the
    // finish runs, so the button alone does not prove the page left).
    await waitFor(() => {
      expect(screen.queryByRole("list", { name: "Obstacles" })).not.toBeInTheDocument();
    });
    release();
    await waitFor(() => {
      expect(courseState.buildSessions.find((item) => item.id === created.data?.id)?.status).toBe(
        "COMPLETED",
      );
    });
    // Time for the late answer to reach the client and be dropped.
    await new Promise((resolve) => {
      setTimeout(resolve, 200);
    });
    expect(window.location.pathname).toBe("/instructor/avui");
  });
});

describe("R-16-11 the tap cycle (S16 §2 «toc = següent estat»)", () => {
  it("pending → placed → to check → pending; the AR app's CURRENT and SKIPPED go to placed", () => {
    expect(nextStatus("NOT_PLACED")).toBe("PLACED");
    expect(nextStatus("PLACED")).toBe("NEEDS_CHECK");
    expect(nextStatus("NEEDS_CHECK")).toBe("NOT_PLACED");
    expect(nextStatus("CURRENT")).toBe("PLACED");
    expect(nextStatus("SKIPPED")).toBe("PLACED");
  });
});
