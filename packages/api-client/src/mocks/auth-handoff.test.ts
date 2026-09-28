import { getResponse } from "msw";
import { afterEach, describe, expect, it, vi } from "vitest";

/** One origin's `localStorage` (the back office's, or the club app's). */
class OriginStorage {
  private readonly items = new Map<string, string>();

  getItem(key: string): null | string {
    return this.items.get(key) ?? null;
  }

  removeItem(key: string): void {
    this.items.delete(key);
  }

  setItem(key: string, value: string): void {
    this.items.set(key, value);
  }
}

/**
 * A full-page load of one origin: the browser mock world starts again (a fresh module instance)
 * and only that origin's storage survives.
 */
async function pageLoad(storage: OriginStorage) {
  vi.stubGlobal("localStorage", storage);
  vi.resetModules();
  const [{ handlers }, { censusRecordState }] = await Promise.all([
    import("./handlers"),
    import("./fixtures/census"),
  ]);
  const answer = async (request: Request) => {
    vi.stubGlobal("localStorage", storage);
    const response = await getResponse(handlers, request);
    if (response === undefined) throw new Error(`No mock for ${request.method} ${request.url}`);
    return response;
  };
  return {
    /** D10 «Entra com l'abonat»: the code of the api's `launchUrl`. */
    async issue(): Promise<string> {
      const response = await answer(
        new Request(
          `https://admin.example.test/api/v1/members/${censusRecordState.memberOverview.member.id}/impersonation-token`,
          {
            body: JSON.stringify({ reason: "Reserva per telèfon" }),
            headers: { "Content-Type": "application/json" },
            method: "POST",
          },
        ),
      );
      const body = (await response.json()) as { launchUrl: string };
      return new URL(body.launchUrl).searchParams.get("handoff") ?? "";
    },
    /** `/entrar?handoff=` on the club app: the status of the handoff grant. */
    async redeem(code: string): Promise<number> {
      const response = await answer(
        new Request("https://app.example.test/oauth2/token", {
          body: new URLSearchParams({
            client_id: "clubs-app",
            grant_type: "urn:agilityhub:grant:handoff",
            token: code,
          }),
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          method: "POST",
        }),
      );
      return response.status;
    },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("T-01-12 E4-W16 round 2 #2 (S01 R-01-09, E47): a handoff code is single-use across page loads", () => {
  it("redeem code 1, reload, redeem code 2, then code 1 again → refused (the whole redemption history stays spent)", async () => {
    const clubApp = new OriginStorage();
    const [first, second] = ["mock-impersonation-handoff-41", "mock-impersonation-handoff-42"];

    const member = await pageLoad(clubApp);
    expect(await member.redeem(first)).toBe(200);

    // The club app reloads between the two redemptions.
    const memberAgain = await pageLoad(clubApp);
    expect(await memberAgain.redeem(second)).toBe(200);
    expect(await memberAgain.redeem(first)).toBe(400);
    expect(await memberAgain.redeem(second)).toBe(400);
  });

  // Two page loads per test: each one rebuilds the whole mock world, which the E3-W10 start-up
  // budget times in a parallel worker.
  it("the back office never issues again a code it issued before its own reload", async () => {
    const backOffice = new OriginStorage();

    const first = await (await pageLoad(backOffice)).issue();
    // The back office reloads (a new mock world) and D10 opens a second impersonation.
    const second = await (await pageLoad(backOffice)).issue();

    expect(first).toMatch(/^mock-impersonation-handoff-\d+$/u);
    expect(second).toMatch(/^mock-impersonation-handoff-\d+$/u);
    expect(second).not.toBe(first);
  });
});
