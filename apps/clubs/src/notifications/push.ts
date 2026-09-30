import type { ApiClient } from "@agilityhub/api-client";

/** The id of this device's subscription, for the logout's `DELETE` (R-11-07). Only the id. */
export const PUSH_SUBSCRIPTION_STORAGE_KEY = "agilityhub.push.subscription.v1";

let pushRegistration: ServiceWorkerRegistration | undefined;

/**
 * The app's own worker registration, handed in by `registerSW` (`onRegisteredSW`, `main.tsx`).
 * Never `navigator.serviceWorker.ready`: with `VITE_MOCK=1` the only worker on `/` is MSW's.
 */
export function setPushRegistration(registration: ServiceWorkerRegistration | undefined): void {
  pushRegistration = registration;
}

/**
 * What this browser can do with web push (R-11-07): an iOS browser outside the installed PWA only
 * gets the install hint; a browser without `PushManager` gets no toggle at all.
 */
export type PushSupport = "ios-install" | "supported" | "unsupported";

export function pushSupport(): PushSupport {
  const standalone = (navigator as Navigator & { standalone?: boolean }).standalone;
  if (/iP(hone|ad|od)/u.test(navigator.userAgent) && standalone !== true) return "ios-install";
  return "PushManager" in window && "Notification" in window && "serviceWorker" in navigator
    ? "supported"
    : "unsupported";
}

/** The browser's notification permission as it stands, read without prompting (R-11-07). */
export function pushPermission(): NotificationPermission | undefined {
  try {
    return "Notification" in window ? Notification.permission : undefined;
  } catch {
    return undefined;
  }
}

/**
 * The api's `deviceLabel` («iPhone · Safari»), from the user agent; `undefined` when nothing is
 * recognised (the api derives it then).
 */
export function deviceLabel(userAgent: string): string | undefined {
  const device = userAgent.includes("iPhone")
    ? "iPhone"
    : userAgent.includes("iPad")
      ? "iPad"
      : userAgent.includes("Android")
        ? "Android"
        : /Macintosh|Mac OS X/u.test(userAgent)
          ? "Mac"
          : userAgent.includes("Windows")
            ? "Windows"
            : userAgent.includes("Linux")
              ? "Linux"
              : undefined;
  const browser = /Edg(e|A|iOS)?\//u.test(userAgent)
    ? "Edge"
    : userAgent.includes("SamsungBrowser/")
      ? "Samsung Internet"
      : /Firefox\/|FxiOS\//u.test(userAgent)
        ? "Firefox"
        : /Chrome\/|CriOS\//u.test(userAgent)
          ? "Chrome"
          : userAgent.includes("Safari/")
            ? "Safari"
            : undefined;
  const label = [device, browser].filter((part) => part !== undefined).join(" · ");
  return label === "" ? undefined : label;
}

/** The VAPID public key (base64url) as `PushManager.subscribe` takes it. */
export function applicationServerKey(publicKey: string): Uint8Array<ArrayBuffer> {
  const base64 = publicKey.replace(/-/gu, "+").replace(/_/gu, "/");
  const binary = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "="));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

/**
 * `denied`: the browser refused (the row explains it); `dismissed`: the prompt was closed;
 * `unavailable`: no key, no app worker or no push in this browser (nothing to tell);
 * `failed`: the subscription or its registration failed (push is an enhancement: nothing shown).
 */
export type PushOutcome = "denied" | "dismissed" | "failed" | "subscribed" | "unavailable";

function storeSubscriptionId(id: string): void {
  try {
    localStorage.setItem(PUSH_SUBSCRIPTION_STORAGE_KEY, JSON.stringify({ id }));
  } catch {
    // Without storage the logout cannot unsubscribe this device: the api expires it on its own.
  }
}

