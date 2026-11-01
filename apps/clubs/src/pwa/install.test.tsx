import { createClubsI18n } from "@agilityhub/i18n/clubs";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { canic } from "../booking/test-utils";

import { initializeMemberPwa, isMemberPwaOrigin, promptMemberPwa } from "./install";
import { InstallAppCard } from "./InstallAppCard";

let dispose: (() => void) | undefined;

beforeEach(() => {
  vi.stubGlobal("location", new URL("https://members.example.test"));
  vi.stubGlobal("matchMedia", () => ({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
});
afterEach(() => {
  cleanup();
  dispose?.();
  dispose = undefined;
  vi.unstubAllGlobals();
  Reflect.deleteProperty(navigator, "standalone");
  Reflect.deleteProperty(navigator, "userAgent");
});

async function card() {
  const i18n = await createClubsI18n({
    branding: canic,
    browserLanguages: ["ca"],
    initialNamespaces: ["shell"],
  });
  return render(
    <I18nextProvider i18n={i18n}>
      <InstallAppCard />
    </I18nextProvider>,
  );
}

describe("member PWA installation", () => {
  it("requires explicit HTTPS member origin and excludes other hosts and lookalikes", () => {
    expect(isMemberPwaOrigin("https://members.example.test", "https://members.example.test")).toBe(
      true,
    );
    for (const origin of [
      "https://admin.example.test",
      "https://clubs.example.test",
      "https://members.example.test.evil.test",
      "http://members.example.test",
    ]) {
      expect(isMemberPwaOrigin(origin, "https://members.example.test")).toBe(false);
    }
    for (const config of [undefined, "invalid", "https://user:password@members.example.test"]) {
      expect(isMemberPwaOrigin("https://members.example.test", config)).toBe(false);
    }
  });

  it("publishes metadata only when enabled on the configured origin", () => {
    initializeMemberPwa("https://admin.example.test", "Test club");
    initializeMemberPwa("https://members.example.test", undefined);
    expect(document.querySelector('link[rel="manifest"]')).toBeNull();
    dispose = initializeMemberPwa("https://members.example.test", "Test club");
    expect(document.querySelector('link[rel="manifest"]')).toHaveAttribute(
      "href",
      "/pwa/manifest.webmanifest",
    );
    expect(document.querySelector('link[rel="apple-touch-icon"]')).toHaveAttribute(
      "sizes",
      "180x180",
    );
    dispose();
    expect(document.querySelector('link[rel="manifest"]')).toBeNull();
  });

  it("captures an early prompt, offers it once, and hides the card after installation", async () => {
    dispose = initializeMemberPwa("https://members.example.test", "Test club");
    const event = new Event("beforeinstallprompt", { cancelable: true });
    const prompt = vi.fn().mockResolvedValue({ outcome: "accepted" });
    Object.assign(event, { prompt });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    await card();
    fireEvent.click(screen.getByRole("button", { name: "Instal·la" }));
    expect(prompt).toHaveBeenCalledOnce();
    expect(await promptMemberPwa()).toBe(false);
    act(() => {
      window.dispatchEvent(new Event("appinstalled"));
    });
    expect(screen.queryByText("Instal·la l’aplicació")).toBeNull();
  });

  it("shows iPhone instructions without a native prompt", async () => {
    Object.defineProperty(navigator, "userAgent", { configurable: true, value: "iPhone Safari" });
    dispose = initializeMemberPwa("https://members.example.test", "Test club");
    await card();
    fireEvent.click(screen.getByRole("button", { name: "Com instal·lar-la" }));
    expect(screen.getByRole("status")).toHaveTextContent("Afegeix a la pantalla d’inici");
  });

  it("hides installation in standalone iOS and when disabled", async () => {
    await card();
    expect(screen.queryByRole("button")).toBeNull();
    Object.defineProperty(navigator, "standalone", { configurable: true, value: true });
    act(() => {
      dispose = initializeMemberPwa("https://members.example.test", "Test club");
    });
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("handles rejected installation without an unhandled rejection", async () => {
    dispose = initializeMemberPwa("https://members.example.test", "Test club");
    const event = new Event("beforeinstallprompt");
    Object.assign(event, { prompt: vi.fn().mockRejectedValue(new Error("Dismissed")) });
    window.dispatchEvent(event);
    expect(await promptMemberPwa()).toBe(false);
    expect(await promptMemberPwa()).toBe(false);
  });
});
