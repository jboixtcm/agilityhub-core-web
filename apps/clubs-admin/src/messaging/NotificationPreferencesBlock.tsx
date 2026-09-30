import { type ApiClient, type components, isApiError } from "@agilityhub/api-client";
import { Button, Card, Icon, Select, Skeleton, Switch } from "@agilityhub/ui";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import "./messaging.css";

type Preferences = components["schemas"]["NotificationPreferences"];
type Patch = components["schemas"]["NotificationPreferencesRequest"];
type Category = "CLUB_CHANGES" | "CLUB_NEWS" | "OPERATIONAL" | "PERSONAL";

/** D10's rows (S11 §2), with the fourth `CLUB_NEWS` row of §13-2 (assumption B21). */
const CATEGORIES: readonly Category[] = ["OPERATIONAL", "PERSONAL", "CLUB_CHANGES", "CLUB_NEWS"];

/**
 * The changes a page left with (a reload, the browser's back, a full-page link), in this tab, for
 * the next visit of the same member's record to send again (E7-W01 round 2 #5). Only the partial
 * body: category switches, the reminder and the push switch, never personal data.
 */
export const PREFERENCES_OUTBOX_KEY = "agilityhub.memberPreferences.outbox.v1";
/** A change older than this is not sent again (someone may have changed the preferences since). */
const OUTBOX_MAX_AGE_MS = 5 * 60_000;

interface OutboxEntry {
  at: number;
  memberId: string;
  patch: Patch;
}

function isEmpty(patch: Patch): boolean {
  return Object.keys(patch).length === 0;
}

function readOutbox(memberId: string): Patch | undefined {
  try {
    const entry = JSON.parse(
      sessionStorage.getItem(PREFERENCES_OUTBOX_KEY) ?? "null",
    ) as OutboxEntry | null;
    if (entry?.memberId !== memberId) return undefined;
    return Date.now() - entry.at <= OUTBOX_MAX_AGE_MS && !isEmpty(entry.patch)
      ? entry.patch
      : undefined;
  } catch {
    return undefined;
  }
}

function writeOutbox(memberId: string, patch: Patch): void {
  try {
    const entry: OutboxEntry = { at: Date.now(), memberId, patch };
    sessionStorage.setItem(PREFERENCES_OUTBOX_KEY, JSON.stringify(entry));
  } catch {
    // Without storage the keepalive request is the only way out.
  }
}

function clearOutbox(memberId: string): void {
  try {
    const entry = JSON.parse(
      sessionStorage.getItem(PREFERENCES_OUTBOX_KEY) ?? "null",
    ) as OutboxEntry | null;
    if (entry?.memberId === memberId) sessionStorage.removeItem(PREFERENCES_OUTBOX_KEY);
  } catch {
    // Nothing stored.
  }
}

function merged(base: Preferences, patch: Patch): Preferences {
  const emailByCategory = { ...base.emailByCategory };
  for (const category of CATEGORIES) {
    const value = patch.emailByCategory?.[category];
    if (value !== undefined && value !== null) emailByCategory[category] = value;
  }
  return {
    ...base,
    emailByCategory,
    ...(patch.pushClubNews === undefined || patch.pushClubNews === null
      ? {}
      : { pushClubNews: patch.pushClubNews }),
    ...(patch.reminderMinutesBefore === undefined
      ? {}
      : { reminderMinutesBefore: patch.reminderMinutesBefore }),
  };
}

function combined(first: Patch, second: Patch): Patch {
  return {
    ...first,
    ...second,
    ...(first.emailByCategory == null && second.emailByCategory == null
      ? {}
      : { emailByCategory: { ...first.emailByCategory, ...second.emailByCategory } }),
  };
}

/**
 * D10 «Preferències d'avisos (mantenibles aquí i al perfil)» (S11 §2, R-11-04): the same matrix as
 * screen 12 with D10's own wording — the App tick always on, the e-mail per category («+SMS» fixed
 * on the club's changes while SMS is on), the class reminder and the push of the club's news while
 * PUSH is on — read from `GET /members/{id}/notification-preferences` (E7-W01 round 2 #4: a failed
 * read says so with a retry; the block never disappears). Each change shows at once and is saved
 * as a partial `PUT` 300 ms after the last one; a refused save puts back what the api holds and
 * says why. Leaving the page sends every unsaved change with `keepalive`, and the next visit of
 * this record sends it again (round 2 #5). «Avisos enviats ›» opens this member's notifications.
 */
