import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import openapiDocument from "../../openapi/openapi.json";
import { isApiError } from "../api-error";
import { createApiClient } from "../client";

import {
  ERASED_MEMBER_ID,
  mockScenario,
  resetCensusRecordState,
  resetSignupMockState,
  type MockScenario,
} from "./handlers";
import { server } from "./server";

const openapiSchemaId = "https://agilityhub.local/census-openapi.json";
const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);
ajv.addSchema(openapiDocument, openapiSchemaId);

function expectValid(name: string, value: unknown) {
  const validate = ajv.compile({ $ref: `${openapiSchemaId}#/components/schemas/${name}` });
  expect(validate(value), JSON.stringify(validate.errors, null, 2)).toBe(true);
}

const base = "https://core.example.test/api/v1";
// Made after `server.listen()`, so that its fetch is the intercepted one.
let client = createApiClient({ baseUrl: base, getLocale: () => "ca" });

async function failure(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    if (isApiError(error)) {
      return { code: error.code, details: error.details, status: error.status };
    }
    throw error;
  }
  throw new Error("Expected an ApiError");
}

beforeAll(() => {
  server.listen({ onUnhandledRequest: "error" });
});
beforeEach(() => {
  mockScenario("admin");
  client = createApiClient({ baseUrl: base, getLocale: () => "ca" });
});
afterEach(() => {
  server.resetHandlers();
  resetCensusRecordState();
  resetSignupMockState();
  mockScenario("admin");
});
afterAll(() => {
  server.close();
});

const erased = { path: { id: ERASED_MEMBER_ID } };

/**
 * Every S03 mutation of the published snapshot whose path names a member (`/members/{id}/…`) and
 * that the mock serves; D10's preferences save (S11) too. The snapshot has no S13 route yet.
 */
const erasedMemberMutations: readonly (readonly [string, () => Promise<unknown>])[] = [
  [
    "PATCH /members/{id}",
    () =>
      client.PATCH("/members/{id}", { body: { firstName: "Abonat", version: 9 }, params: erased }),
  ],
  [
    "PATCH /members/{id}/payment-method",
    () =>
      client.PATCH("/members/{id}/payment-method", {
        body: {
          sepa: { holderName: "Titular", iban: "ES9121000418450200051332" },
          type: "SEPA_DD",
        },
        params: erased,
      }),
  ],
  [
    "PUT /members/{id}/roles",
    () => client.PUT("/members/{id}/roles", { body: { roles: ["MEMBER"] }, params: erased }),
  ],
  [
    "POST /members/{id}/booking-block",
    () =>
      client.POST("/members/{id}/booking-block", {
        body: { reason: "Rebut pendent" },
        params: erased,
      }),
  ],
  [
    "DELETE /members/{id}/booking-block",
    () => client.DELETE("/members/{id}/booking-block", { params: erased }),
  ],
  [
    "POST /members/{id}/access-resend",
    () => client.POST("/members/{id}/access-resend", { params: erased }),
  ],
  [
    "POST /members/{id}/impersonation-token",
    () => client.POST("/members/{id}/impersonation-token", { body: {}, params: erased }),
  ],
  [
    "POST /members/{id}/validation",
    () =>
      client.POST("/members/{id}/validation", { body: { dogs: [], version: 9 }, params: erased }),
  ],
  [
    "POST /members/{id}/validation?dryRun=true",
    () =>
      client.POST("/members/{id}/validation", {
        body: { dogs: [], version: 9 },
        params: { ...erased, query: { dryRun: true } },
      }),
  ],
  [
    "POST /members/{id}/rejection",
    () =>
      client.POST("/members/{id}/rejection", {
        body: { reason: "Dades duplicades", version: 9 },
        params: erased,
      }),
  ],
  [
    "PUT /members/{id}/notification-preferences",
    () =>
      client.PUT("/members/{id}/notification-preferences", {
        body: { pushClubNews: false },
        params: erased,
      }),
  ],
];

