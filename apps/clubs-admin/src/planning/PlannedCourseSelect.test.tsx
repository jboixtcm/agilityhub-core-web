import { ApiError, createApiClient } from "@agilityhub/api-client";
import {
  catalogState,
  mockScenario,
  PLACEMENT_IDS,
  planningState,
  resetCourseMockState,
  resetPlanningState,
} from "@agilityhub/api-client/mocks";
import brandingCanicFixture from "@agilityhub/api-client/mocks/branding-canic";
import { server } from "@agilityhub/api-client/mocks/server";
import { createI18n } from "@agilityhub/i18n";
import { type Branding, BrandingProvider } from "@agilityhub/ui";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import type { ReactNode } from "react";
import { I18nextProvider } from "react-i18next";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  onTestFinished,
  vi,
} from "vitest";

import { ActivityPlacementsCard } from "../activities/ActivityPlacementsCard";

import { defaultCalendarSettings } from "./calendar-shared";
import { ClassForm, type ClassFormPatch } from "./ClassForm";
import { CreateClassDrawer } from "./CreateClassDrawer";
import { SelectedClassCard } from "./SelectedClassCard";

const branding: Branding = {
  ...brandingCanicFixture,
  theme: { ...brandingCanicFixture.theme, mode: "light" },
};
const withoutCourses: Branding = {
  ...branding,
  modules: branding.modules.filter((module) => module !== "COURSES"),
};

const patches: unknown[] = [];

beforeAll(() => {
  server.listen({ onUnhandledRequest: "error" });
  server.events.on("request:start", ({ request }) => {
    if (request.method === "PATCH") {
      void request
        .clone()
        .json()
        .then((body: unknown) => {
          patches.push(body);
        });
    }
  });
});
beforeEach(() => {
  patches.length = 0;
  resetCourseMockState();
  resetPlanningState();
  mockScenario("admin");
});
afterEach(() => {
  cleanup();
  server.resetHandlers();
});
afterAll(() => {
  server.close();
});

const client = () => createApiClient({ baseUrl: `${window.location.origin}/api/v1` });

async function renderWith(node: ReactNode, brand: Branding = branding) {
  const i18n = await createI18n({
    branding: brand,
    browserLanguages: ["ca"],
    initialNamespaces: ["admin-activities", "admin-scheduling", "enums", "errors"],
    storage: undefined,
  });
  render(
    <I18nextProvider i18n={i18n}>
      <BrandingProvider branding={brand}>{node}</BrandingProvider>
    </I18nextProvider>,
  );
}

function muntanyaClass() {
  const template = planningState.templates.find((item) => item.id === "template-setmana-a");
  const item = template?.classes.find((candidate) => candidate.ringId === "ring-muntanya");
  if (template === undefined || item === undefined) throw new Error("CLASS_NOT_FOUND");
  return { item, template };
}

function classForm(onChange: (patch: ClassFormPatch) => Promise<void>) {
  const { item, template } = muntanyaClass();
  return (
    <ClassForm
      bands={template.bands}
      client={client()}
      days={template.days}
      instructors={catalogState.instructors}
      levels={catalogState.levels}
      levelsEnabled
      maxInstructors={1}
      mode={{ item, kind: "edit" }}
      onChange={onChange}
      onClose={() => undefined}
      onCreate={() => Promise.resolve()}
      onRemove={() => Promise.resolve()}
      rings={catalogState.rings}
    />
  );
}

const catalogs = () => ({
  instructors: catalogState.instructors,
  levels: catalogState.levels,
  rings: catalogState.rings,
});

function muntanyaSession() {
  const session = planningState.sessions.find(
    (item) =>
      item.ringId === "ring-muntanya" && (item.state === "ACTIVE" || item.state === "DRAFT"),
  );
  if (session === undefined) throw new Error("SESSION_NOT_FOUND");
  return session;
}

function selectedCard(session: ReturnType<typeof muntanyaSession>) {
  return (
    <SelectedClassCard
      catalogs={catalogs()}
      client={client()}
      heading={{ day: "dl", description: "", instructors: "", ring: "Muntanya", time: "18:00" }}
      onCancel={() => undefined}
      onClose={() => undefined}
      onConflict={() => Promise.resolve()}
      onSaved={() => Promise.resolve()}
      openingHours={undefined}
      readOnly={false}
      session={session}
      settings={defaultCalendarSettings}
      waitlistEnabled
    />
  );
}

