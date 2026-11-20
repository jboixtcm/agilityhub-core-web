import { createApiClient } from "@agilityhub/api-client";
import { mockScenario, resetCompetitionMockState } from "@agilityhub/api-client/mocks";
import branding from "@agilityhub/api-client/mocks/branding-canic";
import { server } from "@agilityhub/api-client/mocks/server";
import { createI18n } from "@agilityhub/i18n";
import { BrandingProvider, type Branding } from "@agilityhub/ui";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { I18nextProvider } from "react-i18next";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import CompetitionImportsPage from "./CompetitionImportsPage";

const testBranding: Branding = { ...branding, theme: { ...branding.theme, mode: "dark" } };

beforeAll(() => {
  server.listen({ onUnhandledRequest: "error" });
});
beforeEach(() => {
  mockScenario("competitionAdmin");
  resetCompetitionMockState();
});
afterEach(() => {
  cleanup();
  server.resetHandlers();
});
afterAll(() => {
  server.close();
});
async function show(expectEmpty = true) {
  const i18n = await createI18n({
    branding: testBranding,
    browserLanguages: ["ca"],
    initialNamespaces: ["statistics", "errors"],
    storage: undefined,
  });
  const client = createApiClient({ baseUrl: `${window.location.origin}/api/v1` });
  render(
    <I18nextProvider i18n={i18n}>
      <BrandingProvider branding={testBranding}>
        <CompetitionImportsPage client={client} />
      </BrandingProvider>
    </I18nextProvider>,
  );
  if (expectEmpty) await screen.findByText("Encara no s’ha importat cap resultat.");
  fireEvent.change(await screen.findByLabelText("Enllaç de la classificació o prova"), {
    target: { value: "https://app.fcagility.cat/federated/classification/division/128" },
  });
}
describe("Competition imports", () => {
  it("groups sources by the club date and loads their details on demand", async () => {
    server.use(
      http.get("*/api/v1/competition-imports", () =>
        HttpResponse.json(
          Array.from({ length: 26 }, (_, i) => ({
            id: String(i),
            source: "FLOW_AGILITY",
            sourceUrl: `https://flowagility.com/zone/prints/run/${String(i)}`,
            season: "2026",
            importedAt: "2026-11-18T23:30:00Z",
            importedRows: 2,
            revision: 1,
          })),
        ),
      ),
    );
    await show(false);
    const day = await screen.findByRole("button", {
      name: /19.*11.*2026.*26 fonts.*52 resultats/u,
    });
    expect(screen.queryAllByRole("link")).toHaveLength(0);
    fireEvent.click(day);
    expect(screen.getAllByRole("link")).toHaveLength(25);
    fireEvent.click(screen.getByRole("button", { name: "Mostra més fonts" }));
    expect(screen.getAllByRole("link")).toHaveLength(26);
  });
  it("T-STATS-33 refuses source text whose JSON envelope exceeds the public gateway limit", async () => {
    let requests = 0;
    server.use(
      http.post("*/api/v1/competition-imports/preview", () => {
        requests += 1;
        return HttpResponse.error();
      }),
    );
    await show();
    fireEvent.change(screen.getByLabelText("Contingut del fitxer"), {
      target: { value: '"'.repeat(1_000_000) },
    });
    fireEvent.click(screen.getByRole("button", { name: "Previsualitza" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("El contingut és massa gran");
    expect(requests).toBe(0);
  });
  it("T-STATS-18 previews without writing results and confirms only selected rows after review", async () => {
    const bodies: unknown[] = [];
    server.events.on("request:start", ({ request }) => {
      if (request.url.endsWith("/confirm"))
        void request
          .clone()
          .json()
          .then((body) => bodies.push(body));
    });
    await show();
    fireEvent.click(screen.getByRole("button", { name: "Previsualitza" }));
    await screen.findByRole("heading", { name: "Revisa les coincidències" });
    const confirm = screen.getByRole("button", { name: "Confirma la importació" });
    expect(confirm).toBeDisabled();
    expect(bodies).toHaveLength(0);
    fireEvent.click(screen.getByLabelText("Mostra també resultats sense coincidència"));
    expect(screen.getByLabelText("Assigna Núvol, llicència 9999")).toHaveValue("");
    fireEvent.click(screen.getByLabelText(/He revisat la selecció/u));
    fireEvent.click(confirm);
    await waitFor(() => {
      expect(screen.getAllByText("1 resultat importat").length).toBeGreaterThan(0);
    });
    expect(bodies).toEqual([{ assignments: { "fcag-1": "dog-duna" } }]);
    expect(
      screen.queryByRole("heading", { name: "Revisa les coincidències" }),
    ).not.toBeInTheDocument();
  });
  it("T-STATS-19 reuses the same key when retrying an unanswered preview", async () => {
    const keys: (string | null)[] = [];
    server.use(
      http.post("*/api/v1/competition-imports/preview", ({ request }) => {
        keys.push(request.headers.get("Idempotency-Key"));
        return HttpResponse.error();
      }),
    );
    await show();
    fireEvent.click(screen.getByRole("button", { name: "Previsualitza" }));
    await screen.findByRole("alert");
    fireEvent.click(screen.getByRole("button", { name: "Previsualitza" }));
    await waitFor(() => {
      expect(keys).toHaveLength(2);
    });
    expect(keys[0]).not.toBeNull();
    expect(keys[1]).toBe(keys[0]);
  });
  it("T-STATS-20 explains expired provider authentication and preserves existing history", async () => {
    server.use(
      http.post("*/api/v1/competition-imports/preview", () =>
        HttpResponse.json(
          {
            code: "VALIDATION_ERROR",
            message: "Invalid",
            details: { reason: "SOURCE_AUTH_REQUIRED" },
            traceId: "mock",
          },
          { status: 400 },
        ),
      ),
    );
    await show();
    fireEvent.click(screen.getByRole("button", { name: "Previsualitza" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Cal configurar o renovar la sessió de FlowAgility del club.",
    );
    expect(
      screen.queryByRole("button", { name: "Confirma la importació" }),
    ).not.toBeInTheDocument();
  });
});