export function NotificationPreferencesBlock({
  client,
  memberId,
  onFeedback,
  onNavigate,
}: {
  client: ApiClient;
  memberId: string;
  onFeedback: (feedback: { message: string; tone: "danger" | "success" }) => void;
  onNavigate?: ((path: string) => void) | undefined;
}) {
  const { t } = useTranslation(["admin-census", "errors"]);
  const [status, setStatus] = useState<"error" | "loading" | "ready">("loading");
  const [attempt, setAttempt] = useState(0);
  // What the api holds, and the changes not yet confirmed (waiting or on their way).
  const [base, setBase] = useState<Preferences>();
  const [overlay, setOverlay] = useState<Patch>({});
  const waiting = useRef<Patch>({});
  const inFlight = useRef<Patch>(undefined);
  const sending = useRef<Promise<void>>(undefined);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const flushRef = useRef<() => Promise<void>>(() => Promise.resolve());
  // The page was left: the keepalive request and the outbox own what was unsaved.
  const left = useRef(false);

  const save = async (body: Patch) => {
    inFlight.current = body;
    try {
      const { data } = await client.PUT("/members/{id}/notification-preferences", {
        body,
        params: { path: { id: memberId } },
      });
      if (data === undefined) throw new TypeError("Preference response did not contain data");
      setBase(data);
      onFeedback({ message: t("admin-census:member.feedback.preferences"), tone: "success" });
    } catch (error) {
      // The refused change goes back to what the api holds; a later one still waits.
      onFeedback({
        message: isApiError(error)
          ? t(`errors:${error.code}`, { defaultValue: t("admin-census:common.genericError") })
          : t("admin-census:common.genericError"),
        tone: "danger",
      });
    } finally {
      inFlight.current = undefined;
      sending.current = undefined;
      setOverlay(waiting.current);
      if (left.current) {
        // Nothing more from here: the keepalive request and the outbox carry the rest.
      } else if (isEmpty(waiting.current)) {
        clearOutbox(memberId);
      } else {
        timer.current = setTimeout(() => {
          void flushRef.current();
        }, 300);
      }
    }
  };
  /** Sends what waits (one request at a time); resolves when the request on its way is answered. */
  const flush = () => {
    timer.current = undefined;
    if (sending.current !== undefined || isEmpty(waiting.current)) {
      return sending.current ?? Promise.resolve();
    }
    const body = waiting.current;
    waiting.current = {};
    const request = save(body);
    sending.current = request;
    return request;
  };
  // The timers call the latest `flush` (it closes over this render's props).
  useEffect(() => {
    flushRef.current = flush;
  });

  /** Sends at once what waits for the debounce, then waits until nothing is left unsaved. */
  const settle = async (): Promise<void> => {
    if (timer.current !== undefined) clearTimeout(timer.current);
    timer.current = undefined;
    if (sending.current === undefined && isEmpty(waiting.current)) return;
    await flushRef.current();
    await settle();
  };

  const change = (patch: Patch) => {
    waiting.current = combined(waiting.current, patch);
    setOverlay((current) => combined(current, patch));
    if (timer.current !== undefined) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      void flushRef.current();
    }, 300);
  };

  useEffect(() => {
    let current = true;
    client
      .GET("/members/{id}/notification-preferences", { params: { path: { id: memberId } } })
      .then(
        ({ data }) => {
          if (!current) return;
          if (data === undefined) {
            setStatus("error");
            return;
          }
          setBase(data);
          setStatus("ready");
          // A change the last visit left with is sent again (a partial PUT of the same values
          // changes nothing when it already arrived).
          const left = readOutbox(memberId);
          if (left !== undefined) change(left);
        },
        () => {
          if (current) setStatus("error");
        },
      );
    return () => {
      current = false;
    };
  }, [attempt, client, memberId]);

  // Leaving the record — another route of the app (unmount) or a full page load (`pagehide`: a
  // link, the browser's back, a reload) — sends everything unsaved, also the request on its way,
  // with `keepalive` so it outlives the page, and keeps it for the next visit to send again.
  useEffect(() => {
    const leave = () => {
      // Once: `pagehide` and the unmount that may follow it.
      if (left.current) return;
      if (timer.current !== undefined) clearTimeout(timer.current);
      timer.current = undefined;
      const unsaved = combined(inFlight.current ?? {}, waiting.current);
      if (isEmpty(unsaved)) return;
      left.current = true;
      waiting.current = {};
      writeOutbox(memberId, unsaved);
      void client
        .PUT("/members/{id}/notification-preferences", {
          body: unsaved,
          keepalive: true,
          params: { path: { id: memberId } },
        })
        .then(
          () => {
            // Answered while this page is still alive (another route of the app): done.
            clearOutbox(memberId);
          },
          () => undefined,
        );
    };
    window.addEventListener("pagehide", leave);
    return () => {
      window.removeEventListener("pagehide", leave);
      leave();
    };
  }, [client, memberId]);

  // D10's wording, not screen 12's (S11 §2).
  const categoryLabel = (category: Category) => {
    switch (category) {
      case "CLUB_CHANGES":
        return t("admin-census:member.preferences.club_changes");
      case "CLUB_NEWS":
        return t("admin-census:member.preferences.club_news");
      case "OPERATIONAL":
        return t("admin-census:member.preferences.operational");
      case "PERSONAL":
        return t("admin-census:member.preferences.personal");
    }
  };
  const reminderLabel = (minutes: number) =>
    minutes % 60 === 0
      ? t("admin-census:member.preferences.hoursBefore", { count: minutes / 60 })
      : t("admin-census:member.preferences.minutesBefore", { count: minutes });
  const logPath = `/notificacions?filter=${encodeURIComponent(`memberId:eq:${memberId}`)}`;

  const heading = (
    <h2 className="census-record__section-title">
      {t("admin-census:member.sections.preferences")}
    </h2>
  );
  if (status === "loading" || (status === "ready" && base === undefined)) {
    return (
      <Card className="notification-preferences">
        {heading}
        <Skeleton height="12rem" label={t("admin-census:member.preferences.loading")} />
      </Card>
    );
  }
  if (status === "error" || base === undefined) {
    return (
      <Card className="notification-preferences">
        {heading}
        <p className="messaging-editor__error" role="alert">
          {t("admin-census:member.preferences.loadError")}
        </p>
        <Button
          onClick={() => {
            setStatus("loading");
            setAttempt((value) => value + 1);
          }}
          variant="secondary"
        >
          {t("admin-census:member.preferences.retry")}
        </Button>
      </Card>
    );
  }

  const shown = merged(base, overlay);

  return (
    <Card className="notification-preferences">
      {heading}
      <div className="census-record__preferences-head">
        <span />
        <span>{t("admin-census:member.preferences.app")}</span>
        <span>{t("admin-census:member.preferences.email")}</span>
      </div>
      {CATEGORIES.map((category) => (
        <div className="census-record__preference-row" key={category}>
          <span>{categoryLabel(category)}</span>
          <Icon
            className="notification-preferences__app"
            name="check"
            title={t("admin-census:member.preferences.alwaysOn")}
          />
          <span className="census-record__preference-control">
            {category === "CLUB_CHANGES" && shown.modules.sms ? (
              <small>{t("admin-census:member.preferences.sms")}</small>
            ) : null}
            <Switch
              checked={shown.emailByCategory[category]}
              label={t("admin-census:member.preferences.emailToggle", {
                category: categoryLabel(category),
              })}
              onCheckedChange={(checked) => {
                change({ emailByCategory: { [category]: checked } });
              }}
            />
          </span>
        </div>
      ))}
      <div className="census-record__preference-row">
        <label htmlFor={`member-reminder-${memberId}`}>
          {t("admin-census:member.preferences.reminder")}
        </label>
        <Select
          className="notification-preferences__reminder"
          id={`member-reminder-${memberId}`}
          onChange={(event) => {
            const value = event.currentTarget.value;
            change({ reminderMinutesBefore: value === "" ? null : Number(value) });
          }}
          value={shown.reminderMinutesBefore ?? ""}
        >
          <option value="">{t("admin-census:member.preferences.never")}</option>
          {shown.reminderOptionsMinutes.map((minutes) => (
            <option key={minutes} value={minutes}>
              {reminderLabel(minutes)}
            </option>
          ))}
        </Select>
      </div>
      {shown.modules.push ? (
        <div className="census-record__preference-row">
          <span>{t("admin-census:member.preferences.push")}</span>
          <Switch
            checked={shown.pushClubNews}
            label={t("admin-census:member.preferences.push")}
            onCheckedChange={(checked) => {
              change({ pushClubNews: checked });
            }}
          />
          <span />
        </div>
      ) : null}
      <a
        className="notification-preferences__log"
        href={logPath}
        onClick={(event) => {
          // A change still waiting for its save is sent (and answered) before the log is opened.
          const pending = timer.current !== undefined || sending.current !== undefined;
          if (onNavigate === undefined && !pending) return;
          event.preventDefault();
          void settle().then(() => {
            if (onNavigate === undefined) window.location.assign(logPath);
            else onNavigate(logPath);
          });
        }}
      >
        {t("admin-census:member.preferences.sentLink")}
      </a>
    </Card>
  );
}
