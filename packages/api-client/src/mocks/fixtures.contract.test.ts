import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import Ajv2020, { type AnySchema } from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { describe, expect, it } from "vitest";

import openapiDocument from "../../openapi/openapi.json";

const fixturesDirectory = fileURLToPath(new URL("./fixtures", import.meta.url));
const openapiSchemaId = "https://agilityhub.local/openapi.json";

const schemasByFixture: Readonly<Record<string, AnySchema>> = {
  "audit-entries.json": {
    items: { $ref: `${openapiSchemaId}#/components/schemas/AuditEntryListItem` },
    type: "array",
  },
  "branding-canic.json": {
    $ref: `${openapiSchemaId}#/components/schemas/BrandingResponse`,
  },
  "branding-minim.json": {
    $ref: `${openapiSchemaId}#/components/schemas/BrandingResponse`,
  },
  "club-pages.json": {
    items: { $ref: `${openapiSchemaId}#/components/schemas/ClubPage` },
    type: "array",
  },
  "export-jobs.json": {
    items: { $ref: `${openapiSchemaId}#/components/schemas/ExportJob` },
    type: "array",
  },
  "me-admin.json": { $ref: `${openapiSchemaId}#/components/schemas/Me` },
  "me-impersonated.json": { $ref: `${openapiSchemaId}#/components/schemas/Me` },
  "me-instructor.json": { $ref: `${openapiSchemaId}#/components/schemas/Me` },
  "me-member.json": { $ref: `${openapiSchemaId}#/components/schemas/Me` },
  "me-multi-profile.json": { $ref: `${openapiSchemaId}#/components/schemas/Me` },
  "sessions.json": {
    items: { $ref: `${openapiSchemaId}#/components/schemas/Session` },
    type: "array",
  },
};

describe("T-01-25 OpenAPI mock fixture contract", () => {
  const fixtureFiles = readdirSync(fixturesDirectory)
    .filter((name) => name.endsWith(".json"))
    .sort();

  it("maps every JSON fixture to an authoritative component schema", () => {
    expect(fixtureFiles).toEqual(Object.keys(schemasByFixture).sort());
  });

  it.each(fixtureFiles)("validates %s", (fixtureFile) => {
    const fixtureSchema = schemasByFixture[fixtureFile];
    if (fixtureSchema === undefined) {
      throw new TypeError(`No component schema is mapped for ${fixtureFile}`);
    }
    const ajv = new Ajv2020({ allErrors: true, strict: false });
    addFormats(ajv);
    ajv.addSchema(openapiDocument, openapiSchemaId);
    const validate = ajv.compile(fixtureSchema);
    const fixture: unknown = JSON.parse(
      readFileSync(new URL(`./fixtures/${fixtureFile}`, import.meta.url), "utf8"),
    );

    expect(validate(fixture), JSON.stringify(validate.errors, null, 2)).toBe(true);
  });
});
