import { createApiClient } from "@agilityhub/api-client";
import {
  handlers,
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
import { getResponse, http, HttpResponse } from "msw";
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

describe("E5-W05 step 4 · D10's «Classes» table names each class and its ring (E5-T29)", () => {
  it("E5-W05 step 4: each row reads the class's description and its ring (dot in the ring's colour and name), as E5-W03 step 3 asks", async () => {
    const requests = recordRequests();
    const { card } = await renderCard();
    const classes = within(card).getByRole("table", { name: "Classes" });
    expect(
      within(classes)
        .getAllByRole("columnheader")
        .map((cell) => cell.textContent),
    ).toEqual(["Dia i hora", "Classe", "Pista", "Gos", "Estat", "Origen"]);
    // What the api sends for the newest booking (the mock world's, read the same way).
    const answer = (await (
      await fetch(
        `${window.location.origin}/api/v1/bookings?filter=memberId%3Aeq%3Amember-laura&sort=classStartsAt%2Cdesc&size=20&fields=classDescription%2CringName%2CringColor`,
      )
    ).json()) as { items: { classDescription: string; ringColor: string; ringName: string }[] };
    const newest = answer.items[0];
    if (newest === undefined) throw new TypeError("Laura has no class booking");
    const firstRow = within(classes).getAllByRole("row")[1];
    if (firstRow === undefined) throw new TypeError("No first row");
    const cells = within(firstRow).getAllByRole("cell");
    expect(cells[1]?.textContent).toBe(newest.classDescription);
    expect(cells[2]?.textContent).toBe(newest.ringName);
    expect(cells[2]?.querySelector(".member-bookings__dot")?.getAttribute("style")).toContain(
      `--ah-ring-color: ${newest.ringColor}`,
    );
    const bookings = requests.find((url) => url.pathname.endsWith("/api/v1/bookings"));
    expect(bookings?.searchParams.get("fields")?.split(",")).toEqual(
      expect.arrayContaining(["classDescription", "ringName", "ringColor"]),
    );
  });
});

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
    // Wednesday 12 at 18:50 is the latest class the api lists for Laura: Duna holds two classes of
    // that booking week, its limit (E7-W07 step 5, R-08-03 and R-08-19; B+C takes B and C dogs,
    // E5-W05 round 3 #4), both booked in the app.
    expect(firstRow?.textContent).toBe("dc 12/08 · 18:50B+CCentralDunaconfirmadaapp");
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

  it("R-08-19: a class the club booked for her (`origin: BACKOFFICE`) reads «club»", async () => {
    // At this clock none of Laura's mock bookings is the club's (E7-W07 step 5): the api's own
    // list, with its first row booked by the club.
    server.use(
      http.get("*/api/v1/bookings", async ({ request }) => {
        const answer = await getResponse(handlers, request);
        if (answer === undefined) throw new TypeError("The bookings mock did not answer");
        const page = (await answer.json()) as { items: { origin: string }[] };
        const [first, ...rest] = page.items;
        if (first === undefined) throw new TypeError("Laura has no class booking");
        return HttpResponse.json({ ...page, items: [{ ...first, origin: "BACKOFFICE" }, ...rest] });
      }),
    );
    const { card } = await renderCard();
    const rows = within(within(card).getByRole("table", { name: "Classes" })).getAllByRole("row");
    expect(rows[1]?.textContent).toBe("dc 12/08 · 18:50B+CCentralDunaconfirmadaclub");
    expect(rows.slice(2).every((row) => row.textContent.endsWith("app"))).toBe(true);
  });

  it("E5-W03 round 2 · review #4: «Mostra'n més» pages through the member's class bookings, never asking for 1000", async () => {
    // A member with 45 class bookings, paged by the api (CONVENCIONS_API §4): 20 + 20 + 5.
    const all = Array.from({ length: 45 }, (_, index) => ({
      classStartsAt: new Date(Date.UTC(2026, 7, 15, 16, 50) - index * 86_400_000).toISOString(),
      dogName: "Duna",
      id: `booking-${String(index)}`,
      late: null,
      origin: "APP",
      state: "ACTIVE",
    }));
    let failThirdPage = true;
    server.use(
      http.get("*/api/v1/bookings", ({ request }) => {
        const url = new URL(request.url);
        const size = Number(url.searchParams.get("size"));
        const page = Number(url.searchParams.get("page"));
        if (page === 2 && failThirdPage) {
          failThirdPage = false;
          return HttpResponse.json(
            { code: "INTERNAL_ERROR", details: {}, message: "Internal error", traceId: "t" },
            { status: 500 },
          );
        }
        return HttpResponse.json({
          appliedFilters: [{ field: "memberId", op: "eq", value: "member-laura" }],
          items: all.slice(page * size, (page + 1) * size),
          page,
          size,
          totalItems: all.length,
          totalPages: Math.ceil(all.length / size),
        });
      }),
    );
    const requests = recordRequests();
    const { card } = await renderCard();
    const rows = () =>
      within(within(card).getByRole("table", { name: "Classes" })).getAllByRole("row");
    expect(rows()).toHaveLength(1 + 20);
    expect(within(card).queryByRole("button", { name: "Veure'ls tots ›" })).toBeNull();

    fireEvent.click(within(card).getByRole("button", { name: "Mostra'n més" }));
    await waitFor(() => {
      expect(rows()).toHaveLength(1 + 40);
    });
    // The third page fails once: the forty rows stay, the button asks it again.
    fireEvent.click(within(card).getByRole("button", { name: "Mostra'n més" }));
    expect(await within(card).findByRole("alert")).toHaveTextContent(
      "S'ha produït un error inesperat.",
    );
    expect(rows()).toHaveLength(1 + 40);
    fireEvent.click(within(card).getByRole("button", { name: "Mostra'n més" }));
    await waitFor(() => {
      expect(rows()).toHaveLength(1 + 45);
    });
    // The last page: no «Mostra'n més» (nor any alert) any more.
    expect(within(card).queryByRole("button", { name: "Mostra'n més" })).toBeNull();
    expect(within(card).queryByRole("alert")).toBeNull();
    const pages = requests
      .filter((url) => url.pathname.endsWith("/api/v1/bookings"))
      .map((url) => `${url.searchParams.get("page") ?? ""}/${url.searchParams.get("size") ?? ""}`);
    expect(pages).toEqual(["0/20", "1/20", "2/20", "2/20"]);
  });

  it("«Mostra'n més» is busy while its page is read", async () => {
    let release: () => void = () => undefined;
    server.use(
      http.get("*/api/v1/bookings", async ({ request }) => {
        const url = new URL(request.url);
        const page = Number(url.searchParams.get("page"));
        if (page === 1) {
          await new Promise<void>((resolve) => {
            release = resolve;
          });
        }
        return HttpResponse.json({
          appliedFilters: [],
          items: Array.from({ length: 20 }, (_, index) => ({
            classStartsAt: new Date(
              Date.UTC(2026, 7, 15, 16, 50) - (page * 20 + index) * 86_400_000,
            ).toISOString(),
            dogName: "Duna",
            id: `booking-${String(page * 20 + index)}`,
            late: null,
            origin: "APP",
            state: "ACTIVE",
          })),
          page,
          size: 20,
          totalItems: 40,
          totalPages: 2,
        });
      }),
    );
    const { card } = await renderCard();
    fireEvent.click(within(card).getByRole("button", { name: "Mostra'n més" }));
    await waitFor(() => {
      expect(within(card).getByRole("button", { name: /Mostra'n més/u })).toHaveAttribute(
        "aria-busy",
        "true",
      );
    });
    release();
    await waitFor(() => {
      expect(within(card).queryByRole("button", { name: /Mostra'n més/u })).toBeNull();
    });
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
