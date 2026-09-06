import { describe, expect, it } from "vitest";

import { isModuleUiItemEnabled, moduleUi, UI_PACKAGE_NAME } from "./index";

describe("@agilityhub/ui", () => {
  it("exports its package marker", () => {
    expect(UI_PACKAGE_NAME).toBe("@agilityhub/ui");
  });

  it("keeps route, tab, and menu gating in the module registry", () => {
    expect(moduleUi.FREE_TRAINING.tabs).toContain("training");
    expect(moduleUi.COURSES.routes).toContain("/recorreguts");
    expect(isModuleUiItemEnabled(["FAQ"], "tabs", "info")).toBe(true);
    expect(isModuleUiItemEnabled(["FAQ"], "tabs", "training")).toBe(false);
  });
});
