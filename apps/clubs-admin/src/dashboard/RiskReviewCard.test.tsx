import { createApiClient } from "@agilityhub/api-client";
import { JOBS_MOCK_NOW, mockScenario } from "@agilityhub/api-client/mocks";
import brandingFixture from "@agilityhub/api-client/mocks/branding-canic";
import { server } from "@agilityhub/api-client/mocks/server";
import { createI18n } from "@agilityhub/i18n";
import { type Branding, BrandingProvider } from "@agilityhub/ui";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { I18nextProvider } from "react-i18next";
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from "vitest";

import { ClassNoticesCard, ClassNoticesPage } from "./ClassNoticesPage";

beforeAll(() => {
  server.listen({ onUnhandledRequest: "error" });
});
beforeEach(() => {
  mockScenario("admin");
  vi.useFakeTimers({ now: new Date(JOBS_MOCK_NOW), shouldAdvanceTime: true, toFake: ["Date"] });
});
afterEach(() => {
  cleanup();
  server.resetHandlers();
  vi.useRealTimers();
});
afterAll(() => {
  server.close();
});
async function mount(history = false, language = "ca") {
  const branding: Branding = {
    ...brandingFixture,
    theme: { ...brandingFixture.theme, mode: "dark" },
    locales: ["ca", "es", "en"],
  };
  const i18n = await createI18n({
    branding,
    browserLanguages: [language],
    initialNamespaces: ["admin-dashboard", "errors"],
    storage: undefined,
  });
  const client = createApiClient({ baseUrl: `${window.location.origin}/api/v1` });
  const navigate = vi.fn();
  render(
    <I18nextProvider i18n={i18n}>
      <BrandingProvider branding={branding}>
        {history ? (
          <ClassNoticesPage client={client} onNavigate={navigate} />
        ) : (
          <ClassNoticesCard client={client} onNavigate={navigate} />
        )}
      </BrandingProvider>
    </I18nextProvider>,
  );
  return navigate;
}
it("T-11-26 counts only today's sent notices and keeps access to the complete history", async () => {
  const requests: URL[] = [];
  server.events.on("request:start", ({ request }) => {
    if (request.url.includes("/class-notices")) requests.push(new URL(request.url));
  });
  const navigate = await mount();
  expect(await screen.findByText("4 avisos d’avui")).toBeVisible();
  expect(document.querySelectorAll(".class-notices__row")).toHaveLength(4);
  expect(requests[0]?.searchParams.get("today")).toBe("true");
  expect(requests[0]?.searchParams.get("size")).toBe("6");
  fireEvent.click(screen.getByRole("link", { name: "Veure més" }));
  expect(navigate).toHaveBeenCalledWith("/avisos-classes");
  server.events.removeAllListeners("request:start");
});
it("T-11-26 pages through older notices in descending order", async () => {
  await mount(true);
  expect(await screen.findByText("Pàgina 1 de 2")).toBeVisible();
  expect(document.querySelectorAll(".class-notices__row")).toHaveLength(20);
  expect(screen.getByRole("button", { name: "Anterior" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Següent" }));
  expect(await screen.findByText("Pàgina 2 de 2")).toBeVisible();
  expect(document.querySelectorAll(".class-notices__row")).toHaveLength(9);
  expect(screen.getByRole("button", { name: "Següent" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Anterior" }));
  expect(await screen.findByText("Pàgina 1 de 2")).toBeVisible();
});
it("keeps the history link when today has no notices", async () => {
  mockScenario("riskReviewEmpty");
  await mount();
  expect(await screen.findByText("Avui no s’ha enviat cap avís de classes.")).toBeVisible();
  expect(screen.getByRole("link", { name: "Veure més" })).toBeVisible();
});
it.each([
  ["es", "4 avisos de hoy"],
  ["en", "4 notices today"],
])("localizes notices in %s", async (language, label) => {
  await mount(false, language);
  expect(await screen.findByText(label)).toBeVisible();
});
it("shows a recoverable read failure without claiming there are no notices", async () => {
  server.use(http.get("*/api/v1/class-notices", () => HttpResponse.error()));
  await mount();
  expect(await screen.findByRole("alert")).toBeVisible();
  expect(screen.queryByText("Avui no s’ha enviat cap avís de classes.")).not.toBeInTheDocument();
  server.resetHandlers();
  fireEvent.click(screen.getByRole("button", { name: "Torna-ho a provar" }));
  expect(await screen.findByText("4 avisos d’avui")).toBeVisible();
});
