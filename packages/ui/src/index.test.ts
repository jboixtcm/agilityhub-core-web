import { describe, expect, it } from "vitest";

import { UI_PACKAGE_NAME } from "./index";

describe("@agilityhub/ui", () => {
  it("exports its package marker", () => {
    expect(UI_PACKAGE_NAME).toBe("@agilityhub/ui");
  });
});