function createDrawer() {
  return (
    <CreateClassDrawer
      catalogs={catalogs()}
      client={client()}
      onClose={() => undefined}
      onCreated={() => undefined}
      openingHours={{ MONDAY: { close: "21:00", open: "17:00" } }}
      settings={defaultCalendarSettings}
      timeZone="Europe/Madrid"
    />
  );
}

describe("R-16-13 «Recorregut previst» of a class (D3 and D4, S16 §2)", () => {
  it("R-16-13 D3: the ring's placements are offered; a choice is one PATCH; a new ring drops it in the same change", async () => {
    const onChange = vi.fn<(patch: ClassFormPatch) => Promise<void>>(() => Promise.resolve());
    await renderWith(classForm(onChange));
    const select = await screen.findByRole("combobox", { name: "Recorregut previst" });
    await screen.findByRole("option", { name: "Jumping del dijous · Dijous tarda" });
    // A placement of another ring is never offered (Central's league one).
    expect(screen.queryByRole("option", { name: /Lliga social/u })).toBeNull();
    fireEvent.change(select, { target: { value: PLACEMENT_IDS.muntanyaJumping } });
    expect(onChange).toHaveBeenLastCalledWith({ placementId: PLACEMENT_IDS.muntanyaJumping });
    fireEvent.click(screen.getByRole("radio", { name: "Central" }));
    expect(onChange).toHaveBeenLastCalledWith({ placementId: null, ringId: "ring-central" });
  });

  it("R-16-13 D3: a PLACEMENT_RING_MISMATCH from the api is said under the selector, which goes back to the saved value", async () => {
    await renderWith(
      classForm(() =>
        Promise.reject(
          new ApiError({
            code: "PLACEMENT_RING_MISMATCH",
            details: {},
            message: "Placement ring mismatch",
            status: 422,
            traceId: "trace",
          }),
        ),
      ),
    );
    const select = await screen.findByRole("combobox", { name: "Recorregut previst" });
    await screen.findByRole("option", { name: "Jumping del dijous · Dijous tarda" });
    fireEvent.change(select, { target: { value: PLACEMENT_IDS.muntanyaJumping } });
    const field = select.closest<HTMLElement>(".ah-form-field");
    if (field === null) throw new Error("FIELD_NOT_FOUND");
    expect(await within(field).findByRole("alert")).toHaveTextContent(
      "La col·locació no pertany a aquesta pista.",
    );
    expect(select).toHaveValue("");
  });

  it("R-16-15: without COURSES there is no «Recorregut previst»", async () => {
    await renderWith(
      classForm(() => Promise.resolve()),
      withoutCourses,
    );
    await screen.findByRole("radio", { name: "Muntanya" });
    expect(screen.queryByRole("combobox", { name: "Recorregut previst" })).toBeNull();
  });

  it("R-16-13 D4: the selected class saves its planned course in its PATCH, with the class's version", async () => {
    const session = planningState.sessions.find(
      (item) =>
        item.ringId === "ring-muntanya" && (item.state === "ACTIVE" || item.state === "DRAFT"),
    );
    if (session === undefined) throw new Error("SESSION_NOT_FOUND");
    await renderWith(
      <SelectedClassCard
        catalogs={{
          instructors: catalogState.instructors,
          levels: catalogState.levels,
          rings: catalogState.rings,
        }}
        client={client()}
        heading={{ day: "dl", description: "", instructors: "", ring: "Muntanya", time: "18:00" }}
        onCancel={() => undefined}
        onClose={() => undefined}
        onConflict={() => Promise.resolve()}
        onSaved={() => Promise.resolve()}
        openingHours={undefined}
        readOnly={false}
        session={session}
        settings={defaultCalendarSettings}
        waitlistEnabled
      />,
    );
    await screen.findByRole("option", { name: "Jumping del dijous · Dijous tarda" });
    fireEvent.change(screen.getByRole("combobox", { name: "Recorregut previst" }), {
      target: { value: PLACEMENT_IDS.muntanyaJumping },
    });
    fireEvent.click(screen.getByRole("button", { name: "ACCEPTA" }));
    await waitFor(() => {
      expect(patches).toEqual([
        { placementId: PLACEMENT_IDS.muntanyaJumping, version: session.version },
      ]);
    });
    expect(planningState.sessions.find((item) => item.id === session.id)?.placementId).toBe(
      PLACEMENT_IDS.muntanyaJumping,
    );
  });

  it("R-16-13 D4: a PLACEMENT_RING_MISMATCH is said under «Recorregut previst», not in the card's general alert", async () => {
    server.use(
      http.patch("*/api/v1/class-sessions/:id", () =>
        HttpResponse.json(
          {
            code: "PLACEMENT_RING_MISMATCH",
            details: null,
            message: "Placement ring mismatch",
            traceId: "trace",
          },
          { status: 422 },
        ),
      ),
    );
    await renderWith(selectedCard(muntanyaSession()));
    await screen.findByRole("option", { name: "Jumping del dijous · Dijous tarda" });
    const select = screen.getByRole("combobox", { name: "Recorregut previst" });
    fireEvent.change(select, { target: { value: PLACEMENT_IDS.muntanyaJumping } });
    fireEvent.click(screen.getByRole("button", { name: "ACCEPTA" }));
    await waitFor(() => {
      expect(select).toHaveAccessibleDescription("La col·locació no pertany a aquesta pista.");
    });
    expect(screen.getAllByRole("alert")).toHaveLength(1);
  });

  it("R-16-13 D4: a new ring drops the class's planned course in the same PATCH", async () => {
    const session = muntanyaSession();
    session.placementId = PLACEMENT_IDS.muntanyaJumping;
    await renderWith(selectedCard(session));
    await screen.findByRole("option", { name: "Jumping del dijous · Dijous tarda" });
    fireEvent.change(screen.getByRole("combobox", { name: "Pista" }), {
      target: { value: "ring-central" },
    });
    fireEvent.click(screen.getByRole("button", { name: "ACCEPTA" }));
    await waitFor(() => {
      expect(patches).toEqual([
        { placementId: null, ringId: "ring-central", version: session.version },
      ]);
    });
  });

  it("R-16-15 D4: without COURSES the card has no «Recorregut previst»", async () => {
    await renderWith(selectedCard(muntanyaSession()), withoutCourses);
    await screen.findByRole("button", { name: "ACCEPTA" });
    expect(screen.queryByRole("combobox", { name: "Recorregut previst" })).toBeNull();
  });

  it("R-16-13 D4 drawer: a new class carries its planned course in the POST; a new ring drops it; a mismatch is said under the field", async () => {
    const posts: unknown[] = [];
    const listener = ({ request }: { request: Request }) => {
      if (request.method === "POST" && request.url.endsWith("/class-sessions")) {
        void request
          .clone()
          .json()
          .then((body: unknown) => {
            posts.push(body);
          });
      }
    };
    server.events.on("request:start", listener);
    onTestFinished(() => {
      server.events.removeListener("request:start", listener);
    });
    await renderWith(createDrawer());
    // A Monday (the only day this club opens here), far enough ahead.
    fireEvent.change(await screen.findByRole("textbox", { name: "Data" }), {
      target: { value: "26/04/2027" },
    });
    fireEvent.click(screen.getByRole("radio", { name: "Muntanya" }));
    const select = await screen.findByRole("combobox", { name: "Recorregut previst" });
    await screen.findByRole("option", { name: "Jumping del dijous · Dijous tarda" });
    fireEvent.change(select, { target: { value: PLACEMENT_IDS.muntanyaJumping } });
    // Another ring: the planned course goes, and its selector reads the new ring's placements.
    fireEvent.click(screen.getByRole("radio", { name: "Central" }));
    expect(await screen.findByRole("combobox", { name: "Recorregut previst" })).toHaveValue("");
    fireEvent.click(screen.getByRole("radio", { name: "Muntanya" }));
    await screen.findByRole("option", { name: "Jumping del dijous · Dijous tarda" });
    fireEvent.change(screen.getByRole("combobox", { name: "Recorregut previst" }), {
      target: { value: PLACEMENT_IDS.muntanyaJumping },
    });
    server.use(
      http.post("*/api/v1/class-sessions", () =>
        HttpResponse.json(
          {
            code: "PLACEMENT_RING_MISMATCH",
            details: null,
            message: "Placement ring mismatch",
            traceId: "trace",
          },
          { status: 422 },
        ),
      ),
    );
    fireEvent.click(screen.getByRole("button", { name: "CREA LA CLASSE" }));
    const field = screen
      .getByRole("combobox", { name: "Recorregut previst" })
      .closest<HTMLElement>(".ah-form-field");
    if (field === null) throw new Error("FIELD_NOT_FOUND");
    expect(await within(field).findByRole("alert")).toHaveTextContent(
      "La col·locació no pertany a aquesta pista.",
    );
    await waitFor(() => {
      expect(posts).toHaveLength(1);
    });
    expect(posts[0]).toMatchObject({
      placementId: PLACEMENT_IDS.muntanyaJumping,
      ringId: "ring-muntanya",
    });
  });
});

