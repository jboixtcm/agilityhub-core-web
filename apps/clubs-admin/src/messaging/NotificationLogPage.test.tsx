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

async function renderLog(path = "/notificacions", locale: "ca" | "en" | "es" = "ca") {
  mockScenario("admin");
  window.history.replaceState(null, "", path);
  // COMM-07's es and en cases: a club that offers the three languages.
  const branding: Branding = locale === "ca" ? canic : { ...canic, locales: ["ca", "es", "en"] };
  const i18n = await createI18n({
    branding,
    browserLanguages: [locale],
    initialNamespaces: ["admin-messaging", "census", "enums", "errors"],
    storage: undefined,
  });
  render(
    <I18nextProvider i18n={i18n}>
      <BrandingProvider branding={branding}>
        <NotificationLogPage
          client={createApiClient({ baseUrl: `${window.location.origin}/api/v1` })}
        />
      </BrandingProvider>
    </I18nextProvider>,
  );
  await screen.findByRole("heading", {
    level: 1,
    name: { ca: "Avisos enviats", en: "Sent notifications", es: "Avisos enviados" }[locale],
  });
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
  it("shows the member name when the selected member has no notifications", async () => {
    server.use(
      http.get("*/api/v1/members/member-empty", () =>
        HttpResponse.json({ id: "member-empty", fullName: "Alex Example" }),
      ),
      http.get("*/api/v1/notifications", () =>
        HttpResponse.json({
          items: [],
          page: 0,
          size: 50,
          totalPages: 0,
          totalItems: 0,
          appliedFilters: [{ field: "memberId", op: "eq", value: "member-empty" }],
        }),
      ),
    );
    await renderLog("/notificacions?filter=memberId:eq:member-empty");
    await screen.findByText("Cap avís");
    await waitFor(() =>
      expect(document.querySelector(".ah-universal-list__filter-menu > summary")).toHaveTextContent(
        "Alex Example",
      ),
    );
    expect(
      document.querySelector(".ah-universal-list__filter-menu > summary"),
    ).not.toHaveTextContent("member-empty");
  });

  it("keeps recipient search and code filters in the same server query", async () => {
    const lines = requestLines();
    server.use(
      http.get("*/api/v1/notifications", () =>
        HttpResponse.json({
          items: [
            {
              id: "reset-example",
              code: "N-25",
              title: "",
              createdAt: "2026-11-01T03:03:00Z",
              recipient: { displayName: "", email: "example@example.test" },
              channels: [{ channel: "EMAIL", status: "SENT", temporaryFailure: true }],
            },
          ],
          page: 0,
          size: 50,
          totalPages: 1,
          totalItems: 1,
          appliedFilters: [],
        }),
      ),
    );
    await renderLog("/notificacions?q=example%40example.test&filter=code:eq:N-25");
    await screen.findByText("Accés i recuperació de contrasenya");
    expect(screen.getByRole("searchbox")).toHaveValue("example@example.test");
    expect(rows()[0]).toHaveTextContent("e···e@example.test");
    expect(rows()[0]).toHaveTextContent("Correu · incidència temporal");
    expect(rows()[0]).not.toHaveTextContent("lliurat");
    expect(
      lines.some(
        (line) =>
          line.startsWith("GET /notifications?") &&
          line.includes("q=example%40example.test") &&
          line.includes("code%3Aeq%3AN-25"),
      ),
    ).toBe(true);
  });

  it("lists the club's notifications newest first: date, code, category, recipient, one chip per delivery with its status, read", async () => {
    await renderLog();
    await waitFor(() => {
      expect(rows()).toHaveLength(12);
    });
    // E11-W02 step 5 (axe empty-table-header): the row chevron's cell is not a column header.
    expect(
      within(screen.getByRole("table", { name: "Avisos enviats pel club" }))
        .getAllByRole("columnheader")
        .map((cell) => cell.textContent),
    ).toEqual(["Data↓", "Codi", "Categoria", "Destinatari", "Canals", "Llegida"]);
    const first = rows()[0];
    expect(first).toHaveTextContent("N-08a");
    expect(first).toHaveTextContent("Canvis en reserves");
    expect(first).toHaveTextContent("Laura Serra Vidal");
    expect(first).toHaveTextContent("App · lliurat");
    expect(first).toHaveTextContent("Correu · lliurat");
    expect(first).toHaveTextContent("SMS · enviat");
    expect(first).toHaveTextContent("10/08/2026 17:58");
    // E7-W03: the row and each chip carry the api's values (the real-core spec selects by them).
    expect(first?.dataset.code).toBe("N-08a");
    expect(first?.dataset.notificationId).toBe("notification-1");
    expect(first?.dataset.memberId).toBe("member-laura");
    expect(
      [...(first?.querySelectorAll<HTMLElement>("[data-delivery-status]") ?? [])].map(
        (chip) => `${chip.dataset.channel ?? ""}:${chip.dataset.deliveryStatus ?? ""}`,
      ),
    ).toEqual(["APP:DELIVERED", "EMAIL:DELIVERED", "SMS:SENT"]);
    const applicant = rows().find((row) => row.textContent.includes("Clara Font"));
    expect(applicant).toHaveTextContent("Sol·licitant");
    // An applicant has no member: the row carries no `data-member-id` at all.
    expect(applicant).not.toHaveAttribute("data-member-id");
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
    expect(
      [...drawer.querySelectorAll<HTMLElement>("[data-delivery-status]")].map(
        (chip) => `${chip.dataset.channel ?? ""}:${chip.dataset.deliveryStatus ?? ""}`,
      ),
    ).toEqual(["APP:DELIVERED", "EMAIL:DELIVERED", "SMS:SENT"]);
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
    const activeChips = () =>
      [...document.querySelectorAll(".ah-universal-list__active-filter > span")].map(
        (chip) => chip.textContent,
      );
    // On a loaded runner the chips' labels may land a render after the rows (E7-W04, turbo `11`).
    await waitFor(() => {
      expect(activeChips().some((text) => text.startsWith("Abonat = «"))).toBe(true);
    });
    const chips = activeChips();
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

  it.each(["SENT", "DELIVERED"] as const)(
    "shows %s accurately and keeps a temporary incident in the detail history",
    async (status) => {
      server.use(
        http.get("*/api/v1/notifications/reset-history", () =>
          HttpResponse.json({
            id: "reset-history",
            code: "N-25",
            title: "",
            body: "",
            locale: "ca",
            category: "SYSTEM",
            createdAt: "2026-11-01T03:03:00Z",
            recipient: { displayName: "", email: "alex@example.test" },
            channels: [],
            deliveries: [
              {
                channel: "EMAIL",
                status,
                target: "alex@example.test",
                attempts: 1,
                sentAt: "2026-11-01T03:03:01Z",
                deliveredAt: status === "DELIVERED" ? "2026-11-01T03:04:00Z" : null,
                temporaryFailureAt: "2026-11-01T03:03:02Z",
                temporaryFailureReason: "SENDING_IP_BLOCKED_SPAMCOP",
              },
            ],
          }),
        ),
      );
      await renderLog("/notificacions?avis=reset-history");
      const drawer = await screen.findByRole("dialog", { name: "Avís N-25" });
      await within(drawer).findByText("Accés i recuperació de contrasenya");
      expect(drawer).toHaveTextContent("IP d’enviament bloquejada per SpamCop");
      expect(drawer).toHaveTextContent("a···x@example.test");
      expect(drawer).not.toHaveTextContent("alex@example.test");
      expect(drawer.querySelector("[data-delivery-status]")).toHaveTextContent(
        status === "SENT" ? "incidència temporal" : "lliurat",
      );
      expect(drawer).toHaveTextContent("01/11/2026 04:03");
    },
  );

  it("masks an e-mail and a phone, never prints them whole", () => {
    expect(maskedTarget("laura@example.test")).toBe("l···a@example.test");
    expect(maskedTarget("jo@example.test")).toBe("j···@example.test");
    expect(maskedTarget("+34655100101")).toBe("··· 101");
    expect(maskedTarget("push-subscription-7f3a")).toBe("···");
    expect(maskedTarget(null)).toBeUndefined();
  });
});

describe("COMM-07 (decision of 13 Nov 2026): «Reenvia els fallits» of an announcement", () => {
  type Detail = components["schemas"]["NotificationDetail"];
  type ListItem = components["schemas"]["NotificationListItem"];
  const BATCH = "batch-test-comm07";

  /** One announcement notice whose e-mail ended FAILED, and one failed notice of another code. */
  function announcementWorld(answer: () => Response) {
    let emailStatus: "FAILED" | "QUEUED" = "FAILED";
    const sent: { body: string; key: string | null; path: string }[] = [];
    const detail = (id: string): Detail => ({
      audience: "MEMBER",
      body: "Text del comunicat.",
      category: "CLUB_NEWS",
      channels: [],
      code: id === "notice-announcement" ? "N-24" : "N-09",
      createdAt: "2026-11-10T09:00:00Z",
      deliveries: [
        {
          attempts: emailStatus === "FAILED" ? 5 : 0,
          channel: "EMAIL",
          deliveredAt: null,
          failedAt: emailStatus === "FAILED" ? "2026-11-10T10:21:00Z" : null,
          lastError: "Brevo HTTP 402 not_enough_credits",
          nextAttemptAt: null,
          providerRef: null,
          sentAt: null,
          status: id === "notice-announcement" ? emailStatus : "FAILED",
          target: "laura@example.test",
        },
      ],
      eventType: id === "notice-announcement" ? "AnnouncementSent" : "MemberPaymentMethodChanged",
      id,
      locale: "ca",
      readAt: null,
      recipient: { displayName: "Laura Serra Vidal", email: null, memberId: "member-laura" },
      smsBody: null,
      subject: { memberId: "member-laura" },
      templateId: "tpl-n-24",
      templateVersion: 1,
      title: id === "notice-announcement" ? "Comunicat del club" : "Mètode de pagament canviat",
    });
    const row = (id: string, batchId: string | null): ListItem => ({
      audience: "MEMBER",
      batchId,
      category: "CLUB_NEWS",
      channels: [{ channel: "EMAIL", status: "FAILED" }],
      code: id === "notice-announcement" ? "N-24" : "N-09",
      createdAt: "2026-11-10T09:00:00Z",
      id,
      readAt: null,
      recipient: { displayName: "Laura Serra Vidal", email: null, memberId: "member-laura" },
      title: id === "notice-announcement" ? "Comunicat del club" : "Mètode de pagament canviat",
    });
    server.use(
      http.get("*/api/v1/notifications", () =>
        HttpResponse.json({
          appliedFilters: [],
          items: [row("notice-announcement", BATCH), row("notice-other", null)],
          page: 0,
          size: 50,
          totalItems: 2,
          totalPages: 1,
        }),
      ),
      http.get("*/api/v1/notifications/:id", ({ params }) =>
        HttpResponse.json(detail(String(params.id))),
      ),
      http.post("*/api/v1/announcements/:batchId/resend-failed", async ({ params, request }) => {
        sent.push({
          body: await request.text(),
          key: request.headers.get("Idempotency-Key"),
          path: `/announcements/${String(params.batchId)}/resend-failed`,
        });
        const response = answer();
        if (response.status === 202) emailStatus = "QUEUED";
        return response;
      }),
    );
    return sent;
  }

  async function openNotice(code: string) {
    await waitFor(() => {
      expect(rows()).toHaveLength(2);
    });
    const row = rows().find((item) => item.textContent.includes(code));
    if (row === undefined) throw new Error(`No ${code} row`);
    fireEvent.click(within(row).getByText(code));
    return screen.findByRole("dialog", { name: `Avís ${code}` });
  }

  it("a notice of an announcement whose e-mail failed offers it; the confirmation sends the batch's request with a key and says how many", async () => {
    const lines = requestLines();
    const sent = announcementWorld(() =>
      HttpResponse.json({ batchId: BATCH, resent: 2 }, { status: 202 }),
    );
    await renderLog();
    const drawer = await openNotice("N-24");
    expect(
      await within(drawer).findByText(
        "Aquest avís és d'un comunicat i el correu no ha arribat. Pots tornar a enviar tots els correus del comunicat que han fallat.",
      ),
    ).toBeVisible();
    fireEvent.click(within(drawer).getByRole("button", { name: "Reenvia els fallits" }));
    const confirm = screen.getByRole("dialog", {
      name: "Reenvia els correus fallits del comunicat",
    });
    expect(confirm).toHaveTextContent(
      "Es tornaran a enviar ara tots els correus d'aquest comunicat que han fallat, al ritme del proveïdor. Els correus que ja van arribar, els SMS i els avisos push no es tornen a enviar.",
    );
    expect(sent).toHaveLength(0);
    const before = lines.filter((line) => line.startsWith("GET /notifications?")).length;
    fireEvent.click(within(confirm).getByRole("button", { name: "Reenvia els fallits" }));
    expect(
      await within(drawer).findByText(
        "2 correus tornen a la cua: sortiran al ritme del proveïdor.",
      ),
    ).toBeVisible();
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ body: "", path: `/announcements/${BATCH}/resend-failed` });
    expect(sent[0]?.key).toMatch(/^[0-9a-f-]{36}$/u);
    // The list's request asks for every row's batch, and the list and the notice are read again.
    expect(lines.find((line) => line.startsWith("GET /notifications?"))).toContain("batchId");
    await waitFor(() => {
      expect(lines.filter((line) => line.startsWith("GET /notifications?")).length).toBeGreaterThan(
        before,
      );
    });
    // The e-mail is queued now: the action is gone, the outcome stays.
    await waitFor(() => {
      expect(within(drawer).queryByRole("button", { name: "Reenvia els fallits" })).toBeNull();
    });
    expect(within(drawer).getByRole("status")).toHaveTextContent("2 correus tornen a la cua");
  });

  it("is not offered on a failed e-mail outside any announcement, nor on an announcement notice whose e-mail did not fail", async () => {
    announcementWorld(() => HttpResponse.json({ batchId: BATCH, resent: 0 }, { status: 202 }));
    await renderLog();
    const drawer = await openNotice("N-09");
    await within(drawer).findByText("Mètode de pagament canviat");
    expect(within(drawer).queryByRole("button", { name: "Reenvia els fallits" })).toBeNull();
    cleanup();
    server.resetHandlers();
    // Wait for the notification itself; the loading placeholder is also a table row.
    // The mock's announcement (N-24, batch of 9 August): its e-mail was skipped by preference.
    await renderLog();
    await waitFor(() => {
      expect(rows().some((item) => item.textContent.includes("N-24"))).toBe(true);
    });
    const row = rows().find((item) => item.textContent.includes("N-24"));
    if (row === undefined) throw new Error("No N-24 row");
    fireEvent.click(within(row).getByText("N-24"));
    const seeded = await screen.findByRole("dialog", { name: "Avís N-24" });
    await within(seeded).findByText("Comunicat del club");
    expect(within(seeded).queryByRole("button", { name: "Reenvia els fallits" })).toBeNull();
  });

  it("nothing to resend, an unknown announcement and Cancel", async () => {
    let answer = () => HttpResponse.json({ batchId: BATCH, resent: 0 }, { status: 202 });
    const sent = announcementWorld(() => answer());
    await renderLog();
    const drawer = await openNotice("N-24");
    fireEvent.click(await within(drawer).findByRole("button", { name: "Reenvia els fallits" }));
    let confirm = screen.getByRole("dialog", { name: "Reenvia els correus fallits del comunicat" });
    fireEvent.click(within(confirm).getByRole("button", { name: "Cancel·la" }));
    expect(sent).toHaveLength(0);
    answer = () =>
      HttpResponse.json(
        { code: "NOT_FOUND", details: {}, message: "NOT_FOUND", traceId: "comm-07" },
        { status: 404 },
      );
    fireEvent.click(within(drawer).getByRole("button", { name: "Reenvia els fallits" }));
    confirm = screen.getByRole("dialog", { name: "Reenvia els correus fallits del comunicat" });
    fireEvent.click(within(confirm).getByRole("button", { name: "Reenvia els fallits" }));
    expect(await within(confirm).findByRole("alert")).toHaveTextContent(
      "Aquest comunicat ja no existeix.",
    );
    answer = () => HttpResponse.json({ batchId: BATCH, resent: 0 }, { status: 202 });
    fireEvent.click(within(confirm).getByRole("button", { name: "Reenvia els fallits" }));
    expect(
      await within(drawer).findByText("No hi ha cap correu fallit per reenviar."),
    ).toBeVisible();
    // A new press after an answer is a new request: its own key.
    expect(sent).toHaveLength(2);
    expect(sent[1]?.key).not.toBe(sent[0]?.key);
  });

  it("speaks es and en", async () => {
    /** Opens the N-24 row of the list, whatever the language. */
    async function openAnnouncement() {
      await waitFor(() => {
        expect(screen.getAllByRole("row").some((row) => row.textContent.includes("N-24"))).toBe(
          true,
        );
      });
      const row = screen.getAllByRole("row").find((item) => item.textContent.includes("N-24"));
      if (row === undefined) throw new Error("No N-24 row");
      fireEvent.click(within(row).getByText("N-24"));
      return screen.findByRole("dialog", { name: /N-24/u });
    }
    announcementWorld(() => HttpResponse.json({ batchId: BATCH, resent: 1 }, { status: 202 }));
    await renderLog("/notificacions", "es");
    let drawer = await openAnnouncement();
    fireEvent.click(await within(drawer).findByRole("button", { name: "Reenviar los fallidos" }));
    let confirm = screen.getByRole("dialog", {
      name: "Reenviar los correos fallidos del comunicado",
    });
    fireEvent.click(within(confirm).getByRole("button", { name: "Reenviar los fallidos" }));
    expect(
      await within(drawer).findByText("1 correo vuelve a la cola: saldrá al ritmo del proveedor."),
    ).toBeVisible();
    cleanup();
    announcementWorld(() => HttpResponse.json({ batchId: BATCH, resent: 3 }, { status: 202 }));
    await renderLog("/notificacions", "en");
    drawer = await openAnnouncement();
    fireEvent.click(await within(drawer).findByRole("button", { name: "Resend failed" }));
    confirm = screen.getByRole("dialog", { name: "Resend the announcement's failed e-mails" });
    fireEvent.click(within(confirm).getByRole("button", { name: "Resend failed" }));
    expect(
      await within(drawer).findByText(
        "3 e-mails are back in the queue: they will go out at the provider's pace.",
      ),
    ).toBeVisible();
  });
});
