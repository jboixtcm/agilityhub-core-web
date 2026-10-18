import { createApiClient } from "@agilityhub/api-client";
import { mockScenario } from "@agilityhub/api-client/mocks";
import brandingCanicFixture from "@agilityhub/api-client/mocks/branding-canic";
import { server } from "@agilityhub/api-client/mocks/server";
import { AuthClient, MemoryRefreshTokenStore, SessionProvider } from "@agilityhub/auth";
import { createClubsI18n } from "@agilityhub/i18n/clubs";
import { type Branding, BrandingProvider } from "@agilityhub/ui";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  onTestFinished,
  vi,
} from "vitest";

import { App } from "./App";
import { navigate } from "./router";

const branding = brandingCanicFixture as Branding;

/** jsdom has no layout: the document's scroll is a number the app writes and the test reads. */
let documentScroll = 0;

beforeAll(() => {
  server.listen({ onUnhandledRequest: "bypass" });
});
beforeEach(() => {
  mockScenario("member");
  documentScroll = 0;
  Object.defineProperty(window, "scrollY", { configurable: true, get: () => documentScroll });
  vi.spyOn(window, "scrollTo").mockImplementation((x?: number | ScrollToOptions, y?: number) => {
    documentScroll = typeof x === "number" ? (y ?? 0) : (x?.top ?? 0);
    window.dispatchEvent(new Event("scroll"));
  });
});
afterEach(() => {
  cleanup();
  server.resetHandlers();
  vi.restoreAllMocks();
});
afterAll(() => {
  server.close();
});

function scrollDocumentTo(top: number) {
  documentScroll = top;
  window.dispatchEvent(new Event("scroll"));
}

async function renderAt(path: string) {
  const client = new AuthClient({
    apiBaseUrl: `${window.location.origin}/api/v1`,
    clientId: "clubs-app",
    identityBaseUrl: window.location.origin,
    mockMode: true,
    mockRefreshTokenStore: new MemoryRefreshTokenStore(),
  });
  await client.login("laura@example.test", "secret-password");
  window.history.pushState(null, "", path);
  const i18n = await createClubsI18n({
    branding,
    browserLanguages: ["ca"],
    initialNamespaces: ["common", "errors", "shell"],
    storage: undefined,
  });
  render(
    <I18nextProvider i18n={i18n}>
      <BrandingProvider branding={branding}>
        <SessionProvider client={client}>
          <App
            apiClient={createApiClient({
              baseUrl: `${window.location.origin}/api/v1`,
              getAccessToken: () => client.getAccessToken(),
              getLocale: () => "ca",
            })}
            authClient={client}
          />
        </SessionProvider>
      </BrandingProvider>
    </I18nextProvider>,
  );
}

describe("E11-W02 round 2 (review #5): the same screen with another query reads it again", () => {
  it("25 opened from «tipus=TRAINING» and then from its plain address shows every type", async () => {
    const reads: string[] = [];
    const listener = ({ request }: { request: Request }) => {
      const url = new URL(request.url);
      if (url.pathname.endsWith("/me/history")) reads.push(url.search);
    };
    server.events.on("request:start", listener);
    await renderAt("/historic?tipus=TRAINING");
    await waitFor(() => {
      expect(reads).toContain("?type=TRAINING");
    });
    act(() => {
      navigate("/historic");
    });
    await waitFor(() => {
      expect(reads.at(-1)).toBe("");
    });
    server.events.removeListener("request:start", listener);
  });
});

describe("E11-W02 round 2 (review #6): the document's scroll on push, Back and a hash", () => {
  it("a tab opens its screen at the top; Back returns to where the reader was", async () => {
    await renderAt("/historic");
    await screen.findByRole("heading", { level: 1, name: "Històric" }, { timeout: 5_000 });
    scrollDocumentTo(420);

    const tabs = screen.getByRole("navigation", { name: "Navegació principal" });
    fireEvent.click(within(tabs).getByRole("link", { name: "Reservar" }));
    await screen.findByRole("heading", { level: 1, name: "Reservar" }, { timeout: 5_000 });
    expect(window.scrollY).toBe(0);

    window.history.back();
    await screen.findByRole("heading", { level: 1, name: "Històric" }, { timeout: 5_000 });
    await waitFor(() => {
      expect(window.scrollY).toBe(420);
    });
  });

  it("«/perfil#avisos» opens 12 at its notices card", async () => {
    const scrolled: Element[] = [];
    // jsdom has no `scrollIntoView`: the test gives the elements one that records the call.
    Element.prototype.scrollIntoView = function scrollIntoView(this: Element) {
      scrolled.push(this);
    };
    onTestFinished(() => {
      Reflect.deleteProperty(Element.prototype, "scrollIntoView");
    });
    await renderAt("/historic");
    await screen.findByRole("heading", { level: 1, name: "Històric" }, { timeout: 5_000 });
    act(() => {
      navigate("/perfil#avisos");
    });
    await waitFor(
      () => {
        expect(scrolled.map((element) => element.id)).toContain("avisos");
      },
      { timeout: 5_000 },
    );
  });
});

describe("E11-W02 round 2 (INC-41): one language selector on 12", () => {
  it("«/perfil» draws as mockup 12, without the shell's header: its «Idioma» card is the only selector", async () => {
    await renderAt("/perfil");
    await screen.findByRole("heading", { level: 1, name: "El meu perfil" }, { timeout: 5_000 });
    const selectors = screen.getAllByRole("combobox", { name: "Idioma" });
    expect(selectors).toHaveLength(1);
    expect(selectors[0]?.closest(".profile-language")).not.toBeNull();
  });
});