function storedSubscriptionId(): string | undefined {
  try {
    const stored: unknown = JSON.parse(
      localStorage.getItem(PUSH_SUBSCRIPTION_STORAGE_KEY) ?? "null",
    );
    const id: unknown =
      typeof stored === "object" && stored !== null ? Reflect.get(stored, "id") : null;
    return typeof id === "string" && id !== "" ? id : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Each logout starts a new epoch: a subscription that lands after it belongs to the session that
 * left, so it is never kept (E7-W02 round 2 #2).
 */
let sessionEpoch = 0;
/** The subscriptions on their way, which a logout waits for (a bounded time only). */
const subscriptionsInFlight = new Set<Promise<PushOutcome>>();

/**
 * A subscription that landed after its session logged out: `DELETE` it while the api still takes
 * the old token; once the session is gone, unsubscribe it in the browser, so this device never
 * receives the former session's notifications. Its id is never stored.
 */
async function dropLateSubscription(
  client: ApiClient,
  id: string | undefined,
  subscription: PushSubscription,
): Promise<void> {
  if (id !== undefined) {
    try {
      await client.DELETE("/push-subscriptions/{id}", { params: { path: { id } } });
      return;
    } catch {
      // The session is gone (401): the browser side goes instead.
    }
  }
  try {
    await subscription.unsubscribe();
  } catch {
    // Nothing more to do: the api expires a subscription the push service refuses (404/410).
  }
}

/**
 * Subscribes this device to web push **in context** (R-11-07): called only right after the member
 * turns the push toggle on or picks a reminder other than «Mai», never at start-up. Asks for the
 * permission, subscribes with the club's VAPID key and upserts `POST /push-subscriptions`. Never
 * throws: a failure (a `404 MODULE_DISABLED` from a stale client included) is an outcome. A logout
 * while it travels drops it when it lands (`logoutWithPush`).
 */
export function subscribeToPush(
  client: ApiClient,
  publicKey: string | null | undefined,
): Promise<PushOutcome> {
  const run = subscribe(client, publicKey, sessionEpoch);
  subscriptionsInFlight.add(run);
  void run.finally(() => {
    subscriptionsInFlight.delete(run);
  });
  return run;
}

async function subscribe(
  client: ApiClient,
  publicKey: string | null | undefined,
  epoch: number,
): Promise<PushOutcome> {
  const registration = pushRegistration;
  if (
    publicKey === null ||
    publicKey === undefined ||
    publicKey === "" ||
    registration === undefined ||
    pushSupport() !== "supported"
  ) {
    return "unavailable";
  }
  let permission: NotificationPermission;
  try {
    permission = await Notification.requestPermission();
  } catch {
    return "failed";
  }
  if (permission === "denied") return "denied";
  if (permission !== "granted") return "dismissed";
  let subscription: PushSubscription;
  try {
    subscription = await registration.pushManager.subscribe({
      applicationServerKey: applicationServerKey(publicKey),
      userVisibleOnly: true,
    });
  } catch {
    return "failed";
  }
  if (epoch !== sessionEpoch) {
    // Logged out while the browser subscribed: nothing reached the api.
    await dropLateSubscription(client, undefined, subscription);
    return "failed";
  }
  try {
    const { endpoint, keys } = subscription.toJSON();
    const p256dh = keys?.p256dh;
    const auth = keys?.auth;
    if (endpoint === undefined || p256dh === undefined || auth === undefined) return "failed";
    const label = deviceLabel(navigator.userAgent);
    const { data } = await client.POST("/push-subscriptions", {
      body: {
        endpoint,
        keys: { auth, p256dh },
        ...(label === undefined ? {} : { deviceLabel: label }),
      },
    });
    if (epoch !== sessionEpoch) {
      // Logged out while the subscription travelled: it is never kept for the next session.
      await dropLateSubscription(client, data?.id, subscription);
      return "failed";
    }
    if (data !== undefined) storeSubscriptionId(data.id);
    return "subscribed";
  } catch {
    if (epoch !== sessionEpoch) await dropLateSubscription(client, undefined, subscription);
    return "failed";
  }
}

/** Logout of this device (R-11-07): `DELETE` of the stored subscription, best-effort. */
export async function unsubscribeFromPush(client: ApiClient): Promise<void> {
  const id = storedSubscriptionId();
  if (id === undefined) return;
  try {
    localStorage.removeItem(PUSH_SUBSCRIPTION_STORAGE_KEY);
  } catch {
    // Nothing stored to forget.
  }
  try {
    await client.DELETE("/push-subscriptions/{id}", { params: { path: { id } } });
  } catch {
    // Best-effort: a lost DELETE leaves the subscription to the api's expiry (404/410 → EXPIRED).
  }
}

/**
 * Logs out after the device's push unsubscription has been sent, never waiting for it more than
 * `waitMs` (push never blocks a logout). A subscription still on its way belongs to the session
 * that leaves: the logout waits for it within the same bound, and when it lands it is dropped
 * (deleted, or unsubscribed in the browser once the session is gone; E7-W02 round 2 #2).
 */
export async function logoutWithPush(
  client: ApiClient,
  logout: () => Promise<unknown>,
  waitMs = 1500,
): Promise<void> {
  sessionEpoch += 1;
  let timer: ReturnType<typeof setTimeout> | undefined;
  await Promise.race([
    Promise.allSettled([unsubscribeFromPush(client), ...subscriptionsInFlight]),
    new Promise((resolve) => {
      timer = setTimeout(resolve, waitMs);
    }),
  ]);
  clearTimeout(timer);
  await logout();
}
