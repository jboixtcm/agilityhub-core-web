import type { ApiClient, components } from "@agilityhub/api-client";
import { Icon } from "@agilityhub/ui";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { navigateInApp } from "../booking/shared";

import { useUnreadCount } from "./unread";
import "./attention.css";

type Notice = components["schemas"]["MeNotification"];

/** Important means a club change or a time-sensitive seat offer, regardless of SMS delivery. */
export function needsAttention(notice: Notice): boolean {
  if (notice.readAt != null) return false;
  if (notice.code === "N-15" || notice.action?.type === "CLAIM_SEAT") {
    return notice.action?.enabled === true;
  }
  return notice.category === "CLUB_CHANGES" || notice.channels.includes("SMS");
}

/** Find the newest important unread notice, including beyond the first page of routine notices. */
export async function readAttention(
  client: ApiClient,
  signal: AbortSignal,
): Promise<Notice | undefined> {
  let unreadSeen = 0;
  if (signal.aborted) return undefined;
  for (let page = 0; ; page += 1) {
    const { data } = await client.GET("/me/notifications", {
      params: { query: { page, size: 100 } },
      signal,
    });
    signal.throwIfAborted();
    if (data === undefined || data.unreadCount === 0) return undefined;
    const notice = data.items.find(needsAttention);
    if (notice !== undefined) return notice;
    unreadSeen += data.items.filter((item) => item.readAt == null).length;
    if (
      data.items.length === 0 ||
      (page + 1) * 100 >= data.totalItems ||
      unreadSeen >= data.unreadCount
    ) {
      return undefined;
    }
  }
}

/** Read-only attention banner: only opening the notification feed marks notices as read. */
export function NotificationAttention({ client, active }: { client: ApiClient; active: boolean }) {
  // Optional UI must not suspend the signed-in shell while its namespace loads.
  const { t, ready } = useTranslation("notifications", { useSuspense: false });
  const { version } = useUnreadCount();
  const [result, setResult] = useState<{ notice: Notice | undefined; version: number }>();

  useEffect(() => {
    if (!active || !ready) return;
    let request: AbortController | undefined;
    const refresh = () => {
      if (document.visibilityState === "hidden") return;
      request?.abort();
      const current = new AbortController();
      request = current;
      readAttention(client, current.signal).then(
        (next) => {
          if (!current.signal.aborted) setResult({ notice: next, version });
        },
        () => {
          // The ordinary bell/feed remain available; an expired offer must not persist after a failed refresh.
          if (!current.signal.aborted) setResult({ notice: undefined, version });
        },
      );
    };
    refresh();
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    const timer = window.setInterval(refresh, 60_000);
    return () => {
      request?.abort();
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [active, client, ready, version]);

  const notice = result?.version === version ? result.notice : undefined;
  if (!active || !ready || notice === undefined) return null;
  return (
    <aside
      aria-label={t("notifications:attention.title")}
      className="notification-attention"
      role="status"
    >
      <Icon
        aria-hidden="true"
        className="notification-attention__icon"
        key={notice.id}
        name="bell"
      />
      <div className="notification-attention__copy">
        <strong>{t("notifications:attention.title")}</strong>
        <p>{notice.title}</p>
      </div>
      <a
        className="notification-attention__open"
        href="/notificacions"
        onClick={(event) => {
          if (
            event.button !== 0 ||
            event.metaKey ||
            event.ctrlKey ||
            event.shiftKey ||
            event.altKey
          )
            return;
          event.preventDefault();
          navigateInApp("/notificacions");
        }}
      >
        {t("notifications:attention.open")}
        <Icon aria-hidden="true" name="chev" />
      </a>
    </aside>
  );
}
