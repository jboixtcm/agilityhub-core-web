import { useState } from "react";

import { isApiError, isInProgress } from "./api-error";

/**
 * The api has not given a keyed write its answer (CONVENCIONS_API §7, rulings E79 and E80): no
 * answer at all — a network failure (status 0), or a response without the api's error body (a
 * gateway's, read as `code: "NETWORK"`) — or `409 IDEMPOTENCY_KEY_REUSED {reason: IN_PROGRESS}`:
 * the first request of that key is still running, which is not the write's answer. The write keeps
 * its key for the retry. Anything else (a 2xx, any other refusal, `DIFFERENT_REQUEST` included) is
 * the answer, and retires the key.
 */
export function isUnanswered(cause: unknown): boolean {
  return (
    !isApiError(cause) || cause.status === 0 || cause.code === "NETWORK" || isInProgress(cause)
  );
}

/**
 * One `Idempotency-Key` per submission (CONVENCIONS_API §7, rulings E74, E79, E80), by the
 * submission's signature (its payload): the key is created when a submission starts, reused by its
 * retries while the api has not answered it (`isUnanswered`), and retired by the api's answer, so
 * the next submission of the same payload is a new one with a new key.
 */
export interface SubmissionKeys {
  /** The api answered the submission `signature`: its key is retired. */
  forget: (signature: string) => void;
  /** The key of the submission `signature`: the one it holds while unanswered, else a new one. */
  keyFor: (signature: string) => string;
  /** Sends the submission `signature` with its key; an answer retires it, none keeps it. */
  send: <Result>(signature: string, write: (key: string) => Promise<Result>) => Promise<Result>;
}

export function createSubmissionKeys(): SubmissionKeys {
  const held = new Map<string, string>();
  const forget = (signature: string) => {
    held.delete(signature);
  };
  const keyFor = (signature: string) => {
    const known = held.get(signature);
    if (known !== undefined) return known;
    const key = crypto.randomUUID();
    held.set(signature, key);
    return key;
  };
  return {
    forget,
    keyFor,
    async send<Result>(signature: string, write: (key: string) => Promise<Result>) {
      const key = keyFor(signature);
      // An answer retires its own key only: a late answer of an earlier request (a double tap)
      // never retires the key of a newer submission of the same payload (E7-W06 review #7).
      const retire = () => {
        if (held.get(signature) === key) held.delete(signature);
      };
      try {
        const result = await write(key);
        retire();
        return result;
      } catch (cause) {
        if (!isUnanswered(cause)) retire();
        throw cause;
      }
    },
  };
}

/**
 * How long a repeatable operation (a process run, a read-all) keeps the key of a submission the api
 * left unanswered: the user's retry reuses it, a later request of the same operation is a new one
 * and never replays an old stored answer (E7-W06 review #5; the outboxes' and the read-all
 * marker's 5 minutes).
 */
export const HELD_KEY_TTL_MS = 5 * 60_000;

/** A key kept for a repeatable operation, with the moment its submission started. */
export interface HeldKey {
  at: number;
  key: string;
}

/**
 * The key of a repeatable operation's submission: the one `store` holds while it is younger than
 * `HELD_KEY_TTL_MS`, else a new one (stored with `now`).
 */
export function heldKeyFor(
  store: Map<string, HeldKey>,
  signature: string,
  now = Date.now(),
): string {
  const known = store.get(signature);
  if (known !== undefined && now - known.at < HELD_KEY_TTL_MS) return known.key;
  const key = crypto.randomUUID();
  store.set(signature, { at: now, key });
  return key;
}

/** `createSubmissionKeys` held by one mounted component. */
export function useSubmissionKeys(): SubmissionKeys {
  const [keys] = useState(createSubmissionKeys);
  return keys;
}
