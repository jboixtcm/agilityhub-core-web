/**
 * R-16-11 live mode: the browser side of `GET /build-sessions/{id}/events` (text/event-stream).
 *
 * The stream sends `event: obstacle` `{sessionId, obstacleId, status, byAccountId, at, version}`
 * per changed obstacle and `event: finished` `{sessionId, status, finishedAt, version}` once the
 * session closes, after which it ends. It lasts at most 30 minutes and never longer than the
 * access token it opened with, and nothing is replayed: on every open (the first included, as
 * changes between the caller's read and the open are not on the stream) the client reads
 * `GET /build-sessions/{id}` again (`onOpened`).
 *
 * A browser `EventSource` sends no header, so the token travels as `?access_token=` (accepted
 * only by this operation). Its native retry would reuse that URL — an expired token — so on
 * `error` the stream is closed and reopened here with a fresh token, after a capped backoff.
 * The token never reaches a log or an error message.
 *
 * Runtime imports: none (the package's main entry stays light; types only).
 */
import type { components } from "./generated/schema";

type ObstacleStatus = components["schemas"]["BuildObstacle"]["status"];

/** `event: obstacle` — one obstacle changed (by any phone, this one included). */
export interface BuildObstacleEvent {
  readonly sessionId: string;
  readonly obstacleId: string;
  readonly status: ObstacleStatus;
  readonly byAccountId: string | null;
  readonly at: string | null;
  /** The session version this change produced (the event's `id`). */
  readonly version: number;
}

/** `event: finished` — the session closed; `finishedAt` is `null` for an outlived session. */
export interface BuildFinishedEvent {
  readonly sessionId: string;
  readonly status: "ABANDONED" | "COMPLETED";
  readonly finishedAt: string | null;
  readonly version: number;
}

export interface BuildEventHandlers {
  /** The session closed; the stream is closed and never reopened. */
  readonly onFinished: (event: BuildFinishedEvent) => void;
  /**
   * The stream is open — the first time and after every reopen. A stream carries only what
   * happens from then on (no replay), so changes before it (since the caller's last read, or
   * while it was down) are not on it: read `GET /build-sessions/{id}` now.
   */
  readonly onOpened: () => void;
}

/** `CoreApiStoreOptions.subscribeBuildEvents`: opens the stream, returns its cleanup. */
export type SubscribeBuildEvents = (
  buildSessionId: string,
  onObstacle: (event: BuildObstacleEvent) => void,
  handlers: BuildEventHandlers,
) => () => void;

/** The part of the browser's `EventSource` the transport uses (tests pass a fake). */
export interface BuildEventSource {
  addEventListener(type: string, listener: (event: Event) => void): void;
  close(): void;
}

export type BuildEventSourceConstructor = new (url: string) => BuildEventSource;

export interface BuildEventsSubscriberOptions {
  /** The stream's URL without the token, e.g. `${apiBaseUrl}/build-sessions/${id}/events`. */
  readonly eventsUrl: (buildSessionId: string) => string;
  /** The current access token (read again at every (re)open); `null` while there is none. */
  readonly getAccessToken: () => string | null | undefined;
  /** Default: the global `EventSource` (resolved when subscribing). */
  readonly EventSourceImpl?: BuildEventSourceConstructor;
  /** The first reopen's delay (default 1500 ms); it doubles per failed reopen. */
  readonly reopenDelayMs?: number;
  /** The backoff's cap (default 30 s). */
  readonly maxReopenDelayMs?: number;
}

export const BUILD_EVENTS_REOPEN_DELAY_MS = 1500;
export const BUILD_EVENTS_MAX_REOPEN_DELAY_MS = 30_000;

const OBSTACLE_STATUSES: readonly string[] = [
  "NOT_PLACED",
  "CURRENT",
  "PLACED",
  "SKIPPED",
  "NEEDS_CHECK",
] satisfies readonly ObstacleStatus[];

