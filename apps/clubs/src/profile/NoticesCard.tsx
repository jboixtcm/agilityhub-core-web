import {
  type ApiClient,
  createPreferencesOutbox,
  createPreferencesSaver,
  isApiError,
  type PreferencesSaverState,
  shownPreferences,
} from "@agilityhub/api-client";
import { useSession } from "@agilityhub/auth";
import { Button, Card, Icon, Select, Skeleton, Switch, Toast, useBranding } from "@agilityhub/ui";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { errorText } from "../booking/shared";
import { pushPermission, pushSupport, subscribeToPush } from "../notifications/push";

import { type Category, type Edits, NOTICES_OUTBOX_KEY } from "./preferences-saver";

/**
 * Screen 12's «Avisos» block (S11 §2 row 12, R-11-04, R-11-07, R-11-17), driven by
 * `GET /me/notification-preferences`: the fixed green tick under «App», an e-mail switch per
 * category (the fourth row «Comunicats del club», S11 §13-2), the fixed «+SMS», the reminder
 * select and the push switch. Every change shows at once and is saved as a partial `PUT`
 * (debounced 300 ms, rolled back with a message on failure). Turning push on, or a reminder other
 * than «Mai», asks for the browser's permission in context (never at start-up).
 */
export function NoticesCard({ client }: { client: ApiClient }) {
  const { t } = useTranslation(["auth", "errors"]);
  const branding = useBranding();
  const session = useSession();
  const impersonated = session.me?.impersonation !== undefined;
  // S11 §6: the member's own preferences (an impersonation token acts as her); staff without the
  // MEMBER role have none (403).
  const reader = session.roles.includes("MEMBER") || impersonated;
  const [status, setStatus] = useState<"error" | "loading" | "ready">("loading");
  const [attempt, setAttempt] = useState(0);
  const [saverState, setSaverState] = useState<PreferencesSaverState>();
  const [failure, setFailure] = useState<{ cause: unknown }>();
  const [support] = useState(pushSupport);
  // R-11-07: a permission the browser already refused is read at mount (never asked) so the row
  // explains it on arrival; an in-context request updates it (E7-W02 round 2 #5). An impersonated
  // session never asks for push, so the admin's own browser is never explained (E7-W05 step 6).
  const [pushDenied, setPushDenied] = useState(
    () => support === "supported" && !impersonated && pushPermission() === "denied",
  );
  const mounted = useRef(true);
  // The account and club a change belongs to (a change kept across a reload is sent again for them
  // only, E7-W02 round 2 #1); each visit owns its own entry (E7-W02 review #4).
  const accountId = session.me?.account.id ?? "";
  const clubId = session.me?.membership?.clubId ?? "";
  const { outbox, saver } = useMemo(() => {
    const kept = createPreferencesOutbox(NOTICES_OUTBOX_KEY, { accountId, clubId });
    return {
      outbox: kept,
      saver: createPreferencesSaver({
        changed: setSaverState,
        failed: (cause) => {
          setFailure({ cause });
        },
        kept: (unsaved) => {
          if (unsaved === undefined) kept.clear();
          else kept.write(unsaved);
        },
        save: async (body, keepalive) =>
          (
            await client.PUT("/me/notification-preferences", {
              body,
              ...(keepalive ? { keepalive: true } : {}),
            })
          ).data,
      }),
    };
  }, [accountId, client, clubId]);

  useEffect(() => {
    mounted.current = true;
    // Leaving the page (another route: the unmount; a full navigation or a reload: `pagehide`)
    // sends every unsaved change at once, the one on its way included (R-11-04).
    const leave = () => {
      saver.leave();
    };
    // Back from the back-forward cache (`persisted`): 12 saves again, and what its departure kept
    // and nothing confirmed since goes again as a normal change (E7-W05 step 2).
    const restore = (event: PageTransitionEvent) => {
      if (event.persisted) saver.restore(outbox.take());
    };
    window.addEventListener("pagehide", leave);
    window.addEventListener("pageshow", restore);
    return () => {
      mounted.current = false;
      window.removeEventListener("pagehide", leave);
      window.removeEventListener("pageshow", restore);
      leave();
    };
  }, [outbox, saver]);

  useEffect(() => {
    if (!reader) return undefined;
    let current = true;
    client.GET("/me/notification-preferences").then(
      ({ data }) => {
        if (!current || data === undefined) return;
        saver.load(data);
        setStatus("ready");
        // What the last visit of this account and club left unsaved is sent again (a partial PUT
        // of values the api already has changes nothing); it stays kept until that is saved.
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
  }, [attempt, client, outbox, reader, saver]);

  if (!reader) return null;

  const title = (
    <div className="profile-notices__header">
      <h2>{t("auth:profile.notices")}</h2>
      <small>{t("auth:profile.appChannel")}</small>
      <small>{t("auth:profile.emailChannel")}</small>
    </div>
  );

  const shown = saverState === undefined ? undefined : shownPreferences(saverState);
  if (status === "error") {
    return (
      <Card className="profile-notices" id="avisos">
        {title}
        <p className="profile-notices__note" role="alert">
          {t("auth:profile.noticesError")}
        </p>
        <Button
          onClick={() => {
            setStatus("loading");
            setAttempt((value) => value + 1);
          }}
          variant="secondary"
        >
          {t("auth:profile.retry")}
        </Button>
      </Card>
    );
  }
  if (status === "loading" || saverState === undefined || shown === undefined) {
    return (
      <Card className="profile-notices" id="avisos">
        {title}
        <Skeleton height="10rem" label={t("auth:profile.noticesLoading")} />
      </Card>
    );
  }

  const saving = saverState.inFlight !== undefined || saverState.waiting;
  const pushRow = shown.modules.push && support !== "unsupported";

  const change = (edits: Edits) => {
    setFailure(undefined);
    saver.edit(edits);
  };

  /** R-11-07: in context only, after the member asked for push; the preference is saved anyway. */
  const askForPush = () => {
    if (!pushRow || support !== "supported" || impersonated) return;
    void subscribeToPush(client, branding.pushPublicKey).then((outcome) => {
      if (!mounted.current) return;
      // Refused or dismissed: the member asked for push and the browser did not turn it on.
      if (outcome === "denied" || outcome === "dismissed") setPushDenied(true);
      if (outcome === "subscribed") setPushDenied(false);
    });
  };

  const rows: { category: Category; label: string }[] = [
    { category: "OPERATIONAL", label: t("auth:profile.operationalNotices") },
    { category: "PERSONAL", label: t("auth:profile.personalNotices") },
    { category: "CLUB_CHANGES", label: t("auth:profile.clubChanges") },
    { category: "CLUB_NEWS", label: t("auth:profile.clubNews") },
  ];
  const reminderLabel = (minutes: number) =>
    minutes % 60 === 0
      ? t("auth:profile.reminder.hours", { hours: minutes / 60 })
      : t("auth:profile.reminder.minutes", { minutes });
  const reminder = shown.reminderMinutesBefore ?? null;

  return (
    <Card aria-busy={saving || undefined} className="profile-notices" id="avisos">
      {title}
      {rows.map(({ category, label }) => (
        <div className="profile-notices__row" key={category}>
          <span>{label}</span>
          {category === "CLUB_CHANGES" && shown.modules.sms && shown.smsFixed ? (
            <span className="profile-notices__app-state">
              <Icon name="check" title={t("auth:profile.appAlwaysOn")} />
              <small>{t("auth:profile.smsIncluded")}</small>
            </span>
          ) : (
            // The fixed tick under «App» (APP is never removable): an image, never a control.
            <Icon name="check" title={t("auth:profile.appAlwaysOn")} />
          )}
          <Switch
            checked={shown.emailByCategory[category]}
            className="profile-notices__switch"
            label={t("auth:profile.emailFor", { category: label })}
            onCheckedChange={(checked) => {
              change({ emailByCategory: { [category]: checked } });
            }}
          />
        </div>
      ))}
      <div className="profile-notices__reminder">
        <label htmlFor="profile-reminder">{t("auth:profile.classReminder")}</label>
        <Select
          id="profile-reminder"
          onChange={(event) => {
            const value = event.currentTarget.value;
            const minutes = value === "" ? null : Number(value);
            change({ reminderMinutesBefore: minutes });
            if (minutes !== null) askForPush();
          }}
          value={reminder === null ? "" : String(reminder)}
        >
          <option value="">{t("auth:profile.reminder.never")}</option>
          {shown.reminderOptionsMinutes.map((minutes) => (
            <option key={minutes} value={String(minutes)}>
              {reminderLabel(minutes)}
            </option>
          ))}
        </Select>
      </div>
      {pushRow ? (
        <div className="profile-notices__mobile">
          <div className="profile-notices__mobile-row">
            <span>{t("auth:profile.mobileNotices")}</span>
            <Switch
              checked={shown.pushClubNews}
              className="profile-notices__switch"
              label={t("auth:profile.mobileNotices")}
              onCheckedChange={(checked) => {
                change({ pushClubNews: checked });
                if (checked) askForPush();
              }}
            />
          </div>
          {support === "ios-install" ? (
            <p className="profile-notices__note">
              {t("auth:profile.iosInstall")}
              <br />
              <strong>{t("auth:profile.iosSteps")}</strong>
            </p>
          ) : pushDenied && !impersonated && (shown.pushClubNews || reminder !== null) ? (
            <p className="profile-notices__note" role="status">
              {t("auth:profile.pushDenied")}
            </p>
          ) : null}
        </div>
      ) : null}
      {saving ? (
        <p className="profile-notices__saving" role="status">
          {t("auth:profile.saving")}
        </p>
      ) : null}
      {failure === undefined ? null : (
        <Toast
          dismissLabel={t("auth:profile.close")}
          onDismiss={() => {
            setFailure(undefined);
          }}
          tone="danger"
        >
          {isApiError(failure.cause, "INVALID_REMINDER_OPTION")
            ? t("auth:profile.reminder.invalid")
            : errorText(t, failure.cause)}
        </Toast>
      )}
    </Card>
  );
}
