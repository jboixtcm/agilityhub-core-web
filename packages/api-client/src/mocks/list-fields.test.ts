import { describe, expect, it } from "vitest";

import openapiDocument from "../../openapi/openapi.json";
import { itemsWith, listFields } from "../list-fields";

import {
  AUDIT_LIST_FIELDS,
  DOG_LIST_FIELDS,
  fieldsProjection,
  MEMBER_LIST_FIELDS,
  WEEK_LIST_FIELDS,
} from "./list-fields";

type Operations = Record<string, { get?: { "x-fields"?: string[] } }>;

/** `x-fields` of a list operation in the adopted snapshot. */
function snapshotFields(path: string): string[] | undefined {
  return (openapiDocument.paths as unknown as Operations)[path]?.get?.["x-fields"];
}

describe("E4-W15 step 0 sparse lists with `fields` (CONVENCIONS_API §4, api E5-T22)", () => {
  it("listFields asks for the row id first and each key once", () => {
    expect(listFields(["fullName", "dogs", "fullName"])).toBe("id,fullName,dogs");
    expect(listFields(["startedAt"], "runId")).toBe("runId,startedAt");
  });

  it("itemsWith refuses an item without a key it asked for: an absent key is never read as a value", () => {
    const items = [{ fullName: "Laura Serra Vidal", id: "member-laura" }, { id: "member-joan" }] as {
      fullName?: string;
      id: string;
    }[];
    expect(() => itemsWith(items, ["fullName"])).toThrow(
      "A list item lacks the key it was asked for: fullName",
    );
    expect(itemsWith(items.slice(0, 1), ["fullName"])[0]?.fullName).toBe("Laura Serra Vidal");
  });

  it("the mock keeps the row id and the keys asked for, and refuses a key outside x-fields", () => {
    const project = fieldsProjection<{ at: string; entityType: string; id: string }>(
      new URL("https://mock.test/api/v1/audit-entries?fields=entityType"),
      AUDIT_LIST_FIELDS,
      ["id"],
    );
    expect(project?.({ at: "2026-08-08T10:02:00Z", entityType: "Dog", id: "a1" })).toEqual({
      entityType: "Dog",
      id: "a1",
    });
    expect(
      fieldsProjection(new URL("https://mock.test/api/v1/audit-entries"), AUDIT_LIST_FIELDS, ["id"]),
    ).toBeNull();
    expect(
      fieldsProjection(
        new URL("https://mock.test/api/v1/audit-entries?fields=secret"),
        AUDIT_LIST_FIELDS,
        ["id"],
      ),
    ).toBeUndefined();
  });

  it.each([
    ["/api/v1/members", MEMBER_LIST_FIELDS],
    ["/api/v1/dogs", DOG_LIST_FIELDS],
    ["/api/v1/audit-entries", AUDIT_LIST_FIELDS],
    ["/api/v1/members/{id}/audit-entries", AUDIT_LIST_FIELDS],
    ["/api/v1/weeks", WEEK_LIST_FIELDS],
  ] as const)("the mock's x-fields of %s are the snapshot's", (path, fields) => {
    expect([...fields].sort()).toEqual([...(snapshotFields(path) ?? [])].sort());
  });
});
