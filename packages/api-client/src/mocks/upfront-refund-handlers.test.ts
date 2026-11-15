import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import openapiDocument from "../../openapi/openapi.json";
import { isApiError } from "../api-error";
import { createApiClient } from "../client";

import { mockScenario, resetMemberBillingState, type MockScenario } from "./handlers";
import { server } from "./server";

const openapiSchemaId = "https://agilityhub.local/upfront-refund-openapi.json";
const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);
ajv.addSchema(openapiDocument, openapiSchemaId);

function expectValid(name: string, value: unknown) {
  const validate = ajv.compile({ $ref: `${openapiSchemaId}#/components/schemas/${name}` });
  expect(validate(value), JSON.stringify(validate.errors, null, 2)).toBe(true);
}

const base = "https://core.example.test/api/v1";
let client = createApiClient({ baseUrl: base, getLocale: () => "ca" });

function use(scenario: MockScenario) {
  mockScenario(scenario);
  client = createApiClient({ baseUrl: base, getLocale: () => "ca" });
}

async function failure(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    if (isApiError(error)) return { code: error.code, status: error.status };
    throw error;
  }
  throw new Error("Expected an ApiError");
}

/** Laura's pack paid by card (Stripe Checkout) and her entry fee paid in cash. */
const CARD_PACK = "54000000-0000-4000-8000-000000000101";
const CASH_ENTRY = "54000000-0000-4000-8000-000000000001";
const eur = (amountMinor: number) => ({ amountMinor, currency: "EUR" });

const refund = (id: string, body: { amount?: ReturnType<typeof eur>; reason: string }) =>
  client.POST("/upfront-payments/{id}/refund", {
    body,
    params: { header: { "Idempotency-Key": crypto.randomUUID() }, path: { id } },
  });

const lauraPayments = async () =>
  (await client.GET("/upfront-payments", { params: { query: { memberId: "member-laura" } } })).data
    ?.items ?? [];

beforeAll(() => {
  server.listen({ onUnhandledRequest: "error" });
});
afterEach(() => {
  server.resetHandlers();
  resetMemberBillingState();
  use("admin");
});
afterAll(() => {
  server.close();
});

describe("PAY-05 (owner decision of 13 Nov 2026) · POST /upfront-payments/{id}/refund", () => {
  it("refunds a card payment in part and then what is left, as the api answers", async () => {
    use("admin");
    const partial = await refund(CARD_PACK, { amount: eur(4000), reason: "Dues sessions" });
    expectValid("RefundAccepted", partial.data);
    expect(partial.data?.amount).toEqual(eur(4000));
    let pack = (await lauraPayments()).find((row) => row.id === CARD_PACK);
    expect(pack).toMatchObject({ refunds: [{ amount: eur(4000), reason: "Dues sessions" }] });
    expect(pack?.status).toBe("PAID");
    expect(await failure(refund(CARD_PACK, { amount: eur(8001), reason: "Massa" }))).toEqual({
      code: "REFUND_EXCEEDS_PAID",
      status: 422,
    });
    const rest = await refund(CARD_PACK, { reason: "La resta" });
    expect(rest.data?.amount).toEqual(eur(8000));
    pack = (await lauraPayments()).find((row) => row.id === CARD_PACK);
    expect(pack?.status).toBe("REFUNDED");
    expect(pack?.refunds).toHaveLength(2);
    // Nothing left: not PAID any more.
    expect(await failure(refund(CARD_PACK, { reason: "Una altra vegada" }))).toEqual({
      code: "INVALID_STATE",
      status: 409,
    });
  });

  it("refuses a cash payment, a blank reason, another currency and an unknown payment", async () => {
    use("admin");
    expect(await failure(refund(CASH_ENTRY, { reason: "Efectiu" }))).toEqual({
      code: "PAYMENT_PROVIDER_NOT_ENABLED",
      status: 422,
    });
    expect(await failure(refund(CARD_PACK, { reason: "  " }))).toEqual({
      code: "VALIDATION_ERROR",
      status: 400,
    });
    expect(
      await failure(
        refund(CARD_PACK, { amount: { amountMinor: 100, currency: "USD" }, reason: "Moneda" }),
      ),
    ).toEqual({ code: "CURRENCY_MISMATCH", status: 422 });
    expect(
      await failure(refund("54000000-0000-4000-8000-000000000999", { reason: "Cap" })),
    ).toEqual({ code: "NOT_FOUND", status: 404 });
    expect((await lauraPayments()).find((row) => row.id === CARD_PACK)?.refunds).toEqual([]);
  });

  it("is ADMIN only: a member and an impersonation get 403, BILLING off 404 MODULE_DISABLED", async () => {
    use("member");
    expect((await failure(refund(CARD_PACK, { reason: "x" }))).status).toBe(403);
    use("impersonated");
    expect(await failure(refund(CARD_PACK, { reason: "x" }))).toEqual({
      code: "IMPERSONATION_DENIED",
      status: 403,
    });
    use("adminNoBilling");
    expect(await failure(refund(CARD_PACK, { reason: "x" }))).toEqual({
      code: "MODULE_DISABLED",
      status: 404,
    });
  });
});
