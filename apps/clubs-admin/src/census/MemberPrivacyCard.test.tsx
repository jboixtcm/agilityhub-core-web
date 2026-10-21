import { createApiClient } from "@agilityhub/api-client";
import {
  mockScenario,
  resetAuditMockState,
  resetMemberBillingState,
} from "@agilityhub/api-client/mocks";
import brandingCanicFixture from "@agilityhub/api-client/mocks/branding-canic";
import { server } from "@agilityhub/api-client/mocks/server";
import { createI18n } from "@agilityhub/i18n";
import { type Branding, BrandingProvider } from "@agilityhub/ui";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { I18nextProvider } from "react-i18next";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { MemberDataExportButton, MemberPrivacyCard } from "./MemberPrivacyCard";

const branding = brandingCanicFixture as Branding;
let client = createApiClient({ baseUrl: `${window.location.origin}/api/v1` });

beforeAll(() => {
  server.listen({ onUnhandledRequest: "error" });
});

beforeEach(() => {
  client = createApiClient({ baseUrl: `${window.location.origin}/api/v1` });
});

afterEach(() => {
  cleanup();
  server.resetHandlers();
  server.events.removeAllListeners();
  resetAuditMockState();
  // The census record and the LEFT member of `memberLeft` (its one-time setup included).
  resetMemberBillingState();
  mockScenario("admin");
});

afterAll(() => {
  server.close();
});

/** A live erasure request as `GET /members/{id}/erasure` sends it (no invented optional field). */
function liveErasure(
  status: "BLOCKED" | "ERASING" | "SCHEDULED",
  blockReasons: string[] = [],
  scope: "ACCOUNT" | "MEMBER" = "MEMBER",
) {
  return {
    accountId: "10000000-0000-4000-8000-000000000002",
    blockReasons,
    clubId: "50000000-0000-4000-8000-000000000001",
    clubIds: ["50000000-0000-4000-8000-000000000001"],
    executeAt: "2026-10-31T09:00:00Z",
    id: "72000000-0000-4000-8000-000000000001",
    memberIds: ["member-laura"],
    requestedAt: "2026-10-01T09:00:00Z",
    requestedByAccountId: "10000000-0000-4000-8000-000000000001",
    scope,
    source: "ADMIN",
    status,
    version: 2,
  };
}

function apiFailure(code: string, status: number, details: Record<string, unknown> = {}) {
  return HttpResponse.json({ code, details, message: code, traceId: "privacy-test" }, { status });
}

async function renderPrivacy(
  status: "ACTIVE" | "INACTIVE" | "LEFT" = "LEFT",
  language = "ca",
  erased = false,
  onErased: () => void = () => undefined,
) {
  const i18n = await createI18n({
    branding: { ...branding, locales: ["ca", "es", "en"] },
    browserLanguages: [language],
    initialNamespaces: ["admin-census", "errors"],
    storage: undefined,
  });
  render(
    <I18nextProvider i18n={i18n}>
      <BrandingProvider branding={branding}>
        <MemberPrivacyCard
          client={client}
          erased={erased}
          memberId="member-laura"
          onErased={onErased}
          status={status}
        />
      </BrandingProvider>
    </I18nextProvider>,
  );
}

async function renderExportButton(onErased: () => void = () => undefined) {
  const i18n = await createI18n({
    branding,
    browserLanguages: ["ca"],
    initialNamespaces: ["admin-census", "errors"],
    storage: undefined,
  });
  render(
    <I18nextProvider i18n={i18n}>
      <MemberDataExportButton client={client} memberId="member-laura" onErased={onErased} />
    </I18nextProvider>,
  );
}

