import {
  type ApiClient,
  createPreferencesOutbox,
  createPreferencesSaver,
  isApiError,
  isEmptyPatch,
  type PreferencesPatch,
  type PreferencesSaverState,
  shownPreferences,
} from "@agilityhub/api-client";
import { Button, Card, Icon, Select, Skeleton, Switch } from "@agilityhub/ui";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import "./messaging.css";

type Category = "CLUB_CHANGES" | "CLUB_NEWS" | "OPERATIONAL" | "PERSONAL";

/** D10's rows (S11 §2), with the fourth `CLUB_NEWS` row of §13-2 (assumption B21). */
const CATEGORIES: readonly Category[] = ["OPERATIONAL", "PERSONAL", "CLUB_CHANGES", "CLUB_NEWS"];

/**
 * The changes a page left with (a reload, the browser's back, a full-page link), in this tab, for
 * the next visit of the same member's record to send again (E7-W01 round 2 #5). Only the partial
 * body: category switches, the reminder and the push switch, never personal data.
 */
export const PREFERENCES_OUTBOX_KEY = "agilityhub.memberPreferences.outbox.v1";

/**
 * D10 «Preferències d'avisos (mantenibles aquí i al perfil)» (S11 §2, R-11-04): the same matrix as
 * screen 12 with D10's own wording — the App tick always on, the e-mail per category («+SMS» fixed
 * on the club's changes while SMS is on), the class reminder and the push of the club's news while
 * PUSH is on — read from `GET /members/{id}/notification-preferences` (E7-W01 round 2 #4: a failed
 * read says so with a retry; the block never disappears). Each change shows at once and is saved
 * as a partial `PUT` 300 ms after the last one; a refused save puts back what the api holds and
 * says why. Leaving the page sends every unsaved change with `keepalive`, and the next visit of
 * this record sends it again (round 2 #5). Screen 12's saver owns the order of the writes: the
 * latest choice wins whatever fails (E7-W05 step 1). «Avisos enviats ›» opens this member's
 * notifications.
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
  // What the api holds, with the changes not yet confirmed (waiting or on their way) on top.
  const [saverState, setSaverState] = useState<PreferencesSaverState>();
  const { outbox, saver } = useMemo(() => {
    const kept = createPreferencesOutbox(PREFERENCES_OUTBOX_KEY, { memberId });
    return {
      outbox: kept,
      saver: createPreferencesSaver({
        changed: setSaverState,
        kept: (unsaved) => {
          if (unsaved === undefined) kept.clear();
          else kept.write(unsaved);
        },
        save: async (body, keepalive) =>
          (
            await client.PUT("/members/{id}/notification-preferences", {
              body,
              ...(keepalive ? { keepalive: true } : {}),
              params: { path: { id: memberId } },
            })
          ).data,
      }),
    };
  }, [client, memberId]);
  // The answers speak with this render's texts and callback: a save says so, and a refused change
  // goes back to what the api holds while the admin reads why.
  useEffect(() => {
    saver.listen({
      failed: (error) => {
        onFeedback({
          message: isApiError(error)
            ? t(`errors:${error.code}`, { defaultValue: t("admin-census:common.genericError") })
            : t("admin-census:common.genericError"),
          tone: "danger",
        });
      },
      saved: () => {
        onFeedback({ message: t("admin-census:member.feedback.preferences"), tone: "success" });
      },
    });
  }, [onFeedback, saver, t]);

  const change = (patch: PreferencesPatch) => {
    saver.edit(patch);
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
          saver.load(data);
          setStatus("ready");
          // A change the last visit left with is sent again (a partial PUT of the same values
          // changes nothing when it already arrived); it stays kept until that is saved.
          const kept = outbox.take();
          if (kept !== undefined) saver.adopt(kept);
        },
        () => {
          if (current) setStatus("error");
        },
      );
    return () => {
      current = false;
    };
  }, [attempt, client, memberId, outbox, saver]);

  // Leaving the record — another route of the app (unmount) or a full page load (`pagehide`: a
  // link, the browser's back, a reload) — sends everything unsaved, also the request on its way,
  // with `keepalive` so it outlives the page, and keeps it for the next visit to send again until
  // the latest choice is saved (E7-W04, E7-W05 step 1). Back from the back-forward cache
  // (`persisted`), the record saves as before, and what its departure kept and nothing confirmed
  // since goes again as a normal save once the request on its way settles (E7-W04 step 4).
  useEffect(() => {
    const leave = () => {
      saver.leave();
    };
    const restore = (event: PageTransitionEvent) => {
      if (event.persisted) saver.restore(outbox.take());
    };
    window.addEventListener("pagehide", leave);
    window.addEventListener("pageshow", restore);
    return () => {
      window.removeEventListener("pagehide", leave);
      window.removeEventListener("pageshow", restore);
      leave();
    };
  }, [outbox, saver]);

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
  const shown = saverState === undefined ? undefined : shownPreferences(saverState);
  if (status === "loading" || (status === "ready" && shown === undefined)) {
    return (
      <Card className="notification-preferences">
        {heading}
        <Skeleton height="12rem" label={t("admin-census:member.preferences.loading")} />
      </Card>
    );
  }
  if (status === "error" || shown === undefined) {
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
          const now = saver.state();
          const unsaved = now.inFlight !== undefined || !isEmptyPatch(now.queued);
          if (onNavigate === undefined && !unsaved) return;
          event.preventDefault();
          void saver.settle().then(() => {
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
