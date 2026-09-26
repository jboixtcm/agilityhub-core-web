import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import openapiDocument from "../../openapi/openapi.json";
import { createApiClient } from "../client";

import { mockScenario } from "./handlers";
import { server } from "./server";

const openapiSchemaId = "https://agilityhub.local/club-settings-openapi.json";
const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);
ajv.addSchema(openapiDocument, openapiSchemaId);

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

describe("E4-W11 api E5-T16 GET /club answers ClubSettings with the nulls the api sends", () => {
  it("validates against the snapshot and sends every optional block, null when the club has none", async () => {
    mockScenario("admin");
    const client = createApiClient({ baseUrl: "https://core.example.test/api/v1" });
    const { data } = await client.GET("/club");
    const validate = ajv.compile({
      $ref: `${openapiSchemaId}#/components/schemas/ClubSettings`,
    });
    expect(validate(data), JSON.stringify(validate.errors, null, 2)).toBe(true);
    expect(data).toMatchObject({
      contactEmail: null,
      contactPhone: null,
      lastChange: null,
      legal: { imageConsentTextI18n: { ca: expect.any(String) as unknown } },
      pwa: null,
      taxId: "G63189617",
      websiteUrl: null,
    });
  });
});
