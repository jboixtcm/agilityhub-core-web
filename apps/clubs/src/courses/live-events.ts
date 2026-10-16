import type { CoreApiStoreOptions } from "@agilityhub/api-client/core-api-store";

/**
 * The build session's live transport (R-16-11, E9-T04's SSE): `main.tsx` hands in the
 * `EventSource` subscriber with the session's access token; mock mode hands in none, and the
 * store then polls `GET /build-sessions/{id}` (INC-60). A light module: the course screens (a
 * lazy chunk) read it, the app's start only sets it.
 */
let subscriber: CoreApiStoreOptions["subscribeBuildEvents"];

export function configureBuildEvents(value: CoreApiStoreOptions["subscribeBuildEvents"]): void {
  subscriber = value;
}

export function buildEventsSubscriber(): CoreApiStoreOptions["subscribeBuildEvents"] {
  return subscriber;
}
