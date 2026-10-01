import type { ApiClient } from "@agilityhub/api-client";
import { useSyncExternalStore } from "react";

/**
 * The feed's unread count as the last `read-all` answered it (S11 R-11-10), shared by screen 11
 * and screen 03's bell inside one document: each answer bumps `version`, and 03 reads
 * `GET /me/home` again, so a read-all that lands while 03 is shown silences the bell (E7-W02
 * round 2 #3). Across a full page load the pending marker below does it.
 */
export interface UnreadState {
  count: number | undefined;
  version: number;
}

let state: UnreadState = { count: undefined, version: 0 };
const listeners = new Set<() => void>();

export function publishUnreadCount(count: number): void {
  state = { count, version: state.version + 1 };
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const snapshot = () => state;

export function useUnreadCount(): UnreadState {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}

/**
 * A read-all whose answer this tab has not seen yet, per account and club (E7-W05 step 3): every
 * way back to 03 is a full page load, so the module store above starts empty there and only this
 * marker in `sessionStorage` tells 03 to send it again. Only the time is stored.
 */
export const READ_ALL_PENDING_KEY = "agilityhub.notifications.readAllPending.v1";
/**
 * A read-all left longer than this is not sent again: it marks read everything created until it
 * is sent, so a late one would also mark notifications the member has not seen.
 */
export const READ_ALL_PENDING_MAX_AGE_MS = 5 * 60_000;

/** The account and the club a read-all belongs to. */
export interface ReadAllScope {
  accountId: string;
  clubId: string;
}

const pendingKey = ({ accountId, clubId }: ReadAllScope) =>
  `${READ_ALL_PENDING_KEY}:${accountId}:${clubId}`;

function pendingSince(scope: ReadAllScope): number | undefined {
  try {
    const entry = JSON.parse(sessionStorage.getItem(pendingKey(scope)) ?? "null") as {
      at?: unknown;
    } | null;
    return typeof entry?.at === "number" ? entry.at : undefined;
  } catch {
    return undefined;
  }
}

/** A read-all of this account and club was sent and its answer never arrived (recently). */
export function readAllPending(scope: ReadAllScope, now = Date.now()): boolean {
  const since = pendingSince(scope);
  return since !== undefined && now - since <= READ_ALL_PENDING_MAX_AGE_MS;
}

function markReadAllPending(scope: ReadAllScope): void {
  try {
    // A retry keeps the first time, so the marker never outlives its bound.
    if (readAllPending(scope)) return;
    sessionStorage.setItem(pendingKey(scope), JSON.stringify({ at: Date.now() }));
  } catch {
    // Without storage, the keepalive request is the only way out.
  }
}

function clearReadAllPending(scope: ReadAllScope): void {
  try {
    sessionStorage.removeItem(pendingKey(scope));
  } catch {
    // Nothing stored.
  }
}

/** The delays of the bounded retry of a failed `read-all` (after the first attempt). */
export const READ_ALL_RETRY_DELAYS_MS: readonly number[] = [500, 2000, 6000];

/**
 * `POST /me/notifications/read-all` (entering screen 11, S11 §13-8): idempotent, sent with
 * `keepalive` so it outlives a navigation back Home, and marked pending for this account and club
 * until its answer arrives (E7-W05 step 3). Its `unreadCount` is published for the bell.
 */
export async function readAllNotifications(
  client: ApiClient,
  scope: ReadAllScope,
): Promise<number> {
  markReadAllPending(scope);
  const { data } = await client.POST("/me/notifications/read-all", { keepalive: true });
  clearReadAllPending(scope);
  const count = data?.unreadCount ?? 0;
  publishUnreadCount(count);
  return count;
}
