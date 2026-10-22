import { createApiClient } from "@agilityhub/api-client";
import { mockScenario, resetMemberBillingState } from "@agilityhub/api-client/mocks";
import brandingFixture from "@agilityhub/api-client/mocks/branding-canic";
import { server } from "@agilityhub/api-client/mocks/server";
import { createI18n } from "@agilityhub/i18n";
import { type Branding, BrandingProvider } from "@agilityhub/ui";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { I18nextProvider } from "react-i18next";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { MemberNextInvoice } from "./MemberNextInvoice";

const branding: Branding = {
  ...brandingFixture,
  locales: ["ca", "es", "en"],
  theme: { ...brandingFixture.theme, mode: "dark" },
};

beforeAll(() => {
  server.listen({ onUnhandledRequest: "error" });
});
// Club-local 05/10/2026: the window is 01/10/2025 … 31/10/2027.
beforeEach(() => {
  vi.useFakeTimers({
    now: new Date("2026-10-05T10:00:00Z"),
    shouldAdvanceTime: true,
    toFake: ["Date"],
  });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  server.events.removeAllListeners();
  server.resetHandlers();
  resetMemberBillingState();
  mockScenario("admin");
  window.history.replaceState(null, "", "/");
});
afterAll(() => {
  server.close();
});

const NEXT_INVOICE = { amount: { amountMinor: 9000, currency: "EUR" }, date: "2026-09-01" };

async function renderNext({
  drawerRequested = false,
  monthly = true,
  nextInvoice = NEXT_INVOICE,
  nextInvoiceDate = "2026-09-01",
  onChanged = vi.fn(),
  readOnly = false,
}: {
  drawerRequested?: boolean;
  /** `"pending"`: the plan is still being read (`monthly` undefined). */
  monthly?: boolean | "pending";
  /** `null`: the overview has no next receipt. */
  nextInvoice?: typeof NEXT_INVOICE | null;
  nextInvoiceDate?: string | null;
  onChanged?: (date: string) => void;
  readOnly?: boolean;
} = {}) {
  const i18n = await createI18n({
    branding,
    browserLanguages: ["ca"],
    initialNamespaces: ["admin-census", "enums", "errors"],
    storage: undefined,
  });
  const view = (props: { monthly: boolean | undefined }) => (
    <I18nextProvider i18n={i18n}>
      <BrandingProvider branding={branding}>
        <dl>
          <MemberNextInvoice
            client={createApiClient({ baseUrl: `${window.location.origin}/api/v1` })}
            drawerRequested={drawerRequested}
            memberId="member-laura"
            monthly={props.monthly}
            nextInvoice={nextInvoice ?? undefined}
            nextInvoiceDate={nextInvoiceDate}
            onChanged={onChanged}
            readOnly={readOnly}
            row={(label, content) => (
              <div data-testid="next-row">
                <dt>{label}</dt>
                <dd>{content}</dd>
              </div>
            )}
          />
        </dl>
        {/* Drawn with the rest once the namespaces are read (the tree suspends as a whole). */}
        <span data-testid="drawn" />
      </BrandingProvider>
    </I18nextProvider>
  );
  const rendered = render(view({ monthly: monthly === "pending" ? undefined : monthly }));
  await screen.findByTestId("drawn");
  return {
    onChanged,
    rerender: (next: boolean | undefined) => {
      rendered.rerender(view({ monthly: next }));
    },
  };
}

const row = () => screen.getByTestId("next-row");

async function openDrawer() {
  fireEvent.click(within(row()).getByRole("button", { name: "Edita la data del proper rebut" }));
  return screen.findByRole("dialog", { name: "Proper rebut" });
}

function fill(drawer: HTMLElement, date: string, reason = "Pagat fins a desembre") {
  fireEvent.change(within(drawer).getByLabelText("Data del proper rebut"), {
    target: { value: date },
  });
  fireEvent.change(within(drawer).getByLabelText("Motiu"), { target: { value: reason } });
  fireEvent.click(within(drawer).getByRole("button", { name: "Desa" }));
}

