import { createApiClient } from "@agilityhub/api-client";
import { mockScenario, resetActivityState } from "@agilityhub/api-client/mocks";
import brandingCanicFixture from "@agilityhub/api-client/mocks/branding-canic";
import { server } from "@agilityhub/api-client/mocks/server";
import { createI18n } from "@agilityhub/i18n";
import { type Branding, BrandingProvider } from "@agilityhub/ui";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import type { ReactNode } from "react";
import { I18nextProvider } from "react-i18next";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { ReserveActivitiesPage } from "./ActivitiesBlock";
import { ActivityDetailPage } from "./ActivityDetailPage";
import { ActivityHistoryRow } from "./ActivityHistoryRow";
import { ActivityReservationRow, HomeActivityReservations } from "./ActivityReservationRow";
import { type ActivityRegistrationSummary, safeDecode } from "./shared";

const branding: Branding = {
  ...brandingCanicFixture,
  theme: { ...brandingCanicFixture.theme, mode: "dark" },
};
// The 04 and 03 mockups are read at the beginning of August 2026 (club-local).
const mockupNow = new Date("2026-08-04T08:00:00Z");
const TOURNAMENT = "activity-torneig-estiu-2026";
const SEMINAR = "activity-seminari-handling";
const WORKSHOP = "activity-taller-contactes";
const LEAGUE = "activity-lliga-social-3";

beforeAll(() => {
  server.listen({ onUnhandledRequest: "error" });
});
beforeEach(() => {
  vi.useFakeTimers({ now: mockupNow, shouldAdvanceTime: true, toFake: ["Date"] });
  resetActivityState();
  mockScenario("member");
});
afterEach(() => {
  cleanup();
  server.resetHandlers();
  vi.useRealTimers();
  resetActivityState();
  mockScenario("member");
});
afterAll(() => {
  server.close();
});

function client() {
  return createApiClient({ baseUrl: `${window.location.origin}/api/v1`, getLocale: () => "ca" });
}

async function renderWith(node: ReactNode, modules: readonly string[] = branding.modules) {
  const clubBranding: Branding = { ...branding, modules: [...modules] };
  const i18n = await createI18n({
    branding: clubBranding,
    browserLanguages: ["ca"],
    initialNamespaces: ["activities", "common", "enums", "errors", "shell"],
    storage: undefined,
  });
  return render(
    <I18nextProvider i18n={i18n}>
      <BrandingProvider branding={clubBranding}>{node}</BrandingProvider>
    </I18nextProvider>,
  );
}

function rowTexts(section: HTMLElement) {
  return within(section)
    .getAllByRole("generic")
    .filter((element) => element.classList.contains("activity-row"))
    .map((row) => row.textContent.replace(/\s+/gu, " ").trim());
}

