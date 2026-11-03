import { createContext, type ReactNode, useContext, useEffect, useState } from "react";

import {
  type Branding,
  BrandingProvider,
  type BrandingThemeColors,
  prefersDarkScheme,
  type ThemeMode,
} from "./branding";

export type Appearance = ThemeMode | "club";
const valid = (value: string | null): value is Appearance =>
  value === "club" || value === "light" || value === "dark" || value === "auto";
const storageKey = (branding: Branding) =>
  `agilityhub.appearance:${branding.club.slug ?? "product"}`;

export function readAppearance(branding: Branding): Appearance {
  try {
    const value = localStorage.getItem(storageKey(branding));
    return valid(value) ? value : "club";
  } catch {
    return "club";
  }
}

/** User preference never changes the club's stored branding or another club's appearance. */
export function withAppearance(
  branding: Branding,
  preference: Appearance = readAppearance(branding),
  dark = prefersDarkScheme(),
): Branding {
  if (preference === "club") return branding;
  const mode = preference === "auto" ? (dark ? "dark" : "light") : preference;
  if (mode === branding.theme.mode || (mode === "light" && branding.theme.mode === "auto")) {
    return { ...branding, theme: { ...branding.theme, mode } };
  }
  const token = (name: string) => `var(--ah-product-${mode}-${name})`;
  const neutral: Partial<BrandingThemeColors> = {
    background: token("background"),
    border: token("border"),
    surface: token("surface"),
    surfaceAlt: token("surface-alt"),
    text: token("text"),
    textMuted: token("text-muted"),
    // Preserve the club's accent hue while making text/controls readable in the other scheme.
    primary: `color-mix(in srgb, ${branding.theme.colors.primary} 65%, ${token("text")})`,
    onPrimary: token("background"),
  };
  return {
    ...branding,
    theme: { ...branding.theme, mode, colors: { ...branding.theme.colors, ...neutral } },
  };
}

function compactLayout() {
  return (window as Partial<Window>).matchMedia?.("(max-width: 767px)");
}

function textSizeKey(clubKey: string, layout = compactLayout()) {
  return clubKey + (layout?.matches ? ":text:mobile" : ":text:desktop");
}

function readLargeText(key: string) {
  try {
    return localStorage.getItem(key) === "large";
  } catch {
    return false;
  }
}

const AppearanceContext = createContext<
  | {
      largeText: boolean;
      setLargeText: (large: boolean) => void;
      value: Appearance;
      change: (value: Appearance) => void;
    }
  | undefined
>(undefined);

function AppearanceState({ branding, children }: { branding: Branding; children: ReactNode }) {
  const [preference, setPreference] = useState(() => readAppearance(branding));
  const [dark, setDark] = useState(prefersDarkScheme);
  const key = storageKey(branding);
  const [largeText, setLargeText] = useState(() => readLargeText(textSizeKey(key)));
  useEffect(() => {
    const layout = compactLayout();
    const refresh = () => {
      setLargeText(readLargeText(textSizeKey(key, layout)));
    };
    layout?.addEventListener("change", refresh);
    const stored = (event: StorageEvent) => {
      if (event.key === null || event.key === textSizeKey(key, layout)) refresh();
    };
    window.addEventListener("storage", stored);
    return () => {
      layout?.removeEventListener("change", refresh);
      window.removeEventListener("storage", stored);
    };
  }, [key]);
  useEffect(() => {
    document.documentElement.classList.toggle("ah-large-text", largeText);
    return () => {
      document.documentElement.classList.remove("ah-large-text");
    };
  }, [largeText]);
  const changeText = (large: boolean) => {
    setLargeText(large);
    try {
      localStorage.setItem(textSizeKey(key), large ? "large" : "normal");
    } catch {
      /* The preference still applies to this view. */
    }
  };
  useEffect(() => {
    const match = (window as Partial<Window>).matchMedia;
    const query =
      typeof match === "function" ? match.call(window, "(prefers-color-scheme: dark)") : undefined;
    const changed = (event: MediaQueryListEvent) => {
      setDark(event.matches);
    };
    const stored = (event: StorageEvent) => {
      if (event.key === key || event.key === null) setPreference(readAppearance(branding));
    };
    query?.addEventListener("change", changed);
    window.addEventListener("storage", stored);
    return () => {
      query?.removeEventListener("change", changed);
      window.removeEventListener("storage", stored);
    };
  }, [branding, key]);
  const change = (value: Appearance) => {
    setPreference(value);
    try {
      localStorage.setItem(key, value);
    } catch {
      /* Private browsing can disable storage. */
    }
  };
  return (
    <AppearanceContext.Provider
      value={{ value: preference, change, largeText, setLargeText: changeText }}
    >
      <BrandingProvider branding={withAppearance(branding, preference, dark)}>
        {children}
      </BrandingProvider>
    </AppearanceContext.Provider>
  );
}

export function AppearanceSelector({
  labels,
}: {
  labels: { label: string; club: string; light: string; dark: string; auto: string };
}) {
  const context = useContext(AppearanceContext);
  if (context === undefined) return null;
  return (
    <label className="ah-appearance">
      <span className="ah-sr-only">{labels.label}</span>
      <select
        value={context.value}
        onChange={(event) => {
          if (valid(event.target.value)) context.change(event.target.value);
        }}
      >
        <option value="club">{labels.club}</option>
        <option value="light">{labels.light}</option>
        <option value="dark">{labels.dark}</option>
        <option value="auto">{labels.auto}</option>
      </select>
    </label>
  );
}

export function TextSizeSelector({
  label,
  normal,
  large,
}: {
  label: string;
  normal: string;
  large: string;
}) {
  const context = useContext(AppearanceContext);
  if (context === undefined) return null;
  return (
    <label className="ah-appearance ah-text-size">
      <span>{label}</span>
      <select
        value={context.largeText ? "large" : "normal"}
        onChange={(event) => {
          context.setLargeText(event.currentTarget.value === "large");
        }}
      >
        <option value="normal">{normal}</option>
        <option value="large">{large}</option>
      </select>
    </label>
  );
}

export function AppearanceProvider(props: { branding: Branding; children: ReactNode }) {
  return <AppearanceState key={storageKey(props.branding)} {...props} />;
}
