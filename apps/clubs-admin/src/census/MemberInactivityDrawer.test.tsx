import { createApiClient } from "@agilityhub/api-client";
import { mockScenario, resetMemberBillingState } from "@agilityhub/api-client/mocks";
import brandingFixture from "@agilityhub/api-client/mocks/branding-canic";
import { server } from "@agilityhub/api-client/mocks/server";
import { createI18n } from "@agilityhub/i18n";
import { type Branding, BrandingProvider } from "@agilityhub/ui";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { I18nextProvider } from "react-i18next";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { MemberInactivityDrawer } from "./MemberInactivityDrawer";

const branding: Branding = { ...brandingFixture, theme: { ...brandingFixture.theme, mode: "dark" } };

beforeAll(() => { server.listen({ onUnhandledRequest: "error" }); });
beforeEach(() => {
  resetMemberBillingState();
  mockScenario("admin");
});
afterEach(() => {
  cleanup();
  server.resetHandlers();
  resetMemberBillingState();
  mockScenario("admin");
});
afterAll(() => { server.close(); });

async function renderDrawer() {
  const i18n = await createI18n({
    branding,
    browserLanguages: ["ca"],
    initialNamespaces: ["admin-census", "enums", "errors"],
    storage: undefined,
  });
  render(
    <I18nextProvider i18n={i18n}>
      <BrandingProvider branding={branding}>
        <MemberInactivityDrawer
          client={createApiClient({ baseUrl: `${window.location.origin}/api/v1` })}
          memberId="member-laura"
          onChanged={() => undefined}
          onClose={() => undefined}
          open
        />
      </BrandingProvider>
    </I18nextProvider>,
  );
}

describe("T-13-31 admin inactivity lifecycle", () => {
  it("shows approve and deny only for a requested period", async () => {
    await renderDrawer();
    const drawer = await screen.findByRole("dialog", { name: "Inactivitat" });
    expect(await within(drawer).findByRole("button", { name: "Aprova" })).toBeVisible();
    expect(within(drawer).getByRole("button", { name: "Denega" })).toBeVisible();
    expect(within(drawer).queryByText("Nou període d'inactivitat")).not.toBeInTheDocument();
  });

  it("renders the day-25 override and clears the deadline error when selected", async () => {
    server.use(
      http.get("*/api/v1/inactivity-periods", () =>
        HttpResponse.json({ appliedFilters: [], items: [], page: 0, size: 20, totalItems: 0, totalPages: 0 }),
      ),
      http.post("*/api/v1/inactivity-periods", () =>
        HttpResponse.json(
          { code: "INACTIVITY_DEADLINE_PASSED", details: { earliestMonth: "2026-11" }, message: "deadline", traceId: "test" },
          { status: 422 },
        ),
      ),
    );
    await renderDrawer();
    const drawer = await screen.findByRole("dialog", { name: "Inactivitat" });
    fireEvent.change(within(drawer).getByLabelText("Mes d'inici"), { target: { value: "2026-10" } });
    fireEvent.click(within(drawer).getByRole("button", { name: "Crea i aprova" }));
    expect(await within(drawer).findByText(/primer mes possible és 2026-11/u)).toBeVisible();
    fireEvent.click(within(drawer).getByRole("checkbox", { name: "Salta el termini del dia 25" }));
    expect(within(drawer).queryByText(/primer mes possible/u)).not.toBeInTheDocument();
  });

  it("links an overlap to the existing period", async () => {
    server.use(
      http.get("*/api/v1/inactivity-periods", () =>
        HttpResponse.json({ appliedFilters: [], items: [], page: 0, size: 20, totalItems: 0, totalPages: 0 }),
      ),
      http.post("*/api/v1/inactivity-periods", () =>
        HttpResponse.json(
          { code: "INACTIVITY_OVERLAP", details: { hint: "EXTEND", periodId: "period-existing" }, message: "overlap", traceId: "test" },
          { status: 409 },
        ),
      ),
    );
    await renderDrawer();
    const drawer = await screen.findByRole("dialog", { name: "Inactivitat" });
    fireEvent.change(within(drawer).getByLabelText("Mes d'inici"), { target: { value: "2026-10" } });
    fireEvent.click(within(drawer).getByRole("button", { name: "Crea i aprova" }));
    expect(await within(drawer).findByRole("link", { name: "Obre el període existent" })).toHaveAttribute(
      "href",
      "/inactivitats?period=period-existing",
    );
  });
});
