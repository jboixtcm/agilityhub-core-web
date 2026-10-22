import { createApiClient } from "@agilityhub/api-client";
import { handlers, mockScenario, resetMemberBillingState } from "@agilityhub/api-client/mocks";
import brandingCanicFixture from "@agilityhub/api-client/mocks/branding-canic";
import { server } from "@agilityhub/api-client/mocks/server";
import { AuthClient, MemoryRefreshTokenStore, SessionProvider } from "@agilityhub/auth";
import { createClubsI18n } from "@agilityhub/i18n/clubs";
import { type Branding, BrandingProvider } from "@agilityhub/ui";
import { cleanup, render, screen } from "@testing-library/react";
import { delay, getResponse, http, HttpResponse } from "msw";
import { I18nextProvider } from "react-i18next";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { App } from "./App";

const branding = brandingCanicFixture as Branding;

beforeAll(() => {
  server.listen({ onUnhandledRequest: "bypass" });
});
afterEach(() => {
  cleanup();
  server.resetHandlers();
  mockScenario("member");
  resetMemberBillingState();
});
afterAll(() => {
  server.close();
});

/** The session's own reads: the shell needs them, every screen's data is something else. */
const SESSION_PATHS = /\/api\/v1\/(me|me\/training-summary|branding)$|\/oauth2\//u;

/**
 * A read's answer with nothing in it (E11-W02 round 2, point 2): the mock's own answer with every list
 * emptied — a bare array, or the arrays and totals of a page.
 */
async function emptied(request: Request): Promise<Response | undefined> {
  const real = await getResponse(handlers, request);
  if (!real?.ok) return real;
  const body: unknown = await real.clone().json();
  if (Array.isArray(body)) return HttpResponse.json([]);
  if (body === null || typeof body !== "object") return real;
  const page: Record<string, unknown> = { ...(body as Record<string, unknown>) };
  for (const [key, value] of Object.entries(page)) {
    if (Array.isArray(value)) page[key] = [];
    else if (typeof value === "number" && key.startsWith("total")) page[key] = 0;
    else if (isTextBlock(value)) page[key] = { ...value, attachments: [], text: null };
  }
  return HttpResponse.json(page);
}

/** A text block with attachments (22's notes and observations): empty is `text: null`, no files. */
function isTextBlock(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    "text" in value &&
    Array.isArray((value as { attachments?: unknown }).attachments)
  );
}

async function renderAt(path: string, email: string, reads: "empty" | "fail" | "pending") {
  const client = new AuthClient({
    apiBaseUrl: `${window.location.origin}/api/v1`,
    clientId: "clubs-app",
    identityBaseUrl: window.location.origin,
    mockMode: true,
    mockRefreshTokenStore: new MemoryRefreshTokenStore(),
  });
  await client.login(email, "secret-password");
  server.use(
    http.get("*/api/v1/*", async ({ request }) => {
      const url = new URL(request.url);
      if (SESSION_PATHS.test(url.pathname)) return undefined;
      if (reads === "pending") {
        await delay("infinite");
        return undefined;
      }
      if (reads === "empty") return emptied(request);
      return HttpResponse.json(
        { code: "INTERNAL_ERROR", details: {}, message: "Down", traceId: "t-states" },
        { status: 500 },
      );
    }),
  );
  window.history.pushState(null, "", path);
  const i18n = await createClubsI18n({
    branding,
    browserLanguages: ["ca"],
    initialNamespaces: ["common", "errors", "shell"],
    storage: undefined,
  });
  render(
    <I18nextProvider i18n={i18n}>
      <BrandingProvider branding={branding}>
        <SessionProvider client={client}>
          <App
            apiClient={createApiClient({
              baseUrl: `${window.location.origin}/api/v1`,
              getAccessToken: () => client.getAccessToken(),
              getLocale: () => "ca",
            })}
            authClient={client}
          />
        </SessionProvider>
      </BrandingProvider>
    </I18nextProvider>,
  );
}

const MEMBER = "laura@example.test";
const INSTRUCTOR = "ivet.puig@example.test";

/**
 * Every list and detail screen of the members' app that reads data of its own: its loading label
 * (its own `Skeleton`, never the shell's chunk fallback «Carregant») and, for a list, the title of
 * its empty state.
 */
