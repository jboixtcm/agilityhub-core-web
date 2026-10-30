import { act, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import brandingFixture from "../../api-client/src/mocks/fixtures/branding-canic.json";
import minimFixture from "../../api-client/src/mocks/fixtures/branding-minim.json";

import {
  applyBrandingTheme,
  type Branding,
  BrandingProvider,
  brandingThemeStyle,
  resolveBrandingLogo,
  useBranding,
  useBrandingLogo,
  withProductBrandName,
} from "./branding";

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
  it("uses the club mark as favicon, falls back without a mark, and restores the page icon", () => {
    const icon = document.createElement("link");
    icon.rel = "icon";
    icon.setAttribute("href", "/favicon.svg");
    icon.type = "image/svg+xml";
    document.head.append(icon);
    const branding = canicBranding();
    const { rerender, unmount } = render(
      <BrandingProvider branding={branding}>
        <BrandingName />
      </BrandingProvider>,
    );
    expect(icon.getAttribute("href")).toBe(branding.theme.markUrl);
    expect(icon.hasAttribute("type")).toBe(false);
    const withoutMark = { ...branding, theme: { ...branding.theme, markUrl: null } };
    rerender(
      <BrandingProvider branding={withoutMark}>
        <BrandingName />
      </BrandingProvider>,
    );
    expect(icon.getAttribute("href")).toBe("/favicon.svg");
    expect(document.head.querySelectorAll('link[rel="icon"]')).toHaveLength(1);
    unmount();
    expect(icon.getAttribute("href")).toBe("/favicon.svg");
    expect(icon.type).toBe("image/svg+xml");
    icon.remove();
  });

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

  it("E4-W14 a club without assets: `/branding` sends null logos (api E5-T16), read as absent in both placements", () => {
    // The minimal club's fixture sends the three keys as `null`, as the api does.
    expect(minimFixture.theme).toMatchObject({ logoDarkUrl: null, logoUrl: null, markUrl: null });
    const theme: Branding["theme"] = { ...minimFixture.theme, mode: "dark" };
    const initial = { kind: "initial", showName: true, src: undefined };
    expect(resolveBrandingLogo(theme, { placement: "compact" })).toEqual(initial);
    expect(resolveBrandingLogo(theme, { placement: "full" })).toEqual(initial);
    expect(resolveBrandingLogo({ ...theme, mode: "light" }, { placement: "full" })).toEqual(
      initial,
    );
    // A null dark logo falls back to the light one; a null logo to the mark.
    const canic = canicBranding().theme;
    expect(resolveBrandingLogo({ ...canic, logoDarkUrl: null }, { placement: "full" })).toEqual({
      kind: "full",
      showName: false,
      src: canic.logoUrl,
    });
    expect(
      resolveBrandingLogo({ ...canic, logoDarkUrl: null, logoUrl: null }, { placement: "full" }),
    ).toEqual({ kind: "mark", showName: true, src: canic.markUrl });
    expect(resolveBrandingLogo({ ...canic, markUrl: null }, { placement: "compact" })).toEqual(
      initial,
    );
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

describe("R-02-08 (E11-W02 round 2, review #7): theme `auto` is live", () => {
  const autoCanic = (): Branding => ({
    ...canicBranding(),
    theme: { ...canicBranding().theme, mode: "auto" },
  });

  function FullLogo() {
    const logo = useBrandingLogo("full");
    return <img alt="logo" src={logo.src} />;
  }

  it("a mounted full logo turns to the dark one, and back, as the reader's scheme flips", () => {
    const scheme = colorScheme(false);
    const branding = autoCanic();
    const { unmount } = render(
      <BrandingProvider branding={branding}>
        <FullLogo />
      </BrandingProvider>,
    );
    const logo = () => screen.getByRole("img", { name: "logo" });
    expect(logo()).toHaveAttribute("src", branding.theme.logoUrl);
    act(() => {
      scheme.set(true);
    });
    expect(logo()).toHaveAttribute("src", branding.theme.logoDarkUrl);
    act(() => {
      scheme.set(false);
    });
    expect(logo()).toHaveAttribute("src", branding.theme.logoUrl);
    unmount();
    scheme.restore();
  });

  it("unmounting the provider restores the page's scheme, accent and theme-color", () => {
    const scheme = colorScheme(true);
    const root = document.documentElement;
    // The page's own values before the provider: another club's (the minimal fixture's).
    const page = (minimFixture as unknown as Branding).theme.colors;
    for (const stale of document.head.querySelectorAll('meta[name="theme-color"]')) stale.remove();
    root.dataset.scheme = "light";
    root.style.setProperty("--ah-color-primary", page.primary);
    const meta = document.createElement("meta");
    meta.name = "theme-color";
    meta.content = page.background;
    document.head.append(meta);

    const { unmount } = render(
      <BrandingProvider branding={autoCanic()}>
        <BrandingName />
      </BrandingProvider>,
    );
    expect(root.dataset.scheme).toBe("dark");
    expect(meta.content).not.toBe(page.background);
    unmount();
    expect(root.dataset.scheme).toBe("light");
    expect(root.style.getPropertyValue("--ah-color-primary")).toBe(page.primary);
    expect(document.head.querySelector('meta[name="theme-color"]')).toHaveAttribute(
      "content",
      page.background,
    );

    // A page that had none: the provider's own scheme and meta go with it.
    meta.remove();
    delete root.dataset.scheme;
    root.style.removeProperty("--ah-color-primary");
    const second = render(
      <BrandingProvider branding={autoCanic()}>
        <BrandingName />
      </BrandingProvider>,
    );
    second.unmount();
    expect(root.dataset.scheme).toBeUndefined();
    expect(root.style.getPropertyValue("--ah-color-primary")).toBe("");
    expect(document.head.querySelector('meta[name="theme-color"]')).toBeNull();
    scheme.restore();
  });

  it("a preview of `auto` (D19) paints the dark scheme for a dark reader", () => {
    const theme = autoCanic().theme;
    expect(brandingThemeStyle(theme)["--ah-color-background"]).toBe(theme.colors.background);
    expect(brandingThemeStyle(theme, { dark: true })["--ah-color-background"]).toBe(
      "var(--ah-product-dark-background)",
    );
    // A fixed scheme previews as it is.
    const light = { ...theme, mode: "light" as const };
    expect(brandingThemeStyle(light, { dark: true })["--ah-color-background"]).toBe(
      theme.colors.background,
    );
  });
});

/** A reader whose `prefers-color-scheme` the test sets, and changes (R-02-08). */
function colorScheme(dark: boolean) {
  const listeners = new Set<(event: MediaQueryListEvent) => void>();
  const query = {
    addEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => {
      listeners.add(listener);
    },
    matches: dark,
    media: "(prefers-color-scheme: dark)",
    removeEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => {
      listeners.delete(listener);
    },
  };
  // jsdom has no `matchMedia`: the stub is defined for the test and removed after it.
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: () => query as unknown as MediaQueryList,
  });
  return {
    restore: () => {
      Reflect.deleteProperty(window, "matchMedia");
    },
    set: (next: boolean) => {
      query.matches = next;
      for (const listener of listeners) listener({ matches: next } as MediaQueryListEvent);
    },
  };
}

describe("E11-W02 (INC-41): theme mode `auto` follows the reader's prefers-color-scheme (S02 R-02-08)", () => {
  const minimal = (): Branding => ({
    ...(minimFixture as unknown as Branding),
    theme: { ...(minimFixture as unknown as Branding).theme, mode: "auto" },
  });
  const style = (token: string) => document.documentElement.style.getPropertyValue(token);

  it("a light reader gets the club's palette; a dark reader the product's dark surfaces and text, with the club's accent", () => {
    const scheme = colorScheme(false);
    const branding = minimal();
    const { unmount } = render(
      <BrandingProvider branding={branding}>
        <BrandingName />
      </BrandingProvider>,
    );
    expect(document.documentElement.dataset.theme).toBe("auto");
    expect(document.documentElement.style.colorScheme).toBe("light");
    expect(style("--ah-color-background")).toBe(branding.theme.colors.background);
    expect(style("--ah-color-text")).toBe(branding.theme.colors.text);

    act(() => {
      scheme.set(true);
    });
    expect(document.documentElement.style.colorScheme).toBe("dark");
    // The scheme the page paints, for the scheme-dependent tokens (`--ah-tint-text-share`).
    expect(document.documentElement.dataset.scheme).toBe("dark");
    expect(style("--ah-color-background")).toBe("var(--ah-product-dark-background)");
    expect(style("--ah-color-surface")).toBe("var(--ah-product-dark-surface)");
    expect(style("--ah-color-surface-2")).toBe("var(--ah-product-dark-surface-alt)");
    expect(style("--ah-color-text")).toBe("var(--ah-product-dark-text)");
    expect(style("--ah-color-text-muted")).toBe("var(--ah-product-dark-text-muted)");
    expect(style("--ah-color-border")).toBe("var(--ah-product-dark-border)");
    // The club's accent stays when nothing says it does not read on the dark background.
    expect(style("--ah-color-primary")).toBe(branding.theme.colors.primary);

    act(() => {
      scheme.set(false);
    });
    expect(style("--ah-color-background")).toBe(branding.theme.colors.background);
    unmount();
    scheme.restore();
  });

  it("a primary that does not read on the dark background (a near-black one, as the product preset's) becomes the product's dark pair", () => {
    const scheme = colorScheme(true);
    const branding = minimal();
    const darkBackground = canicBranding().theme.colors.background;
    const nearBlack = {
      ...branding.theme,
      colors: { ...branding.theme.colors, primary: branding.theme.colors.text },
    };
    const root = document.createElement("div");
    applyBrandingTheme(nearBlack, root, { productDark: () => darkBackground });
    expect(root.style.getPropertyValue("--ah-color-primary")).toBe(
      "var(--ah-product-dark-primary)",
    );
    expect(root.style.getPropertyValue("--ah-color-primary-fg")).toBe(
      "var(--ah-product-dark-on-primary)",
    );
    // The Cànic's orange reads on it: kept.
    const orange = {
      ...branding.theme,
      colors: { ...branding.theme.colors, primary: canicBranding().theme.colors.primary },
    };
    applyBrandingTheme(orange, root, { productDark: () => darkBackground });
    expect(root.style.getPropertyValue("--ah-color-primary")).toBe(orange.colors.primary);
    scheme.restore();
  });

  it("E11-W02 step 6 (Lighthouse themed-omnibox): the page's theme-color is the background it paints", () => {
    const root = document.createElement("div");
    const meta = () => document.head.querySelector('meta[name="theme-color"]');
    applyBrandingTheme(canicBranding().theme, root);
    expect(meta()).toHaveAttribute("content", canicBranding().theme.colors.background);
    const light = minimal().theme;
    applyBrandingTheme({ ...light, mode: "light" }, root);
    expect(meta()).toHaveAttribute("content", light.colors.background);
    expect(document.head.querySelectorAll('meta[name="theme-color"]')).toHaveLength(1);
    // An `auto` club read in the dark: the product's dark background, as painted.
    const darkBackground = canicBranding().theme.colors.background;
    applyBrandingTheme(light, root, { dark: true, productDark: () => darkBackground });
    expect(meta()).toHaveAttribute("content", darkBackground);
  });

  it("the full logo of an `auto` club is the dark one for a dark reader", () => {
    const theme = { ...canicBranding().theme, mode: "auto" as const };
    const dark = colorScheme(true);
    expect(resolveBrandingLogo(theme, { placement: "full" }).src).toBe(theme.logoDarkUrl);
    dark.restore();
    const light = colorScheme(false);
    expect(resolveBrandingLogo(theme, { placement: "full" }).src).toBe(theme.logoUrl);
    light.restore();
  });
});

describe("Internal club presentation", () => {
  it("applies an explicit product name and removes product logos without changing tenant identity or permissions", () => {
    const tenant = canicBranding();
    expect(withProductBrandName(tenant, "Instance club")).toBe(tenant);
    const product = { ...tenant, club: { ...tenant.club, slug: null, name: "Platform" } };
    const renamed = withProductBrandName(product, "  Instance club  ");
    expect(renamed.club.name).toBe("Instance club");
    expect(renamed.club.slug).toBeNull();
    expect(renamed.theme.logoUrl).toBeNull();
    expect(renamed.theme.logoDarkUrl).toBeNull();
    expect(renamed.theme.markUrl).toBeNull();
    expect(renamed.modules).toBe(product.modules);
    expect(renamed.signup).toBe(product.signup);
    expect(product.club.name).toBe("Platform");
    expect(withProductBrandName(product, " ")).toBe(product);
    expect(withProductBrandName(product, undefined)).toBe(product);
  });
});
