import { createApiClient } from "@agilityhub/api-client";
import brandingFixture from "@agilityhub/api-client/mocks/branding-canic";
import { server } from "@agilityhub/api-client/mocks/server";
import { createI18n } from "@agilityhub/i18n";
import { BrandingProvider, type Branding } from "@agilityhub/ui";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { I18nextProvider } from "react-i18next";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { TeamPage } from "./TeamPage";

const base = `${window.location.origin}/api/v1`;
const branding: Branding = {
  ...brandingFixture,
  theme: { ...brandingFixture.theme, mode: "dark" },
};
const member = (id: string, memberNumber: number | null | undefined, fullName = "Alex Serra") => ({
  id,
  memberNumber,
  fullName,
  dogs: [],
});
const instructor = {
  active: true,
  color: branding.theme.ringPalette?.[0] ?? "",
  id: "instructor-test",
  memberId: "member-second-page",
  shortName: "Alex",
  usage: { futureClassSessions: 3 },
  version: 1,
};
const page = (items: unknown[], index = 0, total = items.length) => ({
  appliedFilters: [],
  items,
  page: index,
  size: 200,
  totalItems: total,
  totalPages: Math.ceil(total / 200),
});

beforeAll(() => {
  server.listen({ onUnhandledRequest: "error" });
});
afterEach(() => {
  cleanup();
  server.resetHandlers();
});
afterAll(() => {
  server.close();
});

async function renderTeam() {
  server.use(
    http.get(`${base}/instructors`, () => HttpResponse.json({ items: [instructor] })),
    http.get(`${base}/administrators`, () => HttpResponse.json({ items: [] })),
  );
  const i18n = await createI18n({
    branding,
    browserLanguages: ["ca"],
    initialNamespaces: ["admin-catalogs", "errors"],
    storage: undefined,
  });
  render(
    <I18nextProvider i18n={i18n}>
      <BrandingProvider branding={branding}>
        <TeamPage client={createApiClient({ baseUrl: base })} />
      </BrandingProvider>
    </I18nextProvider>,
  );
}

describe("T-05-23 D17 team identities and recovery (INC-41 W3-14)", () => {
  it.each([null, undefined])(
    "shows a dash for %s member numbers and keeps indistinguishable choices unselected",
    async (number) => {
      server.use(
        http.get(`${base}/members`, () =>
          HttpResponse.json(page([member("first", number), member("second", number)])),
        ),
      );
      await renderTeam();
      fireEvent.click(await screen.findByRole("button", { name: "Nou instructor" }));
      const dialog = await screen.findByRole("dialog", { name: "Nou instructor" });
      await waitFor(() => {
        expect(dialog.querySelectorAll("datalist option")).toHaveLength(2);
      });
      const values = [...dialog.querySelectorAll<HTMLOptionElement>("datalist option")].map(
        (option) => option.value,
      );
      expect(values).toEqual(["Alex Serra · —", "Alex Serra · —"]);
      fireEvent.change(within(dialog).getByLabelText("Abonat"), { target: { value: values[0] } });
      expect(within(dialog).getByRole("button", { name: "DESA" })).toBeDisabled();
    },
  );

  it("cannot silently grant the role to the first of two homonyms", async () => {
    const bodies: Record<string, unknown>[] = [];
    server.use(
      http.get(`${base}/members`, () =>
        HttpResponse.json(page([member("first", 101), member("second", 202)])),
      ),
      http.post(`${base}/instructors`, async ({ request }) => {
        bodies.push((await request.json()) as Record<string, unknown>);
        return HttpResponse.json(instructor, { status: 201 });
      }),
    );
    await renderTeam();
    fireEvent.click(await screen.findByRole("button", { name: "Nou instructor" }));
    const dialog = await screen.findByRole("dialog", { name: "Nou instructor" });
    const input = within(dialog).getByLabelText("Abonat");
    await waitFor(() => {
      expect(dialog.querySelectorAll("datalist option")).toHaveLength(2);
    });
    fireEvent.change(input, { target: { value: "Alex Serra" } });
    fireEvent.change(within(dialog).getByLabelText("Nom curt"), { target: { value: "Alex" } });
    expect(within(dialog).getByRole("button", { name: "DESA" })).toBeDisabled();
    const options = [...dialog.querySelectorAll<HTMLOptionElement>("datalist option")];
    expect(new Set(options.map((option) => option.value)).size).toBe(2);
    const second = options.find((option) => option.value.includes("202"));
    expect(second).toBeDefined();
    fireEvent.change(input, { target: { value: second?.value } });
    fireEvent.click(within(dialog).getByRole("button", { name: "DESA" }));
    await screen.findByRole("button", { name: "Nou instructor" });
    await waitFor(() => {
      expect(bodies).toEqual([expect.objectContaining({ memberId: "second" })]);
    });
  });

  it("reads every page including LEFT members to name the existing team", async () => {
    const queries: URLSearchParams[] = [];
    server.use(
      http.get(`${base}/members`, ({ request }) => {
        const query = new URL(request.url).searchParams;
        queries.push(query);
        return HttpResponse.json(
          query.get("page") === "1"
            ? page([member("member-second-page", 201, "Former Member")], 1, 201)
            : page(
                Array.from({ length: 200 }, (_, i) => member(`first-${String(i)}`, i + 1)),
                0,
                201,
              ),
        );
      }),
    );
    await renderTeam();
    expect(await screen.findByRole("button", { name: "Edita Former Member" })).toBeVisible();
    expect(queries.some((query) => query.get("page") === "1")).toBe(true);
    expect(queries.flatMap((query) => query.getAll("filter"))).not.toContain("status:eq:ACTIVE");
  });

  it("retries the members request after its first failure", async () => {
    let reads = 0;
    server.use(
      http.get(`${base}/members`, () =>
        ++reads === 1
          ? HttpResponse.json({ code: "INTERNAL_ERROR", message: "Unavailable" }, { status: 503 })
          : HttpResponse.json(page([member("member-second-page", 201, "Recovered Member")])),
      ),
    );
    await renderTeam();
    fireEvent.click(await screen.findByRole("button", { name: "Torna-ho a provar" }));
    expect(await screen.findByRole("button", { name: "Edita Recovered Member" })).toBeVisible();
  });

  it("shows the approved future-class count when deactivation is refused", async () => {
    server.use(
      http.get(`${base}/members`, () =>
        HttpResponse.json(page([member("member-second-page", 201)])),
      ),
      http.patch(`${base}/instructors/:id`, () =>
        HttpResponse.json({ code: "INSTRUCTOR_IN_USE", message: "In use" }, { status: 409 }),
      ),
    );
    await renderTeam();
    fireEvent.click(await screen.findByRole("button", { name: "Edita Alex Serra" }));
    const dialog = await screen.findByRole("dialog", { name: "Edita l'instructor" });
    fireEvent.click(within(dialog).getByRole("switch", { name: "Activa" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "DESA" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "Té 3 classes futures assignades",
    );
  });
});
