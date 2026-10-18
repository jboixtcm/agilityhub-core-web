import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import openapiDocument from "../../openapi/openapi.json";

/**
 * E11-W02 round 2 (INC-41: «six MSW statuses that differ from the api's»): every error a mock
 * handler answers (`apiError(code, message, status)`) has the status the contract gives that code
 * on that operation. The handler is the `http.<method>("*…/api/v1/…")` the call sits in; a code
 * the operation does not list is left alone (nothing to compare with).
 */

interface Operation {
  responses?: Record<string, unknown>;
}

const paths = (openapiDocument as { paths: Record<string, Record<string, Operation>> }).paths;

/** `/api/v1/dogs/{dogId}/transfer` and MSW's `/api/v1/dogs/:id/transfer` alike: `{}` per param. */
const shape = (path: string) =>
  path.replaceAll(/\{[^}]+\}/gu, "{}").replaceAll(/:[A-Za-z]+/gu, "{}");

const operations = new Map<string, Operation>();
for (const [path, item] of Object.entries(paths)) {
  for (const [method, operation] of Object.entries(item)) {
    operations.set(`${method.toUpperCase()} ${shape(path)}`, operation);
  }
}

/** The statuses whose response names `code` (its description or its examples). */
function contractStatuses(operation: Operation, code: string): string[] {
  const pattern = new RegExp(`\\b${code}\\b`, "u");
  return Object.entries(operation.responses ?? {})
    .filter(([, response]) => pattern.test(JSON.stringify(response)))
    .map(([status]) => status);
}

/** Every MSW handler, its path when it is a plain string (an upload host or a pattern is none). */
const HANDLER = /http\.(get|post|put|patch|delete|all)\(\s*(?:"([^"]*)")?/gu;
const ERROR = /apiError\(\s*"([A-Z_]+)",[^)]*?,\s*(\d{3})\b/gu;
const SUCCESS = /\{\s*status:\s*(2\d\d)\s*\}/gu;

function mismatches(file: string, source: string): string[] {
  const handlers = [...source.matchAll(HANDLER)].map((match) => {
    const path = /^\*(\/api\/v1\/.*)$/u.exec(match[2] ?? "")?.[1];
    return {
      at: match.index,
      key: path === undefined ? "" : `${(match[1] ?? "").toUpperCase()} ${shape(path)}`,
    };
  });
  const problems: string[] = [];
  for (const match of source.matchAll(ERROR)) {
    const handler = handlers.filter((item) => item.at < match.index).at(-1);
    const operation = handler === undefined ? undefined : operations.get(handler.key);
    if (handler === undefined || operation === undefined) continue;
    const [, code = "", status = ""] = match;
    const declared = contractStatuses(operation, code);
    if (declared.length > 0 && !declared.includes(status)) {
      problems.push(`${file}: ${handler.key} ${code}: mock ${status}, api ${declared.join("/")}`);
    }
  }
  // A success the operation does not declare (a 201 where the api answers 200).
  for (const match of source.matchAll(SUCCESS)) {
    const handler = handlers.filter((item) => item.at < match.index).at(-1);
    const operation = handler === undefined ? undefined : operations.get(handler.key);
    if (handler === undefined || operation === undefined) continue;
    const status = match[1] ?? "";
    const declared = Object.keys(operation.responses ?? {}).filter((key) => key.startsWith("2"));
    if (declared.length > 0 && !declared.includes(status)) {
      problems.push(`${file}: ${handler.key}: mock ${status}, api ${declared.join("/")}`);
    }
  }
  return problems;
}

describe("E11-W02 round 2 (INC-41): the mocks answer each error with the api's status", () => {
  it("no handler's apiError status differs from the contract's for that operation and code", () => {
    const directory = resolve(import.meta.dirname);
    const files = readdirSync(directory).filter(
      (file) => file.endsWith(".ts") && !file.endsWith(".test.ts"),
    );
    expect(files.length).toBeGreaterThan(5);
    const problems = files.flatMap((file) =>
      mismatches(file, readFileSync(resolve(directory, file), "utf8")),
    );
    expect(problems).toEqual([]);
  });

  it("the check finds a mismatch when there is one (a 409 the contract gives as 422)", () => {
    const source = `http.post("*/api/v1/dogs/:id/deactivation", () => apiError("DOG_NOT_ACTIVE", "Dog not active", 409))`;
    expect(mismatches("fixture.ts", source)).toEqual([
      "fixture.ts: POST /api/v1/dogs/{}/deactivation DOG_NOT_ACTIVE: mock 409, api 422",
    ]);
  });
});
