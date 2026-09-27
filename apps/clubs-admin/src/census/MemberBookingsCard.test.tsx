import { createApiClient } from "@agilityhub/api-client";
import {
  JOBS_MOCK_NOW,
  mockScenario,
  resetBackofficeMockState,
  resetPlanningState,
  resetTrainingMockState,
} from "@agilityhub/api-client/mocks";
import brandingCanicFixture from "@agilityhub/api-client/mocks/branding-canic";
import { server } from "@agilityhub/api-client/mocks/server";
import { createI18n } from "@agilityhub/i18n";
import { type Branding, BrandingProvider } from "@agilityhub/ui";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { I18nextProvider } from "react-i18next";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { MemberBookingsCard } from "./MemberBookingsCard";

const branding: Branding = {
  ...brandingCanicFixture,
  theme: { ...brandingCanicFixture.theme, mode: "dark" },
};

beforeAll(() => {
  server.listen({ onUnhandledRequest: "error" });
});
beforeEach(() => {
  vi.useFakeTimers({ now: new Date(JOBS_MOCK_NOW), shouldAdvanceTime: true, toFake: ["Date"] });
  resetPlanningState();
  resetTrainingMockState();
  resetBackofficeMockState();
});
afterEach(() => {
  cleanup();
  server.resetHandlers();
  server.events.removeAllListeners();
  vi.useRealTimers();
  mockScenario("admin");
});
afterAll(() => {
  server.close();
});

function recordRequests(): URL[] {
  const urls: URL[] = [];
  server.events.on("request:start", ({ request }) => {
    urls.push(new URL(request.url));
  });
  return urls;
}

async function renderCard(modules: readonly string[] = branding.modules) {
  const clubBranding: Branding = { ...branding, modules: [...modules] };
  const i18n = await createI18n({
    branding: clubBranding,
    browserLanguages: ["ca"],
    initialNamespaces: ["admin-census", "enums", "errors"],
    storage: undefined,
  });
  const onNavigate = vi.fn();
  render(
    <I18nextProvider i18n={i18n}>
      <BrandingProvider branding={clubBranding}>
        <MemberBookingsCard
          client={createApiClient({ baseUrl: `${window.location.origin}/api/v1` })}
          memberId="member-laura"
          onNavigate={onNavigate}
        />
      </BrandingProvider>
    </I18nextProvider>,
  );
  const card = await screen.findByRole("region", { name: "Reserves" });
  await within(card).findAllByText("Duna");
  return { card, onNavigate };
}

describe("E5-W03 step 3 · D10 «Reserves» (S08 §2, S09 §2, R-08-19)", () => {
  it("shows the member's class bookings (newest first) and training bookings, read-only, with the «Entra com l'abonat» note", async () => {
    const requests = recordRequests();
    const { card } = await renderCard();
    expect(
      within(card).getByText(
        "Per reservar o anul·lar en nom seu, fes servir «Entra com l'abonat».",
      ),
    ).toBeVisible();
    const classes = within(card).getByRole("table", { name: "Classes" });
    const firstRow = within(classes).getAllByRole("row")[1];
    // Saturday 15 at 8:30 is the latest class of the current week the api lists for Laura, booked
    // by the club for her (`origin: BACKOFFICE`).
    expect(firstRow?.textContent).toBe("ds 15/08 · 8:30Dunaconfirmadaclub");
    const bookings = requests.find((url) => url.pathname.endsWith("/api/v1/bookings"));
    expect(bookings?.searchParams.getAll("filter")).toEqual(["memberId:eq:member-laura"]);
    expect(bookings?.searchParams.getAll("sort")).toEqual(["classStartsAt,desc"]);
    expect(bookings?.searchParams.get("size")).toBe("20");

    const trainings = await within(card).findByRole("table", { name: "Entrenaments" });
    await within(trainings).findAllByText("Rock");
    expect(
      within(trainings)
        .getAllByRole("row")
        .slice(1)
        .map((row) => row.textContent),
    ).toEqual([
      "dt 04/08 · 8:00MuntanyaRockconfirmadaapp",
      "dl 03/08 · 16:30CarreteraRockcancel·lada pel clubapp",
      "dl 03/08 · 7:00MuntanyaRockconfirmadaclub",
    ]);
    const training = requests.find((url) => url.pathname.endsWith("/api/v1/training-bookings"));
    expect(training?.searchParams.getAll("filter")).toEqual(["memberId:eq:member-laura"]);
    // R-08-19: nothing to book or cancel from D10.
    expect(within(card).queryByRole("button", { name: /anul·la|reserva/iu })).toBeNull();
  });

  it("«Veure'ls tots ›» reads every class booking of the member (the first page is 20)", async () => {
    // A member with 25 class bookings: the api's pages of 20 and 1000 (CONVENCIONS_API §4).
    const all = Array.from({ length: 25 }, (_, index) => ({
      classStartsAt: new Date(Date.UTC(2026, 7, 15, 16, 50) - index * 86_400_000).toISOString(),
      dogName: "Duna",
      id: `booking-${String(index)}`,
      late: null,
      origin: "APP",
      state: "ACTIVE",
    }));
    server.use(
      http.get("*/api/v1/bookings", ({ request }) => {
        const size = Number(new URL(request.url).searchParams.get("size"));
        return HttpResponse.json({
          appliedFilters: [{ field: "memberId", op: "eq", value: "member-laura" }],
          items: all.slice(0, size),
          page: 0,
          size,
          totalItems: all.length,
          totalPages: Math.ceil(all.length / size),
        });
      }),
    );
    const requests = recordRequests();
    const { card } = await renderCard();
    const classes = within(card).getByRole("table", { name: "Classes" });
    expect(within(classes).getAllByRole("row")).toHaveLength(1 + 20);
    fireEvent.click(within(card).getByRole("button", { name: "Veure'ls tots ›" }));
    await waitFor(() => {
      expect(
        requests.some(
          (url) =>
            url.pathname.endsWith("/api/v1/bookings") && url.searchParams.get("size") === "1000",
        ),
      ).toBe(true);
    });
    await waitFor(() => {
      expect(
        within(within(card).getByRole("table", { name: "Classes" })).getAllByRole("row"),
      ).toHaveLength(1 + 25);
    });
    expect(within(card).queryByRole("button", { name: "Veure'ls tots ›" })).toBeNull();
  });

  it("S09 §9: without FREE_TRAINING the training table is absent and never asked for", async () => {
    const requests = recordRequests();
    const { card } = await renderCard(
      branding.modules.filter((module) => module !== "FREE_TRAINING"),
    );
    expect(within(card).queryByRole("table", { name: "Entrenaments" })).toBeNull();
    expect(requests.some((url) => url.pathname.endsWith("/training-bookings"))).toBe(false);
  });
});