const SCREENS: [string, string, string, "instructor" | "member", string, string | null][] = [
  ["03", "/inici", MEMBER, "member", "Carregant les teves reserves", "Encara no tens cap reserva"],
  [
    "04",
    "/reservar",
    MEMBER,
    "member",
    "Carregant les classes",
    "Ara mateix no hi ha cap classe per reservar amb aquest gos.",
  ],
  ["07", "/reserves/booking-duna-mon3", MEMBER, "member", "Carregant la reserva", null],
  // E11-W05 step 5 (b): the three detail screens 07 links to.
  ["espera", "/espera/waitlist-duna-thu6", MEMBER, "member", "Carregant la reserva", null],
  [
    "entrenament",
    "/entrenaments/training-rock-mon3",
    MEMBER,
    "member",
    "Carregant la reserva",
    null,
  ],
  [
    "activitat",
    "/activitats/activity-taller-contactes",
    MEMBER,
    "member",
    "Carregant l'activitat",
    null,
  ],
  [
    "08",
    "/entrenaments",
    MEMBER,
    "member",
    "Carregant els entrenaments",
    "El club està tancat aquest dia",
  ],
  ["10", "/avui", MEMBER, "member", "Carregant el quadre del dia", "Cap classe aquest dia"],
  [
    "11",
    "/notificacions",
    MEMBER,
    "member",
    "Carregant les notificacions",
    "Encara no tens cap avís",
  ],
  [
    "13",
    "/gossos",
    MEMBER,
    "member",
    "Carregant els teus gossos",
    "Encara no tens cap gos donat d'alta",
  ],
  ["25", "/historic", MEMBER, "member", "Carregant l'històric", "Encara no hi ha res a l'històric"],
  ["rebuts", "/rebuts", MEMBER, "member", "Carregant els rebuts", "Encara no tens cap rebut."],
  ["rebut", "/rebuts/invoice-laura-sep", MEMBER, "member", "Carregant els rebuts", null],
  ["28", "/dades", MEMBER, "member", "Carregant les teves dades", null],
  ["14", "/inactivitat", MEMBER, "member", "Carregant el període d'inactivitat", null],
  ["15", "/baixa", MEMBER, "member", "Carregant la sol·licitud de baixa", null],
  [
    "30",
    "/info",
    MEMBER,
    "member",
    "Carregant la informació",
    "El club encara no ha publicat preguntes",
  ],
  ["20", "/instructor/dia", INSTRUCTOR, "instructor", "Carregant el dia", "Cap classe aquest dia"],
  // E11-W02 round 3 (review m2): a class with no registrants.
  [
    "21",
    "/instructor/classes/c1",
    INSTRUCTOR,
    "instructor",
    "Carregant la llista",
    "Encara no hi ha cap inscrit.",
  ],
  // E11-W05 step 5 (b): 22's «5 darreres classes» and 26's tasks panel.
  [
    "22",
    "/instructor/alumnes/dog-duna",
    INSTRUCTOR,
    "instructor",
    "Carregant la fitxa",
    "Encara no hi ha classes",
  ],
  [
    "26",
    "/instructor/alumnes/dog-duna/tasques",
    INSTRUCTOR,
    "instructor",
    "Carregant les tasques",
    "Encara no hi ha cap tasca",
  ],
  [
    "23",
    "/instructor/avui",
    INSTRUCTOR,
    "instructor",
    "Carregant el quadre del dia",
    "Cap classe aquest dia",
  ],
  [
    "alumnes",
    "/instructor/alumnes",
    INSTRUCTOR,
    "instructor",
    "Carregant els alumnes",
    "Cap alumne amb aquesta cerca",
  ],
];

const LISTS = SCREENS.filter(
  (row): row is [string, string, string, "instructor" | "member", string, string] =>
    row[5] !== null,
);

// E11-W02 step 4 (round 2, points 1 and 2): each screen's reads have their states from the UI kit —
// its own loading status while they are out, an alert when they fail, and for a list the UI kit's
// `EmptyState` when the answer has nothing in it.
describe("E11-W02 step 4 and E11-W05 step 5 (b): the members' app says when its data is loading, failed or empty", () => {
  it.each(SCREENS)(
    "%s (%s) shows its own loading status while its reads are out",
    async (_screen, path, email, scenario, loading) => {
      mockScenario(scenario);
      await renderAt(path, email, "pending");
      expect(
        await screen.findByRole("status", { name: loading }, { timeout: 5_000 }),
      ).toBeInTheDocument();
    },
  );

  it.each(SCREENS)(
    "%s (%s) shows an alert when its reads fail",
    async (_screen, path, email, scenario) => {
      mockScenario(scenario);
      await renderAt(path, email, "fail");
      expect((await screen.findAllByRole("alert")).length).toBeGreaterThan(0);
    },
  );

  it.each(LISTS)(
    "%s (%s) shows the UI kit's empty state when its lists answer nothing",
    async (_screen, path, email, scenario, _loading, empty) => {
      mockScenario(scenario);
      await renderAt(path, email, "empty");
      const title = await screen.findByRole("heading", { name: empty }, { timeout: 5_000 });
      expect(title.closest(".ah-empty-state:not(.ah-empty-state--error)")).not.toBeNull();
    },
  );

  it("22 (E11-W05 step 5 (b), round 2 #4): the student card's three blocks — last classes, notes and observations — show the UI kit's empty state, never «—»", async () => {
    mockScenario("instructor");
    await renderAt("/instructor/alumnes/dog-duna", INSTRUCTOR, "empty");
    for (const empty of [
      "Encara no hi ha classes",
      "Encara no hi ha cap nota",
      "Encara no hi ha cap observació",
    ]) {
      const title = await screen.findByRole("heading", { name: empty }, { timeout: 5_000 });
      expect(title.closest(".ah-empty-state:not(.ah-empty-state--error)")).not.toBeNull();
    }
    expect(screen.queryByText("—")).not.toBeInTheDocument();
    // Still the private block: its hint stays.
    expect(screen.getByText("Només instructors i administració")).toBeVisible();
  });
});
