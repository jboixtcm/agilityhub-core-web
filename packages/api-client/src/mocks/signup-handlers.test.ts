import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import type { components } from "../generated/schema";

import { signupReviewBaseline, signupReviewPaymentMethods } from "./fixtures/signup-review";
import {
  mockScenario,
  resetDashboardMockState,
  resetMemberSelfServiceState,
  resetSignupMockState,
  setSignupMockToday,
  type MockScenario,
} from "./handlers";
import { server } from "./server";

type SignupConfig = components["schemas"]["SignupConfig"];
type MemberSignupView = components["schemas"]["MemberSignupView"];

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
  { documents, familyGroupClaim }: { documents?: unknown[]; familyGroupClaim?: unknown } = {},
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
        ...(documents === undefined ? {} : { documents }),
        name: "Kiwi",
        sex: "FEMALE",
      },
      ...(familyGroupClaim === undefined ? {} : { familyGroupClaim }),
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
  resetMemberSelfServiceState();
  mockScenario("signup");
});

async function signupConfigOn(today: string, member = false): Promise<SignupConfig> {
  mockScenario("signup");
  setSignupMockToday(today);
  const response = await fetch(`${origin}/api/v1/signup`, {
    ...(member ? { headers: { Authorization: "Bearer mock-access-token" } } : {}),
  });
  return (await response.json()) as SignupConfig;
}

function quoteOf(config: SignupConfig, planName: string) {
  const plan = config.plans?.find((candidate) => candidate.name === planName);
  return config.upfront?.planQuotes.find((quote) => quote.planId === plan?.id);
}

function summary(config: SignupConfig, planName: string) {
  const quote = quoteOf(config, planName);
  return {
    lines: quote?.lines.map((line) => `${line.concept} ${String(line.amount.amountMinor)}`),
    options: quote?.options.map(
      (option) =>
        `${option.option} ${option.portion} ${option.startDate} ${String(option.amountDue.amountMinor)} → ${String(option.totalDue.amountMinor)}`,
    ),
    totalDue: quote?.totalDue.amountMinor,
  };
}

describe("E3-W08 the mock quotes per plan like the api (R-04-14/15, T-04-05/06)", () => {
  it("MONTHLY: d < 16 → a full month today / half from the 16th; d ≥ 16 → half today / full on the 1st", async () => {
    expect(summary(await signupConfigOn("2026-08-05"), "Abonat")).toEqual({
      lines: ["ENTRY_FEE 10000"],
      options: ["TODAY FULL 2026-08-05 6000 → 16000", "ALTERNATIVE HALF 2026-08-16 3000 → 13000"],
      totalDue: 10000,
    });
    expect(summary(await signupConfigOn("2026-08-16"), "Abonat").options).toEqual([
      "TODAY HALF 2026-08-16 3000 → 13000",
      "ALTERNATIVE FULL 2026-09-01 6000 → 16000",
    ]);
    expect(summary(await signupConfigOn("2026-08-17"), "Abonat").options).toEqual([
      "TODAY HALF 2026-08-17 3000 → 13000",
      "ALTERNATIVE FULL 2026-09-01 6000 → 16000",
    ]);
    expect(summary(await signupConfigOn("2026-12-31"), "Abonat").options?.[1]).toBe(
      "ALTERNATIVE FULL 2027-01-01 6000 → 16000",
    );
  });

  it("PACK: the pack line and no options; MAINTENANCE (Teràpia): the 50 € entry only", async () => {
    const config = await signupConfigOn("2026-08-17");
    expect(summary(config, "Pack 6")).toEqual({ lines: ["PACK 13500"], options: [], totalDue: 13500 });
    expect(summary(config, "Teràpia")).toEqual({ lines: ["ENTRY_FEE 5000"], options: [], totalDue: 5000 });
  });

  it("add-dog: TODAY with the additional fee; the 1st of next month (entry only) up to day 25", async () => {
    const day17 = await signupConfigOn("2026-08-17", true);
    expect(summary(day17, "Abonat").options).toEqual([
      "TODAY FULL 2026-08-17 3000 → 13000",
      "ALTERNATIVE FULL 2026-09-01 0 → 10000",
    ]);
    expect(day17.upfront?.additionalDogOptions?.map((option) => option.option)).toEqual(["TODAY", "ALTERNATIVE"]);
    const day26 = await signupConfigOn("2026-08-26", true);
    expect(summary(day26, "Abonat").options).toEqual(["TODAY FULL 2026-08-26 3000 → 13000"]);
    expect(day26.upfront?.additionalDogOptions?.map((option) => option.option)).toEqual(["TODAY"]);
  });

  it("the flags are sent: allowFamilyGroupPending (with FAMILY_GROUP only) and requireDogDocumentAtSignup", async () => {
    const config = await signupConfigOn("2026-08-17");
    expect(config.allowFamilyGroupPending).toBe(true);
    expect(config.requireDogDocumentAtSignup).toBe(false);
    mockScenario("signupNoFamily");
    const noFamily = (await (await fetch(`${origin}/api/v1/signup`)).json()) as SignupConfig;
    expect(noFamily).not.toHaveProperty("allowFamilyGroupPending");
  });
});

