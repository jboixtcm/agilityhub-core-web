import { createApiClient } from "@agilityhub/api-client";
import {
  ATTENDANCE_MOCK_NOW,
  mockScenario,
  resetAttendanceMockState,
} from "@agilityhub/api-client/mocks";
import brandingCanicFixture from "@agilityhub/api-client/mocks/branding-canic";
import { server } from "@agilityhub/api-client/mocks/server";
import { createI18n } from "@agilityhub/i18n";
import { type Branding, BrandingProvider } from "@agilityhub/ui";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { AttendancePage } from "./AttendancePage";

const canic: Branding = {
  ...brandingCanicFixture,
  locales: ["ca", "es", "en"],
  theme: { ...brandingCanicFixture.theme, mode: "dark" },
};

beforeAll(() => {
  server.listen({ onUnhandledRequest: "error" });
});
beforeEach(() => {
  vi.useFakeTimers({
    now: new Date(ATTENDANCE_MOCK_NOW),
    shouldAdvanceTime: true,
    toFake: ["Date"],
  });
  resetAttendanceMockState();
});
afterEach(() => {
  cleanup();
  server.resetHandlers();
  vi.useRealTimers();
  resetAttendanceMockState();
  mockScenario("member");
  window.history.replaceState(null, "", "/");
});
afterAll(() => {
  server.close();
});

async function renderSheet(classId = "c1") {
  mockScenario("instructor");
  window.history.replaceState(null, "", `/instructor/classes/${classId}`);
  const i18n = await createI18n({
    branding: canic,
    browserLanguages: ["ca"],
    initialNamespaces: ["instructor", "enums", "errors", "home", "common"],
    storage: undefined,
  });
  const client = createApiClient({
    baseUrl: `${window.location.origin}/api/v1`,
    getLocale: () => "ca",
  });
  render(
    <I18nextProvider i18n={i18n}>
      <BrandingProvider branding={canic}>
        <AttendancePage classId={classId} client={client} />
      </BrandingProvider>
    </I18nextProvider>,
  );
  await screen.findByText("Laura + Duna", { selector: "strong" });
}

const rows = () => [...document.querySelectorAll<HTMLElement>("li.instructor-sheet__row")];
const attributes = () =>
  rows().map((row) => [
    row.getAttribute("data-booking-id"),
    row.getAttribute("data-attendance-state"),
  ]);

describe("T-10-27 E7-W06 step 5 (ruling E82, E6-W04 Q6): stable data attributes on screen 21's rows", () => {
  it("E7-W06 step 5: each attendance row carries its booking's id and the state it shows (data-booking-id, data-attendance-state); a tap changes the state, and the saved list keeps it", async () => {
    await renderSheet();
    expect(attributes()).toEqual([
      ["b1", "PRESENT"],
      ["b2", "PENDING"],
      ["b3", "NOTIFIED"],
      ["b4", "NO_SHOW"],
    ]);
    const marc = present(rows()[1]);
    fireEvent.click(within(marc).getByRole("radio", { name: "present" }));
    expect(marc).toHaveAttribute("data-attendance-state", "PRESENT");
    fireEvent.click(screen.getByRole("button", { name: "Desa" }));
    expect(await screen.findByText("Llista desada")).toBeVisible();
    await waitFor(() => {
      expect(attributes()).toEqual([
        ["b1", "PRESENT"],
        ["b2", "PRESENT"],
        ["b3", "NOTIFIED"],
        ["b4", "NO_SHOW"],
      ]);
    });
  });
});

function present<T>(value: T | null | undefined): T {
  if (value === null || value === undefined) throw new TypeError("Expected an element");
  return value;
}
