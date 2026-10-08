import { createApiClient } from "@agilityhub/api-client";
import { mockScenario, resetMemberBillingState } from "@agilityhub/api-client/mocks";
import brandingFixture from "@agilityhub/api-client/mocks/branding-canic";
import { server } from "@agilityhub/api-client/mocks/server";
import { createI18n } from "@agilityhub/i18n";
import { type Branding, BrandingProvider } from "@agilityhub/ui";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { StrictMode, type ReactNode } from "react";
import { I18nextProvider } from "react-i18next";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { AdminNavigation } from "../App";

import { InactivityLeavePage } from "./InactivityLeavePage";

const branding: Branding = { ...brandingFixture, theme: { ...brandingFixture.theme, mode: "dark" } };

beforeAll(() => { server.listen({ onUnhandledRequest: "error" }); });
afterEach(() => {
  cleanup();
  server.resetHandlers();
  resetMemberBillingState();
  mockScenario("admin");
  window.history.pushState(null, "", "/inactivitats");
});
afterAll(() => { server.close(); });

async function provider(children: ReactNode, providerBranding: Branding = branding) {
  const i18n = await createI18n({ branding: providerBranding, browserLanguages: ["ca"], initialNamespaces: ["admin-census", "enums", "errors", "shell"], storage: undefined });
  return <I18nextProvider i18n={i18n}><BrandingProvider branding={providerBranding}>{children}</BrandingProvider></I18nextProvider>;
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
    await waitFor(() => {
      expect(requests).toEqual(expect.arrayContaining([
        expect.objectContaining({ filters: ["state:in:REQUESTED,APPROVED,ACTIVE"], sort: ["fromMonth,asc"] }),
        expect.objectContaining({ filters: ["state:eq:PENDING"], sort: ["requestedAt,asc"] }),
      ]));
    });
  });

  it("sums the two lifecycle counters in the menu badge", async () => {
    render(await provider(<AdminNavigation counters={{ followUpUnread: 0, pendingInactivityRequests: 2, pendingLeaveRequests: 3, pendingRequests: 99, pendingSignups: 0 }} modules={branding.modules} pathname="/inactivitats" roles={["ADMIN"]} />));
    expect(screen.getByText("5")).toBeVisible();
  });

  it("E8-W03 round 2 #1 renders the leave-only page and makes no inactivity read when the module is off", async () => {
    const paths: string[] = [];
    server.events.on("request:start", ({ request }) => { paths.push(new URL(request.url).pathname); });
    const withoutInactivity = { ...branding, modules: branding.modules.filter((module) => module !== "INACTIVITY") };
    render(await provider(<InactivityLeavePage client={createApiClient({ baseUrl: `${window.location.origin}/api/v1` })} />, withoutInactivity));
    expect(await screen.findByRole("tab", { name: "Baixes" })).toBeVisible();
    expect(screen.queryByRole("tab", { name: "Inactivitats" })).not.toBeInTheDocument();
    await waitFor(() => { expect(paths.some((path) => path.endsWith("/leave-requests"))).toBe(true); });
    expect(paths.some((path) => path.endsWith("/inactivity-periods"))).toBe(false);
    server.events.removeAllListeners();
  });

  it("E8-W03 round 2 #3 loads real filter values and saved views", async () => {
    render(await provider(<InactivityLeavePage client={createApiClient({ baseUrl: `${window.location.origin}/api/v1` })} />));
    expect(await screen.findByText("Laura Serra Vidal")).toBeVisible();
    const value = screen.getByRole("combobox", { name: "Valor" });
    expect(await within(value).findByRole("option", { name: /Laura Serra Vidal/u })).toBeInTheDocument();
    fireEvent.click(screen.getByText("Vistes", { selector: "summary" }));
    expect(screen.getByRole("combobox", { name: "Vistes" })).toBeVisible();
    fireEvent.change(screen.getByLabelText("Nom de la vista"), { target: { value: "Pendents d'avui" } });
    const create = screen.getByRole("button", { name: "Crea la vista" });
    expect(create).toBeEnabled();
    fireEvent.click(create);
    expect(await screen.findByRole("option", { name: "Pendents d'avui" })).toBeInTheDocument();
  });

  it("E8-W03 round 3 #2 loads every declared filter from the whole queue, independently of the current page", async () => {
    render(await provider(<InactivityLeavePage client={createApiClient({ baseUrl: `${window.location.origin}/api/v1` })} />));
    expect(await screen.findByText("Laura Serra Vidal")).toBeVisible();
    fireEvent.click(screen.getByText(/^Filtra/u, { selector: "summary" }));
    const inactivityField = screen.getByRole("combobox", { name: "Camp" });
    const inactivityValue = screen.getByRole("combobox", { name: "Valor" });
    for (const field of ["memberId", "state", "fromMonth", "toMonth", "origin", "requestedAt"]) {
      fireEvent.change(inactivityField, { target: { value: field } });
      await waitFor(() => { expect(inactivityValue).toBeEnabled(); });
      expect(within(inactivityValue).getAllByRole("option").length).toBeGreaterThan(0);
    }
    fireEvent.change(inactivityField, { target: { value: "memberId" } });
    expect(await within(inactivityValue).findByRole("option", { name: /Dídac Vila Costa/u })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "Baixes" }));
    fireEvent.click(screen.getByText(/^Filtra/u, { selector: "summary" }));
    const leaveField = screen.getByRole("combobox", { name: "Camp" });
    const leaveValue = screen.getByRole("combobox", { name: "Valor" });
    for (const field of ["memberId", "state", "source", "requestedDate", "effectiveDate", "reasonKey", "nps"]) {
      fireEvent.change(leaveField, { target: { value: field } });
      await waitFor(() => { expect(leaveValue).toBeEnabled(); });
      expect(within(leaveValue).getAllByRole("option").length).toBeGreaterThan(0);
    }
    fireEvent.change(leaveField, { target: { value: "memberId" } });
    expect(await within(leaveValue).findByRole("option", { name: /Dídac Vila Costa/u })).toBeInTheDocument();
  });

  it("E8-W03 round 2 #8 resolves period to its member and navigates to that exact drawer", async () => {
    const periodId = "62000000-0000-4000-8000-000000000002";
    window.history.pushState(null, "", `/inactivitats?period=${periodId}`);
    const navigations: string[] = [];
    render(await provider(<InactivityLeavePage client={createApiClient({ baseUrl: `${window.location.origin}/api/v1` })} onNavigate={(path) => { navigations.push(path); }} />));
    await waitFor(() => {
      expect(navigations).toEqual([`/abonats/61000000-0000-4000-8000-000000000002?calaix=inactivitat&period=${periodId}`]);
    });
  });

  it("E8-W03 round 3 #8 resolves overlap navigation under StrictMode", async () => {
    const periodId = "62000000-0000-4000-8000-000000000002";
    const client = createApiClient({ baseUrl: `${window.location.origin}/api/v1` });
    window.history.pushState(null, "", `/inactivitats?period=${periodId}`);
    const navigations: string[] = [];
    render(await provider(
      <StrictMode>
        <InactivityLeavePage client={client} onNavigate={(path) => { navigations.push(path); }} />
      </StrictMode>,
    ));
    await waitFor(() => {
      expect(navigations).toEqual([`/abonats/61000000-0000-4000-8000-000000000002?calaix=inactivitat&period=${periodId}`]);
    });
  });

  it("E8-W03 round 3 #8 reports and retries a failed overlap detail read", async () => {
    const periodId = "62000000-0000-4000-8000-000000000002";
    const client = createApiClient({ baseUrl: `${window.location.origin}/api/v1` });
    const seed = await client.GET("/inactivity-periods/{id}", { params: { path: { id: periodId } } });
    if (seed.data === undefined) throw new TypeError("Missing period fixture");
    let reads = 0;
    server.use(
      http.get("*/api/v1/inactivity-periods/:id", () => {
        reads += 1;
        return reads === 1
          ? HttpResponse.json({ code: "INTERNAL_ERROR", details: {}, message: "failed", traceId: "test" }, { status: 500 })
          : HttpResponse.json(seed.data);
      }),
    );
    window.history.pushState(null, "", `/inactivitats?period=${periodId}`);
    const navigations: string[] = [];
    render(await provider(<InactivityLeavePage client={client} onNavigate={(path) => { navigations.push(path); }} />));
    expect(await screen.findByText(/^S'ha produït un error inesperat/u)).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Torna-ho a provar" }));
    await waitFor(() => {
      expect(navigations).toEqual([`/abonats/61000000-0000-4000-8000-000000000002?calaix=inactivitat&period=${periodId}`]);
    });
  });

  it("E8-W03 round 2 #9 always projects member even when its visible column is hidden", async () => {
    const fields: string[] = [];
    server.events.on("request:start", ({ request }) => {
      const url = new URL(request.url);
      if (url.pathname.endsWith("/inactivity-periods")) fields.push(url.searchParams.get("fields") ?? "");
    });
    render(await provider(<InactivityLeavePage client={createApiClient({ baseUrl: `${window.location.origin}/api/v1` })} />));
    expect(await screen.findByText("Laura Serra Vidal")).toBeVisible();
    fireEvent.click(screen.getByText("Columnes"));
    fireEvent.click(screen.getByRole("checkbox", { name: "Abonat" }));
    await waitFor(() => { expect(fields.at(-1)?.split(",")).toContain("member"); });
    server.events.removeAllListeners();
  });
});
