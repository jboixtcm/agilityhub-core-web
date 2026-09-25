import { createApiClient } from "@agilityhub/api-client";
import {
  mockScenario,
  resetSignupMockState,
  setSignupMockToday,
  type MockScenario,
} from "@agilityhub/api-client/mocks";
import brandingCanicFixture from "@agilityhub/api-client/mocks/branding-canic";
import { server } from "@agilityhub/api-client/mocks/server";
import { createI18n } from "@agilityhub/i18n";
import { type Branding, BrandingProvider, contrastRatio } from "@agilityhub/ui";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { I18nextProvider } from "react-i18next";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { SignupPage } from "./SignupPage";

const DRAFT_KEY = "signup.draft.v1";
const MEMBER_PLAN = "10000000-0000-4000-8000-000000000001";
const PACK_6_PLAN = "10000000-0000-4000-8000-000000000002";
const THERAPY_PLAN = "10000000-0000-4000-8000-000000000004";
const VALID_IBAN = "ES9121000418450200051332";
const SIGNUP_RESULT = {
  checkout: { required: false },
  memberId: "member-signup-lost-201",
  signupToken: "mock-signup-token",
};

type SignupConfigJson = Record<string, unknown> & {
  legal: Record<string, unknown>;
  plans: Record<string, unknown>[];
  texts: Record<string, unknown>;
};

interface RecordedRequest {
  body: unknown;
  key: string | null;
  method: string;
  path: string;
}

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

function genericBranding(): Branding {
  return {
    ...brandingFor("signup"),
    countryProfile: { code: "GENERIC", idDocumentTypes: ["PASSPORT", "OTHER"], phonePrefix: "" },
  };
}

async function renderSignup({
  addDog = false,
  branding: brandingOverride,
  locale = "ca",
  navigate = vi.fn(),
  path,
  productionNavigator = false,
  scenario = "signup",
}: {
  addDog?: boolean;
  branding?: Branding;
  locale?: "ca" | "en" | "es";
  navigate?: (path: string) => void;
  path: string;
  /** No `onNavigate`: the page uses its production navigator (`window.location.assign`). */
  productionNavigator?: boolean;
  scenario?: MockScenario;
}) {
  window.history.pushState(null, "", path);
  mockScenario(scenario);
  const branding = brandingOverride ?? brandingFor(scenario);
  // A same-document navigator (a client-side router): the address moves before the page renders
  // the next step. The production navigator is a full page load (`stubFullPageLoads`).
  const onNavigate = (next: string) => {
    navigate(next);
    const target = new URL(next, window.location.href);
    if (target.origin === window.location.origin) {
      window.history.pushState(null, "", `${target.pathname}${target.search}`);
    }
  };
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
          {...(productionNavigator ? {} : { onNavigate })}
        />
      </BrandingProvider>
    </I18nextProvider>,
  );
  await screen.findByRole("heading", { name: "Apunta-t'hi" });
  if (!path.endsWith("/enviada")) await screen.findByText(/Pas \d de \d/u);
  return { i18n, navigate };
}

