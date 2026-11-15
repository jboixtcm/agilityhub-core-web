import { describe, expect, it } from "vitest";

import { validIban } from "./iban";

// Invented accounts (bank 0000), apart from the IBAN standard's documented Spanish example.
describe("WEB-07 validIban (R-04-10: mod 97 and the country length)", () => {
  it("accepts a valid IBAN typed with spaces or in lower case", () => {
    expect(validIban("ES91 2100 0418 4502 0005 1332")).toBe(true);
    expect(validIban("es8200000000000000000000")).toBe(true);
    expect(validIban("DE36000000000000000000")).toBe(true);
    expect(validIban("FR7600000000000000000000000")).toBe(true);
  });

  it("refuses wrong check digits", () => {
    expect(validIban("ES91 2100 0418 4502 0005 1333")).toBe(false);
    expect(validIban("ES00 0000 0000 0000 0000 0000")).toBe(false);
  });

  it("refuses a Spanish IBAN that is not 24 characters long, even with valid check digits", () => {
    expect(validIban("ES55000000000000000000001")).toBe(false);
    expect(validIban("ES91 2100 0418 4502 0005 133")).toBe(false);
  });

  it("refuses what is not an IBAN", () => {
    expect(validIban("")).toBe(false);
    expect(validIban("   ")).toBe(false);
    expect(validIban("2100 0418 4502 0005 1332")).toBe(false);
    expect(validIban("ES91-2100-0418-4502-0005-1332")).toBe(false);
    expect(validIban("XX00")).toBe(false);
  });
});
