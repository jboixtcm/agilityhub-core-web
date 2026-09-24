import { createApiClient } from "@agilityhub/api-client";
import { resetPlanningState } from "@agilityhub/api-client/mocks";
import brandingCanicFixture from "@agilityhub/api-client/mocks/branding-canic";
import { server } from "@agilityhub/api-client/mocks/server";
import { createI18n } from "@agilityhub/i18n";
import { type Branding, BrandingProvider } from "@agilityhub/ui";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { DayOfWeek } from "./shared";
import { TemplateDayPage } from "./TemplateDayPage";

const branding: Branding = {
  ...brandingCanicFixture,
  theme: { ...brandingCanicFixture.theme, mode: "dark" },
};

beforeAll(() => {
  server.listen({ onUnhandledRequest: "error" });
});
beforeEach(() => {
  window.history.replaceState(null, "", "/plantilles/template-setmana-a/dia/monday");
});
afterEach(() => {
  cleanup();
  server.resetHandlers();
  resetPlanningState();
});
afterAll(() => {
  server.close();
});

async function renderDay(dayOfWeek: DayOfWeek | undefined, templateId = "template-setmana-a") {
  const i18n = await createI18n({
    branding,
    browserLanguages: ["ca"],
    initialNamespaces: ["admin-scheduling", "enums", "errors"],
    storage: undefined,
  });
  const onNavigate = vi.fn();
  render(
    <I18nextProvider i18n={i18n}>
      <BrandingProvider branding={branding}>
        <TemplateDayPage
          client={createApiClient({ baseUrl: `${window.location.origin}/api/v1` })}
          dayOfWeek={dayOfWeek}
          onNavigate={onNavigate}
          templateId={templateId}
        />
      </BrandingProvider>
    </I18nextProvider>,
  );
  return { onNavigate };
}

function columnHeaders(table: HTMLElement): string[] {
  return within(table)
    .getAllByRole("columnheader")
    .map((header) => header.textContent);
}

describe("T-06-27 D3b day view per ring / per instructor", () => {
  it("shows only the rings used that day in catalog order, plus «Sense» when a class has no ring", async () => {
    await renderDay("MONDAY");

    const table = await screen.findByRole("table", { name: "Plantilla «Setmana A» · dilluns" });
    expect(screen.getByText("Plantilla: «Setmana A» (dl–dv)")).toBeVisible();
    expect(columnHeaders(table)).toEqual([
      "Muntanya",
      "Central",
      "Carretera",
      "Cadells",
      "Petita",
      "Sense",
    ]);
    expect(within(table).getByRole("rowheader", { name: "8:30" })).toBeInTheDocument();
    expect(
      within(table).getByRole("group", { name: "Obed. urbana · Laura · Sense pista" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Dia" })).toHaveDisplayValue("Dilluns");
  });

  it("drops unused rings and the «Sense» column on a day without them", async () => {
    await renderDay("TUESDAY");

    const table = await screen.findByRole("table", { name: "Plantilla «Setmana A» · dimarts" });
    expect(columnHeaders(table)).toEqual(["Muntanya", "Central", "Petita"]);
  });

  it("switches to one column per instructor with a class that day", async () => {
    await renderDay("TUESDAY");

    await screen.findByRole("table", { name: "Plantilla «Setmana A» · dimarts" });
    fireEvent.click(screen.getByRole("button", { name: "Visió per instructor" }));

    const table = screen.getByRole("table", { name: "Plantilla «Setmana A» · dimarts" });
    expect(screen.getByRole("button", { name: "Visió per instructor" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(columnHeaders(table)).toEqual(["Laura", "Marc", "Anna"]);
    expect(window.location.search).toBe("?vista=instructor");
  });

  it("moves between days and goes back to the weekly view of the same template", async () => {
    const { onNavigate } = await renderDay("TUESDAY");

    await screen.findByRole("table", { name: "Plantilla «Setmana A» · dimarts" });
    fireEvent.click(screen.getByRole("button", { name: "Dia següent" }));
    expect(onNavigate).toHaveBeenLastCalledWith("/plantilles/template-setmana-a/dia/wednesday");
    fireEvent.click(screen.getByRole("button", { name: "Dia anterior" }));
    expect(onNavigate).toHaveBeenLastCalledWith("/plantilles/template-setmana-a/dia/monday");
    fireEvent.click(screen.getByRole("button", { name: "Tornar a la visió setmanal" }));
    expect(onNavigate).toHaveBeenLastCalledWith("/plantilles?template=template-setmana-a");
  });

  it.each([
    ["an unsupported day", "sunday", "SUNDAY" as const],
    ["an unknown day", "someday", undefined],
  ])("rewrites %s in the URL to the template's first day", async (_case, segment, dayOfWeek) => {
    window.history.replaceState(
      null,
      "",
      `/plantilles/template-setmana-a/dia/${segment}?vista=instructor`,
    );
    await renderDay(dayOfWeek, "template-setmana-a");

    await screen.findByRole("table", { name: "Plantilla «Setmana A» · dilluns" });
    // The rewrite is a passive effect: on a loaded host it runs after the table is committed.
    await waitFor(() => {
      expect(window.location.pathname).toBe("/plantilles/template-setmana-a/dia/monday");
    });
    expect(window.location.search).toBe("?vista=instructor");
  });

  it("shows the Saturday template with its single day", async () => {
    await renderDay("SATURDAY", "template-dissabtes");

    await screen.findByRole("table", { name: "Plantilla «Dissabtes» · dissabte" });
    expect(screen.getByText("Plantilla: «Dissabtes» (dissabtes)")).toBeVisible();
    expect(screen.getByRole("button", { name: "Dia anterior" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Dia següent" })).toBeDisabled();
  });
});
