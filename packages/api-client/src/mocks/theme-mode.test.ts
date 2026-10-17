import { afterEach, describe, expect, it } from "vitest";

import { currentMockScenario, mockScenario, mockThemeMode } from "./scenarios";

afterEach(() => {
  mockThemeMode(null);
  mockScenario("admin");
});

describe("E9-W05 step 3 · the mock theme mode (S16 screenshots light and dark)", () => {
  it("draws a dark club's branding light with the light fixture's palette, and keeps the rest", () => {
    mockScenario("admin");
    const own = currentMockScenario();
    expect(own.branding.theme.mode).toBe("dark");

    mockThemeMode("light");
    const light = currentMockScenario();
    expect(light.branding.theme.mode).toBe("light");
    expect(light.branding.theme.colors.background).not.toBe(own.branding.theme.colors.background);
    expect(light.branding.theme.logoUrl).toBe(own.branding.theme.logoUrl);
    expect(light.branding.club).toBe(own.branding.club);
    expect(light.me).toBe(own.me);
    // The same object on every read, as handlers keep state per scenario.
    expect(currentMockScenario()).toBe(light);
  });

  it("leaves a scenario already in that mode, and null restores the scenario's own theme", () => {
    mockScenario("admin");
    const own = currentMockScenario();
    mockThemeMode("dark");
    expect(currentMockScenario()).toBe(own);
    mockThemeMode(null);
    expect(currentMockScenario()).toBe(own);
  });
});
