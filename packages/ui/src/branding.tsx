import { createContext, type ReactNode, useContext, useLayoutEffect, useState } from "react";

export type ThemeMode = "auto" | "dark" | "light";

export interface BrandingThemeColors {
  background: string;
  danger: string;
  onPrimary: string;
  primary: string;
  success: string;
  surface: string;
  surfaceAlt: string;
  text: string;
  textMuted: string;
  warning: string;
  border: string;
  info: string;
}

export interface BrandingTheme {
  colors: BrandingThemeColors;
  mode: ThemeMode;
  fontFamily?: string;
  /** `null` when the club has no such asset (the snapshot's `Theme`); read as absent. */
  logoDarkUrl?: string | null;
  logoUrl?: string | null;
  markUrl?: string | null;
  radius?: string;
  ringPalette?: string[];
}

export type BrandingLogoPlacement = "compact" | "full";

export type BrandingLogoAssets =
  | { kind: "full"; showName: false; src: string }
  | { kind: "initial"; showName: true; src: undefined }
  | { kind: "mark"; showName: true; src: string };

/** Normalized public branding data consumed by the design system. */
export interface Branding {
  club: {
    city?: string | null;
    /**
     * The registered office (`ClubSummary.legalAddress`, S02 R-02-02), the public footer's second
     * line; `null` when the club has no street or postal code. The same shape as the snapshot's
     * `LegalAddress | null`: the apps pass the api's branding to `BrandingProvider` as is.
     */
    legalAddress?: { city: string | null; postalCode: string; street: string } | null;
    /** The club's legal name and tax id (`ClubSummary`), for the public footer. */
    legalName?: string | null;
    name: string;
    /** `null` on a product host (`ClubSummary.slug`, S17 §2 «Entrada»), whose branding is the product's. */
    slug: string | null;
    taxId?: string | null;
  };
  countryProfile: unknown;
  currency: string;
  defaultLocale: string;
  legal: {
    privacyPolicyUrl: string;
  };
  locales: string[];
  modules: string[];
  /**
   * The VAPID public key (base64url) web push subscribes with (S11 R-11-07); `null` without the
   * `PUSH` module or a product key.
   */
  pushPublicKey?: string | null;
  signup: {
    enabled: boolean;
  };
  status: string;
  theme: BrandingTheme;
  timeZone: string;
}

/** An explicit instance name replaces only platform-host presentation, never a club's identity. */
export function withProductBrandName(branding: Branding, name: string | undefined): Branding {
  const trimmed = name?.trim();
  if (branding.club.slug !== null || trimmed === undefined || trimmed === "") return branding;
  return {
    ...branding,
    club: { ...branding.club, name: trimmed },
    theme: { ...branding.theme, logoUrl: null, logoDarkUrl: null, markUrl: null },
  };
}

const DARK_SCHEME = "(prefers-color-scheme: dark)";

/** The reader's `matchMedia` for the dark scheme; none without a window (or in jsdom). */
function darkSchemeQuery(): MediaQueryList | undefined {
  if (typeof window === "undefined") return undefined;
  const match = (window as Partial<Window>).matchMedia;
  return typeof match === "function" ? match.call(window, DARK_SCHEME) : undefined;
}

/** The reader asks for a dark scheme (`prefers-color-scheme`). */
export function prefersDarkScheme(): boolean {
  return darkSchemeQuery()?.matches ?? false;
}

/** The scheme a theme paints in: `auto` follows the reader's `prefers-color-scheme` (R-02-08). */
export function resolvedThemeMode(
  theme: Pick<BrandingTheme, "mode">,
  dark: boolean = prefersDarkScheme(),
): "dark" | "light" {
  return theme.mode === "auto" ? (dark ? "dark" : "light") : theme.mode;
}

function nonEmptyAssetUrl(value: string | null | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized === "" ? undefined : normalized;
}

/**
 * Resolves the approved asset and name treatment for compact or full placements. `dark` is the
 * reader's scheme, for an `auto` club's full logo (default: `prefersDarkScheme()` now); a component
 * uses `useBrandingLogo`, which follows the scheme as it changes.
 */
