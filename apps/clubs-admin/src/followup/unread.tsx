import { type ApiClient, isApiError } from "@agilityhub/api-client";
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
}

/**
 * The menu counter of «Seguiment alumnes» (S10 §2 row D14, R-10-13): `GET /followup/unread-count`
 * on mount, on window focus and every 60 s, for an INSTRUCTOR or ADMIN of a club with `TASKS`
 * (`enabled`). A local change (a row read, read-all) wins over an answer requested before it. It
 * also owns the rows' reads, so a failure is said wherever the user went.
 */
export function useUnreadFollowUp(client: ApiClient, enabled: boolean): UnreadFollowUp {
  const [count, setCount] = useState<number>();
  const [denied, setDenied] = useState(false);
  const [request, setRequest] = useState(0);
  const [failure, setFailure] = useState<FollowUpReadFailure>();
  // Every read and every local change takes a number: only the newest one's answer is shown.
  const sequence = useRef(0);
  // CONVENCIONS_API §7: a read's key is kept only after a network failure (no answer), by row.
  const unansweredKeys = useRef(new Map<string, string>());

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

  const read = useCallback(
    async (item: FollowUpReadItem): Promise<boolean> => {
      setFailure((current) => (current?.item.id === item.id ? undefined : current));
      if (item.unread) markOneRead();
      const key = unansweredKeys.current.get(item.id) ?? crypto.randomUUID();
      unansweredKeys.current.delete(item.id);
      try {
        await client.POST("/followup/{id}/read", {
          params: { header: { "Idempotency-Key": key }, path: { id: item.id } },
        });
        refresh();
        return true;
      } catch (error) {
        if (!isApiError(error) || error.status === 0) unansweredKeys.current.set(item.id, key);
        // The optimistic decrement is undone by the api's own count.
        refresh();
        setFailure({ error, item });
        return false;
      }
    },
    [client, markOneRead, refresh],
  );
  const retry = useCallback(() => {
    if (failure !== undefined) void read(failure.item);
  }, [failure, read]);
  const dismissFailure = useCallback(() => {
    setFailure(undefined);
  }, []);

  return {
    count: enabled ? count : undefined,
    denied,
    dismissFailure,
    failure,
    markAllRead,
    markOneRead,
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
  const { t } = useTranslation(["admin-census", "errors"]);
  const { failure } = unread;
  if (failure === undefined) return null;
  const reason =
    isApiError(failure.error) && failure.error.status !== 0
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
