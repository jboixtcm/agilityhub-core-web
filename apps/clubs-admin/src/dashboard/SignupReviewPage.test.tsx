import { createApiClient } from "@agilityhub/api-client";
import { mockScenario, resetDashboardMockState } from "@agilityhub/api-client/mocks";
import brandingCanicFixture from "@agilityhub/api-client/mocks/branding-canic";
import { server } from "@agilityhub/api-client/mocks/server";
import { createI18n } from "@agilityhub/i18n";
import { type Branding, BrandingProvider } from "@agilityhub/ui";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { I18nextProvider } from "react-i18next";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { CountersRefreshContext } from "./counters";
import { SignupReviewPage } from "./SignupReviewPage";

const canic: Branding = { ...brandingCanicFixture, theme: { ...brandingCanicFixture.theme, mode: "dark" } };
const memberId = "42000000-0000-4000-8000-000000000001";
const kiwiId = "44000000-0000-4000-8000-000000000001";
const pack6 = "10000000-0000-4000-8000-000000000002|20000000-0000-4000-8000-000000000002";
const pack10 = "10000000-0000-4000-8000-000000000003|20000000-0000-4000-8000-000000000003";
const abonat = "10000000-0000-4000-8000-000000000001|20000000-0000-4000-8000-000000000001";
// The i18n instance of the last render, so a test can switch the language.
let reviewI18n: Awaited<ReturnType<typeof createI18n>> | undefined;

beforeAll(() => { server.listen({ onUnhandledRequest: "error" }); });
afterEach(() => { cleanup(); server.resetHandlers(); resetDashboardMockState(); mockScenario("admin"); });
afterAll(() => { server.close(); });

type SignupBody = Record<string, unknown> & {
  dogs: (Record<string, unknown> & { id: string })[];
  member: Record<string, unknown> & { paymentMethod?: Record<string, unknown> | null };
  proposals: Record<string, unknown>;
  signup: Record<string, unknown>;
  upfront?: (Record<string, unknown> & { firstMonth?: Record<string, unknown>; lines: Record<string, unknown>[] }) | null;
};

interface Recorded {
  body: unknown;
  method: string;
  path: string;
  query: string;
}

/**
 * A fetch that records every api request (method, path, JSON body) and can rewrite the
 * `GET /members/{id}/signup` answer (and the holder's record) the way the real core sends it.
 */
function recordingFetch(
  mutate?: (body: SignupBody) => void,
  holder?: (body: Record<string, unknown>) => void,
  club?: (body: Record<string, unknown>) => void,
): { fetch: typeof fetch; requests: Recorded[] } {
  const requests: Recorded[] = [];
  const recording: typeof fetch = async (input, init) => {
    const request = input instanceof Request ? input : new Request(input, init);
    const url = new URL(request.url);
    const text = request.method === "GET" || request.method === "DELETE" ? "" : await request.clone().text();
    requests.push({ body: text === "" ? undefined : JSON.parse(text), method: request.method, path: url.pathname, query: url.search });
    const response = await fetch(input, init);
    if (request.method !== "GET" || !response.ok) return response;
    if (mutate !== undefined && url.pathname.endsWith(`/members/${memberId}/signup`)) {
      const body = (await response.json()) as SignupBody;
      mutate(body);
      return Response.json(body, { status: response.status });
    }
    if (holder !== undefined && /\/members\/[^/]+$/u.test(url.pathname)) {
      const body = (await response.json()) as Record<string, unknown>;
      holder(body);
      return Response.json(body, { status: response.status });
    }
    if (club !== undefined && url.pathname.endsWith("/api/v1/club")) {
      const body = (await response.json()) as Record<string, unknown>;
      club(body);
      return Response.json(body, { status: response.status });
    }
    return response;
  };
  return { fetch: recording, requests };
}

function sent(requests: readonly Recorded[], method: string, suffix: string, dryRun?: boolean): Recorded[] {
  return requests.filter(
    (request) =>
      request.method === method &&
      request.path.endsWith(suffix) &&
      (dryRun === undefined || request.query.includes("dryRun=true") === dryRun),
  );
}

function apiErrorResponse(code: string, status: number, details: Record<string, unknown> = {}) {
  return HttpResponse.json({ code, details, message: code, traceId: "test-trace" }, { status });
}

// The real core returns a PENDING member without `plan` and with the account masked with a single group.
const pendingMemberFetch = () =>
  recordingFetch((body) => {
    delete body.member.plan;
    delete body.member.planId;
    body.member.maskedAccount = "···· 7719";
    if (body.member.paymentMethod != null) body.member.paymentMethod.maskedAccount = "···· 7719";
  });

function hasNull(value: unknown): boolean {
  if (value === null) return true;
  if (typeof value !== "object") return false;
  return Object.values(value as Record<string, unknown>).some(hasNull);
}

async function renderReview({
  branding = canic,
  dogs = "Kiwi",
  fetchOverride,
  language = "ca",
  onNavigate = vi.fn(),
  refreshCounters = vi.fn(),
}: {
  branding?: Branding;
  dogs?: string;
  fetchOverride?: typeof fetch;
  language?: "ca" | "en";
  onNavigate?: (path: string) => void;
  refreshCounters?: () => void;
} = {}) {
  window.history.pushState(null, "", `/preinscripcions/${memberId}`);
  const i18n = await createI18n({ branding, browserLanguages: [language], initialNamespaces: ["admin-census"], storage: undefined });
  reviewI18n = i18n;
  const client = createApiClient({ baseUrl: `${window.location.origin}/api/v1`, ...(fetchOverride === undefined ? {} : { fetch: fetchOverride }) });
  render(
    <I18nextProvider i18n={i18n}>
      <BrandingProvider branding={branding}>
        <CountersRefreshContext.Provider value={refreshCounters}>
          <SignupReviewPage client={client} onNavigate={onNavigate} />
        </CountersRefreshContext.Provider>
      </BrandingProvider>
    </I18nextProvider>,
  );
  if (language === "ca") {
    // «#» written as #: the colour lint reads «#1042» in a string as a hex colour.
    await screen.findByRole("heading", { name: new RegExp(`Preinscripció \\u00231042 — Marta Roca Pujol \\+ ${dogs}`, "u") });
  }
  return onNavigate;
}

/** A `<dd>` whose whole text (with the bold name) matches. */
function dataRow(pattern: RegExp) {
  return (_content: string, element: Element | null) => element?.tagName === "DD" && pattern.test(element.textContent);
}

function openDrawer() {
  fireEvent.click(screen.getByRole("button", { name: "EDITA LES DADES" }));
  return screen.getByRole("dialog", { name: "Edita les dades de la preinscripció" });
}

function validate() {
  fireEvent.click(screen.getByRole("button", { name: "VALIDA L'ALTA" }));
}

