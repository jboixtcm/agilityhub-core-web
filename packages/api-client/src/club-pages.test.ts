import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { createApiClient } from "./client";
import { getPublicClubPage } from "./club-pages";
import { resetCatalogState } from "./mocks/fixtures/catalogs";
import { server } from "./mocks/server";

beforeAll(() => {
  server.listen({ onUnhandledRequest: "error" });
});
afterEach(() => {
  server.resetHandlers();
  resetCatalogState();
});
afterAll(() => {
  server.close();
});

describe("public club pages client", () => {
  it("returns the locale-selected public page projection", async () => {
    const client = createApiClient({ baseUrl: "http://localhost/api/v1" });
    const page = await getPublicClubPage(client, {
      apiKey: "mock-public-api-key",
      clubSlug: "club-demo",
      key: "RULES",
      locale: "es",
    });

    expect(page.title).toBe("Normas del club");
    expect(page.body).toContain("Convivencia");
    expect(page.active).toBe(true);
  });
});
