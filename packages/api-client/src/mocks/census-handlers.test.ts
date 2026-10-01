import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import openapiDocument from "../../openapi/openapi.json";
import { isApiError } from "../api-error";
import { createApiClient } from "../client";

import { censusRecordState } from "./fixtures/census";
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

/** This club's live member: D10's record (`fixtures/census.ts`). */
const LIVE_MEMBER_ID = "member-laura";

/**
 * Every S03 mutation of the published snapshot whose path names a member (`/members/{id}/…`) and
 * that the mock serves; D10's preferences save (S11) too. The snapshot has no S13 route yet.
 */
function memberMutations(id: string): readonly (readonly [string, () => Promise<unknown>])[] {
  const params = { path: { id } };
  return [
    [
      "PATCH /members/{id}",
      () => client.PATCH("/members/{id}", { body: { firstName: "Abonat", version: 9 }, params }),
    ],
    [
      "PATCH /members/{id}/payment-method",
      () =>
        client.PATCH("/members/{id}/payment-method", {
          body: {
            sepa: { holderName: "Titular", iban: "ES9121000418450200051332" },
            type: "SEPA_DD",
          },
          params,
        }),
    ],
    [
      "PUT /members/{id}/roles",
      () => client.PUT("/members/{id}/roles", { body: { roles: ["MEMBER"] }, params }),
    ],
    [
      "POST /members/{id}/booking-block",
      () =>
        client.POST("/members/{id}/booking-block", {
          body: { reason: "Rebut pendent" },
          params,
        }),
    ],
    [
      "DELETE /members/{id}/booking-block",
      () => client.DELETE("/members/{id}/booking-block", { params }),
    ],
    [
      "POST /members/{id}/access-resend",
      () => client.POST("/members/{id}/access-resend", { params }),
    ],
    [
      "POST /members/{id}/impersonation-token",
      () => client.POST("/members/{id}/impersonation-token", { body: {}, params }),
    ],
    [
      "POST /members/{id}/validation",
      () => client.POST("/members/{id}/validation", { body: { dogs: [], version: 9 }, params }),
    ],
    [
      "POST /members/{id}/validation?dryRun=true",
      () =>
        client.POST("/members/{id}/validation", {
          body: { dogs: [], version: 9 },
          params: { ...params, query: { dryRun: true } },
        }),
    ],
    [
      "POST /members/{id}/rejection",
      () =>
        client.POST("/members/{id}/rejection", {
          body: { reason: "Dades duplicades", version: 9 },
          params,
        }),
    ],
    [
      "PUT /members/{id}/notification-preferences",
      () =>
        client.PUT("/members/{id}/notification-preferences", {
          body: { pushClubNews: false },
          params,
        }),
    ],
  ];
}

const erasedMemberMutations = memberMutations(ERASED_MEMBER_ID);

describe("E7-W07 round 2 (self-review #3; T-03-35, CONVENCIONS_API §10) · an ADMIN of another club finds no member of this club", () => {
  it.each(memberMutations(LIVE_MEMBER_ID))(
    "E7-W07 round 2 (T-03-35): %s of this club's live member by an ADMIN of another club is 404 NOT_FOUND «Member not found»",
    async (_route, call) => {
      mockScenario("adminOtherClub");
      expect(await failure(call())).toEqual({ code: "NOT_FOUND", details: {}, status: 404 });
    },
  );

  const liveRefusals: readonly (readonly [MockScenario, string])[] = [
    ["impersonated", "IMPERSONATION_DENIED"],
    ["instructor", "FORBIDDEN"],
    ["member", "FORBIDDEN"],
  ];
  it.each(
    memberMutations(LIVE_MEMBER_ID).flatMap(([route, call]) =>
      liveRefusals.map(([scenario, code]) => [route, scenario, code, call] as const),
    ),
  )(
    "E7-W07 round 2 (re-review #5; T-03-35): %s of this club's live member by the %s scenario is 403 %s (an ADMIN route)",
    async (_route, scenario, code, call) => {
      mockScenario(scenario);
      expect(await failure(call())).toEqual({ code, details: {}, status: 403 });
    },
  );

  it("E7-W07 round 2 (T-03-35): D10's preferences read of this club's live member by an ADMIN of another club is 404; this club's ADMIN reads it", async () => {
    const read = () =>
      client.GET("/members/{id}/notification-preferences", {
        params: { path: { id: LIVE_MEMBER_ID } },
      });
    mockScenario("adminOtherClub");
    expect(await failure(read())).toEqual({ code: "NOT_FOUND", details: {}, status: 404 });
    mockScenario("admin");
    expect((await read()).response.status).toBe(200);
  });
});

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

  it.each(erasedMemberMutations)(
    "E7-W07 round 2 #4 (T-03-35, CONVENCIONS_API §10): %s of this club's erased member by an ADMIN of another club is 404 NOT_FOUND «Member not found», before the erasure is revealed",
    async (_route, call) => {
      mockScenario("adminOtherClub");
      const refused = await call().then(
        () => undefined,
        (error: unknown) => error,
      );
      expect(isApiError(refused)).toBe(true);
      if (!isApiError(refused)) return;
      expect({
        code: refused.code,
        details: refused.details,
        message: refused.message,
        status: refused.status,
      }).toEqual({ code: "NOT_FOUND", details: {}, message: "Member not found", status: 404 });
    },
  );

  it("E7-W07 round 2 #4 (T-03-35): D10's preferences read of this club's erased member by an ADMIN of another club is 404 NOT_FOUND too; this club's ADMIN still gets 409 MEMBER_ERASED", async () => {
    const read = () => client.GET("/members/{id}/notification-preferences", { params: erased });
    mockScenario("adminOtherClub");
    expect(await failure(read())).toEqual({ code: "NOT_FOUND", details: {}, status: 404 });
    mockScenario("admin");
    expect(await failure(read())).toEqual({ code: "MEMBER_ERASED", details: {}, status: 409 });
  });

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

describe("E7-W07 round 2 #5c · the census refusals answer the snapshot's status (CATALEG_ERRORS rule 0)", () => {
  it("E7-W07 round 2 #5c (S03 §6, the snapshot's ErrorCode): «Reenvia accés» for a member who is not active answers 422 MEMBER_NOT_ACTIVE, not 409", async () => {
    const member = censusRecordState.memberOverview.member;
    member.status = "LEFT";
    const params = { path: { id: member.id } };
    expect(await failure(client.POST("/members/{id}/access-resend", { params }))).toEqual({
      code: "MEMBER_NOT_ACTIVE",
      details: {},
      status: 422,
    });
  });

  it("E7-W07 round 2 #5c (S03 §6, the snapshot's ErrorCode): «Desbloqueja les reserves» for a member without a block answers 422 BOOKING_BLOCK_NOT_ACTIVE, not 409", async () => {
    const member = censusRecordState.memberOverview.member;
    member.bookingBlock = { active: false };
    const params = { path: { id: member.id } };
    expect(await failure(client.DELETE("/members/{id}/booking-block", { params }))).toEqual({
      code: "BOOKING_BLOCK_NOT_ACTIVE",
      details: {},
      status: 422,
    });
  });
});
