/**
 * The service worker's push logic (S11 R-11-07), kept free of worker globals so Vitest can run it:
 * `src/sw.ts` wires it to the `push` and `notificationclick` events.
 */

/** Where a notification opens when its payload names no in-app route: screen 11. */
export const DEFAULT_NOTIFICATION_URL = "/notificacions";

/** The api's push payload `{notificationId, title, body, icon, url, tag}` (R-11-07). */
export interface PushPayload {
  body: string;
  icon?: string;
  notificationId?: string;
  tag?: string;
  title: string;
  url: string;
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value !== "" ? value : undefined;
}

/** A path of this origin (with its query), or screen 11: a payload never sends the app elsewhere. */
export function sameOriginPath(url: unknown, origin: string): string {
  if (typeof url !== "string" || url === "") return DEFAULT_NOTIFICATION_URL;
  try {
    const target = new URL(url, origin);
    return target.origin === origin
      ? `${target.pathname}${target.search}${target.hash}`
      : DEFAULT_NOTIFICATION_URL;
  } catch {
    return DEFAULT_NOTIFICATION_URL;
  }
}

/** An image the notification may show: an https or same-origin URL, never a bare icon id. */
function iconUrl(value: unknown): string | undefined {
  const icon = text(value);
  return icon !== undefined && (icon.startsWith("/") || icon.startsWith("https://"))
    ? icon
    : undefined;
}

/** The payload of a `push` event, or `undefined` when it carries no title (nothing is shown). */
export function readPushPayload(raw: unknown, origin: string): PushPayload | undefined {
  if (typeof raw !== "object" || raw === null) return undefined;
  const payload = raw as Record<string, unknown>;
  const title = text(payload.title);
  if (title === undefined) return undefined;
  const icon = iconUrl(payload.icon);
  const notificationId = text(payload.notificationId);
  const tag = text(payload.tag);
  return {
    body: typeof payload.body === "string" ? payload.body : "",
    title,
    url: sameOriginPath(payload.url, origin),
    ...(icon === undefined ? {} : { icon }),
    ...(notificationId === undefined ? {} : { notificationId }),
    ...(tag === undefined ? {} : { tag }),
  };
}

/** `showNotification`'s options: the body, the icon and tag when present, and the deep link. */
export function notificationOptions(payload: PushPayload): NotificationOptions {
  return {
    body: payload.body,
    data: { url: payload.url },
    ...(payload.icon === undefined ? {} : { icon: payload.icon }),
    ...(payload.tag === undefined ? {} : { tag: payload.tag }),
  };
}

/** The part of a `WindowClient` the click handler uses. */
export interface WindowClientLike {
  focus(): Promise<unknown>;
  navigate?: (url: string) => Promise<unknown>;
  readonly url: string;
}

/** The part of the worker's `clients` the click handler uses. */
export interface ClientsLike {
  matchAll(options: {
    includeUncontrolled: boolean;
    type: "window";
  }): Promise<readonly WindowClientLike[]>;
  openWindow(url: string): Promise<unknown>;
}

function sameOrigin(url: string, origin: string): boolean {
  try {
    return new URL(url).origin === origin;
  } catch {
    return false;
  }
}

/**
 * `notificationclick` (R-11-07): focuses an open window of the app and takes it to the
 * notification's route, or opens that route in a new one.
 */
export async function openNotificationTarget(
  clients: ClientsLike,
  data: unknown,
  origin: string,
): Promise<void> {
  const url =
    typeof data === "object" && data !== null ? (data as { url?: unknown }).url : undefined;
  const target = new URL(sameOriginPath(url, origin), origin).href;
  const windows = await clients.matchAll({ includeUncontrolled: true, type: "window" });
  const open = windows.find((client) => sameOrigin(client.url, origin));
  if (open === undefined) {
    await clients.openWindow(target);
    return;
  }
  await open.focus();
  if (open.url === target || open.navigate === undefined) return;
  try {
    await open.navigate(target);
  } catch {
    // A window this worker does not control cannot be navigated: open the route beside it.
    await clients.openWindow(target);
  }
}
