import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { mockScenario, resetSignupMockState, type MockScenario } from "./handlers";
import { server } from "./server";

const origin = "http://localhost";

async function identityCheck(idDocument: { type: string; value: string }) {
  return fetch(`${origin}/api/v1/signup/identity-checks`, {
    body: JSON.stringify({ emails: ["nova@example.test"], idDocument }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
}

async function signup(
  scenario: MockScenario,
  idDocument: { type: string; value: string },
  chip: string,
) {
  mockScenario(scenario);
  const config = (await (await fetch(`${origin}/api/v1/signup`)).json()) as {
    legal: { legalTextsVersion: string };
    plans: { id: string }[];
  };
  const version = config.legal.legalTextsVersion;
  return fetch(`${origin}/api/v1/signup`, {
    body: JSON.stringify({
      consents: {
        imageUse: { granted: false, version },
        privacyPolicy: { accepted: true, version },
      },
      dog: {
        birthMonth: "2022-03",
        breed: "Mestís",
        chip,
        name: "Kiwi",
        sex: "FEMALE",
      },
      locale: "ca",
      payment: { type: "MANUAL" },
      person: {
        address: { postalCode: "08001", street: "Carrer 1", town: "Poble" },
        birthDate: "1992-04-05",
        emails: ["nova@example.test"],
        firstName: "Nova",
        gender: "OTHER",
        idDocument,
        lastName1: "Ficticia",
        phones: [{ label: "Mòbil", number: "612345678", prefix: "+34" }],
      },
      ...(config.plans[0] === undefined ? {} : { planId: config.plans[0].id }),
      website: "",
    }),
    headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() },
    method: "POST",
  });
}

beforeAll(() => {
  server.listen({ onUnhandledRequest: "error" });
});
afterEach(() => {
  server.resetHandlers();
  resetSignupMockState();
  mockScenario("signup");
});
afterAll(() => {
  server.close();
});

describe("T-04-01 / T-04-02 the signup mocks follow R-04-01 by country profile", () => {
  it("ES: pads a seven-digit DNI (1234567L → 01234567L) and accepts it", async () => {
    mockScenario("signup");
    expect(await (await identityCheck({ type: "DNI", value: "1234567L" })).json()).toEqual({
      result: "NEW",
    });
    expect((await signup("signup", { type: "DNI", value: "1234567L" }, "941000012340001")).status).toBe(201);
    // The same person typed with the leading zero is the same identity.
    const again = await signup("signup", { type: "DNI", value: "01234567L" }, "941000012340002");
    expect(again.status).toBe(422);
    expect(((await again.json()) as { code: string }).code).toBe("SIGNUP_ALREADY_PENDING");
    expect((await identityCheck({ type: "DNI", value: "12345678A" })).status).toBe(400);
    expect((await identityCheck({ type: "OTHER", value: "AB-12" })).status).toBe(400);
  });

  it("GENERIC: accepts OTHER with four characters or more and rejects DNI and short values", async () => {
    mockScenario("signupGeneric");
    expect(await (await identityCheck({ type: "OTHER", value: "AB-12" })).json()).toEqual({
      result: "NEW",
    });
    expect((await signup("signupGeneric", { type: "OTHER", value: "AB-12" }, "AB12345678")).status).toBe(201);
    mockScenario("signupGeneric");
    const short = await identityCheck({ type: "OTHER", value: "AB" });
    expect(short.status).toBe(400);
    expect(((await short.json()) as { code: string }).code).toBe("INVALID_ID_DOCUMENT");
    expect((await identityCheck({ type: "DNI", value: "12345678Z" })).status).toBe(400);
  });
});