export function resolveBrandingLogo(
  theme: BrandingTheme,
  { dark, placement }: { dark?: boolean; placement: BrandingLogoPlacement },
): BrandingLogoAssets {
  const markUrl = nonEmptyAssetUrl(theme.markUrl);
  if (placement === "compact") {
    return markUrl === undefined
      ? { kind: "initial", showName: true, src: undefined }
      : { kind: "mark", showName: true, src: markUrl };
  }

  const logoUrl = nonEmptyAssetUrl(theme.logoUrl);
  const themedLogoUrl =
    resolvedThemeMode(theme, dark) === "dark"
      ? (nonEmptyAssetUrl(theme.logoDarkUrl) ?? logoUrl)
      : logoUrl;
  if (themedLogoUrl !== undefined) {
    return { kind: "full", showName: false, src: themedLogoUrl };
  }
  return markUrl === undefined
    ? { kind: "initial", showName: true, src: undefined }
    : { kind: "mark", showName: true, src: markUrl };
}

interface BrandingProviderProps {
  branding: Branding;
  children: ReactNode;
}

const BrandingContext = createContext<Branding | undefined>(undefined);
/** The reader's `prefers-color-scheme` as `BrandingProvider` follows it (E11-W02 round 2). */
const DarkSchemeContext = createContext<boolean | undefined>(undefined);

const tokenByColor = {
  background: "--ah-color-background",
  border: "--ah-color-border",
  danger: "--ah-color-danger",
  info: "--ah-color-info",
  onPrimary: "--ah-color-primary-fg",
  primary: "--ah-color-primary",
  success: "--ah-color-success",
  surface: "--ah-color-surface",
  surfaceAlt: "--ah-color-surface-2",
  text: "--ah-color-text",
  textMuted: "--ah-color-text-muted",
  warning: "--ah-color-warning",
} as const satisfies Record<keyof BrandingThemeColors, `--ah-${string}`>;

function colorChannels(color: string): [number, number, number] | undefined {
  const hex = /^#([\da-f]{3}|[\da-f]{6})$/i.exec(color.trim());
  if (hex?.[1] !== undefined) {
    const value =
      hex[1].length === 3
        ? `${hex[1].charAt(0)}${hex[1].charAt(0)}${hex[1].charAt(1)}${hex[1].charAt(1)}${hex[1].charAt(2)}${hex[1].charAt(2)}`
        : hex[1];
    return [0, 2, 4].map((offset) => Number.parseInt(value.slice(offset, offset + 2), 16)) as [
      number,
      number,
      number,
    ];
  }

  const rgb = /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})/i.exec(color.trim());
  if (rgb === null) {
    return undefined;
  }

  return [rgb[1], rgb[2], rgb[3]].map((channel) => Math.min(255, Number(channel))) as [
    number,
    number,
    number,
  ];
}

