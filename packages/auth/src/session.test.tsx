// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { BrandingProvider, filterEnabledModuleItems, type Branding } from "@agilityhub/ui";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { AuthClient, type Me } from "./auth-client";
import { MemoryRefreshTokenStore } from "./crypto-store";
import { RequireAuth, RequireModule, RequireRole, SessionProvider, useSession } from "./session";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => (key === "common:unavailable.title" ? "No disponible" : key),
  }),
}));

const API_BASE_URL = "https://club.example.test/api/v1";
const TOKEN_ENDPOINT = "https://id.example.test/oauth2/token";

const memberMe: Me = {
  account: {
    email: "biel.roca@example.test",
    id: "10000000-0000-4000-8000-000000000002",
    locale: "ca",
    name: "Biel Roca",
  },
  membership: {
    defaultProfile: "MEMBER",
    roles: ["MEMBER"],
  },
  modules: ["FREE_TRAINING"],
};

const branding: Branding = {
  clubId: "canic",
  countryProfile: {},
  currency: "EUR",
  defaultLocale: "ca",
  locales: ["ca", "es", "en"],
  modules: ["FREE_TRAINING"],
  name: "Cànic",
  signup: { enabled: true },
  slug: "canic",
  theme: {
    colors: {
      background: "canvas",
      danger: "red",
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
});

afterAll(() => {
  server.close();
});

function SessionDetails() {
  const session = useSession();
  return <output>{`${session.status}:${session.activeProfile ?? "none"}`}</output>;
}

describe("T-01-21 session and guards", () => {
  it("redirects anonymous users to /acces without rendering protected content", async () => {
    const navigate = vi.fn();
    const client = new AuthClient({
      apiBaseUrl: API_BASE_URL,
      refreshTokenStore: new MemoryRefreshTokenStore(),
      tokenEndpoint: TOKEN_ENDPOINT,
    });

    render(
      <SessionProvider client={client}>
        <RequireAuth navigate={navigate}>
          <p>Protected content</p>
        </RequireAuth>
      </SessionProvider>,
    );

    await waitFor(() => {
      expect(navigate).toHaveBeenCalledWith("/acces");
    });
    expect(screen.queryByText("Protected content")).not.toBeInTheDocument();
  });

  it("exposes /me roles and active profile and renders only an allowed role", async () => {
    const client = new AuthClient({
      apiBaseUrl: API_BASE_URL,
      refreshTokenStore: new MemoryRefreshTokenStore(),
      tokenEndpoint: TOKEN_ENDPOINT,
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
