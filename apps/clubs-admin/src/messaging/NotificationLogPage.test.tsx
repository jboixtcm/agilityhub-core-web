import { createApiClient } from "@agilityhub/api-client";
import { mockScenario } from "@agilityhub/api-client/mocks";
import brandingCanicFixture from "@agilityhub/api-client/mocks/branding-canic";
import { server } from "@agilityhub/api-client/mocks/server";
import { createI18n } from "@agilityhub/i18n";
import { type Branding, BrandingProvider } from "@agilityhub/ui";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { maskedTarget, NotificationLogPage } from "./NotificationLogPage";

const canic: Branding = {
  ...brandingCanicFixture,
  theme: { ...brandingCanicFixture.theme, mode: "dark" },
};

function requestLines(): string[] {
  const lines: string[] = [];
  server.events.on("request:start", ({ request }) => {
    const url = new URL(request.url);
    lines.push(`${request.method} ${url.pathname.replace(/^\/api\/v1/u, "")}${url.search}`);
  });
  return lines;
}

async function renderLog(path = "/notificacions") {
  mockScenario("admin");
  window.history.replaceState(null, "", path);
  const i18n = await createI18n({
    branding: canic,
    browserLanguages: ["ca"],
    initialNamespaces: ["admin-messaging", "census", "enums", "errors"],
    storage: undefined,
  });
  render(
    <I18nextProvider i18n={i18n}>
      <BrandingProvider branding={canic}>
        <NotificationLogPage
          client={createApiClient({ baseUrl: `${window.location.origin}/api/v1` })}
        />
      </BrandingProvider>
    </I18nextProvider>,
  );
  await screen.findByRole("heading", { level: 1, name: "Avisos enviats" });
}

const rows = () =>
  within(screen.getByRole("table", { name: "Avisos enviats pel club" }))
    .getAllByRole("row")
    .slice(1);

beforeAll(() => {
  server.listen({ onUnhandledRequest: "error" });
});
afterEach(() => {
  cleanup();
  server.events.removeAllListeners();
  server.resetHandlers();
  localStorage.clear();
  mockScenario("admin");
});
afterAll(() => {
  server.close();
});

describe("E7-W01 step 7 «Avisos enviats» (S11 §2, R-11-10)", () => {
  it("lists the club's notifications newest first: date, code, category, recipient, one chip per delivery with its status, read", async () => {
    await renderLog();
    await waitFor(() => {
      expect(rows()).toHaveLength(12);
    });
    expect(
      within(screen.getByRole("table", { name: "Avisos enviats pel club" }))
        .getAllByRole("columnheader")
        .map((cell) => cell.textContent),
    ).toEqual(["Data↓", "Codi", "Categoria", "Destinatari", "Canals", "Llegida", ""]);
    const first = rows()[0];
    expect(first).toHaveTextContent("N-08a");
    expect(first).toHaveTextContent("Canvis en reserves");
    expect(first).toHaveTextContent("Laura Serra Vidal");
    expect(first).toHaveTextContent("App · lliurat");
    expect(first).toHaveTextContent("Correu · lliurat");
    expect(first).toHaveTextContent("SMS · enviat");
    expect(first).toHaveTextContent("10/08/2026 17:58");
    const applicant = rows().find((row) => row.textContent.includes("Clara Font"));
    expect(applicant).toHaveTextContent("Sol·licitant");
  });

  it("?filter=memberId:eq:… (D10's link) reads only that member's notifications, and a row opens its detail with every delivery and the destinations masked", async () => {
    const lines = requestLines();
    await renderLog("/notificacions?filter=memberId%3Aeq%3Amember-laura");
    await waitFor(() => {
      expect(rows()).toHaveLength(4);
    });
    expect(rows().every((row) => row.textContent.includes("Laura Serra Vidal"))).toBe(true);
    expect(
      lines.some(
        (line) =>
          line.startsWith("GET /notifications?") &&
          line.includes("filter=memberId%3Aeq%3Amember-laura"),
      ),
    ).toBe(true);
    fireEvent.click(within(rows()[0] ?? document.body).getByText("N-08a"));
    const drawer = await screen.findByRole("dialog", { name: "Avís N-08a" });
    expect(await within(drawer).findByText("Classe anul·lada pel club")).toBeVisible();
    const deliveries = within(within(drawer).getByRole("table", { name: "Entregues" }))
      .getAllByRole("row")
      .slice(1)
      .map((row) => [...row.querySelectorAll("td")].map((cell) => cell.textContent).join(" | "));
    expect(deliveries).toEqual([
      "App | — | lliurat | 1 | — | —",
      "Correu | l···a@example.test | lliurat | 1 | prov-n-08a-email | —",
      "SMS | ··· 101 | enviat | 1 | prov-n-08a-sms | —",
    ]);
    expect(drawer.textContent).not.toContain("laura@example.test");
    expect(drawer.textContent).not.toContain("655100101");
  });

  it("masks an e-mail and a phone, never prints them whole", () => {
    expect(maskedTarget("laura@example.test")).toBe("l···a@example.test");
    expect(maskedTarget("jo@example.test")).toBe("j···@example.test");
    expect(maskedTarget("+34655100101")).toBe("··· 101");
    expect(maskedTarget("push-subscription-7f3a")).toBe("···");
    expect(maskedTarget(null)).toBeUndefined();
  });
});
