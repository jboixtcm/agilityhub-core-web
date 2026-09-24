import type { ApiClient } from "@agilityhub/api-client";
import { useClubFormats } from "@agilityhub/i18n";
import { Badge, Card, Icon, useBranding } from "@agilityhub/ui";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

import "./activities.css";
import { type ActivityRegistrationSummary, localHours, useMeActivities } from "./shared";

/**
 * Activity row of screen 03 «Les meves reserves» (S07 §2, R-07-11): «{title}» + «inscrita» /
 * «en llista d'espera», then «{Dissabte 7} · {18:30–20:30} · {placeLabel}» — never a dog
 * (§13-7). › opens the activity detail.
 */
export function ActivityReservationRow({
  registration,
}: {
  registration: ActivityRegistrationSummary;
}) {
  const formats = useClubFormats();
  const { t } = useTranslation(["activities", "enums"]);
  const { activity } = registration;
  const { end, start } = localHours(activity.startsAtLocal, activity.endsAtLocal);
  return (
    <Card className="activity-row activity-row--reservation">
      <a
        className="activity-row__body activity-row__body--two-lines"
        href={`/activitats/${activity.id}`}
      >
        <span className="activity-row__line">
          <Icon aria-hidden="true" className="activity-row__icon" name="flag" />
          <strong className="activity-row__title">{activity.title}</strong>
          <Badge tone={registration.state === "WAITLISTED" ? "warning" : "success"}>
            {t(`enums:activityRegistrationState.${registration.state}`)}
          </Badge>
        </span>
        <span className="activity-row__line activity-row__line--muted">
          <span>
            {t("activities:rows.when", {
              date: formats.formatActivityDate(activity.startsAtLocal, start, end, "day"),
              place: activity.placeLabel,
            })}
          </span>
          <Icon aria-hidden="true" className="activity-row__chevron" name="chev" />
        </span>
      </a>
    </Card>
  );
}

/**
 * Provisional `/inici` (screen 03): the «Les meves reserves» section with only the live
 * activity registrations (`mine[]` with `endsAtLocal` after now). E5 (S08) replaces the page
 * and keeps `ActivityReservationRow`; without rows the shell placeholder stays.
 */
export function HomeActivityReservations({
  client,
  fallback,
}: {
  client: ApiClient;
  fallback: ReactNode;
}) {
  const branding = useBranding();
  const enabled = branding.modules.includes("ACTIVITIES");
  const activities = useMeActivities(client, enabled);
  if (!enabled || activities.status !== "ready") return fallback;
  const now = clubNow(branding.timeZone);
  const live = activities.data.mine.filter(
    (registration) =>
      (registration.state === "ACTIVE" || registration.state === "WAITLISTED") &&
      registration.activity.endsAtLocal > now,
  );
  return live.length === 0 ? fallback : <ReservationsSection registrations={live} />;
}

function ReservationsSection({
  registrations: live,
}: {
  registrations: ActivityRegistrationSummary[];
}) {
  const { t } = useTranslation("activities");
  return (
    <section aria-labelledby="home-reservations-title" className="activities-screen">
      <h2 className="activities-block__title" id="home-reservations-title">
        {t("activities:rows.sectionTitle")}
      </h2>
      {live.map((registration) => (
        <ActivityReservationRow key={registration.id} registration={registration} />
      ))}
    </section>
  );
}

/** Club-local «YYYY-MM-DDTHH:mm» of now, comparable with `endsAtLocal`. */
function clubNow(timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
    minute: "2-digit",
    month: "2-digit",
    timeZone,
    year: "numeric",
  }).formatToParts(new Date());
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? "00";
  return `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}`;
}
