// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { BrandingProvider, filterEnabledModuleItems, type Branding } from "@agilityhub/ui";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { AuthClient, type Me } from "./auth-client";
import { MemoryRefreshTokenStore } from "./mock-refresh-token";
import { RequireAuth, RequireModule, RequireRole, SessionProvider, useSession } from "./session";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => (key === "common:unavailable.title" ? "No disponible" : key),
  }),
}));

const API_BASE_URL = "https://club.example.test/api/v1";
const IDENTITY_BASE_URL = "https://id.example.test";
const TOKEN_ENDPOINT = "https://id.example.test/oauth2/token";

const memberMe: Me = {
  account: {
    email: "biel.roca@example.test",
    id: "10000000-0000-4000-8000-000000000002",
    locale: "ca",
    name: "Biel Roca",
    hasPassword: true,
    emailVerifiedAt: "2026-08-01T08:00:00Z",
    onboardingPending: false,
    platformRoles: [],
  },
  membership: {
    clubId: "50000000-0000-4000-8000-000000000001",
    defaultProfile: "MEMBER",
    gender: "MALE",
    activeProfile: "MEMBER",
    profiles: ["MEMBER"],
    rememberProfile: true,
    roles: ["MEMBER"],
  },
  features: ["FREE_TRAINING"],
};

const branding: Branding = {
  club: { name: "Cànic", slug: "canic" },
  countryProfile: {},
  currency: "EUR",
  defaultLocale: "ca",
  legal: { privacyPolicyUrl: "https://canic.example.test/privacitat" },
  locales: ["ca", "es", "en"],
  modules: ["FREE_TRAINING"],
  signup: { enabled: true },
  status: "ACTIVE",
  theme: {
    colors: {
      background: "canvas",
      border: "gray",
      danger: "red",
      info: "blue",
      onPrimary: "white",
      primary: "blue",
      success: "green",
      surface: "canvas",
      surfaceAlt: "canvas",
      text: "black",
      textMuted: "gray",
      warning: "orange",
    },
    mode: "light",
  },
  timeZone: "Europe/Madrid",
};

const server = setupServer(
  http.post(TOKEN_ENDPOINT, () =>
    HttpResponse.json({
      access_token: "access-login",
      expires_in: 900,
      refresh_token: "refresh-login",
      scope: "openid profile",
      token_type: "Bearer",
    }),
  ),
  http.get(`${API_BASE_URL}/me`, () => HttpResponse.json(memberMe)),
);

beforeAll(() => {
  server.listen({ onUnhandledRequest: "error" });
});

afterEach(() => {
  cleanup();
  server.resetHandlers();
});

afterAll(() => {
  server.close();
});

function SessionDetails() {
  const session = useSession();
  return <output>{`${session.status}:${session.activeProfile ?? "none"}`}</output>;
}

describe("T-01-21 session and guards", () => {
  it("redirects anonymous users to /entrar without rendering protected content", async () => {
    const navigate = vi.fn();
    server.use(
      http.post(TOKEN_ENDPOINT, () =>
        HttpResponse.json(
          { code: "REFRESH_EXPIRED", message: "Refresh unavailable" },
          { status: 401 },
        ),
      ),
    );
    const client = new AuthClient({
      apiBaseUrl: API_BASE_URL,
      identityBaseUrl: IDENTITY_BASE_URL,
      mockMode: true,
      mockRefreshTokenStore: new MemoryRefreshTokenStore(),
    });

    render(
      <SessionProvider client={client}>
        <RequireAuth navigate={navigate}>
          <p>Protected content</p>
        </RequireAuth>
      </SessionProvider>,
    );

    await waitFor(() => {
      expect(navigate).toHaveBeenCalledWith("/entrar");
    });
    expect(screen.queryByText("Protected content")).not.toBeInTheDocument();
  });

  it("exposes /me roles and active profile and renders only an allowed role", async () => {
    const client = new AuthClient({
      apiBaseUrl: API_BASE_URL,
      identityBaseUrl: IDENTITY_BASE_URL,
      mockMode: true,
      mockRefreshTokenStore: new MemoryRefreshTokenStore(),
    });
    await client.login("biel.roca@example.test", "secret-password");

    render(
      <SessionProvider client={client}>
        <SessionDetails />
        <RequireRole fallback={<p>Denied admin</p>} roles={["ADMIN"]}>
          <p>Admin content</p>
        </RequireRole>
        <RequireRole roles={["MEMBER"]}>
          <p>Member content</p>
        </RequireRole>
      </SessionProvider>,
    );

    expect(screen.getByText("signedIn:MEMBER")).toBeInTheDocument();
    expect(screen.getByText("Denied admin")).toBeInTheDocument();
    expect(screen.queryByText("Admin content")).not.toBeInTheDocument();
    expect(screen.getByText("Member content")).toBeInTheDocument();
  });

  it("renders the translated unavailable page and omits disabled module items", () => {
    const routes = filterEnabledModuleItems(
      [
        { module: "FREE_TRAINING" as const, path: "/entrenaments" },
        { module: "BILLING" as const, path: "/rebuts" },
        { path: "/inici" },
      ],
      branding.modules,
    );

    render(
      <BrandingProvider branding={branding}>
        <RequireModule module="BILLING">
          <p>Billing content</p>
        </RequireModule>
      </BrandingProvider>,
    );

    expect(screen.getByRole("heading", { name: "No disponible" })).toBeInTheDocument();
    expect(screen.queryByText("Billing content")).not.toBeInTheDocument();
    expect(routes.map((route) => route.path)).toEqual(["/entrenaments", "/inici"]);
  });
});
