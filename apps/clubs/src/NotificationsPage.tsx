import type { ApiClient, components } from "@agilityhub/api-client";
import { useSession } from "@agilityhub/auth";
import { useClubFormats } from "@agilityhub/i18n";
import { AppBar, Button, Card, Icon, Skeleton, Toast, useBranding } from "@agilityhub/ui";
import { type MouseEvent, useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { errorText, navigateInApp } from "./booking/shared";
import { startClaim } from "./booking/useSeatHold";
import { changeClassHref, feedActionHref } from "./notifications/actions";
import { READ_ALL_RETRY_DELAYS_MS, readAllNotifications } from "./notifications/unread";
import "./notifications/notifications.css";

type MeNotification = components["schemas"]["MeNotification"];

const PAGE_SIZE = 20;

interface Feed {
  items: MeNotification[];
  /** The next page to read (`page` of `GET /me/notifications`). */
  nextPage: number;
  totalItems: number;
}

/** Page after page, one card per notification: a notification created meanwhile is not repeated. */
function merged(current: readonly MeNotification[], next: readonly MeNotification[]) {
  const seen = new Set(current.map((item) => item.id));
  return [...current, ...next.filter((item) => !seen.has(item.id))];
}

/**
 * Screen 11 «Notificacions» (`/notificacions`, S11 §2, R-11-10, R-11-11): the account's feed as
 * the api renders it — icon, tone, title and body frozen, the relative time in the club's zone,
 * «i per SMS», and the native action the code fixes. Entering the screen marks everything read
 * (`read-all`, S11 §13-8), so 03's bell goes quiet; more cards load when the list end shows.
 */
export function NotificationsPage({ client }: { client: ApiClient }) {
  const { t } = useTranslation(["notifications", "errors"]);
  const formats = useClubFormats();
  const branding = useBranding();
  const session = useSession();
  const [feed, setFeed] = useState<Feed>();
  const [status, setStatus] = useState<"error" | "loading" | "ready">("loading");
  const [loadError, setLoadError] = useState<unknown>();
  const [more, setMore] = useState<"error" | "idle" | "loading">("idle");
  const [attempt, setAttempt] = useState(0);
  const [claiming, setClaiming] = useState<string>();
  const [claimError, setClaimError] = useState<{ id: string; message: string }>();
  // The visit's read-all (S11 §13-8): `done` once the api answered it; a failure goes back to
  // `idle` and is sent again, a bounded number of times (E7-W02 round 2 #3).
  const readAll = useRef<"done" | "idle" | "sending">("idle");
  const readAllRetries = useRef(0);
  const readAllTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const mounted = useRef(true);
  const sentinel = useRef<HTMLDivElement>(null);
  const staff =
    session.me?.impersonation === undefined &&
    (session.activeProfile === "INSTRUCTOR" || session.activeProfile === "ADMIN");
  // The account and club the visit's read-all belongs to (its pending marker, E7-W05 step 3).
  const accountId = session.me?.account.id ?? "";
  const clubId = session.me?.membership?.clubId ?? "";

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      // The request on its way still lands (and silences the bell); no retry after leaving.
      clearTimeout(readAllTimer.current);
    };
  }, []);

  /**
   * Idempotent on the api side; its answer's `unreadCount` reaches 03's bell (`unread.ts`), and
   * until it arrives 03 knows it is pending, even after a full page load (E7-W05 step 3).
   */
  const sendReadAll = useCallback(() => {
    function attempt() {
      if (readAll.current !== "idle") return;
      readAll.current = "sending";
      readAllNotifications(client, { accountId, clubId }).then(
        () => {
          readAll.current = "done";
        },
        () => {
          readAll.current = "idle";
          const delay = READ_ALL_RETRY_DELAYS_MS[readAllRetries.current];
          if (!mounted.current || delay === undefined) return;
          readAllRetries.current += 1;
          readAllTimer.current = setTimeout(attempt, delay);
        },
      );
    }
    attempt();
  }, [accountId, client, clubId]);

  useEffect(() => {
    let current = true;
    client.GET("/me/notifications", { params: { query: { page: 0, size: PAGE_SIZE } } }).then(
      ({ data }) => {
        if (!current) return;
        if (data === undefined) throw new TypeError("The feed response did not contain data");
        setFeed({ items: data.items, nextPage: 1, totalItems: data.totalItems });
        setStatus("ready");
        // Once per visit, after the first successful read (S11 §13-8); a load after a failed one
        // (a retry of the screen) sends it again.
        sendReadAll();
      },
      (cause: unknown) => {
        if (!current) return;
        setLoadError(cause);
        setStatus("error");
      },
    );
    return () => {
      current = false;
    };
  }, [attempt, client, sendReadAll]);

  const hasMore = feed !== undefined && feed.items.length < feed.totalItems;

  const loadMore = useCallback(() => {
    if (feed === undefined || more === "loading" || feed.items.length >= feed.totalItems) return;
    const page = feed.nextPage;
    setMore("loading");
    client.GET("/me/notifications", { params: { query: { page, size: PAGE_SIZE } } }).then(
      ({ data }) => {
        if (!mounted.current || data === undefined) return;
        setFeed((previous) => {
          if (previous === undefined) return previous;
          const items = merged(previous.items, data.items);
          // An empty page ends the list even when the total said otherwise.
          const totalItems = data.items.length === 0 ? items.length : data.totalItems;
          return { items, nextPage: page + 1, totalItems };
        });
        setMore("idle");
      },
      () => {
        if (mounted.current) setMore("error");
      },
    );
  }, [client, feed, more]);

  useEffect(() => {
    const node = sentinel.current;
    if (node === null || !hasMore || more !== "idle") return undefined;
    if (typeof IntersectionObserver === "undefined") {
      // A browser without IntersectionObserver reads the next page as soon as one lands.
      const timer = setTimeout(loadMore, 0);
      return () => {
        clearTimeout(timer);
      };
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) loadMore();
      },
      { rootMargin: "200px 0px" },
    );
    observer.observe(node);
    return () => {
      observer.disconnect();
    };
  }, [hasMore, loadMore, more]);

  /** A card tapped before the bulk read landed is marked read on its own (R-11-10). */
  const markRead = (item: MeNotification) => {
    if (readAll.current === "done" || item.readAt !== null) return;
    client
      .POST("/me/notifications/{id}/read", { params: { path: { id: item.id } } })
      .catch(() => undefined);
  };

  const claim = async (item: MeNotification, params: Record<string, string>) => {
    const { classSessionId, dogId, waitlistEntryId } = params;
    if (classSessionId === undefined || dogId === undefined || waitlistEntryId === undefined)
      return;
    markRead(item);
    setClaiming(item.id);
    setClaimError(undefined);
    try {
      // E5-W01's claim flow, unchanged: the hold of the entry's seat, then 06/29.
      await startClaim(client, classSessionId, dogId, waitlistEntryId);
    } catch (cause) {
      if (mounted.current) setClaimError({ id: item.id, message: errorText(t, cause) });
    } finally {
      if (mounted.current) setClaiming(undefined);
    }
  };

  const bar = (
    <AppBar className="notifications-page__bar" title={<h1>{t("notifications:title")}</h1>} />
  );

  if (status === "loading" && feed === undefined) {
    return (
      <section className="notifications-page">
        {bar}
        <Skeleton height="22rem" label={t("notifications:feed.loading")} />
      </section>
    );
  }
  if (status === "error" || feed === undefined) {
    return (
      <section className="notifications-page">
        {bar}
        <Toast tone="danger">{errorText(t, loadError)}</Toast>
        <p className="notifications-page__note">{t("notifications:feed.error")}</p>
        <Button
          onClick={() => {
            setStatus("loading");
            setAttempt((value) => value + 1);
          }}
          variant="secondary"
        >
          {t("notifications:feed.retry")}
        </Button>
      </section>
    );
  }
  if (feed.items.length === 0) {
    return (
      <section className="notifications-page">
        {bar}
        <Card className="notifications-page__empty">
          <Icon aria-hidden="true" name="bell" />
          <p>{t("notifications:feed.empty")}</p>
        </Card>
      </section>
    );
  }

  const smsModule = branding.modules.includes("SMS");
  // AGENTS rule 3, CATALEG_MODULS: the claim belongs to the waiting list. With WAITLIST off a
  // historical N-15 stays in the feed as an informative card, with no button.
  const waitlistModule = branding.modules.includes("WAITLIST");

  return (
    <section className="notifications-page">
      {bar}
      <ul aria-label={t("notifications:title")} className="notifications-list">
        {feed.items.map((item) => {
          const action = item.action ?? null;
          const href =
            action === null
              ? undefined
              : feedActionHref(action, { modules: branding.modules, staff });
          const time = formats.formatDayRelative(item.createdAt);
          // R-11-10: «i per SMS» only when an SMS reached the member; never the e-mail, and never
          // with SMS off (R-11-17).
          const meta =
            smsModule && item.channels.includes("SMS")
              ? t("notifications:feed.viaSms", { time })
              : time;
          const expired = waitlistModule && action?.type === "CLAIM_SEAT" && !action.enabled;
          const hintId = `notification-hint-${item.id}`;
          const open = (event: MouseEvent<HTMLAnchorElement>) => {
            if (href === undefined) return;
            event.preventDefault();
            markRead(item);
            navigateInApp(href);
          };
          let button = null;
          if (action?.type === "CHANGE_CLASS") {
            button = (
              <Button
                className="notification-card__action"
                disabled={!action.enabled}
                onClick={() => {
                  markRead(item);
                  navigateInApp(changeClassHref(action));
                }}
              >
                {t("notifications:feed.action.CHANGE_CLASS")}
              </Button>
            );
          } else if (
            action?.type === "CLAIM_SEAT" &&
            waitlistModule &&
            // R-11-11: the claim needs the three ids; without them there is nothing to press.
            [
              action.params.classSessionId,
              action.params.dogId,
              action.params.waitlistEntryId,
            ].every((value) => value !== undefined && value !== "")
          ) {
            button = (
              <Button
                aria-busy={claiming === item.id || undefined}
                aria-describedby={expired ? hintId : undefined}
                className="notification-card__action"
                disabled={!action.enabled || claiming !== undefined}
                onClick={() => {
                  void claim(item, action.params);
                }}
              >
                {t("notifications:feed.action.CLAIM_SEAT")}
              </Button>
            );
          }
          return (
            <li key={item.id}>
              <Card
                className={[
                  "notification-card",
                  `notification-card--${item.color.toLowerCase()}`,
                  item.readAt === null ? "notification-card--unread" : "",
                  href === undefined ? "" : "notification-card--link",
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                <div className="notification-card__head">
                  <Icon aria-hidden="true" className="notification-card__icon" name={item.icon} />
                  <h2 className="notification-card__title">
                    {href === undefined ? (
                      item.title
                    ) : (
                      <a className="notification-card__open" href={href} onClick={open}>
                        {item.title}
                      </a>
                    )}
                  </h2>
                  {item.readAt === null ? (
                    <span className="notification-card__unread">
                      <span className="ah-sr-only">{t("notifications:feed.unread")}</span>
                    </span>
                  ) : null}
                </div>
                <p className="notification-card__body">{item.body}</p>
                <div className="notification-card__foot">
                  <span className="notification-card__meta">{meta}</span>
                  {button}
                </div>
                {expired ? (
                  <p className="notification-card__hint" id={hintId}>
                    {t("notifications:feed.action.expired")}
                  </p>
                ) : null}
                {claimError?.id === item.id ? (
                  <p className="notification-card__error" role="alert">
                    {claimError.message}
                  </p>
                ) : null}
              </Card>
            </li>
          );
        })}
      </ul>
      {hasMore ? (
        <div className="notifications-page__more" ref={sentinel}>
          {more === "error" ? (
            <Button
              onClick={() => {
                setMore("idle");
              }}
              variant="secondary"
            >
              {t("notifications:feed.retry")}
            </Button>
          ) : (
            <Skeleton height="4rem" label={t("notifications:feed.loadingMore")} />
          )}
        </div>
      ) : null}
    </section>
  );
}
