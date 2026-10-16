import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  type BuildEventSource,
  type BuildEventSourceConstructor,
  createBuildEventsSubscriber,
} from "./build-events";

/** A browser `EventSource` the test drives: it records its URL and replays what the api sends. */
function fakeEventSources(): {
  readonly EventSourceImpl: BuildEventSourceConstructor;
  readonly opened: FakeEventSource[];
} {
  const opened: FakeEventSource[] = [];
  class Impl extends FakeEventSource {
    constructor(url: string) {
      super(url);
      opened.push(this);
    }
  }
  return { EventSourceImpl: Impl, opened };
}

class FakeEventSource implements BuildEventSource {
  closed = false;
  readonly #listeners = new Map<string, ((event: Event) => void)[]>();

  constructor(readonly url: string) {}

  addEventListener(type: string, listener: (event: Event) => void): void {
    this.#listeners.set(type, [...(this.#listeners.get(type) ?? []), listener]);
  }

  close(): void {
    this.closed = true;
  }

  /** The api sends `event: <type>` with `data` (a bare `open`/`error` has none). */
  emit(type: string, data?: string): void {
    const event = data === undefined ? new Event(type) : new MessageEvent(type, { data });
    for (const listener of this.#listeners.get(type) ?? []) listener(event);
  }
}

function at<T>(items: readonly T[], index: number): T {
  const item = items[index];
  if (item === undefined) throw new Error(`MISSING:${String(index)}`);
  return item;
}

const EVENTS_URL = (id: string) => `https://core.test/api/v1/build-sessions/${id}/events`;

const obstacleEvent = {
  at: "2026-10-15T09:05:00Z",
  byAccountId: "account-other",
  obstacleId: "obstacle-2",
  sessionId: "session-1",
  status: "PLACED",
  version: 5,
};

function handlers() {
  return { onFinished: vi.fn(), onOpened: vi.fn() };
}

describe("S16 build-session event stream (R-16-11 live mode)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("T-16-10 R-16-11 opens the stream with the access token in the query (an EventSource sends no header)", () => {
    const { EventSourceImpl, opened } = fakeEventSources();
    const subscribe = createBuildEventsSubscriber({
      EventSourceImpl,
      eventsUrl: EVENTS_URL,
      getAccessToken: () => "token/1+a",
    });

    subscribe("session-1", vi.fn(), handlers());

    expect(opened.map((source) => source.url)).toEqual([
      "https://core.test/api/v1/build-sessions/session-1/events?access_token=token%2F1%2Ba",
    ]);
  });

  it("T-16-10 R-16-11 delivers obstacle events parsed and ignores malformed data", () => {
    const { EventSourceImpl, opened } = fakeEventSources();
    const onObstacle = vi.fn();
    const subscribe = createBuildEventsSubscriber({
      EventSourceImpl,
      eventsUrl: EVENTS_URL,
      getAccessToken: () => "token-1",
    });

    subscribe("session-1", onObstacle, handlers());
    const source = at(opened, 0);
    source.emit("open");
    source.emit("obstacle", "{not json");
    source.emit("obstacle", JSON.stringify({ ...obstacleEvent, status: "BROKEN" }));
    source.emit("obstacle", JSON.stringify({ ...obstacleEvent, version: "5" }));
    source.emit("obstacle", JSON.stringify(obstacleEvent));

    expect(onObstacle.mock.calls).toEqual([[obstacleEvent]]);
  });

  it("T-16-10 R-16-11 an error closes the stream and reopens it with a fresh token; onOpened at every open, the first included", async () => {
    const { EventSourceImpl, opened } = fakeEventSources();
    const tokens = ["token-1", "token-2"];
    const callbacks = handlers();
    const subscribe = createBuildEventsSubscriber({
      EventSourceImpl,
      eventsUrl: EVENTS_URL,
      getAccessToken: () => tokens.shift() ?? null,
    });

    subscribe("session-1", vi.fn(), callbacks);
    expect(callbacks.onOpened).not.toHaveBeenCalled();
    at(opened, 0).emit("open");
    // Changes between the caller's read and this open are not on the stream (no replay).
    expect(callbacks.onOpened).toHaveBeenCalledOnce();
    // The stream ends (30 minutes, or the token's exp): the native retry would reuse the old token.
    at(opened, 0).emit("error");
    expect(at(opened, 0).closed).toBe(true);
    await vi.advanceTimersByTimeAsync(1499);
    expect(opened).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);

    expect(opened.map((source) => source.url)).toEqual([
      `${EVENTS_URL("session-1")}?access_token=token-1`,
      `${EVENTS_URL("session-1")}?access_token=token-2`,
    ]);
    expect(callbacks.onOpened).toHaveBeenCalledOnce();
    at(opened, 1).emit("open");
    expect(callbacks.onOpened).toHaveBeenCalledTimes(2);
  });

  it("R-16-11 failed reopens back off (doubling, capped) and an open resets the delay", async () => {
    const { EventSourceImpl, opened } = fakeEventSources();
    const subscribe = createBuildEventsSubscriber({
      EventSourceImpl,
      eventsUrl: EVENTS_URL,
      getAccessToken: () => "token-1",
      maxReopenDelayMs: 5000,
      reopenDelayMs: 1000,
    });

    subscribe("session-1", vi.fn(), handlers());
    const reopenAfter = async (ms: number) => {
      const before = opened.length;
      at(opened, before - 1).emit("error");
      await vi.advanceTimersByTimeAsync(ms - 1);
      expect(opened).toHaveLength(before);
      await vi.advanceTimersByTimeAsync(1);
      expect(opened).toHaveLength(before + 1);
    };

    await reopenAfter(1000);
    await reopenAfter(2000);
    await reopenAfter(4000);
    await reopenAfter(5000);
    at(opened, opened.length - 1).emit("open");
    await reopenAfter(1000);
  });

  it("T-16-10 R-16-11 finished reaches onFinished, closes the stream and never reopens it", async () => {
    const { EventSourceImpl, opened } = fakeEventSources();
    const callbacks = handlers();
    const subscribe = createBuildEventsSubscriber({
      EventSourceImpl,
      eventsUrl: EVENTS_URL,
      getAccessToken: () => "token-1",
    });

    subscribe("session-1", vi.fn(), callbacks);
    const source = at(opened, 0);
    source.emit("open");
    source.emit(
      "finished",
      JSON.stringify({ finishedAt: null, sessionId: "session-1", status: "ABANDONED", version: 9 }),
    );
    source.emit("error");
    await vi.advanceTimersByTimeAsync(60_000);

    expect(callbacks.onFinished.mock.calls).toEqual([
      [{ finishedAt: null, sessionId: "session-1", status: "ABANDONED", version: 9 }],
    ]);
    expect(source.closed).toBe(true);
    expect(opened).toHaveLength(1);
  });

  it("R-16-11 without an access token it waits, opens once one exists and then reads the state again", async () => {
    const { EventSourceImpl, opened } = fakeEventSources();
    let token: string | null = null;
    const callbacks = handlers();
    const subscribe = createBuildEventsSubscriber({
      EventSourceImpl,
      eventsUrl: EVENTS_URL,
      getAccessToken: () => token,
    });

    subscribe("session-1", vi.fn(), callbacks);
    expect(opened).toHaveLength(0);
    token = "token-late";
    await vi.advanceTimersByTimeAsync(1500);
    at(opened, 0).emit("open");

    expect(at(opened, 0).url).toBe(`${EVENTS_URL("session-1")}?access_token=token-late`);
    expect(callbacks.onOpened).toHaveBeenCalledOnce();
  });

  it("R-16-11 cleanup closes the stream and cancels a pending reopen", async () => {
    const { EventSourceImpl, opened } = fakeEventSources();
    const subscribe = createBuildEventsSubscriber({
      EventSourceImpl,
      eventsUrl: EVENTS_URL,
      getAccessToken: () => "token-1",
    });

    const first = subscribe("session-1", vi.fn(), handlers());
    first();
    expect(at(opened, 0).closed).toBe(true);

    const second = subscribe("session-1", vi.fn(), handlers());
    at(opened, 1).emit("error");
    second();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(opened).toHaveLength(2);
  });

  it("R-16-11 a runtime without EventSource is refused without opening anything", () => {
    const subscribe = createBuildEventsSubscriber({
      eventsUrl: EVENTS_URL,
      getAccessToken: () => "secret-token",
    });
    vi.stubGlobal("EventSource", undefined);
    try {
      expect(() => subscribe("session-1", vi.fn(), handlers())).toThrow(
        /^BUILD_EVENTS_UNSUPPORTED$/u,
      );
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
