import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import brandingFixture from "../../api-client/src/mocks/fixtures/branding-canic.json";

import { type Branding, BrandingProvider, resolveBrandingLogo, useBranding } from "./branding";

function canicBranding(): Branding {
  return {
    ...brandingFixture,
    theme: {
      ...brandingFixture.theme,
      mode: "dark",
    },
  };
}

function BrandingName() {
  return <span>{useBranding().club.name}</span>;
}

describe("T-02-05 BrandingProvider", () => {
  it("uses only the mark in compact placements and falls back to an initial", () => {
    const branding = canicBranding();

    expect(resolveBrandingLogo(branding.theme, { placement: "compact" })).toEqual({
      kind: "mark",
      showName: true,
      src: branding.theme.markUrl,
    });
    expect(
      resolveBrandingLogo({ ...branding.theme, markUrl: " " }, { placement: "compact" }),
    ).toEqual({
      kind: "initial",
      showName: true,
      src: undefined,
    });
  });

  it("selects the theme-aware full logo before the mark and initial fallbacks", () => {
    const branding = canicBranding();

    expect(resolveBrandingLogo(branding.theme, { placement: "full" })).toEqual({
      kind: "full",
      showName: false,
      src: branding.theme.logoDarkUrl,
    });
    expect(
      resolveBrandingLogo({ ...branding.theme, mode: "light" }, { placement: "full" }),
    ).toEqual({
      kind: "full",
      showName: false,
      src: branding.theme.logoUrl,
    });
    const withoutDarkLogo: Branding["theme"] = { ...branding.theme };
    delete withoutDarkLogo.logoDarkUrl;
    expect(resolveBrandingLogo(withoutDarkLogo, { placement: "full" })).toEqual({
      kind: "full",
      showName: false,
      src: branding.theme.logoUrl,
    });
    const markOnlyTheme: Branding["theme"] = { ...branding.theme, logoDarkUrl: " " };
    delete markOnlyTheme.logoUrl;
    expect(resolveBrandingLogo(markOnlyTheme, { placement: "full" })).toEqual({
      kind: "mark",
      showName: true,
      src: branding.theme.markUrl,
    });
    const withoutAssets: Branding["theme"] = { ...markOnlyTheme };
    delete withoutAssets.markUrl;
    expect(resolveBrandingLogo(withoutAssets, { placement: "full" })).toEqual({
      kind: "initial",
      showName: true,
      src: undefined,
    });
  });

  it("applies theme tokens and exposes public branding", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const branding = canicBranding();

    const { unmount } = render(
      <BrandingProvider branding={branding}>
        <BrandingName />
      </BrandingProvider>,
    );

    expect(screen.getByText(branding.club.name)).toBeInTheDocument();
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(document.documentElement.style.getPropertyValue("--ah-color-primary")).toBe(
      branding.theme.colors.primary,
    );
    unmount();
    expect(document.documentElement.style.getPropertyValue("--ah-color-primary")).toBe("");
    warn.mockRestore();
  });

  it("warns when primary contrast is below WCAG AA", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const branding = canicBranding();
    const lowContrast: Branding = {
      ...branding,
      theme: {
        ...branding.theme,
        colors: {
          ...branding.theme.colors,
          onPrimary: branding.theme.colors.primary,
        },
      },
    };

    render(
      <BrandingProvider branding={lowContrast}>
        <BrandingName />
      </BrandingProvider>,
    );

    expect(warn).toHaveBeenCalledWith(expect.stringContaining("below WCAG AA"));
    warn.mockRestore();
  });
});
