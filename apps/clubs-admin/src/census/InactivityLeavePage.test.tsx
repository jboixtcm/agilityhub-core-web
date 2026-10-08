import { createApiClient, type components } from "@agilityhub/api-client";
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

async function provider(children: ReactNode, providerBranding: Branding = branding, language = "ca") {
  const i18n = await createI18n({ branding: providerBranding, browserLanguages: [language], initialNamespaces: ["admin-census", "enums", "errors", "shell"], storage: undefined });
  return <I18nextProvider i18n={i18n}><BrandingProvider branding={providerBranding}>{children}</BrandingProvider></I18nextProvider>;
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  headers.set("Content-Type", "application/json");
  const response = await fetch(`${window.location.origin}/api/v1${path}`, {
    ...init,
    headers,
  });
  expect(response.ok, `${init?.method ?? "GET"} ${path}`).toBe(true);
  return response.json() as Promise<T>;
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

  it("E8-W03 round 4 #1 encodes month/date/NPS ranges and a valueless exists filter", async () => {
    const requests: string[] = [];
    const listener = ({ request }: { request: Request }) => {
      const url = new URL(request.url);
      if (url.pathname.endsWith("/inactivity-periods") || url.pathname.endsWith("/leave-requests")) {
        requests.push(...url.searchParams.getAll("filter"));
      }
    };
    server.events.on("request:start", listener);
    try {
      render(await provider(<InactivityLeavePage client={createApiClient({ baseUrl: `${window.location.origin}/api/v1` })} />));
      expect(await screen.findByText("Laura Serra Vidal")).toBeVisible();

      let filterMenu = screen.getByText(/^Filtra/u, { selector: "summary" }).closest("details");
      if (filterMenu === null) throw new TypeError("Missing inactivity filter menu");
      fireEvent.click(within(filterMenu).getByText(/^Filtra/u, { selector: "summary" }));
      fireEvent.change(within(filterMenu).getByRole("combobox", { name: "Camp" }), {
        target: { value: "fromMonth" },
      });
      fireEvent.change(within(filterMenu).getByRole("combobox", { name: "Operador" }), {
        target: { value: "between" },
      });
      const monthInputs = [...filterMenu.querySelectorAll<HTMLInputElement>('input[type="month"]')];
      expect(monthInputs).toHaveLength(2);
      const monthStart = monthInputs[0];
      const monthEnd = monthInputs[1];
      if (monthStart === undefined || monthEnd === undefined) throw new TypeError("Missing month range inputs");
      fireEvent.change(monthStart, { target: { value: "2026-08" } });
      fireEvent.change(monthEnd, { target: { value: "2026-10" } });
      fireEvent.click(within(filterMenu).getByRole("button", { name: "Afegeix el filtre" }));
      await waitFor(() => { expect(requests).toContain("fromMonth:between:2026-08,2026-10"); });
      expect(await screen.findByText("Eva Perez Prunell")).toBeVisible();

      fireEvent.change(within(filterMenu).getByRole("combobox", { name: "Camp" }), {
        target: { value: "toMonth" },
      });
      fireEvent.change(within(filterMenu).getByRole("combobox", { name: "Operador" }), {
        target: { value: "exists" },
      });
      expect(within(filterMenu).queryByRole("combobox", { name: "Valor" })).toBeNull();
      fireEvent.click(within(filterMenu).getByRole("button", { name: "Afegeix el filtre" }));
      await waitFor(() => { expect(requests).toContain("toMonth:exists:"); });
      expect(await screen.findByText("Laura Serra Vidal")).toBeVisible();

      fireEvent.click(screen.getByRole("tab", { name: "Baixes" }));
      filterMenu = screen.getByText(/^Filtra/u, { selector: "summary" }).closest("details");
      if (filterMenu === null) throw new TypeError("Missing leave filter menu");
      fireEvent.click(within(filterMenu).getByText(/^Filtra/u, { selector: "summary" }));
      fireEvent.change(within(filterMenu).getByRole("combobox", { name: "Camp" }), {
        target: { value: "nps" },
      });
      fireEvent.change(within(filterMenu).getByRole("combobox", { name: "Operador" }), {
        target: { value: "between" },
      });
      const npsInputs = [...filterMenu.querySelectorAll<HTMLInputElement>('input[type="number"]')];
      expect(npsInputs).toHaveLength(2);
      const npsStart = npsInputs[0];
      const npsEnd = npsInputs[1];
      if (npsStart === undefined || npsEnd === undefined) throw new TypeError("Missing NPS range inputs");
      fireEvent.change(npsStart, { target: { value: "2" } });
      fireEvent.change(npsEnd, { target: { value: "10" } });
      fireEvent.click(within(filterMenu).getByRole("button", { name: "Afegeix el filtre" }));
      await waitFor(() => { expect(requests).toContain("nps:between:2,10"); });
      expect(await screen.findByText("Montse Tresserra Casas")).toBeVisible();
    } finally {
      server.events.removeListener("request:start", listener);
    }
  });

  it("E8-W03 round 4 #8 follows totalPages when loading whole-queue filter values", async () => {
    const client = createApiClient({ baseUrl: `${window.location.origin}/api/v1` });
    const seed = await client.GET("/inactivity-periods", {
      params: { query: { fields: "member,fromMonth,toMonth,state,origin,requestedAt", page: 0, size: 1000, sort: ["fromMonth,asc"] } },
    });
    const first = seed.data?.items[0];
    const last = seed.data?.items.at(-1);
    if (first === undefined || last === undefined) throw new TypeError("Missing inactivity queue fixtures");
    server.use(http.get("*/api/v1/inactivity-periods", ({ request }) => {
      const url = new URL(request.url);
      const filtered = url.searchParams.has("filter");
      const page = Number(url.searchParams.get("page") ?? 0);
      const items = filtered ? [first] : page === 0 ? [first] : [last];
      return HttpResponse.json({
        appliedFilters: filtered ? [{ field: "state", op: "in", value: "REQUESTED,APPROVED,ACTIVE" }] : [],
        items,
        page,
        size: Number(url.searchParams.get("size") ?? 50),
        totalItems: filtered ? 1 : 2,
        totalPages: filtered ? 1 : 2,
      });
    }));

    render(await provider(<InactivityLeavePage client={client} />));
    expect(await screen.findByText(first.member?.fullName ?? "Laura Serra Vidal")).toBeVisible();
    const filterMenu = screen.getByText(/^Filtra/u, { selector: "summary" }).closest("details");
    if (filterMenu === null) throw new TypeError("Missing inactivity filter menu");
    fireEvent.click(within(filterMenu).getByText(/^Filtra/u, { selector: "summary" }));
    const value = within(filterMenu).getByRole("combobox", { name: "Valor" });
    expect(await within(value).findByRole("option", { name: new RegExp(last.member?.fullName ?? "Dídac Vila Costa", "u") })).toBeInTheDocument();
  });

  it.each([
    ["ca", /sol·licitat, aprovat, actiu/u],
    ["es", /solicitado, aprobado, activo/u],
    ["en", /requested, approved, active/u],
  ])("E8-W03 round 4 #9 localizes applied enum values in %s", async (language, expected) => {
    const trilingual = { ...branding, locales: ["ca", "es", "en"] };
    render(await provider(<InactivityLeavePage client={createApiClient({ baseUrl: `${window.location.origin}/api/v1` })} />, trilingual, language));
    expect((await screen.findAllByText(expected, { exact: false }))[0]).toBeVisible();
    expect(screen.queryByText(/REQUESTED,APPROVED,ACTIVE/u, { exact: false })).toBeNull();
  });

  it("E8-W03 round 4 #9 uses the localized field and month in applied-filter chips", async () => {
    server.use(http.get("*/api/v1/inactivity-periods", ({ request }) => {
      const url = new URL(request.url);
      return HttpResponse.json({
        appliedFilters: [{ field: "fromMonth", op: "eq", value: "2026-10" }],
        items: [],
        page: Number(url.searchParams.get("page") ?? 0),
        size: Number(url.searchParams.get("size") ?? 50),
        totalItems: 0,
        totalPages: 0,
      });
    }));
    render(await provider(<InactivityLeavePage client={createApiClient({ baseUrl: `${window.location.origin}/api/v1` })} />));
    expect((await screen.findAllByText(/Des de = «.*octubre.*2026.*»/iu, { exact: false }))[0]).toBeVisible();
    expect(screen.queryByText(/fromMonth/u, { exact: false })).toBeNull();
  });

  it("E8-W03 round 4 #3/#5/#6 keeps lifecycle detail, D10 and D5 projections consistent", async () => {
    const joanOverview = await requestJson<components["schemas"]["MemberOverview"]>("/members/member-joan/overview");
    expect(joanOverview.member.displayStatus).toMatchObject({ date: "2026-12-12", kind: "LEAVE_SCHEDULED" });
    const planned = await requestJson<components["schemas"]["ListPageMemberListItem"]>("/members?page=0&size=50&filter=displayStatus:eq:LEAVE_SCHEDULED&sort=leaveDate,asc&fields=fullName,displayStatus,leaveDate,leaveSource");
    expect(planned.items.map((item) => item.fullName)).toContain("Joan Antoni Serra");
    expect(planned.items.map((item) => item.fullName)).not.toContain("Montse Tresserra Casas");

    const periodId = "62000000-0000-4000-8000-000000000002";
    const november = await requestJson<components["schemas"]["InactivityPeriod"]>(`/inactivity-periods/${periodId}`, {
      body: JSON.stringify({ toMonth: "2026-11", version: 1 }),
      method: "PATCH",
    });
    expect(november.history).toHaveLength(1);
    expect(november.history[0]).toMatchObject({ source: "ADMIN", toMonth: "2026-11" });
    let evaOverview = await requestJson<components["schemas"]["MemberOverview"]>("/members/member-eva/overview");
    expect(evaOverview.member.displayStatus).toMatchObject({ date: "2026-11-30", kind: "INACTIVE_PERIOD" });
    let evaList = await requestJson<components["schemas"]["ListPageMemberListItem"]>("/members?page=0&size=50&filter=id:eq:member-eva&fields=fullName,displayStatus,inactivityUntil");
    expect(evaList.items[0]).toMatchObject({ inactivityUntil: "2026-11-30" });

    const february = await requestJson<components["schemas"]["InactivityPeriod"]>(`/inactivity-periods/${periodId}`, {
      body: JSON.stringify({ toMonth: "2027-02", version: 2 }),
      method: "PATCH",
    });
    expect(february.history).toHaveLength(2);
    evaOverview = await requestJson<components["schemas"]["MemberOverview"]>("/members/member-eva/overview");
    expect(evaOverview.member.displayStatus).toMatchObject({ date: "2027-02-28", kind: "INACTIVE_PERIOD" });

    await requestJson<components["schemas"]["InactivityPeriod"]>(`/inactivity-periods/${periodId}/termination`, {
      body: JSON.stringify({ toMonth: "2026-11" }),
      method: "POST",
    });
    evaOverview = await requestJson<components["schemas"]["MemberOverview"]>("/members/member-eva/overview");
    expect(evaOverview.member.displayStatus).toMatchObject({ date: "2026-11-30", kind: "INACTIVE_PERIOD" });

    const created = await requestJson<components["schemas"]["InactivityPeriod"]>("/inactivity-periods", {
      body: JSON.stringify({ fromMonth: "2026-10", memberId: "member-marc", toMonth: "2026-10" }),
      method: "POST",
    });
    expect(created.state).toBe("ACTIVE");
    const marcOverview = await requestJson<components["schemas"]["MemberOverview"]>("/members/member-marc/overview");
    expect(marcOverview.member.displayStatus).toMatchObject({ date: "2026-10-31", kind: "INACTIVE_PERIOD" });
    evaList = await requestJson<components["schemas"]["ListPageMemberListItem"]>("/members?page=0&size=50&filter=id:eq:member-marc&fields=fullName,displayStatus,inactivityUntil");
    expect(evaList.items[0]).toMatchObject({ inactivityUntil: "2026-10-31" });
  });

  it("E8-W03 round 4 #4 applies inactivityNoCancelBookings to the approval mutation", async () => {
    mockScenario("inactivityNoCancelBookings");
    resetMemberBillingState();
    const period = await requestJson<components["schemas"]["InactivityPeriod"]>("/inactivity-periods/62000000-0000-4000-8000-000000000001/decision", {
      body: JSON.stringify({ decision: "APPROVED" }),
      method: "POST",
    });
    expect(period.bookingsInside).toBe(2);
    expect(period.cancelledBookings).toEqual([]);
  });

  it("E8-W03 round 4 #7 compares NPS numerically and applies queue sorting before pagination", async () => {
    const leaveRows = await requestJson<components["schemas"]["LeaveRequestPage"]>("/leave-requests?page=0&size=50&filter=nps:lt:10&sort=requestedDate,asc&fields=member,nps,requestedDate");
    expect(leaveRows.items).toEqual(expect.arrayContaining([expect.objectContaining({ nps: 8 })]));

    const periods = await requestJson<components["schemas"]["InactivityPeriodPage"]>("/inactivity-periods?page=0&size=50&sort=fromMonth,asc&fields=member,fromMonth");
    const months = periods.items
      .map((item) => item.fromMonth)
      .filter((month): month is string => month !== undefined);
    expect(months).toEqual([...months].sort((left, right) => left.localeCompare(right)));
    expect(months[0]).toBe("2026-08");
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
