import { describe, expect, it, vi } from "vitest";

import {
  type ClientsLike,
  notificationOptions,
  openNotificationTarget,
  readPushPayload,
  type WindowClientLike,
} from "./sw-logic";

const origin = "https://clubs.example.test";

describe("E7-W02 step 5 · the service worker's push and click (S11 R-11-07)", () => {
  it("shows the payload's title, body, icon and tag, and keeps its in-app route", () => {
    const payload = readPushPayload(
      {
        body: "Classe C i superiors · dijous 6 · 20:00.",
        icon: "/icons/club-192.png",
        notificationId: "n2",
        tag: "N-15",
        title: "S'ha alliberat una plaça!",
        url: "/espera/waitlist-duna-thu6",
      },
      origin,
    );
    expect(payload).toEqual({
      body: "Classe C i superiors · dijous 6 · 20:00.",
      icon: "/icons/club-192.png",
      notificationId: "n2",
      tag: "N-15",
      title: "S'ha alliberat una plaça!",
      url: "/espera/waitlist-duna-thu6",
    });
    expect(payload === undefined ? undefined : notificationOptions(payload)).toEqual({
      body: "Classe C i superiors · dijous 6 · 20:00.",
      data: { url: "/espera/waitlist-duna-thu6" },
      icon: "/icons/club-192.png",
      tag: "N-15",
    });
  });

  it("opens screen 11 when the payload names no route or another site, and shows nothing without a title", () => {
    expect(readPushPayload({ body: "x", title: "Avís" }, origin)?.url).toBe("/notificacions");
    expect(
      readPushPayload({ title: "Avís", url: "https://elsewhere.example.test/x" }, origin)?.url,
    ).toBe("/notificacions");
    expect(readPushPayload({ icon: "bell", title: "Avís" }, origin)).not.toHaveProperty("icon");
    expect(readPushPayload({ body: "no title" }, origin)).toBeUndefined();
    expect(readPushPayload(null, origin)).toBeUndefined();
  });

  function clients(windows: WindowClientLike[]) {
    const openWindow = vi.fn(() => Promise.resolve(undefined));
    const value: ClientsLike = {
      matchAll: vi.fn(() => Promise.resolve(windows)),
      openWindow,
    };
    return { openWindow, value };
  }

  it("focuses an open window of the app and takes it to the notification's route", async () => {
    const focus = vi.fn(() => Promise.resolve(undefined));
    const navigate = vi.fn(() => Promise.resolve(undefined));
    const { openWindow, value } = clients([
      { focus: vi.fn(() => Promise.resolve(undefined)), url: "https://other.example.test/" },
      { focus, navigate, url: `${origin}/inici` },
    ]);
    await openNotificationTarget(value, { url: "/reservar?dogId=dog-duna" }, origin);
    expect(focus).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith(`${origin}/reservar?dogId=dog-duna`);
    expect(openWindow).not.toHaveBeenCalled();
  });

  it("opens the route in a new window when none of the app is open", async () => {
    const { openWindow, value } = clients([]);
    await openNotificationTarget(value, { url: "/notificacions" }, origin);
    expect(openWindow).toHaveBeenCalledWith(`${origin}/notificacions`);
  });
});
