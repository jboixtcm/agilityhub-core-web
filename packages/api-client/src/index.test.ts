import { describe, expect, it } from "vitest";

import { API_CLIENT_PACKAGE_NAME } from "./index";

describe("@agilityhub/api-client", () => {
  it("exports its package marker", () => {
    expect(API_CLIENT_PACKAGE_NAME).toBe("@agilityhub/api-client");
  });
});
