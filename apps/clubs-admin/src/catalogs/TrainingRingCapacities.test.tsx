import { createApiClient } from "@agilityhub/api-client";
import brandingFixture from "@agilityhub/api-client/mocks/branding-canic";
import { server } from "@agilityhub/api-client/mocks/server";
import { createI18n } from "@agilityhub/i18n";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { I18nextProvider } from "react-i18next";
import { afterAll, afterEach, beforeAll, expect, it } from "vitest";

import { TrainingRingCapacities } from "./TrainingRingCapacities";

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
it("saves a ring limit and clears it to inherit the general capacity", async () => {
  const requests: unknown[] = [];
  let capacity: number | null = 2;
  server.use(
    http.get("*/api/v1/rings", () =>
      HttpResponse.json({
        items: [
          {
            id: "ring-qa",
            name: "Training ring",
            allowsFreeTraining: true,
            trainingCapacity: capacity,
            version: requests.length,
          },
        ],
      }),
    ),
    http.patch("*/api/v1/rings/:id", async ({ request }) => {
      const body = (await request.json()) as { trainingCapacity: number | null };
      requests.push(body);
      capacity = body.trainingCapacity;
      return HttpResponse.json({ id: "ring-qa" });
    }),
  );
  const i18n = await createI18n({
    branding: brandingFixture,
    browserLanguages: ["ca"],
    initialNamespaces: ["admin-settings", "errors"],
    storage: undefined,
  });
  render(
    <I18nextProvider i18n={i18n}>
      <TrainingRingCapacities
        client={createApiClient({ baseUrl: `${window.location.origin}/api/v1` })}
      />
    </I18nextProvider>,
  );
  fireEvent.click(screen.getByText("Excepcions per pista"));
  fireEvent.change(await screen.findByLabelText("Training ring"), { target: { value: "3" } });
  fireEvent.click(screen.getByRole("button", { name: "Desa Training ring" }));
  await screen.findByText("Capacitat desada.");
  await waitFor(() => {
    expect(screen.getByLabelText("Training ring")).toHaveValue(3);
  });
  fireEvent.change(screen.getByLabelText("Training ring"), { target: { value: "" } });
  fireEvent.click(screen.getByRole("button", { name: "Desa Training ring" }));
  await waitFor(() => {
    expect(requests).toEqual([
      { version: 0, trainingCapacity: 3 },
      { version: 1, trainingCapacity: null },
    ]);
  });
});
