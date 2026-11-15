import { describe, expect, it } from "vitest";

import { whatsAppUrl } from "./whatsapp";

describe("FE-09: the WhatsApp link of a phone", () => {
  it("keeps the digits of the prefix and the number only", () => {
    expect(whatsAppUrl({ number: "655 10 01 01", prefix: "+34" })).toBe(
      "https://wa.me/34655100101",
    );
    expect(whatsAppUrl({ number: "(0)20-7946-0958", prefix: "+44" })).toBe(
      "https://wa.me/4402079460958",
    );
  });

  it("never lets a typed value shape the link's path or query", () => {
    const url = new URL(
      whatsAppUrl({ number: "655100101?text=Paga aquí#x", prefix: "+34/../send" }),
    );
    expect(url.origin).toBe("https://wa.me");
    expect(url.pathname).toBe("/34655100101");
    expect(url.search).toBe("");
    expect(url.hash).toBe("");
  });
});