function fillPerson(
  idDocument = "12345678Z",
  email = "new@example.test",
  birthDate = "05/04/1992",
) {
  fireEvent.change(screen.getByLabelText("DNI / NIE"), { target: { value: idDocument } });
  fireEvent.change(screen.getByLabelText("Nom", { exact: true }), {
    target: { value: "Nora" },
  });
  fireEvent.change(screen.getByLabelText("Cognom 1"), { target: { value: "Soler" } });
  fireEvent.change(screen.getByLabelText("Data de naixement"), {
    target: { value: birthDate },
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

/** A complete public draft (fictional applicant) ready for step 19. */
function seedDraft(
  overrides: Record<string, unknown> = {},
  person: Record<string, unknown> = {},
): void {
  sessionStorage.setItem(
    DRAFT_KEY,
    JSON.stringify({
      additionalDogOption: "TODAY",
      consentVersion: "",
      dog: {
        birthMonth: "03/2022",
        breed: "Mestís",
        chip: "941000012345678",
        documents: [{ files: [], type: "VACCINATION_CARD" }],
        name: "Kiwi",
        notesToInstructors: "",
        sex: "FEMALE",
      },
      familyClaim: { dogName: "", holderName: "", leavePending: false },
      familyFound: false,
      imageConsent: false,
      mode: "public",
      passport: "",
      payment: { firstMonthOption: "TODAY", type: "SEPA_DD" },
      person: {
        address: { postalCode: "08349", street: "Carrer de la Font, 3", town: "Cabrera" },
        birthDate: "05/04/1992",
        emails: ["new@example.test", ""],
        firstName: "Nora",
        gender: "OTHER",
        idDocument: { type: "DNI", value: "12345678Z" },
        lastName1: "Soler",
        lastName2: "Pons",
        phones: [
          { label: "Mòbil", number: "612345678", prefix: "+34" },
          { label: "", number: "", prefix: "+34" },
        ],
        ...person,
      },
      planId: MEMBER_PLAN,
      privacyAccepted: false,
      savedAt: Date.now(),
      ...overrides,
    }),
  );
}

function savedDraft(): Record<string, unknown> {
  return JSON.parse(sessionStorage.getItem(DRAFT_KEY) ?? "{}") as Record<string, unknown>;
}

function recordRequests(): RecordedRequest[] {
  const recorded: RecordedRequest[] = [];
  server.events.on("request:start", ({ request }) => {
    const entry: RecordedRequest = {
      body: undefined,
      key: request.headers.get("Idempotency-Key"),
      method: request.method,
      path: new URL(request.url).pathname.replace(/^\/api\/v1/u, ""),
    };
    recorded.push(entry);
    if (request.method !== "GET") {
      void request
        .clone()
        .text()
        .then((text) => {
          entry.body = text === "" ? undefined : (JSON.parse(text) as unknown);
        });
    }
  });
  return recorded;
}

function requestsTo(recorded: RecordedRequest[], method: string, path: string): RecordedRequest[] {
  return recorded.filter((entry) => entry.method === method && entry.path === path);
}

async function lastBody(recorded: RecordedRequest[], path: string): Promise<Record<string, unknown>> {
  let body: unknown;
  await waitFor(() => {
    body = requestsTo(recorded, "POST", path).at(-1)?.body;
    expect(body).toBeDefined();
  });
  return body as Record<string, unknown>;
}

async function signupConfigJson(): Promise<SignupConfigJson> {
  mockScenario("signup");
  const response = await fetch(`${window.location.origin}/api/v1/signup`);
  return (await response.json()) as SignupConfigJson;
}

function apiErrorResponse(code: string, status: number, details: unknown = {}, headers?: HeadersInit) {
  return HttpResponse.json(
    { code, details, message: code, traceId: "test-trace" },
    { status, ...(headers === undefined ? {} : { headers }) },
  );
}

function acceptPrivacy() {
  fireEvent.click(screen.getByLabelText("Accepto la política de privacitat"));
}

function submitSignup() {
  fireEvent.click(screen.getByRole("button", { name: "ENVIA LA SOL·LICITUD" }));
}

beforeAll(() => {
  server.listen({ onUnhandledRequest: "error" });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  sessionStorage.clear();
  localStorage.clear();
  server.resetHandlers();
  server.events.removeAllListeners();
  resetSignupMockState();
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

    const saved = savedDraft();
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

  it("masks and validates the browser-independent birth date control", async () => {
    await renderSignup({ path: "/apuntat-hi" });
    const birthDate = screen.getByLabelText("Data de naixement");
    expect(birthDate).toHaveAttribute("type", "text");
    expect(birthDate).toHaveAttribute("placeholder", "dd/mm/aaaa");

    fillPerson("12345678Z", "new@example.test", "31021992");
    expect(birthDate).toHaveValue("31/02/1992");
    fireEvent.click(screen.getByRole("button", { name: "CONTINUA" }));
    expect(await screen.findByText("La data no és vàlida.")).toBeVisible();
  });

  it("M2 checks the ES postal code and a past birth date from 1900 before any request", async () => {
    const recorded = recordRequests();
    await renderSignup({ path: "/apuntat-hi" });
    fillPerson("12345678Z", "new@example.test", "01011899");
    fireEvent.change(screen.getByLabelText("CP", { exact: true }), { target: { value: "0834" } });
    fireEvent.click(screen.getByRole("button", { name: "CONTINUA" }));
    expect(await screen.findByText("La data no és vàlida.")).toBeVisible();
    expect(screen.getByText("El codi postal no és vàlid.")).toBeVisible();

    fireEvent.change(screen.getByLabelText("Data de naixement"), {
      target: { value: "01012999" },
    });
    fireEvent.click(screen.getByRole("button", { name: "CONTINUA" }));
    expect(await screen.findByText("La data no és vàlida.")).toBeVisible();
    expect(requestsTo(recorded, "POST", "/signup/identity-checks")).toHaveLength(0);
  });

  it("focuses the first error after it renders and links each field to its message", async () => {
    await renderSignup({ path: "/apuntat-hi" });
    fireEvent.click(screen.getByRole("button", { name: "CONTINUA" }));

    const document = screen.getByLabelText("DNI / NIE");
    await waitFor(() => {
      expect(document).toHaveFocus();
    });
    expect(document).toHaveAttribute("aria-invalid", "true");
    expect(document).toHaveAttribute("aria-describedby", "signup-id-error");
    expect(window.document.getElementById("signup-id-error")).toHaveTextContent(
      "Aquest camp és obligatori.",
    );
    expect(screen.getByLabelText("Email", { exact: true })).toHaveAttribute(
      "aria-describedby",
      "signup-email-error",
    );
  });

  it("keeps fields typed while the town lookup is in flight", async () => {
    let lookupStarted = false;
    let releaseLookup: () => void = () => undefined;
    server.use(
      http.get("*/api/v1/signup/towns", async () => {
        lookupStarted = true;
        await new Promise<void>((resolve) => {
          releaseLookup = resolve;
        });
        return HttpResponse.json([{ name: "Cabrera de Mar", region: "Barcelona" }]);
      }),
    );
    await renderSignup({ path: "/apuntat-hi" });
    const postalCode = screen.getByLabelText("CP", { exact: true });
    fireEvent.change(postalCode, { target: { value: "08349" } });
    fireEvent.blur(postalCode);
    await waitFor(() => {
      expect(lookupStarted).toBe(true);
    });
    fireEvent.change(screen.getByLabelText("Carrer i número"), {
      target: { value: "Carrer Nou, 1" },
    });
    releaseLookup();

    await waitFor(() => {
      expect(screen.getByLabelText("Població (proposada pel CP)")).toHaveValue("Cabrera de Mar");
    });
    expect(screen.getByLabelText("Carrer i número")).toHaveValue("Carrer Nou, 1");
  });

  it("GENERIC profile: the first document type of the profile and an editable prefix", async () => {
    const recorded = recordRequests();
    await renderSignup({ branding: genericBranding(), path: "/apuntat-hi" });
    expect(screen.getByLabelText("Tipus de document")).toHaveValue("PASSPORT");
    expect(
      within(screen.getByLabelText("Tipus de document")).getAllByRole("option").map((option) =>
        option.getAttribute("value"),
      ),
    ).toEqual(["PASSPORT", "OTHER"]);
    const prefix = screen.getAllByLabelText("Prefix")[0];
    if (prefix === undefined) throw new TypeError("Missing phone prefix");
    expect(prefix.tagName).toBe("INPUT");
    fireEvent.change(prefix, { target: { value: "+376" } });
    expect(prefix).toHaveValue("+376");

    fireEvent.change(screen.getByLabelText("Document d'identitat"), {
      target: { value: "ab12345" },
    });
    fireEvent.change(screen.getByLabelText("Nom", { exact: true }), { target: { value: "Nora" } });
    fireEvent.change(screen.getByLabelText("Cognom 1"), { target: { value: "Soler" } });
    fireEvent.change(screen.getByLabelText("Data de naixement"), {
      target: { value: "05/04/1992" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Altres / No binari" }));
    fireEvent.change(screen.getByLabelText("Email", { exact: true }), {
      target: { value: "generic@example.test" },
    });
    fireEvent.change(screen.getByLabelText("Telèfon", { exact: true }), {
      target: { value: "612345" + "678" },
    });
    fireEvent.change(screen.getByLabelText("Carrer i número"), { target: { value: "Carrer 1" } });
    fireEvent.change(screen.getByLabelText("CP", { exact: true }), { target: { value: "AD500" } });
    fireEvent.change(screen.getByLabelText("Població (proposada pel CP)"), {
      target: { value: "Poble" },
    });
    fireEvent.click(screen.getByRole("button", { name: "CONTINUA" }));

    const body = await lastBody(recorded, "/signup/identity-checks");
    expect(body.idDocument).toEqual({ type: "PASSPORT", value: "AB12345" });
  });
});

describe("T-04-30 signup dog, uploads, plans and module gates", () => {
  it("uploads sequentially named vaccination pages and renders API plans", async () => {
    await renderSignup({ path: "/apuntat-hi/gos" });
    fireEvent.change(screen.getByLabelText("Nom del gos"), { target: { value: "Kiwi" } });
    fireEvent.change(screen.getByLabelText("Raça"), { target: { value: "Mestís" } });
    const birthMonth = screen.getByLabelText("Naix.");
    expect(birthMonth).toHaveAttribute("type", "text");
    expect(birthMonth).toHaveAttribute("placeholder", "mm/aaaa");
    fireEvent.change(birthMonth, { target: { value: "032022" } });
    expect(birthMonth).toHaveValue("03/2022");
    fireEvent.change(screen.getByLabelText("Núm. de xip"), {
      target: { value: "941000012345678" },
    });

    const vaccinationCard = screen.getByLabelText("Cartilla de vacunes");
    expect(vaccinationCard).toHaveAttribute("type", "file");
    expect(vaccinationCard).toHaveClass("signup-file-input");
    expect(
      screen.getByText("Cartilla de vacunes", { selector: ".signup-file-control span" }),
    ).toBeVisible();
    fireEvent.change(vaccinationCard, {
      target: { files: [new File(["page-1"], "scan.jpg", { type: "image/jpeg" })] },
    });
    expect(await screen.findByText("cartilla_Kiwi_1.jpg pujada")).toBeVisible();
    fireEvent.change(vaccinationCard, {
      target: { files: [new File(["page-2"], "scan.pdf", { type: "application/pdf" })] },
    });
    expect(await screen.findByText("cartilla_Kiwi_2.pdf pujada")).toBeVisible();

    expect(screen.getByText("Abonat")).toBeVisible();
    expect(screen.getByText("Pack 6")).toBeVisible();
    expect(screen.getByText("Pack 10")).toBeVisible();
    expect(screen.getByText("Teràpia")).toBeVisible();
    const memberPlan = screen.getByRole("button", { name: "Selecciona Abonat" });
    expect(within(memberPlan).getByText("Abonat").closest(".signup-plan__head")).toContainElement(
      within(memberPlan).getByText(/60,00\s€\/mes/u),
    );
    expect(
      within(screen.getByRole("button", { name: "Selecciona Pack 6" })).getByText("Pack 6"),
    ).toBeVisible();
    const therapyPlan = screen.getByRole("button", { name: "Selecciona Teràpia" });
    expect(within(therapyPlan).queryByText(/^Entrada 50,00\s€$/u)).not.toBeInTheDocument();
    expect(within(therapyPlan).getByText(/Entrada a compte: 50,00\s€/u)).toBeVisible();
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

  it("gates offerLabel by FAMILY_GROUP even when the configuration sends it", async () => {
    const config = await signupConfigJson();
    server.use(http.get("*/api/v1/signup", () => HttpResponse.json(config)));
    await renderSignup({ path: "/apuntat-hi/gos", scenario: "signupNoFamily" });
    expect(await screen.findByText("Abonat")).toBeVisible();
    expect(
      screen.queryByText("Ofertes si es porta més d'un gos per família"),
    ).not.toBeInTheDocument();
  });

  it("validates and normalises the chip per country profile and the birth month", async () => {
    const navigate = vi.fn();
    seedDraft();
    await renderSignup({ navigate, path: "/apuntat-hi/gos" });
    const chip = screen.getByLabelText("Núm. de xip");
    fireEvent.change(chip, { target: { value: "94100001234567" } });
    fireEvent.change(screen.getByLabelText("Naix."), { target: { value: "122999" } });
    fireEvent.click(screen.getByRole("button", { name: "CONTINUA" }));
    expect(await screen.findByText("El número de xip no és vàlid.")).toBeVisible();
    expect(screen.getByText("El mes de naixement no és vàlid.")).toBeVisible();
    expect(navigate).not.toHaveBeenCalled();

    fireEvent.change(chip, { target: { value: "941 000-012 345 679" } });
    fireEvent.change(screen.getByLabelText("Naix."), { target: { value: "032022" } });
    fireEvent.click(screen.getByRole("button", { name: "CONTINUA" }));
    expect(navigate).toHaveBeenCalledWith("/apuntat-hi/familia");
    await waitFor(() => {
      expect((savedDraft().dog as Record<string, unknown>).chip).toBe("941000012345679");
    });

    cleanup();
    navigate.mockClear();
    seedDraft();
    await renderSignup({ branding: genericBranding(), navigate, path: "/apuntat-hi/gos" });
    fireEvent.change(screen.getByLabelText("Núm. de xip"), { target: { value: "AB-12" } });
    fireEvent.click(screen.getByRole("button", { name: "CONTINUA" }));
    expect(await screen.findByText("El número de xip no és vàlid.")).toBeVisible();
    fireEvent.change(screen.getByLabelText("Núm. de xip"), { target: { value: "ab-123-456" } });
    fireEvent.click(screen.getByRole("button", { name: "CONTINUA" }));
    expect(navigate).toHaveBeenCalledWith("/apuntat-hi/familia");
  });

  it("keeps fields typed while an upload is in flight", async () => {
    let putStarted = false;
    let releasePut: () => void = () => undefined;
    server.use(
      http.put("https://uploads.example.test/*", async () => {
        putStarted = true;
        await new Promise<void>((resolve) => {
          releasePut = resolve;
        });
        return new HttpResponse(null, { status: 200 });
      }),
    );
    await renderSignup({ path: "/apuntat-hi/gos" });
    fireEvent.change(screen.getByLabelText("Nom del gos"), { target: { value: "Kiwi" } });
    fireEvent.change(screen.getByLabelText("Cartilla de vacunes"), {
      target: { files: [new File(["page-1"], "scan.jpg", { type: "image/jpeg" })] },
    });
    await waitFor(() => {
      expect(putStarted).toBe(true);
    });
    fireEvent.change(screen.getByLabelText("Núm. de xip"), {
      target: { value: "941000012345678" },
    });
    releasePut();

    expect(await screen.findByText("cartilla_Kiwi_1.jpg pujada")).toBeVisible();
    expect(screen.getByLabelText("Núm. de xip")).toHaveValue("941000012345678");
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
    expect(
      await screen.findByText(
        "Grup trobat: Marta R. El gos nou quedarà vinculat al seu grup familiar.",
      ),
    ).toBeVisible();
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
  });

  it("keeps the dog draft when returning from the family step", async () => {
    await renderSignup({ path: "/apuntat-hi/gos" });
    fireEvent.change(screen.getByLabelText("Nom del gos"), { target: { value: "Kiwi" } });
    fireEvent.change(screen.getByLabelText("Raça"), { target: { value: "Mestís" } });
    fireEvent.change(screen.getByLabelText("Naix."), { target: { value: "03/2022" } });
    fireEvent.change(screen.getByLabelText("Núm. de xip"), {
      target: { value: "941000012345678" },
    });
    fireEvent.click(screen.getByRole("button", { name: "CONTINUA" }));
    expect(await screen.findByLabelText("Nom del responsable")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Torna al pas anterior" }));
    expect(await screen.findByLabelText("Nom del gos")).toHaveValue("Kiwi");
  });

  it("prefills the account holder with the group holder when the group is found (R-04-10)", async () => {
    seedDraft();
    await renderSignup({ path: "/apuntat-hi/familia" });
    fireEvent.change(screen.getByLabelText("Nom del responsable"), {
      target: { value: "Marta Roca" },
    });
    fireEvent.change(screen.getByLabelText("Nom d'un dels seus gossos"), {
      target: { value: "Kiwi" },
    });
    fireEvent.click(screen.getByRole("button", { name: "CONTINUA" }));
    await screen.findByText(/Grup trobat/u);
    fireEvent.click(screen.getByRole("button", { name: "CONTINUA" }));
    expect(await screen.findByLabelText("Titular del compte")).toHaveValue("Marta Roca");
  });
});

describe("T-04-32 signup payment, checkout and add-dog mode", () => {
  it("renders API totals and payment conditions and submits only after privacy consent", async () => {
    const navigate = vi.fn();
    let submittedBody: unknown;
    seedDraft({ dog: { birthMonth: "03/2022", breed: "Mestís", chip: "941000012345678", documents: [{ files: [], type: "VACCINATION_CARD" }], name: "Kiwi", sex: "FEMALE" } });
    server.use(
      http.post("*/api/v1/signup", async ({ request }) => {
        submittedBody = await request.json();
        return HttpResponse.json(
          {
            checkout: { required: false },
            memberId: "member-signup-iso-test",
            signupToken: "mock-signup-token",
            upfront: {
              firstMonthOptions: [],
              firstMonthSplitDay: 16,
              lines: [],
              today: "2026-08-17",
              totalDue: { amountMinor: 0, currency: "EUR" },
            },
          },
          { status: 201 },
        );
      }),
    );
    await renderSignup({ navigate, path: "/apuntat-hi/pagament" });
    const submit = screen.getByRole("button", { name: "ENVIA LA SOL·LICITUD" });

    expect(screen.getByText("Pagament dels rebuts mensuals")).toBeVisible();
    expect(screen.getByText("Entrada (1 gos)")).toBeVisible();
    expect(screen.getByText(/Alta avui, 17 d.agost \(mig mes\)/u)).toBeVisible();
    expect(screen.getByText(/Alta l.1 de setembre \(mes complet\)/u)).toBeVisible();
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

    acceptPrivacy();
    fireEvent.click(submit);
    await waitFor(() => {
      expect(navigate).toHaveBeenCalledWith("/apuntat-hi/enviada");
    });
    expect(submittedBody).toMatchObject({
      dog: { birthMonth: "2022-03" },
      person: { birthDate: "1992-04-05" },
    });
    expect(sessionStorage.getItem(DRAFT_KEY)).toBeNull();
  });

  it("shows each payment text only under its method (T-04-32, M7 web half)", async () => {
    seedDraft();
    await renderSignup({ path: "/apuntat-hi/pagament", scenario: "signupStripe" });
    expect(screen.getByText(/emetre rebuts sobre aquest compte/u)).toBeVisible();
    expect(screen.getByText(/abans del dia 25/u)).toBeVisible();
    expect(screen.queryByText(/períodes naturals complets/u)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Targeta" }));
    expect(screen.getByText(/Pagaràs amb targeta de forma segura/u)).toBeVisible();
    expect(screen.queryByText(/abans del dia 25/u)).not.toBeInTheDocument();
    expect(screen.queryByText(/períodes naturals complets/u)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Efectiu" }));
    expect(screen.getByText(/períodes naturals complets/u)).toBeVisible();
    expect(screen.queryByText(/abans del dia 25/u)).not.toBeInTheDocument();

    cleanup();
    seedDraft();
    await renderSignup({ path: "/apuntat-hi/pagament" });
    const upfront = document.querySelector<HTMLElement>(".signup-upfront");
    if (upfront === null) throw new TypeError("Missing upfront card");
    expect(
      within(upfront).getByText(
        "El pagament de l'entrada i el mes en curs es farà directament al club després d'enviar la sol·licitud.",
      ),
    ).toBeVisible();
  });

  it("redirects through checkout when Stripe is enabled", async () => {
    const navigate = vi.fn();
    seedDraft();
    await renderSignup({ navigate, path: "/apuntat-hi/pagament", scenario: "signupStripe" });
    expect(screen.getByRole("button", { name: "Targeta" })).toBeVisible();
    expect(screen.getByText("El pagament es fa en enviar")).toBeVisible();
    acceptPrivacy();
    submitSignup();
    await waitFor(() => {
      expect(navigate).toHaveBeenCalledWith("https://checkout.test/cs_mock_signup");
    });
  });

  it("uses the member plan and payment method and posts the add-dog flow", async () => {
    const navigate = vi.fn();
    await renderSignup({ addDog: true, navigate, path: "/gossos/nou/pagament" });
    expect(await screen.findByText(/Pas 2 de 2/u)).toBeVisible();
    expect(screen.getByLabelText("Mètode de pagament actual")).toHaveValue(
      "Domiciliació · ···· ···· ···· ···· 2231",
    );
    acceptPrivacy();
    submitSignup();
    await waitFor(() => {
      expect(navigate).toHaveBeenCalledWith("/gossos/nou/enviada");
    });
  });

  it("the add-dog success page does not promise a welcome email", async () => {
    await renderSignup({ addDog: true, path: "/gossos/nou/enviada" });
    expect(screen.getByRole("heading", { name: "Sol·licitud enviada" })).toBeVisible();
    expect(screen.getByText(/t'avisarem a l'app quan l'hagi validat/u)).toBeVisible();
    expect(screen.queryByText(/benvinguda/u)).not.toBeInTheDocument();
  });

  it("sends notesToInstructors from 17 and holderTaxId from 19 (§2, §3)", async () => {
    const navigate = vi.fn();
    const recorded = recordRequests();
    seedDraft();
    await renderSignup({ navigate, path: "/apuntat-hi/gos" });
    fireEvent.change(screen.getByLabelText("Notes als instructors (opcional)"), {
      target: { value: "Iniciar-nos a l'agility" },
    });
    fireEvent.click(screen.getByRole("button", { name: "CONTINUA" }));
    fireEvent.click(await screen.findByRole("button", { name: "CONTINUA" }));
    fireEvent.change(await screen.findByLabelText("NIF del titular (opcional)"), {
      target: { value: "12345678z" },
    });
    acceptPrivacy();
    submitSignup();
    await waitFor(() => {
      expect(navigate).toHaveBeenCalledWith("/apuntat-hi/enviada");
    });
    const body = await lastBody(recorded, "/signup");
    expect(body.dog).toMatchObject({ notesToInstructors: "Iniciar-nos a l'agility" });
    expect(body.payment).toMatchObject({ holderTaxId: "12345678Z", holderName: "Nora Soler Pons" });
  });

  it("drops the IBAN from the session draft when the method changes away from SEPA", async () => {
    seedDraft();
    await renderSignup({ path: "/apuntat-hi/pagament" });
    fireEvent.change(screen.getByLabelText("IBAN"), { target: { value: VALID_IBAN } });
    await waitFor(() => {
      expect(sessionStorage.getItem(DRAFT_KEY)).toContain(VALID_IBAN);
    });
    fireEvent.click(screen.getByRole("button", { name: "Efectiu" }));
    await waitFor(() => {
      expect(sessionStorage.getItem(DRAFT_KEY)).not.toContain(VALID_IBAN);
    });
    fireEvent.click(screen.getByRole("button", { name: "Domiciliació" }));
    expect(screen.getByLabelText("IBAN")).toHaveValue("");
  });

  it("checks the IBAN mod-97 before sending", async () => {
    const recorded = recordRequests();
    seedDraft();
    await renderSignup({ path: "/apuntat-hi/pagament" });
    fireEvent.change(screen.getByLabelText("IBAN"), {
      target: { value: "ES91 2100 0418 4502 0005 1333" },
    });
    acceptPrivacy();
    submitSignup();
    const iban = screen.getByLabelText("IBAN");
    await waitFor(() => {
      expect(iban).toHaveFocus();
    });
    expect(window.document.getElementById("signup-iban-error")).toHaveTextContent(
      "El número de compte bancari no és vàlid.",
    );
    expect(requestsTo(recorded, "POST", "/signup")).toHaveLength(0);
  });

  it("omits planId and planIdRequested when the club has no signup plans (R-04-09)", async () => {
    const config = await signupConfigJson();
    server.use(
      http.get("*/api/v1/signup", ({ request }) =>
        HttpResponse.json({
          ...config,
          member: request.headers.has("Authorization") ? { consentsUpToDate: true } : undefined,
          plans: [],
        }),
      ),
      http.post("*/api/v1/signup", () => HttpResponse.json(SIGNUP_RESULT, { status: 201 })),
    );
    const recorded = recordRequests();
    seedDraft({ planId: "" });
    const navigate = vi.fn();
    await renderSignup({ navigate, path: "/apuntat-hi/pagament" });
    acceptPrivacy();
    submitSignup();
    await waitFor(() => {
      expect(navigate).toHaveBeenCalledWith("/apuntat-hi/enviada");
    });
    expect(await lastBody(recorded, "/signup")).not.toHaveProperty("planId");

    cleanup();
    sessionStorage.clear();
    await renderSignup({ addDog: true, navigate, path: "/gossos/nou/pagament" });
    submitSignup();
    await waitFor(() => {
      expect(navigate).toHaveBeenCalledWith("/gossos/nou/enviada");
    });
    expect(await lastBody(recorded, "/me/dogs/signup")).not.toHaveProperty("planIdRequested");
  });

  it("hides the honeypot from assistive technology and the tab order", async () => {
    seedDraft();
    await renderSignup({ path: "/apuntat-hi/pagament" });
    const honeypot = document.getElementById("signup-website");
    expect(honeypot).toHaveAttribute("tabindex", "-1");
    expect(honeypot?.closest("label")).toHaveAttribute("aria-hidden", "true");
    expect(screen.queryByRole("textbox", { name: "Lloc web" })).not.toBeInTheDocument();
  });

  it("reads the image-consent text from texts.imageConsent, then legal.imageConsentText", async () => {
    const config = await signupConfigJson();
    let imageConsent = "Text de la configuració del formulari.";
    server.use(
      http.get("*/api/v1/signup", () =>
        HttpResponse.json({
          ...config,
          legal: { ...config.legal, imageConsentText: "Text legal del club." },
          texts: { ...config.texts, imageConsent },
        }),
      ),
    );
    seedDraft();
    await renderSignup({ path: "/apuntat-hi/pagament" });
    fireEvent.click(screen.getByRole("button", { name: "què vol dir?" }));
    expect(screen.getByText("Text de la configuració del formulari.")).toBeVisible();

    cleanup();
    imageConsent = "";
    seedDraft();
    await renderSignup({ path: "/apuntat-hi/pagament" });
    fireEvent.click(screen.getByRole("button", { name: "què vol dir?" }));
    expect(screen.getByText("Text legal del club.")).toBeVisible();
  });
});

describe("B1 identity document at submission (R-04-01)", () => {
  it.each([
    ["DNI", { idDocument: { type: "DNI", value: "12345678z" } }, "", { type: "DNI", value: "12345678Z" }],
    ["NIE", { idDocument: { type: "DNI", value: "x1234567-l" } }, "", { type: "NIE", value: "X1234567L" }],
    ["passport only", { idDocument: { type: "DNI", value: "" } }, "ab1234567", { type: "PASSPORT", value: "AB1234567" }],
  ])("submits a %s applicant with the identity-check document", async (_label, person, passport, expected) => {
    const navigate = vi.fn();
    const recorded = recordRequests();
    seedDraft({ passport }, person);
    await renderSignup({ navigate, path: "/apuntat-hi/pagament" });
    acceptPrivacy();
    submitSignup();
    await waitFor(() => {
      expect(navigate).toHaveBeenCalledWith("/apuntat-hi/enviada");
    });
    const body = await lastBody(recorded, "/signup");
    expect((body.person as Record<string, unknown>).idDocument).toEqual(expected);
  });
});

describe("M1 stable retries (CONVENCIONS_API §7, R-04-26/27)", () => {
  it("retries a lost 201 with the same Idempotency-Key and gets the same 201", async () => {
    let committedKey: string | null | undefined;
    server.use(
      http.post("*/api/v1/signup", ({ request }) => {
        const key = request.headers.get("Idempotency-Key");
        if (committedKey === undefined) {
          committedKey = key;
          return HttpResponse.error();
        }
        return key === committedKey
          ? HttpResponse.json(SIGNUP_RESULT, { status: 201 })
          : apiErrorResponse("SIGNUP_ALREADY_PENDING", 422);
      }),
    );
    const navigate = vi.fn();
    const recorded = recordRequests();
    seedDraft();
    await renderSignup({ navigate, path: "/apuntat-hi/pagament" });
    acceptPrivacy();
    submitSignup();
    expect(await screen.findByText("No s'ha pogut completar l'acció.")).toBeVisible();
    submitSignup();
    await waitFor(() => {
      expect(navigate).toHaveBeenCalledWith("/apuntat-hi/enviada");
    });
    const keys = requestsTo(recorded, "POST", "/signup").map((entry) => entry.key);
    expect(keys).toHaveLength(2);
    expect(keys[0]).toBeTruthy();
    expect(keys[1]).toBe(keys[0]);
  });

  it("changing a payload field after a failure uses a new key", async () => {
    server.use(
      http.post("*/api/v1/signup", () => apiErrorResponse("INVALID_IBAN", 400)),
    );
    const recorded = recordRequests();
    seedDraft({ payment: { firstMonthOption: "TODAY", type: "SEPA_DD", iban: VALID_IBAN } });
    await renderSignup({ path: "/apuntat-hi/pagament" });
    acceptPrivacy();
    submitSignup();
    await screen.findByText("El número de compte bancari no és vàlid.");
    fireEvent.change(screen.getByLabelText("Titular del compte"), { target: { value: "Nora Soler" } });
    submitSignup();
    await waitFor(() => {
      expect(requestsTo(recorded, "POST", "/signup")).toHaveLength(2);
    });
    const keys = requestsTo(recorded, "POST", "/signup").map((entry) => entry.key);
    expect(keys[1]).not.toBe(keys[0]);
  });

  it("add-dog: a lost 201 is replayed, never DOG_CHIP_ALREADY_REGISTERED for the member's own dog", async () => {
    let committedKey: string | null | undefined;
    server.use(
      http.post("*/api/v1/me/dogs/signup", ({ request }) => {
        const key = request.headers.get("Idempotency-Key");
        if (committedKey === undefined) {
          committedKey = key;
          return HttpResponse.error();
        }
        return key === committedKey
          ? HttpResponse.json(
              { checkout: { memberId: "member-signup-357", required: false }, dogId: "dog-new" },
              { status: 201 },
            )
          : apiErrorResponse("DOG_CHIP_ALREADY_REGISTERED", 422);
      }),
    );
    const navigate = vi.fn();
    await renderSignup({ addDog: true, navigate, path: "/gossos/nou/pagament" });
    acceptPrivacy();
    submitSignup();
    expect(await screen.findByText("No s'ha pogut completar l'acció.")).toBeVisible();
    submitSignup();
    await waitFor(() => {
      expect(navigate).toHaveBeenCalledWith("/gossos/nou/enviada");
    });
    expect(screen.queryByText("El xip d'aquest gos ja està registrat.")).not.toBeInTheDocument();
  });

  it("a cancelled checkout returns to 19 with the data and retries only the checkout", async () => {
    const navigate = vi.fn();
    const recorded = recordRequests();
    seedDraft({ payment: { firstMonthOption: "TODAY", holderName: "Nora Soler Pons", iban: VALID_IBAN, type: "SEPA_DD" } });
    await renderSignup({ navigate, path: "/apuntat-hi/pagament", scenario: "signupStripe" });
    acceptPrivacy();
    submitSignup();
    await waitFor(() => {
      expect(navigate).toHaveBeenCalledWith("https://checkout.test/cs_mock_signup");
    });
    await waitFor(() => {
      expect(savedDraft().submission).toMatchObject({
        memberId: "member-signup-357",
        signupToken: "mock-signup-token",
      });
    });

    cleanup();
    navigate.mockClear();
    await renderSignup({
      navigate,
      path: "/apuntat-hi/enviada?cs=cancel",
      scenario: "signupStripe",
    });
    expect(screen.getByText(/El pagament no s'ha completat/u)).toBeVisible();
    expect(screen.getByLabelText("IBAN")).toHaveValue(VALID_IBAN);
    expect(screen.getByLabelText("Accepto la política de privacitat")).toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: "PAGA ARA" }));
    await waitFor(() => {
      expect(navigate).toHaveBeenCalledWith("https://checkout.test/cs_mock_signup");
    });
    expect(requestsTo(recorded, "POST", "/signup")).toHaveLength(1);
    const checkouts = requestsTo(recorded, "POST", "/checkout-sessions");
    expect(checkouts).toHaveLength(2);
    expect(await lastBody(recorded, "/checkout-sessions")).toMatchObject({
      cancelUrl: `${window.location.origin}/apuntat-hi/pagament?cs=cancel`,
      memberId: "member-signup-357",
      signupToken: "mock-signup-token",
    });
    expect(checkouts[1]?.key).not.toBe(checkouts[0]?.key);
  });
});

describe("M2 api errors land on their field and step (§2, CATALEG_ERRORS)", () => {
  const cases: {
    code: string;
    details?: unknown;
    field?: string;
    fieldText?: string;
    focus?: string;
    headers?: HeadersInit;
    path?: string;
    status: number;
    text: string;
  }[] = [
    { code: "INVALID_ID_DOCUMENT", focus: "DNI / NIE", path: "/apuntat-hi", status: 400, text: "El document d'identitat no és vàlid." },
    { code: "ID_DOCUMENT_AMBIGUOUS", focus: "DNI / NIE", path: "/apuntat-hi", status: 422, text: "El document d'identitat coincideix amb més d'un registre." },
    { code: "INVALID_PHONE", focus: "Telèfon", path: "/apuntat-hi", status: 400, text: "El telèfon no és vàlid." },
    { code: "INVALID_IBAN", focus: "IBAN", status: 400, text: "El número de compte bancari no és vàlid." },
    { code: "PLAN_NOT_AVAILABLE", focus: "Selecciona Abonat", path: "/apuntat-hi/gos", status: 422, text: "Aquest pla no està disponible." },
    { code: "DOG_DOCUMENT_REQUIRED", focus: "Cartilla de vacunes", path: "/apuntat-hi/gos", status: 422, text: "Cal un document per a aquest gos." },
    { code: "FILE_NOT_FOUND", focus: "Cartilla de vacunes", path: "/apuntat-hi/gos", status: 400, text: "No s'ha trobat el fitxer." },
    { code: "DOG_CHIP_ALREADY_REGISTERED", focus: "Núm. de xip", path: "/apuntat-hi/gos", status: 422, text: "El xip d'aquest gos ja està registrat." },
    { code: "FAMILY_HOLDER_NOT_FOUND", focus: "Nom del responsable", path: "/apuntat-hi/familia", status: 422, text: "No s'ha trobat el titular del grup familiar." },
    { code: "CONSENT_VERSION_OUTDATED", focus: "Accepto la política de privacitat", status: 422, text: "La política ha canviat. Revisa-la i torna a acceptar-la." },
    { code: "MEMBER_ALREADY_EXISTS", path: "/apuntat-hi", status: 409, text: "Aquest abonat ja existeix." },
    { code: "SIGNUP_ALREADY_PENDING", path: "/apuntat-hi", status: 422, text: "Ja tenim una sol·licitud pendent amb aquestes dades; el club la revisarà aviat." },
    { code: "SIGNUP_CLOSED", status: 422, text: "En aquest moment no es poden enviar sol·licituds d'alta." },
    { code: "RATE_LIMITED", headers: { "Retry-After": "120" }, status: 429, text: "Massa intents. Torna-ho a provar d'aquí a 120 s." },
    { code: "PAYMENT_METHOD_NOT_AVAILABLE", status: 422, text: "Aquest mètode de pagament no està disponible." },
    { code: "SOMETHING_NEW", status: 422, text: "No s'ha pogut completar l'acció." },
    {
      code: "VALIDATION_ERROR",
      details: { fieldErrors: [{ code: "INVALID_EMAIL", field: "person.emails[0]" }, { code: "REQUIRED", field: "dog.chip" }] },
      focus: "Email",
      path: "/apuntat-hi",
      status: 400,
      text: "El correu electrònic no és vàlid.",
    },
    {
      code: "VALIDATION_ERROR",
      details: { fieldErrors: [{ code: "REQUIRED", field: "dog.chip" }] },
      focus: "Núm. de xip",
      path: "/apuntat-hi/gos",
      status: 400,
      text: "Aquest camp és obligatori.",
    },
  ];

  it.each(cases)("$code ($status) → $path", async ({ code, details, focus, headers, path, status, text }) => {
    server.use(
      http.post("*/api/v1/signup", () => apiErrorResponse(code, status, details ?? {}, headers)),
    );
    const navigate = vi.fn();
    const recorded = recordRequests();
    seedDraft();
    await renderSignup({ navigate, path: "/apuntat-hi/pagament" });
    acceptPrivacy();
    submitSignup();

    const message = await screen.findByText(text);
    expect(message).toBeVisible();
    if (path === undefined) {
      expect(navigate).not.toHaveBeenCalled();
    } else {
      expect(navigate).toHaveBeenLastCalledWith(path);
    }
    if (focus !== undefined) {
      const field =
        focus.startsWith("Selecciona")
          ? screen.getByRole("button", { name: focus })
          : screen.getByLabelText(focus, { exact: true });
      await waitFor(() => {
        expect(field).toHaveFocus();
      });
      if (!focus.startsWith("Selecciona")) {
        const describedBy = field.getAttribute("aria-describedby") ?? "";
        expect(window.document.getElementById(describedBy)).toHaveTextContent(text);
      }
    } else if (code !== "SIGNUP_CLOSED") {
      await waitFor(() => {
        expect(message).toHaveFocus();
      });
    }
    if (code === "CONSENT_VERSION_OUTDATED") {
      expect(screen.getByLabelText("Accepto la política de privacitat")).not.toBeChecked();
    }
    if (code === "SIGNUP_CLOSED") {
      expect(screen.queryByRole("button", { name: "ENVIA LA SOL·LICITUD" })).not.toBeInTheDocument();
    }
    if (["CONSENT_VERSION_OUTDATED", "PLAN_NOT_AVAILABLE", "SIGNUP_CLOSED"].includes(code)) {
      await waitFor(() => {
        expect(requestsTo(recorded, "GET", "/signup").length).toBeGreaterThan(1);
      });
    }
  });
});

describe("M19 the consent version sent is the accepted one (R-04-17)", () => {
  it("clears an acceptance of other legal texts and sends the version accepted again", async () => {
    const config = await signupConfigJson();
    let version = "2026-09";
    server.use(
      http.get("*/api/v1/signup", () =>
        HttpResponse.json({ ...config, legal: { ...config.legal, legalTextsVersion: version } }),
      ),
      http.post("*/api/v1/signup", () => HttpResponse.json(SIGNUP_RESULT, { status: 201 })),
    );
    const navigate = vi.fn();
    const recorded = recordRequests();
    seedDraft();
    await renderSignup({ navigate, path: "/apuntat-hi/pagament" });
    acceptPrivacy();
    expect(screen.getByLabelText("Accepto la política de privacitat")).toBeChecked();

    version = "2027-01";
    fireEvent.change(screen.getByLabelText("Idioma"), { target: { value: "es" } });
    const privacy = document.getElementById("signup-privacy");
    await waitFor(() => {
      expect(privacy).not.toBeChecked();
    });
    expect(document.querySelector("button[type='submit']")).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Idioma"), { target: { value: "ca" } });
    await screen.findByText("Pagament dels rebuts mensuals");
    acceptPrivacy();
    submitSignup();
    await waitFor(() => {
      expect(navigate).toHaveBeenCalledWith("/apuntat-hi/enviada");
    });
    const body = await lastBody(recorded, "/signup");
    expect(body.consents).toEqual({
      imageUse: { granted: false, version: "2027-01" },
      privacyPolicy: { accepted: true, version: "2027-01" },
    });
  });

  it("a saved acceptance of an older version is not carried into the new texts", async () => {
    seedDraft({ consentVersion: "2026-08", privacyAccepted: true });
    await renderSignup({ path: "/apuntat-hi/pagament" });
    await waitFor(() => {
      expect(screen.getByLabelText("Accepto la política de privacitat")).not.toBeChecked();
    });
    expect(screen.getByRole("button", { name: "ENVIA LA SOL·LICITUD" })).toBeDisabled();
  });
});

/**
 * The production navigator is `window.location.assign`: a full page load. The stub keeps only what
 * a browser keeps (the session storage): the old page is unmounted and a fresh page mounts.
 */
function stubFullPageLoads(
  initialPath: string,
  { aborted = false, delayMs }: { aborted?: boolean; delayMs?: number } = {},
): string[] {
  const url = new URL(initialPath, window.location.origin);
  const loads: string[] = [];
  const assign = (next: string) => {
    const target = new URL(next, url);
    const path = `${target.pathname}${target.search}`;
    loads.push(path);
    // The address changes when the next document loads; until then the old one keeps running.
    const load = () => {
      url.href = target.href;
      cleanup();
      void renderSignup({ path, productionNavigator: true }).catch(() => undefined);
    };
    // An aborted navigation (or a Back before it finished) never loads the next document.
    if (aborted) return;
    if (delayMs === undefined) queueMicrotask(load);
    else setTimeout(load, delayMs);
  };
  vi.stubGlobal("location", {
    assign,
    get hash() {
      return url.hash;
    },
    get host() {
      return url.host;
    },
    get hostname() {
      return url.hostname;
    },
    get href() {
      return url.href;
    },
    get origin() {
      return url.origin;
    },
    get pathname() {
      return url.pathname;
    },
    get search() {
      return url.search;
    },
    replace: assign,
  });
  return loads;
}

describe("E3-W06 round 2", () => {
  it("#1 an INVALID_IBAN from 19 stays on 19, on the IBAN field (production navigator)", async () => {
    server.use(http.post("*/api/v1/signup", () => apiErrorResponse("INVALID_IBAN", 400)));
    seedDraft({ payment: { firstMonthOption: "TODAY", iban: VALID_IBAN, type: "SEPA_DD" } });
    const loads = stubFullPageLoads("/apuntat-hi/pagament");
    await renderSignup({ path: "/apuntat-hi/pagament", productionNavigator: true });
    acceptPrivacy();
    submitSignup();

    const iban = screen.getByLabelText("IBAN");
    await waitFor(() => {
      expect(iban).toHaveFocus();
    });
    expect(iban).toHaveAttribute("aria-describedby", "signup-iban-error");
    expect(document.getElementById("signup-iban-error")).toHaveTextContent(
      "El número de compte bancari no és vàlid.",
    );
    expect(loads).toEqual([]);
    await waitFor(() => {
      expect(savedDraft()).not.toHaveProperty("pendingError");
    });
  });

  it("#1 an INVALID_ID_DOCUMENT routed to 16 survives the full page load and focuses the document", async () => {
    server.use(http.post("*/api/v1/signup", () => apiErrorResponse("INVALID_ID_DOCUMENT", 400)));
    seedDraft();
    const loads = stubFullPageLoads("/apuntat-hi/pagament");
    await renderSignup({ path: "/apuntat-hi/pagament", productionNavigator: true });
    acceptPrivacy();
    submitSignup();

    await waitFor(() => {
      expect(loads).toEqual(["/apuntat-hi"]);
    });
    // A fresh page: only the session storage came through the load.
    const document = await screen.findByLabelText("DNI / NIE");
    await waitFor(() => {
      expect(document).toHaveFocus();
    });
    expect(document).toHaveAttribute("aria-describedby", "signup-id-error");
    expect(window.document.getElementById("signup-id-error")).toHaveTextContent(
      "El document d'identitat no és vàlid.",
    );
    expect(screen.getByText(/Pas 1 de 4/u)).toBeVisible();
    // Consumed once: a reload of 16 does not show it again.
    await waitFor(() => {
      expect(savedDraft()).not.toHaveProperty("pendingError");
    });
  });

  it("#2 after a cancelled checkout 19 is read-only and the retry charges the committed signup", async () => {
    const recorded = recordRequests();
    seedDraft({
      payment: { firstMonthOption: "TODAY", holderName: "Nora Soler Pons", iban: VALID_IBAN, type: "SEPA_DD" },
    });
    const navigate = vi.fn();
    await renderSignup({ navigate, path: "/apuntat-hi/pagament", scenario: "signupStripe" });
    acceptPrivacy();
    submitSignup();
    await waitFor(() => {
      expect(navigate).toHaveBeenCalledWith("https://checkout.test/cs_mock_signup");
    });
    const firstBody = await lastBody(recorded, "/signup");

    cleanup();
    navigate.mockClear();
    await renderSignup({ navigate, path: "/apuntat-hi/pagament?cs=cancel", scenario: "signupStripe" });
    expect(screen.getByLabelText("IBAN")).toHaveAttribute("readonly");
    expect(screen.getByLabelText("Titular del compte")).toHaveAttribute("readonly");
    expect(screen.getByLabelText("NIF del titular (opcional)")).toHaveAttribute("readonly");
    for (const method of ["Domiciliació", "Targeta", "Efectiu"]) {
      expect(screen.getByRole("button", { name: method })).toBeDisabled();
    }
    // E3-W08 round 2 #3: the committed start is a frozen line, no longer a choice.
    expect(screen.queryAllByRole("radio")).toEqual([]);
    expect(upfrontLines()).toContain("Alta avui, 17 d’agost (mig mes) 30,00 €");
    expect(screen.getByLabelText("Accepto la política de privacitat")).toBeDisabled();
    expect(screen.getByLabelText("Autoritzo l'ús de la meva imatge")).toBeDisabled();
    expect(screen.queryByRole("button", { name: "ENVIA LA SOL·LICITUD" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Efectiu" }));
    expect(screen.getByLabelText("IBAN")).toHaveValue(VALID_IBAN);
    expect((savedDraft().payment as Record<string, unknown>).type).toBe("SEPA_DD");
    expect((savedDraft().payment as Record<string, unknown>).firstMonthOption).toBe("TODAY");

    fireEvent.click(screen.getByRole("button", { name: "PAGA ARA" }));
    await waitFor(() => {
      expect(navigate).toHaveBeenCalledWith("https://checkout.test/cs_mock_signup");
    });
    expect(requestsTo(recorded, "POST", "/signup")).toHaveLength(1);
    expect(firstBody.payment).toMatchObject({ firstMonthOption: "TODAY", type: "SEPA_DD" });
    expect(await lastBody(recorded, "/checkout-sessions")).toMatchObject({
      memberId: "member-signup-357",
      signupToken: "mock-signup-token",
    });

    // Any step path shows 19 while the signup exists: 16–18 cannot change it any more.
    cleanup();
    await renderSignup({ navigate, path: "/apuntat-hi", scenario: "signupStripe" });
    expect(screen.getByRole("button", { name: "PAGA ARA" })).toBeVisible();
    expect(screen.queryByLabelText("DNI / NIE")).not.toBeInTheDocument();
  });

  it("#3 the fingerprint is a SHA-256 digest and the IBAN leaves the draft after a failed submission", async () => {
    server.use(http.post("*/api/v1/signup", () => HttpResponse.error()));
    seedDraft({ payment: { firstMonthOption: "TODAY", iban: VALID_IBAN, type: "SEPA_DD" } });
    await renderSignup({ path: "/apuntat-hi/pagament" });
    acceptPrivacy();
    submitSignup();
    expect(await screen.findByText("No s'ha pogut completar l'acció.")).toBeVisible();
    await waitFor(() => {
      expect((savedDraft().submission as Record<string, unknown> | undefined)?.fingerprint).toMatch(
        /^[0-9a-f]{64}$/u,
      );
    });

    fireEvent.click(screen.getByRole("button", { name: "Efectiu" }));
    await waitFor(() => {
      expect((savedDraft().payment as Record<string, unknown>).type).toBe("MANUAL");
    });
    const stored = sessionStorage.getItem(DRAFT_KEY) ?? "";
    expect(stored).not.toContain(VALID_IBAN);
    expect(stored).not.toContain(VALID_IBAN.slice(4));
  });

  it("#3 a config reload that drops SEPA removes the IBAN from the draft", async () => {
    const config = await signupConfigJson();
    server.use(
      http.get("*/api/v1/signup", () =>
        HttpResponse.json({
          ...config,
          paymentMethods: (config.paymentMethods as { type: string }[]).filter(
            (method) => method.type !== "SEPA_DD",
          ),
        }),
      ),
    );
    seedDraft({
      payment: { firstMonthOption: "TODAY", holderTaxId: "12345678Z", iban: VALID_IBAN, type: "SEPA_DD" },
    });
    await renderSignup({ path: "/apuntat-hi/pagament" });
    await waitFor(() => {
      expect((savedDraft().payment as Record<string, unknown>).type).toBe("MANUAL");
    });
    const stored = sessionStorage.getItem(DRAFT_KEY) ?? "";
    expect(stored).not.toContain(VALID_IBAN);
    expect(savedDraft().payment).not.toHaveProperty("holderTaxId");
  });

  it("#4 a cleared FOUND claim gives the account holder back to the applicant (R-04-10)", async () => {
    const navigate = vi.fn();
    seedDraft();
    await renderSignup({ navigate, path: "/apuntat-hi/familia" });
    fireEvent.change(screen.getByLabelText("Nom del responsable"), { target: { value: "Marta Roca" } });
    fireEvent.change(screen.getByLabelText("Nom d'un dels seus gossos"), { target: { value: "Kiwi" } });
    fireEvent.click(screen.getByRole("button", { name: "CONTINUA" }));
    await screen.findByText(/Grup trobat/u);
    await waitFor(() => {
      expect((savedDraft().payment as Record<string, unknown>).holderName).toBe("Marta Roca");
    });

    fireEvent.change(screen.getByLabelText("Nom del responsable"), { target: { value: "" } });
    fireEvent.change(screen.getByLabelText("Nom d'un dels seus gossos"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "CONTINUA" }));
    expect(navigate).toHaveBeenCalledWith("/apuntat-hi/pagament");
    expect(await screen.findByLabelText("Titular del compte")).toHaveValue("Nora Soler Pons");
  });

  it("#4 a holder typed by the applicant is kept when the claim changes", async () => {
    seedDraft({
      familyClaim: { dogName: "Kiwi", holderName: "Marta Roca", leavePending: false },
      familyFound: true,
      holderFromGroup: false,
      payment: { firstMonthOption: "TODAY", holderName: "Jan Soler", type: "SEPA_DD" },
    });
    await renderSignup({ path: "/apuntat-hi/familia" });
    fireEvent.change(screen.getByLabelText("Nom del responsable"), { target: { value: "" } });
    await waitFor(() => {
      expect(savedDraft().familyFound).toBe(false);
    });
    expect((savedDraft().payment as Record<string, unknown>).holderName).toBe("Jan Soler");
  });

  it("#5 the birth date is checked against the club's today, not the browser's", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    // The browser is one day ahead of the club (configuration `upfront.today` = 2026-08-17).
    vi.setSystemTime(new Date(2026, 7, 18, 10, 0, 0));
    const recorded = recordRequests();
    await renderSignup({ path: "/apuntat-hi" });
    fillPerson("12345678Z", "new@example.test", "17/08/2026");
    fireEvent.click(screen.getByRole("button", { name: "CONTINUA" }));
    expect(await screen.findByText("La data no és vàlida.")).toBeVisible();
    expect(requestsTo(recorded, "POST", "/signup/identity-checks")).toHaveLength(0);

    fireEvent.change(screen.getByLabelText("Data de naixement"), { target: { value: "16/08/2026" } });
    fireEvent.click(screen.getByRole("button", { name: "CONTINUA" }));
    await waitFor(() => {
      expect(requestsTo(recorded, "POST", "/signup/identity-checks")).toHaveLength(1);
    });
    expect(screen.queryByText("La data no és vàlida.")).not.toBeInTheDocument();
  });

  it("#5 the dog's birth month is checked against the club's month, not the browser's", async () => {
    const config = await signupConfigJson();
    server.use(
      http.get("*/api/v1/signup", () =>
        HttpResponse.json({
          ...config,
          upfront: { ...(config.upfront as Record<string, unknown>), today: "2026-08-31" },
        }),
      ),
    );
    vi.useFakeTimers({ toFake: ["Date"] });
    // The browser is already in September; the club is still on 31 August.
    vi.setSystemTime(new Date(2026, 8, 1, 10, 0, 0));
    const navigate = vi.fn();
    seedDraft();
    await renderSignup({ navigate, path: "/apuntat-hi/gos" });
    fireEvent.change(screen.getByLabelText("Naix."), { target: { value: "092026" } });
    fireEvent.click(screen.getByRole("button", { name: "CONTINUA" }));
    expect(await screen.findByText("El mes de naixement no és vàlid.")).toBeVisible();
    expect(navigate).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("Naix."), { target: { value: "082026" } });
    fireEvent.click(screen.getByRole("button", { name: "CONTINUA" }));
    expect(navigate).toHaveBeenCalledWith("/apuntat-hi/familia");
  });
});

function upfrontCard(): HTMLElement {
  const card = document.querySelector<HTMLElement>(".signup-upfront");
  if (card === null) throw new TypeError("Missing «Pagament inicial» card");
  return card;
}

/** The «Total a pagar al club» amount of the card. */
function upfrontTotal(): string {
  const total = within(upfrontCard()).getByText("Total a pagar al club").closest("p");
  return total?.querySelector("b")?.textContent ?? "";
}

function startOptions(): string[] {
  return within(upfrontCard())
    .queryAllByRole("radio")
    .map((radio) => (radio.closest("label")?.textContent ?? "").replaceAll(/\s+/gu, " ").trim());
}

describe("E3-W08 step 1: the «Pagament inicial» card is the selected plan's quote (R-04-14/15, T-04-32)", () => {
  it("05-08-2026 (before the split day): a full month today, half a month from the 16th", async () => {
    setSignupMockToday("2026-08-05");
    seedDraft();
    await renderSignup({ path: "/apuntat-hi/pagament" });
    expect(within(upfrontCard()).getByText("Entrada (1 gos)").closest("p")).toHaveTextContent(
      /100,00\s€/u,
    );
    expect(startOptions()).toEqual([
      "Alta avui, 5 d’agost (mes complet)60,00 €",
      "Alta el dia 16 d’agost (mig mes)30,00 €",
    ]);
    expect(within(upfrontCard()).getAllByRole("radio")[0]).toBeChecked();
    expect(upfrontTotal()).toBe("160,00 €");
  });

  it("17-08-2026: half a month today, the 1st of September in full, a 130 € total; the total is never sent", async () => {
    const navigate = vi.fn();
    const recorded = recordRequests();
    seedDraft();
    await renderSignup({ navigate, path: "/apuntat-hi/pagament" });
    expect(startOptions()).toEqual([
      "Alta avui, 17 d’agost (mig mes)30,00 €",
      "Alta l’1 de setembre (mes complet)60,00 €",
    ]);
    expect(upfrontTotal()).toBe("130,00 €");
    fireEvent.click(within(upfrontCard()).getAllByRole("radio")[1] ?? document.body);
    expect(upfrontTotal()).toBe("160,00 €");
    acceptPrivacy();
    submitSignup();
    await waitFor(() => {
      expect(navigate).toHaveBeenCalledWith("/apuntat-hi/enviada");
    });
    const body = await lastBody(recorded, "/signup");
    expect(body.payment).toMatchObject({ firstMonthOption: "ALTERNATIVE" });
    expect(JSON.stringify(body)).not.toMatch(/total|16000|160,00/iu);
  });

  it("31-12-2026: the alternative starts on the 1st of January (full month)", async () => {
    setSignupMockToday("2026-12-31");
    seedDraft();
    await renderSignup({ path: "/apuntat-hi/pagament" });
    expect(startOptions()).toEqual([
      "Alta avui, 31 de desembre (mig mes)30,00 €",
      "Alta l’1 de gener (mes complet)60,00 €",
    ]);
  });

  it("Pack 6: the pack line and no start options; Teràpia: its 50 € entry fee only", async () => {
    seedDraft({ planId: PACK_6_PLAN });
    await renderSignup({ path: "/apuntat-hi/pagament" });
    expect(within(upfrontCard()).getByText("Pack 6").closest("p")).toHaveTextContent(/135,00\s€/u);
    expect(within(upfrontCard()).queryByText("Entrada (1 gos)")).toBeNull();
    expect(startOptions()).toEqual([]);
    expect(upfrontTotal()).toBe("135,00 €");

    cleanup();
    seedDraft({ planId: THERAPY_PLAN });
    await renderSignup({ path: "/apuntat-hi/pagament" });
    expect(within(upfrontCard()).getByText("Entrada (1 gos)").closest("p")).toHaveTextContent(
      /50,00\s€/u,
    );
    expect(startOptions()).toEqual([]);
    expect(upfrontTotal()).toBe("50,00 €");
  });

  it("a zero line of the quote is hidden (no «Entrada 0,00 €»)", async () => {
    const config = await signupConfigJson();
    const upfront = config.upfront as { planQuotes: { lines: unknown[]; planId: string }[] };
    const pack = upfront.planQuotes.find((quote) => quote.planId === PACK_6_PLAN);
    pack?.lines.push({ amount: { amountMinor: 0, currency: "EUR" }, concept: "ENTRY_FEE" });
    server.use(http.get("*/api/v1/signup", () => HttpResponse.json(config)));
    seedDraft({ planId: PACK_6_PLAN });
    await renderSignup({ path: "/apuntat-hi/pagament" });
    expect(upfrontCard()).not.toHaveTextContent(/Entrada/u);
    expect(upfrontTotal()).toBe("135,00 €");
  });

  it("add-dog: on day 26 only TODAY (after billing.upfrontCutoffDay); on day 17 the 1st of next month pays the entry fee only", async () => {
    const navigate = vi.fn();
    const recorded = recordRequests();
    setSignupMockToday("2026-08-26");
    await renderSignup({ addDog: true, navigate, path: "/gossos/nou/pagament" });
    expect(startOptions()).toEqual(["Alta avui, 26 d’agost (quota addicional d'aquest mes)30,00 €"]);
    expect(upfrontTotal()).toBe("130,00 €");
    acceptPrivacy();
    submitSignup();
    await waitFor(() => {
      expect(navigate).toHaveBeenCalledWith("/gossos/nou/enviada");
    });
    expect(await lastBody(recorded, "/me/dogs/signup")).toMatchObject({ additionalDogOption: "TODAY" });

    cleanup();
    sessionStorage.clear();
    setSignupMockToday("2026-08-17");
    await renderSignup({ addDog: true, path: "/gossos/nou/pagament" });
    expect(startOptions()).toEqual([
      "Alta avui, 17 d’agost (quota addicional d'aquest mes)30,00 €",
      "Alta l’1 de setembre (ara només l'entrada)0,00 €",
    ]);
    fireEvent.click(within(upfrontCard()).getAllByRole("radio")[1] ?? document.body);
    expect(upfrontTotal()).toBe("100,00 €");
  });
});

/** The card's lines (label + amount), start options excluded. */
function upfrontLines(): string[] {
  return Array.from(upfrontCard().querySelectorAll(".signup-upfront__line")).map((line) =>
    Array.from(line.children)
      .map((part) => part.textContent.replaceAll(/\s+/gu, " ").trim())
      .join(" "),
  );
}

describe("E3-W08 round 2: the card after the signup exists, and the line concepts", () => {
  it("#3 submitted on 15-08 with a full month, retried on 16-08: the card keeps the frozen full month and its total", async () => {
    const navigate = vi.fn();
    setSignupMockToday("2026-08-15");
    seedDraft({ payment: { firstMonthOption: "TODAY", holderName: "Nora Soler Pons", iban: VALID_IBAN, type: "SEPA_DD" } });
    await renderSignup({ navigate, path: "/apuntat-hi/pagament", scenario: "signupStripe" });
    expect(startOptions()).toEqual([
      "Alta avui, 15 d’agost (mes complet)60,00 €",
      "Alta el dia 16 d’agost (mig mes)30,00 €",
    ]);
    acceptPrivacy();
    submitSignup();
    await waitFor(() => {
      expect(navigate).toHaveBeenCalledWith("https://checkout.test/cs_mock_signup");
    });

    // Stripe's cancel URL, on the next day: the live quote now offers half a month today.
    cleanup();
    setSignupMockToday("2026-08-16");
    await renderSignup({ navigate, path: "/apuntat-hi/pagament?cs=cancel", scenario: "signupStripe" });
    expect(upfrontLines()).toEqual(["Entrada (1 gos) 100,00 €", "Alta avui, 15 d’agost (mes complet) 60,00 €"]);
    expect(startOptions()).toEqual([]);
    expect(upfrontTotal()).toBe("160,00 €");
    expect(upfrontCard()).not.toHaveTextContent(/mig mes/u);
  });

  it("#3 the core's result shape (`additionalDog: null`, paid amounts) still renders the frozen card", async () => {
    const navigate = vi.fn();
    const eur = (amountMinor: number) => ({ amountMinor, currency: "EUR" });
    server.use(
      http.post("*/api/v1/signup", () =>
        HttpResponse.json(
          {
            checkout: { required: true },
            memberId: "member-signup-357",
            signupToken: "mock-signup-token",
            upfront: {
              additionalDog: null,
              lines: [
                { amount: eur(10000), concept: "ENTRY_FEE", id: "0c2461d2-e783-459a-b9cd-1d081c914501", paidAmount: eur(0), status: "DUE" },
                { amount: eur(3000), concept: "FIRST_MONTH", id: "0c2461d2-e783-459a-b9cd-1d081c914502", paidAmount: eur(0), status: "DUE" },
              ],
              totalDue: eur(13000),
            },
          },
          { status: 201 },
        ),
      ),
    );
    seedDraft({ payment: { firstMonthOption: "TODAY", holderName: "Nora Soler Pons", iban: VALID_IBAN, type: "SEPA_DD" } });
    await renderSignup({ navigate, path: "/apuntat-hi/pagament", scenario: "signupStripe" });
    acceptPrivacy();
    submitSignup();
    await waitFor(() => {
      expect(navigate).toHaveBeenCalledWith("https://checkout.test/cs_mock_signup");
    });
    cleanup();
    await renderSignup({ navigate, path: "/apuntat-hi/pagament?cs=cancel", scenario: "signupStripe" });
    expect(upfrontLines()).toEqual(["Entrada (1 gos) 100,00 €", "Alta avui, 17 d’agost (mig mes) 30,00 €"]);
    expect(upfrontTotal()).toBe("130,00 €");
  });

  it("#3 a committed add-dog shows the api's frozen additional-dog choice", async () => {
    const navigate = vi.fn();
    setSignupMockToday("2026-08-17");
    await renderSignup({ addDog: true, navigate, path: "/gossos/nou/pagament", scenario: "signupStripe" });
    acceptPrivacy();
    submitSignup();
    await waitFor(() => {
      expect(navigate).toHaveBeenCalledWith(expect.stringMatching(/^https:\/\/checkout\.test\//u));
    });
    cleanup();
    setSignupMockToday("2026-08-26");
    await renderSignup({ addDog: true, navigate, path: "/gossos/nou/pagament?cs=cancel", scenario: "signupStripe" });
    expect(upfrontLines()).toEqual([
      "Entrada (1 gos) 100,00 €",
      "Alta avui, 17 d’agost (quota addicional d'aquest mes) 30,00 €",
    ]);
    expect(upfrontTotal()).toBe("130,00 €");
  });

  it("#4 every concept of a quote line has its label; the start concepts are left to the start options", async () => {
    const config = await signupConfigJson();
    const upfront = config.upfront as { planQuotes: { lines: unknown[]; planId: string }[] };
    const monthly = upfront.planQuotes.find((quote) => quote.planId === MEMBER_PLAN);
    monthly?.lines.push(
      { amount: { amountMinor: 6000, currency: "EUR" }, concept: "FIRST_MONTH" },
      { amount: { amountMinor: 3000, currency: "EUR" }, concept: "ADDITIONAL_DOG_FEE" },
    );
    server.use(http.get("*/api/v1/signup", () => HttpResponse.json(config)));
    seedDraft();
    await renderSignup({ path: "/apuntat-hi/pagament" });
    expect(upfrontLines()).toEqual(["Entrada (1 gos) 100,00 €"]);
    expect(startOptions()).toHaveLength(2);
  });
});

describe("E3-W08 step 2: signed uploads forward the upload-URL headers (R-04-08, M16)", () => {
  it.each([
    ["public signup", false, "/apuntat-hi/gos"],
    ["add-dog", true, "/gossos/nou"],
  ] as const)("%s: the PUT carries every header the storage signed", async (_mode, addDog, path) => {
    const putHeaders: Record<string, string>[] = [];
    server.use(
      http.put("https://uploads.example.test/*", ({ request }) => {
        putHeaders.push(Object.fromEntries(request.headers.entries()));
        return new HttpResponse(null, { status: 200 });
      }),
    );
    await renderSignup({ addDog, path });
    fireEvent.change(screen.getByLabelText("Nom del gos"), { target: { value: "Kiwi" } });
    fireEvent.change(screen.getByLabelText("Cartilla de vacunes"), {
      target: { files: [new File(["page-1"], "scan.jpg", { type: "image/jpeg" })] },
    });
    expect(await screen.findByText("cartilla_Kiwi_1.jpg pujada")).toBeVisible();
    expect(putHeaders).toEqual([
      expect.objectContaining({ "content-type": "image/jpeg", "if-none-match": "*" }),
    ]);
  });
});

describe("E3-W08 step 4: the signup flags (R-04-08, R-04-12)", () => {
  it("T-04-31 allowFamilyGroupPending=false: a NOT_FOUND claim offers no «Deixa-ho pendent»", async () => {
    const config = await signupConfigJson();
    server.use(
      http.get("*/api/v1/signup", () => HttpResponse.json({ ...config, allowFamilyGroupPending: false })),
    );
    const navigate = vi.fn();
    await renderSignup({ navigate, path: "/apuntat-hi/familia" });
    fireEvent.change(screen.getByLabelText("Nom del responsable"), { target: { value: "Persona desconeguda" } });
    fireEvent.change(screen.getByLabelText("Nom d'un dels seus gossos"), { target: { value: "Bruc" } });
    fireEvent.click(screen.getByRole("button", { name: "CONTINUA" }));
    expect(await screen.findByText(/No podem trobar la persona que indiques/u)).toBeVisible();
    expect(screen.queryByRole("button", { name: "Deixa-ho pendent i continua ›" })).toBeNull();
    expect(navigate).not.toHaveBeenCalled();
  });

  it("T-04-31 allowFamilyGroupPending=true: the same claim can be left pending", async () => {
    const config = await signupConfigJson();
    expect(config.allowFamilyGroupPending).toBe(true);
    const navigate = vi.fn();
    await renderSignup({ navigate, path: "/apuntat-hi/familia" });
    fireEvent.change(screen.getByLabelText("Nom del responsable"), { target: { value: "Persona desconeguda" } });
    fireEvent.change(screen.getByLabelText("Nom d'un dels seus gossos"), { target: { value: "Bruc" } });
    fireEvent.click(screen.getByRole("button", { name: "CONTINUA" }));
    fireEvent.click(await screen.findByRole("button", { name: "Deixa-ho pendent i continua ›" }));
    expect(navigate).toHaveBeenCalledWith("/apuntat-hi/pagament");
  });

  it("T-04-30 requireDogDocumentAtSignup=true: 17 requires the vaccination card with an actionable error", async () => {
    const config = await signupConfigJson();
    server.use(
      http.get("*/api/v1/signup", () => HttpResponse.json({ ...config, requireDogDocumentAtSignup: true })),
    );
    const navigate = vi.fn();
    seedDraft();
    await renderSignup({ navigate, path: "/apuntat-hi/gos" });
    expect(screen.queryByText(/si ara no la tens a mà/u)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "CONTINUA" }));
    const file = screen.getByLabelText("Cartilla de vacunes");
    await waitFor(() => {
      expect(file).toHaveFocus();
    });
    expect(file).toHaveAttribute("aria-invalid", "true");
    expect(document.getElementById(file.getAttribute("aria-describedby") ?? "")).toHaveTextContent(
      "Cal adjuntar la cartilla de vacunes per continuar: toca «Cartilla de vacunes» i puja'n una foto o un PDF.",
    );
    expect(navigate).not.toHaveBeenCalled();

    fireEvent.change(file, {
      target: { files: [new File(["page-1"], "scan.jpg", { type: "image/jpeg" })] },
    });
    expect(await screen.findByText("cartilla_Kiwi_1.jpg pujada")).toBeVisible();
    expect(file).not.toHaveAttribute("aria-invalid");
    fireEvent.click(screen.getByRole("button", { name: "CONTINUA" }));
    expect(navigate).toHaveBeenCalledWith("/apuntat-hi/familia");
  });

  it("T-04-30 requireDogDocumentAtSignup=false: 17 continues without a file and shows the optional note", async () => {
    const config = await signupConfigJson();
    expect(config.requireDogDocumentAtSignup).toBe(false);
    const navigate = vi.fn();
    seedDraft();
    await renderSignup({ navigate, path: "/apuntat-hi/gos" });
    expect(screen.getByText(/si ara no la tens a mà, te la demanarem més endavant/u)).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "CONTINUA" }));
    expect(navigate).toHaveBeenCalledWith("/apuntat-hi/familia");
  });
});

describe("E3-W08 step 5: screens 16 and 17 and the public shell", () => {
  it("17: each plan card shows its name, its conditions and its price, never the long description; no zero entry line", async () => {
    const config = await signupConfigJson();
    const longDescription =
      "Les classes són sempre amb instructor i se'n poden fer fins a dues per setmana.";
    const plans = config.plans.map((plan, index) =>
      index === 0
        ? { ...plan, description: longDescription }
        : index === 1
          ? { ...plan, entryFee: { amountMinor: 0, currency: "EUR" } }
          : plan,
    );
    server.use(http.get("*/api/v1/signup", () => HttpResponse.json({ ...config, plans })));
    await renderSignup({ path: "/apuntat-hi/gos" });
    const member = screen.getByRole("button", { name: "Selecciona Abonat" });
    expect(member).toHaveTextContent(/60,00\s€\/mes/u);
    expect(member).toHaveTextContent(/Entrada 100,00\s€/u);
    expect(member).not.toHaveTextContent(longDescription);
    const pack = screen.getByRole("button", { name: "Selecciona Pack 6" });
    expect(pack).toHaveTextContent(/135,00\s€ · 3 mesos/u);
    expect(pack).toHaveTextContent("Només un cop");
    expect(pack).not.toHaveTextContent(/Entrada/u);
    expect(pack).not.toHaveTextContent("Sis sessions");
    const therapy = screen.getByRole("button", { name: "Selecciona Teràpia" });
    expect(within(therapy).getByText("condicions i cost segons cada cas")).toHaveClass(
      "signup-plan__conditions",
    );
    expect(therapy).not.toHaveTextContent("Classes de teràpia individual");
    expect(therapy).toHaveTextContent(/Entrada a compte: 50,00\s€/u);
  });

  it("round 2 #6: a maintenance plan without an entry fee shows its minimum fee and no «Entrada a compte: 0,00 €»", async () => {
    const config = await signupConfigJson();
    const plans = config.plans.map((plan) =>
      plan.maintenanceFee === undefined ? plan : { ...plan, entryFee: { amountMinor: 0, currency: "EUR" } },
    );
    server.use(http.get("*/api/v1/signup", () => HttpResponse.json({ ...config, plans })));
    await renderSignup({ path: "/apuntat-hi/gos" });
    const therapy = screen.getByRole("button", { name: "Selecciona Teràpia" });
    expect(therapy).not.toHaveTextContent(/Entrada/u);
    expect(therapy).toHaveTextContent(/Quota mínima durant el tractament: 10,00\s€\/mes/u);
  });

  it("16 (R-04-02, T-04-03): «Població» is free with no town, fixed with one and a selector with several", async () => {
    await renderSignup({ path: "/apuntat-hi" });
    const postalCode = screen.getByLabelText("CP", { exact: true });
    fireEvent.change(postalCode, { target: { value: "08999" } });
    fireEvent.blur(postalCode);
    const town = screen.getByLabelText("Població (proposada pel CP)");
    await waitFor(() => {
      expect(town).not.toHaveAttribute("readonly");
    });
    expect(town.tagName).toBe("INPUT");

    fireEvent.change(postalCode, { target: { value: "08349" } });
    fireEvent.blur(postalCode);
    await waitFor(() => {
      expect(screen.getByLabelText("Població (proposada pel CP)")).toHaveValue("Cabrera de Mar");
    });
    expect(screen.getByLabelText("Població (proposada pel CP)")).toHaveAttribute("readonly");

    fireEvent.change(postalCode, { target: { value: "08001" } });
    fireEvent.blur(postalCode);
    const select = await screen.findByRole("combobox", { name: "Població (proposada pel CP)" });
    expect(within(select).getAllByRole("option").map((option) => option.textContent)).toEqual([
      "Poble Antic",
      "Poble Centre",
      "Poble Nou",
    ]);
    expect(select).toHaveValue("Poble Antic");
  });

  it("16: the «Ja ets soci…» card carries its ⓘ icon; the language selector its globe", async () => {
    await renderSignup({ path: "/apuntat-hi" });
    const note = screen.getByText(/Ja ets soci i vols afegir un altre gos/u).closest("aside");
    expect(note?.querySelector("svg.ah-icon")).not.toBeNull();
    const language = screen.getByLabelText("Idioma").closest("label");
    expect(language?.querySelector("svg.ah-icon")).not.toBeNull();
  });

  it("the public footer reads «{legalName} · {taxId} · {city}» from /branding", async () => {
    await renderSignup({ path: "/apuntat-hi" });
    expect(screen.getByRole("contentinfo")).toHaveTextContent(
      `${brandingCanicFixture.club.legalName} · ${brandingCanicFixture.club.taxId} · ${brandingCanicFixture.club.city}`,
    );

    cleanup();
    const signupBranding = brandingFor("signup");
    await renderSignup({
      branding: {
        ...signupBranding,
        club: { ...signupBranding.club, legalName: "Associació Esportiva Fictícia", taxId: "G00000001" },
      },
      path: "/apuntat-hi",
    });
    expect(screen.getByRole("contentinfo")).toHaveTextContent(
      `Associació Esportiva Fictícia · G00000001 · ${signupBranding.club.city ?? ""}`,
    );

    cleanup();
    const branding = brandingFor("signup");
    await renderSignup({
      branding: { ...branding, club: { ...branding.club, taxId: null } },
      path: "/apuntat-hi",
    });
    expect(screen.getByRole("contentinfo")).toHaveTextContent(
      `${branding.club.name} · ${branding.club.city ?? ""}`,
    );
    expect(screen.getByText(`${branding.club.name} · ${branding.club.city ?? ""}`).textContent).not.toMatch(/·.*·/u);
  });

  it("E3-W12 step 5 (S02 R-02-02, Jordi 25-09): the registered office from /branding legalAddress, below the first line", async () => {
    const office = brandingCanicFixture.club.legalAddress;
    await renderSignup({ path: "/apuntat-hi" });
    const footer = screen.getByRole("contentinfo");
    expect(within(footer).getByText(`${office.street} · ${office.postalCode} ${office.city}`)).toBeVisible();
    // Two lines: the office is its own element after «{legalName} · {taxId} · {city}».
    expect([...footer.children].map((line) => line.textContent)).toEqual([
      `${brandingCanicFixture.club.legalName} · ${brandingCanicFixture.club.taxId} · ${brandingCanicFixture.club.city}`,
      `${office.street} · ${office.postalCode} ${office.city}`,
    ]);

    // An office without its town (`city: null`) reads «{street} · {postalCode}».
    cleanup();
    const signupBranding = brandingFor("signup");
    await renderSignup({
      branding: { ...signupBranding, club: { ...signupBranding.club, legalAddress: { ...office, city: null } } },
      path: "/apuntat-hi",
    });
    expect(within(screen.getByRole("contentinfo")).getByText(`${office.street} · ${office.postalCode}`)).toBeVisible();

    // `legalAddress: null` (no street or postal code): one line only.
    cleanup();
    await renderSignup({
      branding: { ...signupBranding, club: { ...signupBranding.club, legalAddress: null } },
      path: "/apuntat-hi",
    });
    expect(screen.getByRole("contentinfo").children).toHaveLength(1);
    expect(screen.queryByText(new RegExp(office.postalCode, "u"))).toBeNull();
  });

  it("A32: the club's primary buttons have dark text, AA against the primary, and BrandingProvider does not warn", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { background, onPrimary, primary } = brandingCanicFixture.theme.colors;
    // Dark text: the club's own dark background colour, 5.9:1 on the primary (A32).
    expect(onPrimary).toBe(background);
    expect(contrastRatio(onPrimary, primary)).toBeGreaterThanOrEqual(4.5);
    await renderSignup({ path: "/apuntat-hi" });
    expect(document.documentElement.style.getPropertyValue("--ah-color-primary-fg")).toBe(onPrimary);
    expect(warn.mock.calls.flat().join(" ")).not.toContain("[BrandingProvider]");
    warn.mockRestore();
  });
});

describe("E3-W08 step 7: the three narrow cases of the E3-W06 round-2 review", () => {
  it("#1 a slow full page load: the departing page never renders nor consumes the destination's error", async () => {
    server.use(http.post("*/api/v1/signup", () => apiErrorResponse("INVALID_ID_DOCUMENT", 400)));
    seedDraft();
    const loads = stubFullPageLoads("/apuntat-hi/pagament", { delayMs: 300 });
    await renderSignup({ path: "/apuntat-hi/pagament", productionNavigator: true });
    acceptPrivacy();
    submitSignup();
    await waitFor(() => {
      expect(loads).toEqual(["/apuntat-hi"]);
    });
    // The navigation is on its way: the old document shows no step 16 and keeps the error.
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(screen.queryByLabelText("DNI / NIE")).toBeNull();
    expect(savedDraft().pendingError).toMatchObject({ code: "INVALID_ID_DOCUMENT", step: "person" });

    const document = await screen.findByLabelText("DNI / NIE", {}, { timeout: 2000 });
    await waitFor(() => {
      expect(document).toHaveFocus();
    });
    expect(window.document.getElementById("signup-id-error")).toHaveTextContent(
      "El document d'identitat no és vàlid.",
    );
    await waitFor(() => {
      expect(savedDraft()).not.toHaveProperty("pendingError");
    });
  });

  it("#2 a cancelled checkout is consumed once: cancel → retry → lost answer → reload → retry with the same key", async () => {
    const recorded = recordRequests();
    const navigate = vi.fn();
    seedDraft({ payment: { firstMonthOption: "TODAY", holderName: "Nora Soler Pons", iban: VALID_IBAN, type: "SEPA_DD" } });
    await renderSignup({ navigate, path: "/apuntat-hi/pagament", scenario: "signupStripe" });
    acceptPrivacy();
    submitSignup();
    await waitFor(() => {
      expect(navigate).toHaveBeenCalledWith("https://checkout.test/cs_mock_signup");
    });

    // Stripe's cancel URL: the attempt it cancelled is dropped.
    cleanup();
    await renderSignup({ navigate, path: "/apuntat-hi/pagament?cs=cancel", scenario: "signupStripe" });
    expect(screen.getByText(/El pagament no s'ha completat/u)).toBeVisible();
    server.use(http.post("*/api/v1/checkout-sessions", () => HttpResponse.error()));
    fireEvent.click(screen.getByRole("button", { name: "PAGA ARA" }));
    expect(await screen.findByText("No s'ha pogut completar l'acció.")).toBeVisible();

    // The browser reloads whatever address it shows now.
    const reloaded = `${window.location.pathname}${window.location.search}`;
    cleanup();
    server.resetHandlers();
    navigate.mockClear();
    await renderSignup({ navigate, path: reloaded, scenario: "signupStripe" });
    fireEvent.click(screen.getByRole("button", { name: "PAGA ARA" }));
    await waitFor(() => {
      expect(navigate).toHaveBeenCalledWith("https://checkout.test/cs_mock_signup");
    });
    const checkouts = requestsTo(recorded, "POST", "/checkout-sessions");
    expect(checkouts).toHaveLength(3);
    expect(checkouts[1]?.key).not.toBe(checkouts[0]?.key);
    expect(checkouts[2]?.key).toBe(checkouts[1]?.key);
    expect(requestsTo(recorded, "POST", "/signup")).toHaveLength(1);
  });

  it("round 2 #2: a page restored from the back-forward cache shows its step again, with the draft the next page left", async () => {
    seedDraft();
    const loads = stubFullPageLoads("/apuntat-hi/gos", { aborted: true });
    await renderSignup({ path: "/apuntat-hi/gos", productionNavigator: true });
    fireEvent.click(screen.getByRole("button", { name: "CONTINUA" }));
    await waitFor(() => {
      expect(loads).toEqual(["/apuntat-hi/familia"]);
    });
    expect(screen.getByText("Carregant el formulari")).toBeVisible();
    expect(screen.queryByLabelText("Nom del gos")).toBeNull();

    // 18 changed the draft, then the browser's Back restored this document from the bfcache.
    sessionStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({ ...savedDraft(), familyClaim: { dogName: "Duna", holderName: "Laura Serra", leavePending: false } }),
    );
    const restored = new Event("pageshow");
    Object.defineProperty(restored, "persisted", { value: true });
    act(() => {
      window.dispatchEvent(restored);
    });
    expect(await screen.findByLabelText("Nom del gos")).toHaveValue("Kiwi");
    expect(screen.queryByText("Carregant el formulari")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "CONTINUA" }));
    await waitFor(() => {
      expect(loads).toEqual(["/apuntat-hi/familia", "/apuntat-hi/familia"]);
    });
    expect(savedDraft().familyClaim).toEqual({ dogName: "Duna", holderName: "Laura Serra", leavePending: false });
  });

  it("round 2 #2: a pageshow that is not a bfcache restore changes nothing", async () => {
    seedDraft();
    const loads = stubFullPageLoads("/apuntat-hi/gos", { aborted: true });
    await renderSignup({ path: "/apuntat-hi/gos", productionNavigator: true });
    fireEvent.click(screen.getByRole("button", { name: "CONTINUA" }));
    await waitFor(() => {
      expect(loads).toEqual(["/apuntat-hi/familia"]);
    });
    act(() => {
      window.dispatchEvent(new Event("pageshow"));
    });
    expect(screen.getByText("Carregant el formulari")).toBeVisible();
  });

  it("#3 a passport-only applicant's INVALID_ID_DOCUMENT lands on the passport field", async () => {
    server.use(http.post("*/api/v1/signup", () => apiErrorResponse("INVALID_ID_DOCUMENT", 400)));
    seedDraft({ passport: "PA1234567" }, { idDocument: { type: "DNI", value: "" } });
    const navigate = vi.fn();
    await renderSignup({ navigate, path: "/apuntat-hi/pagament" });
    acceptPrivacy();
    submitSignup();
    const passport = await screen.findByLabelText("Passaport — si no tens DNI/NIE");
    await waitFor(() => {
      expect(passport).toHaveFocus();
    });
    expect(navigate).toHaveBeenLastCalledWith("/apuntat-hi");
    expect(passport).toHaveAttribute("aria-invalid", "true");
    expect(document.getElementById(passport.getAttribute("aria-describedby") ?? "")).toHaveTextContent(
      "El document d'identitat no és vàlid.",
    );
    expect(screen.getByLabelText("DNI / NIE")).not.toHaveAttribute("aria-invalid");
  });
});
