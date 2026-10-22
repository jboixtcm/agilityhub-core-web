import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import type { components } from "../generated/schema";

import { mockScenario } from "./handlers";
import { server } from "./server";

type ApiError = components["schemas"]["ApiError"];
type MemberSignupView = components["schemas"]["MemberSignupView"];

const origin = "http://localhost";
const signupMemberId = "42000000-0000-4000-8000-000000000001";

async function call(path: string) {
  const response = await fetch(`${origin}/api/v1${path}`);
  return { body: (await response.json()) as unknown, status: response.status };
}

beforeAll(() => {
  server.listen({ onUnhandledRequest: "error" });
});
afterAll(() => {
  mockScenario("admin");
  server.close();
});

describe("E11-W06 capture scenarios", () => {
  it("E11-W06 W8: memberClubPagesUnavailable answers 500 INTERNAL_ERROR until the api is back", async () => {
    mockScenario("memberClubPagesUnavailable");
    const stored = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => stored.get(key) ?? null,
      removeItem: (key: string) => stored.delete(key),
      setItem: (key: string, value: string) => stored.set(key, value),
    });
    // Every read, not only the first: 30 reads again when the fresh branding replaces the cached one.
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const failed = await call("/club-pages?active=true");
      expect(failed.status).toBe(500);
      expect((failed.body as ApiError).code).toBe("INTERNAL_ERROR");
    }

    stored.set("agilityhub.mockClubPagesBack", "1");
    const read = await call("/club-pages?active=true");
    expect(read.status).toBe(200);
    expect((read.body as { items: unknown[] }).items.length).toBeGreaterThan(0);
    vi.unstubAllGlobals();
  });

  it("E11-W06 W1: memberSignedOut refuses the restore (400 REFRESH_EXPIRED) until the password sign-in", async () => {
    mockScenario("memberSignedOut");
    // The handlers run in the page under MSW's worker; node has no `localStorage`.
    const stored = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => stored.get(key) ?? null,
      removeItem: (key: string) => stored.delete(key),
      setItem: (key: string, value: string) => stored.set(key, value),
    });
    const token = (form: Record<string, string>) =>
      fetch(`${origin}/oauth2/token`, {
        body: new URLSearchParams({ client_id: "clubs-app", ...form }),
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        method: "POST",
      });

    const restore = await token({ grant_type: "refresh_token" });
    expect(restore.status).toBe(400);
    expect(((await restore.json()) as ApiError).code).toBe("REFRESH_EXPIRED");

    const login = await token({
      grant_type: "password",
      password: "secret-password",
      username: "laura@example.test",
    });
    expect(login.status).toBe(200);
    expect((await token({ grant_type: "refresh_token" })).status).toBe(200);
    expect(stored.get("agilityhub.mockSignedIn")).toBe("1");

    // The sign-out revokes it: the next restore is refused again.
    expect((await fetch(`${origin}/oauth2/revoke`, { body: "{}", method: "POST" })).status).toBe(200);
    expect((await token({ grant_type: "refresh_token" })).status).toBe(400);
    vi.unstubAllGlobals();
  });

  it("E11-W06 W5: PATCH /me {locale} is the account's language the next GET /me answers", async () => {
    mockScenario("adminAllLocales");
    const stored = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => stored.get(key) ?? null,
      removeItem: (key: string) => stored.delete(key),
      setItem: (key: string, value: string) => stored.set(key, value),
    });
    expect(((await call("/me")).body as { account: { locale: string } }).account.locale).toBe("ca");

    const patched = await fetch(`${origin}/api/v1/me`, {
      body: JSON.stringify({ locale: "es" }),
      headers: { "Content-Type": "application/json" },
      method: "PATCH",
    });
    expect(patched.status).toBe(200);
    expect(((await call("/me")).body as { account: { locale: string } }).account.locale).toBe("es");
    vi.unstubAllGlobals();
  });

  it("R-04-19: adminSignupReviewNoPlanProposal proposes no plan and no price, the default does", async () => {
    mockScenario("admin");
    const baseline = (await call(`/members/${signupMemberId}/signup`)).body as MemberSignupView;
    expect(baseline.proposals.planId).toEqual(expect.any(String));

    mockScenario("adminSignupReviewNoPlanProposal");
    const view = await call(`/members/${signupMemberId}/signup`);
    expect(view.status).toBe(200);
    const proposals = (view.body as MemberSignupView).proposals;
    expect(proposals).not.toHaveProperty("planId");
    expect(proposals).not.toHaveProperty("priceId");
    expect((view.body as MemberSignupView).planOptions.length).toBeGreaterThan(0);
  });
});
