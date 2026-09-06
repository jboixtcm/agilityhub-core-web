import { createApiClient } from "@agilityhub/api-client";
import { mockScenario, resetMemberSelfServiceState } from "@agilityhub/api-client/mocks";
import brandingCanicFixture from "@agilityhub/api-client/mocks/branding-canic";
import { server } from "@agilityhub/api-client/mocks/server";
import { AuthClient, MemoryRefreshTokenStore, SessionProvider } from "@agilityhub/auth";
import { createI18n } from "@agilityhub/i18n";
import { type Branding, BrandingProvider } from "@agilityhub/ui";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

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
afterEach(() => {
  cleanup();
  server.resetHandlers();
  mockScenario("member");
  resetMemberSelfServiceState();
});
afterAll(() => {
  server.close();
});

function authClient() {
  return new AuthClient({
    apiBaseUrl: `${window.location.origin}/api/v1`,
    clientId: "clubs-app",
    identityBaseUrl: window.location.origin,
    refreshTokenStore: new MemoryRefreshTokenStore(),
  });
}

async function renderApplication(client: AuthClient, branding: Branding = canicBranding) {
  const i18n = await createI18n({
    branding,
    browserLanguages: ["ca"],
    initialNamespaces: ["auth", "census", "errors", "shell"],
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
          />
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
    expect(screen.getByText("Club Agility Cànic · Cabrera de Mar")).toBeVisible();

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
    expect(screen.getByText("Operativa (reserves i canvis que has fet tu)")).toBeVisible();
    const language = document.querySelector(".profile-language");
    if (language === null) {
      throw new TypeError("Expected the profile language row");
    }
    const inactivity = screen.getByRole("link", { name: "Sol·licitar període d'inactivitat" });
    expect(inactivity).toHaveAttribute("href", "/inactivitat");
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
});

describe("T-03-40 mobile own dogs", () => {
  it("renders own dogs, saves the note, completes a task and gates TASKS", async () => {
    const client = authClient();
    await client.login("laura@example.test", "secret-password");
    window.history.pushState(null, "", "/gossos");
    await renderApplication(client);

    expect(await screen.findByRole("heading", { name: "Els meus gossos" })).toBeVisible();
    expect(screen.getByText(/Border collie · femella · 4 anys/u)).toBeVisible();
    expect(screen.getByText("Nivell C")).toBeVisible();
    expect(screen.getByText("Pot entrenar sol")).toBeVisible();
    expect(screen.getByText(/FCAG · llicència 3241 · Iniciació/u)).toBeVisible();
    expect(screen.getByText(/RSCE · llicència 13298 · G2/u)).toBeVisible();
    expect(
      screen.getByText(
        "El nivell l'assigna el club · Per donar de baixa un dels gossos, comunica-ho al club",
      ),
    ).toBeVisible();

    const note = screen.getAllByLabelText(/Notes als instructors/u)[0] as HTMLTextAreaElement;
    fireEvent.change(note, { target: { value: "Treballarem el balancí amb calma." } });
    fireEvent.click(screen.getAllByRole("button", { name: "DESA" })[0] as HTMLButtonElement);
    expect(await screen.findByRole("status")).toHaveTextContent("Nota de Duna desada");

    const task = screen.getByRole("checkbox", {
      name: /Marca la tasca com a feta: Aquesta setmana practiqueu el balancí/u,
    });
    fireEvent.click(task);
    expect(task).toHaveAttribute("aria-checked", "true");
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
