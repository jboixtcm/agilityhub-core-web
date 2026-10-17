import type { ApiClient } from "@agilityhub/api-client";
import brandingCanicFixture from "@agilityhub/api-client/mocks/branding-canic";
import { AuthClient, MemoryRefreshTokenStore, SessionProvider } from "@agilityhub/auth";
import { createClubsI18n } from "@agilityhub/i18n/clubs";
import { type Branding, BrandingProvider } from "@agilityhub/ui";
import { cleanup, render, screen } from "@testing-library/react";
import { Suspense } from "react";
import { I18nextProvider } from "react-i18next";
import { afterEach, describe, expect, it } from "vitest";

import { BookingCourseLines, RegisterSetupLink, TrainingSetupLines } from "./blocks";

const branding = brandingCanicFixture as Branding;

afterEach(() => {
  cleanup();
});

async function renderInScreen(block: React.ReactNode) {
  // The screen's own namespaces only: `courses` is not loaded yet, as on 07, 08 or 24.
  const i18n = await createClubsI18n({
    branding,
    browserLanguages: ["ca"],
    initialNamespaces: ["common", "shell"],
    storage: undefined,
  });
  const session = new AuthClient({
    apiBaseUrl: `${window.location.origin}/api/v1`,
    clientId: "clubs-app",
    identityBaseUrl: window.location.origin,
    mockMode: true,
    mockRefreshTokenStore: new MemoryRefreshTokenStore(),
  });
  render(
    <I18nextProvider i18n={i18n}>
      <BrandingProvider branding={branding}>
        <SessionProvider client={session}>
          <Suspense fallback={<p>Carregant la pantalla</p>}>
            <h1>La pantalla</h1>
            {block}
          </Suspense>
        </SessionProvider>
      </BrandingProvider>
    </I18nextProvider>,
  );
}

describe("E11-W02 (A38): a course block never suspends the screen it is in", () => {
  it("24's «Registra què hi ha muntat» waits for `courses` on its own, the screen stays shown", async () => {
    await renderInScreen(<RegisterSetupLink ringId="ring-central" ringName="Central" />);
    // Shown at once: the shell's boundary would otherwise hide a screen already on display.
    expect(screen.getByRole("heading", { name: "La pantalla" })).toBeVisible();
    expect(screen.queryByText("Carregant la pantalla")).not.toBeInTheDocument();
    expect(await screen.findByRole("link", { name: /Central/u })).toHaveAttribute(
      "href",
      "/instructor/pistes/ring-central/muntat",
    );
  });

  it("08's setup lines wait for `courses` on their own, the screen stays shown", async () => {
    await renderInScreen(
      <TrainingSetupLines
        rings={[
          {
            id: "ring-central",
            name: "Central",
            setup: {
              builtAt: "2026-08-08T10:00:00Z",
              id: "setup-central",
              kind: "JUMPING",
              levelNames: [],
            },
          } as never,
        ]}
      />,
    );
    expect(screen.getByRole("heading", { name: "La pantalla" })).toBeVisible();
    expect(screen.queryByText("Carregant la pantalla")).not.toBeInTheDocument();
    expect(await screen.findByRole("link", { name: /Central/u })).toHaveAttribute(
      "href",
      "/recorreguts/setup-central",
    );
  });

  it("07's course lines (with [Sessió de muntatge]'s hook) never suspend the booking's detail (E8-W02's checkout return)", async () => {
    // Its reads never answer: only the hooks run, as when 07 has just shown its booking.
    const client = { GET: () => new Promise(() => undefined) } as unknown as ApiClient;
    await renderInScreen(<BookingCourseLines classSessionId="class-1" client={client} />);
    expect(screen.getByRole("heading", { name: "La pantalla" })).toBeVisible();
    expect(screen.queryByText("Carregant la pantalla")).not.toBeInTheDocument();
  });
});
