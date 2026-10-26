// @vitest-environment jsdom

import { createI18n, LOCALE_STORAGE_KEY } from "@agilityhub/i18n";
import { act, cleanup, render, waitFor } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useAccountLocale } from "./account-locale";
import type { Me } from "./auth-client";
import type { SessionSnapshot } from "./session";

let session: Pick<SessionSnapshot, "me" | "status">;
const branding = { defaultLocale: "ca", locales: ["ca", "es"] };
vi.mock("./session", () => ({ useSession: () => session }));
vi.mock("@agilityhub/ui", () => ({ useBranding: () => branding }));

function account(locale: Me["account"]["locale"], borrowed?: "impersonation" | "support"): Me {
  return {
    account: {
      email: "member@example.test",
      hasPassword: true,
      id: "account-fictional",
      locale,
      name: "Fictional member",
      onboardingPending: false,
      platformRoles: [],
    },
    features: [],
    ...(borrowed === "impersonation"
      ? { impersonation: { actorName: "Fictional actor", memberName: "Fictional member" } }
      : {}),
    ...(borrowed === "support"
      ? { support: { actorName: "Fictional actor", expiresAt: "2099-01-01T00:00:00Z" } }
      : {}),
  };
}

function Observer() {
  useAccountLocale();
  return null;
}

async function mount(locale = "ca") {
  const i18n = await createI18n({ branding, browserLanguages: [locale], storage: undefined });
  const tree = () => (
    <I18nextProvider i18n={i18n}>
      <Observer />
    </I18nextProvider>
  );
  const view = render(tree());
  return {
    i18n,
    refresh: () => {
      view.rerender(tree());
    },
    unmount: view.unmount,
  };
}

beforeEach(() => {
  localStorage.clear();
  session = { me: null, status: "loading" };
});
afterEach(cleanup);

describe("INC-96 session language", () => {
  it("a normal sign-in already using its language does not create a device preference", async () => {
    const view = await mount();
    session = { me: account("ca"), status: "signedIn" };
    view.refresh();
    expect(view.i18n.resolvedLanguage).toBe("ca");
    expect(localStorage.getItem(LOCALE_STORAGE_KEY)).toBeNull();
  });

  it("normal sign-in persists the account language and keeps later explicit choices", async () => {
    localStorage.setItem(LOCALE_STORAGE_KEY, "ca");
    const view = await mount();
    session = { me: account("es"), status: "signedIn" };
    view.refresh();
    await waitFor(() => {
      expect(view.i18n.resolvedLanguage).toBe("es");
    });
    expect(localStorage.getItem(LOCALE_STORAGE_KEY)).toBe("es");
    await act(async () => {
      await view.i18n.changeLanguage("ca");
    });
    view.refresh();
    expect(view.i18n.resolvedLanguage).toBe("ca");
  });

  it.each(["impersonation", "support"] as const)(
    "%s uses the session language temporarily and restores the device language on exit",
    async (kind) => {
      localStorage.setItem(LOCALE_STORAGE_KEY, "es");
      const view = await mount("es");
      session = { me: account("ca", kind), status: "signedIn" };
      view.refresh();
      await waitFor(() => {
        expect(view.i18n.resolvedLanguage).toBe("ca");
      });
      expect(document.documentElement.lang).toBe("ca");
      expect(localStorage.getItem(LOCALE_STORAGE_KEY)).toBe("es");
      session = { me: null, status: "anonymous" };
      view.refresh();
      await waitFor(() => {
        expect(view.i18n.resolvedLanguage).toBe("es");
      });
      expect(localStorage.getItem(LOCALE_STORAGE_KEY)).toBe("es");
    },
  );

  it("restored borrowed sessions apply on mount and never create a device preference", async () => {
    session = { me: account("es", "impersonation"), status: "signedIn" };
    const view = await mount();
    await waitFor(() => {
      expect(view.i18n.resolvedLanguage).toBe("es");
    });
    expect(localStorage.getItem(LOCALE_STORAGE_KEY)).toBeNull();
    view.unmount();
    await waitFor(() => {
      expect(view.i18n.resolvedLanguage).toBe("ca");
    });
    expect(localStorage.getItem(LOCALE_STORAGE_KEY)).toBeNull();
  });

  it("changing borrowed targets preserves the original actor language for expiry", async () => {
    const view = await mount("es");
    session = { me: account("ca", "impersonation"), status: "signedIn" };
    view.refresh();
    await waitFor(() => {
      expect(view.i18n.resolvedLanguage).toBe("ca");
    });
    session = { me: account("es", "support"), status: "signedIn" };
    view.refresh();
    await waitFor(() => {
      expect(view.i18n.resolvedLanguage).toBe("es");
    });
    session = { me: null, status: "impersonationExpired" };
    view.refresh();
    expect(view.i18n.resolvedLanguage).toBe("es");
    expect(localStorage.getItem(LOCALE_STORAGE_KEY)).toBeNull();
  });

  it("returning to a normal account uses its locale and retains normal persistence", async () => {
    const view = await mount("es");
    session = { me: account("ca", "impersonation"), status: "signedIn" };
    view.refresh();
    await waitFor(() => {
      expect(view.i18n.resolvedLanguage).toBe("ca");
    });
    session = { me: account("es"), status: "signedIn" };
    view.refresh();
    await waitFor(() => {
      expect(view.i18n.resolvedLanguage).toBe("es");
    });
    expect(localStorage.getItem(LOCALE_STORAGE_KEY)).toBe("es");
  });

  it("normal accounts still respect the club's enabled languages", async () => {
    const view = await mount();
    session = { me: account("en"), status: "signedIn" };
    view.refresh();
    expect(view.i18n.resolvedLanguage).toBe("ca");
    expect(localStorage.getItem(LOCALE_STORAGE_KEY)).toBeNull();
  });

  it.each(["impersonation", "support"] as const)(
    "%s follows the JWT account's supported language even outside the club's selectable preferences",
    async (kind) => {
      const view = await mount();
      session = { me: account("en", kind), status: "signedIn" };
      view.refresh();
      await waitFor(() => {
        expect(view.i18n.resolvedLanguage).toBe("en");
      });
      expect(localStorage.getItem(LOCALE_STORAGE_KEY)).toBeNull();
      session = { me: null, status: "anonymous" };
      view.refresh();
      await waitFor(() => {
        expect(view.i18n.resolvedLanguage).toBe("ca");
      });
    },
  );

  it("a target language that finishes loading after exit cannot replace the restored actor language", async () => {
    const view = await mount("es");
    let release!: () => void;
    const loading = new Promise<void>((resolve) => {
      release = resolve;
    });
    const load = vi.spyOn(view.i18n, "loadLanguages").mockReturnValueOnce(loading);
    session = { me: account("ca", "impersonation"), status: "signedIn" };
    view.refresh();
    expect(load).toHaveBeenCalledWith("ca");
    session = { me: null, status: "anonymous" };
    view.refresh();
    await act(async () => {
      release();
      await loading;
    });
    expect(view.i18n.resolvedLanguage).toBe("es");
    expect(localStorage.getItem(LOCALE_STORAGE_KEY)).toBeNull();
  });
});
