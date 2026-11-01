import type { components } from "@agilityhub/api-client";
import { server } from "@agilityhub/api-client/mocks/server";
import { createClubsI18n } from "@agilityhub/i18n/clubs";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { I18nextProvider } from "react-i18next";
import { describe, expect, it, vi } from "vitest";

import { apiClient, canic, renderPage, setupBookingWorld } from "../booking/test-utils";

import { needsAttention, NotificationAttention, readAttention } from "./NotificationAttention";
import { publishUnreadCount } from "./unread";

type Notice = components["schemas"]["MeNotification"];
const cancellation: Notice = {
  id: "notice-cancelled",
  code: "N-08a",
  title: "La classe de demà s'ha cancel·lat",
  body: "Revisa les alternatives disponibles",
  category: "CLUB_CHANGES",
  channels: ["APP"],
  color: "WARNING",
  icon: "cal",
  createdAt: "2026-08-02T16:00:00Z",
};
const routine: Notice = {
  ...cancellation,
  id: "routine",
  code: "N-01",
  category: "OPERATIONAL",
};
const offer: Notice = {
  ...cancellation,
  code: "N-15",
  category: "PERSONAL",
  action: { type: "CLAIM_SEAT", enabled: true, params: {} },
};

setupBookingWorld();

describe("important unread notification attention", () => {
  it("keeps the shell usable while the notification namespace is still loading", async () => {
    const i18n = await createClubsI18n({
      branding: canic,
      browserLanguages: ["ca"],
      initialNamespaces: ["shell"],
      storage: undefined,
    });
    expect(i18n.hasResourceBundle("ca", "notifications")).toBe(false);
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const loadNamespaces = i18n.loadNamespaces.bind(i18n);
    vi.spyOn(i18n, "loadNamespaces").mockImplementation((namespaces, callback) =>
      gate.then(() => loadNamespaces(namespaces, callback)),
    );
    render(
      <I18nextProvider i18n={i18n}>
        <button type="button">Inici</button>
        <NotificationAttention active client={apiClient()} />
      </I18nextProvider>,
    );
    expect(screen.getByRole("button", { name: "Inici" })).toBeVisible();
    expect(screen.queryByRole("status")).toBeNull();
    act(() => {
      release();
    });
    expect(
      await screen.findByRole("status", { name: "Tens avisos importants pendents" }),
    ).toBeVisible();
  });

  it("shows cancellations without an external delivery, and only actionable waitlist offers", () => {
    expect(needsAttention(cancellation)).toBe(true);
    expect(needsAttention(routine)).toBe(false);
    expect(needsAttention({ ...cancellation, readAt: "2026-08-02T17:00:00Z" })).toBe(false);
    expect(needsAttention(offer)).toBe(true);
    expect(
      needsAttention({ ...offer, action: { type: "CLAIM_SEAT", params: {}, enabled: false } }),
    ).toBe(false);
    expect(needsAttention({ ...offer, action: null })).toBe(false);
  });

  it("finds an important notice beyond the first page of routine notices using GET only", async () => {
    const pages: number[] = [];
    server.use(
      http.get("*/me/notifications", ({ request }) => {
        const page = Number(new URL(request.url).searchParams.get("page"));
        pages.push(page);
        return HttpResponse.json({
          page,
          size: 100,
          totalItems: 101,
          unreadCount: 101,
          items:
            page === 0
              ? Array.from({ length: 100 }, (_, i) => ({ ...routine, id: String(i) }))
              : [cancellation],
        });
      }),
    );
    expect(await readAttention(apiClient(), new AbortController().signal)).toEqual(cancellation);
    expect(pages).toEqual([0, 1]);
  });

  it("stops when there are no unread notices and never starts an aborted request", async () => {
    let calls = 0;
    server.use(
      http.get("*/me/notifications", () => {
        calls++;
        return HttpResponse.json({
          page: 0,
          size: 100,
          totalItems: 200,
          unreadCount: 0,
          items: [],
        });
      }),
    );
    expect(await readAttention(apiClient(), new AbortController().signal)).toBeUndefined();
    const aborted = new AbortController();
    aborted.abort();
    expect(await readAttention(apiClient(), aborted.signal)).toBeUndefined();
    expect(calls).toBe(1);
  });

  it("keeps notices unread, refreshes on focus, and disappears after reading them", async () => {
    let current: Notice | undefined = cancellation;
    let reads = 0;
    server.use(
      http.get("*/me/notifications", () =>
        HttpResponse.json({
          page: 0,
          size: 100,
          totalItems: current ? 1 : 0,
          unreadCount: current ? 1 : 0,
          items: current ? [current] : [],
        }),
      ),
      http.post("*/me/notifications/read-all", () => {
        reads++;
        return HttpResponse.json({ unreadCount: 0 });
      }),
    );
    await renderPage(<NotificationAttention active client={apiClient()} />);
    expect(
      await screen.findByRole("status", { name: "Tens avisos importants pendents" }),
    ).toBeVisible();
    expect(screen.getByRole("link", { name: "Revisa els avisos" })).toHaveAttribute(
      "href",
      "/notificacions",
    );
    expect(reads).toBe(0);
    current = { ...cancellation, title: "Canvi de pista per demà" };
    fireEvent.focus(window);
    await screen.findByText("Canvi de pista per demà");
    current = undefined;
    act(() => {
      publishUnreadCount(0);
    });
    await waitFor(() => {
      expect(screen.queryByRole("status")).toBeNull();
    });
    expect(reads).toBe(0);
  });
});