function parsed(event: Event): Record<string, unknown> | null {
  const data = (event as Partial<MessageEvent<unknown>>).data;
  if (typeof data !== "string") return null;
  try {
    const value: unknown = JSON.parse(data);
    return typeof value === "object" && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

const isText = (value: unknown): value is string => typeof value === "string";
const isTextOrNull = (value: unknown): value is string | null => value === null || isText(value);
const isVersion = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

function obstacleEvent(event: Event): BuildObstacleEvent | null {
  const data = parsed(event);
  if (data === null) return null;
  const { at = null, byAccountId = null, obstacleId, sessionId, status, version } = data;
  if (!isText(sessionId) || !isText(obstacleId) || !isVersion(version)) return null;
  if (!isText(status) || !OBSTACLE_STATUSES.includes(status)) return null;
  if (!isTextOrNull(at) || !isTextOrNull(byAccountId)) return null;
  return { at, byAccountId, obstacleId, sessionId, status: status as ObstacleStatus, version };
}

function finishedEvent(event: Event): BuildFinishedEvent | null {
  const data = parsed(event);
  if (data === null) return null;
  const { finishedAt = null, sessionId, status, version } = data;
  if (!isText(sessionId) || !isVersion(version) || !isTextOrNull(finishedAt)) return null;
  if (status !== "COMPLETED" && status !== "ABANDONED") return null;
  return { finishedAt, sessionId, status, version };
}

function withToken(url: string, token: string): string {
  return `${url}${url.includes("?") ? "&" : "?"}access_token=${encodeURIComponent(token)}`;
}

/**
 * The SSE transport for `CoreApiStore` (`subscribeBuildEvents`). Every successful open calls
 * `onOpened`. Without a token it does not open (the api would answer 401): it tries again after
 * the backoff. Throws
 * `BUILD_EVENTS_UNSUPPORTED` when the runtime has no `EventSource` (the store then polls).
 */
export function createBuildEventsSubscriber(
  options: BuildEventsSubscriberOptions,
): SubscribeBuildEvents {
  const firstDelay = options.reopenDelayMs ?? BUILD_EVENTS_REOPEN_DELAY_MS;
  const maxDelay = options.maxReopenDelayMs ?? BUILD_EVENTS_MAX_REOPEN_DELAY_MS;

  return (buildSessionId, onObstacle, handlers) => {
    const Impl =
      options.EventSourceImpl ??
      (globalThis as { EventSource?: BuildEventSourceConstructor }).EventSource;
    if (Impl === undefined) throw new Error("BUILD_EVENTS_UNSUPPORTED");

    let source: BuildEventSource | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let failures = 0;
    let done = false;

    const closeSource = () => {
      source?.close();
      source = null;
    };

    const scheduleReopen = () => {
      const delay = Math.min(firstDelay * 2 ** failures, maxDelay);
      failures += 1;
      timer = setTimeout(() => {
        timer = undefined;
        open();
      }, delay);
    };

    const open = () => {
      if (done) return;
      const token = options.getAccessToken();
      if (token === null || token === undefined || token === "") {
        scheduleReopen();
        return;
      }
      const current = new Impl(withToken(options.eventsUrl(buildSessionId), token));
      source = current;
      current.addEventListener("open", () => {
        if (source !== current) return;
        failures = 0;
        handlers.onOpened();
      });
      current.addEventListener("obstacle", (event) => {
        if (source !== current) return;
        const change = obstacleEvent(event);
        if (change !== null) onObstacle(change);
      });
      current.addEventListener("finished", (event) => {
        if (source !== current) return;
        const finished = finishedEvent(event);
        if (finished === null) return;
        done = true;
        closeSource();
        handlers.onFinished(finished);
      });
      current.addEventListener("error", () => {
        if (source !== current) return;
        // The native retry would reuse the URL's (maybe expired) token: reopen with a fresh one.
        closeSource();
        if (!done) scheduleReopen();
      });
    };

    open();

    return () => {
      done = true;
      if (timer !== undefined) clearTimeout(timer);
      timer = undefined;
      closeSource();
    };
  };
}
