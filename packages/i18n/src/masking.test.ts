import { describe, expect, it } from "vitest";

import { fmtMaskedIban } from "./masking";

describe("T-03-03 fmtMaskedIban (front half, R-03-27)", () => {
  it.each([
    ["···· 1332", "···· ···· ···· ···· 1332"],
    ["···· ···· ···· ···· 1332", "···· ···· ···· ···· 1332"],
    ["ES02 ···· 7719", "···· ···· ···· ···· 7719"],
    ["ES91…2231", "···· ···· ···· ···· 2231"],
    ["ES91 2100 0418 4502 0005 2231", "···· ···· ···· ···· 2231"],
  ])("masks %s as the single R-03-27 format", (input, expected) => {
    expect(fmtMaskedIban(input)).toBe(expected);
  });

  it.each([null, undefined, "", "···· ····"])(
    "returns null when there is no account (%s)",
    (input) => {
      expect(fmtMaskedIban(input)).toBeNull();
    },
  );
});
