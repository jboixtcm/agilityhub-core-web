import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

interface Schema {
  allOf?: Schema[];
  properties?: Record<string, unknown>;
  type?: string;
}

interface Document {
  components?: { schemas?: Record<string, Schema> };
  "x-schema-overlays"?: Record<string, Schema>;
}

const read = (name: string) =>
  JSON.parse(readFileSync(resolve(import.meta.dirname, "../openapi", name), "utf8")) as Document;
const snapshot = read("openapi.json");
const pending = read("pending.json");

/** The pending entries the snapshot already publishes (AGENTS rule 4: they leave `pending.json`). */
function alreadyPublished(document: Document, published: Document = snapshot): string[] {
  const names = published.components?.schemas ?? {};
  const entries = [
    ...Object.entries(document.components?.schemas ?? {}).map(([name, schema]) => ({
      name,
      schema,
    })),
    ...Object.entries(document["x-schema-overlays"] ?? {}).map(([name, schema]) => ({
      name: `overlay ${name}`,
      schema,
    })),
  ];
  return entries
    .filter(({ name, schema }) => {
      if (schema.allOf !== undefined) return false;
      return name in names;
    })
    .map(({ name }) => name);
}

// E11-W02 step 3 (AGENTS rule 4): `pending.json` holds only what the api has not published.
describe("E11-W02 step 3: pending.json keeps only unpublished contracts", () => {
  it("no pending schema is already in the snapshot", () => {
    expect(alreadyPublished(pending)).toEqual([]);
  });

  it("round 2 (review #9): a mocks-first schema with common property names is not «published»", () => {
    const mocksFirst: Document = {
      components: {
        schemas: {
          ClubDraftNote: {
            properties: { id: { type: "string" }, name: { type: "string" }, status: {} },
            type: "object",
          },
        },
      },
    };
    expect(alreadyPublished(mocksFirst)).toEqual([]);
    // One under a name the snapshot publishes is.
    const [publishedName] = Object.keys(snapshot.components?.schemas ?? {});
    expect(
      alreadyPublished({ components: { schemas: { [publishedName ?? ""]: { type: "object" } } } }),
    ).toEqual([publishedName]);
  });
});
