import { type ApiClient, type components, isApiError } from "@agilityhub/api-client";
import { Card, Icon, Select, Switch } from "@agilityhub/ui";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import "./messaging.css";

type Preferences = components["schemas"]["NotificationPreferences"];
type Patch = components["schemas"]["NotificationPreferencesRequest"];
type Category = "CLUB_CHANGES" | "CLUB_NEWS" | "OPERATIONAL" | "PERSONAL";

/** D10's rows (S11 §2), with the fourth `CLUB_NEWS` row of §13-2 (assumption B21). */
const CATEGORIES: readonly Category[] = ["OPERATIONAL", "PERSONAL", "CLUB_CHANGES", "CLUB_NEWS"];

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
 * PUSH is on. Each change shows at once and is saved as a partial `PUT` 300 ms after the last one;
 * a refused save puts back what the api holds and says why. «Avisos enviats ›» opens this member's
 * notifications in the log.
 */
export function NotificationPreferencesBlock({
  client,
  memberId,
  onFeedback,
  onNavigate,
  onSaved,
  preferences,
}: {
  client: ApiClient;
  memberId: string;
  onFeedback: (feedback: { message: string; tone: "danger" | "success" }) => void;
  onNavigate?: ((path: string) => void) | undefined;
  onSaved: (preferences: Preferences) => void;
  preferences: Preferences;
}) {
  const { t } = useTranslation(["admin-census", "errors"]);
  // What the api holds, and the changes not yet confirmed (waiting or on their way).
  const [base, setBase] = useState(preferences);
  const [overlay, setOverlay] = useState<Patch>({});
  const waiting = useRef<Patch>({});
  const sending = useRef<Promise<void>>(undefined);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const flushRef = useRef<() => Promise<void>>(() => Promise.resolve());

  const save = async (body: Patch) => {
    try {
      const { data } = await client.PUT("/members/{id}/notification-preferences", {
        body,
        params: { path: { id: memberId } },
      });
      if (data === undefined) throw new TypeError("Preference response did not contain data");
      setBase(data);
      onSaved(data);
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
      sending.current = undefined;
      setOverlay(waiting.current);
      if (Object.keys(waiting.current).length > 0) {
        timer.current = setTimeout(() => {
          void flushRef.current();
        }, 300);
      }
    }
  };
  /** Sends what waits (one request at a time); resolves when the request on its way is answered. */
  const flush = () => {
    timer.current = undefined;
    if (sending.current !== undefined || Object.keys(waiting.current).length === 0) {
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
    if (sending.current === undefined && Object.keys(waiting.current).length === 0) return;
    await flushRef.current();
    await settle();
  };

  // Leaving the record sends what is still waiting: another route of the app (unmount) or a full
  // page load, which is how D10's links navigate (`pagehide`, the request leaves before the page).
  useEffect(() => {
    const leave = () => {
      if (timer.current === undefined) return;
      clearTimeout(timer.current);
      void flushRef.current();
    };
    window.addEventListener("pagehide", leave);
    return () => {
      window.removeEventListener("pagehide", leave);
      leave();
    };
  }, []);

  const change = (patch: Patch) => {
    waiting.current = combined(waiting.current, patch);
    setOverlay((current) => combined(current, patch));
    if (timer.current !== undefined) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      void flushRef.current();
    }, 300);
  };

  const shown = merged(base, overlay);
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

  return (
    <Card className="notification-preferences">
      <h2 className="census-record__section-title">
        {t("admin-census:member.sections.preferences")}
      </h2>
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
