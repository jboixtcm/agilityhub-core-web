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
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { I18nextProvider } from "react-i18next";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { ActivityPlacementsCard } from "../activities/ActivityPlacementsCard";

import { defaultCalendarSettings } from "./calendar-shared";
import { ClassForm, type ClassFormPatch } from "./ClassForm";
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
    const field = select.closest(".ah-form-field");
    await waitFor(() => {
      expect(field?.querySelector("[role='alert']")?.textContent).not.toBe("");
    });
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
