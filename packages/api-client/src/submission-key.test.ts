import { describe, expect, it } from "vitest";

import { ApiError } from "./api-error";
import {
  createSubmissionKeys,
  HELD_KEY_TTL_MS,
  type HeldKey,
  heldKeyFor,
  isUnanswered,
} from "./submission-key";

const inProgress = new ApiError({
  code: "IDEMPOTENCY_KEY_REUSED",
  details: { reason: "IN_PROGRESS" },
  message: "The first request with this Idempotency-Key is still in progress",
  status: 409,
  traceId: "t-in-progress",
});
const differentRequest = new ApiError({
  code: "IDEMPOTENCY_KEY_REUSED",
  details: { reason: "DIFFERENT_REQUEST" },
  message: "Idempotency key reused",
  status: 409,
  traceId: "t-different",
});
const refused = new ApiError({
  code: "WEEK_IN_PAST",
  details: {},
  message: "past",
  status: 422,
  traceId: "t-past",
});

describe("E7-W06 step 1 (CONVENCIONS_API §7, E74, E79): one Idempotency-Key per submission", () => {
  it.each([
    [
      "a network failure (status 0)",
      "unanswered: the key is kept",
      ApiError.network(new TypeError("offline")),
    ],
    [
      "a gateway's answer without the api's error body (NETWORK, 502)",
      "unanswered: the key is kept",
      new ApiError({ code: "NETWORK", message: "Bad Gateway", status: 502 }),
    ],
    ["409 IDEMPOTENCY_KEY_REUSED {reason: IN_PROGRESS}", "unanswered: the key is kept", inProgress],
    [
      "409 IDEMPOTENCY_KEY_REUSED {reason: DIFFERENT_REQUEST}",
      "answered: the key is retired",
      differentRequest,
    ],
    ["422 WEEK_IN_PAST", "answered: the key is retired", refused],
  ] as const)("isUnanswered: %s → %s", (_, outcome, cause) => {
    expect(isUnanswered(cause)).toBe(outcome.startsWith("unanswered"));
  });

  it("send keeps the key while the api has not answered (IN_PROGRESS, offline), retires it on an answer, and a new submission of the same payload takes a new key", async () => {
    const keys = createSubmissionKeys();
    const sent: string[] = [];
    const answers: (() => Promise<string>)[] = [
      () => Promise.reject(inProgress),
      () => Promise.reject(ApiError.network(new TypeError("offline"))),
      () => Promise.reject(refused),
      () => Promise.resolve("created"),
      () => Promise.resolve("created again"),
    ];
    const submit = () =>
      keys.send("payload", (key) => {
        sent.push(key);
        const answer = answers[sent.length - 1];
        if (answer === undefined) throw new TypeError("No answer left");
        return answer();
      });
    await expect(submit()).rejects.toBe(inProgress);
    await expect(submit()).rejects.toBeInstanceOf(ApiError);
    await expect(submit()).rejects.toBe(refused);
    await expect(submit()).resolves.toBe("created");
    await expect(submit()).resolves.toBe("created again");
    expect(sent[1]).toBe(sent[0]);
    expect(sent[2]).toBe(sent[0]);
    // Refused (an answer): the next submission is a new one, and so is the one after a 2xx.
    expect(sent[3]).not.toBe(sent[0]);
    expect(sent[4]).not.toBe(sent[3]);
    // Another payload never shares a key.
    expect(keys.keyFor("other")).not.toBe(keys.keyFor("payload"));
  });

  it("E7-W06 review #7: a late answer of an earlier request (a double tap) never retires the key a newer submission of the same payload holds", async () => {
    const keys = createSubmissionKeys();
    const sent: string[] = [];
    let releaseLate: (value: string) => void = () => undefined;
    const late = new Promise<string>((resolve) => {
      releaseLate = resolve;
    });
    // A and B: a double tap, the same submission and key; B's answer comes late.
    const first = keys.send("payload", (key) => {
      sent.push(key);
      return Promise.resolve("A");
    });
    const second = keys.send("payload", (key) => {
      sent.push(key);
      return late;
    });
    await expect(first).resolves.toBe("A");
    // C: a new submission of the same payload, with a new key, still out.
    const newer = keys.keyFor("payload");
    expect(newer).not.toBe(sent[0]);
    releaseLate("B");
    await expect(second).resolves.toBe("B");
    expect(keys.keyFor("payload")).toBe(newer);
  });
});

describe("E7-W06 review #5 (CONVENCIONS_API §7): a repeatable operation keeps an unanswered key for HELD_KEY_TTL_MS only", () => {
  it("E7-W06 review #5: within the limit the retry reuses the key; after it, the same operation is a new submission with a new key", () => {
    const store = new Map<string, HeldKey>();
    const first = heldKeyFor(store, "job|false", 1_000);
    expect(heldKeyFor(store, "job|false", 1_000 + HELD_KEY_TTL_MS - 1)).toBe(first);
    const later = heldKeyFor(store, "job|false", 1_000 + HELD_KEY_TTL_MS);
    expect(later).not.toBe(first);
    expect(heldKeyFor(store, "job|false", 1_000 + HELD_KEY_TTL_MS + 1)).toBe(later);
  });
});
