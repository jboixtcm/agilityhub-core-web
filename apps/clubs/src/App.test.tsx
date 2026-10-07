import { createApiClient } from "@agilityhub/api-client";
import {
  handlers,
  mockScenario,
  resetActivityState,
  resetAuthMockState,
  resetMemberBillingState,
  resetMemberSelfServiceState,
  resetOnboardingMockState,
} from "@agilityhub/api-client/mocks";
import brandingCanicFixture from "@agilityhub/api-client/mocks/branding-canic";
import { server } from "@agilityhub/api-client/mocks/server";
import {
  AuthClient,
  createAuthenticatedApiClient,
  IMPERSONATION_STORAGE_KEY,
  MemoryRefreshTokenStore,
  SessionProvider,
} from "@agilityhub/auth";
import { createI18n } from "@agilityhub/i18n";
import { type Branding, BrandingProvider } from "@agilityhub/ui";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { getResponse, http, HttpResponse } from "msw";
import { I18nextProvider } from "react-i18next";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { App, MOBILE_ROUTES, MobileNavigation } from "./App";
import { isCountryFieldValid } from "./SelfServicePages";

const canicBranding: Branding = {
  ...brandingCanicFixture,
  theme: { ...brandingCanicFixture.theme, mode: "dark" },
};
const minimalBranding: Branding = {
  ...canicBranding,
  club: { name: "Club Mínim", slug: "minim" },
  locales: ["ca", "es", "en"],
  modules: ["WAITLIST", "FAQ", "PUSH"],
  signup: { enabled: false },
  theme: {
    colors: canicBranding.theme.colors,
    mode: "light",
  },
};

beforeAll(() => {
  server.listen({ onUnhandledRequest: "error" });
});
beforeEach(() => {
  resetMemberBillingState();
  resetOnboardingMockState();
});
afterEach(() => {
  cleanup();
  server.resetHandlers();
  mockScenario("member");
  resetMemberBillingState();
  resetMemberSelfServiceState();
  resetOnboardingMockState();
});
afterAll(() => {
  server.close();
});

function authClient() {
  return new AuthClient({
    apiBaseUrl: `${window.location.origin}/api/v1`,
    clientId: "clubs-app",
    identityBaseUrl: window.location.origin,
    mockMode: true,
    mockRefreshTokenStore: new MemoryRefreshTokenStore(),
  });
}

async function renderApplication(
  client: AuthClient,
  branding: Branding = canicBranding,
  locale: "ca" | "es" | "en" = "ca",
  navigate?: (path: string, replace: boolean) => void,
) {
  const i18n = await createI18n({
    branding,
    browserLanguages: [locale],
    initialNamespaces: [
      "activities",
      "auth",
      "billing",
      "census",
      "common",
      "enums",
      "errors",
      "inactivity",
      "leave",
      "shell",
      "signup",
    ],
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
              getLocale: () => i18n.resolvedLanguage ?? branding.defaultLocale,
            })}
            authClient={client}
            {...(navigate === undefined ? {} : { navigate })}
          />
        </SessionProvider>
      </BrandingProvider>
    </I18nextProvider>,
  );
}

async function renderNavigation(
  modules: string[],
  roles: ("ADMIN" | "INSTRUCTOR" | "MEMBER")[],
  activeProfile: "ADMIN" | "INSTRUCTOR" | "MEMBER" = "MEMBER",
) {
  const i18n = await createI18n({
    branding: canicBranding,
    browserLanguages: ["ca"],
    initialNamespaces: ["shell"],
    storage: undefined,
  });
  render(
    <I18nextProvider i18n={i18n}>
      <BrandingProvider branding={{ ...canicBranding, modules }}>
        <MobileNavigation
          activeProfile={activeProfile}
          modules={modules}
          pathname="/inici"
          roles={roles}
        />
      </BrandingProvider>
    </I18nextProvider>,
  );
}

