import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

interface Schema {
  allOf?: Schema[];
  enum?: unknown[];
  properties?: Record<string, unknown>;
  type?: string;
  "x-published-by"?: string;
}

interface Document {
  components?: { schemas?: Record<string, Schema> };
  paths?: Record<string, Record<string, unknown>>;
  "x-schema-overlays"?: Record<string, Schema>;
}

const read = (name: string) =>
  JSON.parse(readFileSync(resolve(import.meta.dirname, "../openapi", name), "utf8")) as Document;
const snapshot = read("openapi.json");
const pending = read("pending.json");
const published = Object.values(snapshot.components?.schemas ?? {});

/** A snapshot schema already holds every property of `schema`, or the same enum values. */
function publishedElsewhere(schema: Schema): boolean {
  const properties = Object.keys(schema.properties ?? {});
  if (properties.length > 0) {
    return published.some((candidate) =>
      properties.every((property) => property in (candidate.properties ?? {})),
    );
  }
  if (schema.enum !== undefined) {
    const values = JSON.stringify([...schema.enum].sort());
    return published.some((candidate) =>
      Object.values(candidate.properties ?? {}).some((property) => {
        const candidateValues = (property as Schema).enum;
        return (
          candidateValues !== undefined && JSON.stringify([...candidateValues].sort()) === values
        );
      }),
    );
  }
  return false;
}

// E11-W02 step 3 (AGENTS rule 4): `pending.json` holds only what the api has not published, and
// says which api task will publish it.
describe("E11-W02 step 3: pending.json keeps only unpublished contracts, each with its api task", () => {
  const entries = [
    ...Object.entries(pending.components?.schemas ?? {}).map(([name, schema]) => ({
      name,
      schema,
    })),
    ...Object.entries(pending["x-schema-overlays"] ?? {}).map(([name, schema]) => ({
      name: `overlay ${name}`,
      schema,
    })),
  ];

  it("no pending schema is already in the snapshot, under its name or another one", () => {
    expect(
      entries
        .filter(({ name, schema }) => {
          if (schema.allOf !== undefined) return false;
          return name in (snapshot.components?.schemas ?? {}) || publishedElsewhere(schema);
        })
        .map(({ name }) => name),
    ).toEqual([]);
  });

  it("every pending entry names the api task that will publish it (x-published-by)", () => {
    const operations = Object.entries(pending.paths ?? {}).flatMap(([path, item]) =>
      Object.entries(item).map(([method, operation]) => ({
        name: `${method.toUpperCase()} ${path}`,
        schema: operation as Schema,
      })),
    );
    expect(
      [...entries, ...operations]
        .filter(({ schema }) => !/^E\d+-T\d+$/u.test(schema["x-published-by"] ?? ""))
        .map(({ name }) => name),
    ).toEqual([]);
  });
});
