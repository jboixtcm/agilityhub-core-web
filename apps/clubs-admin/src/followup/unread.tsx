import { type ApiClient, isApiError } from "@agilityhub/api-client";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

/** S10 §2 row D14: the menu counter is read again every 60 s (and on focus). */
export const FOLLOWUP_UNREAD_POLL_MS = 60_000;

export interface UnreadFollowUp {
  /** The caller's unread rows (`GET /followup/unread-count`); none before the first answer. */
  count: number | undefined;
  /** `403 IMPERSONATION_DENIED`: the S10 entries are hidden (step 7). */
  denied: boolean;
  /** «Marcar-ho tot com a llegit» answered: 0, until the next read. */
  markAllRead: () => void;
  /** One unread row read (optimistic, R-10-13): one less, until the next read says. */
  markOneRead: () => void;
  refresh: () => void;
}

/**
 * The menu counter of «Seguiment alumnes» (S10 §2 row D14, R-10-13): `GET /followup/unread-count`
 * on mount, on window focus and every 60 s, for an INSTRUCTOR or ADMIN of a club with `TASKS`
 * (`enabled`). A local change (a row read, read-all) wins over an answer requested before it.
 */
export function useUnreadFollowUp(client: ApiClient, enabled: boolean): UnreadFollowUp {
  const [count, setCount] = useState<number>();
  const [denied, setDenied] = useState(false);
  const [request, setRequest] = useState(0);
  // Every read and every local change takes a number: only the newest one's answer is shown.
  const sequence = useRef(0);

  useEffect(() => {
    if (!enabled || denied) return undefined;
    let active = true;
    const load = () => {
      sequence.current += 1;
      const seq = sequence.current;
      client.GET("/followup/unread-count").then(
        ({ data }) => {
          if (active && seq === sequence.current && data !== undefined) setCount(data.count);
        },
        (error: unknown) => {
          if (active && isApiError(error, "IMPERSONATION_DENIED")) setDenied(true);
        },
      );
    };
    load();
    const timer = window.setInterval(load, FOLLOWUP_UNREAD_POLL_MS);
    window.addEventListener("focus", load);
    return () => {
      active = false;
      window.clearInterval(timer);
      window.removeEventListener("focus", load);
    };
  }, [client, denied, enabled, request]);

  const refresh = useCallback(() => {
    setRequest((value) => value + 1);
  }, []);
  const markOneRead = useCallback(() => {
    sequence.current += 1;
    setCount((value) => (value === undefined ? value : Math.max(0, value - 1)));
  }, []);
  const markAllRead = useCallback(() => {
    sequence.current += 1;
    setCount(0);
  }, []);

  return {
    count: enabled ? count : undefined,
    denied,
    markAllRead,
    markOneRead,
    refresh,
  };
}

export const UnreadFollowUpContext = createContext<UnreadFollowUp | undefined>(undefined);

/** The shell's counter, for D14 (its «{n} pendents de llegir» and the reads that change it). */
export function useUnreadFollowUpContext(): UnreadFollowUp | undefined {
  return useContext(UnreadFollowUpContext);
}