describe("T-04-33 D2 signup validation", () => {
  it("shows the mockup: DNI and phone in full, signed documents, consent warning, level, invoice and Stripe payment", async () => {
    await renderReview();

    // Organizer ruling 24-09: the DNI/NIE stays in full, as on D10; R-03-27: the phone in clear.
    expect(screen.getByText("47123456K")).toBeVisible();
    expect(screen.getByText("marta.roca@example.test · +34 655123123")).toBeVisible();
    const whatsapp = screen.getByRole("link", { name: "WhatsApp" });
    expect(whatsapp).toHaveAttribute("href", "https://wa.me/34655123123");
    expect(whatsapp).toHaveClass("ah-badge");
    expect(screen.getByText("Sí — titular: Marta Roca + gos Kiwi")).toBeVisible();
    expect(screen.getByText("tarifa familiar en validar")).toBeVisible();
    expect(screen.getByText("Domiciliació · ···· ···· ···· ···· 7719 · titular: la mateixa")).toBeVisible();
    expect(screen.getByRole("link", { name: /cartilla_Kiwi_1.jpg/u })).toHaveAttribute("href", "https://files.example.test/cartilla_Kiwi_1.jpg");
    expect(screen.getByText("3 adjunts")).toBeVisible();
    expect(screen.getByText(dataRow(/^Kiwi · Femella · Whippet · /u))).toBeVisible();
    expect(screen.getByText(/no publiqueu fotos on surti ella/u)).toBeVisible();
    expect(screen.getByLabelText("Nivell inicial")).toHaveValue("43000000-0000-4000-8000-000000000001");
    expect(screen.getByLabelText("Data del proper rebut")).toHaveValue("01/09/2026");
    expect(screen.getByRole("combobox", { name: "Modalitat i tarifa" })).toHaveDisplayValue("Abonat · 60,00 €/mes");
    expect(screen.getByDisplayValue(/130,00/u)).toBeVisible();
    expect(screen.getByText(/Entrada 100,00 € \+ agost 30,00 € \(mitja quota\)/u)).toBeVisible();
    expect(screen.getByText("cobrat")).toBeVisible();
    // The mockup's neutral outline button.
    expect(screen.getByRole("button", { name: "REBUTJA (amb motiu)" })).toHaveClass("ah-button--ghost");
  });

  it("shows the required next-invoice date from the proposed MONTHLY plan when the pending member has no plan yet", async () => {
    await renderReview({ fetchOverride: pendingMemberFetch().fetch });

    expect(await screen.findByLabelText("Data del proper rebut")).toHaveValue("01/09/2026");
    expect(screen.getByText("obligatori")).toBeVisible();
    // R-03-27: the single-group form the core sends today is shown in the one masked-IBAN format.
    expect(screen.getByText("Domiciliació · ···· ···· ···· ···· 7719 · titular: la mateixa")).toBeVisible();
  });

  it.each([
    [0, "pendent des d'avui"],
    [1, "pendent des de fa 1 dia"],
    [5, "pendent des de fa 5 dies"],
  ])("shows the pending badge as an ICU plural for %i days", async (days, text) => {
    await renderReview({ fetchOverride: recordingFetch((body) => { body.signup.pendingDays = days; }).fetch });
    expect(screen.getByText(text)).toHaveClass("ah-badge");
  });

  it("R-04-24 warns on the age badge only when pendingDays > warnDays, read from the signup view", async () => {
    const { fetch: over, requests } = recordingFetch((body) => { body.signup.pendingDays = 3; });
    await renderReview({ fetchOverride: over });
    expect(screen.getByText("pendent des de fa 3 dies")).toHaveClass("ah-tone--warning");
    cleanup();

    await renderReview({ fetchOverride: recordingFetch((body) => { body.signup.pendingDays = 2; }).fetch });
    expect(screen.getByText("pendent des de fa 2 dies")).toHaveClass("ah-tone--neutral");
    // M11: D2 never asks the dashboard for warnDays.
    expect(requests.some((request) => request.path.includes("/dashboard"))).toBe(false);
  });

  it("step 0 renders each review warning by its code, so a new api value needs only its key", async () => {
    await renderReview({
      fetchOverride: recordingFetch((body) => { body.warnings = ["DOCUMENT_PENDING", "PAID_EXCEEDS_QUOTE"]; }).fetch,
    });
    const header = screen.getByRole("heading", { name: /Preinscripció #1042/u }).closest("header");
    expect(header).not.toBeNull();
    if (header === null) return;
    expect(within(header).getByText("Document pendent")).toHaveClass("ah-badge");
    expect(within(header).getByText(/El que s'ha cobrat supera el nou import/u)).toHaveClass("ah-badge");
  });

  it("tolerates null optional fields (INC-08) and never sends null back", async () => {
    const onNavigate = vi.fn();
    const { fetch: over, requests } = recordingFetch(
      (body) => {
        body.member.plan = null;
        body.member.maskedAccount = null;
        body.member.paymentMethod = { channel: null, holderName: "Marta Roca Pujol", maskedAccount: null, type: "SEPA_DD" };
        body.upfront = null;
      },
      (holder) => { holder.familyGroupId = null; },
    );
    await renderReview({ fetchOverride: over, onNavigate });
    expect(screen.getByText("Domiciliació · — · titular: la mateixa")).toBeVisible();
    expect(screen.queryByText("Import efectivament cobrat:")).toBeNull();
    validate();
    await waitFor(() => { expect(onNavigate).toHaveBeenCalledWith("/tauler?signup=validated"); });
    const [validation] = sent(requests, "POST", "/validation", false);
    expect(hasNull(validation?.body)).toBe(false);
  });

  it("T-04-16 validates a FOUND claim whose holder has no group yet without familyGroupId (the api creates the group)", async () => {
    const onNavigate = vi.fn();
    const { fetch: over, requests } = recordingFetch((body) => { delete body.proposals.familyGroupId; });
    await renderReview({ fetchOverride: over, onNavigate });
    expect(screen.getByText("Sí — titular: Marta Roca + gos Kiwi")).toBeVisible();
    validate();
    await waitFor(() => { expect(onNavigate).toHaveBeenCalledWith("/tauler?signup=validated"); });
    const [validation] = sent(requests, "POST", "/validation", false);
    expect(validation?.body).toBeDefined();
    expect(validation?.body).not.toHaveProperty("familyGroupId");
  });

  it("validates a signup with a null payment method, upfront and family claim without sending null", async () => {
    const onNavigate = vi.fn();
    const { fetch: over, requests } = recordingFetch((body) => {
      body.member.paymentMethod = null;
      body.member.maskedAccount = null;
      body.familyGroupClaim = null;
      body.upfront = null;
    });
    await renderReview({ fetchOverride: over, onNavigate });
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
    validate();
    await waitFor(() => { expect(onNavigate).toHaveBeenCalledWith("/tauler?signup=validated"); });
    const validation = sent(requests, "POST", "/validation", false).at(-1)?.body;
    expect(validation).toBeDefined();
    expect(hasNull(validation)).toBe(false);
    expect(validation).not.toHaveProperty("familyGroupId");
    expect(validation).not.toHaveProperty("upfrontAmountPaid");
  });

  it("shows signup warnings as compact header badges", async () => {
    mockScenario("adminSignupReviewManual");
    await renderReview();
    const header = screen.getByRole("heading", { name: /Preinscripció #1042/u }).closest("header");
    expect(header).not.toBeNull();
    if (header === null) return;
    expect(within(header).getByText("Pagament inicial pendent")).toHaveClass("ah-badge");
  });

  it("requires explicit confirmation when a manual upfront payment is zero", async () => {
    mockScenario("adminSignupReviewManual");
    const onNavigate = await renderReview();
    expect(screen.getByLabelText("Import efectivament cobrat:")).toHaveValue(0);

    validate();
    expect(await screen.findByText("Confirma que no s'ha cobrat cap import")).toBeVisible();
    expect(onNavigate).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("checkbox", { name: "No s'ha cobrat res: queda pendent" }));
    validate();
    await waitFor(() => { expect(onNavigate).toHaveBeenCalledWith("/tauler?signup=validated"); });
  });
});

describe("E3-W07 step 1 · M12 each dog is saved with its own version (R-04-19)", () => {
  it("edits the member and the dog in one save: the dog PATCH carries the dog's version, not the member's", async () => {
    const { fetch: over, requests } = recordingFetch();
    await renderReview({ fetchOverride: over });
    const drawer = openDrawer();
    fireEvent.change(within(within(drawer).getByRole("group", { name: "Persona" })).getByLabelText("Nom"), { target: { value: "Mariona" } });
    fireEvent.change(within(within(drawer).getByRole("group", { name: "Gos (1 de 1)" })).getByLabelText("Raça"), { target: { value: "Llebrer" } });
    fireEvent.click(within(drawer).getByRole("button", { name: "DESA ELS CANVIS" }));

    expect(await screen.findByText("Les dades s'han actualitzat.")).toBeVisible();
    expect(sent(requests, "PATCH", `/members/${memberId}`).map((request) => request.body)).toEqual([{ firstName: "Mariona", version: 3 }]);
    expect(sent(requests, "PATCH", `/dogs/${kiwiId}`).map((request) => request.body)).toEqual([{ breed: "Llebrer", version: 1 }]);
    expect(await screen.findByText(dataRow(/^Kiwi · Femella · Llebrer · /u))).toBeVisible();
  });

  it("add-dog: the person is read-only and the new dog is saved with its version 0 while the member is at 7 (R-04-25)", async () => {
    mockScenario("adminSignupReviewAddDog");
    const { fetch: over, requests } = recordingFetch();
    await renderReview({ dogs: "Nit", fetchOverride: over });
    expect(screen.getByText("nou gos")).toHaveClass("ah-badge");
    const drawer = openDrawer();
    expect(within(drawer).getByRole("group", { name: "Persona" })).toBeDisabled();
    const dogGroup = within(drawer).getByRole("group", { name: "Gos (1 de 1)" });
    expect(dogGroup).toBeEnabled();
    fireEvent.change(within(dogGroup).getByLabelText("Xip"), { target: { value: "941000031415927" } });
    fireEvent.click(within(drawer).getByRole("button", { name: "DESA ELS CANVIS" }));

    expect(await screen.findByText("Les dades s'han actualitzat.")).toBeVisible();
    expect(requests.filter((request) => request.method === "PATCH" && request.path.includes("/members/"))).toEqual([]);
    expect(sent(requests, "PATCH", "/dogs/44000000-0000-4000-8000-000000000009").map((request) => request.body)).toEqual([
      { chip: "941000031415927", version: 0 },
    ]);
  });

  it("after a partial save (the member saved, the dog failed) reloads, shows the error in the drawer and retries only the dog", async () => {
    const { fetch: over, requests } = recordingFetch();
    await renderReview({ fetchOverride: over });
    server.use(http.patch("*/api/v1/dogs/:id", () => apiErrorResponse("CHIP_ALREADY_EXISTS", 409)));
    const drawer = openDrawer();
    fireEvent.change(within(within(drawer).getByRole("group", { name: "Persona" })).getByLabelText("Nom"), { target: { value: "Mariona" } });
    fireEvent.change(within(within(drawer).getByRole("group", { name: "Gos (1 de 1)" })).getByLabelText("Xip"), { target: { value: "941000024681358" } });
    const loadsBefore = sent(requests, "GET", `/members/${memberId}/signup`).length;
    fireEvent.click(within(drawer).getByRole("button", { name: "DESA ELS CANVIS" }));

    expect(await within(drawer).findByRole("alert")).toHaveTextContent("Aquest número de xip ja està registrat.");
    await waitFor(() => { expect(sent(requests, "GET", `/members/${memberId}/signup`).length).toBe(loadsBefore + 1); });

    server.resetHandlers();
    fireEvent.click(within(drawer).getByRole("button", { name: "DESA ELS CANVIS" }));
    expect(await screen.findByText("Les dades s'han actualitzat.")).toBeVisible();
    expect(sent(requests, "PATCH", `/members/${memberId}`)).toHaveLength(1);
    expect(sent(requests, "PATCH", `/dogs/${kiwiId}`).map((request) => request.body)).toEqual([
      { chip: "941000024681358", version: 1 },
      { chip: "941000024681358", version: 1 },
    ]);
  });
});

describe("E3-W07 async drawer: nothing typed during a save is lost", () => {
  it("locks the fields while the save is in flight", async () => {
    let release: () => void = () => undefined;
    server.use(
      http.patch("*/api/v1/members/:id", async () => {
        await new Promise<void>((resolve) => { release = resolve; });
        return undefined;
      }),
    );
    await renderReview();
    const drawer = openDrawer();
    fireEvent.change(within(within(drawer).getByRole("group", { name: "Persona" })).getByLabelText("Nom"), { target: { value: "Mariona" } });
    fireEvent.click(within(drawer).getByRole("button", { name: "DESA ELS CANVIS" }));
    await waitFor(() => { expect(within(drawer).getByRole("group", { name: "Persona" })).toBeDisabled(); });
    expect(within(drawer).getByRole("group", { name: "Gos (1 de 1)" })).toBeDisabled();
    release();
    expect(await screen.findByText("Les dades s'han actualitzat.")).toBeVisible();
  });
});

describe("E3-W07 step 2 · M13 422 codes on their fields (S04 §2 D2)", () => {
  const dateError = `signup-invoice-${kiwiId}-error`;
  const levelError = `signup-level-${kiwiId}-error`;
  it.each([
    ["LEVEL_REQUIRED", 422, {}, levelError, "Selecciona el nivell inicial."],
    ["LEVEL_NOT_ACTIVE", 422, {}, levelError, "Aquest nivell no està actiu."],
    ["NEXT_INVOICE_DATE_REQUIRED", 422, {}, dateError, "Indica la data del proper rebut."],
    ["VALIDATION_ERROR", 400, { fieldErrors: [{ code: "INVALID_DATE", field: "nextInvoiceDate" }] }, dateError, "La data del proper rebut no és vàlida."],
    ["UPFRONT_AMOUNT_EXCEEDS_DUE", 422, {}, "signup-upfront-error", "L'import inicial supera l'import pendent."],
    ["PLAN_NOT_AVAILABLE", 422, {}, "signup-plan-error", "Aquest pla no està disponible."],
    ["INVALID_STATE", 409, { reason: "CHECKOUT_PENDING" }, "signup-plan-error", "Hi ha un pagament amb targeta en curs: la modalitat no es pot canviar fins que acabi."],
    ["MEMBERSHIP_EXISTS", 409, {}, "banner", "Aquest abonament ja existeix."],
    ["MEMBER_ERASED", 409, {}, "banner", "Aquest abonat ha estat suprimit i ja no es pot modificar."],
  ] as const)("%s (%i, bare as the api sends it) is shown on its field", async (code, status, details, target, text) => {
    mockScenario("adminSignupReviewManual");
    const onNavigate = await renderReview();
    server.use(
      http.post("*/api/v1/members/:id/validation", ({ request }) =>
        new URL(request.url).searchParams.get("dryRun") === "true" ? undefined : apiErrorResponse(code, status, details),
      ),
    );
    fireEvent.change(screen.getByLabelText("Import efectivament cobrat:"), { target: { value: "200" } });
    validate();

    if (target === "banner") {
      const banner = await screen.findByText(text);
      expect(banner.closest(".signup-review-error")).toHaveAttribute("role", "alert");
    } else {
      await waitFor(() => { expect(document.getElementById(target)).toHaveTextContent(text); });
      const field = document.querySelector(`[aria-describedby="${target}"]`);
      expect(field).toHaveAttribute("aria-invalid", "true");
    }
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it("caps the amount input at the amount due", async () => {
    mockScenario("adminSignupReviewManual");
    await renderReview();
    expect(screen.getByLabelText("Import efectivament cobrat:")).toHaveAttribute("max", "130.00");
  });

  it("maps the mock's own answers too: a missing level and a missing date", async () => {
    const onNavigate = await renderReview();
    fireEvent.change(screen.getByLabelText("Nivell inicial"), { target: { value: "" } });
    validate();
    expect(await screen.findByText("Selecciona el nivell inicial.")).toBeVisible();

    fireEvent.change(screen.getByLabelText("Nivell inicial"), { target: { value: "43000000-0000-4000-8000-000000000001" } });
    fireEvent.change(screen.getByLabelText("Data del proper rebut"), { target: { value: "" } });
    validate();
    expect(await screen.findByText("Indica la data del proper rebut.")).toBeVisible();
    expect(screen.getByLabelText("Data del proper rebut")).toHaveAttribute("aria-invalid", "true");
    expect(onNavigate).not.toHaveBeenCalled();
  });
});

describe("E3-W07 step 3 · M14 both contacts and the full edit drawer (R-04-19, R-04-03)", () => {
  it("editing the first email keeps the second, and the untouched phones are not sent", async () => {
    const { fetch: over, requests } = recordingFetch((body) => {
      body.member.contactEmails = [
        { bounced: false, email: "marta.roca@example.test" },
        { bounced: false, email: "marta.feina@example.test" },
      ];
      body.member.phones = [
        { label: "Mòbil", number: "655123123", prefix: "+34" },
        { label: "Feina", number: "937000000", prefix: "+34" },
      ];
    });
    await renderReview({ fetchOverride: over });
    const drawer = openDrawer();
    expect(within(drawer).getByLabelText("Segon correu electrònic")).toHaveValue("marta.feina@example.test");
    fireEvent.change(within(drawer).getByLabelText("Correu electrònic"), { target: { value: "marta.r@example.test" } });
    fireEvent.click(within(drawer).getByRole("button", { name: "DESA ELS CANVIS" }));

    expect(await screen.findByText("Les dades s'han actualitzat.")).toBeVisible();
    const [patch] = sent(requests, "PATCH", `/members/${memberId}`);
    expect(patch?.body).toEqual({
      contactEmails: [{ email: "marta.r@example.test" }, { email: "marta.feina@example.test" }],
      version: 3,
    });
  });

  it("editing the second phone sends both phones, each with its label", async () => {
    const { fetch: over, requests } = recordingFetch();
    await renderReview({ fetchOverride: over });
    const drawer = openDrawer();
    const second = within(drawer).getByRole("group", { name: "Segon telèfon" });
    fireEvent.change(within(second).getByLabelText("Telèfon"), { target: { value: "937000000" } });
    fireEvent.change(within(second).getByLabelText("Descripció"), { target: { value: "Feina" } });
    fireEvent.click(within(drawer).getByRole("button", { name: "DESA ELS CANVIS" }));

    expect(await screen.findByText("Les dades s'han actualitzat.")).toBeVisible();
    expect(sent(requests, "PATCH", `/members/${memberId}`)[0]?.body).toEqual({
      phones: [
        { label: "Mòbil", number: "655123123", prefix: "+34" },
        { label: "Feina", number: "937000000", prefix: "+34" },
      ],
      version: 3,
    });
  });

  it("offers gender (three values), the notes, holderTaxId and the requested plan read-only", async () => {
    const { fetch: over, requests } = recordingFetch();
    await renderReview({ fetchOverride: over });
    const drawer = openDrawer();
    const gender = within(drawer).getByLabelText("Gènere");
    expect(within(gender).getAllByRole("option").map((option) => option.textContent)).toEqual(["Femení", "Masculí", "Altres / No binari"]);
    expect(within(drawer).getByLabelText("Modalitat sol·licitada")).toHaveAttribute("readonly");
    expect(within(drawer).getByLabelText("Modalitat sol·licitada")).toHaveValue("Abonat");
    fireEvent.change(gender, { target: { value: "OTHER" } });
    fireEvent.change(within(drawer).getByLabelText("NIF del titular"), { target: { value: "47123456K" } });
    fireEvent.change(within(drawer).getByLabelText("IBAN"), { target: { value: "ES00 0000 0000 0000 0000 0000" } });
    fireEvent.change(within(drawer).getByLabelText("Notes als instructors"), { target: { value: "Poruga amb els sorolls" } });
    fireEvent.click(within(drawer).getByRole("button", { name: "DESA ELS CANVIS" }));

    expect(await screen.findByText("Les dades s'han actualitzat.")).toBeVisible();
    expect(sent(requests, "PATCH", `/members/${memberId}`)[0]?.body).toEqual({
      gender: "OTHER",
      paymentMethod: {
        sepa: { holderName: "Marta Roca Pujol", holderTaxId: "47123456K", iban: "ES0000000000000000000000" },
        type: "SEPA_DD",
      },
      version: 3,
    });
    expect(sent(requests, "PATCH", `/dogs/${kiwiId}`)[0]?.body).toEqual({ notesToInstructors: "Poruga amb els sorolls", version: 1 });
  });

  it("adds a dog document forwarding the signed upload headers, and removes one", async () => {
    const putHeaders: Record<string, string>[] = [];
    server.use(
      http.put("https://uploads.example.test/*", ({ request }) => {
        putHeaders.push(Object.fromEntries(request.headers.entries()));
        return new HttpResponse(null, { status: 200 });
      }),
    );
    const { fetch: over, requests } = recordingFetch();
    await renderReview({ fetchOverride: over });
    const drawer = openDrawer();
    expect(await within(drawer).findAllByRole("button", { name: "Retira" })).toHaveLength(3);
    fireEvent.change(within(drawer).getByLabelText("Tipus de document"), { target: { value: "INSURANCE" } });
    fireEvent.change(within(drawer).getByLabelText("Fitxer"), {
      target: { files: [new File(["pdf"], "assegurança_2026.pdf", { type: "application/pdf" })] },
    });
    fireEvent.click(within(drawer).getByRole("button", { name: "Puja el document" }));

    expect(await within(drawer).findByRole("link", { name: /assegurança_2026.pdf/u })).toBeVisible();
    // R-04-08: every signed header goes to the storage unchanged.
    expect(putHeaders).toEqual([expect.objectContaining({ "content-type": "application/pdf", "if-none-match": "*" })]);
    expect(sent(requests, "POST", `/dogs/${kiwiId}/documents`)[0]?.body).toEqual({
      fileKey: "mock-dog_document-assegurança_2026.pdf",
      name: "assegurança_2026.pdf",
      type: "INSURANCE",
    });
    // The page reloads the view, so D2 lists the new file too.
    await waitFor(() => { expect(screen.getAllByRole("link", { name: /assegurança_2026.pdf/u })).toHaveLength(2); });

    const [firstRemove] = within(drawer).getAllByRole("button", { name: "Retira" });
    if (firstRemove === undefined) throw new TypeError("No remove button");
    fireEvent.click(firstRemove);
    await waitFor(() => { expect(sent(requests, "DELETE", "/files/48000000-0000-4000-8000-000001000000")).toHaveLength(1); });
    await waitFor(() => { expect(within(drawer).queryByRole("link", { name: /cartilla_Kiwi_1.jpg/u })).toBeNull(); });
  });
});

describe("E3-W07 step 4 · M15 the plan and family decisions (R-04-13, T-04-33)", () => {
  it("lists planOptions with their periodicity and runs dryRun on a change to Pack 6: lines, date and body updated", async () => {
    mockScenario("adminSignupReviewManual");
    const onNavigate = vi.fn();
    const { fetch: over, requests } = recordingFetch();
    await renderReview({ fetchOverride: over, onNavigate });
    const select = screen.getByRole("combobox", { name: "Modalitat i tarifa" });
    expect(within(select).getAllByRole("option").map((option) => option.textContent)).toEqual([
      "Abonat · 60,00 €/mes",
      "Abonat familiar · 30,00 €/mes",
      "Pack 6 · 135,00 €",
      "Pack 10 · 180,00 €",
      "Teràpia · 10,00 €/mes",
    ]);
    expect(screen.getByText(/Entrada 100,00 € \+ agost 30,00 € \(mitja quota\)/u)).toBeVisible();

    fireEvent.change(select, { target: { value: pack6 } });
    expect(await screen.findByText(/^Pack 135,00 € · es registra el cobrament/u)).toBeVisible();
    expect(screen.queryByLabelText("Data del proper rebut")).toBeNull();
    expect(screen.getByLabelText("Import efectivament cobrat:")).toHaveAttribute("max", "135.00");
    const [dryRun] = sent(requests, "POST", "/validation", true);
    expect(dryRun?.body).toMatchObject({
      planId: "10000000-0000-4000-8000-000000000002",
      priceId: "20000000-0000-4000-8000-000000000002",
    });
    expect(dryRun?.body).not.toHaveProperty("nextInvoiceDate");

    fireEvent.click(screen.getByRole("checkbox", { name: "No s'ha cobrat res: queda pendent" }));
    validate();
    await waitFor(() => { expect(onNavigate).toHaveBeenCalledWith("/tauler?signup=validated"); });
    const [validation] = sent(requests, "POST", "/validation", false);
    expect(validation?.body).toMatchObject({
      planId: "10000000-0000-4000-8000-000000000002",
      priceId: "20000000-0000-4000-8000-000000000002",
    });
    expect(validation?.body).not.toHaveProperty("nextInvoiceDate");
  });

  it("renders the dry run's warnings on the plan card (PAID_EXCEEDS_QUOTE on a cheaper plan)", async () => {
    await renderReview();
    fireEvent.change(screen.getByRole("combobox", { name: "Modalitat i tarifa" }), {
      target: { value: "10000000-0000-4000-8000-000000000004|20000000-0000-4000-8000-000000000004" },
    });
    expect(await screen.findByText("El que s'ha cobrat supera el nou import: caldrà retornar la diferència des de Facturació.")).toBeVisible();
    expect(screen.getByRole("combobox", { name: "Modalitat i tarifa" })).toHaveDisplayValue("Teràpia · 10,00 €/mes");
  });

  it("a NOT_FOUND_PENDING claim shows what the applicant typed and is resolved by attaching the holder's group", async () => {
    mockScenario("adminSignupReviewFamilyPending");
    const onNavigate = vi.fn();
    const { fetch: over, requests } = recordingFetch();
    await renderReview({ fetchOverride: over, onNavigate });
    expect(screen.getByText("Pendent — ha indicat: Laura Serra + gos Duna")).toBeVisible();

    validate();
    expect(await screen.findByText("Tria el grup del titular o «Sense grup».")).toBeVisible();
    expect(sent(requests, "POST", "/validation", false)).toEqual([]);

    fireEvent.change(screen.getByLabelText("Cerca el titular"), { target: { value: "Serra" } });
    fireEvent.click(await screen.findByRole("button", { name: "Afegeix al grup de Laura Serra Vidal" }, { timeout: 3_000 }));
    expect(screen.getByText("Grup de Laura Serra Vidal")).toBeVisible();
    const search = sent(requests, "GET", "/members").at(-1);
    expect(decodeURIComponent(search?.query ?? "")).toContain("fields=id,fullName,dogs,familyGroup");

    validate();
    await waitFor(() => { expect(onNavigate).toHaveBeenCalledWith("/tauler?signup=validated"); });
    expect(sent(requests, "POST", "/validation", false)[0]?.body).toMatchObject({ familyGroupId: "family-laura" });
  });

  it("a NOT_FOUND_PENDING claim is resolved with an explicit «Sense grup»: no familyGroupId", async () => {
    mockScenario("adminSignupReviewFamilyPending");
    const onNavigate = vi.fn();
    const { fetch: over, requests } = recordingFetch();
    await renderReview({ fetchOverride: over, onNavigate });
    fireEvent.click(screen.getByRole("button", { name: "Sense grup" }));
    expect(screen.getByText("Sense grup")).toHaveClass("ah-badge");
    validate();
    await waitFor(() => { expect(onNavigate).toHaveBeenCalledWith("/tauler?signup=validated"); });
    expect(sent(requests, "POST", "/validation", false)[0]?.body).not.toHaveProperty("familyGroupId");
  });
});

describe("E3-W07 step 5 · M11 D1 fresh after a decision (R-14-01)", () => {
  it("after VALIDA navigates to /tauler and refreshes the menu counters", async () => {
    const refreshCounters = vi.fn();
    const onNavigate = await renderReview({ refreshCounters });
    validate();
    await waitFor(() => { expect(onNavigate).toHaveBeenCalledWith("/tauler?signup=validated"); });
    expect(refreshCounters).toHaveBeenCalledTimes(1);
  });

  it("a signup with nothing pending (409 INVALID_STATE NOT_PENDING) says it is resolved and links to D10", async () => {
    const onNavigate = vi.fn();
    server.use(http.get("*/api/v1/members/:id/signup", () => apiErrorResponse("INVALID_STATE", 409, { reason: "NOT_PENDING" })));
    window.history.pushState(null, "", `/preinscripcions/${memberId}`);
    const i18n = await createI18n({ branding: canic, browserLanguages: ["ca"], initialNamespaces: ["admin-census"], storage: undefined });
    render(<I18nextProvider i18n={i18n}><BrandingProvider branding={canic}><SignupReviewPage client={createApiClient({ baseUrl: `${window.location.origin}/api/v1` })} onNavigate={onNavigate} /></BrandingProvider></I18nextProvider>);

    expect(await screen.findByText("Aquesta preinscripció ja s'ha resolt")).toBeVisible();
    const link = screen.getByRole("link", { name: "Obre la fitxa de l'abonat" });
    expect(link).toHaveAttribute("href", `/abonats/${memberId}`);
    fireEvent.click(link);
    expect(onNavigate).toHaveBeenCalledWith(`/abonats/${memberId}`);
  });

  it("a VALIDA on a signup another admin already resolved shows the resolved state", async () => {
    await renderReview();
    server.use(http.post("*/api/v1/members/:id/validation", () => apiErrorResponse("INVALID_STATE", 409, { reason: "NOT_PENDING" })));
    validate();
    expect(await screen.findByText("Aquesta preinscripció ja s'ha resolt")).toBeVisible();
  });
});

describe("E3-W07 step 7 · the refund warning (R-04-23)", () => {
  it("warns before rejecting a signup with a collected payment and keeps the refund flag for D1", async () => {
    const refreshCounters = vi.fn();
    const onNavigate = await renderReview({ refreshCounters });
    fireEvent.click(screen.getByRole("button", { name: "REBUTJA (amb motiu)" }));
    const modal = screen.getByRole("dialog", { name: "Rebutja la preinscripció" });
    expect(within(modal).getByText("Hi ha un pagament cobrat: caldrà retornar-lo des de Facturació")).toBeVisible();
    expect(within(modal).getByRole("button", { name: "REBUTJA (amb motiu)" })).toBeDisabled();
    fireEvent.change(within(modal).getByLabelText("Motiu del rebuig"), { target: { value: "Documentació incorrecta" } });
    fireEvent.click(within(modal).getByRole("button", { name: "REBUTJA (amb motiu)" }));
    await waitFor(() => { expect(onNavigate).toHaveBeenCalledWith("/tauler?signup=rejected-refund"); });
    expect(refreshCounters).toHaveBeenCalledTimes(1);
  });

  it("rejects a signup with nothing collected without the warning", async () => {
    mockScenario("adminSignupReviewManual");
    const onNavigate = await renderReview();
    fireEvent.click(screen.getByRole("button", { name: "REBUTJA (amb motiu)" }));
    const modal = screen.getByRole("dialog", { name: "Rebutja la preinscripció" });
    expect(within(modal).queryByText(/Hi ha un pagament cobrat/u)).toBeNull();
    fireEvent.change(within(modal).getByLabelText("Motiu del rebuig"), { target: { value: "Documentació incorrecta" } });
    fireEvent.click(within(modal).getByRole("button", { name: "REBUTJA (amb motiu)" }));
    await waitFor(() => { expect(onNavigate).toHaveBeenCalledWith("/tauler"); });
  });
});

describe("E3-W07 step 8 · the D2 minors", () => {
  it("STALE_VERSION offers a reload that keeps the admin's own choices", async () => {
    const { fetch: over, requests } = recordingFetch();
    await renderReview({ fetchOverride: over });
    fireEvent.change(screen.getByLabelText("Nivell inicial"), { target: { value: "43000000-0000-4000-8000-000000000002" } });
    server.use(http.post("*/api/v1/members/:id/validation", () => apiErrorResponse("STALE_VERSION", 409)));
    validate();
    const alert = await screen.findByText("La preinscripció ha canviat. Torna-la a carregar.");
    const loads = sent(requests, "GET", `/members/${memberId}/signup`).length;
    const banner = alert.closest<HTMLElement>(".signup-review-error");
    if (banner === null) throw new TypeError("No error banner");
    fireEvent.click(within(banner).getByRole("button", { name: "Torna a carregar" }));
    await waitFor(() => { expect(sent(requests, "GET", `/members/${memberId}/signup`).length).toBe(loads + 1); });
    expect(screen.getByLabelText("Nivell inicial")).toHaveValue("43000000-0000-4000-8000-000000000002");
  });

  it("shows a rejection error inside the modal, with the reload action", async () => {
    await renderReview();
    server.use(http.post("*/api/v1/members/:id/rejection", () => apiErrorResponse("STALE_VERSION", 409)));
    fireEvent.click(screen.getByRole("button", { name: "REBUTJA (amb motiu)" }));
    const modal = screen.getByRole("dialog", { name: "Rebutja la preinscripció" });
    fireEvent.change(within(modal).getByLabelText("Motiu del rebuig"), { target: { value: "Documentació incorrecta" } });
    fireEvent.click(within(modal).getByRole("button", { name: "REBUTJA (amb motiu)" }));
    expect(await within(modal).findByRole("alert")).toHaveTextContent("La preinscripció ha canviat. Torna-la a carregar.");
    expect(within(modal).getByRole("button", { name: "Torna a carregar" })).toBeVisible();
  });

  it("names the first month and its portion from upfront.firstMonth: a full month has no «(mitja quota)»", async () => {
    await renderReview({
      fetchOverride: recordingFetch((body) => {
        if (body.upfront == null) return;
        body.upfront.firstMonth = { amountDue: { amountMinor: 6000, currency: "EUR" }, option: "ALTERNATIVE", portion: "FULL", startDate: "2026-09-01" };
        const line = body.upfront.lines[1];
        if (line !== undefined) line.amount = { amountMinor: 6000, currency: "EUR" };
      }).fetch,
    });
    expect(screen.getByText(/Entrada 100,00 € \+ setembre 60,00 € · es registra/u)).toBeVisible();
    expect(screen.queryByText(/mitja quota/u)).toBeNull();
  });

  it("E3-W08 step 0: a first month frozen without its portion (null, api E3-T12) names the month, never «(mitja quota)»", async () => {
    await renderReview({
      fetchOverride: recordingFetch((body) => {
        if (body.upfront == null) return;
        body.upfront.firstMonth = { amountDue: { amountMinor: 3000, currency: "EUR" }, option: "TODAY", portion: null, startDate: "2026-08-17" };
      }).fetch,
    });
    expect(screen.getByText(/Entrada 100,00 € \+ agost 30,00 € · es registra/u)).toBeVisible();
    expect(screen.queryByText(/mitja quota/u)).toBeNull();
  });

  it("en: gender OTHER → «them»", async () => {
    const branding: Branding = { ...canic, locales: ["ca", "es", "en"] };
    window.history.pushState(null, "", `/preinscripcions/${memberId}`);
    await renderReview({
      branding,
      fetchOverride: recordingFetch((body) => { body.member.gender = "OTHER"; }).fetch,
      language: "en",
    });
    expect(await screen.findByText(/do not publish photos showing them\./u)).toBeVisible();
  });

  it("gates the plan, payment and upfront blocks on BILLING and the group row on FAMILY_GROUP", async () => {
    await renderReview({ branding: { ...canic, modules: canic.modules.filter((module) => module !== "BILLING" && module !== "FAMILY_GROUP") } });
    expect(screen.queryByText("Pagament")).toBeNull();
    expect(screen.queryByText("Grup familiar")).toBeNull();
    expect(screen.queryByRole("combobox", { name: "Modalitat i tarifa" })).toBeNull();
    expect(screen.queryByText("Pagament inicial (anticipat)")).toBeNull();
    expect(screen.queryByLabelText("Data del proper rebut")).toBeNull();
    expect(screen.getByText("Abonat")).toBeVisible();
  });
});

describe("E3-W07 round 2 · 1 the invoice date is canonical (R-04-15, S04 §10)", () => {
  it("10/11/2026 typed in ca still sends 2026-11-10 after a switch to en, shown in the en format", async () => {
    const onNavigate = vi.fn();
    const { fetch: over, requests } = recordingFetch();
    await renderReview({ branding: { ...canic, locales: ["ca", "es", "en"] }, fetchOverride: over, onNavigate });
    fireEvent.change(screen.getByLabelText("Data del proper rebut"), { target: { value: "10/11/2026" } });

    await act(async () => { await reviewI18n?.changeLanguage("en"); });
    expect(await screen.findByLabelText("Next invoice date")).toHaveValue("11/10/2026");
    fireEvent.click(screen.getByRole("button", { name: "VALIDATE SIGNUP" }));

    await waitFor(() => { expect(onNavigate).toHaveBeenCalledWith("/tauler?signup=validated"); });
    expect(sent(requests, "POST", "/validation", false)[0]?.body).toMatchObject({ nextInvoiceDate: "2026-11-10" });
  });
});

describe("E3-W07 round 2 · 2 a quote belongs to its plan, price and signup version (S04 §2 D2)", () => {
  it("Pack 6 is quoted, then the Pack 10 quote fails: no 135 € breakdown or max remains, and VALIDA is disabled", async () => {
    mockScenario("adminSignupReviewManual");
    await renderReview();
    const select = screen.getByRole("combobox", { name: "Modalitat i tarifa" });
    fireEvent.change(select, { target: { value: pack6 } });
    expect(await screen.findByText(/^Pack 135,00 € · es registra/u)).toBeVisible();
    expect(screen.getByLabelText("Import efectivament cobrat:")).toHaveAttribute("max", "135.00");

    server.use(http.post("*/api/v1/members/:id/validation", () => apiErrorResponse("PLAN_NOT_AVAILABLE", 422)));
    fireEvent.change(select, { target: { value: pack10 } });

    await waitFor(() => { expect(document.getElementById("signup-plan-error")).toHaveTextContent("Aquest pla no està disponible."); });
    expect(screen.queryByText(/^Pack 135,00 €/u)).toBeNull();
    expect(screen.queryByLabelText("Import efectivament cobrat:")).toBeNull();
    expect(document.querySelector("input[max]")).toBeNull();
    expect(screen.getByRole("button", { name: "VALIDA L'ALTA" })).toBeDisabled();

    // A retry that succeeds shows Pack 10's own quote, and VALIDA comes back.
    server.resetHandlers();
    fireEvent.click(screen.getByRole("button", { name: "Torna-ho a provar" }));
    expect(await screen.findByText(/^Pack 180,00 € · es registra/u)).toBeVisible();
    expect(screen.getByLabelText("Import efectivament cobrat:")).toHaveAttribute("max", "180.00");
    expect(screen.getByRole("button", { name: "VALIDA L'ALTA" })).toBeEnabled();
  });

  it("a reload after a full payment shows no editable amount (the old quote is discarded)", async () => {
    mockScenario("adminSignupReviewManual");
    const { fetch: over, requests } = recordingFetch();
    await renderReview({ fetchOverride: over });
    const select = screen.getByRole("combobox", { name: "Modalitat i tarifa" });
    fireEvent.change(select, { target: { value: pack6 } });
    expect(await screen.findByText(/^Pack 135,00 €/u)).toBeVisible();
    fireEvent.change(select, { target: { value: abonat } });
    expect(await screen.findByText(/^Entrada 100,00 € \+ agost 30,00 €/u)).toBeVisible();
    expect(screen.getByLabelText("Import efectivament cobrat:")).toHaveAttribute("max", "130.00");

    // Meanwhile the applicant pays both lines by card (the mockup's Stripe-paid view), and the
    // validation answers STALE_VERSION: the admin reloads.
    mockScenario("admin");
    server.use(
      http.post("*/api/v1/members/:id/validation", ({ request }) =>
        new URL(request.url).searchParams.get("dryRun") === "true" ? undefined : apiErrorResponse("STALE_VERSION", 409),
      ),
    );
    fireEvent.click(screen.getByRole("checkbox", { name: "No s'ha cobrat res: queda pendent" }));
    validate();
    const banner = (await screen.findByText("La preinscripció ha canviat. Torna-la a carregar.")).closest<HTMLElement>(".signup-review-error");
    if (banner === null) throw new TypeError("No error banner");
    const dryRuns = sent(requests, "POST", "/validation", true).length;
    fireEvent.click(within(banner).getByRole("button", { name: "Torna a carregar" }));

    expect(await screen.findByText("cobrat")).toBeVisible();
    expect(screen.queryByRole("spinbutton")).toBeNull();
    expect(screen.getByRole("combobox", { name: "Modalitat i tarifa" })).toHaveDisplayValue("Abonat · 60,00 €/mes");
    // The admin's plan is quoted again on the fresh view.
    expect(sent(requests, "POST", "/validation", true)).toHaveLength(dryRuns + 1);
  });

  it("drops a Pack 6 answer that lands after the change to Pack 10", async () => {
    mockScenario("adminSignupReviewManual");
    let releasePack6: () => void = () => undefined;
    let pack6Answered = false;
    server.use(
      http.post("*/api/v1/members/:id/validation", async ({ request }) => {
        const body = (await request.clone().json()) as { planId?: string };
        if (body.planId === pack6.split("|")[0]) {
          await new Promise<void>((resolve) => { releasePack6 = resolve; });
          pack6Answered = true;
        }
        return undefined;
      }),
    );
    await renderReview();
    const select = screen.getByRole("combobox", { name: "Modalitat i tarifa" });
    fireEvent.change(select, { target: { value: pack6 } });
    fireEvent.change(select, { target: { value: pack10 } });
    expect(await screen.findByText(/^Pack 180,00 € · es registra/u)).toBeVisible();

    releasePack6();
    await waitFor(() => { expect(pack6Answered).toBe(true); });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 50)); });
    expect(screen.getByText(/^Pack 180,00 € · es registra/u)).toBeVisible();
    expect(screen.queryByText(/^Pack 135,00 €/u)).toBeNull();
    expect(screen.getByLabelText("Import efectivament cobrat:")).toHaveAttribute("max", "180.00");
  });
});

describe("E3-W07 round 2 · 3 the drawer can change the payment method (R-04-19, R-04-10)", () => {
  it("moves a cash applicant to direct debit with IBAN and holder, among the club's methods", async () => {
    let first = true;
    const { fetch: over, requests } = recordingFetch((body) => {
      if (!first) return;
      first = false;
      body.member.paymentMethod = { type: "MANUAL" };
      delete body.member.maskedAccount;
    });
    await renderReview({ fetchOverride: over });
    expect(screen.getByText(dataRow(/^Efectiu$/u))).toBeVisible();
    const drawer = openDrawer();
    const method = within(drawer).getByLabelText("Mètode de pagament");
    await waitFor(() => {
      expect(within(method).getAllByRole("option").map((option) => option.textContent)).toEqual(["Domiciliació", "Efectiu"]);
    });
    expect(method).toHaveValue("MANUAL");
    expect(within(drawer).queryByLabelText("IBAN")).toBeNull();

    fireEvent.change(method, { target: { value: "SEPA_DD" } });
    // R-04-10: the holder is pre-filled with the applicant's full name.
    expect(within(drawer).getByLabelText("Titular del compte")).toHaveValue("Marta Roca Pujol");
    fireEvent.change(within(drawer).getByLabelText("IBAN"), { target: { value: "ES91 2100 0418 4502 0005 1332" } });
    fireEvent.click(within(drawer).getByRole("button", { name: "DESA ELS CANVIS" }));

    expect(await screen.findByText("Les dades s'han actualitzat.")).toBeVisible();
    expect(sent(requests, "PATCH", `/members/${memberId}`)[0]?.body).toEqual({
      paymentMethod: { sepa: { holderName: "Marta Roca Pujol", iban: "ES9121000418450200051332" }, type: "SEPA_DD" },
      version: 3,
    });
    expect(sent(requests, "GET", "/club")).toHaveLength(1);
    expect(await screen.findByText("Domiciliació · ···· ···· ···· ···· 1332 · titular: la mateixa")).toBeVisible();
  });

  it("moves a direct-debit applicant to cash: only the type is sent, and D2 reads «Efectiu»", async () => {
    const { fetch: over, requests } = recordingFetch();
    await renderReview({ fetchOverride: over });
    const drawer = openDrawer();
    const method = within(drawer).getByLabelText("Mètode de pagament");
    await waitFor(() => { expect(within(method).getAllByRole("option")).toHaveLength(2); });
    expect(method).toHaveValue("SEPA_DD");
    fireEvent.change(method, { target: { value: "MANUAL" } });
    expect(within(drawer).queryByLabelText("IBAN")).toBeNull();
    fireEvent.click(within(drawer).getByRole("button", { name: "DESA ELS CANVIS" }));

    expect(await screen.findByText("Les dades s'han actualitzat.")).toBeVisible();
    expect(sent(requests, "PATCH", `/members/${memberId}`)[0]?.body).toEqual({ paymentMethod: { type: "MANUAL" }, version: 3 });
    expect(await screen.findByText(dataRow(/^Efectiu$/u))).toBeVisible();
  });

  it("offers every provider the club has, whatever its enabled flag (the real core's GET /club for the seed)", async () => {
    const { fetch: over } = recordingFetch(undefined, undefined, (club) => {
      // roadmap/evidence/E3-W07/d2-payment-methods-core.json: GET /signup still offers both.
      club.paymentProviders = { SEPA_XML: { configured: false, enabled: false }, MANUAL: { configured: false, enabled: false } };
    });
    await renderReview({ fetchOverride: over });
    const method = within(openDrawer()).getByLabelText("Mètode de pagament");
    await waitFor(() => {
      expect(within(method).getAllByRole("option").map((option) => option.textContent)).toEqual(["Domiciliació", "Efectiu"]);
    });
  });

  it("offers the card too when the club has Stripe enabled", async () => {
    mockScenario("signupStripe");
    await renderReview();
    const method = within(openDrawer()).getByLabelText("Mètode de pagament");
    await waitFor(() => {
      expect(within(method).getAllByRole("option").map((option) => option.textContent)).toEqual(["Domiciliació", "Targeta", "Efectiu"]);
    });
  });

  it("add-dog (R-04-25): the method stays read-only and the club's methods are never asked for", async () => {
    mockScenario("adminSignupReviewAddDog");
    const { fetch: over, requests } = recordingFetch();
    await renderReview({ dogs: "Nit", fetchOverride: over });
    const drawer = openDrawer();
    expect(within(drawer).getByLabelText("Mètode de pagament")).toBeDisabled();
    expect(within(drawer).getByLabelText("Mètode de pagament")).toHaveValue("SEPA_DD");
    expect(sent(requests, "GET", "/club")).toEqual([]);
  });

  it("without BILLING the drawer has no payment method", async () => {
    const { fetch: over, requests } = recordingFetch();
    await renderReview({ branding: { ...canic, modules: canic.modules.filter((module) => module !== "BILLING") }, fetchOverride: over });
    const drawer = openDrawer();
    expect(within(drawer).queryByLabelText("Mètode de pagament")).toBeNull();
    expect(sent(requests, "GET", "/club")).toEqual([]);
  });
});

describe("E3-W08 step 6: a readmission on D2 (S04 R-04-06, E38)", () => {
  it("shows the «Readmissió» badge and, for each changed field only, the LEFT record's value and the submitted one", async () => {
    mockScenario("adminSignupReviewReadmission");
    await renderReview();
    expect(screen.getByText("Readmissió", { selector: ".ah-badge" })).toBeVisible();
    const block = screen.getByRole("region", { name: "Canvis respecte de la fitxa de baixa" });
    const rows = within(block).getAllByRole("term").map((term) => term.textContent);
    expect(rows).toEqual(["Correus electrònics", "Telèfons", "Adreça", "Mètode de pagament"]);
    expect(within(block).getByText("Abans: marta.antic@example.test")).toBeVisible();
    expect(within(block).getByText("Ara: marta.roca@example.test")).toBeVisible();
    expect(within(block).getByText("Abans: +34 655000111")).toBeVisible();
    expect(within(block).getByText("Ara: +34 655123123")).toBeVisible();
    expect(within(block).getByText("Abans: Carrer del Mar, 7, 08349 Cabrera de Mar")).toBeVisible();
    expect(within(block).getByText("Ara: Carrer de la Riera, 12, 08349 Cabrera de Mar")).toBeVisible();
    expect(within(block).getByText("Abans: Efectiu")).toBeVisible();
    expect(within(block).getByText("Ara: Domiciliació · ···· ···· ···· ···· 7719")).toBeVisible();
    // Unchanged fields (the name, the birth date) are not repeated.
    expect(within(block).queryByText(/Marta/u)).toBeNull();
  });

  it("an edit of the submitted phone updates the «Ara» value; the LEFT record's value stays", async () => {
    mockScenario("adminSignupReviewReadmission");
    await renderReview();
    const drawer = openDrawer();
    fireEvent.change(within(drawer).getByLabelText("Telèfon", { selector: "#signup-edit-phone1Number" }), {
      target: { value: "655999888" },
    });
    fireEvent.click(within(drawer).getByRole("button", { name: "DESA ELS CANVIS" }));
    const block = await screen.findByRole("region", { name: "Canvis respecte de la fitxa de baixa" });
    expect(await within(block).findByText("Ara: +34 655999888")).toBeVisible();
    expect(within(block).getByText("Abans: +34 655000111")).toBeVisible();
  });

  it("round 2 #1: the person card, its WhatsApp and the drawer carry the submitted values, not the LEFT record's", async () => {
    mockScenario("adminSignupReviewReadmission");
    await renderReview();
    // `member` is the LEFT record (marta.antic@…, 655000111); the card shows what the validation applies.
    expect(screen.getByText(dataRow(/^marta\.roca@example\.test · \+34 655123123/u))).toBeVisible();
    expect(screen.getByRole("link", { name: /WhatsApp/u })).toHaveAttribute("href", "https://wa.me/34655123123");
    expect(screen.getByText(dataRow(/^Domiciliació · ···· ···· ···· ···· 7719/u))).toBeVisible();
    const drawer = openDrawer();
    expect(within(drawer).getByLabelText("Correu electrònic")).toHaveValue("marta.roca@example.test");
    expect(within(drawer).getByLabelText("Telèfon", { selector: "#signup-edit-phone1Number" })).toHaveValue("655123123");
    expect(within(drawer).getByLabelText("Adreça")).toHaveValue("Carrer de la Riera, 12");
    expect(within(drawer).getByLabelText("Mètode de pagament")).toHaveValue("SEPA_DD");
  });

  it("round 2 #1: a submitted SEPA method without an account (the core's `maskedAccount: null`) is «Compte no informat» on the card", async () => {
    mockScenario("adminSignupReviewReadmission");
    const { fetch: over } = recordingFetch((body) => {
      const block = body.readmission as { submitted: Record<string, unknown> } | undefined;
      if (block !== undefined) {
        block.submitted.paymentMethod = { channel: null, holderName: "Marta Roca Pujol", maskedAccount: null, type: "SEPA_DD" };
      }
    });
    await renderReview({ fetchOverride: over });
    expect(screen.getByText(dataRow(/^Domiciliació · — · titular: la mateixa$/u))).toBeVisible();
    expect(screen.getByText("Compte no informat", { selector: ".signup-review-warning" })).toBeVisible();
  });

  it("round 2 #1: during a readmission, editing phone 2 keeps the submitted phone 1 in the PATCH", async () => {
    mockScenario("adminSignupReviewReadmission");
    const { fetch: over, requests } = recordingFetch();
    await renderReview({ fetchOverride: over });
    const drawer = openDrawer();
    fireEvent.change(within(drawer).getByLabelText("Telèfon", { selector: "#signup-edit-phone2Number" }), {
      target: { value: "655444333" },
    });
    fireEvent.change(within(drawer).getByLabelText("Descripció"), { target: { value: "Feina" } });
    fireEvent.click(within(drawer).getByRole("button", { name: "DESA ELS CANVIS" }));
    await waitFor(() => {
      expect(sent(requests, "PATCH", `/members/${memberId}`)).toHaveLength(1);
    });
    expect(sent(requests, "PATCH", `/members/${memberId}`)[0]?.body).toEqual({
      phones: [
        { label: "Mòbil", number: "655123123", prefix: "+34" },
        { label: "Feina", number: "655444333", prefix: "+34" },
      ],
      version: 3,
    });
    const block = await screen.findByRole("region", { name: "Canvis respecte de la fitxa de baixa" });
    expect(await within(block).findByText("Ara: +34 655123123 · +34 655444333")).toBeVisible();
    expect(within(block).getByText("Abans: +34 655000111")).toBeVisible();
  });

  it("the DNI/NIE is read-only while the readmission waits, and says how to correct it", async () => {
    mockScenario("adminSignupReviewReadmission");
    const { fetch: over, requests } = recordingFetch();
    await renderReview({ fetchOverride: over });
    const drawer = openDrawer();
    const document = within(drawer).getByLabelText("DNI/NIE");
    expect(document).toHaveAttribute("readonly");
    expect(document).toHaveValue("47123456K");
    const help = window.document.getElementById(document.getAttribute("aria-describedby") ?? "");
    expect(help).toHaveTextContent(
      "El DNI/NIE no es pot canviar durant una readmissió: per corregir-lo, rebutja la readmissió.",
    );
    fireEvent.change(document, { target: { value: "47123457P" } });
    fireEvent.change(within(drawer).getByLabelText("Nom", { selector: "#signup-edit-firstName" }), {
      target: { value: "Marta Isabel" },
    });
    fireEvent.click(within(drawer).getByRole("button", { name: "DESA ELS CANVIS" }));
    await waitFor(() => {
      expect(sent(requests, "PATCH", `/members/${memberId}`)).toHaveLength(1);
    });
    expect(sent(requests, "PATCH", `/members/${memberId}`)[0]?.body).not.toHaveProperty("idDocument");
  });

  it("a 409 INVALID_STATE READMISSION_PENDING shows «rebutja la readmissió» inside the drawer", async () => {
    server.use(
      http.patch(`*/api/v1/members/${memberId}`, () =>
        apiErrorResponse("INVALID_STATE", 409, { reason: "READMISSION_PENDING" }),
      ),
    );
    await renderReview();
    const drawer = openDrawer();
    fireEvent.change(within(drawer).getByLabelText("DNI/NIE"), { target: { value: "47123457P" } });
    fireEvent.click(within(drawer).getByRole("button", { name: "DESA ELS CANVIS" }));
    expect(
      await within(drawer).findByText(
        "El DNI/NIE no es pot canviar durant una readmissió: per corregir-lo, rebutja la readmissió.",
      ),
    ).toBeVisible();
  });

  it("a signup that is not a readmission has no readmission block and an editable DNI/NIE", async () => {
    await renderReview();
    expect(screen.queryByRole("region", { name: "Canvis respecte de la fitxa de baixa" })).toBeNull();
    expect(within(openDrawer()).getByLabelText("DNI/NIE")).not.toHaveAttribute("readonly");
  });

  it("round 2: `readmission: null` (how the core writes an ordinary signup) keeps the DNI/NIE editable and the card on `member`", async () => {
    const { fetch: over } = recordingFetch((body) => {
      (body as Record<string, unknown>).readmission = null;
    });
    await renderReview({ fetchOverride: over });
    expect(screen.queryByRole("region", { name: "Canvis respecte de la fitxa de baixa" })).toBeNull();
    expect(screen.getByText(dataRow(/^marta\.roca@example\.test · \+34 655123123/u))).toBeVisible();
    expect(within(openDrawer()).getByLabelText("DNI/NIE")).not.toHaveAttribute("readonly");
  });
});
