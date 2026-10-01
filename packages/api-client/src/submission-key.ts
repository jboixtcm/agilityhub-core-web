import { useState } from "react";

import { isApiError, isInProgress } from "./api-error";

/**
 * The api has not given a keyed write its answer (CONVENCIONS_API §7, rulings E79, E80 and E85),
 * so the write keeps its key for the retry:
 * - no answer at all: a network failure (status 0), or a response without the api's error body (a
 *   gateway's, read as `code: "NETWORK"`);
 * - any `5xx`, even with the api's body: the api undid the attempt and released the key (R-08-08);
 * - `409 IDEMPOTENCY_KEY_REUSED {reason: IN_PROGRESS}`: the first request of that key still runs.
 *
 * Only a `2xx`, or a `4xx` with the api's body (`DIFFERENT_REQUEST` included), is the answer, and
 * retires the key. This is the only place the rule lives.
 */
export function isUnanswered(cause: unknown): boolean {
  return (
    !isApiError(cause) ||
    cause.status === 0 ||
    cause.code === "NETWORK" ||
    cause.status >= 500 ||
    isInProgress(cause)
  );
}

/**
 * One `Idempotency-Key` per submission (CONVENCIONS_API §7, rulings E74, E79, E80, E85), by the
 * submission's signature (its payload): the key is created when a submission starts, reused by its
 * retries while the api has not answered it (`isUnanswered`), and retired by the api's answer, so
 * the next submission of the same payload is a new one with a new key. Every keyed write of the
 * apps uses it (E7-W07 step 4).
 */
export interface SubmissionKeys {
  /**
   * The submissions of `owner` (a form that closed, a payload that changed) will never be retried:
   * their keys go.
   */
  drop: (owner: string) => void;
  /** The api answered the submission `signature`: its key is retired. */
  forget: (signature: string) => void;
  /**
   * The key of the submission `signature` (of `owner`, by default itself): the one it holds while
   * unanswered, else a new one.
   */
  keyFor: (signature: string, owner?: string) => string;
  /** Sends the submission `signature` with its key; an answer retires it, none keeps it. */
  send: <Result>(
    signature: string,
    write: (key: string) => Promise<Result>,
    owner?: string,
  ) => Promise<Result>;
}

export interface SubmissionKeysOptions {
  /** The clock (epoch ms), for the time limit. */
  now?: () => number;
  /**
   * A repeatable operation (a process run, a read-all, a row read) keeps an unanswered key this
   * long at most (`HELD_KEY_TTL_MS`): a later request of the same operation is a new one and never
   * replays an old stored answer (E7-W06 review #5). Without it a key is kept until answered.
   */
  ttlMs?: number;
}

/**
 * How long a repeatable operation keeps the key of a submission the api left unanswered: the
 * user's retry reuses it (the outboxes' and the read-all marker's 5 minutes).
 */
export const HELD_KEY_TTL_MS = 5 * 60_000;

export function createSubmissionKeys(options: SubmissionKeysOptions = {}): SubmissionKeys {
  const now = options.now ?? Date.now;
  const held = new Map<string, { at: number; key: string; owner: string }>();
  const forget = (signature: string) => {
    held.delete(signature);
  };
  const keyFor = (signature: string, owner: string = signature) => {
    const known = held.get(signature);
    if (known !== undefined && (options.ttlMs === undefined || now() - known.at < options.ttlMs)) {
      return known.key;
    }
    const key = crypto.randomUUID();
    held.set(signature, { at: now(), key, owner });
    return key;
  };
  return {
    drop(owner: string) {
      for (const [signature, entry] of held) {
        if (entry.owner === owner) held.delete(signature);
      }
    },
    forget,
    keyFor,
    async send<Result>(
      signature: string,
      write: (key: string) => Promise<Result>,
      owner: string = signature,
    ) {
      const key = keyFor(signature, owner);
      // An answer retires its own key only: a late answer of an earlier request (a double tap)
      // never retires the key of a newer submission of the same payload (E7-W06 review #7).
      const retire = () => {
        if (held.get(signature)?.key === key) held.delete(signature);
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

/** `createSubmissionKeys` held by one mounted component (its options are read once). */
export function useSubmissionKeys(options?: SubmissionKeysOptions): SubmissionKeys {
  const [keys] = useState(() => createSubmissionKeys(options));
  return keys;
}