describe("E7-W07 step 3 (E7-W06 review #4, A8; S14 §5, T-14-19) · every S03 mutation of an erased member is refused with 409 MEMBER_ERASED", () => {
  it.each(erasedMemberMutations)(
    "E7-W07 step 3 (S14 §5, T-14-19): %s of the erased member answers 409 MEMBER_ERASED in the api's envelope (details {}), not 404",
    async (_route, call) => {
      expect(await failure(call())).toEqual({ code: "MEMBER_ERASED", details: {}, status: 409 });
    },
  );

  const refusals: readonly (readonly [MockScenario, string])[] = [
    ["impersonated", "IMPERSONATION_DENIED"],
    ["instructor", "FORBIDDEN"],
    ["member", "FORBIDDEN"],
  ];
  it.each(
    erasedMemberMutations.flatMap(([route, call]) =>
      refusals.map(([scenario, code]) => [route, scenario, code, call] as const),
    ),
  )(
    "E7-W07 step 3 (T-03-35): the role refusal comes before the erasure — %s by the %s scenario is 403 %s, as the api orders them",
    async (_route, scenario, code, call) => {
      mockScenario(scenario);
      expect(await failure(call())).toEqual({ code, details: {}, status: 403 });
    },
  );

  it("E7-W07 step 3 (S14 R-14-15, INC-53 item 10): the erased member's overview nulls every field R-14-15 nulls, keeps what it keeps, and still sends the snapshot's required address and birthDate", async () => {
    const { data } = await client.GET("/members/{id}/overview", { params: erased });
    expectValid("MemberOverview", data);
    expect(data).toEqual({
      // R-14-15 Dog: the overview lists none of the member's dogs (see the fixture).
      dogs: [],
      // R-14-15 Invoice: number, dates, lines, amounts and status are kept.
      invoicesCount: 12,
      member: {
        // Kept: R-14-15 pseudonymises the Account (or leaves it when it has other memberships),
        // it never unlinks it.
        accountId: "64000000-0000-4000-8000-0000000000ac",
        // Required by the snapshot's `Member` although R-14-15 nulls them (INC-53 item 10).
        address: { city: "", country: null, postalCode: "", province: null, street: "" },
        birthDate: "1979-06-02",
        // `bookingBlock.reason` → null (R-14-15); no block, so no author or date either.
        bookingBlock: { active: false, byAccountId: null, reason: null, since: null },
        // Kept: versions and dates.
        consents: {
          imageRights: { at: "2019-09-01T09:00:00Z", granted: false, version: "2019-01" },
          privacyPolicy: { acceptedAt: "2019-09-01T09:00:00Z", version: "2019-01" },
        },
        contactEmails: [],
        displayStatus: { kind: "ERASED", label: "suprimit" },
        erasedAt: "2026-09-30T06:00:00Z",
        erasureRequestId: "64000000-0000-4000-8000-0000000000e5",
        familyGroupId: null,
        firstName: "Abonat suprimit",
        fullName: "Abonat suprimit #64",
        gender: "MALE",
        id: ERASED_MEMBER_ID,
        idDocument: { number: `ERASED-${ERASED_MEMBER_ID}`, type: "ERASED" },
        internalNotes: null,
        joinedAt: "2019-09-01T09:00:00Z",
        lastName1: "#64",
        lastName2: null,
        leaveDate: "2026-07-31",
        // The IBAN is gone: no masked account either.
        maskedAccount: null,
        memberNumber: 64,
        nextInvoiceDate: null,
        // Only `type` survives (`mandateRef`/`mandateSignedAt` are not in `PaymentMethodView`).
        paymentMethod: { channel: null, holderName: null, maskedAccount: null, type: "SEPA_DD" },
        phones: [],
        // Kept: the plan and the price.
        planId: "64000000-0000-4000-8000-0000000000a1",
        priceId: "64000000-0000-4000-8000-0000000000a2",
        remarks: null,
        // `Membership.roles` → [].
        roles: [],
        status: "LEFT",
        version: 9,
      },
      // → the defaults: S11 §3, «absència del bloc = valors per defecte».
      notificationPreferences: {},
      recentAudit: [],
      recentInvoices: [
        {
          amount: { amountMinor: 6000, currency: "EUR" },
          date: "2026-07-01",
          id: "64000000-0000-4000-8000-000000000701",
          status: "PAID",
        },
        {
          amount: { amountMinor: 6000, currency: "EUR" },
          date: "2026-06-01",
          id: "64000000-0000-4000-8000-000000000601",
          status: "PAID",
        },
      ],
    });
  });
});
