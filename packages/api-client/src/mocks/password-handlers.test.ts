import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { createApiClient, isApiError } from "../index";

import { mockScenario } from "./handlers";
import { server } from "./server";

beforeAll(() => {
  server.listen({ onUnhandledRequest: "error" });
});

afterEach(() => {
  server.resetHandlers();
  mockScenario("admin");
});

afterAll(() => {
  server.close();
});

async function setPassword(value: string): Promise<unknown> {
  // Created after `server.listen`, which replaces the global fetch the client keeps.
  const client = createApiClient({ baseUrl: "https://core.example.test/api/v1" });
  try {
    await client.PUT("/me/password", {
      body: { current: "secret-password", new: value, repeat: value },
    });
    return "saved";
  } catch (error) {
    return error;
  }
}

describe("AUTH-01 (S01 R-01-05): PUT /me/password applies the staff minimum as the api does", () => {
  it("a club ADMIN or INSTRUCTOR needs 12 characters and is told so", async () => {
    for (const scenario of ["admin", "instructor"] as const) {
      mockScenario(scenario);
      const refusal = await setPassword("duna2026!ab");
      expect(isApiError(refusal, "PASSWORD_TOO_SHORT")).toBe(true);
      expect((refusal as { details: unknown }).details).toEqual({ minLength: 12 });
      expect(await setPassword("duna2026!abc")).toBe("saved");
    }
  });

  it("a member keeps 8", async () => {
    mockScenario("member");
    const refusal = await setPassword("duna26!");
    expect(isApiError(refusal, "PASSWORD_TOO_SHORT")).toBe(true);
    expect((refusal as { details: unknown }).details).toEqual({ minLength: 8 });
    expect(await setPassword("duna26!a")).toBe("saved");
  });
});
