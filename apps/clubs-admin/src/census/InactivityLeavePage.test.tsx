import { createApiClient } from "@agilityhub/api-client";
import { mockScenario, resetMemberBillingState } from "@agilityhub/api-client/mocks";
import brandingFixture from "@agilityhub/api-client/mocks/branding-canic";
import { server } from "@agilityhub/api-client/mocks/server";
import { createI18n } from "@agilityhub/i18n";
import { type Branding, BrandingProvider } from "@agilityhub/ui";
import { cleanup, render, screen } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import type { ReactNode } from "react";
import { I18nextProvider } from "react-i18next";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { AdminNavigation } from "../App";

import { InactivityLeavePage } from "./InactivityLeavePage";

const branding: Branding = { ...brandingFixture, theme: { ...brandingFixture.theme, mode: "dark" } };

beforeAll(() => { server.listen({ onUnhandledRequest: "error" }); });
afterEach(() => { cleanup(); server.resetHandlers(); resetMemberBillingState(); mockScenario("admin"); });
afterAll(() => { server.close(); });

async function provider(children: ReactNode) {
  const i18n = await createI18n({ branding, browserLanguages: ["ca"], initialNamespaces: ["admin-census", "enums", "errors", "shell"], storage: undefined });
  return <I18nextProvider i18n={i18n}><BrandingProvider branding={branding}>{children}</BrandingProvider></I18nextProvider>;
}

describe("T-13-31 inactivity and leave queues", () => {
  it("uses both tabs and the contract default filters and sorts", async () => {
    const requests: { path: string; filters: string[]; sort: string[] }[] = [];
    const empty = { appliedFilters: [], items: [], page: 0, size: 50, totalItems: 0, totalPages: 0 };
    server.use(
      http.get("*/api/v1/inactivity-periods", ({ request }) => { const url = new URL(request.url); requests.push({ path: url.pathname, filters: url.searchParams.getAll("filter"), sort: url.searchParams.getAll("sort") }); return HttpResponse.json(empty); }),
      http.get("*/api/v1/leave-requests", ({ request }) => { const url = new URL(request.url); requests.push({ path: url.pathname, filters: url.searchParams.getAll("filter"), sort: url.searchParams.getAll("sort") }); return HttpResponse.json(empty); }),
    );
    render(await provider(<InactivityLeavePage client={createApiClient({ baseUrl: `${window.location.origin}/api/v1` })} />));
    expect(await screen.findByRole("tab", { name: "Inactivitats" })).toBeVisible();
    expect(screen.getByRole("tab", { name: "Baixes" })).toBeVisible();
    expect(requests).toEqual(expect.arrayContaining([
      expect.objectContaining({ filters: ["state:in:REQUESTED,APPROVED,ACTIVE"], sort: ["fromMonth,asc"] }),
      expect.objectContaining({ filters: ["state:eq:PENDING"], sort: ["requestedAt,asc"] }),
    ]));
  });

  it("sums the two lifecycle counters in the menu badge", async () => {
    render(await provider(<AdminNavigation counters={{ followUpUnread: 0, pendingInactivityRequests: 2, pendingLeaveRequests: 3, pendingRequests: 99, pendingSignups: 0 }} modules={branding.modules} pathname="/inactivitats" roles={["ADMIN"]} />));
    expect(screen.getByText("5")).toBeVisible();
  });
});
