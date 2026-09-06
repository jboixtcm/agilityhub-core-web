import { http, HttpResponse } from "msw";

import { currentMockScenario, mockScenario, type MockScenario } from "./scenarios";

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
  http.post("*/oauth2/token", () =>
    HttpResponse.json({
      access_token: "mock-access-token",
      refresh_token: "mock-refresh-token",
      token_type: "Bearer",
      expires_in: 900,
    }),
  ),
  http.get("*/api/v1/health", () =>
    HttpResponse.json({
      status: "UP",
      version: "0.0.0-mock",
      builtAt: "2026-09-05T00:00:00Z",
    }),
  ),
];

export { mockScenario, type MockScenario };
