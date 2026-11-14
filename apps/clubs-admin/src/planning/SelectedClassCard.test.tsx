import { createApiClient } from "@agilityhub/api-client";
import {
  catalogState,
  mockScenario,
  planningState,
  resetPlanningState,
} from "@agilityhub/api-client/mocks";
import brandingCanicFixture from "@agilityhub/api-client/mocks/branding-canic";
import { server } from "@agilityhub/api-client/mocks/server";
import { createI18n } from "@agilityhub/i18n";
import { type Branding, BrandingProvider } from "@agilityhub/ui";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { type ClassSession, defaultCalendarSettings } from "./calendar-shared";
import { type CancellationReason, isCancellable } from "./CancelClassModal";
import { SelectedClassCard } from "./SelectedClassCard";

const branding: Branding = {
  ...brandingCanicFixture,
  theme: { ...brandingCanicFixture.theme, mode: "light" },
};
// The D4 mockup is drawn on Wednesday 12 August 2026 (club-local week 2026-08-10…16).
const mockupNow = new Date("2026-08-12T08:00:00Z");
const MINUTE = 60_000;

beforeAll(() => {
  server.listen({ onUnhandledRequest: "error" });
});
beforeEach(() => {
  vi.useFakeTimers({ now: mockupNow, shouldAdvanceTime: true, toFake: ["Date"] });
  resetPlanningState();
  mockScenario("admin");
});
afterEach(() => {
  cleanup();
  server.resetHandlers();
  vi.useRealTimers();
  resetPlanningState();
});
afterAll(() => {
  server.close();
});

/** A class of the mock calendar in `state`, starting `offset` ms from now. */
function sessionIn(state: "ACTIVE" | "DRAFT", offset: number): ClassSession {
  const session = planningState.sessions.find((item) => item.state === state);
  if (session === undefined) throw new Error("SESSION_NOT_FOUND");
  return { ...session, startsAt: new Date(Date.now() + offset).toISOString() };
}

async function renderCard(session: ClassSession) {
  const onCancel = vi.fn<(reason: CancellationReason) => void>();
  const i18n = await createI18n({
    branding,
    browserLanguages: ["ca"],
    initialNamespaces: ["admin-scheduling", "enums", "errors"],
    storage: undefined,
  });
  render(
    <I18nextProvider i18n={i18n}>
      <BrandingProvider branding={branding}>
        <SelectedClassCard
          catalogs={{
            instructors: catalogState.instructors,
            levels: catalogState.levels,
            rings: catalogState.rings,
          }}
          client={createApiClient({ baseUrl: `${window.location.origin}/api/v1` })}
          heading={{ day: "dc 12", description: "", instructors: "", ring: "Central", time: "" }}
          onCancel={onCancel}
          onClose={() => undefined}
          onConflict={() => Promise.resolve()}
          onSaved={() => Promise.resolve()}
          openingHours={undefined}
          readOnly={false}
          session={session}
          settings={defaultCalendarSettings}
          waitlistEnabled
        />
      </BrandingProvider>
    </I18nextProvider>,
  );
  await screen.findByRole("button", { name: "ACCEPTA" });
  return onCancel;
}

describe("PLAN-02 D4: the admin cancels or deletes a class only before it starts (R-06-10)", () => {
  it("isCancellable is false from the start's own instant on, true a second before", () => {
    const now = Date.parse("2026-08-12T16:50:00Z");
    const at = (instant: number) => ({
      ...sessionIn("ACTIVE", 0),
      startsAt: new Date(instant).toISOString(),
    });
    expect(isCancellable(at(now + 1000), now)).toBe(true);
    expect(isCancellable(at(now), now)).toBe(false);
    expect(isCancellable(at(now - 1000), now)).toBe(false);
  });

  it.each([
    ["at its start", 0],
    ["a minute after its start", -MINUTE],
  ])(
    "an ACTIVE class %s offers neither [ANUL·LA LA CLASSE] nor [ELIMINA]; [ACCEPTA] stays",
    async (_label, offset) => {
      await renderCard(sessionIn("ACTIVE", offset));
      expect(screen.queryByRole("button", { name: "ANUL·LA LA CLASSE" })).toBeNull();
      expect(screen.queryByRole("button", { name: "ELIMINA" })).toBeNull();
      expect(screen.getByRole("button", { name: "ACCEPTA" })).toBeVisible();
    },
  );

  it("a DRAFT whose start has passed offers no [Elimina]", async () => {
    await renderCard(sessionIn("DRAFT", -MINUTE));
    expect(screen.queryByRole("button", { name: "Elimina" })).toBeNull();
    expect(screen.getByRole("button", { name: "ACCEPTA" })).toBeVisible();
  });

  it("an ACTIVE class a minute ahead offers both, each opening D4c with its reason", async () => {
    const onCancel = await renderCard(sessionIn("ACTIVE", MINUTE));
    fireEvent.click(screen.getByRole("button", { name: "ANUL·LA LA CLASSE" }));
    fireEvent.click(screen.getByRole("button", { name: "ELIMINA" }));
    expect(onCancel.mock.calls).toEqual([["CLUB_MANUAL"], ["DELETED"]]);
  });

  it("a DRAFT a minute ahead offers [Elimina]", async () => {
    const onCancel = await renderCard(sessionIn("DRAFT", MINUTE));
    fireEvent.click(screen.getByRole("button", { name: "Elimina" }));
    expect(onCancel.mock.calls).toEqual([["DELETED"]]);
  });
});
