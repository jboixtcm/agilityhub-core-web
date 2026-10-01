import { type ApiClient, isApiError, isInProgress, isUnanswered } from "@agilityhub/api-client";
import { Button, Toast } from "@agilityhub/ui";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import "./followup.css";

/** S10 §2 row D14: the menu counter is read again every 60 s (and on focus). */
export const FOLLOWUP_UNREAD_POLL_MS = 60_000;

/** A D14 row being read: which one, and whether it showed «no llegit» (the counter's decrement). */
export interface FollowUpReadItem {
  dogName?: string | null | undefined;
  id: string;
  unread: boolean;
}

/** A read the api refused or could not reach, with what the user needs to try again. */
export interface FollowUpReadFailure {
  error: unknown;
  item: FollowUpReadItem;
}

export interface UnreadFollowUp {
  /** The caller's unread rows (`GET /followup/unread-count`); none before the first answer. */
  count: number | undefined;
  /** `403 IMPERSONATION_DENIED`: the S10 entries are hidden (step 7). */
  denied: boolean;
  /** The last row read that failed (shown wherever the user is), until a retry or a dismissal. */
  failure: FollowUpReadFailure | undefined;
  dismissFailure: () => void;
  /** «Marcar-ho tot com a llegit» answered: 0, until the next read. */
  markAllRead: () => void;
  /** One unread row read (optimistic, R-10-13): one less, until the next read says. */
  markOneRead: () => void;
  /**
   * R-10-13: `POST /followup/{id}/read` for a row the user opened, whatever it showed (a note may
   * have changed since the list was read). A row shown unread takes one off the counter at once.
   * Owned here, by the shell, so its outcome outlives D14 (the user is already on D13): a failure
   * reads the counter again and becomes `failure`. Resolves `true` when the api accepted it.
   */
  read: (item: FollowUpReadItem) => Promise<boolean>;
  refresh: () => void;
  /** Sends the failed read again (its key kept only when the api never answered it). */
  retry: () => void;
  /**
   * Hears each row a retry has read (R-10-13): a mounted D14 marks it read and reads its list
   * again, since the row it shows was read before the retry. Returns the unsubscription.
   */
  onRetried: (listener: (id: string) => void) => () => void;
}

/**
 * The menu counter of «Seguiment alumnes» (S10 §2 row D14, R-10-13): `GET /followup/unread-count`
 * on mount, on window focus and every 60 s, for an INSTRUCTOR or ADMIN of a club with `TASKS`
 * (`enabled`). A local change (a row read, read-all) wins over an answer requested before it, and
 * an answer requested while a read is on its way (it may or may not count that read) is not shown.
 * It also owns the rows' reads, so a failure is said wherever the user went: each read that took
 * one off the counter gives it back when it fails, whatever the counter's own refresh does
 * (offline, it fails too), until the api's count answers.
 */
