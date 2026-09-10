import { createApiClient } from "@agilityhub/api-client";
import { mockScenario, type MockScenario } from "@agilityhub/api-client/mocks";
import brandingCanicFixture from "@agilityhub/api-client/mocks/branding-canic";
import { server } from "@agilityhub/api-client/mocks/server";
import { createI18n } from "@agilityhub/i18n";
import { type Branding, BrandingProvider } from "@agilityhub/ui";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { SignupPage } from "./SignupPage";

const DRAFT_KEY = "signup.draft.v1";

function brandingFor(scenario: MockScenario): Branding {
  const branding: Branding = {
    ...brandingCanicFixture,
    locales: ["ca", "es", "en"],
    theme: { ...brandingCanicFixture.theme, mode: "dark" },
  };
  if (scenario === "signupNoBilling") {
    return {
      ...branding,
      modules: branding.modules.filter((module) => module !== "BILLING"),
    };
  }
  if (scenario === "signupNoFamily") {
    return {
      ...branding,
      modules: branding.modules.filter((module) => module !== "FAMILY_GROUP"),
    };
  }
  if (scenario === "signupClosed") {
    return { ...branding, signup: { enabled: false } };
  }
  return branding;
}

async function renderSignup({
  addDog = false,
  locale = "ca",
  navigate = vi.fn(),
  path,
  scenario = "signup",
}: {
  addDog?: boolean;
  locale?: "ca" | "en" | "es";
  navigate?: (path: string) => void;
  path: string;
  scenario?: MockScenario;
}) {
  window.history.pushState(null, "", path);
  mockScenario(scenario);
  const branding = brandingFor(scenario);
  const i18n = await createI18n({
    branding,
    browserLanguages: [locale],
    initialNamespaces: ["errors", "signup"],
    storage: undefined,
  });
  render(
    <I18nextProvider i18n={i18n}>
      <BrandingProvider branding={branding}>
        <SignupPage
          addDog={addDog}
          client={createApiClient({
            baseUrl: `${window.location.origin}/api/v1`,
            getAccessToken: () => (addDog ? "mock-access-token" : undefined),
            getLocale: () => i18n.resolvedLanguage ?? branding.defaultLocale,
          })}
          onNavigate={navigate}
        />
      </BrandingProvider>
    </I18nextProvider>,
  );
  await screen.findByRole("heading", { name: "Apunta-t'hi" });
  await screen.findByText(/Pas \d de \d/u);
  return { i18n, navigate };
}

