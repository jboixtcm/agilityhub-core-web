import { createApiClient } from "@agilityhub/api-client";
import { mockScenario, resetMemberBillingState } from "@agilityhub/api-client/mocks";
import brandingFixture from "@agilityhub/api-client/mocks/branding-canic";
import { server } from "@agilityhub/api-client/mocks/server";
import { createI18n } from "@agilityhub/i18n";
import { type Branding, BrandingProvider, ToastProvider } from "@agilityhub/ui";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { I18nextProvider } from "react-i18next";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { MemberBillingBlock } from "./MemberBillingBlock";

const branding: Branding = {
  ...brandingFixture,
  locales: ["ca", "es", "en"],
  theme: { ...brandingFixture.theme, mode: "dark" },
};
const dogs = [
  {
    breed: "border collie",
    freeTrainingAllowed: false,
    id: "dog-duna",
    name: "Duna",
    pendingDocuments: [],
  },
  {
    breed: "mestís",
    freeTrainingAllowed: true,
    id: "dog-rock",
    name: "Rock",
    pendingDocuments: [],
  },
];

beforeAll(() => {
  server.listen({ onUnhandledRequest: "error" });
});
afterEach(() => {
  cleanup();
  server.resetHandlers();
  resetMemberBillingState();
  mockScenario("admin");
});
afterAll(() => {
  server.close();
});

async function renderBlock(brandingOverride: Branding = branding) {
  mockScenario("admin");
  const i18n = await createI18n({
    branding: brandingOverride,
    browserLanguages: ["ca"],
    initialNamespaces: ["admin-census", "enums", "errors"],
    storage: undefined,
  });
  render(
    <I18nextProvider i18n={i18n}>
      <BrandingProvider branding={brandingOverride}>
        <ToastProvider dismissLabel="Tanca">
          <MemberBillingBlock
            client={createApiClient({ baseUrl: `${window.location.origin}/api/v1` })}
            dogs={dogs}
            memberId="member-laura"
          />
        </ToastProvider>
      </BrandingProvider>
    </I18nextProvider>,
  );
}

