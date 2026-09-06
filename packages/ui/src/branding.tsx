import { createContext, type ReactNode, useContext, useLayoutEffect } from "react";

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
  logoDarkUrl?: string;
  logoUrl?: string;
  markUrl?: string;
  radius?: string;
  ringPalette?: string[];
}

/** Normalized public branding data consumed by the design system. */
export interface Branding {
  club: {
    name: string;
    slug: string;
  };
  countryProfile: unknown;
  currency: string;
  defaultLocale: string;
  legal: {
    privacyPolicyUrl: string;
  };
  locales: string[];
  modules: string[];
  signup: {
    enabled: boolean;
  };
  status: string;
  theme: BrandingTheme;
  timeZone: string;
}

interface BrandingProviderProps {
  branding: Branding;
  children: ReactNode;
}

const BrandingContext = createContext<Branding | undefined>(undefined);

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

function themeProperties(theme: BrandingTheme): [string, string][] {
  const properties = Object.entries(theme.colors).flatMap(([key, value]) => {
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

export function applyBrandingTheme(
  theme: BrandingTheme,
  root: HTMLElement = document.documentElement,
): void {
  root.dataset.theme = theme.mode;
  root.style.colorScheme = theme.mode === "auto" ? "light dark" : theme.mode;
  themeProperties(theme).forEach(([property, value]) => {
    root.style.setProperty(property, value);
  });
}

export function BrandingProvider({ branding, children }: BrandingProviderProps) {
  useLayoutEffect(() => {
    const root = document.documentElement;
    const properties = themeProperties(branding.theme);
    const previousTheme = root.getAttribute("data-theme");
    const previousColorScheme = root.style.colorScheme;
    const previousValues = new Map(
      properties.map(([property]) => [property, root.style.getPropertyValue(property)]),
    );

    applyBrandingTheme(branding.theme, root);

    const ratio = contrastRatio(branding.theme.colors.primary, branding.theme.colors.onPrimary);
    if (ratio !== undefined && ratio < 4.5) {
      console.warn(
        `[BrandingProvider] ${branding.club.name}: primary and onPrimary contrast (${ratio.toFixed(2)}:1) is below WCAG AA.`,
      );
    }

    return () => {
      if (previousTheme === null) {
        root.removeAttribute("data-theme");
      } else {
        root.setAttribute("data-theme", previousTheme);
      }
      root.style.colorScheme = previousColorScheme;
      previousValues.forEach((value, property) => {
        if (value === "") {
          root.style.removeProperty(property);
        } else {
          root.style.setProperty(property, value);
        }
      });
    };
  }, [branding]);

  return <BrandingContext.Provider value={branding}>{children}</BrandingContext.Provider>;
}

export function useBranding(): Branding {
  const branding = useContext(BrandingContext);
  if (branding === undefined) {
    throw new Error("useBranding must be used inside BrandingProvider");
  }
  return branding;
}
