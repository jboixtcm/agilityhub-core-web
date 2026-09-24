import { useClubFormats } from "@agilityhub/i18n";
import { Badge, Card, type Tone } from "@agilityhub/ui";
import { useTranslation } from "react-i18next";

import "./activities.css";
import type { ActivityRegistrationSummary, ActivityState } from "./shared";

type HistoryState = "CANCELLED" | "CANCELLED_BY_CLUB" | "DONE";

const tones: Readonly<Record<HistoryState, Tone>> = {
  CANCELLED: "neutral",
  CANCELLED_BY_CLUB: "danger",
  DONE: "success",
};

/**
 * R-07-11 `historyRowsFor`: an `ACTIVE` registration of a `FINISHED` activity is «feta»; one
 * cancelled with the activity is «cancel·lada pel club»; any other cancellation «anul·lada».
 * Waitlisted and upcoming registrations are not history rows.
 */
export function historyState(
  registration: ActivityRegistrationSummary,
  activityState: ActivityState,
): HistoryState | undefined {
  if (registration.state === "CANCELLED") {
    return registration.cancellation?.reason === "ACTIVITY_CANCELLED"
      ? "CANCELLED_BY_CLUB"
      : "CANCELLED";
  }
  return registration.state === "ACTIVE" && activityState === "FINISHED" ? "DONE" : undefined;
}

/**
 * Activity row of screen 25 (S07 §2; the page and `/me/history` are S10/E6): «{ds 12/07}» +
 * «{title}» + «feta» / «anul·lada» / «cancel·lada pel club» and, for the latter, the club's
 * notice between quotes. Never a dog (§13-7).
 */
export function ActivityHistoryRow({
  activityState,
  adminText,
  registration,
}: {
  activityState: ActivityState;
  adminText?: string | null;
  registration: ActivityRegistrationSummary;
}) {
  const formats = useClubFormats();
  const { t } = useTranslation(["activities", "enums"]);
  const state = historyState(registration, activityState);
  if (state === undefined) return null;
  const { activity } = registration;
  return (
    <Card className="activity-history-row">
      <div className="activity-history-row__line">
        <span className="activity-history-row__date">
          {formats.formatActivityDate(activity.startsAtLocal, null, null, "history")}
        </span>
        <span className="activity-history-row__title">{activity.title}</span>
        <Badge tone={tones[state]}>{t(`enums:activityRegistrationState.${state}`)}</Badge>
      </div>
      {state === "CANCELLED_BY_CLUB" &&
      adminText !== null &&
      adminText !== undefined &&
      adminText !== "" ? (
        <p className="activity-history-row__note">
          {t("activities:rows.adminText", { text: adminText })}
        </p>
      ) : null}
    </Card>
  );
}
