import type { ApiClient } from "@agilityhub/api-client";
import { useSyncExternalStore } from "react";

/**
 * The feed's unread count as the last `read-all` answered it (S11 R-11-10), shared by screen 11
 * and screen 03's bell: each answer bumps `version`, and 03 reads `GET /me/home` again, so a
 * read-all that lands after the member went back Home still silences the bell (E7-W02 round 2 #3).
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

/** The delays of the bounded retry of a failed `read-all` (after the first attempt). */
export const READ_ALL_RETRY_DELAYS_MS: readonly number[] = [500, 2000, 6000];

/**
 * `POST /me/notifications/read-all` (entering screen 11, S11 §13-8): idempotent, sent with
 * `keepalive` so it outlives a navigation back Home. Its `unreadCount` is published for the bell.
 */
export async function readAllNotifications(client: ApiClient): Promise<number> {
  const { data } = await client.POST("/me/notifications/read-all", { keepalive: true });
  const count = data?.unreadCount ?? 0;
  publishUnreadCount(count);
  return count;
}
