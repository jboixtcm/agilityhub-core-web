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
  // The `PUT`s on their way, oldest first (one at a time while the page is open; the departure's
  // may join one still travelling).
  const pending = useRef<{ body: Patch; done: Promise<void>; seq: number }[]>([]);
  const sequence = useRef(0);
  // The newest request the api accepted, and the newest one it answered at all.
  const applied = useRef(0);
  const settled = useRef(0);
  // The newest body sent (it carries every change made so far), and whether it went again.
  const newest = useRef<{ body: Patch; resent: boolean; seq: number }>(undefined);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const flushRef = useRef<() => Promise<void>>(() => Promise.resolve());
  const sendRef = useRef<(body: Patch, keepalive: boolean) => Promise<void>>(() =>
    Promise.resolve(),
  );
  // The page was left: the keepalive request and the outbox own what was unsaved.
  const left = useRef(false);

  const pendingPatch = () =>
    pending.current.reduce<Patch>((all, sent) => combined(all, sent.body), {});

  /**
   * One `PUT` (R-11-04). The answer of the newest request so far is the api's state. An older
   * request answered after a newer one may have landed last, over the newer values: the newest body
   * goes again, once (E7-W04). The outbox is dropped only when nothing is unsaved any more and the
   * newest body was answered — never while an older request can still land after it.
   */
  const send = (body: Patch, keepalive: boolean, resend = false): Promise<void> => {
    sequence.current += 1;
    const seq = sequence.current;
    if (!resend) newest.current = { body, resent: false, seq };
    const done = (async () => {
      try {
        const { data } = await client.PUT("/members/{id}/notification-preferences", {
          body,
          ...(keepalive ? { keepalive: true } : {}),
          params: { path: { id: memberId } },
        });
        if (data === undefined) throw new TypeError("Preference response did not contain data");
        settled.current = Math.max(settled.current, seq);
        if (seq > applied.current) {
          applied.current = seq;
          setBase(data);
          if (!left.current) {
            onFeedback({ message: t("admin-census:member.feedback.preferences"), tone: "success" });
          }
        } else if (
          newest.current !== undefined &&
          !newest.current.resent &&
          newest.current.seq > seq
        ) {
          newest.current.resent = true;
          void send(newest.current.body, left.current, true);
        }
      } catch (error) {
        // An answer (a refusal) settles the request; no answer leaves it for the outbox.
        if (isApiError(error) && error.status !== 0) {
          settled.current = Math.max(settled.current, seq);
        }
        // The refused change goes back to what the api holds; a later one still waits.
        if (!left.current) {
          onFeedback({
            message: isApiError(error)
              ? t(`errors:${error.code}`, { defaultValue: t("admin-census:common.genericError") })
              : t("admin-census:common.genericError"),
            tone: "danger",
          });
        }
      } finally {
        pending.current = pending.current.filter((sent) => sent.seq !== seq);
        setOverlay(combined(pendingPatch(), waiting.current));
        const nothingLeft = pending.current.length === 0 && isEmpty(waiting.current);
        if (nothingLeft && settled.current >= (newest.current?.seq ?? 0)) clearOutbox(memberId);
        if (
          !left.current &&
          pending.current.length === 0 &&
          !isEmpty(waiting.current) &&
          timer.current === undefined
        ) {
          timer.current = setTimeout(() => {
            void flushRef.current();
          }, 300);
        }
      }
    })();
    pending.current = [...pending.current, { body, done, seq }];
    return done;
  };
  /** Sends what waits (one request at a time); resolves when the requests on their way answer. */
  const flush = () => {
    timer.current = undefined;
    if (pending.current.length > 0 || isEmpty(waiting.current)) {
      return Promise.all(pending.current.map((sent) => sent.done)).then(() => undefined);
    }
    const body = waiting.current;
    waiting.current = {};
    return send(body, false);
  };
  // The timers and the departure call the latest `flush` and `send` (this render's props).
  useEffect(() => {
    flushRef.current = flush;
    sendRef.current = send;
  });

  /** Sends at once what waits for the debounce, then waits until nothing is left unsaved. */
  const settle = async (): Promise<void> => {
    if (timer.current !== undefined) clearTimeout(timer.current);
    timer.current = undefined;
    if (pending.current.length === 0 && isEmpty(waiting.current)) return;
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
  // with `keepalive` so it outlives the page, and keeps it for the next visit to send again. The
  // request on its way may still land after it: `send` then sends the newest body again, and the
  // outbox stays until that is answered (E7-W04).
  useEffect(() => {
    const leave = () => {
      // Once: `pagehide` and the unmount that may follow it.
      if (left.current) return;
      if (timer.current !== undefined) clearTimeout(timer.current);
      timer.current = undefined;
      const unsaved = combined(pendingPatch(), waiting.current);
      if (isEmpty(unsaved)) return;
      left.current = true;
      waiting.current = {};
      writeOutbox(memberId, unsaved);
      void sendRef.current(unsaved, true);
    };
    // Back from the back-forward cache (`persisted`): the page lives again and saves as before.
    // What its departure kept and nobody confirmed meanwhile goes again as a normal save (E7-W04).
    const restore = (event: PageTransitionEvent) => {
      if (!event.persisted || !left.current) return;
      left.current = false;
      const kept = readOutbox(memberId);
      if (kept !== undefined) change(kept);
    };
    window.addEventListener("pagehide", leave);
    window.addEventListener("pageshow", restore);
    return () => {
      window.removeEventListener("pagehide", leave);
      window.removeEventListener("pageshow", restore);
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
          const unsaved = timer.current !== undefined || pending.current.length > 0;
          if (onNavigate === undefined && !unsaved) return;
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