describe("E11-W07 step 2 · E11-W08 E164 (c)/(d) (E146, S12 §6 PUT /members/{id}/next-invoice-date): D10's «Proper rebut» row", () => {
  it("E146 (mockup D10): the row reads «01/09/2026 · 90,00 €» with its edit action; a monthly member without a date reads «Sense data: no es facturarà»", async () => {
    await renderNext();
    expect(row()).toHaveTextContent(/^Proper rebut01\/09\/2026 · 90,00\s€\sEdita$/u);
    expect(
      within(row()).getByRole("button", { name: "Edita la data del proper rebut" }),
    ).toBeVisible();
    cleanup();

    await renderNext({ nextInvoice: null, nextInvoiceDate: null });
    expect(within(row()).getByText("Sense data: no es facturarà")).toBeVisible();
    expect(
      within(row()).getByRole("button", { name: "Edita la data del proper rebut" }),
    ).toBeVisible();
    cleanup();

    // A pack member without a date is never billed by the run: nothing to say.
    await renderNext({ monthly: false, nextInvoice: null, nextInvoiceDate: null });
    expect(screen.queryByTestId("next-row")).toBeNull();
    cleanup();

    // An erased (read-only) record offers no change.
    await renderNext({ readOnly: true });
    expect(within(row()).queryByRole("button")).toBeNull();
  });

  it("E146: the drawer bounds the date to ±12 months of the club's month, PUTs {nextInvoiceDate, reason}, and the row reads the api's date", async () => {
    const bodies: unknown[] = [];
    server.events.on("request:start", ({ request }) => {
      if (
        request.method === "PUT" &&
        request.url.endsWith("/members/member-laura/next-invoice-date")
      ) {
        void request
          .clone()
          .json()
          .then((body: unknown) => bodies.push(body));
      }
    });
    const { onChanged } = await renderNext();
    const drawer = await openDrawer();
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
    expect(onChanged).toHaveBeenCalledWith("2026-12-01");
    // The old amount belonged to the old date: until D10 reads the overview again, the date alone.
    expect(row()).toHaveTextContent(/^Proper rebut01\/12\/2026\sEdita$/u);
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
    const { onChanged } = await renderNext();
    const drawer = await openDrawer();
    fill(drawer, "2026-11-01");
    const dateField = within(drawer)
      .getByLabelText("Data del proper rebut")
      .closest(".ah-form-field");
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
    expect(onChanged).not.toHaveBeenCalled();
  });

  it("R-04-06: 409 INVALID_STATE {READMISSION_PENDING} points to D2; any other 409 INVALID_STATE reads the generic state text", async () => {
    mockScenario("adminMemberReadmissionPending");
    await renderNext();
    fill(await openDrawer(), "2026-11-01");
    const alert = await within(screen.getByRole("dialog", { name: "Proper rebut" })).findByRole(
      "alert",
    );
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
    await renderNext();
    const drawer = await openDrawer();
    fill(drawer, "2026-11-01");
    expect(await within(drawer).findByRole("alert")).toHaveTextContent(
      "Aquest element no està en un estat vàlid per a aquesta operació.",
    );
  });

  it("E164 (d): D6's request waits for the plan: it opens once a member without a date turns out monthly, never for a pack member", async () => {
    window.history.replaceState(null, "", "/abonats/member-laura?calaix=proper-rebut");
    const pending = await renderNext({
      drawerRequested: true,
      monthly: "pending",
      nextInvoice: null,
      nextInvoiceDate: null,
    });
    expect(screen.queryByRole("dialog", { name: "Proper rebut" })).toBeNull();
    pending.rerender(true);
    const drawer = await screen.findByRole("dialog", { name: "Proper rebut" });
    expect(within(drawer).getByLabelText("Data del proper rebut")).toHaveValue("");
    fireEvent.click(within(drawer).getByRole("button", { name: "Cancel·la" }));
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Proper rebut" })).toBeNull();
    });
    expect(window.location.search).toBe("");
    cleanup();

    window.history.replaceState(null, "", "/abonats/member-laura?calaix=proper-rebut");
    await renderNext({
      drawerRequested: true,
      monthly: false,
      nextInvoice: null,
      nextInvoiceDate: null,
    });
    expect(screen.queryByRole("dialog", { name: "Proper rebut" })).toBeNull();
  });
});
