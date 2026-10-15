import { describe, expect, it } from "vitest";

import { brandingThemeStyle } from "./branding";
import {
  clubModules,
  missingModuleDependencies,
  moduleDependents,
  modulePresets,
} from "./modules";

describe("E10-W01 · S17 R-17-04 module dependencies and presets (CATALEG_MODULS «Depèn de»)", () => {
  it("names what a module requires and who requires it", () => {
    expect(missingModuleDependencies(["FAQ"], "PACKS")).toEqual(["BILLING"]);
    expect(missingModuleDependencies(["BILLING"], "SINGLE_CLASS")).toEqual([]);
    expect(missingModuleDependencies([], "SOCIAL_LEAGUE")).toEqual(["STATS"]);
    expect(missingModuleDependencies([], "FAQ")).toEqual([]);
    expect(moduleDependents(["BILLING", "PACKS", "SINGLE_CLASS"], "BILLING")).toEqual([
      "PACKS",
      "SINGLE_CLASS",
    ]);
    expect(moduleDependents(["BILLING"], "BILLING")).toEqual([]);
  });

  it("keeps the three presets of R-17-04", () => {
    expect(modulePresets.MINIM).toEqual(["WAITLIST", "FAQ", "PUSH"]);
    expect(modulePresets.COMPLET).toHaveLength(clubModules.length - 2);
    expect(modulePresets.COMPLET).not.toContain("STATS");
    expect(modulePresets.CANIC).not.toContain("SINGLE_CLASS");
    expect(modulePresets.CANIC).toContain("PACKS");
    for (const preset of Object.values(modulePresets)) {
      for (const module of preset) {
        expect(missingModuleDependencies(preset, module)).toEqual([]);
      }
    }
  });

  it("scopes a theme's tokens to one element (the D19 «Tema» preview)", () => {
    const style = brandingThemeStyle({
      colors: {
        background: "var(--ah-color-surface)",
        border: "var(--ah-color-border)",
        danger: "var(--ah-color-danger)",
        info: "var(--ah-color-info)",
        onPrimary: "var(--ah-color-text)",
        primary: "var(--ah-color-background)",
        success: "var(--ah-color-success)",
        surface: "var(--ah-color-surface)",
        surfaceAlt: "var(--ah-color-surface-2)",
        text: "var(--ah-color-text)",
        textMuted: "var(--ah-color-text-muted)",
        warning: "var(--ah-color-warning)",
      },
      fontFamily: "Montserrat",
      mode: "dark",
      radius: "4px",
      ringPalette: ["var(--ah-color-info)"],
    });
    expect(style["--ah-color-primary"]).toBe("var(--ah-color-background)");
    expect(style["--ah-color-primary-fg"]).toBe("var(--ah-color-text)");
    expect(style["--ah-font-sans"]).toBe("Montserrat");
    expect(style["--ah-radius-md"]).toBe("4px");
    expect(style["--ah-color-ring-1"]).toBe("var(--ah-color-info)");
  });
});