export function useUnreadFollowUp(client: ApiClient, enabled: boolean): UnreadFollowUp {
  const [count, setCount] = useState<number>();
  const [denied, setDenied] = useState(false);
  const [request, setRequest] = useState(0);
  const [failure, setFailure] = useState<FollowUpReadFailure>();
  // Every read and every local change takes a number: only the newest one's answer is shown.
  const sequence = useRef(0);
  // The counter as shown, for the local changes that depend on it (a decrement given back).
  const shown = useRef<number | undefined>(undefined);
  // CONVENCIONS_API §7 (E79): a read's key is kept, by row, only while the api has not answered
  // it (a network failure, or IN_PROGRESS: its first request still runs).
  const unansweredKeys = useRef(new Map<string, string>());
  // The reads on their way, by row: the one running (a second read of the row joins it), and
  // whether it took one off the counter (given back if it fails).
  const inFlight = useRef(new Map<string, { decremented: boolean; done: Promise<boolean> }>());
  const retried = useRef(new Set<(id: string) => void>());

  /** A local change of the counter: it wins over every answer requested before it. */
  const change = useCallback((next: (value: number | undefined) => number | undefined) => {
    sequence.current += 1;
    shown.current = next(shown.current);
    setCount(shown.current);
  }, []);

  useEffect(() => {
    if (!enabled || denied) return undefined;
    let active = true;
    const load = () => {
      sequence.current += 1;
      const seq = sequence.current;
      // A read on its way may or may not be in this answer: it waits for the read's own refresh.
      const settled = inFlight.current.size === 0;
      client.GET("/followup/unread-count").then(
        ({ data }) => {
          if (!active || !settled || seq !== sequence.current || data === undefined) return;
          shown.current = data.count;
          setCount(data.count);
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
    change((value) => (value === undefined ? value : Math.max(0, value - 1)));
  }, [change]);
  const markAllRead = useCallback(() => {
    change(() => 0);
    // Everything is read now: a read on its way has nothing to give back if it fails.
    for (const entry of inFlight.current.values()) entry.decremented = false;
  }, [change]);

  const read = useCallback(
    (item: FollowUpReadItem): Promise<boolean> => {
      setFailure((current) => (current?.item.id === item.id ? undefined : current));
      const running = inFlight.current.get(item.id);
      if (running !== undefined) return running.done;
      // One off the counter for a row shown unread, if the counter has one to give.
      const entry = { decremented: false, done: Promise.resolve(false) };
      if (item.unread && shown.current !== undefined && shown.current > 0) {
        entry.decremented = true;
        markOneRead();
      }
      const key = unansweredKeys.current.get(item.id) ?? crypto.randomUUID();
      unansweredKeys.current.delete(item.id);
      entry.done = client
        .POST("/followup/{id}/read", {
          params: { header: { "Idempotency-Key": key }, path: { id: item.id } },
        })
        .then(
          () => {
            inFlight.current.delete(item.id);
            refresh();
            return true;
          },
          (error: unknown) => {
            inFlight.current.delete(item.id);
            if (isUnanswered(error)) unansweredKeys.current.set(item.id, key);
            // The decrement is given back here, whatever the refresh below does (offline it
            // fails too); the api's count replaces it when it answers.
            if (entry.decremented) change((value) => (value === undefined ? value : value + 1));
            refresh();
            setFailure({ error, item });
            return false;
          },
        );
      inFlight.current.set(item.id, entry);
      return entry.done;
    },
    [change, client, markOneRead, refresh],
  );
  const retry = useCallback(() => {
    if (failure === undefined) return;
    const { item } = failure;
    void read(item).then((accepted) => {
      if (!accepted) return;
      for (const listener of retried.current) listener(item.id);
    });
  }, [failure, read]);
  const dismissFailure = useCallback(() => {
    setFailure(undefined);
  }, []);
  const onRetried = useCallback((listener: (id: string) => void) => {
    retried.current.add(listener);
    return () => {
      retried.current.delete(listener);
    };
  }, []);

  return {
    count: enabled ? count : undefined,
    denied,
    dismissFailure,
    failure,
    markAllRead,
    markOneRead,
    onRetried,
    read,
    refresh,
    retry,
  };
}

export const UnreadFollowUpContext = createContext<UnreadFollowUp | undefined>(undefined);

/** The shell's counter, for D14 (its «{n} pendents de llegir» and the reads that change it). */
export function useUnreadFollowUpContext(): UnreadFollowUp | undefined {
  return useContext(UnreadFollowUpContext);
}

/**
 * A row read that failed (R-10-13), said by its code with [Torna-ho a provar], wherever the user
 * is: the shell renders it over every page (D14 itself when it runs without the shell).
 */
export function FollowUpReadFailureNotice({ unread }: { unread: UnreadFollowUp }) {
  const { t } = useTranslation(["admin-census", "errors", "common"]);
  const { failure } = unread;
  if (failure === undefined) return null;
  // IN_PROGRESS is not the read's answer: the retry sends the same key (CONVENCIONS_API §7, E80).
  const reason = isInProgress(failure.error)
    ? t("common:inProgress")
    : isApiError(failure.error) && failure.error.status !== 0
      ? t(`errors:${failure.error.code}`, { defaultValue: t("errors:INTERNAL_ERROR") })
      : t("admin-census:followup.readOffline");
  return (
    <Toast
      dismissLabel={t("admin-census:followup.dismiss")}
      onDismiss={unread.dismissFailure}
      tone="danger"
    >
      <span className="followup-read-failure">
        {t("admin-census:followup.readFailed", { name: failure.item.dogName ?? "" })} {reason}
        <Button onClick={unread.retry} variant="secondary">
          {t("admin-census:followup.readRetry")}
        </Button>
      </span>
    </Toast>
  );
}