describe("D10 member billing block", () => {
  it("loads recent receipts, upfront payments and the dog pack", async () => {
    await renderBlock();
    expect(await screen.findByText("2026-0912")).toBeVisible();
    expect(screen.getByText("Entrada")).toBeVisible();
    expect(screen.getByText("Pack 10", { exact: false })).toBeVisible();
    expect(screen.getByRole("link", { name: "Tots els rebuts ›" })).toHaveAttribute(
      "href",
      expect.stringContaining("memberId%3Aeq%3Amember-laura"),
    );
  });

  it("keeps AMOUNT_EXCEEDS_DUE on the amount field", async () => {
    await renderBlock();
    fireEvent.click(await screen.findByRole("button", { name: "Registra un pagament" }));
    const dialog = screen.getByRole("dialog", { name: "Registra un pagament" });
    fireEvent.change(within(dialog).getByLabelText("Import degut"), { target: { value: "10" } });
    fireEvent.change(within(dialog).getByLabelText("Import pagat"), { target: { value: "20" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Desa" }));
    expect(await within(dialog).findByText(/no pot superar/u)).toBeVisible();
  });

  it("requires a new expiry when adjusting an expired pack", async () => {
    server.use(
      http.get("*/api/v1/pack-balances", () =>
        HttpResponse.json([
          {
            consumed: 10,
            dogId: "dog-rock",
            expiresOn: "2026-07-31",
            id: "53000000-0000-4000-8000-000000000099",
            memberId: "member-laura",
            movements: [],
            openedOn: "2026-01-01",
            planId: "plan-pack-10",
            planName: "Pack 10",
            remaining: 0,
            sessionsTotal: 10,
            state: "EXPIRED",
          },
        ]),
      ),
    );
    await renderBlock();
    fireEvent.click(await screen.findByRole("button", { name: "Ajusta" }));
    const dialog = screen.getByRole("dialog", { name: "Ajusta" });
    expect(within(dialog).getByLabelText("Nova caducitat")).toBeRequired();
    expect(screen.getByText(/Pack 10/u).closest(".member-billing__pack")).not.toHaveTextContent(
      "disponibles",
    );
    expect(screen.getByText(/Pack 10/u).closest(".member-billing__pack")).toHaveTextContent(
      "caducat",
    );
  });

  it("names the dog on every pack row and inside its adjustment modal", async () => {
    server.use(
      http.get("*/api/v1/pack-balances", () =>
        HttpResponse.json(
          dogs.map((dog, index) => ({
            consumed: index + 1,
            dogId: dog.id,
            expiresOn: "2026-12-31",
            id: `pack-${dog.id}`,
            memberId: "member-laura",
            movements: [],
            openedOn: "2026-08-01",
            planId: "plan-pack-10",
            planName: "Pack 10",
            remaining: 9 - index,
            sessionsTotal: 10,
            state: "ACTIVE",
            upfrontPaymentId: null,
          })),
        ),
      ),
    );
    await renderBlock();
    const packRows = await screen.findAllByText("Pack 10", { exact: false });
    expect(packRows).toHaveLength(2);
    expect(packRows[0]?.closest(".member-billing__pack")).toHaveTextContent("Duna");
    expect(packRows[1]?.closest(".member-billing__pack")).toHaveTextContent("Rock");
    const [, rockAdjust] = screen.getAllByRole("button", { name: "Ajusta" });
    if (rockAdjust === undefined) throw new Error("Rock adjustment button was not rendered");
    fireEvent.click(rockAdjust);
    expect(screen.getByRole("dialog", { name: "Ajusta" })).toHaveTextContent("Rock");
  });

  it("omits the pack request, section and upfront PACK concept when PACKS is off", async () => {
    const requests: string[] = [];
    server.events.on("request:start", ({ request }) => {
      requests.push(new URL(request.url).pathname);
    });
    await renderBlock({
      ...branding,
      modules: branding.modules.filter((module) => module !== "PACKS"),
    });
    await screen.findByText("2026-0912");
    expect(requests).not.toContain("/api/v1/pack-balances");
    expect(screen.queryByRole("heading", { name: "Packs" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Registra un pagament" }));
    expect(within(screen.getByLabelText("Concepte")).queryByRole("option", { name: "Pack" })).toBeNull();
  });

  it("maps adjustment field errors and shows an alert for an unclassified failure", async () => {
    server.use(
      http.post("*/api/v1/pack-balances/:id/adjustments", () =>
        HttpResponse.json(
          {
            code: "VALIDATION_ERROR",
            details: { fieldErrors: [{ code: "REQUIRED", field: "reason" }] },
            message: "VALIDATION_ERROR",
            traceId: "test-trace",
          },
          { status: 400 },
        ),
      ),
    );
    await renderBlock();
    fireEvent.click(await screen.findByRole("button", { name: "Ajusta" }));
    let dialog = screen.getByRole("dialog", { name: "Ajusta" });
    fireEvent.change(within(dialog).getByLabelText("Variació de sessions"), {
      target: { value: "1" },
    });
    fireEvent.change(within(dialog).getByLabelText("Motiu"), { target: { value: "Correcció" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Desa" }));
    expect(await within(dialog).findByText(/camps destacats/u)).toBeVisible();

    server.use(
      http.post("*/api/v1/pack-balances/:id/adjustments", () =>
        HttpResponse.json(
          { code: "INTERNAL_ERROR", details: {}, message: "INTERNAL_ERROR", traceId: "test-trace" },
          { status: 500 },
        ),
      ),
    );
    fireEvent.change(within(dialog).getByLabelText("Motiu"), { target: { value: "Segon intent" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Desa" }));
    await waitFor(() => {
      dialog = screen.getByRole("dialog", { name: "Ajusta" });
      expect(within(dialog).getByRole("alert")).toBeVisible();
    });
  });

  it("keeps an expiry validation visible when the pack expired after the modal opened", async () => {
    let packReads = 0;
    const balance = (state: "ACTIVE" | "EXPIRED") => ({
      consumed: 6,
      dogId: "dog-rock",
      expiresOn: "2026-07-31",
      id: "pack-race",
      memberId: "member-laura",
      movements: [],
      openedOn: "2026-01-01",
      planId: "plan-pack-10",
      planName: "Pack 10",
      remaining: 4,
      sessionsTotal: 10,
      state,
      upfrontPaymentId: null,
    });
    server.use(
      http.get("*/api/v1/pack-balances", () => {
        packReads += 1;
        return HttpResponse.json([balance(packReads === 1 ? "ACTIVE" : "EXPIRED")]);
      }),
      http.post("*/api/v1/pack-balances/:id/adjustments", () =>
        HttpResponse.json(
          {
            code: "VALIDATION_ERROR",
            details: { fieldErrors: [{ code: "REQUIRED", field: "expiresOn" }] },
            message: "VALIDATION_ERROR",
            traceId: "pack-race",
          },
          { status: 400 },
        ),
      ),
    );
    await renderBlock();
    fireEvent.click(await screen.findByRole("button", { name: "Ajusta" }));
    const dialog = screen.getByRole("dialog", { name: "Ajusta" });
    fireEvent.change(within(dialog).getByLabelText("Variació de sessions"), {
      target: { value: "1" },
    });
    fireEvent.change(within(dialog).getByLabelText("Motiu"), { target: { value: "Correcció" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Desa" }));
    await waitFor(() => {
      expect(within(dialog).getByLabelText("Nova caducitat")).toBeVisible();
    });
    expect(within(dialog).getByText(/camps destacats/u)).toBeVisible();
  });

  it("shows and retries section-level errors for rejected receipt, payment and pack reads", async () => {
    const failing = () =>
      HttpResponse.json(
        { code: "INTERNAL_ERROR", details: {}, message: "INTERNAL_ERROR", traceId: "read-test" },
        { status: 500 },
      );
    server.use(
      http.get("*/api/v1/invoices", failing),
      http.get("*/api/v1/upfront-payments", failing),
      http.get("*/api/v1/pack-balances", failing),
    );
    await renderBlock();

    for (const name of ["Rebuts recents", "Pagaments a l'acte", "Packs"]) {
      const section = (await screen.findByRole("heading", { name })).closest("section");
      if (section === null) throw new Error(`Missing ${name} section`);
      expect(await within(section).findByRole("alert")).toBeVisible();
      expect(
        within(section).getByRole("button", { name: "Torna-ho a provar" }),
      ).toBeVisible();
    }

    server.resetHandlers();
    const retry = screen.getAllByRole("button", { name: "Torna-ho a provar" })[0];
    if (retry === undefined) throw new Error("Missing billing read retry");
    fireEvent.click(retry);
    expect(retry).toBeDisabled();
    expect(await screen.findByText("2026-0912")).toBeVisible();
    await waitFor(() => {
      expect(screen.queryAllByRole("alert")).toHaveLength(0);
    });
  });

  it("keeps stale section data visible with an error when a post-write refresh is rejected", async () => {
    await renderBlock();
    expect(await screen.findByText("Entrada")).toBeVisible();
    const failing = () =>
      HttpResponse.json(
        { code: "INTERNAL_ERROR", details: {}, message: "INTERNAL_ERROR", traceId: "refresh-test" },
        { status: 500 },
      );
    server.use(
      http.get("*/api/v1/invoices", failing),
      http.get("*/api/v1/upfront-payments", failing),
      http.get("*/api/v1/pack-balances", failing),
    );
    fireEvent.click(screen.getByRole("button", { name: "Registra un pagament" }));
    const dialog = screen.getByRole("dialog", { name: "Registra un pagament" });
    fireEvent.change(within(dialog).getByLabelText("Import degut"), { target: { value: "10" } });
    fireEvent.change(within(dialog).getByLabelText("Import pagat"), { target: { value: "10" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Desa" }));

    const payments = screen.getByRole("heading", { name: "Pagaments a l'acte" }).closest("section");
    if (payments === null) throw new Error("Missing upfront section");
    expect(await within(payments).findByRole("alert")).toBeVisible();
    expect(within(payments).getByText("Entrada")).toBeVisible();
  });
});

describe("E11-W07 step 2 (E146, S12 §6 PUT /members/{id}/next-invoice-date): D10's next receipt", () => {
  // Club-local 05/10/2026: the window is 01/10/2025 … 31/10/2027.
  beforeEach(() => {
    vi.useFakeTimers({ now: new Date("2026-10-05T10:00:00Z"), shouldAdvanceTime: true, toFake: ["Date"] });
  });
  afterEach(() => {
    vi.useRealTimers();
    server.events.removeAllListeners();
  });

  async function renderNext({
    monthly = true,
    nextInvoiceDate = "2026-09-01",
    onNextInvoiceDateChanged = vi.fn(),
    readOnly = false,
    section: expectSection = true,
  }: {
    monthly?: boolean;
    nextInvoiceDate?: string | null;
    onNextInvoiceDateChanged?: (date: string) => void;
    readOnly?: boolean;
    section?: boolean;
  } = {}) {
    const i18n = await createI18n({
      branding,
      browserLanguages: ["ca"],
      initialNamespaces: ["admin-census", "enums", "errors"],
      storage: undefined,
    });
    render(
      <I18nextProvider i18n={i18n}>
        <BrandingProvider branding={branding}>
          <MemberBillingBlock
            client={createApiClient({ baseUrl: `${window.location.origin}/api/v1` })}
            dogs={dogs}
            memberId="member-laura"
            monthly={monthly}
            nextInvoiceDate={nextInvoiceDate}
            onNextInvoiceDateChanged={onNextInvoiceDateChanged}
            readOnly={readOnly}
          />
        </BrandingProvider>
      </I18nextProvider>,
    );
    if (!expectSection) return { onNextInvoiceDateChanged, section: document.body };
    const section = (await screen.findByRole("heading", { name: "Proper rebut" })).closest("section");
    if (section === null) throw new TypeError("No next-receipt section");
    return { onNextInvoiceDateChanged, section };
  }

  async function openDrawer(section: HTMLElement) {
    fireEvent.click(within(section).getByRole("button", { name: "Edita la data del proper rebut" }));
    return screen.findByRole("dialog", { name: "Proper rebut" });
  }

  function fill(drawer: HTMLElement, date: string, reason = "Pagat fins a desembre") {
    fireEvent.change(within(drawer).getByLabelText("Data del proper rebut"), { target: { value: date } });
    fireEvent.change(within(drawer).getByLabelText("Motiu"), { target: { value: reason } });
    fireEvent.click(within(drawer).getByRole("button", { name: "Desa" }));
  }

  it("E146: «Proper rebut» reads the member's date with an edit action; a monthly member without one reads «Sense data: no es facturarà»", async () => {
    const { section } = await renderNext();
    expect(section).toHaveTextContent("Proper rebutEdita01/09/2026");
    expect(within(section).getByRole("button", { name: "Edita la data del proper rebut" })).toBeVisible();
    cleanup();

    const empty = await renderNext({ nextInvoiceDate: null });
    expect(within(empty.section).getByText("Sense data: no es facturarà")).toBeVisible();
    expect(within(empty.section).getByRole("button", { name: "Edita la data del proper rebut" })).toBeVisible();
    cleanup();

    // A pack member without a date is never billed by the run: nothing to say.
    await renderNext({ monthly: false, nextInvoiceDate: null, section: false });
    expect(await screen.findByText("2026-0912")).toBeVisible();
    expect(screen.queryByRole("heading", { name: "Proper rebut" })).toBeNull();
    cleanup();

    // An erased (read-only) record offers no change.
    const erased = await renderNext({ readOnly: true });
    expect(within(erased.section).queryByRole("button")).toBeNull();
  });

  it("E146: the drawer bounds the date to ±12 months of the club's month, PUTs {nextInvoiceDate, reason} and the block and D10 read the api's date", async () => {
    const bodies: unknown[] = [];
    server.events.on("request:start", ({ request }) => {
      if (request.method === "PUT" && request.url.endsWith("/members/member-laura/next-invoice-date")) {
        void request.clone().json().then((body: unknown) => bodies.push(body));
      }
    });
    const { onNextInvoiceDateChanged, section } = await renderNext();
    const drawer = await openDrawer(section);
    const date = within(drawer).getByLabelText("Data del proper rebut");
    expect(date).toHaveValue("2026-09-01");
    expect(date).toHaveAttribute("min", "2025-10-01");
    expect(date).toHaveAttribute("max", "2027-10-31");
    expect(within(drawer).getByLabelText("Motiu")).toBeRequired();
    fill(drawer, "2026-12-01");
    expect(within(drawer).getByRole("button", { name: "Desa" })).toBeDisabled();

    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Proper rebut" })).toBeNull();
    });
    expect(bodies).toEqual([{ nextInvoiceDate: "2026-12-01", reason: "Pagat fins a desembre" }]);
    expect(onNextInvoiceDateChanged).toHaveBeenCalledWith("2026-12-01");
    expect(section).toHaveTextContent("Proper rebutEdita01/12/2026");
  });

  it("E146: 400 VALIDATION_ERROR fieldErrors land on the date and on the reason, inside the drawer", async () => {
    server.use(
      http.put("*/api/v1/members/:id/next-invoice-date", () =>
        HttpResponse.json(
          {
            code: "VALIDATION_ERROR",
            details: {
              fieldErrors: [
                { code: "INVALID_VALUE", field: "nextInvoiceDate" },
                { code: "REQUIRED", field: "reason" },
              ],
            },
            message: "Validation failed",
            traceId: "t-next",
          },
          { status: 400 },
        ),
      ),
    );
    const { onNextInvoiceDateChanged, section } = await renderNext();
    const drawer = await openDrawer(section);
    fill(drawer, "2026-11-01");
    const dateField = within(drawer).getByLabelText("Data del proper rebut").closest(".ah-form-field");
    const reasonField = within(drawer).getByLabelText("Motiu").closest(".ah-form-field");
    if (!(dateField instanceof HTMLElement) || !(reasonField instanceof HTMLElement)) {
      throw new TypeError("No fields");
    }
    expect(
      await within(dateField).findByText("Tria una data entre el 01/10/2025 i el 31/10/2027."),
    ).toBeVisible();
    expect(within(reasonField).getByText("Revisa els camps destacats.")).toBeVisible();
    // The two fields' errors, and no general alert besides them.
    expect(within(drawer).getAllByRole("alert")).toHaveLength(2);
    expect(onNextInvoiceDateChanged).not.toHaveBeenCalled();
  });

  it("R-04-06: 409 INVALID_STATE {READMISSION_PENDING} points to D2; any other 409 INVALID_STATE reads the generic state text", async () => {
    mockScenario("adminMemberReadmissionPending");
    const first = await renderNext();
    fill(await openDrawer(first.section), "2026-11-01");
    const alert = await within(screen.getByRole("dialog", { name: "Proper rebut" })).findByRole("alert");
    await waitFor(() => {
      expect(alert).toHaveTextContent("Aquest abonat té una readmissió pendent");
    });
    expect(within(alert).getByRole("link", { name: "Preinscripcions pendents" })).toHaveAttribute(
      "href",
      "/preinscripcions/member-laura",
    );
    cleanup();
    mockScenario("admin");

    server.use(
      http.put("*/api/v1/members/:id/next-invoice-date", () =>
        HttpResponse.json(
          { code: "INVALID_STATE", details: {}, message: "Not active", traceId: "t-state" },
          { status: 409 },
        ),
      ),
    );
    const second = await renderNext();
    const drawer = await openDrawer(second.section);
    fill(drawer, "2026-11-01");
    expect(await within(drawer).findByRole("alert")).toHaveTextContent(
      "Aquest element no està en un estat vàlid per a aquesta operació.",
    );
  });
});
