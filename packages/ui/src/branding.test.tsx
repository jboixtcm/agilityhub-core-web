import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import brandingFixture from "../../api-client/src/mocks/fixtures/branding-canic.json";

import { type Branding, BrandingProvider, useBranding } from "./branding";

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
  return <span>{useBranding().name}</span>;
}

describe("T-02-05 BrandingProvider", () => {
  it("applies theme tokens and exposes public branding", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const branding = canicBranding();

    const { unmount } = render(
      <BrandingProvider branding={branding}>
        <BrandingName />
      </BrandingProvider>,
    );

    expect(screen.getByText(branding.name)).toBeInTheDocument();
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
