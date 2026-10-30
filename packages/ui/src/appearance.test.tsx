import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import fixture from "../../api-client/src/mocks/fixtures/branding-canic.json";

import {
  AppearanceProvider,
  AppearanceSelector,
  readAppearance,
  withAppearance,
} from "./appearance";
import { type Branding, useBrandingLogo } from "./branding";

const branding: Branding = { ...fixture, theme: { ...fixture.theme, mode: "dark" } };
const labels = { label: "Appearance", club: "Club", light: "Light", dark: "Dark", auto: "System" };
function Logo() {
  const logo = useBrandingLogo("full");
  return <img alt="Club logo" src={logo.src} />;
}
afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("User appearance", () => {
  it("keeps the club theme by default and persists only this club's preference", () => {
    expect(withAppearance(branding)).toBe(branding);
    const ui = () => (
      <AppearanceProvider branding={branding}>
        <AppearanceSelector labels={labels} />
        <Logo />
      </AppearanceProvider>
    );
    const rendered = render(ui());
    fireEvent.change(screen.getByLabelText("Appearance"), { target: { value: "light" } });
    expect(document.documentElement.dataset.scheme).toBe("light");
    expect(screen.getByAltText("Club logo")).toHaveAttribute("src", branding.theme.logoUrl);
    expect(readAppearance(branding)).toBe("light");
    expect(readAppearance({ ...branding, club: { ...branding.club, slug: "another-club" } })).toBe(
      "club",
    );
    rendered.unmount();
    render(ui());
    expect(screen.getByLabelText("Appearance")).toHaveValue("light");
    fireEvent.change(screen.getByLabelText("Appearance"), { target: { value: "dark" } });
    expect(document.documentElement.dataset.scheme).toBe("dark");
    expect(screen.getByAltText("Club logo")).toHaveAttribute("src", branding.theme.logoDarkUrl);
    expect(branding.theme.mode).toBe("dark");
  });
  it("resolves the system preference and tolerates unavailable storage", () => {
    expect(withAppearance(branding, "auto", false).theme.mode).toBe("light");
    expect(withAppearance(branding, "auto", true).theme.mode).toBe("dark");
    const automatic = { ...branding, theme: { ...branding.theme, mode: "auto" as const } };
    expect(withAppearance(automatic, "auto", true).theme.colors.background).toBe(
      "var(--ah-product-dark-background)",
    );
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("unavailable");
    });
    expect(readAppearance(branding)).toBe("club");
  });
});
