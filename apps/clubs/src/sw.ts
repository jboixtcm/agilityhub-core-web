import {
  cleanupOutdatedCaches,
  createHandlerBoundToURL,
  precacheAndRoute,
} from "workbox-precaching";
import { NavigationRoute, registerRoute } from "workbox-routing";

import {
  type ClientsLike,
  notificationOptions,
  openNotificationTarget,
  readPushPayload,
} from "./notifications/sw-logic";

/*
 * The app's service worker (Workbox `injectManifest`, S11 R-11-07): the precache and the app
 * shell as before, plus web push. The worker globals are typed here (the app's `lib` is DOM).
 */

interface ExtendableEventLike extends Event {
  waitUntil(promise: Promise<unknown>): void;
}

interface PushEventLike extends ExtendableEventLike {
  readonly data: { json(): unknown } | null;
}

interface NotificationEventLike extends ExtendableEventLike {
  readonly notification: Notification;
}

interface ServiceWorkerScopeLike {
  readonly __WB_MANIFEST: Parameters<typeof precacheAndRoute>[0];
  readonly clients: ClientsLike & { claim(): Promise<void> };
  readonly location: Location;
  readonly registration: ServiceWorkerRegistration;
  addEventListener(
    type: "activate" | "install",
    listener: (event: ExtendableEventLike) => void,
  ): void;
  addEventListener(
    type: "notificationclick",
    listener: (event: NotificationEventLike) => void,
  ): void;
  addEventListener(type: "push", listener: (event: PushEventLike) => void): void;
  skipWaiting(): Promise<void>;
}

declare const self: ServiceWorkerScopeLike;

// `registerType: "autoUpdate"`: a new worker takes over at once.
self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});
self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// INC-20: the mock world and MSW's worker are kept out of the precache (`globIgnores`).
cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);
// The app shell answers navigations, never the same-site proxy routes (api, OAuth2, OIDC).
registerRoute(
  new NavigationRoute(createHandlerBoundToURL("/index.html"), {
    denylist: [/^\/api\//u, /^\/oauth2\//u, /^\/connect\//u, /^\/\.well-known\//u],
  }),
);

self.addEventListener("push", (event) => {
  let raw: unknown;
  try {
    raw = event.data?.json();
  } catch {
    raw = undefined;
  }
  const payload = readPushPayload(raw, self.location.origin);
  if (payload === undefined) return;
  event.waitUntil(self.registration.showNotification(payload.title, notificationOptions(payload)));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    openNotificationTarget(self.clients, event.notification.data, self.location.origin),
  );
});