describe("R-16-13 D7 «Col·locacions» of an activity (S16 §2)", () => {
  it("R-16-13 lists the activity's placements and [Afegeix] opens D18's editor for the chosen course", async () => {
    const onNavigate = vi.fn();
    await renderWith(
      <ActivityPlacementsCard
        activityId="activity-lliga-social-3"
        client={client()}
        onNavigate={onNavigate}
        placementIds={[PLACEMENT_IDS.centralLeague]}
        readOnly={false}
        rings={catalogState.rings}
      />,
    );
    const link = await screen.findByRole("link", {
      name: "Agility C–D · Central · Lliga social · recorregut 1",
    });
    expect(link).toHaveAttribute(
      "href",
      `/recorreguts/course-agility-c-d/col-locacio?colocacio=${PLACEMENT_IDS.centralLeague}`,
    );
    fireEvent.click(screen.getByRole("button", { name: "Afegeix" }));
    const course = await screen.findByRole("combobox", { name: "Recorregut" });
    // The AgilityHub library is copied first: it is not offered here.
    expect(screen.queryByRole("option", { name: "AH · Foundations 07" })).toBeNull();
    fireEvent.change(course, { target: { value: "course-jumping-dijous" } });
    fireEvent.click(screen.getByRole("button", { name: "Col·loca'l" }));
    expect(onNavigate).toHaveBeenCalledWith(
      "/recorreguts/course-jumping-dijous/col-locacio?activitat=activity-lliga-social-3",
    );
  });

  it("R-16-10 D7 offers the build sheet a placement stores (GET build-sheet, application/pdf)", async () => {
    const saved: Blob[] = [];
    // The fetched blob comes from another realm (undici's), so it is kept as given.
    vi.spyOn(URL, "createObjectURL").mockImplementation((blob) => {
      saved.push(blob as Blob);
      return "blob:mock";
    });
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    await renderWith(
      <ActivityPlacementsCard
        activityId="activity-lliga-social-3"
        client={client()}
        onNavigate={() => undefined}
        placementIds={[PLACEMENT_IDS.centralLeague]}
        readOnly
        rings={catalogState.rings}
      />,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Full de muntatge" }));
    await waitFor(() => {
      expect(saved).toHaveLength(1);
    });
    expect(saved[0]?.type).toBe("application/pdf");
    const bytes = new Uint8Array(await (saved[0] ?? new Blob()).arrayBuffer());
    expect(String.fromCharCode(...bytes.slice(0, 5))).toBe("%PDF-");
    vi.restoreAllMocks();
  });

  it("an INSTRUCTOR reads the placements without [Afegeix] (D7 is read-only for them)", async () => {
    await renderWith(
      <ActivityPlacementsCard
        activityId="activity-lliga-social-3"
        client={client()}
        onNavigate={() => undefined}
        placementIds={[PLACEMENT_IDS.centralLeague]}
        readOnly
        rings={catalogState.rings}
      />,
    );
    await screen.findByRole("link", { name: /Agility C–D/u });
    expect(screen.queryByRole("button", { name: "Afegeix" })).toBeNull();
  });
});
