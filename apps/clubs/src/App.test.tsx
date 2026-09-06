import { mockScenario } from "@agilityhub/api-client/mocks";
import brandingCanicFixture from "@agilityhub/api-client/mocks/branding-canic";
import { server } from "@agilityhub/api-client/mocks/server";
import { AuthClient, MemoryRefreshTokenStore, SessionProvider } from "@agilityhub/auth";
import { createI18n } from "@agilityhub/i18n";
import { type Branding, BrandingProvider } from "@agilityhub/ui";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { App, MOBILE_ROUTES, MobileNavigation } from "./App";

const canicBranding: Branding = {
  ...brandingCanicFixture,
  theme: { ...brandingCanicFixture.theme, mode: "dark" },
};
const minimalBranding: Branding = {
  ...canicBranding,
  club: { name: "Club Mínim", slug: "minim" },
  locales: ["ca", "es", "en"],
  signup: { enabled: false },
};

beforeAll(() => {
  server.listen({ onUnhandledRequest: "error" });
});
afterEach(() => {
  cleanup();
  server.resetHandlers();
  mockScenario("member");
});
afterAll(() => {
  server.close();
});

function authClient() {
  return new AuthClient({
    apiBaseUrl: `${window.location.origin}/api/v1`,
    authBaseUrl: window.location.origin,
    clientId: "clubs-app",
    refreshTokenStore: new MemoryRefreshTokenStore(),
    revokeEndpoint: `${window.location.origin}/oauth2/revoke`,
    tokenEndpoint: `${window.location.origin}/oauth2/token`,
  });
}

async function renderApplication(client: AuthClient, branding: Branding = canicBranding) {
  const i18n = await createI18n({
    branding,
    browserLanguages: ["ca"],
    initialNamespaces: ["auth", "errors", "shell"],
    storage: undefined,
  });
  render(
    <I18nextProvider i18n={i18n}>
      <BrandingProvider branding={branding}>
        <SessionProvider client={client}>
          <App authClient={client} />
        </SessionProvider>
      </BrandingProvider>
    </I18nextProvider>,
  );
}

async function renderNavigation(modules: string[], roles: ("ADMIN" | "INSTRUCTOR" | "MEMBER")[]) {
  const i18n = await createI18n({
    branding: canicBranding,
    browserLanguages: ["ca"],
    initialNamespaces: ["shell"],
    storage: undefined,
  });
  render(
    <I18nextProvider i18n={i18n}>
      <BrandingProvider branding={{ ...canicBranding, modules }}>
        <MobileNavigation modules={modules} pathname="/inici" roles={roles} />
      </BrandingProvider>
    </I18nextProvider>,
  );
}

describe("T-02-14 clubs shell", () => {
  it("filters the six-tab mockup navigation by modules and roles", async () => {
    await renderNavigation(["FREE_TRAINING", "FAQ"], ["MEMBER"]);

    expect(screen.getByRole("link", { name: "Inici" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Reservar" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Entrenaments" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Avui" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Perfil" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Info" })).toBeInTheDocument();
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
        "/instructor/pistes/:ringId/reservar",
        "/instructor/tasques",
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
});

describe("T-01-18 access screen", () => {
  it("uses the exact access actions, focuses an empty email and gates signup", async () => {
    window.history.pushState(null, "", "/entrar");
    await renderApplication(authClient());

    expect(screen.getByPlaceholderText("correu@exemple.cat")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Envia'm l'enllaç" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Tinc contrasenya" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Encara no hi ets? Apunta-t'hi →" })).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Envia'm l'enllaç" }));
    expect(screen.getByLabelText("Correu electrònic")).toHaveFocus();
    expect(screen.getByRole("alert")).toHaveTextContent("Escriu el teu correu");

    fireEvent.change(screen.getByLabelText("Correu electrònic"), {
      target: { value: "estel.rius@example.test" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Envia'm l'enllaç" }));
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Si el correu és al club, hi rebràs l'enllaç",
    );
    fireEvent.click(screen.getByRole("button", { name: "Tinc contrasenya" }));
    expect(screen.getByLabelText("Contrasenya")).toBeVisible();
    expect(screen.getByRole("button", { name: "ENTRA" })).toBeVisible();

    cleanup();
    window.history.pushState(null, "", "/entrar");
    mockScenario("minimal");
    await renderApplication(authClient(), minimalBranding);
    expect(screen.queryByRole("link", { name: /Apunta-t'hi/u })).not.toBeInTheDocument();
  });

  it("shows the Retry-After countdown and disables requests", async () => {
    window.history.pushState(null, "", "/entrar");
    mockScenario("rateLimited");
    await renderApplication(authClient());
    fireEvent.change(screen.getByLabelText("Correu electrònic"), {
      target: { value: "limit@example.test" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Envia'm l'enllaç" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Massa intents. Torna-ho a provar d'aquí a 120 s",
    );
    expect(screen.getByRole("button", { name: "Envia'm l'enllaç" })).toBeDisabled();
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

describe("T-01-21 profile access rows and impersonation", () => {
  it("renders password, locale and revocable session controls from the contract", async () => {
    mockScenario("multiProfile");
    const client = authClient();
    await client.login("estel.rius@example.test", "secret-password");
    window.history.pushState(null, "", "/perfil");
    await renderApplication(client);

    fireEvent.click(screen.getByRole("button", { name: "Canvia la contrasenya" }));
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

    fireEvent.click(screen.getByRole("button", { name: "Sessions" }));
    expect(await screen.findByText("Safari · iPhone")).toBeVisible();
    expect(screen.getByText("Sessió actual")).toBeVisible();
    expect(screen.getByRole("button", { name: "Tanca aquesta sessió" })).toBeVisible();
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
});
