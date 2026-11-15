import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import type { components } from "../generated/schema";

import { mockScenario } from "./handlers";
import { server } from "./server";

type ApiError = components["schemas"]["ApiError"];

const origin = "http://localhost";

function token(form: Record<string, string>) {
  return fetch(`${origin}/oauth2/token`, {
    body: new URLSearchParams({ client_id: "clubs-app", ...form }),
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    method: "POST",
  });
}

const handoff = (code: string) =>
  token({ grant_type: "urn:agilityhub:grant:handoff", token: code });

/** The browser's storage, where the mock keeps its stand-in for the refresh cookie. */
function stubStorage(): Map<string, string> {
  const stored = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => stored.get(key) ?? null,
    removeItem: (key: string) => stored.delete(key),
    setItem: (key: string, value: string) => stored.set(key, value),
  });
  return stored;
}

beforeAll(() => {
  server.listen({ onUnhandledRequest: "error" });
});
afterEach(() => {
  vi.unstubAllGlobals();
});
afterAll(() => {
  mockScenario("admin");
  server.close();
});

describe("FE-03 (pre-production audit, decision of 13 Nov 2026; S01 R-01-13): the mock refuses another account's handoff code as the api does", () => {
  it("with a session on the host: 409 HANDOFF_SESSION_CONFLICT, the shared body without details, no Set-Cookie; the host's session still refreshes", async () => {
    mockScenario("member");
    stubStorage();

    const refused = await handoff("mock-other-account-handoff-1");

    expect(refused.status).toBe(409);
    expect(refused.headers.get("set-cookie")).toBeNull();
    const body = (await refused.json()) as ApiError;
    expect(body).toEqual({
      code: "HANDOFF_SESSION_CONFLICT",
      details: {},
      message: expect.any(String) as string,
      traceId: expect.any(String) as string,
    });
    expect((await token({ grant_type: "refresh_token" })).status).toBe(200);
  });

  it("without a session on the host the same code is redeemed: the refusal left it unused", async () => {
    mockScenario("memberSignedOut");
    stubStorage();
    const code = "mock-other-account-handoff-2";

    // The device signs in: the host now holds a session, so the code is refused.
    expect(
      (
        await token({
          grant_type: "password",
          password: "secret-password",
          username: "member@example.test",
        })
      ).status,
    ).toBe(200);
    expect((await handoff(code)).status).toBe(409);

    // Signed out (no cookie): the code opens its account as usual.
    expect((await fetch(`${origin}/oauth2/revoke`, { body: "{}", method: "POST" })).status).toBe(
      200,
    );
    const redeemed = await handoff(code);
    expect(redeemed.status).toBe(200);
    expect(await redeemed.json()).toMatchObject({ access_token: expect.any(String) as string });
  });

  it("an «Entra com l'abonat» code and an account's code are never refused so (only another account's)", async () => {
    mockScenario("member");
    stubStorage();

    expect((await handoff("mock-impersonation-handoff-9001")).status).toBe(200);
    expect((await handoff("mock-handoff-code")).status).toBe(200);
  });
});