describe("T-14-18 · D10 requests and cancels a member erasure (R-14-14)", () => {
  it("shows the eligibility checks, the scheduled date and the cancellation", async () => {
    mockScenario("memberLeft");
    await renderPrivacy();

    expect(await screen.findByText("Política de privacitat")).toBeVisible();
    expect(screen.getByText("Drets d'imatge")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Suprimeix les dades (RGPD)" }));

    const requestDialog = screen.getByRole("dialog", { name: "Suprimeix les dades (RGPD)" });
    expect(within(requestDialog).getByText(/ha d'estar de baixa/u)).toBeVisible();
    expect(within(requestDialog).getByText(/cap rebut obert/u)).toBeVisible();
    expect(within(requestDialog).getByText(/cap reserva futura/u)).toBeVisible();
    fireEvent.change(within(requestDialog).getByLabelText("Motiu (opcional)"), {
      target: { value: "Petició presencial" },
    });
    fireEvent.click(within(requestDialog).getByRole("button", { name: "PROGRAMA LA SUPRESSIÓ" }));

    expect(await screen.findByText(/Supressió programada per al/u)).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Anul·la la supressió" }));
    const cancelDialog = screen.getByRole("dialog", { name: "Anul·la la supressió" });
    fireEvent.click(within(cancelDialog).getByRole("button", { name: "ANUL·LA LA SUPRESSIÓ" }));
    await waitFor(() => {
      expect(screen.queryByText(/Supressió programada per al/u)).not.toBeInTheDocument();
    });
    expect(screen.getByRole("status")).toHaveTextContent("La sol·licitud s'ha anul·lat.");
  });

  it("keeps the api's 422 ERASURE_BLOCKED reasons inside the request dialog", async () => {
    mockScenario("memberLeft");
    server.use(
      http.post("*/api/v1/members/:id/erasure", () =>
        apiFailure("ERASURE_BLOCKED", 422, { reasons: ["INVOICES_OPEN", "FUTURE_BOOKINGS"] }),
      ),
    );
    await renderPrivacy();
    await screen.findByText("Política de privacitat");
    fireEvent.click(screen.getByRole("button", { name: "Suprimeix les dades (RGPD)" }));
    const dialog = screen.getByRole("dialog", { name: "Suprimeix les dades (RGPD)" });
    fireEvent.click(within(dialog).getByRole("button", { name: "PROGRAMA LA SUPRESSIÓ" }));

    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "Hi ha rebuts pendents, en cobrament o impagats.",
    );
    expect(within(dialog).getByRole("alert")).toHaveTextContent("Hi ha reserves futures actives.");
  });

  it("offers no erasure action unless the member is LEFT and not erased", async () => {
    await renderPrivacy("ACTIVE");
    await screen.findByText("Política de privacitat");
    expect(screen.queryByRole("button", { name: "Suprimeix les dades (RGPD)" })).toBeNull();
    cleanup();
    await renderPrivacy("LEFT", "ca", true);
    await screen.findByText("Política de privacitat");
    expect(screen.queryByRole("button", { name: "Suprimeix les dades (RGPD)" })).toBeNull();
  });

  it("R-14-14 «la UI ho diu»: an ACTIVE or INACTIVE member's card says the leave comes first, in ca, es and en", async () => {
    for (const [status, language, text] of [
      ["ACTIVE", "ca", "Per suprimir les dades, primer cal tramitar la baixa de l'abonat."],
      ["INACTIVE", "ca", "Per suprimir les dades, primer cal tramitar la baixa de l'abonat."],
      ["ACTIVE", "es", "Para suprimir los datos, primero hay que tramitar la baja del abonado."],
      ["ACTIVE", "en", "To erase the data, the member's leave must be processed first."],
    ] as const) {
      await renderPrivacy(status, language);
      expect(await screen.findByText(text)).toBeVisible();
      cleanup();
    }
    // A LEFT member gets the action instead, and an erased one neither.
    mockScenario("memberLeft");
    await renderPrivacy("LEFT");
    await screen.findByRole("button", { name: "Suprimeix les dades (RGPD)" });
    expect(screen.queryByText(/primer cal tramitar la baixa/u)).toBeNull();
    cleanup();
    await renderPrivacy("ACTIVE", "ca", true);
    await screen.findByText("Política de privacitat");
    expect(screen.queryByText(/primer cal tramitar la baixa/u)).toBeNull();
  });

  it("409 ERASURE_ALREADY_REQUESTED (another admin asked first) reads the live request again and shows it scheduled", async () => {
    mockScenario("memberLeft");
    const gets: number[] = [];
    server.events.on("request:start", ({ request }) => {
      if (request.method === "GET" && new URL(request.url).pathname.endsWith("/erasure")) {
        gets.push(Date.now());
      }
    });
    await renderPrivacy();
    fireEvent.click(await screen.findByRole("button", { name: "Suprimeix les dades (RGPD)" }));
    // Meanwhile another admin schedules it (the mock's state, as the api would hold it).
    const other = await client.POST("/members/{id}/erasure", {
      body: {},
      params: { path: { id: "member-laura" } },
    });
    expect(other.response.status).toBe(201);
    const dialog = screen.getByRole("dialog", { name: "Suprimeix les dades (RGPD)" });
    fireEvent.click(within(dialog).getByRole("button", { name: "PROGRAMA LA SUPRESSIÓ" }));

    expect(await screen.findByText(/Supressió programada per al/u)).toBeVisible();
    expect(screen.getByText("L'esborrament de dades ja s'ha sol·licitat.")).toBeVisible();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByRole("button", { name: "Suprimeix les dades (RGPD)" })).toBeNull();
    expect(screen.getByRole("button", { name: "Anul·la la supressió" })).toBeEnabled();
    expect(gets).toHaveLength(2);
  });

  it("409 INVALID_STATE on the cancellation (the request started meanwhile) stays in the dialog and the card shows it running", async () => {
    mockScenario("memberLeft");
    let reads = 0;
    server.use(
      http.get("*/api/v1/members/:id/erasure", () => {
        reads += 1;
        return HttpResponse.json(liveErasure(reads === 1 ? "SCHEDULED" : "ERASING"));
      }),
      http.delete("*/api/v1/members/:id/erasure", () =>
        apiFailure("INVALID_STATE", 409, { scope: "MEMBER", status: "ERASING" }),
      ),
    );
    await renderPrivacy();
    fireEvent.click(await screen.findByRole("button", { name: "Anul·la la supressió" }));
    const dialog = screen.getByRole("dialog", { name: "Anul·la la supressió" });
    fireEvent.click(within(dialog).getByRole("button", { name: "ANUL·LA LA SUPRESSIÓ" }));

    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "Aquest element no està en un estat vàlid per a aquesta operació.",
    );
    expect(await screen.findByText("La supressió està en curs.")).toBeVisible();
    // Neither the card nor the dialog offers the cancellation of a running erasure.
    expect(within(dialog).queryByRole("button", { name: "ANUL·LA LA SUPRESSIÓ" })).toBeNull();
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel·la" }));
    expect(screen.queryByRole("button", { name: "Anul·la la supressió" })).toBeNull();
  });

  it("a BLOCKED request has its own line, its block reasons and the cancellation; an ERASING one only its line", async () => {
    mockScenario("memberLeft");
    server.use(
      http.get("*/api/v1/members/:id/erasure", () =>
        HttpResponse.json(liveErasure("BLOCKED", ["INVOICES_OPEN", "UPFRONT_OPEN"])),
      ),
    );
    await renderPrivacy();
    expect(
      await screen.findByText(
        /^La supressió prevista per al .+ està bloquejada: es torna a provar cada dia\.$/u,
      ),
    ).toBeVisible();
    expect(screen.queryByText(/Supressió programada per al/u)).toBeNull();
    expect(screen.getByText("Hi ha rebuts pendents, en cobrament o impagats.")).toBeVisible();
    expect(screen.getByText("Hi ha pagaments inicials oberts.")).toBeVisible();
    expect(screen.getByRole("button", { name: "Anul·la la supressió" })).toBeEnabled();

    cleanup();
    server.use(
      http.get("*/api/v1/members/:id/erasure", () => HttpResponse.json(liveErasure("ERASING"))),
    );
    await renderPrivacy();
    expect(await screen.findByText("La supressió està en curs.")).toBeVisible();
    expect(screen.queryByText(/Supressió programada per al/u)).toBeNull();
    expect(screen.queryByRole("button", { name: "Anul·la la supressió" })).toBeNull();

    // The platform's ACCOUNT request is cancelled from the console, never from D10 (409 INVALID_STATE).
    cleanup();
    server.use(
      http.get("*/api/v1/members/:id/erasure", () =>
        HttpResponse.json(liveErasure("SCHEDULED", [], "ACCOUNT")),
      ),
    );
    await renderPrivacy();
    expect(await screen.findByText(/Supressió programada per al/u)).toBeVisible();
    expect(screen.queryByRole("button", { name: "Anul·la la supressió" })).toBeNull();
  });

  it("a failed first read shows the error with [Torna-ho a provar] and no request button until it reads", async () => {
    mockScenario("memberLeft");
    let reads = 0;
    server.use(
      http.get("*/api/v1/members/:id/erasure", () => {
        reads += 1;
        return reads === 1 ? apiFailure("INTERNAL_ERROR", 500) : undefined;
      }),
    );
    await renderPrivacy();
    const retry = await screen.findByRole("button", { name: "Torna-ho a provar" });
    expect(retry.closest("[role='alert']")).not.toBeNull();
    expect(screen.queryByRole("button", { name: "Suprimeix les dades (RGPD)" })).toBeNull();
    fireEvent.click(retry);
    expect(await screen.findByRole("button", { name: "Suprimeix les dades (RGPD)" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Torna-ho a provar" })).toBeNull();
    expect(reads).toBe(2);
  });

  it("409 MEMBER_ERASED on the request or the cancellation calls the page's onErased and sends nothing more", async () => {
    mockScenario("memberLeft");
    const onErased = vi.fn();
    server.use(http.post("*/api/v1/members/:id/erasure", () => apiFailure("MEMBER_ERASED", 409)));
    await renderPrivacy("LEFT", "ca", false, onErased);
    fireEvent.click(await screen.findByRole("button", { name: "Suprimeix les dades (RGPD)" }));
    const dialog = screen.getByRole("dialog", { name: "Suprimeix les dades (RGPD)" });
    fireEvent.click(within(dialog).getByRole("button", { name: "PROGRAMA LA SUPRESSIÓ" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "Aquest abonat ha estat suprimit i ja no es pot modificar.",
    );
    expect(onErased).toHaveBeenCalledTimes(1);

    cleanup();
    onErased.mockClear();
    server.use(
      http.get("*/api/v1/members/:id/erasure", () => HttpResponse.json(liveErasure("SCHEDULED"))),
      http.delete("*/api/v1/members/:id/erasure", () => apiFailure("MEMBER_ERASED", 409)),
    );
    await renderPrivacy("LEFT", "ca", false, onErased);
    fireEvent.click(await screen.findByRole("button", { name: "Anul·la la supressió" }));
    const cancelDialog = screen.getByRole("dialog", { name: "Anul·la la supressió" });
    fireEvent.click(within(cancelDialog).getByRole("button", { name: "ANUL·LA LA SUPRESSIÓ" }));
    expect(await within(cancelDialog).findByRole("alert")).toHaveTextContent(
      "Aquest abonat ha estat suprimit i ja no es pot modificar.",
    );
    expect(onErased).toHaveBeenCalledTimes(1);
  });
});

describe("T-14-17 and R-14-18 · D10 data access and consent history", () => {
  it("queues an admin data package once, disables the action while pending and reports it", async () => {
    let resolveRequest: (() => void) | undefined;
    let requestBody: unknown;
    server.use(
      http.post("*/api/v1/members/:id/data-export", async ({ request }) => {
        requestBody = await request.json();
        await new Promise<void>((resolve) => {
          resolveRequest = resolve;
        });
        return HttpResponse.json(
          { jobId: "71000000-0000-4000-8000-000000000001", statusUrl: "/api/v1/exports/job" },
          { status: 202 },
        );
      }),
    );
    await renderExportButton();

    const button = screen.getByRole("button", { name: "Descarrega les dades (RGPD)" });
    fireEvent.click(button);
    expect(button).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent("S'està preparant el paquet de dades.");
    fireEvent.click(button);
    await waitFor(() => {
      expect(resolveRequest).toBeTypeOf("function");
    });
    resolveRequest?.();
    await waitFor(() => {
      expect(requestBody).toEqual({ deliverToMember: false });
      expect(button).toBeEnabled();
    });
  });

  it("T-14-17: the admin's 422 DATA_EXPORT_TOO_SOON (one package a day) stays beside the button, which can be pressed again", async () => {
    await renderExportButton();
    const button = screen.getByRole("button", { name: "Descarrega les dades (RGPD)" });
    fireEvent.click(button);
    expect(await screen.findByText("El paquet s'està preparant. El trobaràs a Exportacions.")).toBe(
      screen.getByRole("status"),
    );
    // The mock keeps the api's 24 h window: the second package of the day is refused.
    fireEvent.click(button);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Encara no es pot sol·licitar una nova exportació de dades.",
    );
    expect(button).toBeEnabled();
  });

  it("409 MEMBER_ERASED on the data package calls the page's onErased (the page says it)", async () => {
    const onErased = vi.fn();
    server.use(
      http.post("*/api/v1/members/:id/data-export", () => apiFailure("MEMBER_ERASED", 409)),
    );
    await renderExportButton(onErased);
    fireEvent.click(screen.getByRole("button", { name: "Descarrega les dades (RGPD)" }));
    await waitFor(() => {
      expect(onErased).toHaveBeenCalledTimes(1);
    });
  });

  it("R-14-18 renders the consent history in ca, es and en without the ipHash", async () => {
    for (const [language, privacy, image] of [
      ["ca", "Política de privacitat", "Drets d'imatge"],
      ["es", "Política de privacidad", "Derechos de imagen"],
      ["en", "Privacy policy", "Image rights"],
    ] as const) {
      await renderPrivacy("ACTIVE", language);
      expect(await screen.findByText(privacy)).toBeVisible();
      expect(screen.getByText(image)).toBeVisible();
      expect(screen.queryByText(/mock-ip-hash/u)).toBeNull();
      cleanup();
    }
  });
});