function fillPerson(idDocument = "12345678Z", email = "new@example.test") {
  fireEvent.change(screen.getByLabelText("DNI / NIE"), { target: { value: idDocument } });
  fireEvent.change(screen.getByLabelText("Nom", { exact: true }), {
    target: { value: "Nora" },
  });
  fireEvent.change(screen.getByLabelText("Cognom 1"), { target: { value: "Soler" } });
  fireEvent.change(screen.getByLabelText("Data de naixement"), {
    target: { value: "1992-04-05" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Altres / No binari" }));
  fireEvent.change(screen.getByLabelText("Email", { exact: true }), { target: { value: email } });
  fireEvent.change(screen.getByLabelText("Telèfon", { exact: true }), {
    target: { value: "612345678" },
  });
  fireEvent.change(screen.getByLabelText("Carrer i número"), {
    target: { value: "Carrer de la Font, 3" },
  });
  fireEvent.change(screen.getByLabelText("CP", { exact: true }), { target: { value: "08349" } });
  fireEvent.change(screen.getByLabelText("Població (proposada pel CP)"), {
    target: { value: brandingCanicFixture.club.city },
  });
}

beforeAll(() => {
  server.listen({ onUnhandledRequest: "error" });
});
afterEach(() => {
  cleanup();
  sessionStorage.clear();
  localStorage.clear();
  server.resetHandlers();
  mockScenario("signup");
});
afterAll(() => {
  server.close();
});

describe("T-04-29 signup person and draft", () => {
  it("persists a current draft, expires it after 24 hours and maps identity states", async () => {
    await renderSignup({ path: "/apuntat-hi" });
    fillPerson("12345678A");

    await waitFor(() => {
      expect(sessionStorage.getItem(DRAFT_KEY)).toContain("Nora");
    });
    fireEvent.click(screen.getByRole("button", { name: "CONTINUA" }));
    expect(await screen.findByText("El document d'identitat no és vàlid.")).toBeVisible();

    fireEvent.change(screen.getByLabelText("DNI / NIE"), { target: { value: "12345678Z" } });
    fireEvent.change(screen.getByLabelText("Email", { exact: true }), {
      target: { value: "existing@example.test" },
    });
    fireEvent.click(screen.getByRole("button", { name: "CONTINUA" }));
    expect(await screen.findByRole("heading", { name: "Revisa el correu" })).toBeVisible();
    expect(screen.getByText(/e••••••g@e••••••\.test/u)).toBeVisible();
    expect(screen.getByRole("button", { name: "Torna-m'ho a enviar" })).toBeEnabled();

    cleanup();
    await renderSignup({ path: "/apuntat-hi" });
    expect(screen.getByLabelText("Nom", { exact: true })).toHaveValue("Nora");

    const saved = JSON.parse(sessionStorage.getItem(DRAFT_KEY) ?? "{}") as Record<string, unknown>;
    sessionStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({ ...saved, savedAt: Date.now() - 24 * 60 * 60 * 1000 - 1 }),
    );
    cleanup();
    await renderSignup({ path: "/apuntat-hi" });
    expect(screen.getByLabelText("Nom", { exact: true })).toHaveValue("");
  });

  it("keeps the draft and refetches localized configuration after a language change", async () => {
    await renderSignup({ path: "/apuntat-hi/gos" });
    fireEvent.change(screen.getByLabelText("Nom del gos"), { target: { value: "Kiwi" } });
    expect(await screen.findByText("Abonat")).toBeVisible();

    fireEvent.change(screen.getByLabelText("Idioma"), { target: { value: "es" } });

    expect(await screen.findByText("Socio")).toBeVisible();
    expect(screen.getByLabelText("Nombre del perro")).toHaveValue("Kiwi");
    expect(localStorage.getItem("agilityhub.locale")).toBe("es");
  });
});

describe("T-04-30 signup dog, uploads, plans and module gates", () => {
  it("uploads sequentially named vaccination pages and renders API plans", async () => {
    await renderSignup({ path: "/apuntat-hi/gos" });
    fireEvent.change(screen.getByLabelText("Nom del gos"), { target: { value: "Kiwi" } });
    fireEvent.change(screen.getByLabelText("Raça"), { target: { value: "Mestís" } });
    fireEvent.change(screen.getByLabelText("Naix."), { target: { value: "2022-03" } });
    fireEvent.change(screen.getByLabelText("Núm. de xip"), { target: { value: "chip-kiwi" } });

    fireEvent.change(screen.getByLabelText("Cartilla de vacunes"), {
      target: { files: [new File(["page-1"], "scan.jpg", { type: "image/jpeg" })] },
    });
    expect(await screen.findByText("cartilla_Kiwi_1.jpg pujada")).toBeVisible();
    fireEvent.change(screen.getByLabelText("Cartilla de vacunes"), {
      target: { files: [new File(["page-2"], "scan.pdf", { type: "application/pdf" })] },
    });
    expect(await screen.findByText("cartilla_Kiwi_2.pdf pujada")).toBeVisible();

    expect(screen.getByText("Abonat")).toBeVisible();
    expect(screen.getByText("Pack 6")).toBeVisible();
    expect(screen.getByText("Pack 10")).toBeVisible();
    expect(screen.getByText("Teràpia")).toBeVisible();
    expect(screen.getByText("Ofertes si es porta més d'un gos per família")).toBeVisible();
    expect(screen.getByText(/imprescindible per començar les classes/u)).toBeVisible();
    expect(screen.getByText("＋ Afegir un altre full")).toBeVisible();
  });

  it("removes amounts without BILLING and the family offer and step without FAMILY_GROUP", async () => {
    await renderSignup({ path: "/apuntat-hi/gos", scenario: "signupNoBilling" });
    expect(await screen.findByText("Abonat")).toBeVisible();
    expect(document.querySelector(".signup-plans")?.textContent).not.toContain("€");

    cleanup();
    sessionStorage.clear();
    await renderSignup({ path: "/apuntat-hi/gos", scenario: "signupNoFamily" });
    expect(await screen.findByText(/Pas 2 de 3/u)).toBeVisible();
    expect(
      screen.queryByText("Ofertes si es porta més d'un gos per família"),
    ).not.toBeInTheDocument();
  });
});

describe("T-04-31 signup family lookup", () => {
  it("continues empty, resolves the fixture family and supports a pending lookup", async () => {
    const emptyNavigate = vi.fn();
    await renderSignup({ navigate: emptyNavigate, path: "/apuntat-hi/familia" });
    fireEvent.click(screen.getByRole("button", { name: "CONTINUA" }));
    expect(emptyNavigate).toHaveBeenCalledWith("/apuntat-hi/pagament");

    cleanup();
    sessionStorage.clear();
    const foundNavigate = vi.fn();
    await renderSignup({ navigate: foundNavigate, path: "/apuntat-hi/familia" });
    fireEvent.change(screen.getByLabelText("Nom del responsable"), {
      target: { value: "Marta Roca" },
    });
    fireEvent.change(screen.getByLabelText("Nom d'un dels seus gossos"), {
      target: { value: "Kiwi" },
    });
    fireEvent.click(screen.getByRole("button", { name: "CONTINUA" }));
    expect(await screen.findByText(/Grup trobat: Marta R\./u)).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "CONTINUA" }));
    expect(foundNavigate).toHaveBeenCalledWith("/apuntat-hi/pagament");

    cleanup();
    sessionStorage.clear();
    const pendingNavigate = vi.fn();
    await renderSignup({ navigate: pendingNavigate, path: "/apuntat-hi/familia" });
    fireEvent.change(screen.getByLabelText("Nom del responsable"), {
      target: { value: "Persona desconeguda" },
    });
    fireEvent.change(screen.getByLabelText("Nom d'un dels seus gossos"), {
      target: { value: "Bruc" },
    });
    fireEvent.click(screen.getByRole("button", { name: "CONTINUA" }));
    const pending = await screen.findByRole("button", {
      name: "Deixa-ho pendent i continua ›",
    });
    fireEvent.click(pending);
    expect(pendingNavigate).toHaveBeenCalledWith("/apuntat-hi/pagament");

    cleanup();
    sessionStorage.clear();
    await renderSignup({ path: "/apuntat-hi/familia", scenario: "signupNoFamilyPending" });
    fireEvent.change(screen.getByLabelText("Nom del responsable"), {
      target: { value: "Persona desconeguda" },
    });
    fireEvent.change(screen.getByLabelText("Nom d'un dels seus gossos"), {
      target: { value: "Bruc" },
    });
    fireEvent.click(screen.getByRole("button", { name: "CONTINUA" }));
    await screen.findByRole("alert");
    expect(
      screen.queryByRole("button", { name: "Deixa-ho pendent i continua ›" }),
    ).not.toBeInTheDocument();
  });

  it("keeps the dog draft when returning from the family step", async () => {
    await renderSignup({ path: "/apuntat-hi/gos" });
    fireEvent.change(screen.getByLabelText("Nom del gos"), { target: { value: "Kiwi" } });
    fireEvent.change(screen.getByLabelText("Raça"), { target: { value: "Mestís" } });
    fireEvent.change(screen.getByLabelText("Naix."), { target: { value: "2022-03" } });
    fireEvent.change(screen.getByLabelText("Núm. de xip"), { target: { value: "chip-kiwi" } });
    fireEvent.click(screen.getByRole("button", { name: "CONTINUA" }));
    expect(await screen.findByLabelText("Nom del responsable")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Torna al pas anterior" }));
    expect(await screen.findByLabelText("Nom del gos")).toHaveValue("Kiwi");
  });
});