describe("T-02-14 clubs shell", () => {
  it("uses the compact mark with the runtime club name", async () => {
    const client = authClient();
    await client.login("laura@example.test", "secret-password");
    // A page with the shell header: since E5-W01 03 draws the mockup's own header (mark,
    // greeting and bell) instead, since E5-W02 08 its «Entrenaments» bar, and since E6-W02 25
    // its «Històric» bar.
    window.history.pushState(null, "", "/perfil");
    await renderApplication(client);

    expect(document.querySelector(".clubs-shell__logo")).toHaveAttribute(
      "src",
      brandingCanicFixture.theme.markUrl,
    );
    expect(document.querySelector(".clubs-shell__logo")).toHaveAttribute("alt", "");
    expect(screen.getByText(brandingCanicFixture.club.name)).toBeVisible();
  });

  it("filters the six-tab mockup navigation by modules and roles", async () => {
    await renderNavigation(["FREE_TRAINING", "FAQ"], ["MEMBER"]);

    expect(screen.getByRole("link", { name: "Inici" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Reservar" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Entrenaments" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Avui" })).toHaveAttribute("href", "/avui");
    expect(screen.queryByRole("link", { name: "Visió global" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Perfil" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Info" })).toBeInTheDocument();
  });

  it("E4-W03 turns the «Avui» slot into «Visió global» for the instructor profile", async () => {
    await renderNavigation(["FREE_TRAINING", "FAQ"], ["INSTRUCTOR"], "INSTRUCTOR");

    expect(screen.getByRole("link", { name: "Visió global" })).toHaveAttribute(
      "href",
      "/instructor/avui",
    );
    expect(screen.queryByRole("link", { name: "Avui" })).not.toBeInTheDocument();
    // E6-W01: the instructor profile's bar is mockups 20–22's four tabs.
    expect(screen.getAllByRole("link").map((link) => link.textContent)).toEqual([
      "El meu dia",
      "Visió global",
      "Alumnes",
      "Perfil",
    ]);
  });

  it("E6-W01 step 1: «El meu dia» and «Alumnes» lead to 20 and the student search; never while impersonating", async () => {
    await renderNavigation(["FREE_TRAINING", "FAQ"], ["INSTRUCTOR"], "INSTRUCTOR");
    expect(screen.getByRole("link", { name: "El meu dia" })).toHaveAttribute(
      "href",
      "/instructor/dia",
    );
    expect(screen.getByRole("link", { name: "Alumnes" })).toHaveAttribute(
      "href",
      "/instructor/alumnes",
    );
    cleanup();

    const i18n = await createI18n({
      branding: canicBranding,
      browserLanguages: ["ca"],
      initialNamespaces: ["shell"],
      storage: undefined,
    });
    render(
      <I18nextProvider i18n={i18n}>
        <BrandingProvider branding={canicBranding}>
          <MobileNavigation
            activeProfile="INSTRUCTOR"
            impersonated
            modules={canicBranding.modules}
            pathname="/inici"
            roles={["INSTRUCTOR"]}
          />
        </BrandingProvider>
      </I18nextProvider>,
    );
    expect(screen.queryByRole("link", { name: "El meu dia" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Alumnes" })).not.toBeInTheDocument();
  });

  it("omits Entrenaments when FREE_TRAINING is disabled", async () => {
    await renderNavigation(["WAITLIST", "FAQ", "PUSH"], ["MEMBER"]);

    expect(screen.queryByRole("link", { name: "Entrenaments" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Info" })).toBeInTheDocument();
  });

  it("registers every mobile route from the frontend plan", () => {
    expect(MOBILE_ROUTES.map((route) => route.path)).toEqual(
      expect.arrayContaining([
        "/entrar",
        "/activacio",
        "/benvinguda",
        "/perfil-acces",
        "/inici",
        "/reservar",
        "/reservar/confirmar",
        "/reserves/:id",
        "/entrenaments",
        "/avui",
        "/notificacions",
        "/perfil",
        "/gossos",
        "/dades",
        "/inactivitat",
        "/baixa",
        "/apuntat-hi/*",
        "/gossos/nou*",
        "/instructor/dia",
        "/instructor/classes/:id",
        "/instructor/alumnes",
        "/instructor/alumnes/:dogId",
        "/instructor/pistes/:ringId/reservar",
        "/instructor/*",
        "/instructor/avui",
        "/historic",
        "/info",
        "/recorreguts/muntat/:ringId",
        "/instructor/pistes/:ringId/muntat",
        "/instructor/muntatge/:sessionId",
        "/estadistiques",
        "/estadistiques/lliga",
      ]),
    );
  });

  it("E8-W02 round 2: receipts, inactivity and leave are MEMBER routes", () => {
    for (const path of ["/rebuts", "/rebuts/:id", "/inactivitat", "/baixa"]) {
      expect(MOBILE_ROUTES.find((route) => route.path === path)?.roles).toEqual(["MEMBER"]);
    }
  });
});

describe("T-01-18 access screen", () => {
  it("uses the exact access actions, focuses an empty email and gates signup", async () => {
    window.history.pushState(null, "", "/entrar");
    const client = authClient();
    const requestMagicLink = vi.spyOn(client, "requestMagicLink");
    await renderApplication(client);

    expect(screen.getByRole("img", { name: "Club Agility Cànic" })).toHaveAttribute(
      "src",
      brandingCanicFixture.theme.logoDarkUrl,
    );
    expect(screen.queryByText("Club Agility Cànic AGILITY")).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText("correu@exemple.cat")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("contrasenya")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "ENTRA" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "Envia'm un enllaç per entrar sense contrasenya",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Has oblidat la contrasenya? Recupera-la" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Encara no hi ets? Apunta-t'hi →" })).toBeVisible();
    // E3-W12 step 5 (S02 R-02-02, Jordi 25-09): the public footer and the registered office below it.
    // The Cànic fixture carries the club's real legal identity, as the seed does (S02 R-02-10).
    expect(screen.getByText("Club Agility Cànic · G63189617 · Cabrera de Mar")).toBeVisible();
    expect(
      screen.getByText("Carrer Sant Pere, 10 · 08392 Sant Andreu de Llavaneres"),
    ).toBeVisible();

    const magicLinkButton = screen.getByRole("button", {
      name: "Envia'm un enllaç per entrar sense contrasenya",
    });
    fireEvent.click(magicLinkButton);
    expect(screen.getByLabelText("Correu electrònic")).toHaveFocus();
    expect(screen.getByRole("alert")).toHaveTextContent("Escriu el teu correu");

    fireEvent.change(screen.getByLabelText("Correu electrònic"), {
      target: { value: "estel.rius@example.test" },
    });
    fireEvent.click(magicLinkButton);
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Si el correu és al club, hi rebràs l'enllaç",
    );
    expect(requestMagicLink).toHaveBeenCalledWith("estel.rius@example.test", "LOGIN");
    fireEvent.click(
      screen.getByRole("button", { name: "Has oblidat la contrasenya? Recupera-la" }),
    );
    await waitFor(() => {
      expect(requestMagicLink).toHaveBeenCalledWith("estel.rius@example.test", "RESET");
    });

    cleanup();
    window.history.pushState(null, "", "/entrar");
    mockScenario("minimal");
    await renderApplication(authClient(), minimalBranding);
    expect(screen.queryByRole("link", { name: /Apunta-t'hi/u })).not.toBeInTheDocument();
    expect(screen.getByText("Club Mínim", { selector: ".auth-logo__name" })).toBeVisible();
    expect(screen.getByRole("contentinfo")).toHaveTextContent("Club Mínim");
    expect(screen.getByRole("contentinfo")).not.toHaveTextContent("·");
  });

  it("shows the Retry-After countdown and disables requests", async () => {
    window.history.pushState(null, "", "/entrar");
    mockScenario("rateLimited");
    await renderApplication(authClient());
    fireEvent.change(screen.getByLabelText("Correu electrònic"), {
      target: { value: "limit@example.test" },
    });
    fireEvent.click(
      screen.getByRole("button", {
        name: "Envia'm un enllaç per entrar sense contrasenya",
      }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Massa intents. Torna-ho a provar d'aquí a 120 s",
    );
    expect(
      screen.getByRole("button", {
        name: "Envia'm un enllaç per entrar sense contrasenya",
      }),
    ).toBeDisabled();
  });
});

describe("T-01-19 activation screen", () => {
  it("renders gender-aware, reset and invalid-link variants", async () => {
    const variants = [
      ["activationFemale", "Benvinguda, Estel!"],
      ["activationMale", "Benvingut, Marc!"],
      ["activationNonBinary", "Benvingut, Àlex!"],
    ] as const;

    for (const [scenario, heading] of variants) {
      mockScenario(scenario);
      window.history.pushState(null, "", "/activacio?token=valid&purpose=LOGIN");
      await renderApplication(authClient());
      expect(await screen.findByRole("heading", { name: heading })).toBeVisible();
      expect(screen.getByRole("button", { name: "CONTINUAR" })).toBeVisible();
      expect(screen.getByText("Compte activat")).toBeVisible();
      expect(
        screen.getByRole("heading", {
          name: "Si vols, tria una contrasenya per a futurs accessos",
        }),
      ).toBeVisible();
      cleanup();
    }

    mockScenario("activationReset");
    window.history.pushState(null, "", "/activacio?token=valid&purpose=RESET");
    await renderApplication(authClient());
    expect(await screen.findByRole("heading", { name: "Ja hi ets" })).toBeVisible();
    expect(screen.queryByText("Compte activat")).not.toBeInTheDocument();
    cleanup();

    mockScenario("invalidMagicLink");
    window.history.pushState(null, "", "/activacio?token=invalid&purpose=LOGIN");
    await renderApplication(authClient());
    expect(
      await screen.findByRole("heading", { name: "Aquest enllaç ja no és vàlid" }),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "Envia-me'n un de nou" })).toBeVisible();
  });
});

describe("T-01-20 profile choice", () => {
  it("shows cards for every available role and sends the remember choice", async () => {
    mockScenario("multiProfile");
    const client = authClient();
    await client.login("estel.rius@example.test", "secret-password");
    const updateProfile = vi
      .spyOn(client, "updateProfile")
      .mockImplementation(() => new Promise<never>(() => undefined));
    window.history.pushState(null, "", "/perfil-acces");
    await renderApplication(client);

    expect(screen.getByRole("button", { name: /Com a alumna/u })).toBeVisible();
    expect(screen.getByRole("button", { name: /Com a instructora/u })).toBeVisible();
    expect(screen.getByRole("button", { name: /Com a administradora/u })).toBeVisible();
    const remember = screen.getByRole("checkbox", { name: "Recorda la meva tria" });
    expect(remember).toBeChecked();
    fireEvent.click(remember);
    fireEvent.click(screen.getByRole("button", { name: /Com a alumna/u }));
    await waitFor(() => {
      expect(updateProfile).toHaveBeenCalledWith("MEMBER", false);
    });
  });
});

describe("E6-W01 round 2 #7 (ruling E71, mockup 20 V6): an instructor lands on 20", () => {
  it("a password login takes an instructor to /instructor/dia and a member-only account to /inici", async () => {
    const cases = [
      ["instructor", "ivet.puig@example.test", "/instructor/dia"],
      ["member", "biel.roca@example.test", "/inici"],
    ] as const;
    for (const [scenario, email, landing] of cases) {
      mockScenario(scenario);
      window.history.pushState(null, "", "/entrar");
      const navigate = vi.fn();
      await renderApplication(authClient(), canicBranding, "ca", navigate);
      fireEvent.change(screen.getByPlaceholderText("correu@exemple.cat"), {
        target: { value: email },
      });
      fireEvent.change(screen.getByPlaceholderText("contrasenya"), {
        target: { value: "secret-password" },
      });
      fireEvent.click(screen.getByRole("button", { name: "ENTRA" }));
      await waitFor(() => {
        expect(navigate).toHaveBeenCalledWith(landing, false);
      });
      expect(navigate).toHaveBeenCalledOnce();
      cleanup();
    }
  });

  it("03b: «Com a instructora» opens 20 and «Com a alumna» keeps 03", async () => {
    const cases = [
      [/Com a instructora/u, "INSTRUCTOR", "/instructor/dia"],
      [/Com a alumna/u, "MEMBER", "/inici"],
    ] as const;
    for (const [choice, profile, landing] of cases) {
      mockScenario("multiProfile");
      const client = authClient();
      await client.login("estel.rius@example.test", "secret-password");
      const updateProfile = vi.spyOn(client, "updateProfile");
      window.history.pushState(null, "", "/perfil-acces");
      const navigate = vi.fn();
      await renderApplication(client, canicBranding, "ca", navigate);
      fireEvent.click(await screen.findByRole("button", { name: choice }));
      await waitFor(() => {
        expect(navigate).toHaveBeenCalledWith(landing, false);
      });
      expect(updateProfile).toHaveBeenCalledWith(profile, true);
      cleanup();
    }
  });
});

describe("T-01-21 profile access rows and impersonation", () => {
  it("renders the mockup rows in order without account sessions or backoffice handoff", async () => {
    mockScenario("multiProfile");
    const client = authClient();
    await client.login("estel.rius@example.test", "secret-password");
    window.history.pushState(null, "", "/perfil");
    await renderApplication(client);

    const account = screen.getByRole("link", { name: /Estel Rius/u });
    expect(account).toHaveAttribute("href", "/dades");
    expect(
      screen.getByText("Toca el teu nom per veure i editar totes les teves dades"),
    ).toBeVisible();
    const dogs = screen.getByRole("link", { name: "Els meus gossos" });
    expect(dogs).toHaveAttribute("href", "/gossos");
    const password = screen.getByRole("button", { name: "Canvia la contrasenya" });
    const profile = screen.getByRole("link", { name: /Canviar de perfil/u });
    const notices = screen.getByRole("heading", { name: "Avisos" });
    // E7-W02: the «Avisos» block reads `GET /me/notification-preferences` first.
    expect(await screen.findByText("Operativa (reserves i canvis que has fet tu)")).toBeVisible();
    const language = document.querySelector(".profile-language");
    if (language === null) {
      throw new TypeError("Expected the profile language row");
    }
    const receipts = screen.getByRole("link", { name: "Rebuts" });
    expect(receipts).toHaveAttribute("href", "/rebuts");
    const inactivity = screen.getByRole("link", {
      name: /^Sol·licitar període d'inactivitat/u,
    });
    expect(inactivity).toHaveAttribute("href", "/inactivitat");
    expect(inactivity.querySelector(".profile-list__copy")).toHaveTextContent(
      "Sol·licitar període d'inactivitatpendent d'aprovació",
    );
    const leave = screen.getByRole("link", { name: "Sol·licitar la baixa" });
    expect(leave).toHaveAttribute("href", "/baixa");
    const logout = screen.getByRole("button", { name: "Tanca la sessió" });
    const orderedRows = [
      account,
      dogs,
      password,
      profile,
      notices,
      language,
      receipts,
      inactivity,
      leave,
      logout,
    ];
    for (const [index, row] of orderedRows.slice(0, -1).entries()) {
      expect(row.compareDocumentPosition(orderedRows[index + 1] as Node)).toBe(
        Node.DOCUMENT_POSITION_FOLLOWING,
      );
    }
    expect(screen.queryByText("Sessions")).not.toBeInTheDocument();
    expect(screen.queryByText("Obre el backoffice")).not.toBeInTheDocument();

    fireEvent.click(password);
    expect(screen.getByRole("dialog", { name: "Canvia la contrasenya" })).toBeVisible();
    expect(screen.queryByLabelText("contrasenya actual")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Tanca" }));

    const languageRow = document.querySelector(".profile-language");
    expect(languageRow).not.toBeNull();
    const locale = within(languageRow as HTMLLabelElement).getByRole("combobox", {
      name: "Idioma",
    });
    expect(within(locale).getByRole("option", { name: "Català" })).toBeInTheDocument();
    expect(within(locale).getByRole("option", { name: "Castellà" })).toBeInTheDocument();
    expect(within(locale).queryByRole("option", { name: "Anglès" })).not.toBeInTheDocument();
  });

  it("keeps the impersonation banner visible from /me", async () => {
    mockScenario("impersonated");
    const client = authClient();
    await client.acceptImpersonation("mock-impersonation-token");
    window.history.pushState(null, "", "/perfil");
    await renderApplication(client);

    expect(screen.getByText("Estàs veient l'app com Laura Serra Vidal")).toBeVisible();
    expect(screen.getByRole("button", { name: "Surt" })).toBeVisible();
  });

  it("E5-W05 step 24: the banner names the member the admin opened (/me impersonation.memberName), not the account, whose name differs in a family group", async () => {
    mockScenario("impersonatedFamily");
    const client = authClient();
    await client.acceptImpersonation("mock-impersonation-token");
    window.history.pushState(null, "", "/perfil");
    await renderApplication(client);

    const banner = document.querySelector(".impersonation-banner");
    expect(banner).toHaveTextContent("Estàs veient l'app com Laura Serra Vidal");
    expect(banner).not.toHaveTextContent("Marta Vidal Roca");
  });
});

/** The grants the page sends to `/oauth2/token`, in order. */
function recordTokenGrants() {
  const grants: string[] = [];
  const listener = ({ request }: { request: Request }) => {
    if (new URL(request.url).pathname !== "/oauth2/token") return;
    void request
      .clone()
      .text()
      .then((body) => {
        grants.push(new URLSearchParams(body).get("grant_type") ?? "");
      });
  };
  server.events.on("request:start", listener);
  return {
    grants,
    stop: () => {
      server.events.removeListener("request:start", listener);
    },
  };
}

describe("T-01-11 E4-W16 steps 1–2 (INC-15, INC-18, E47): «Entra com l'abonat» in the member app", () => {
  afterEach(() => {
    sessionStorage.clear();
    resetAuthMockState();
    window.history.pushState(null, "", "/");
  });

  it("step 1: /entrar?handoff= takes the code out of the address, redeems it once, enters the session without refresh and opens 03 with the banner", async () => {
    const token = recordTokenGrants();
    window.history.pushState(null, "", "/entrar?handoff=mock-impersonation-handoff-1");
    const client = authClient();
    const navigate = vi.fn();
    await renderApplication(client, canicBranding, "ca", navigate);

    expect(screen.getByRole("status")).toHaveTextContent("Validant l'enllaç…");
    expect(window.location.pathname).toBe("/entrar");
    expect(window.location.search).toBe("");
    await waitFor(() => {
      expect(navigate).toHaveBeenCalledWith("/inici", false);
    });
    expect(client.isImpersonated()).toBe(true);
    expect(client.getMe()?.impersonation).toEqual({
      actorName: "Jordi Soler",
      memberName: "Laura Serra Vidal",
    });
    // The provider's restore waited for the code: the admin's own cookie was never read.
    expect(token.grants).toEqual(["urn:agilityhub:grant:handoff"]);

    // The full-page load to /inici (a new client in the same tab) keeps the impersonated session.
    cleanup();
    window.history.pushState(null, "", "/inici");
    await renderApplication(authClient());
    expect(await screen.findByText("Estàs veient l'app com Laura Serra Vidal")).toBeVisible();
    expect(token.grants).toEqual(["urn:agilityhub:grant:handoff"]);
    token.stop();
  });

  it("round 2 #1: a redeemed code whose /me keeps failing shows the error with a retry, never the admin's own session; the retry opens 03 with the banner", async () => {
    const token = recordTokenGrants();
    let unavailable = true;
    server.use(
      http.get("*/api/v1/me", ({ request }) =>
        unavailable && request.headers.get("Authorization") === "Bearer mock-impersonation-token"
          ? HttpResponse.json(
              { code: "INTERNAL_ERROR", details: {}, message: "Unavailable", traceId: "t" },
              { status: 503 },
            )
          : undefined,
      ),
    );
    window.history.pushState(null, "", "/entrar?handoff=mock-impersonation-handoff-1");
    const client = authClient();
    const navigate = vi.fn();
    await renderApplication(client, canicBranding, "ca", navigate);

    // The client retries /me with backoff (woken here by `online`), then the page offers a retry.
    const retry = await waitFor(
      () => {
        const button = screen.queryByRole("button", { name: "Torna-ho a provar" });
        if (button === null) {
          window.dispatchEvent(new Event("online"));
          throw new Error("still retrying");
        }
        return button;
      },
      { timeout: 3000 },
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "No s'ha pogut completar l'accés. Torna-ho a provar.",
    );
    expect(screen.queryByText("Aquest enllaç ja no és vàlid")).toBeNull();
    expect(navigate).not.toHaveBeenCalled();
    expect(client.getMe()).toBeNull();
    expect(client.hasPendingHandoff()).toBe(true);
    expect(token.grants).toEqual(["urn:agilityhub:grant:handoff"]);

    unavailable = false;
    fireEvent.click(retry);
    expect(screen.getByRole("status")).toHaveTextContent("Validant l'enllaç…");
    await waitFor(() => {
      expect(navigate).toHaveBeenCalledWith("/inici", false);
    });
    expect(client.isImpersonated()).toBe(true);

    cleanup();
    window.history.pushState(null, "", "/inici");
    await renderApplication(authClient());
    expect(await screen.findByText("Estàs veient l'app com Laura Serra Vidal")).toBeVisible();
    expect(token.grants).toEqual(["urn:agilityhub:grant:handoff"]);
    token.stop();
  });

  it("step 1: a code already redeemed shows «Aquest enllaç ja no és vàlid» on 01 and opens no impersonated session", async () => {
    await authClient().exchangeHandoff("mock-impersonation-handoff-7");
    sessionStorage.clear();
    window.history.pushState(null, "", "/entrar?handoff=mock-impersonation-handoff-7");
    const client = authClient();
    const navigate = vi.fn();
    await renderApplication(client, canicBranding, "ca", navigate);

    expect(await screen.findByRole("alert")).toHaveTextContent("Aquest enllaç ja no és vàlid");
    expect(screen.getByRole("button", { name: "ENTRA" })).toBeVisible();
    expect(client.isImpersonated()).toBe(false);
    expect(navigate).not.toHaveBeenCalled();
  });

  /** Waits for every `restoreSession()` the provider started on `client`. */
  async function restored(restore: { mock: { results: { value: unknown }[] } }) {
    await Promise.allSettled(restore.mock.results.map(({ value }) => value));
  }

  const HANDOFF_GRANT = "urn:agilityhub:grant:handoff";
  const RETRY_MESSAGE = "No s'ha pogut completar l'accés. Torna-ho a provar.";

  /** `/oauth2/token` answers the handoff grant with `answer` while `failing()`; the rest as usual. */
  function failHandoffGrant(answer: () => Response, failing: () => boolean = () => true) {
    server.use(
      http.post("*/oauth2/token", async ({ request }) => {
        const grant = new URLSearchParams(await request.clone().text()).get("grant_type");
        return grant === HANDOFF_GRANT && failing() ? answer() : undefined;
      }),
    );
  }

  it.each([
    {
      answer: () =>
        HttpResponse.json(
          { code: "HANDOFF_INVALID", details: {}, message: "Handoff invalid", traceId: "t" },
          { status: 400 },
        ),
      message: "Aquest enllaç ja no és vàlid",
      name: "a refused code (400 HANDOFF_INVALID)",
      retry: false,
    },
    {
      answer: () =>
        HttpResponse.json(
          { code: "INTERNAL_ERROR", details: {}, message: "Unavailable", traceId: "t" },
          { status: 503 },
        ),
      message: RETRY_MESSAGE,
      name: "a 5xx",
      retry: true,
    },
    {
      answer: () => HttpResponse.error(),
      message: RETRY_MESSAGE,
      name: "no answer (offline)",
      retry: true,
    },
  ])(
    "E4-W18 step 1 (E47): $name from /oauth2/token leaves the tab ended — never a refresh_token grant with the cookie, also after a reload",
    async ({ answer, message, retry }) => {
      const token = recordTokenGrants();
      failHandoffGrant(answer);
      window.history.pushState(null, "", "/entrar?handoff=mock-impersonation-handoff-3");
      const client = authClient();
      const restore = vi.spyOn(client, "restoreSession");
      const navigate = vi.fn();
      await renderApplication(client, canicBranding, "ca", navigate);

      expect(await screen.findByRole("alert")).toHaveTextContent(message);
      expect(screen.queryAllByRole("button", { name: "Torna-ho a provar" })).toHaveLength(
        retry ? 1 : 0,
      );
      if (retry) expect(screen.queryByText("Aquest enllaç ja no és vàlid")).toBeNull();
      await restored(restore);
      expect(token.grants).toEqual([HANDOFF_GRANT]);
      expect(window.location.search).toBe("");
      expect(client.getMe()).toBeNull();
      expect(client.isImpersonated()).toBe(false);
      expect(navigate).not.toHaveBeenCalled();

      // A reload of the tab (a new client on the same address, the code already gone): still
      // anonymous on 01, and no cookie.
      cleanup();
      expect(window.location.pathname).toBe("/entrar");
      const reloaded = authClient();
      const restoreAfterReload = vi.spyOn(reloaded, "restoreSession");
      await renderApplication(reloaded);
      expect(await screen.findByRole("button", { name: "ENTRA" })).toBeVisible();
      await restored(restoreAfterReload);
      expect(reloaded.getMe()).toBeNull();
      expect(token.grants).toEqual([HANDOFF_GRANT]);
      token.stop();
    },
  );

  it("E4-W18 round 2 #1 (review #1, E47): a tab reloaded while /oauth2/token has not answered the code sends no refresh_token grant, opens no session (not the tab's own cookie) and says «Aquest enllaç ja no és vàlid»", async () => {
    // The tab's refresh cookie: its own session, signed in before the admin's link was opened.
    const cookie = new MemoryRefreshTokenStore();
    const withCookie = () =>
      new AuthClient({
        apiBaseUrl: `${window.location.origin}/api/v1`,
        clientId: "clubs-app",
        identityBaseUrl: window.location.origin,
        mockMode: true,
        mockRefreshTokenStore: cookie,
      });
    await withCookie().login("laura@example.test", "secret-password");
    const token = recordTokenGrants();
    // The handoff grant stays unanswered until the end of the test.
    let answer: (() => void) | undefined;
    const unanswered = new Promise<void>((resolve) => {
      answer = resolve;
    });
    server.use(
      http.post("*/oauth2/token", async ({ request }) => {
        const grant = new URLSearchParams(await request.clone().text()).get("grant_type");
        if (grant !== HANDOFF_GRANT) return undefined;
        await unanswered;
        return HttpResponse.error();
      }),
    );
    window.history.pushState(null, "", "/entrar?handoff=mock-impersonation-handoff-5");
    await renderApplication(withCookie(), canicBranding, "ca", vi.fn());
    expect(screen.getByRole("status")).toHaveTextContent("Validant l'enllaç…");
    await waitFor(() => {
      expect(token.grants).toEqual([HANDOFF_GRANT]);
    });

    // A reload now: a new client in the same tab, with the same cookie; the code already gone.
    cleanup();
    expect(window.location.search).toBe("");
    const reloaded = withCookie();
    const restore = vi.spyOn(reloaded, "restoreSession");
    const navigate = vi.fn();
    await renderApplication(reloaded, canicBranding, "ca", navigate);
    expect(await screen.findByRole("alert")).toHaveTextContent("Aquest enllaç ja no és vàlid");
    expect(screen.getByRole("button", { name: "ENTRA" })).toBeVisible();
    await restored(restore);
    expect(token.grants).toEqual([HANDOFF_GRANT]);
    expect(reloaded.getMe()).toBeNull();
    expect(reloaded.isImpersonated()).toBe(false);
    expect(navigate).not.toHaveBeenCalled();
    expect(sessionStorage.getItem(IMPERSONATION_STORAGE_KEY)).toBe('{"state":"ended"}');
    answer?.();
    token.stop();
  });

  it("E4-W18 round 2 #2: a background recovery that signs in before the retry's listener is attached still opens 03", async () => {
    let failures = 3;
    server.use(
      http.get("*/api/v1/me", ({ request }) => {
        if (request.headers.get("Authorization") !== "Bearer mock-impersonation-token") {
          return undefined;
        }
        if (failures === 0) return undefined;
        failures -= 1;
        return HttpResponse.json(
          { code: "INTERNAL_ERROR", details: {}, message: "Unavailable", traceId: "t" },
          { status: 503 },
        );
      }),
    );
    window.history.pushState(null, "", "/entrar?handoff=mock-impersonation-handoff-6");
    const client = authClient();
    const recovered = new Promise<void>((resolve) => {
      client.addEventListener("signedIn", () => {
        resolve();
      });
    });
    // The page hears of the failed code only after the client's own recovery has signed in.
    const exchange = client.exchangeHandoff.bind(client);
    vi.spyOn(client, "exchangeHandoff").mockImplementation(async (code) => {
      try {
        return await exchange(code);
      } catch (error) {
        await recovered;
        throw error;
      }
    });
    const navigate = vi.fn();
    await renderApplication(client, canicBranding, "ca", navigate);
    await waitFor(
      () => {
        window.dispatchEvent(new Event("online"));
        expect(navigate).toHaveBeenCalledWith("/inici", false);
      },
      { timeout: 3000 },
    );
    expect(client.isImpersonated()).toBe(true);
  });

  it("E4-W18 step 1: after a 5xx the retry sends the same code again (never the cookie) and opens 03 with the banner", async () => {
    const token = recordTokenGrants();
    let failing = true;
    failHandoffGrant(
      () =>
        HttpResponse.json(
          { code: "INTERNAL_ERROR", details: {}, message: "Unavailable", traceId: "t" },
          { status: 503 },
        ),
      () => failing,
    );
    window.history.pushState(null, "", "/entrar?handoff=mock-impersonation-handoff-4");
    const client = authClient();
    const navigate = vi.fn();
    await renderApplication(client, canicBranding, "ca", navigate);

    expect(await screen.findByRole("alert")).toHaveTextContent(RETRY_MESSAGE);
    failing = false;
    fireEvent.click(screen.getByRole("button", { name: "Torna-ho a provar" }));
    await waitFor(() => {
      expect(navigate).toHaveBeenCalledWith("/inici", false);
    });
    expect(client.isImpersonated()).toBe(true);
    expect(token.grants).toEqual([HANDOFF_GRANT, HANDOFF_GRANT]);

    cleanup();
    window.history.pushState(null, "", "/inici");
    await renderApplication(authClient());
    expect(await screen.findByText("Estàs veient l'app com Laura Serra Vidal")).toBeVisible();
    expect(token.grants).toEqual([HANDOFF_GRANT, HANDOFF_GRANT]);
    token.stop();
  });

  it("step 2: a 401 ends the impersonation with «La sessió com l'abonat ha caducat» and a close button, never a refresh — also after a reload of the tab", async () => {
    mockScenario("impersonated");
    const client = authClient();
    await client.acceptImpersonation("mock-impersonation-token");
    window.history.pushState(null, "", "/perfil");
    await renderApplication(client);
    expect(screen.getByText("Estàs veient l'app com Laura Serra Vidal")).toBeVisible();
    const token = recordTokenGrants();

    server.use(
      http.get("*/api/v1/me", () =>
        HttpResponse.json(
          { code: "UNAUTHENTICATED", details: {}, message: "Expired", traceId: "t" },
          { status: 401 },
        ),
      ),
    );
    await expect(
      createAuthenticatedApiClient(client, { baseUrl: `${window.location.origin}/api/v1` }).GET(
        "/me",
      ),
    ).rejects.toMatchObject({ status: 401 });

    expect(
      await screen.findByRole("heading", { name: "La sessió com l'abonat ha caducat" }),
    ).toBeVisible();
    expect(screen.queryByText("Estàs veient l'app com Laura Serra Vidal")).toBeNull();
    const close = vi.spyOn(window, "close").mockImplementation(() => undefined);
    fireEvent.click(screen.getByRole("button", { name: "Tanca" }));
    expect(close).toHaveBeenCalledOnce();

    cleanup();
    window.history.pushState(null, "", "/inici");
    await renderApplication(authClient());
    expect(
      await screen.findByRole("heading", { name: "La sessió com l'abonat ha caducat" }),
    ).toBeVisible();
    expect(token.grants).toEqual([]);
    token.stop();
    close.mockRestore();
  });
});

describe("T-01-19 E4-W16 step 10 (INC-24, E49): password recovery after a RESET link", () => {
  afterEach(() => {
    resetAuthMockState();
    window.history.pushState(null, "", "/");
  });

  function recordPasswordBodies() {
    const bodies: unknown[] = [];
    const listener = ({ request }: { request: Request }) => {
      if (request.method === "PUT" && new URL(request.url).pathname === "/api/v1/me/password") {
        void request
          .clone()
          .json()
          .then((body: unknown) => {
            bodies.push(body);
          });
      }
    };
    server.events.on("request:start", listener);
    return {
      bodies,
      stop: () => {
        server.events.removeListener("request:start", listener);
      },
    };
  }

  function submitNewPassword(value: string) {
    fireEvent.change(screen.getByLabelText("nova contrasenya"), { target: { value } });
    fireEvent.change(screen.getByLabelText("repeteix-la"), { target: { value } });
    fireEvent.click(screen.getByRole("button", { name: "DESA LA CONTRASENYA" }));
  }

  it("the reset screen sends {new, repeat} without `current` once; a second use says the link was used and offers «Recupera-la»", async () => {
    mockScenario("activationReset");
    const password = recordPasswordBodies();
    window.history.pushState(null, "", "/activacio?token=reset-link&purpose=RESET");
    await renderApplication(authClient());

    expect(await screen.findByRole("heading", { name: "Ja hi ets" })).toBeVisible();
    expect(screen.queryByLabelText("contrasenya actual")).not.toBeInTheDocument();
    submitNewPassword("duna2026!");
    expect(await screen.findByText("Contrasenya desada")).toBeVisible();
    await waitFor(() => {
      expect(password.bodies).toEqual([{ new: "duna2026!", repeat: "duna2026!" }]);
    });

    submitNewPassword("rock2026!");
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "L'enllaç ja s'ha fet servir: demana'n un altre",
    );
    expect(screen.getByRole("link", { name: "Recupera-la" })).toHaveAttribute("href", "/entrar");
    password.stop();
  });

  it("the session of a LOGIN link still needs `current` for an account with a password (the mock refuses it like the api)", async () => {
    mockScenario("member");
    const client = authClient();
    await client.exchangeMagicLink("login-link");

    await expect(
      client.updatePassword({ new: "duna2026!", repeat: "duna2026!" }),
    ).rejects.toMatchObject({
      code: "INVALID_CREDENTIALS",
      status: 401,
    });
  });
});

describe("E4-W16 step 12 member-app fixes", () => {
  it("(b) «Canviar de perfil · {perfil}» follows the membership's gender (ICU select, as 03b)", async () => {
    mockScenario("multiProfile");
    const client = authClient();
    await client.login("estel.rius@example.test", "secret-password");
    window.history.pushState(null, "", "/perfil");
    await renderApplication(client);
    expect(screen.getByRole("link", { name: /Canviar de perfil/u })).toHaveTextContent("alumna");

    cleanup();
    const me = client.getMe();
    if (me?.membership === undefined) throw new TypeError("Expected the membership");
    server.use(
      http.get("*/api/v1/me", () =>
        HttpResponse.json({ ...me, membership: { ...me.membership, gender: "MALE" } }),
      ),
    );
    const male = authClient();
    await male.login("marc.puig@example.test", "secret-password");
    await renderApplication(male);
    const row = screen.getByRole("link", { name: /Canviar de perfil/u });
    expect(row).toHaveTextContent("alumne");
    expect(row).not.toHaveTextContent("alumna");
  });

  it("(c) the onboarding offers only the club's languages and starts on the club's default when the account's is not offered", async () => {
    mockScenario("onboarding");
    server.use(
      http.get("*/api/v1/me/onboarding", () =>
        HttpResponse.json({
          fields: [
            { key: "name", required: true, value: "Biel Roca" },
            { key: "locale", required: true, value: "en" },
          ],
          pending: true,
          postponeRemaining: 0,
          requiredConsent: {
            policy: "PLATFORM",
            url: "https://club.example.test/legal/privacy",
            version: "2026-09-01",
          },
        }),
      ),
    );
    const client = authClient();
    await client.login("biel.roca@example.test", "secret-password");
    window.history.pushState(null, "", "/benvinguda");
    await renderApplication(client);

    const locale = await screen.findByRole("combobox", { name: "Idioma (obligatori)" });
    expect(
      within(locale)
        .getAllByRole("option")
        .map((option) => option.textContent),
    ).toEqual(["Català", "Castellà"]);
    expect(locale).toHaveValue("ca");
  });
});

describe("T-07-30 E4-W08 S07 §6 /activitats/:id is for MEMBER and impersonated sessions (AGENTS rule 3)", () => {
  const TOURNAMENT_PATH = "/activitats/activity-torneig-estiu-2026";

  function recordMeActivities() {
    const paths: string[] = [];
    const listener = ({ request }: { request: Request }) => {
      const path = new URL(request.url).pathname;
      if (path.includes("/me/activities")) paths.push(path);
    };
    server.events.on("request:start", listener);
    return {
      paths,
      stop: () => {
        server.events.removeListener("request:start", listener);
      },
    };
  }

  beforeEach(() => {
    vi.useFakeTimers({
      now: new Date("2026-08-04T08:00:00Z"),
      shouldAdvanceTime: true,
      toFake: ["Date"],
    });
    resetActivityState();
  });
  afterEach(() => {
    vi.useRealTimers();
    resetActivityState();
    window.history.pushState(null, "", "/");
  });

  it("an instructor-only session gets the usual no-access path: no detail, no /me/activities call", async () => {
    mockScenario("instructor");
    const requests = recordMeActivities();
    const client = authClient();
    await client.login("ivet.puig@example.test", "secret-password");
    window.history.pushState(null, "", TOURNAMENT_PATH);
    await renderApplication(client);

    expect(await screen.findByRole("link", { name: "Visió global" })).toBeInTheDocument();
    await expect(
      screen.findByRole("heading", { name: "Activitat" }, { timeout: 400 }),
    ).rejects.toThrow();
    expect(screen.queryByRole("heading", { name: "Torneig d'Estiu 2026" })).toBeNull();
    expect(requests.paths).toEqual([]);
    requests.stop();
  });

  it("a member session opens the detail", async () => {
    mockScenario("member");
    const client = authClient();
    await client.login("biel.roca@example.test", "secret-password");
    window.history.pushState(null, "", TOURNAMENT_PATH);
    await renderApplication(client);

    expect(await screen.findByRole("heading", { name: "Torneig d'Estiu 2026" })).toBeVisible();
    fireEvent.click(await screen.findByRole("button", { name: "ANUL·LA LA INSCRIPCIÓ" }));
    const dialog = await screen.findByRole("dialog", {
      name: "Vols anul·lar la inscripció a Torneig d'Estiu 2026?",
    });
    expect(within(dialog).queryByLabelText("Motiu")).toBeNull();
  });

  it("an impersonated session opens the detail and its cancellation asks for «Motiu»", async () => {
    mockScenario("impersonated");
    await createApiClient({ baseUrl: `${window.location.origin}/api/v1` }).POST(
      "/activity-registrations",
      {
        body: { activityId: "activity-torneig-estiu-2026" },
        params: { header: { "Idempotency-Key": crypto.randomUUID() } },
      },
    );
    const client = authClient();
    await client.acceptImpersonation("mock-impersonation-token");
    window.history.pushState(null, "", TOURNAMENT_PATH);
    await renderApplication(client);

    expect(await screen.findByRole("heading", { name: "Torneig d'Estiu 2026" })).toBeVisible();
    fireEvent.click(await screen.findByRole("button", { name: "ANUL·LA LA INSCRIPCIÓ" }));
    const dialog = await screen.findByRole("dialog", {
      name: "Vols anul·lar la inscripció a Torneig d'Estiu 2026?",
    });
    expect(within(dialog).getByLabelText("Motiu")).toBeRequired();
  });
});

describe("T-01-26 imported-account onboarding and policy re-consent", () => {
  it("renders configured fields and sends consent, profile data and image choice", async () => {
    mockScenario("onboarding");
    const client = authClient();
    await client.login("biel.roca@example.test", "secret-password");
    const complete = vi
      .spyOn(client, "completeOnboarding")
      .mockImplementation(() => new Promise<never>(() => undefined));
    window.history.pushState(null, "", "/benvinguda");
    await renderApplication(client);

    expect(await screen.findByRole("heading", { name: "Completa el teu perfil" })).toBeVisible();
    expect(screen.getByLabelText("Nom (obligatori)")).toHaveValue("Biel Roca");
    const locale = screen.getByRole("combobox", { name: "Idioma (obligatori)" });
    // E4-W16 step 12c (ADR-011): only the club's languages (the Cànic offers ca and es).
    expect(
      within(locale)
        .getAllByRole("option")
        .map((option) => option.textContent),
    ).toEqual(["Català", "Castellà"]);
    expect(screen.getByLabelText("Telèfon")).toHaveValue("");
    expect(screen.getByRole("link", { name: "la política de privacitat" })).toHaveAttribute(
      "href",
      "https://club.example.test/legal/privacy",
    );

    fireEvent.change(screen.getByLabelText("Nom (obligatori)"), {
      target: { value: "Biel Roca Soler" },
    });
    fireEvent.change(locale, { target: { value: "es" } });
    fireEvent.change(screen.getByLabelText("Telèfon"), { target: { value: "+34600111222" } });
    fireEvent.click(screen.getByRole("checkbox", { name: "Autoritzo l'ús de la meva imatge" }));
    fireEvent.click(
      screen.getByRole("checkbox", {
        name: "He llegit i accepto la política de privacitat",
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "CONTINUA" }));

    await waitFor(() => {
      expect(complete).toHaveBeenCalledWith({
        consentAccepted: true,
        consentVersion: "2026-09-01",
        fields: { locale: "es", name: "Biel Roca Soler", phone: "+34600111222" },
        imageConsent: true,
      });
    });
  });

  it("redirects blocking onboarding and permits a policy postponement", async () => {
    mockScenario("onboarding");
    const blockingClient = authClient();
    await blockingClient.login("biel.roca@example.test", "secret-password");
    const navigate = vi.fn();
    window.history.pushState(null, "", "/perfil");
    await renderApplication(blockingClient, canicBranding, "ca", navigate);

    await waitFor(() => {
      expect(navigate).toHaveBeenCalledWith("/benvinguda", true);
    });
    expect(screen.queryByRole("heading", { name: "El meu perfil" })).not.toBeInTheDocument();

    cleanup();
    resetOnboardingMockState();
    mockScenario("policyReconsent");
    const policyClient = authClient();
    await policyClient.login("biel.roca@example.test", "secret-password");
    const postpone = vi.spyOn(policyClient, "postponeOnboarding");
    window.history.pushState(null, "", "/perfil");
    await renderApplication(policyClient);

    expect(
      await screen.findByRole("dialog", {
        name: "Hem actualitzat la política de privacitat",
      }),
    ).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Més tard" }));
    await waitFor(() => {
      expect(postpone).toHaveBeenCalledOnce();
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    expect(screen.getByRole("heading", { name: "El meu perfil" })).toBeVisible();
  });

  it("reloads an outdated policy version before accepting it", async () => {
    mockScenario("policyReconsentOutdated");
    const client = authClient();
    await client.login("biel.roca@example.test", "secret-password");
    const complete = vi.spyOn(client, "completeOnboarding");
    window.history.pushState(null, "", "/perfil");
    await renderApplication(client);
    const consent = await screen.findByRole("checkbox", {
      name: "He llegit i accepto la política de privacitat",
    });

    fireEvent.click(consent);
    fireEvent.click(screen.getByRole("button", { name: "CONTINUA" }));
    await waitFor(() => {
      expect(document.querySelector(".onboarding-form__error")).toHaveTextContent(
        "Accepteu la versió actual del consentiment.",
      );
    });
    const refreshedConsent = screen.getByRole("checkbox", {
      name: "He llegit i accepto la política de privacitat",
    });
    expect(refreshedConsent).not.toBeChecked();
    fireEvent.click(refreshedConsent);
    fireEvent.click(screen.getByRole("button", { name: "CONTINUA" }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    expect(complete).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ consentVersion: "2026-09-01" }),
    );
    expect(complete).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ consentVersion: "2026-09-02" }),
    );
  });

  it("renders the screen and pop-up in Catalan, Spanish and English", async () => {
    const copies = {
      ca: ["Completa el teu perfil", "Hem actualitzat la política de privacitat"],
      en: ["Complete your profile", "We have updated the privacy policy"],
      es: ["Completa tu perfil", "Hemos actualizado la política de privacidad"],
    } as const;

    for (const locale of ["ca", "es", "en"] as const) {
      resetOnboardingMockState();
      mockScenario("onboarding");
      const pageClient = authClient();
      await pageClient.login("biel.roca@example.test", "secret-password");
      window.history.pushState(null, "", "/benvinguda");
      await renderApplication(pageClient, minimalBranding, locale);
      expect(await screen.findByRole("heading", { name: copies[locale][0] })).toBeVisible();
      cleanup();

      resetOnboardingMockState();
      mockScenario("policyReconsent");
      const modalClient = authClient();
      await modalClient.login("biel.roca@example.test", "secret-password");
      window.history.pushState(null, "", "/perfil");
      await renderApplication(modalClient, minimalBranding, locale);
      expect(await screen.findByRole("dialog", { name: copies[locale][1] })).toBeVisible();
      cleanup();
    }
  });
});

describe("T-03-40 mobile own dogs", () => {
  it("renders own dogs, saves the note, shows task totals and gates TASKS", async () => {
    const client = authClient();
    await client.login("laura@example.test", "secret-password");
    window.history.pushState(null, "", "/gossos");
    await renderApplication(client);

    expect(await screen.findByRole("heading", { name: "Els meus gossos" })).toBeVisible();
    expect(screen.getByText(/Border collie · femella · 4 anys/u)).toBeVisible();
    expect(screen.getByText("Nivell C")).toBeVisible();
    expect(screen.getByText("Pot entrenar sol")).toBeVisible();
    expect(screen.getByText(/FCAG · llicència 3241 · Iniciació/u)).toBeVisible();
    expect(screen.getByText(/RSCE · llicència 13298 · M · 2 · 2D/u)).toBeVisible();
    expect(
      screen.getByText(
        "El nivell l'assigna el club · Per donar de baixa un dels gossos, comunica-ho al club",
      ),
    ).toBeVisible();

    const note = screen.getAllByLabelText(/Notes als instructors/u)[0] as HTMLTextAreaElement;
    fireEvent.change(note, { target: { value: "Treballarem el balancí amb calma." } });
    fireEvent.click(screen.getAllByRole("button", { name: "DESA" })[0] as HTMLButtonElement);
    expect(await screen.findByRole("status")).toHaveTextContent("Nota de Duna desada");

    expect(screen.getByText("2 pendents · 1 feta")).toBeVisible();
    fireEvent.click(screen.getAllByRole("button", { name: "＋ DOC." })[0] as HTMLButtonElement);
    expect(screen.getByRole("dialog", { name: "Afegeix un document de Duna" })).toBeVisible();
    expect(screen.getByLabelText("Tipus")).toBeVisible();
    expect(screen.getByLabelText("Nom del document")).toBeVisible();
    expect(screen.getByLabelText("Fitxer")).toBeVisible();

    cleanup();
    mockScenario("minimal");
    const minimalClient = authClient();
    await minimalClient.login("laura@example.test", "secret-password");
    window.history.pushState(null, "", "/gossos");
    await renderApplication(minimalClient, minimalBranding);
    await screen.findByRole("heading", { name: "Els meus gossos" });
    expect(screen.queryByText("Notes als instructors", { exact: false })).not.toBeInTheDocument();
    expect(screen.queryByText("Tasques", { exact: true })).not.toBeInTheDocument();
  });

  it("E36 (R-04-25): a dog added from the app shows «pendent de validació» and has no actions", async () => {
    const client = authClient();
    await client.login("laura@example.test", "secret-password");
    // The add-dog submission of 17/19: the api keeps the dog PENDING until the club validates it.
    const submitted = await fetch(`${window.location.origin}/api/v1/me/dogs/signup`, {
      body: JSON.stringify({
        additionalDogOption: "TODAY",
        dog: {
          birthMonth: "2025-03",
          breed: "Mestís",
          chip: "941000012340036",
          name: "Neret",
          sex: "MALE",
        },
        documents: [],
      }),
      headers: {
        Authorization: `Bearer ${client.getAccessToken() ?? ""}`,
        "Content-Type": "application/json",
        "Idempotency-Key": "e36-add-dog",
      },
      method: "POST",
    });
    expect(submitted.status).toBe(201);
    window.history.pushState(null, "", "/gossos");
    await renderApplication(client);

    const card = (await screen.findByRole("heading", { name: "Neret" })).closest<HTMLElement>(
      ".dog-card",
    );
    if (card === null) throw new TypeError("Missing the pending dog card");
    expect(within(card).getByText("pendent de validació")).toBeVisible();
    expect(within(card).getByText(/Mestís · mascle · 1 any/u)).toBeVisible();
    expect(within(card).queryByRole("button")).toBeNull();
    expect(within(card).queryByRole("textbox")).toBeNull();
    expect(card.querySelector("input")).toBeNull();
    expect(within(card).queryByText(/Nivell|Cap document|Tasques/u)).toBeNull();
    // The ACTIVE dogs keep their actions.
    expect(screen.getAllByRole("button", { name: "＋ DOC." })).toHaveLength(2);
    expect(screen.getAllByLabelText(/Notes als instructors/u)).toHaveLength(2);
  });

  it("E4-W16 step 11 (INC-26, R-03-18): the task rows under the counter — pending with a checkbox (live since E6-W04 step 0b) and «dd-mm · instructor», done struck through with «feta el dd-mm», the clip with the attachments, dates in the club's zone", async () => {
    const client = authClient();
    await client.login("laura@example.test", "secret-password");
    const { data } = await createApiClient({
      baseUrl: `${window.location.origin}/api/v1`,
      getAccessToken: () => client.getAccessToken(),
    }).GET("/me/dogs");
    if (data === undefined) throw new TypeError("The mock dogs did not answer");
    // 20:00 UTC on 11-08 is already 12-08 at a club in Auckland (UTC+12): the club's day, never
    // the device's (UTC in CI, Europe/Madrid here).
    server.use(
      http.get("*/api/v1/me/dogs", () =>
        HttpResponse.json({
          ...data,
          dogs: data.dogs.map((dog) =>
            dog.tasks === undefined
              ? dog
              : {
                  ...dog,
                  tasks: {
                    ...dog.tasks,
                    items: dog.tasks.items.map((task) =>
                      task.id === "task-duna-weave"
                        ? { ...task, createdAt: "2026-08-11T20:00:00Z" }
                        : task,
                    ),
                  },
                },
          ),
        }),
      ),
    );
    window.history.pushState(null, "", "/gossos");
    await renderApplication(client, { ...canicBranding, timeZone: "Pacific/Auckland" });

    const card = (await screen.findByRole("heading", { name: "Duna" })).closest<HTMLElement>(
      ".dog-card",
    );
    if (card === null) throw new TypeError("Missing Duna's card");
    const tasks = within(card).getByRole("region", { name: "Tasques" });
    expect(within(tasks).getByText("2 pendents · 1 feta")).toBeVisible();
    const rows = within(tasks).getAllByRole("listitem");
    expect(rows.map((row) => row.textContent)).toEqual([
      "Treballar l'entrada al balancí10-08 · Laura",
      "Revisar l'entrada a l'eslàlom12-08 · Marc · 1 adjunt",
      "Consolidar la sortida quieta20-07 · Laura · feta el 01-08",
    ]);
    const pending = within(tasks).getByRole("checkbox", { name: "Treballar l'entrada al balancí" });
    expect(pending).not.toBeChecked();
    // E6-W04 step 0b: the pending checkbox completes the task now; a done one stays inert.
    expect(pending).not.toHaveAttribute("aria-disabled");
    const done = within(tasks).getByRole("checkbox", { name: "Consolidar la sortida quieta" });
    expect(done).toBeChecked();
    expect(done).toHaveAttribute("aria-disabled", "true");
    // The struck-through row: `.dog-task[data-done] p { text-decoration: line-through }`.
    expect(rows[2]).toHaveAttribute("data-done");
    expect(rows[0]).not.toHaveAttribute("data-done");
    expect(rows[1]?.querySelector("svg use")?.getAttribute("href")).toContain("clip");
    expect(within(tasks).getByRole("link", { name: "Veure l'historial ›" })).toHaveAttribute(
      "href",
      "/historic",
    );
  });

  it("E4-W16 round 2 #5 (R-03-18): the task counter agrees in number with 1 and 2 — ICU plurals in ca, es and en", async () => {
    const expected = {
      ca: ["1 pendent · 2 fetes", "2 pendents · 1 feta"],
      en: ["1 pending · 2 completed", "2 pending · 1 completed"],
      es: ["1 pendiente · 2 hechas", "2 pendientes · 1 hecha"],
    } as const;
    for (const locale of ["ca", "es", "en"] as const) {
      const i18n = await createI18n({
        branding: minimalBranding,
        browserLanguages: [locale],
        initialNamespaces: ["census"],
        storage: undefined,
      });
      expect(i18n.resolvedLanguage).toBe(locale);
      expect([
        i18n.t("census:myDogs.tasksSummary", { completed: 2, open: 1 }),
        i18n.t("census:myDogs.tasksSummary", { completed: 1, open: 2 }),
      ]).toEqual(expected[locale]);
    }
  });

  it("E4-W16 step 6 (INC-22): «＋ DOC.» works again after a first upload, on another dog, with empty fields", async () => {
    const uploads: string[] = [];
    const listener = ({ request }: { request: Request }) => {
      const path = new URL(request.url).pathname;
      if (request.method === "POST" && /^\/api\/v1\/me\/dogs\/[^/]+\/documents$/u.test(path)) {
        uploads.push(path);
      }
    };
    server.events.on("request:start", listener);
    const client = authClient();
    await client.login("laura@example.test", "secret-password");
    window.history.pushState(null, "", "/gossos");
    await renderApplication(client);
    await screen.findByRole("heading", { name: "Els meus gossos" });

    async function upload(dog: "Duna" | "Rock", index: number, name: string) {
      fireEvent.click(
        screen.getAllByRole("button", { name: "＋ DOC." })[index] as HTMLButtonElement,
      );
      const dialog = screen.getByRole("dialog", { name: `Afegeix un document de ${dog}` });
      expect(within(dialog).getByLabelText("Nom del document")).toHaveValue("");
      fireEvent.change(within(dialog).getByLabelText("Nom del document"), {
        target: { value: name },
      });
      fireEvent.change(within(dialog).getByLabelText("Fitxer"), {
        target: { files: [new File(["%PDF"], `${name}.pdf`, { type: "application/pdf" })] },
      });
      const submit = within(dialog).getByRole("button", { name: "PUJA EL DOCUMENT" });
      expect(submit).toBeEnabled();
      const form = submit.closest("form");
      if (form === null) throw new TypeError("No document form");
      fireEvent.submit(form);
      await waitFor(() => {
        expect(screen.queryByRole("dialog")).toBeNull();
      });
    }

    await upload("Duna", 0, "Cartilla Duna");
    expect(await screen.findByText("Document desat")).toBeVisible();
    await upload("Rock", 1, "Assegurança Rock");
    await waitFor(() => {
      expect(uploads).toEqual([
        "/api/v1/me/dogs/dog-duna/documents",
        "/api/v1/me/dogs/31000000-0000-4000-8000-000000000002/documents",
      ]);
    });
    server.events.removeListener("request:start", listener);
  });
});

describe("E6-W04 step 0b: screen 13's task checkbox completes the task (POST /tasks/{id}/completion, S10 R-10-10, §6, ruling E74)", () => {
  /** 14-08-2026 at 10:00 club-local: the day a task completed here is «feta». */
  const NOW = "2026-08-14T10:00:00+02:00";

  interface Completion {
    authorization: string | null;
    body: string;
    key: string | null;
    path: string;
  }

  /** The member app's api calls of this flow: the completions (with their headers) and the reads of 13. */
  function recordFlow() {
    const completions: Completion[] = [];
    const lines: string[] = [];
    server.events.on("request:start", ({ request }) => {
      const url = new URL(request.url);
      if (url.pathname.endsWith("/completion")) {
        lines.push(`${request.method} ${url.pathname}`);
        void request
          .clone()
          .text()
          .then((body) => {
            completions.push({
              authorization: request.headers.get("Authorization"),
              body,
              key: request.headers.get("Idempotency-Key"),
              path: url.pathname,
            });
          });
      } else if (url.pathname === "/api/v1/me/dogs" || url.pathname.startsWith("/api/v1/tasks")) {
        lines.push(`${request.method} ${url.pathname}`);
      }
    });
    return { completions, lines };
  }

  async function dunaTasks(): Promise<HTMLElement> {
    const card = (await screen.findByRole("heading", { name: "Duna" })).closest<HTMLElement>(
      ".dog-card",
    );
    if (card === null) throw new TypeError("Missing Duna's card");
    return within(card).getByRole("region", { name: "Tasques" });
  }

  async function renderMyDogs(impersonated = false) {
    const client = authClient();
    if (impersonated) {
      mockScenario("impersonated");
      await client.acceptImpersonation("mock-impersonation-token");
    } else {
      // The member world (`me-member.json`), whatever the previous test left selected.
      mockScenario("member");
      await client.login("laura@example.test", "secret-password");
    }
    window.history.pushState(null, "", "/gossos");
    await renderApplication(client);
    return dunaTasks();
  }

  beforeEach(() => {
    vi.useFakeTimers({ now: new Date(NOW), shouldAdvanceTime: true, toFake: ["Date"] });
  });
  afterEach(() => {
    server.events.removeAllListeners();
    vi.useRealTimers();
  });

  it("E6-W04 step 0b: a pending task's checkbox sends the completion (no body, no key), is busy meanwhile, then shows the task as the api returns it — checked, struck through, «feta per en Biel el 14-08» — and the counter; GET /me/dogs keeps it done", async () => {
    const { completions, lines } = recordFlow();
    let release: () => void = () => undefined;
    const answered = new Promise<void>((resolve) => {
      release = resolve;
    });
    server.use(
      http.post("*/api/v1/tasks/:id/completion", async () => {
        await answered;
        return undefined;
      }),
    );
    const tasks = await renderMyDogs();
    const pending = within(tasks).getByRole("checkbox", { name: "Treballar l'entrada al balancí" });
    expect(pending).not.toBeChecked();
    expect(pending).not.toHaveAttribute("aria-disabled");
    fireEvent.click(pending);
    await waitFor(() => {
      expect(pending).toHaveAttribute("aria-busy", "true");
    });
    expect(pending).toHaveAttribute("aria-disabled", "true");
    // A second tap while it runs sends nothing more.
    fireEvent.click(pending);
    release();
    await waitFor(() => {
      expect(pending).toBeChecked();
    });
    expect(pending).not.toHaveAttribute("aria-busy");
    // A member cannot reopen it (R-10-10: reopening is staff only).
    expect(pending).toHaveAttribute("aria-disabled", "true");
    const rows = within(tasks).getAllByRole("listitem");
    expect(rows.map((row) => row.textContent)).toEqual([
      "Treballar l'entrada al balancí10-08 · Laura · feta per en Biel el 14-08",
      "Revisar l'entrada a l'eslàlom12-08 · Marc · 1 adjunt",
      "Consolidar la sortida quieta20-07 · Laura · feta el 01-08",
    ]);
    expect(rows[0]).toHaveAttribute("data-done");
    expect(within(tasks).getByText("1 pendent · 2 fetes")).toBeVisible();
    expect(screen.queryByRole("alert")).toBeNull();
    await waitFor(() => {
      expect(completions).toEqual([
        {
          authorization: expect.stringMatching(/^Bearer /u) as string,
          body: "",
          key: null,
          path: "/api/v1/tasks/task-duna-balance/completion",
        },
      ]);
    });
    expect(lines.filter((line) => line.startsWith("POST"))).toHaveLength(1);
    // As the api: 13 read again keeps it done (`GET /me/dogs` has `doneAt`, not who).
    cleanup();
    const again = await renderMyDogs();
    expect(within(again).getByText("1 pendent · 2 fetes")).toBeVisible();
    expect(within(again).getAllByRole("listitem")[0]?.textContent).toBe(
      "Treballar l'entrada al balancí10-08 · Laura · feta el 14-08",
    );
  });

  it("E6-W04 step 0b: 422 TASK_ALREADY_DONE (someone else completed it meanwhile) reads 13 again and shows the task done, with no error", async () => {
    const { lines } = recordFlow();
    const tasks = await renderMyDogs();
    // Another session of the member's completes it after this page was read.
    const other = authClient();
    await other.login("laura@example.test", "secret-password");
    const elsewhere = await createApiClient({
      baseUrl: `${window.location.origin}/api/v1`,
      getAccessToken: () => other.getAccessToken(),
    }).POST("/tasks/{id}/completion", { params: { path: { id: "task-duna-weave" } } });
    expect(elsewhere.response.status).toBe(200);
    lines.length = 0;
    const stale = within(tasks).getByRole("checkbox", { name: "Revisar l'entrada a l'eslàlom" });
    expect(stale).not.toBeChecked();
    fireEvent.click(stale);
    await waitFor(() => {
      expect(stale).toBeChecked();
    });
    expect(lines).toEqual(["POST /api/v1/tasks/task-duna-weave/completion", "GET /api/v1/me/dogs"]);
    expect(within(tasks).getAllByRole("listitem")[1]?.textContent).toBe(
      "Revisar l'entrada a l'eslàlom12-08 · Marc · feta el 14-08 · 1 adjunt",
    );
    expect(within(tasks).getByText("1 pendent · 2 fetes")).toBeVisible();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByText("Aquesta tasca ja està completada.")).toBeNull();
  });

  it("E6-W04 step 0b: any other refusal is said by its code (404 NOT_FOUND: a task deleted meanwhile), a failure with no answer by the generic message, and the task stays pending and can be tried again", async () => {
    let answer: "network" | "notFound" = "notFound";
    server.use(
      http.post("*/api/v1/tasks/:id/completion", () =>
        answer === "network"
          ? HttpResponse.error()
          : HttpResponse.json(
              { code: "NOT_FOUND", details: {}, message: "Task not found", traceId: "t-13" },
              { status: 404 },
            ),
      ),
    );
    const tasks = await renderMyDogs();
    const pending = within(tasks).getByRole("checkbox", { name: "Treballar l'entrada al balancí" });
    fireEvent.click(pending);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "No s'ha trobat l'element sol·licitat.",
    );
    expect(pending).not.toBeChecked();
    expect(pending).not.toHaveAttribute("aria-disabled");
    expect(pending).not.toHaveAttribute("aria-busy");
    expect(within(tasks).getByText("2 pendents · 1 feta")).toBeVisible();
    answer = "network";
    fireEvent.click(pending);
    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("No s'ha pogut completar l'acció.");
    });
    expect(pending).not.toBeChecked();
    expect(document.body.textContent).not.toMatch(/errors:|census:|instructor:/u);
  });

  it("E6-W04 step 0b (its review): a failed completion's message goes when the next completion starts, so a successful retry leaves no stale error", async () => {
    const { lines } = recordFlow();
    const statuses: number[] = [];
    server.events.on("response:mocked", ({ request, response }) => {
      if (new URL(request.url).pathname.endsWith("/completion")) statuses.push(response.status);
    });
    let refuse = true;
    server.use(
      http.post("*/api/v1/tasks/:id/completion", () => {
        if (!refuse) return undefined;
        refuse = false;
        return HttpResponse.json(
          { code: "NOT_FOUND", details: {}, message: "Task not found", traceId: "t-13" },
          { status: 404 },
        );
      }),
    );
    const tasks = await renderMyDogs();
    const pending = within(tasks).getByRole("checkbox", { name: "Treballar l'entrada al balancí" });
    fireEvent.click(pending);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "No s'ha trobat l'element sol·licitat.",
    );
    await waitFor(() => {
      expect(pending).not.toHaveAttribute("aria-busy");
    });
    fireEvent.click(pending);
    await waitFor(() => {
      expect(lines.filter((line) => line.startsWith("POST"))).toHaveLength(2);
    });
    await waitFor(() => {
      expect(statuses).toEqual([404, 200]);
    });
    await waitFor(() => {
      expect(pending).toBeChecked();
    });
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("E6-W04 step 0b (its review): a TASK_ALREADY_DONE re-read taken before another completion answered never shows that task pending again", async () => {
    let releaseRead: () => void = () => undefined;
    const readHeld = new Promise<void>((resolve) => {
      releaseRead = resolve;
    });
    let reads = 0;
    server.use(
      http.post("*/api/v1/tasks/:id/completion", ({ params }) =>
        String(params.id) === "task-duna-balance"
          ? HttpResponse.json(
              { code: "TASK_ALREADY_DONE", details: {}, message: "done", traceId: "t-13" },
              { status: 422 },
            )
          : undefined,
      ),
      http.get("*/api/v1/me/dogs", async ({ request }) => {
        reads += 1;
        // The page's first read answers at once; the re-read after the 422 is taken now (both
        // tasks still pending in it) and delivered after the second completion answered.
        if (reads === 1) return undefined;
        const taken = await getResponse(handlers, request);
        await readHeld;
        return taken;
      }),
    );
    const tasks = await renderMyDogs();
    const first = within(tasks).getByRole("checkbox", { name: "Treballar l'entrada al balancí" });
    const second = within(tasks).getByRole("checkbox", { name: "Revisar l'entrada a l'eslàlom" });
    fireEvent.click(first);
    await waitFor(() => {
      expect(reads).toBe(2);
    });
    // Meanwhile another task is completed and answered.
    fireEvent.click(second);
    await waitFor(() => {
      expect(second).toBeChecked();
    });
    releaseRead();
    await waitFor(() => {
      expect(first).not.toHaveAttribute("aria-busy");
    });
    expect(second).toBeChecked();
  });

  it("E7-W06 step 6 (E6-W04's report nit): when 13's re-read after 422 TASK_ALREADY_DONE fails, the page says the task is already done, not the generic «No s'ha pogut completar l'acció.»", async () => {
    let reads = 0;
    server.use(
      http.post("*/api/v1/tasks/:id/completion", () =>
        HttpResponse.json(
          { code: "TASK_ALREADY_DONE", details: {}, message: "done", traceId: "t-13" },
          { status: 422 },
        ),
      ),
      http.get("*/api/v1/me/dogs", () => {
        reads += 1;
        // The page's first read answers; the re-read after the 422 gets no answer.
        return reads === 1 ? undefined : HttpResponse.error();
      }),
    );
    const tasks = await renderMyDogs();
    const pending = within(tasks).getByRole("checkbox", { name: "Treballar l'entrada al balancí" });
    fireEvent.click(pending);
    await waitFor(() => {
      expect(reads).toBe(2);
    });
    expect(await screen.findByRole("alert")).toHaveTextContent("Aquesta tasca ja està completada.");
    expect(screen.queryByText("No s'ha pogut completar l'acció.")).toBeNull();
    await waitFor(() => {
      expect(pending).not.toHaveAttribute("aria-busy");
    });
  });

  it("E6-W04 step 0b: an impersonated session completes it as the member — the impersonation token is sent and the line reads «feta per la Laura el 14-08»", async () => {
    const { completions } = recordFlow();
    const tasks = await renderMyDogs(true);
    expect(screen.getByText("Estàs veient l'app com Laura Serra Vidal")).toBeVisible();
    fireEvent.click(
      within(tasks).getByRole("checkbox", { name: "Treballar l'entrada al balancí" }),
    );
    await waitFor(() => {
      expect(within(tasks).getAllByRole("listitem")[0]?.textContent).toBe(
        "Treballar l'entrada al balancí10-08 · Laura · feta per la Laura el 14-08",
      );
    });
    await waitFor(() => {
      expect(completions.map((item) => item.authorization)).toEqual([
        "Bearer mock-impersonation-token",
      ]);
    });
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("E6-W04 step 0b: es and en read the completed line with the reader's words", async () => {
    for (const [locale, line] of [
      ["es", "hecha por Biel el 14-08"],
      ["en", "done by Biel on 14-08"],
    ] as const) {
      cleanup();
      resetMemberSelfServiceState();
      const client = authClient();
      await client.login("laura@example.test", "secret-password");
      window.history.pushState(null, "", "/gossos");
      await renderApplication(client, { ...canicBranding, locales: ["ca", "es", "en"] }, locale);
      const card = (await screen.findByRole("heading", { name: "Duna" })).closest<HTMLElement>(
        ".dog-card",
      );
      if (card === null) throw new TypeError("Missing Duna's card");
      const first = within(card).getAllByRole("checkbox")[0];
      if (first === undefined) throw new TypeError("Missing the first task");
      fireEvent.click(first);
      await waitFor(() => {
        expect(within(card).getAllByRole("listitem")[0]?.textContent).toContain(line);
      });
      expect(document.body.textContent).not.toMatch(/errors:|census:|instructor:/u);
    }
  });
});

describe("T-03-40 E3-W12 screen 13 without /parameters (S03 §6 GET /me/dogs, R-03-15, R-03-30, R-03-32)", () => {
  interface RecordedApiRequest {
    body?: unknown;
    method: string;
    path: string;
  }

  /** Every api request of the page (method, path, JSON body of a POST). */
  function recordApi() {
    const recorded: RecordedApiRequest[] = [];
    const listener = ({ request }: { request: Request }) => {
      const url = new URL(request.url);
      if (!url.pathname.startsWith("/api/v1/")) return;
      const entry: RecordedApiRequest = {
        method: request.method,
        path: url.pathname.slice("/api/v1".length),
      };
      recorded.push(entry);
      if (request.method === "POST") {
        void request
          .clone()
          .text()
          .then((text) => {
            entry.body = text === "" ? undefined : (JSON.parse(text) as unknown);
          });
      }
    };
    server.events.on("request:start", listener);
    return {
      parameterReads: () => recorded.filter((request) => request.path.startsWith("/parameters")),
      recorded,
      stop: () => {
        server.events.removeListener("request:start", listener);
      },
    };
  }

  async function openMyDogs(locale: "ca" | "es" = "ca") {
    const client = authClient();
    await client.login("laura@example.test", "secret-password");
    window.history.pushState(null, "", "/gossos");
    await renderApplication(client, canicBranding, locale);
    await screen.findByRole("heading", {
      name: locale === "ca" ? "Els meus gossos" : "Mis perros",
    });
  }

  function documentTypeOptions() {
    const select = document.getElementById("dog-document-type");
    if (select === null) throw new TypeError("No document type select");
    return within(select)
      .getAllByRole("option")
      .map((option) => option.textContent);
  }

  it("step 1: «＋ DOC.» offers the club's three types of GET /me/dogs in order, «Assegurança» sends INSURANCE, and /parameters is never read", async () => {
    const api = recordApi();
    await openMyDogs();
    fireEvent.click(screen.getAllByRole("button", { name: "＋ DOC." })[0] as HTMLButtonElement);
    const dialog = screen.getByRole("dialog", { name: "Afegeix un document de Duna" });
    await waitFor(() => {
      expect(documentTypeOptions()).toEqual(["Cartilla de vacunes", "Assegurança", "Altres"]);
    });
    fireEvent.change(within(dialog).getByLabelText("Tipus"), { target: { value: "INSURANCE" } });
    fireEvent.change(within(dialog).getByLabelText("Nom del document"), {
      target: { value: "Assegurança 2026" },
    });
    fireEvent.change(within(dialog).getByLabelText("Fitxer"), {
      target: { files: [new File(["%PDF"], "asseguranca.pdf", { type: "application/pdf" })] },
    });
    // jsdom's constraint validation does not see the file of `fireEvent.change`: submit the form.
    const form = within(dialog).getByRole("button", { name: "PUJA EL DOCUMENT" }).closest("form");
    if (form === null) throw new TypeError("No document form");
    fireEvent.submit(form);
    expect(await screen.findByText("Document desat")).toBeVisible();
    const upload = api.recorded.find(
      (request) =>
        request.method === "POST" && /^\/me\/dogs\/[^/]+\/documents$/u.test(request.path),
    );
    expect(upload?.body).toMatchObject({ name: "Assegurança 2026", type: "INSURANCE" });
    // S03 25-09: a MEMBER cannot read /parameters (the api answers 403).
    expect(api.parameterReads()).toEqual([]);
    api.stop();
  });

  it("step 1: the labels are the reader's (es), as GET /me/dogs resolves them", async () => {
    await openMyDogs("es");
    fireEvent.click(screen.getAllByRole("button", { name: "＋ DOC." })[0] as HTMLButtonElement);
    await waitFor(() => {
      expect(documentTypeOptions()).toEqual(["Cartilla de vacunas", "Seguro", "Otros"]);
    });
  });

  it("step 2: «Nivell {codi}» only when the dog carries its level (none without levels.enabled), without reading /parameters", async () => {
    const api = recordApi();
    mockScenario("memberNoLevels");
    await openMyDogs();
    expect(
      screen.getAllByRole("heading", { level: 2 }).map((heading) => heading.textContent),
    ).toEqual(["Duna", "Rock"]);
    expect(screen.queryByText(/^Nivell /u)).toBeNull();

    cleanup();
    mockScenario("member");
    await openMyDogs();
    expect(screen.getByText("Nivell C")).toBeVisible();
    expect(screen.getByText("Nivell D")).toBeVisible();
    expect(api.parameterReads()).toEqual([]);
    api.stop();
  });
});

describe("T-03-41 mobile own data", () => {
  it("keeps identity read-only, resolves towns, maps READ_ONLY and gates billing", async () => {
    const client = authClient();
    await client.login("laura@example.test", "secret-password");
    window.history.pushState(null, "", "/dades");
    await renderApplication(client);

    expect(await screen.findByRole("heading", { name: "Les meves dades" })).toBeVisible();
    expect(screen.getByLabelText("DNI")).toHaveAttribute("readonly");
    expect(screen.getByLabelText("Nom")).toHaveAttribute("readonly");
    expect(screen.getByLabelText("Cognom 1")).toHaveAttribute("readonly");
    expect(screen.getByLabelText("Cognom 2")).toHaveAttribute("readonly");
    expect(screen.getByLabelText("Segon email (opcional)")).toHaveValue("feina@example.cat");
    expect(await screen.findByLabelText("Població (proposada pel CP)")).not.toHaveValue("");
    expect(screen.getByText("Domiciliació")).toBeVisible();
    expect(screen.queryByRole("heading", { name: "Consentiments" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Idioma" })).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("CP"), { target: { value: "99999" } });
    const towns = await screen.findByRole("combobox", {
      name: "Població (proposada pel CP)",
    });
    expect(within(towns).getByRole("option", { name: "Poble Nord" })).toBeInTheDocument();
    expect(within(towns).getByRole("option", { name: "Poble Sud" })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Email principal"), {
      target: { value: "readonly@example.test" },
    });
    fireEvent.click(screen.getByRole("button", { name: "DESA" }));
    expect(await screen.findByText("Aquest element és només de lectura.")).toBeVisible();

    cleanup();
    mockScenario("minimal");
    const minimalClient = authClient();
    await minimalClient.login("laura@example.test", "secret-password");
    window.history.pushState(null, "", "/dades");
    await renderApplication(minimalClient, minimalBranding);
    await screen.findByRole("heading", { name: "Les meves dades" });
    expect(screen.queryByText("Domiciliació")).not.toBeInTheDocument();
  });

  it("validates DNI, NIE, phone and postal code from the country profile", () => {
    const es = { code: "ES", idDocumentTypes: ["DNI", "NIE"], phonePrefix: "+34" };
    expect(isCountryFieldValid(es, "DNI", "12345678Z")).toBe(true);
    expect(isCountryFieldValid(es, "NIE", "X1234567L")).toBe(true);
    expect(isCountryFieldValid(es, "PHONE", "12345678")).toBe(false);
    expect(isCountryFieldValid(es, "POSTAL_CODE", "0834")).toBe(false);
    expect(isCountryFieldValid({ code: "GENERIC", phonePrefix: "+1" }, "DNI", "A-42")).toBe(true);
  });
});
