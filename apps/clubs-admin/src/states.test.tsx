import { handlers, mockScenario } from "@agilityhub/api-client/mocks";
import brandingCanicFixture from "@agilityhub/api-client/mocks/branding-canic";
import { server } from "@agilityhub/api-client/mocks/server";
import { AuthClient, MemoryRefreshTokenStore, SessionProvider } from "@agilityhub/auth";
import { createI18n } from "@agilityhub/i18n";
import { type Branding, BrandingProvider } from "@agilityhub/ui";
import { cleanup, render, screen } from "@testing-library/react";
import { delay, getResponse, http, HttpResponse } from "msw";
import { I18nextProvider } from "react-i18next";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { App } from "./App";
import { ADMIN_AUTH_OPTIONS } from "./auth-options";

const branding = brandingCanicFixture as Branding;

beforeAll(() => {
  server.listen({ onUnhandledRequest: "bypass" });
});
afterEach(() => {
  cleanup();
  server.resetHandlers();
  mockScenario("admin");
});
afterAll(() => {
  server.close();
});

/** The session's own reads: the shell needs them, every screen's data is something else. */
const SESSION_PATHS = /\/api\/v1\/(me|branding|dashboard\/counters)$|\/oauth2\//u;

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
  }
  return HttpResponse.json(page);
}

async function renderAt(path: string, reads: "empty" | "fail" | "pending") {
  const client = new AuthClient({
    ...ADMIN_AUTH_OPTIONS,
    apiBaseUrl: `${window.location.origin}/api/v1`,
    identityBaseUrl: window.location.origin,
    mockMode: true,
    mockRefreshTokenStore: new MemoryRefreshTokenStore(),
  });
  await client.login("aina.serra@example.test", "secret-password");
  server.use(
    http.get("*/api/v1/*", async ({ request }) => {
      if (SESSION_PATHS.test(new URL(request.url).pathname)) return undefined;
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
  const i18n = await createI18n({
    branding,
    browserLanguages: ["ca"],
    initialNamespaces: ["common", "errors", "shell"],
    storage: undefined,
  });
  render(
    <I18nextProvider i18n={i18n}>
      <BrandingProvider branding={branding}>
        <SessionProvider client={client}>
          <App authClient={client} />
        </SessionProvider>
      </BrandingProvider>
    </I18nextProvider>,
  );
}

/**
 * The back office's list and detail screens that read data of their own: the label of their own
 * loading status and, for a list, the title of its empty state.
 */
const SCREENS: [string, string, string, string | null][] = [
  ["D1", "/tauler", "Carregant el tauler", null],
  [
    "D2",
    "/preinscripcions/42000000-0000-4000-8000-000000000001",
    "Carregant la preinscripció…",
    null,
  ],
  ["D3", "/plantilles", "Carregant…", "Encara no hi ha cap plantilla"],
  ["D4", "/calendari", "Carregant…", "Cap classe aquesta setmana"],
  ["D5", "/abonats", "Carregant el llistat", "Cap abonat amb aquests criteris"],
  ["D10", "/abonats/member-laura", "Carregant la fitxa…", null],
  ["D15", "/gossos", "Carregant el llistat", "Cap gos amb aquests criteris"],
  ["D6", "/facturacio", "Carregant la facturació…", "Encara no hi ha cap simulació d'aquest mes"],
  ["activitats", "/activitats", "Carregant el llistat", "Encara no hi ha cap activitat"],
  ["D8", "/modalitats", "Carregant", "Encara no hi ha cap modalitat"],
  ["D9", "/comunicats", "Carregant les plantilles", "No hi ha cap plantilla en aquesta categoria."],
  ["D11", "/parametres", "Carregant", "Encara no hi ha cap nivell"],
  ["D12", "/agenda", "Carregant l'agenda", "Aquesta setmana no hi ha res a l'agenda"],
  ["entrenaments", "/entrenaments", "Carregant el llistat", "Cap reserva d'entrenament"],
  ["D13", "/alumnes", "Carregant els alumnes", "Cap alumne amb aquesta cerca"],
  ["D14", "/seguiment", "Carregant el llistat", "No hi ha res al seguiment"],
  ["D16", "/pistes", "Carregant", "Encara no hi ha cap pista"],
  ["D17", "/equip", "Carregant", "Encara no hi ha cap instructor"],
  ["D18", "/recorreguts", "Carregant el llistat", "Encara no hi ha cap recorregut"],
  ["inactivitats", "/inactivitats", "Carregant la fitxa…", "No hi ha inactivitats"],
  ["auditoria", "/auditoria", "Carregant el llistat", "No hi ha entrades d'auditoria"],
];

const LISTS = SCREENS.filter((row): row is [string, string, string, string] => row[3] !== null);

// E11-W02 step 4 (round 2, points 1 and 2): each screen's reads have their states from the UI kit —
// its own loading status while they are out, an alert when they fail, and for a list the UI kit's
// `EmptyState` when the answer has nothing in it.
describe("E11-W02 step 4: the back office says when its data is loading, failed or empty", () => {
  it.each(SCREENS)(
    "%s (%s) shows its own loading status while its reads are out",
    async (_screen, path, loading) => {
      await renderAt(path, "pending");
      expect(
        (await screen.findAllByRole("status", { name: loading }, { timeout: 5_000 })).length,
      ).toBeGreaterThan(0);
    },
  );

  it.each(SCREENS)("%s (%s) shows an alert when its reads fail", async (_screen, path) => {
    await renderAt(path, "fail");
    expect((await screen.findAllByRole("alert")).length).toBeGreaterThan(0);
  });

  it.each(LISTS)(
    "%s (%s) shows the UI kit's empty state when its lists answer nothing",
    async (_screen, path, _loading, empty) => {
      await renderAt(path, "empty");
      const title = await screen.findByRole("heading", { name: empty }, { timeout: 5_000 });
      expect(title.closest(".ah-empty-state:not(.ah-empty-state--error)")).not.toBeNull();
    },
  );
});
