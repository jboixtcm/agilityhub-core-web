import { createApiClient } from "@agilityhub/api-client";
import { mockScenario } from "@agilityhub/api-client/mocks";
import brandingFixture from "@agilityhub/api-client/mocks/branding-canic";
import { server } from "@agilityhub/api-client/mocks/server";
import { createI18n } from "@agilityhub/i18n";
import { type Branding, BrandingProvider } from "@agilityhub/ui";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { I18nextProvider } from "react-i18next";
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from "vitest";

import { StudentsPage } from "./StudentsPage";

const branding: Branding = {
  ...brandingFixture,
  theme: { ...brandingFixture.theme, mode: "dark" },
};

beforeAll(() => {
  server.listen({ onUnhandledRequest: "error" });
});
beforeEach(() => {
  mockScenario("instructor");
});
afterEach(() => {
  cleanup();
  server.resetHandlers();
  server.events.removeAllListeners();
  localStorage.removeItem("agilityhub.students.view");
  mockScenario("admin");
});
afterAll(() => {
  server.close();
});

async function openStudents() {
  const i18n = await createI18n({
    branding,
    browserLanguages: ["ca"],
    initialNamespaces: ["instructor", "errors"],
    storage: undefined,
  });
  render(
    <I18nextProvider i18n={i18n}>
      <BrandingProvider branding={branding}>
        <StudentsPage
          client={createApiClient({ baseUrl: `${window.location.origin}/api/v1` })}
          onNavigate={vi.fn()}
        />
      </BrandingProvider>
    </I18nextProvider>,
  );
  await screen.findByRole("button", { name: "Mostra'n més" });
}

it("combines level, status, search and sort on page zero; resetting filters keeps the chosen view", async () => {
  const requests: URL[] = [];
  server.events.on("request:start", ({ request }) => {
    const url = new URL(request.url);
    if (url.pathname.endsWith("/dogs")) requests.push(url);
  });
  await openStudents();
  fireEvent.click(screen.getByRole("button", { name: "Mostra'n més" }));
  await waitFor(() => {
    expect(requests.at(-1)?.searchParams.get("page")).toBe("1");
  });
  await screen.findByRole("option", { name: "Nivell C" });
  fireEvent.change(screen.getByRole("combobox", { name: "Nivell" }), {
    target: { value: "level-c" },
  });
  await waitFor(() => {
    expect(requests.at(-1)?.searchParams.getAll("filter")).toEqual([
      "status:eq:ACTIVE",
      "levelId:eq:level-c",
    ]);
    expect(requests.at(-1)?.searchParams.get("page")).toBe("0");
  });
  fireEvent.change(screen.getByRole("combobox", { name: "Estat" }), {
    target: { value: "INACTIVE" },
  });
  await waitFor(() => {
    expect(requests.at(-1)?.searchParams.getAll("filter")).toContain("status:eq:INACTIVE");
  });
  fireEvent.change(screen.getByRole("combobox", { name: "Estat" }), {
    target: { value: "ALL" },
  });
  fireEvent.change(screen.getByRole("combobox", { name: "Ordena per" }), {
    target: { value: "ownerLastName,asc" },
  });
  fireEvent.change(screen.getByPlaceholderText("Cerca un alumne"), { target: { value: "Duna" } });
  await waitFor(() => {
    const query = requests.at(-1)?.searchParams;
    expect(query?.getAll("filter")).toEqual(["levelId:eq:level-c"]);
    expect(query?.getAll("sort")).toEqual(["ownerLastName,asc", "name,asc"]);
    expect(query?.get("q")).toBe("Duna");
    expect(query?.get("page")).toBe("0");
  });
  await screen.findByRole("link", { name: "Laura + Duna · C" });
  fireEvent.click(screen.getByRole("button", { name: "Vista de llista" }));
  fireEvent.click(screen.getByRole("button", { name: "Restableix els filtres" }));
  await waitFor(() => {
    expect(requests.at(-1)?.searchParams.getAll("filter")).toEqual(["status:eq:ACTIVE"]);
    expect(requests.at(-1)?.searchParams.has("q")).toBe(false);
  });
  expect(screen.getByRole("combobox", { name: "Nivell" })).toHaveValue("");
  expect(screen.getByRole("combobox", { name: "Estat" })).toHaveValue("ACTIVE");
  expect(screen.getByRole("button", { name: "Vista de llista" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});

it("keeps student search available when the club disables levels", async () => {
  server.use(
    http.get("*/api/v1/dogs/filter-values", () =>
      HttpResponse.json(
        { code: "INVALID_FILTER", message: "Levels disabled", traceId: "test" },
        { status: 400 },
      ),
    ),
  );
  await openStudents();
  await waitFor(() => {
    expect(screen.queryByRole("combobox", { name: "Nivell" })).toBeNull();
  });
  expect(screen.getByRole("combobox", { name: "Estat" })).toHaveValue("ACTIVE");
  expect(screen.queryByText("No s’han pogut carregar els nivells.")).toBeNull();
});

it("offers a retry when level options fail without losing student results", async () => {
  server.use(
    http.get(
      "*/api/v1/dogs/filter-values",
      () =>
        HttpResponse.json(
          { code: "SERVICE_UNAVAILABLE", message: "Temporary failure", traceId: "test" },
          { status: 503 },
        ),
      { once: true },
    ),
  );
  await openStudents();
  expect(await screen.findByText("No s’han pogut carregar els nivells.")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Torna-ho a provar" }));
  expect(await screen.findByRole("option", { name: "Nivell C" })).toBeVisible();
  expect(screen.queryByText("No s’han pogut carregar els nivells.")).toBeNull();
});
