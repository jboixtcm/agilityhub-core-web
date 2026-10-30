import { describe, expect, it } from "vitest";

import { configuredFooter } from "./PublicFooter";

describe("configured public footer", () => {
  it("isolates display overrides by tenant and rejects malformed configuration", () => {
    const raw = JSON.stringify({ demo: ["Demo club", "Tax ID"] });
    expect(configuredFooter(raw, "demo")).toEqual(["Demo club", "Tax ID"]);
    expect(configuredFooter(raw, "another-club")).toBeUndefined();
    expect(configuredFooter(raw, null)).toBeUndefined();
    expect(configuredFooter("{invalid", "demo")).toBeUndefined();
    expect(configuredFooter('{"demo":[7]}', "demo")).toBeUndefined();
  });
});