describe("E3-W08 the upload URL and the add-dog submission mocks", () => {
  it("R-04-08: the upload URL answers the headers the storage signed", async () => {
    const response = await fetch(`${origin}/api/v1/signup/upload-urls`, {
      body: JSON.stringify({ contentType: "image/jpeg", fileName: "cartilla_Kiwi_1.jpg", sizeBytes: 1024 }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
    expect(((await response.json()) as { headers: unknown }).headers).toEqual({
      "Content-Type": "image/jpeg",
      "If-None-Match": "*",
    });
  });

  it("E36: an add-dog submission lists the dog PENDING on GET /me/dogs, without documents or licences", async () => {
    mockScenario("signup");
    const response = await fetch(`${origin}/api/v1/me/dogs/signup`, {
      body: JSON.stringify({
        additionalDogOption: "TODAY",
        dog: { birthMonth: "2025-03", breed: "Mestís", chip: "941000012340077", name: "Neret", sex: "MALE" },
        documents: [],
      }),
      headers: {
        Authorization: "Bearer mock-access-token",
        "Content-Type": "application/json",
        "Idempotency-Key": crypto.randomUUID(),
      },
      method: "POST",
    });
    expect(response.status).toBe(201);
    const result = (await response.json()) as { dogId: string; upfront: { lines: { concept: string }[] } };
    expect(result.upfront.lines.map((line) => line.concept)).toEqual(["ENTRY_FEE", "ADDITIONAL_DOG_FEE"]);
    const dogs = (await (await fetch(`${origin}/api/v1/me/dogs`)).json()) as {
      dogs: Record<string, unknown>[];
    };
    const pending = dogs.dogs.find((dog) => dog.id === result.dogId);
    expect(pending).toEqual({ ageYears: 1, breed: "Mestís", id: result.dogId, name: "Neret", sex: "MALE", status: "PENDING" });
  });
});

describe("E3-W08 round 2 #6: the submission mocks enforce the two signup flags, as the api does", () => {
  const dni = { type: "DNI", value: "12345678Z" };
  const vaccinationCard = (files: unknown[]) => [{ files, type: "VACCINATION_CARD" }];
  const file = { fileKey: "signup/club/202608/uuid/cartilla_Kiwi_1.jpg", name: "cartilla_Kiwi_1.jpg" };

  async function addDog(documents: unknown[]) {
    return fetch(`${origin}/api/v1/me/dogs/signup`, {
      body: JSON.stringify({
        additionalDogOption: "TODAY",
        dog: { birthMonth: "2025-03", breed: "Mestís", chip: "941000012340078", name: "Neret", sex: "MALE" },
        documents,
      }),
      headers: {
        Authorization: "Bearer mock-access-token",
        "Content-Type": "application/json",
        "Idempotency-Key": crypto.randomUUID(),
      },
      method: "POST",
    });
  }

  it("T-04-13 requireDogDocumentAtSignup=true: no file → 422 DOG_DOCUMENT_REQUIRED (public and add-dog); a file → 201", async () => {
    const withoutFile = await signup("signupDocumentRequired", dni, "941000012340101", { documents: vaccinationCard([]) });
    expect(withoutFile.status).toBe(422);
    expect(await withoutFile.json()).toMatchObject({ code: "DOG_DOCUMENT_REQUIRED", details: {} });
    expect((await addDog(vaccinationCard([]))).status).toBe(422);
    const withFile = await signup("signupDocumentRequired", dni, "941000012340102", { documents: vaccinationCard([file]) });
    expect(withFile.status).toBe(201);
  });

  it("T-04-13 requireDogDocumentAtSignup=false: no file → 201", async () => {
    expect((await signup("signup", dni, "941000012340103", { documents: vaccinationCard([]) })).status).toBe(201);
    mockScenario("signup");
    expect((await addDog([])).status).toBe(201);
  });

  it("T-04-16 leavePending with allowFamilyGroupPending=false → 400 VALIDATION_ERROR on the claim; with true → 201", async () => {
    const claim = { dogName: "Duna", holderName: "Laura Serra", leavePending: true };
    const refused = await signup("signupNoFamilyPending", dni, "941000012340104", { familyGroupClaim: claim });
    expect(refused.status).toBe(400);
    // E3-W12 step 6: the core's field code is NOT_ALLOWED.
    expect(await refused.json()).toMatchObject({
      code: "VALIDATION_ERROR",
      details: { fieldErrors: [{ code: "NOT_ALLOWED", field: "familyGroupClaim.leavePending" }] },
    });
    mockScenario("signupNoFamilyPending");
    expect(((await (await fetch(`${origin}/api/v1/signup`)).json()) as SignupConfig).allowFamilyGroupPending).toBe(false);
    expect((await signup("signup", dni, "941000012340105", { familyGroupClaim: claim })).status).toBe(201);
  });
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

describe("E3-W11 step 2: the D2 view's paymentMethods, as api E3-T14 answers them (R-04-10, R-04-19)", () => {
  const marta = "42000000-0000-4000-8000-000000000001";
  type Option = MemberSignupView["paymentMethods"][number];

  async function d2Methods(scenario: MockScenario, language = "ca"): Promise<Option[]> {
    mockScenario(scenario);
    const response = await fetch(`${origin}/api/v1/members/${marta}/signup`, { headers: { "Accept-Language": language } });
    return ((await response.json()) as MemberSignupView).paymentMethods;
  }

  async function patchMethod(type: string, version: number) {
    return fetch(`${origin}/api/v1/members/${marta}`, {
      body: JSON.stringify({ paymentMethod: { type }, version }),
      headers: { "Content-Type": "application/json" },
      method: "PATCH",
    });
  }

  afterEach(() => {
    resetDashboardMockState();
  });

  it("a PENDING member: the methods GET /signup offers, assignable, in the reader's language, the applicant's marked current", async () => {
    expect(await d2Methods("admin")).toEqual([
      { assignable: true, current: true, label: "Domiciliació", type: "SEPA_DD" },
      { assignable: true, current: false, label: "Efectiu", type: "MANUAL" },
    ]);
    expect((await d2Methods("signupStripe", "es")).map((option) => `${option.type} ${option.label}`)).toEqual([
      "SEPA_DD Domiciliación",
      "CARD Tarjeta",
      "MANUAL Efectivo",
    ]);
    expect(await d2Methods("signupNoBilling")).toEqual([]);
  });

  it("an add-dog (the member is ACTIVE): only the current method, not assignable, and a PATCH of it is 400 READ_ONLY", async () => {
    expect(await d2Methods("adminSignupReviewAddDog")).toEqual([
      { assignable: false, current: true, label: "Domiciliació", type: "SEPA_DD" },
    ]);
    const response = await patchMethod("MANUAL", 7);
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      code: "VALIDATION_ERROR",
      details: { fieldErrors: [{ code: "READ_ONLY", field: "paymentMethod" }] },
    });
  });

  it("a method that is not assignable is 422 PAYMENT_METHOD_NOT_AVAILABLE; an assignable one becomes current", async () => {
    await d2Methods("admin");
    const card = await patchMethod("CARD", 3);
    expect(card.status).toBe(422);
    expect(((await card.json()) as { code: string }).code).toBe("PAYMENT_METHOD_NOT_AVAILABLE");
    expect((await patchMethod("MANUAL", 3)).status).toBe(200);
    expect((await d2Methods("admin")).filter((option) => option.current).map((option) => option.type)).toEqual(["MANUAL"]);
  });

  it("the applicant's own method whose provider is off since stays listed last, current and not assignable", () => {
    const view = structuredClone(signupReviewBaseline);
    view.member.paymentMethod = { type: "CARD" };
    const offered = [
      { label: "Domiciliació", type: "SEPA_DD" as const },
      { label: "Efectiu", type: "MANUAL" as const },
    ];
    expect(signupReviewPaymentMethods(view, offered, () => "Targeta", true)).toEqual([
      { assignable: true, current: false, label: "Domiciliació", type: "SEPA_DD" },
      { assignable: true, current: false, label: "Efectiu", type: "MANUAL" },
      { assignable: false, current: true, label: "Targeta", type: "CARD" },
    ]);
  });
});

describe("E3-W12 step 3: GET /me/dogs as the api answers it (S03 §6, api E3-T16)", () => {
  async function meDogs(language: string) {
    const response = await fetch(`${origin}/api/v1/me/dogs`, {
      headers: { "Accept-Language": language, Authorization: "Bearer mock-access-token" },
    });
    return (await response.json()) as { documentTypes: unknown; dogs: Record<string, unknown>[] };
  }

  it("lists the catalog's document types in order, with the reader's labels, else the club's default language", async () => {
    mockScenario("member");
    expect((await meDogs("es")).documentTypes).toEqual([
      { key: "VACCINATION_CARD", label: "Cartilla de vacunas", required: true },
      { key: "INSURANCE", label: "Seguro", required: false },
      { key: "OTHER", label: "Otros", required: false },
    ]);
    // R-03-32: the mock club offers ca and es, so an en reader reads the default (ca).
    expect((await meDogs("en")).documentTypes).toEqual([
      { key: "VACCINATION_CARD", label: "Cartilla de vacunes", required: true },
      { key: "INSURANCE", label: "Assegurança", required: false },
      { key: "OTHER", label: "Altres", required: false },
    ]);
  });

  it("R-03-30: a dog carries its level only with levels.enabled", async () => {
    mockScenario("member");
    expect((await meDogs("ca")).dogs.map((dog) => (dog.level as { code: string } | undefined)?.code)).toEqual(["C", "D"]);
    mockScenario("memberNoLevels");
    expect((await meDogs("ca")).dogs.some((dog) => "level" in dog)).toBe(false);
  });
});

describe("E3-W12 step 3: /parameters/* is for a non-impersonated ADMIN only (MATRIU_PERMISOS)", () => {
  async function read(scenario: MockScenario, path: string, init: RequestInit = {}) {
    mockScenario(scenario);
    const response = await fetch(`${origin}/api/v1${path}`, init);
    return { body: (await response.json()) as { code?: string }, status: response.status };
  }

  it.each(["member", "instructor", "impersonated", "dayGridEmpty"] as const)("%s: every /parameters read and write is 403 FORBIDDEN", async (scenario) => {
    for (const [path, init] of [
      ["/parameters", {}],
      ["/parameters/levels.enabled", {}],
      ["/parameters/census.dogDocumentTypes", {}],
      ["/parameters/levels.enabled/history", {}],
      ["/parameters/levels.enabled", { body: JSON.stringify({ value: false, version: 1 }), headers: { "Content-Type": "application/json" }, method: "PUT" }],
      ["/parameters/levels.enabled", { method: "DELETE" }],
    ] as const) {
      const answer = await read(scenario, path, init);
      expect(answer, `${init.method ?? "GET"} ${path}`).toMatchObject({ body: { code: "FORBIDDEN" }, status: 403 });
    }
  });

  it("an ADMIN reads them (the roles, not the active profile, decide); an impersonation token does not", async () => {
    expect((await read("admin", "/parameters/levels.enabled")).status).toBe(200);
    expect((await read("admin", "/parameters")).status).toBe(200);
    // A multi-profile account acting as a member still has the ADMIN role in its token.
    expect((await read("multiProfile", "/parameters/levels.enabled")).status).toBe(200);
    const impersonation = await read("admin", "/parameters/levels.enabled", {
      headers: { Authorization: "Bearer mock-impersonation-token" },
    });
    expect(impersonation).toMatchObject({ body: { code: "FORBIDDEN" }, status: 403 });
  });

  it("the ADMIN's census.dogDocumentTypes is the catalog's editable map", async () => {
    const answer = await read("admin", "/parameters/census.dogDocumentTypes");
    expect((answer.body as { value?: unknown }).value).toEqual([
      { key: "VACCINATION_CARD", label: { ca: "Cartilla de vacunes", en: "Vaccination card", es: "Cartilla de vacunas" }, required: true },
      { key: "INSURANCE", label: { ca: "Assegurança", en: "Insurance", es: "Seguro" }, required: false },
      { key: "OTHER", label: { ca: "Altres", en: "Other", es: "Otros" }, required: false },
    ]);
  });
});
