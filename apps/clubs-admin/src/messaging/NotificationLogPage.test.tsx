import { type components, createApiClient } from "@agilityhub/api-client";
import { mockScenario } from "@agilityhub/api-client/mocks";
import brandingCanicFixture from "@agilityhub/api-client/mocks/branding-canic";
import { server } from "@agilityhub/api-client/mocks/server";
import { createI18n } from "@agilityhub/i18n";
import { type Branding, BrandingProvider } from "@agilityhub/ui";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
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
    // The applied filter reads the member's name, not the api's id.
    expect(document.querySelector(".ah-universal-list__filter-menu > summary")).toHaveTextContent(
      "Abonat = «Laura Serra Vidal»",
    );
    expect(screen.getByText("Abonat = «Laura Serra Vidal»")).toBeInTheDocument();
    expect(screen.queryByText(/member-laura/u)).toBeNull();
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

  it("E7-W01 round 2 #1: the default XLSX and PDF exports ask for the export's own columns (createdAt, code, recipient, channels, readAt), and the file comes", async () => {
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: () => "blob:mock-export",
    });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: () => undefined });
    const lines = requestLines();
    await renderLog();
    await waitFor(() => {
      expect(rows()).toHaveLength(12);
    });
    for (const [format, button] of [
      ["xlsx", "Excel"],
      ["pdf", "PDF"],
    ] as const) {
      fireEvent.click(screen.getByText("Excel · PDF"));
      fireEvent.click(screen.getByRole("button", { name: button }));
      await waitFor(() => {
        expect(lines.some((line) => line.includes(`format=${format}`))).toBe(true);
      });
      const exported = new URL(
        lines.find((line) => line.includes(`format=${format}`))?.split(" ")[1] ?? "",
        window.location.origin,
      );
      expect(exported.pathname).toBe("/notifications/export");
      expect(exported.searchParams.get("columns")).toBe("createdAt,code,recipient,channels,readAt");
    }
    await waitFor(() => {
      expect(screen.queryByText("El filtre no és vàlid.")).toBeNull();
    });
    expect(screen.queryByText("No s'ha pogut completar l'acció. Torna-ho a provar.")).toBeNull();
  });

  it("E7-W01 round 2 #7: the chips of a list (in) and a range (between) show their values, as the api echoes them (arrays)", async () => {
    await renderLog(
      "/notificacions?filter=memberId%3Ain%3Amember-laura%2Cmember-anna&filter=createdAt%3Abetween%3A2026-08-01%2C2026-08-31",
    );
    await waitFor(() => {
      expect(rows().length).toBeGreaterThan(0);
    });
    const chips = [...document.querySelectorAll(".ah-universal-list__active-filter > span")].map(
      (chip) => chip.textContent,
    );
    const member = chips.find((text) => text.startsWith("Abonat = «"));
    expect(member).toMatch(/^Abonat = «Laura Serra Vidal, [^»]+»$/u);
    expect(member).not.toContain("member-");
    expect(chips).toContain("Data = «01/08/2026 – 31/08/2026»");
  });

  it("E5-W05 step 0: a row whose audience the api sends as null (written before E7-T02) shows the recipient without an audience label, in the list and in the detail", async () => {
    const oldRow: components["schemas"]["NotificationDetail"] = {
      audience: null,
      body: "Text antic.",
      category: "OPERATIONAL",
      channels: [{ channel: "APP", status: "DELIVERED" }],
      code: "N-08a",
      createdAt: "2026-07-01T08:00:00Z",
      deliveries: [],
      id: "notification-old",
      locale: "ca",
      readAt: null,
      recipient: { displayName: "Pau Fictici Soler", email: null, memberId: "member-pau" },
      subject: {},
      title: "Avís antic",
    };
    server.use(
      http.get("*/api/v1/notifications", () =>
        HttpResponse.json({
          appliedFilters: [],
          items: [
            {
              audience: null,
              category: oldRow.category,
              channels: oldRow.channels,
              code: oldRow.code,
              createdAt: oldRow.createdAt,
              id: oldRow.id,
              readAt: null,
              recipient: oldRow.recipient,
            },
          ],
          page: 0,
          size: 50,
          totalItems: 1,
          totalPages: 1,
        }),
      ),
      http.get("*/api/v1/notifications/:id", () => HttpResponse.json(oldRow)),
    );
    await renderLog();
    await waitFor(() => {
      expect(rows()).toHaveLength(1);
    });
    const recipient = rows()[0]?.querySelector(".messaging-log__recipient");
    expect(recipient?.textContent).toBe("Pau Fictici Soler");
    fireEvent.click(within(rows()[0] ?? document.body).getByText("N-08a"));
    const drawer = await screen.findByRole("dialog", { name: "Avís N-08a" });
    await within(drawer).findByText("Avís antic");
    expect(drawer.textContent).toContain("Pau Fictici Soler");
    expect(drawer.textContent).not.toContain("notificationAudience");
    expect(drawer.textContent).not.toContain("Pau Fictici Soler ·");
  });

  it("masks an e-mail and a phone, never prints them whole", () => {
    expect(maskedTarget("laura@example.test")).toBe("l···a@example.test");
    expect(maskedTarget("jo@example.test")).toBe("j···@example.test");
    expect(maskedTarget("+34655100101")).toBe("··· 101");
    expect(maskedTarget("push-subscription-7f3a")).toBe("···");
    expect(maskedTarget(null)).toBeUndefined();
  });
});