describe("T-07-30 app: block «Activitats» of 04, detail, rows of 03 and 25", () => {
  it("draws the 04 block with the exact badges; the full row with waitlist stays tappable", async () => {
    await renderWith(<ReserveActivitiesPage client={client()} />);
    expect(screen.getByRole("heading", { name: "Reservar" })).toBeVisible();
    expect(
      screen.getByText("Seleccioneu l'activitat o classe que vulgueu reservar."),
    ).toBeVisible();
    const block = await screen.findByRole("region", { name: "Activitats" });
    expect(rowTexts(block)).toEqual([
      "Taller de contactes · ds 22 · 10:00Completa · ⏳2",
      "Seminari de handling · ds 12/09 · 9:006 places",
    ]);
    expect(within(block).getByRole("link", { name: /Seminari de handling/u })).toHaveAttribute(
      "href",
      `/activitats/${SEMINAR}`,
    );
    expect(within(block).getByRole("link", { name: /Taller de contactes/u })).toHaveAttribute(
      "href",
      `/activitats/${WORKSHOP}`,
    );
  });

  it("R-07-14 without WAITLIST the full activity is «Completa» and inert; an open one without maximum is «Obertes»", async () => {
    mockScenario("activitiesNoWaitlist");
    await renderWith(
      <ReserveActivitiesPage client={client()} />,
      branding.modules.filter((module) => module !== "WAITLIST"),
    );
    const block = await screen.findByRole("region", { name: "Activitats" });
    expect(rowTexts(block)[0]).toBe("Taller de contactes · ds 22 · 10:00Completa");
    expect(within(block).queryByRole("link", { name: /Taller de contactes/u })).toBeNull();
    cleanup();

    mockScenario("member");
    vi.setSystemTime(new Date("2026-09-02T08:00:00Z"));
    await renderWith(<ReserveActivitiesPage client={client()} />);
    const september = await screen.findByRole("region", { name: "Activitats" });
    expect(rowTexts(september)).toEqual([
      "Seminari de handling · ds 12 · 9:006 places",
      "Lliga social — 3a jornada · ds 19 · 9:00Obertes",
    ]);
  });

  it("R-07-14 omits the block without ACTIVITIES", async () => {
    await renderWith(
      <ReserveActivitiesPage client={client()} />,
      branding.modules.filter((module) => module !== "ACTIVITIES"),
    );
    expect(await screen.findByRole("heading", { name: "Reservar" })).toBeVisible();
    expect(screen.queryByRole("region", { name: "Activitats" })).toBeNull();
  });

  it("OPEN: [INSCRIU-M'HI] registers and then offers [ANUL·LA LA INSCRIPCIÓ]", async () => {
    await renderWith(<ActivityDetailPage activityId={SEMINAR} client={client()} />);
    expect(await screen.findByRole("heading", { name: "Seminari de handling" })).toBeVisible();
    expect(screen.getByText("ds 12 de setembre · 9:00–13:00")).toBeVisible();
    expect(screen.getByText("Central")).toBeVisible();
    expect(screen.getByText("Inscripció fins el 6 de setembre")).toBeVisible();
    expect(screen.getByText("6 places lliures de 12")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "INSCRIU-M'HI" }));
    expect(await screen.findByText("T'hi has inscrit")).toBeVisible();
    expect(await screen.findByRole("button", { name: "ANUL·LA LA INSCRIPCIÓ" })).toBeVisible();
    expect(screen.getByText("inscrita")).toBeVisible();
  });

  it("FULL_WAITLIST: the waitlist dialog → toast «Ets a la llista d'espera» → [SURT DE LA LLISTA D'ESPERA]", async () => {
    await renderWith(<ActivityDetailPage activityId={WORKSHOP} client={client()} />);
    fireEvent.click(await screen.findByRole("button", { name: "APUNTA'M A LA LLISTA D'ESPERA" }));
    const dialog = await screen.findByRole("dialog", {
      name: "Vols apuntar-te a la llista d'espera de Taller de contactes?",
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "APUNTA'M A LA LLISTA D'ESPERA" }));
    expect(await screen.findByText("Ets a la llista d'espera")).toBeVisible();
    expect(await screen.findByRole("button", { name: "SURT DE LA LLISTA D'ESPERA" })).toBeVisible();
    expect(screen.getByText("en llista d'espera (3)")).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "SURT DE LA LLISTA D'ESPERA" }));
    const leave = await screen.findByRole("dialog", {
      name: "Vols sortir de la llista d'espera de Taller de contactes?",
    });
    fireEvent.click(within(leave).getByRole("button", { name: "SURT DE LA LLISTA D'ESPERA" }));
    expect(await screen.findByText("Has sortit de la llista d'espera")).toBeVisible();
    expect(
      await screen.findByRole("button", { name: "APUNTA'M A LA LLISTA D'ESPERA" }),
    ).toBeVisible();
  });

  it("R-07-08 an ACTIVITY_FULL answer with waitlistAvailable opens the waitlist dialog", async () => {
    server.use(
      http.post("*/api/v1/activity-registrations", () =>
        HttpResponse.json(
          {
            code: "ACTIVITY_FULL",
            details: { waitlistAvailable: true, waiting: 0 },
            message: "full",
            traceId: "t",
          },
          { status: 409 },
        ),
      ),
    );
    await renderWith(<ActivityDetailPage activityId={SEMINAR} client={client()} />);
    fireEvent.click(await screen.findByRole("button", { name: "INSCRIU-M'HI" }));
    expect(
      await screen.findByRole("dialog", {
        name: "Vols apuntar-te a la llista d'espera de Seminari de handling?",
      }),
    ).toBeVisible();
  });

  it("registered: [ANUL·LA LA INSCRIPCIÓ] with confirmation; after the start, the contact text", async () => {
    await renderWith(<ActivityDetailPage activityId={TOURNAMENT} client={client()} />);
    expect(await screen.findByText("totes les pistes")).toBeVisible();
    expect(screen.getByText("dv 7 d’agost · 18:30–20:30")).toBeVisible();
    expect(screen.getByRole("heading", { name: "Horaris" })).toBeVisible();
    expect(screen.getByRole("link", { name: "normativa.pdf" })).toHaveAttribute(
      "rel",
      "noreferrer",
    );
    fireEvent.click(screen.getByRole("button", { name: "ANUL·LA LA INSCRIPCIÓ" }));
    const dialog = await screen.findByRole("dialog", {
      name: "Vols anul·lar la inscripció a Torneig d'Estiu 2026?",
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "ANUL·LA LA INSCRIPCIÓ" }));
    expect(await screen.findByText("Inscripció anul·lada")).toBeVisible();
    cleanup();

    resetActivityState();
    vi.setSystemTime(new Date("2026-08-07T16:45:00Z"));
    await renderWith(<ActivityDetailPage activityId={TOURNAMENT} client={client()} />);
    expect(
      await screen.findByText("Per anul·lar la inscripció, posa't en contacte amb el club"),
    ).toBeVisible();
    expect(screen.queryByRole("button", { name: "ANUL·LA LA INSCRIPCIÓ" })).toBeNull();
  });

  it("an activity that is not visible shows «No disponible»", async () => {
    await renderWith(
      <ActivityDetailPage activityId="activity-demostracio-festa-major" client={client()} />,
    );
    expect(await screen.findByText("No disponible")).toBeVisible();
    expect(screen.getByText("Aquesta activitat ja no està disponible.")).toBeVisible();
  });

  it("03: «Torneig d'Estiu 2026 · inscrita · Divendres 7 · 18:30–20:30 · totes les pistes», never a dog", async () => {
    await renderWith(<HomeActivityReservations client={client()} fallback={<p>buit</p>} />);
    const section = await screen.findByRole("region", { name: "Les meves reserves" });
    const row = within(section).getByRole("link");
    expect(row).toHaveAttribute("href", `/activitats/${TOURNAMENT}`);
    expect(row.textContent.replace(/\s+/gu, " ").trim()).toBe(
      "Torneig d'Estiu 2026inscritaDivendres 7 · 18:30–20:30 · totes les pistes",
    );
    expect(row).not.toHaveTextContent(/ amb /u);
  });

  it("03: a start-only activity (api end = next day T00:00) reads «9:00» and stays until midnight", async () => {
    vi.setSystemTime(new Date("2026-09-02T08:00:00Z"));
    const registered = await client().POST("/activity-registrations", {
      body: { activityId: LEAGUE },
      params: { header: { "Idempotency-Key": crypto.randomUUID() } },
    });
    expect(registered.data?.activity.endsAtLocal).toBe("2026-09-20T00:00");
    // Saturday 19 September at 12:00 in the club (10:00Z): three hours after the start.
    vi.setSystemTime(new Date("2026-09-19T10:00:00Z"));
    await renderWith(<HomeActivityReservations client={client()} fallback={<p>buit</p>} />);
    const section = await screen.findByRole("region", { name: "Les meves reserves" });
    expect(within(section).getByRole("link").textContent.replace(/\s+/gu, " ").trim()).toBe(
      "Lliga social — 3a jornadainscritaDissabte 19 · 9:00 · totes les pistes",
    );
  });

  it("03: never shows a dog, even when the data carries one", async () => {
    const withDog = {
      activity: {
        endsAtLocal: "2026-08-07T20:30",
        id: TOURNAMENT,
        placeLabel: "totes les pistes",
        startsAtLocal: "2026-08-07T18:30",
        title: "Torneig d'Estiu 2026",
      },
      activityId: TOURNAMENT,
      cancellableUntil: "2026-08-07T16:30:00Z",
      dog: { id: "dog-blat", name: "Blat" },
      id: "registration-dog",
      origin: "APP",
      registeredAt: "2026-07-02T08:00:00Z",
      state: "ACTIVE",
    } satisfies ActivityRegistrationSummary & { dog: { id: string; name: string } };
    await renderWith(<ActivityReservationRow registration={withDog} />);
    const row = await screen.findByRole("link");
    expect(row.textContent.replace(/\s+/gu, " ").trim()).toBe(
      "Torneig d'Estiu 2026inscritaDivendres 7 · 18:30–20:30 · totes les pistes",
    );
    expect(row).not.toHaveTextContent(/Blat/u);
  });

  it("R-07-11 omits the block with an empty bookable[] and draws a NOT_BOOKABLE row inert", async () => {
    const real = (await client().GET("/me/activities")).data;
    if (real === undefined) throw new TypeError("Missing /me/activities");
    server.use(
      http.get("*/api/v1/me/activities", () => HttpResponse.json({ ...real, bookable: [] })),
    );
    await renderWith(<ReserveActivitiesPage client={client()} />);
    expect(await screen.findByRole("heading", { name: "Reservar" })).toBeVisible();
    await waitFor(() => {
      expect(screen.queryByLabelText("Carregant les activitats")).toBeNull();
    });
    expect(screen.queryByRole("region", { name: "Activitats" })).toBeNull();
    cleanup();

    const seminar = real.bookable.find((row) => row.id === SEMINAR);
    if (seminar === undefined) throw new TypeError("Missing the Seminari row");
    server.use(
      http.get("*/api/v1/me/activities", () =>
        HttpResponse.json({
          ...real,
          bookable: [{ ...seminar, notBookableReason: "LEVEL_NOT_ALLOWED", rowState: "NOT_BOOKABLE" }],
        }),
      ),
    );
    await renderWith(<ReserveActivitiesPage client={client()} />);
    const block = await screen.findByRole("region", { name: "Activitats" });
    expect(within(block).queryByRole("link")).toBeNull();
    expect(within(block).getByText("Seminari de handling").closest("[aria-disabled]")).toHaveAttribute(
      "aria-disabled",
      "true",
    );
  });

  it("R-07-14 a failed block shows the error with a retry; only MODULE_DISABLED hides it", async () => {
    let calls = 0;
    server.use(
      http.get("*/api/v1/me/activities", () => {
        calls += 1;
        return calls === 1
          ? HttpResponse.json(
              { code: "INTERNAL_ERROR", details: {}, message: "boom", traceId: "t" },
              { status: 500 },
            )
          : undefined;
      }),
    );
    await renderWith(<ReserveActivitiesPage client={client()} />);
    const block = await screen.findByRole("region", { name: "Activitats" });
    expect(await within(block).findByRole("alert")).toHaveTextContent(
      "No s'han pogut carregar les activitats.",
    );
    fireEvent.click(within(block).getByRole("button", { name: "Torna-ho a provar" }));
    expect(await screen.findByRole("link", { name: /Seminari de handling/u })).toBeVisible();
    cleanup();

    server.use(
      http.get("*/api/v1/me/activities", () =>
        HttpResponse.json(
          { code: "MODULE_DISABLED", details: {}, message: "off", traceId: "t" },
          { status: 404 },
        ),
      ),
    );
    await renderWith(<ReserveActivitiesPage client={client()} />);
    expect(await screen.findByRole("heading", { name: "Reservar" })).toBeVisible();
    await waitFor(() => {
      expect(screen.queryByLabelText("Carregant les activitats")).toBeNull();
    });
    expect(screen.queryByRole("region", { name: "Activitats" })).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("R-07-08 ACTIVITY_FULL without a waitlist shows «Completa», no dialog", async () => {
    server.use(
      http.post("*/api/v1/activity-registrations", () =>
        HttpResponse.json(
          {
            code: "ACTIVITY_FULL",
            details: { waitlistAvailable: false, waiting: 0 },
            message: "full",
            traceId: "t",
          },
          { status: 409 },
        ),
      ),
    );
    await renderWith(<ActivityDetailPage activityId={SEMINAR} client={client()} />);
    fireEvent.click(await screen.findByRole("button", { name: "INSCRIU-M'HI" }));
    expect(await screen.findByText("Aquesta activitat està completa.")).toBeVisible();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("a waitlisted registration without a position reads «en llista d'espera», never «()»", async () => {
    const api = client();
    await api.POST("/activity-registrations", {
      body: { activityId: WORKSHOP, joinWaitlist: true },
      params: { header: { "Idempotency-Key": crypto.randomUUID() } },
    });
    const real = (
      await api.GET("/me/activities/{activityId}", { params: { path: { activityId: WORKSHOP } } })
    ).data;
    const mine = real?.myRegistration;
    if (real === undefined || mine === null || mine === undefined) {
      throw new TypeError("Missing the waitlisted registration");
    }
    server.use(
      http.get("*/api/v1/me/activities/:activityId", () =>
        HttpResponse.json({ ...real, myRegistration: { ...mine, position: null } }),
      ),
    );
    await renderWith(<ActivityDetailPage activityId={WORKSHOP} client={client()} />);
    expect(await screen.findByText("en llista d'espera")).toBeVisible();
    expect(screen.queryByText(/\(\)/u)).toBeNull();
  });

  it("decodes the detail path safely (a malformed /activitats/%E0 does not throw)", () => {
    expect(safeDecode("torneig%20estiu")).toBe("torneig estiu");
    expect(safeDecode("%E0")).toBe("%E0");
  });

  it("03: a waitlisted registration shows «en llista d'espera»", async () => {
    const registration: ActivityRegistrationSummary = {
      activity: {
        endsAtLocal: "2026-08-22T12:00",
        id: WORKSHOP,
        placeLabel: "Cadells",
        startsAtLocal: "2026-08-22T10:00",
        title: "Taller de contactes",
      },
      activityId: WORKSHOP,
      cancellableUntil: "2026-08-22T08:00:00Z",
      id: "registration-1",
      origin: "APP",
      position: 3,
      registeredAt: "2026-08-04T08:00:00Z",
      state: "WAITLISTED",
    };
    await renderWith(<ActivityReservationRow registration={registration} />);
    expect(await screen.findByText("en llista d'espera")).toBeVisible();
    expect(screen.getByText("Dissabte 22 · 10:00–12:00 · Cadells")).toBeVisible();
  });

  it("25: «ds 12/07 · Seminari d'obstacles · feta» and «cancel·lada pel club» with the quoted notice", async () => {
    const done: ActivityRegistrationSummary = {
      activity: {
        endsAtLocal: "2025-07-12T13:00",
        id: "activity-seminari-obstacles",
        placeLabel: "Central",
        startsAtLocal: "2025-07-12T09:00",
        title: "Seminari d'obstacles",
      },
      activityId: "activity-seminari-obstacles",
      cancellableUntil: "2025-07-12T07:00:00Z",
      id: "registration-done",
      origin: "APP",
      registeredAt: "2025-07-01T08:00:00Z",
      state: "ACTIVE",
    };
    const byClub: ActivityRegistrationSummary = {
      ...done,
      cancellation: { at: "2025-07-10T08:00:00Z", byRole: "SYSTEM", reason: "ACTIVITY_CANCELLED" },
      id: "registration-club",
      state: "CANCELLED",
    };
    const waiting: ActivityRegistrationSummary = {
      ...done,
      id: "registration-wait",
      state: "WAITLISTED",
    };
    await renderWith(
      <>
        <ActivityHistoryRow activityState="FINISHED" registration={done} />
        <ActivityHistoryRow
          activityState="CANCELLED"
          adminText="Pluja forta: pistes tancades"
          registration={byClub}
        />
        <ActivityHistoryRow activityState="PUBLISHED" registration={waiting} />
      </>,
    );
    const rows = await screen.findAllByText("Seminari d'obstacles");
    expect(rows).toHaveLength(2);
    expect(rows[0]?.parentElement?.textContent).toBe("ds 12/07Seminari d'obstacles" + "feta");
    expect(rows[1]?.parentElement?.textContent).toBe(
      "ds 12/07Seminari d'obstacles" + "cancel·lada pel club",
    );
    expect(screen.getByText("«Pluja forta: pistes tancades»")).toBeVisible();
  });
});