function relativeLuminance(color: string): number | undefined {
  const channels = colorChannels(color);
  if (channels === undefined) {
    return undefined;
  }

  const [red, green, blue] = channels.map((channel) => {
    const normalized = channel / 255;
    return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];

  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

export function contrastRatio(foreground: string, background: string): number | undefined {
  const foregroundLuminance = relativeLuminance(foreground);
  const backgroundLuminance = relativeLuminance(background);
  if (foregroundLuminance === undefined || backgroundLuminance === undefined) {
    return undefined;
  }

  const lighter = Math.max(foregroundLuminance, backgroundLuminance);
  const darker = Math.min(foregroundLuminance, backgroundLuminance);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * What a dark reader of an `auto` club sees (R-02-08, E11-W02 INC-41): the club has one palette, its
 * light one, so the surfaces and the text are the product's dark ones (`tokens.css`), and the
 * club's accent stays unless it does not read on that background (then the product's dark pair).
 */
const AUTO_DARK_NEUTRALS: Partial<Record<keyof BrandingThemeColors, string>> = {
  background: "var(--ah-product-dark-background)",
  border: "var(--ah-product-dark-border)",
  surface: "var(--ah-product-dark-surface)",
  surfaceAlt: "var(--ah-product-dark-surface-alt)",
  text: "var(--ah-product-dark-text)",
  textMuted: "var(--ah-product-dark-text-muted)",
};

/** A component (text, a fill) reads on its background from 3:1 (WCAG 1.4.11, large text). */
const AUTO_DARK_ACCENT_CONTRAST = 3;

export interface ApplyThemeOptions {
  /** The reader's scheme, for `auto` (default: `prefersDarkScheme()`). */
  dark?: boolean;
  /**
   * The value of a product dark token (`--ah-product-dark-<name>`), to tell whether the club's
   * accent reads on it; `""` when unknown (default: the root's computed style).
   */
  productDark?: (name: string) => string;
}

function computedProductDark(root: HTMLElement): (name: string) => string {
  return (name) =>
    typeof getComputedStyle === "function"
      ? getComputedStyle(root).getPropertyValue(`--ah-product-dark-${name}`).trim()
      : "";
}

function autoDarkColors(
  colors: BrandingThemeColors,
  productDark: (name: string) => string,
): Record<keyof BrandingThemeColors, string> {
  const background = productDark("background");
  const ratio = background === "" ? undefined : contrastRatio(colors.primary, background);
  const accent =
    ratio !== undefined && ratio < AUTO_DARK_ACCENT_CONTRAST
      ? {
          onPrimary: "var(--ah-product-dark-on-primary)",
          primary: "var(--ah-product-dark-primary)",
        }
      : {};
  return { ...colors, ...AUTO_DARK_NEUTRALS, ...accent };
}

function themeProperties(
  theme: BrandingTheme,
  dark = false,
  productDark: (name: string) => string = () => "",
): [string, string][] {
  const colors =
    theme.mode === "auto" && dark ? autoDarkColors(theme.colors, productDark) : theme.colors;
  const properties = Object.entries(colors).flatMap(([key, value]) => {
    const token = tokenByColor[key as keyof BrandingThemeColors];
    return [[token, value] as [string, string]];
  });

  const sans = theme.fontFamily;
  const display = sans;
  if (sans !== undefined) {
    properties.push(["--ah-font-sans", sans]);
  }
  if (display !== undefined) {
    properties.push(["--ah-font-display", display]);
  }
  if (theme.radius !== undefined) {
    properties.push(["--ah-radius-sm", theme.radius], ["--ah-radius-md", theme.radius]);
  }
  theme.ringPalette?.forEach((color, index) => {
    properties.push([`--ah-color-ring-${String(index + 1)}`, color]);
  });

  return properties;
}

/**
 * A theme's `--ah-*` custom properties as an inline style, for a preview that scopes a theme to
 * one element (S17 D19 «Tema»): its descendants read the draft's tokens, the page keeps its own.
 * `dark` previews an `auto` theme as a dark reader sees it (E11-W02 round 2).
 */
export function brandingThemeStyle(
  theme: BrandingTheme,
  { dark = false, productDark }: ApplyThemeOptions = {},
): Record<string, string> {
  const readDark =
    productDark ??
    (typeof document === "undefined" ? () => "" : computedProductDark(document.documentElement));
  return Object.fromEntries(themeProperties(theme, dark, readDark));
}

export function applyBrandingTheme(
  theme: BrandingTheme,
  root: HTMLElement = document.documentElement,
  { dark = prefersDarkScheme(), productDark = computedProductDark(root) }: ApplyThemeOptions = {},
): void {
  const scheme = resolvedThemeMode(theme, dark);
  root.dataset.theme = theme.mode;
  // The scheme the page paints (`auto` resolved): what scheme-dependent tokens key on.
  root.dataset.scheme = scheme;
  // `auto` paints one scheme at a time (R-02-08): the native controls follow the same one.
  root.style.colorScheme = scheme;
  themeProperties(theme, dark, productDark).forEach(([property, value]) => {
    root.style.setProperty(property, value);
  });
  // The browser's own chrome (address bar, PWA splash) takes the background the page paints
  // (E11-W02 step 6, Lighthouse «themed-omnibox»): a dark `auto` reader's is the product's dark one.
  const background =
    theme.mode === "auto" && dark
      ? productDark("background") || theme.colors.background
      : theme.colors.background;
  setThemeColor(background);
}

function setThemeColor(color: string): void {
  if (typeof document === "undefined") return;
  let meta = document.head.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (meta === null) {
    meta = document.createElement("meta");
    meta.name = "theme-color";
    document.head.append(meta);
  }
  meta.content = color;
}

/** The reader's `prefers-color-scheme`, kept up to date (R-02-08: what `auto` follows). */
function useMediaDarkScheme(): boolean {
  const [dark, setDark] = useState(prefersDarkScheme);
  useLayoutEffect(() => {
    const query = darkSchemeQuery();
    if (query === undefined) return undefined;
    const changed = (event: MediaQueryListEvent) => {
      setDark(event.matches);
    };
    query.addEventListener("change", changed);
    return () => {
      query.removeEventListener("change", changed);
    };
  }, []);
  return dark;
}

/**
 * The reader's `prefers-color-scheme`, live: what an `auto` theme paints in (R-02-08). Inside a
 * `BrandingProvider`, the one it follows; outside one, the scheme at render.
 */
export function usePrefersDarkScheme(): boolean {
  return useContext(DarkSchemeContext) ?? prefersDarkScheme();
}

/** The club's logo for a placement, redrawn when an `auto` club's reader changes scheme. */
export function useBrandingLogo(placement: BrandingLogoPlacement): BrandingLogoAssets {
  const { theme } = useBranding();
  return resolveBrandingLogo(theme, { dark: usePrefersDarkScheme(), placement });
}

function setAttribute(element: Element, name: string, value: string | null): void {
  if (value === null) element.removeAttribute(name);
  else element.setAttribute(name, value);
}

export function BrandingProvider({ branding, children }: BrandingProviderProps) {
  const dark = useMediaDarkScheme();
  useLayoutEffect(() => {
    const root = document.documentElement;
    const productDark = computedProductDark(root);
    const properties = themeProperties(branding.theme, dark, productDark);
    const previousTheme = root.getAttribute("data-theme");
    const previousScheme = root.getAttribute("data-scheme");
    const previousColorScheme = root.style.colorScheme;
    const previousValues = new Map(
      properties.map(([property]) => [property, root.style.getPropertyValue(property)]),
    );
    const previousMeta = document.head.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    const previousThemeColor = previousMeta?.getAttribute("content") ?? null;

    applyBrandingTheme(branding.theme, root, { dark, productDark });

    const ratio = contrastRatio(branding.theme.colors.primary, branding.theme.colors.onPrimary);
    if (ratio !== undefined && ratio < 4.5) {
      console.warn(
        `[BrandingProvider] ${branding.club.name}: primary and onPrimary contrast (${ratio.toFixed(2)}:1) is below WCAG AA.`,
      );
    }

    return () => {
      setAttribute(root, "data-theme", previousTheme);
      setAttribute(root, "data-scheme", previousScheme);
      root.style.colorScheme = previousColorScheme;
      // The page's own theme-color back, or none when the provider brought it.
      const meta = document.head.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
      if (previousMeta === null) meta?.remove();
      else setAttribute(previousMeta, "content", previousThemeColor);
      previousValues.forEach((value, property) => {
        if (value === "") {
          root.style.removeProperty(property);
        } else {
          root.style.setProperty(property, value);
        }
      });
    };
  }, [branding, dark]);

  return (
    <BrandingContext.Provider value={branding}>
      <DarkSchemeContext.Provider value={dark}>{children}</DarkSchemeContext.Provider>
    </BrandingContext.Provider>
  );
}

export function useBranding(): Branding {
  const branding = useContext(BrandingContext);
  if (branding === undefined) {
    throw new Error("useBranding must be used inside BrandingProvider");
  }
  return branding;
}
