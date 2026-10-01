import { describe, expect, it } from "vitest";

import { ApiError } from "./api-error";
import { createSubmissionKeys, HELD_KEY_TTL_MS, isUnanswered } from "./submission-key";

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
/** A `503` carrying the api's own error body (CONVENCIONS_API §6): still no answer (E85). */
const unavailable = new ApiError({
  code: "INTERNAL_ERROR",
  details: {},
  message: "The service is temporarily unavailable",
  status: 503,
  traceId: "t-unavailable",
});
const internal = new ApiError({
  code: "INTERNAL_ERROR",
  details: {},
  message: "boom",
  status: 500,
  traceId: "t-internal",
});
const notFound = new ApiError({
  code: "NOT_FOUND",
  details: {},
  message: "Not found",
  status: 404,
  traceId: "t-not-found",
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
      "E7-W07 step 4 (E85): a 503 with the api's error body",
      "unanswered: the key is kept",
      unavailable,
    ],
    [
      "E7-W07 step 4 (E85): a 500 with the api's error body",
      "unanswered: the key is kept",
      internal,
    ],
    [
      "something thrown that is not an ApiError (a bug, an abort)",
      "unanswered: the key is kept",
      new TypeError("Failed to fetch"),
    ],
    [
      "409 IDEMPOTENCY_KEY_REUSED {reason: DIFFERENT_REQUEST}",
      "answered: the key is retired",
      differentRequest,
    ],
    ["422 WEEK_IN_PAST", "answered: the key is retired", refused],
    ["404 NOT_FOUND", "answered: the key is retired", notFound],
  ] as const)("isUnanswered: %s → %s", (_, outcome, cause) => {
    expect(isUnanswered(cause)).toBe(outcome.startsWith("unanswered"));
  });

  it("E7-W07 step 4 (CONVENCIONS_API §7, E85): send keeps the key after a 503 with the api's body and retires it after a 422", async () => {
    const keys = createSubmissionKeys();
    const sent: string[] = [];
    const answers = [unavailable, refused];
    const submit = () =>
      keys.send("payload", (key) => {
        sent.push(key);
        return Promise.reject(answers[sent.length - 1] ?? new TypeError("No answer left"));
      });
    await expect(submit()).rejects.toBe(unavailable);
    await expect(submit()).rejects.toBe(refused);
    await expect(submit()).rejects.toBeInstanceOf(TypeError);
    // The 503 kept it for the retry; the 422 retired it, so the third send is a new submission.
    expect(sent[1]).toBe(sent[0]);
    expect(sent[2]).not.toBe(sent[1]);
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
  it("E7-W06 review #5, E7-W07 step 4: with ttlMs, within the limit the retry reuses the key; after it, the same operation is a new submission with a new key", () => {
    let now = 1_000;
    const keys = createSubmissionKeys({ now: () => now, ttlMs: HELD_KEY_TTL_MS });
    const first = keys.keyFor("job|false");
    now += HELD_KEY_TTL_MS - 1;
    expect(keys.keyFor("job|false")).toBe(first);
    now += 1;
    const later = keys.keyFor("job|false");
    expect(later).not.toBe(first);
    now += 1;
    expect(keys.keyFor("job|false")).toBe(later);
  });

  it("E7-W07 step 4: without ttlMs an unanswered key is kept however long the retry takes", async () => {
    let now = 1_000;
    const keys = createSubmissionKeys({ now: () => now });
    const sent: string[] = [];
    await expect(
      keys.send("payload", (key) => {
        sent.push(key);
        return Promise.reject(unavailable);
      }),
    ).rejects.toBe(unavailable);
    now += 24 * 60 * 60_000;
    await keys.send("payload", (key) => {
      sent.push(key);
      return Promise.resolve();
    });
    expect(sent[1]).toBe(sent[0]);
  });
});

describe("E7-W07 step 4 (E7-W06 review #5): the keys of an abandoned submission", () => {
  it("drop(owner) forgets every key of that owner's submissions (followup's abandoned form), and only those", () => {
    const keys = createSubmissionKeys();
    const created = keys.keyFor('create:{"text":"a"}', "form-1");
    const attached = keys.keyFor('attach:{"file":1}', "form-1");
    const other = keys.keyFor('create:{"text":"b"}', "form-2");
    keys.drop("form-1");
    expect(keys.keyFor('create:{"text":"a"}', "form-1")).not.toBe(created);
    expect(keys.keyFor('attach:{"file":1}', "form-1")).not.toBe(attached);
    expect(keys.keyFor('create:{"text":"b"}', "form-2")).toBe(other);
  });
});
