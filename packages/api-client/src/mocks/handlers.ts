import { http, HttpResponse } from "msw";

import type { components } from "../generated/schema";

import { currentMockScenario, mockScenario, type MockScenario } from "./scenarios";

type ApiErrorResponse = components["schemas"]["ApiErrorResponse"];
type MagicLinkRequest = components["schemas"]["MagicLinkRequest"];
type UpdateMeRequest = components["schemas"]["UpdateMeRequest"];
type UpdatePasswordRequest = components["schemas"]["UpdatePasswordRequest"];
type UpdateProfileRequest = components["schemas"]["UpdateProfileRequest"];

function apiError(code: string, message: string, status: number, headers?: HeadersInit) {
  return HttpResponse.json<ApiErrorResponse>(
    { code, message },
    { status, ...(headers === undefined ? {} : { headers }) },
  );
}

function mockTokens() {
  return {
    access_token: "mock-access-token",
    refresh_token: "mock-refresh-token",
    token_type: "Bearer",
    expires_in: 900,
  };
}

export const handlers = [
  http.get("*/api/v1/branding", () =>
    HttpResponse.json(currentMockScenario().branding, {
      headers: { ETag: '"mock-branding-v1"' },
    }),
  ),
  http.get("*/api/v1/manifest.webmanifest", () => {
    const branding = currentMockScenario().branding;
    return HttpResponse.json({
      display: "standalone",
      name: branding.club.name,
      short_name: branding.club.name,
      start_url: "/inici",
    });
  }),
  http.get("*/api/v1/me", () => HttpResponse.json(currentMockScenario().me)),
  http.patch("*/api/v1/me", async ({ request }) => {
    const body = (await request.json()) as UpdateMeRequest;
    const scenario = currentMockScenario();
    if (body.locale !== undefined && !scenario.branding.locales.includes(body.locale)) {
      return apiError("LOCALE_NOT_SUPPORTED", "Locale not supported", 400);
    }
    return HttpResponse.json({
      ...scenario.me,
      account: {
        ...scenario.me.account,
        ...(body.locale === undefined ? {} : { locale: body.locale }),
        ...(body.name === undefined ? {} : { name: body.name }),
      },
    });
  }),
  http.put("*/api/v1/me/password", async ({ request }) => {
    const body = (await request.json()) as UpdatePasswordRequest;
    if (body.new !== body.repeat) {
      return apiError("PASSWORD_MISMATCH", "Passwords do not match", 400);
    }
    if (body.new.length < 8) {
      return apiError("PASSWORD_TOO_SHORT", "Password is too short", 400);
    }
    if (currentMockScenario().me.account.hasPassword && body.current !== "secret-password") {
      return apiError("INVALID_CREDENTIALS", "Invalid current password", 401);
    }
    return new HttpResponse(null, { status: 200 });
  }),
  http.put("*/api/v1/me/profile", async ({ request }) => {
    const body = (await request.json()) as UpdateProfileRequest;
    if (!currentMockScenario().me.membership.roles.includes(body.activeProfile)) {
      return apiError("PROFILE_NOT_AVAILABLE", "Profile not available", 422);
    }
    return HttpResponse.json({ access_token: `mock-${body.activeProfile.toLowerCase()}-token` });
  }),
  http.get("*/api/v1/me/sessions", () => HttpResponse.json(currentMockScenario().sessions)),
  http.delete("*/api/v1/me/sessions/:id", () => new HttpResponse(null, { status: 200 })),
  http.post("*/auth/magic-link", async ({ request }) => {
    const body = (await request.json()) as MagicLinkRequest;
    if (currentMockScenario().rateLimited === true || body.email.startsWith("limit")) {
      return apiError("RATE_LIMITED", "Rate limited", 429, { "Retry-After": "120" });
    }
    return new HttpResponse(null, { status: 202 });
  }),
  http.post("*/auth/handoff", () =>
    HttpResponse.json(
      {
        code: "mock-handoff-code",
        url: "http://127.0.0.1:4174/entrar?handoff=mock-handoff-code",
      },
      { status: 201 },
    ),
  ),
  http.post("*/oauth2/revoke", () => new HttpResponse(null, { status: 200 })),
  http.post("*/oauth2/token", async ({ request }) => {
    const form = new URLSearchParams(await request.text());
    const grant = form.get("grant_type");
    const scenario = currentMockScenario();
    if (grant === "urn:agilityhub:grant:magic-link") {
      if (scenario.invalidMagicLink === true || form.get("token") === "invalid") {
        return apiError("MAGIC_LINK_INVALID", "Magic link invalid", 400);
      }
      return HttpResponse.json(mockTokens());
    }
    if (grant === "urn:agilityhub:grant:handoff") {
      return form.get("code") === "invalid"
        ? apiError("HANDOFF_INVALID", "Handoff invalid", 400)
        : HttpResponse.json(mockTokens());
    }
    if (grant === "password") {
      if (scenario.rateLimited === true) {
        return apiError("LOGIN_LOCKED", "Login locked", 429, { "Retry-After": "120" });
      }
      if (form.get("password") === "wrong-password") {
        return apiError("INVALID_CREDENTIALS", "Invalid credentials", 401);
      }
    }
    return HttpResponse.json(mockTokens());
  }),
  http.get("*/api/v1/health", () =>
    HttpResponse.json({
      status: "UP",
      version: "0.0.0-mock",
      builtAt: "2026-09-05T00:00:00Z",
    }),
  ),
];

export { mockScenario, type MockScenario };
