import { describe, expect, it } from "vitest";

import { AUTH_PACKAGE_NAME } from "./index";

describe("@agilityhub/auth", () => {
  it("exports its package marker", () => {
    expect(AUTH_PACKAGE_NAME).toBe("@agilityhub/auth");
  });
});
