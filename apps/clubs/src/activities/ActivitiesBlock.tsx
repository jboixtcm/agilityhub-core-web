import { type ApiClient, isApiError } from "@agilityhub/api-client";
import { useClubFormats } from "@agilityhub/i18n";
import { AppBar, Badge, Button, Card, Icon, Skeleton, useBranding } from "@agilityhub/ui";
import { useTranslation } from "react-i18next";

import "./activities.css";
import { type ActivityRow, useMeActivities } from "./shared";

function RowBadge({ row }: { row: ActivityRow }) {
  const { t } = useTranslation("activities");
  switch (row.rowState) {
    case "OPEN":
      return (
        <Badge tone="success">
          {row.freeSeats === null || row.freeSeats === undefined
            ? t("activities:list.open")
            : t("activities:list.freeSeats", { count: row.freeSeats })}
        </Badge>
      );
    case "FULL_WAITLIST":
      return (
        <Badge className="activity-badge--nowrap" tone="danger">
          {t("activities:list.fullWaitlist", { waiting: row.waiting })}
        </Badge>
      );
    case "FULL":
      return (
        <Badge className="activity-badge--nowrap" tone="danger">
          {t("activities:list.full")}
        </Badge>
      );
    default:
      return null;
  }
}

/**
 * One row of the 04 block: «{title} · {ds 12/09} · {9:00}» + the R-07-11 badge. The hours are the
 * row's `startTime` (R-07-13; the mockup prints only the start there): `null` prints none, so a
 * date-only activity never reads «0:00».
 */
export function ActivityBlockRow({ row }: { row: ActivityRow }) {
  const formats = useClubFormats();
  const { t } = useTranslation("activities");
  const inert = row.rowState === "FULL" || row.rowState === "NOT_BOOKABLE";
  const content = (
    <>
      <Icon aria-hidden="true" className="activity-row__icon" name="flag" />
      <span className="activity-row__text">
        <strong>{row.title}</strong>
        {t("activities:block.separator")}
        {formats.formatActivityDate(row.startsAtLocal.slice(0, 10), row.startTime, null, "list")}
      </span>
      <RowBadge row={row} />
    </>
  );
  return (
    <Card className={inert ? "activity-row activity-row--inert" : "activity-row"}>
      {inert ? (
        <div aria-disabled="true" className="activity-row__body">
          {content}
        </div>
      ) : (
        <a className="activity-row__body" href={`/activitats/${row.id}`}>
          {content}
          <Icon aria-hidden="true" className="activity-row__chevron" name="chev" />
        </a>
      )}
    </Card>
  );
}

/**
 * Block «Activitats» of screen 04 (S07 §2, R-07-11): `GET /me/activities` → `bookable[]`.
 * Absent without `ACTIVITIES` or without an open activity. E5 adds the selected dog (§13-6).
 */
export function ActivitiesBlock({ client }: { client: ApiClient }) {
  const branding = useBranding();
  const { t } = useTranslation("activities");
  const enabled = branding.modules.includes("ACTIVITIES");
  const activities = useMeActivities(client, enabled);
  if (!enabled) return null;
  if (activities.status === "error") {
    // Only a disabled module hides the block quietly; any other failure offers a retry.
    if (isApiError(activities.error, "MODULE_DISABLED")) return null;
    return (
      <section aria-labelledby="activities-block-title" className="activities-block">
        <h2 className="activities-block__title" id="activities-block-title">
          {t("activities:block.title")}
        </h2>
        <Card className="activity-detail__error" role="alert">
          <p>{t("activities:block.error")}</p>
          <Button onClick={activities.refetch} variant="secondary">
            {t("activities:block.retry")}
          </Button>
        </Card>
      </section>
    );
  }
  if (activities.status === "loading") {
    return <Skeleton height="2.75rem" label={t("activities:block.loading")} />;
  }
  if (activities.data.bookable.length === 0) return null;
  return (
    <section aria-labelledby="activities-block-title" className="activities-block">
      <h2 className="activities-block__title" id="activities-block-title">
        {t("activities:block.title")}
      </h2>
      {activities.data.bookable.map((row) => (
        <ActivityBlockRow key={row.id} row={row} />
      ))}
    </section>
  );
}

/**
 * Provisional `/reservar` (screen 04): the mockup's app bar and intro with the activities
 * block. E5 (S08) owns the page (dog chips, pack, classes) and keeps this block.
 */
export function ReserveActivitiesPage({ client }: { client: ApiClient }) {
  const { t } = useTranslation(["activities", "shell"]);
  return (
    <section className="activities-screen">
      <AppBar className="activities-screen__bar" title={<h1>{t("shell:nav.reserve")}</h1>} />
      <p className="activities-screen__intro">{t("activities:block.intro")}</p>
      <ActivitiesBlock client={client} />
    </section>
  );
}
