import { createApiClient } from "@agilityhub/api-client";
import {
  AGENDA_MOCK_NOW,
  AGENDA_SELECTED_CLASS_ID,
  mockScenario,
  resetAttendanceMockState,
  resetFollowupMockState,
  resetTrainingMockState,
} from "@agilityhub/api-client/mocks";
import brandingCanicFixture from "@agilityhub/api-client/mocks/branding-canic";
import { server } from "@agilityhub/api-client/mocks/server";
import { AuthClient, MemoryRefreshTokenStore, SessionProvider } from "@agilityhub/auth";
import { createI18n } from "@agilityhub/i18n";
import { type Branding, BrandingProvider } from "@agilityhub/ui";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { WeekAgendaPage } from "./WeekAgendaPage";

const canic: Branding = {
  ...brandingCanicFixture,
  locales: ["ca", "es", "en"],
  theme: { ...brandingCanicFixture.theme, mode: "dark" },
};

beforeAll(() => {
  server.listen({ onUnhandledRequest: "error" });
});
beforeEach(() => {
  vi.useFakeTimers({ now: new Date(AGENDA_MOCK_NOW), shouldAdvanceTime: true, toFake: ["Date"] });
  resetAttendanceMockState();
  resetTrainingMockState();
  resetFollowupMockState();
  window.history.replaceState(null, "", "/agenda");
});
afterEach(() => {
  cleanup();
  server.resetHandlers();
  vi.useRealTimers();
  resetAttendanceMockState();
  resetTrainingMockState();
  resetFollowupMockState();
  mockScenario("admin");
  window.history.replaceState(null, "", "/");
});
afterAll(() => {
  server.close();
});

const client = () =>
  createApiClient({ baseUrl: `${window.location.origin}/api/v1`, getLocale: () => "ca" });

/** D12 with its selected class's list open under the grid (`?classe=`). */
async function renderPanel() {
  mockScenario("instructor");
  window.history.replaceState(null, "", `/agenda?classe=${AGENDA_SELECTED_CLASS_ID}`);
  const i18n = await createI18n({
    branding: canic,
    browserLanguages: ["ca"],
    initialNamespaces: ["instructor", "enums", "errors", "common", "admin-scheduling", "training"],
    storage: undefined,
  });
  const auth = new AuthClient({
    apiBaseUrl: `${window.location.origin}/api/v1`,
    clientId: "clubs-admin",
    identityBaseUrl: window.location.origin,
    mockMode: true,
    mockRefreshTokenStore: new MemoryRefreshTokenStore(),
  });
  await auth.login("ivet.puig@example.test", "secret-password");
  render(
    <I18nextProvider i18n={i18n}>
      <BrandingProvider branding={canic}>
        <SessionProvider client={auth}>
          <WeekAgendaPage client={client()} onNavigate={vi.fn()} />
        </SessionProvider>
      </BrandingProvider>
    </I18nextProvider>,
  );
  await screen.findByRole("link", { name: "Laura + Duna" });
}

const rows = () => [...document.querySelectorAll<HTMLElement>(".week-agenda__rows > li")];
const attributes = () =>
  rows().map((row) => [
    row.getAttribute("data-booking-id"),
    row.getAttribute("data-attendance-state"),
  ]);

describe("E7-W06 step 5 (ruling E82, E6-W04 Q6): stable data attributes on D12's attendance rows", () => {
  it("E7-W06 step 5: each row carries its booking's id and the state its badge shows (data-booking-id, data-attendance-state), the api's, and a cycled badge changes it", async () => {
    mockScenario("instructor");
    const { data } = await client().GET("/class-sessions/{id}/attendance", {
      params: { path: { id: AGENDA_SELECTED_CLASS_ID } },
    });
    if (data === undefined) throw new TypeError("The mock sheet did not answer");
    await renderPanel();
    expect(attributes()).toEqual(data.rows.map((row) => [row.bookingId, row.state]));
    const pau = rows().find((row) => row.textContent.includes("Pau + Blat"));
    if (pau === undefined) throw new TypeError("No row of Pau + Blat");
    expect(pau).toHaveAttribute("data-attendance-state", "PENDING");
    fireEvent.click(within(pau).getByRole("button", { name: /^Assistència de Pau \+ Blat/u }));
    await waitFor(() => {
      expect(pau).toHaveAttribute("data-attendance-state", "PRESENT");
    });
  });
});