describe("T-04-32 signup payment, checkout and add-dog mode", () => {
  it("renders API totals and payment conditions and submits only after privacy consent", async () => {
    const navigate = vi.fn();
    await renderSignup({ navigate, path: "/apuntat-hi/pagament" });
    const submit = screen.getByRole("button", { name: "ENVIA LA SOL·LICITUD" });

    expect(screen.getByText("Pagament dels rebuts mensuals")).toBeVisible();
    expect(screen.getByText("Entrada (1 gos)")).toBeVisible();
    expect(screen.getByText("Alta avui, 17 d'agost (mig mes)")).toBeVisible();
    expect(screen.getByText("Alta l'1 de setembre (mes complet)")).toBeVisible();
    expect(screen.getByText("Total a pagar al club")).toBeVisible();
    expect(screen.getByText(/emetre rebuts sobre aquest compte/u)).toBeVisible();
    expect(screen.getByText(/abans del dia 25/u)).toBeVisible();
    expect(screen.queryByText(/períodes naturals complets/u)).not.toBeInTheDocument();
    expect(submit).toBeDisabled();
    expect(screen.getByRole("link", { name: "Pots consultar-la aquí" })).toHaveAttribute(
      "target",
      "_blank",
    );

    fireEvent.click(screen.getByRole("button", { name: "què vol dir?" }));
    expect(screen.getByText(/publicació de fotos/u)).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Efectiu" }));
    expect(screen.getByText(/períodes naturals complets/u)).toBeVisible();
    expect(screen.queryByLabelText("IBAN")).not.toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("Accepto la política de privacitat"));
    fireEvent.click(submit);
    await waitFor(() => {
      expect(navigate).toHaveBeenCalledWith("/apuntat-hi/enviada");
    });
    expect(sessionStorage.getItem(DRAFT_KEY)).toBeNull();
  });

  it("redirects through checkout when Stripe is enabled", async () => {
    const navigate = vi.fn();
    await renderSignup({ navigate, path: "/apuntat-hi/pagament", scenario: "signupStripe" });
    expect(screen.getByRole("button", { name: "Targeta" })).toBeVisible();
    expect(screen.getByText("El pagament es fa en enviar")).toBeVisible();
    fireEvent.click(screen.getByLabelText("Accepto la política de privacitat"));
    fireEvent.click(screen.getByRole("button", { name: "ENVIA LA SOL·LICITUD" }));
    await waitFor(() => {
      expect(navigate).toHaveBeenCalledWith("https://checkout.test/cs_mock_signup");
    });
  });

  it("uses the member plan and payment method and posts the add-dog flow", async () => {
    const navigate = vi.fn();
    await renderSignup({ addDog: true, navigate, path: "/gossos/nou/pagament" });
    expect(await screen.findByText(/Pas 2 de 2/u)).toBeVisible();
    expect(screen.getByLabelText("Mètode de pagament actual")).toHaveValue(
      "Domiciliació · ···· 2231",
    );
    expect(screen.getByText("Quota addicional del gos")).toBeVisible();
    fireEvent.click(screen.getByLabelText("Accepto la política de privacitat"));
    fireEvent.click(screen.getByRole("button", { name: "ENVIA LA SOL·LICITUD" }));
    await waitFor(() => {
      expect(navigate).toHaveBeenCalledWith("/apuntat-hi/enviada");
    });
  });
});
