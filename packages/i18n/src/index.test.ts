import { describe, expect, it } from "vitest";

import { t } from "./index";

describe("@agilityhub/i18n", () => {
  it("exports the placeholder translator", () => {
    expect(t("shell.id", "ca")).toBe("AgilityHub ID");
  });
});
