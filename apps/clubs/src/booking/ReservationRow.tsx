import { useClubFormats } from "@agilityhub/i18n";
import { Badge, Card, Icon, useBranding } from "@agilityhub/ui";
import { useTranslation } from "react-i18next";

import { localParts, type ReservationRowData } from "./shared";

/** The row's link: 07 for a class, the waiting entry's detail, none for a training yet (E5-W02). */
function href(row: ReservationRowData, waitlist: boolean): string | undefined {
  if (row.type === "CLASS") return `/reserves/${encodeURIComponent(row.id)}`;
  if (row.type === "CLASS_WAITLIST" && waitlist) return `/espera/${encodeURIComponent(row.id)}`;
  // TRAINING: `/entrenaments/{id}` belongs to E5-W02 (S09); until then the row is not a link.
  return undefined;
}

/**
 * «{hours} h» before the class the instructor appears (R-08-20), derived from the api's
 * `instructorVisibleAt` only to pick the ICU branch («el dia abans» for 24 h).
 */
function hiddenHours(row: ReservationRowData): number | undefined {
  if (row.instructorVisibleAt === null || row.instructorVisibleAt === undefined) return undefined;
  if (row.startsAt === null || row.startsAt === undefined) return undefined;
  return (Date.parse(row.startsAt) - Date.parse(row.instructorVisibleAt)) / 3_600_000;
}

/**
 * A row of «Les meves reserves» (03, S08 §2) for a class, a waiting entry or a training, as the
 * api delivers it: «{title}[ · amb {dog}]» + the state badge, then «{Dilluns 3} · {18:50–19:50} ·
 * {ring}» and the instructor (or when it shows) or the waiting notice. The dog only in «Tots»
 * (`dogName` is `null` when a dog is selected) and with more than one dog (`showDog`, V3).
 */
export function ReservationRow({ row, showDog }: { row: ReservationRowData; showDog: boolean }) {
  const { t } = useTranslation(["home", "enums"]);
  const formats = useClubFormats();
  const branding = useBranding();
  const start = localParts(row.startsAtLocal);
  const end =
    row.endsAtLocal === null || row.endsAtLocal === undefined
      ? null
      : localParts(row.endsAtLocal).time;
  const when = formats.formatActivityDate(start.date, start.time, end, "day");
  const place =
    row.ringName === null || row.ringName === undefined || row.ringName === ""
      ? when
      : t("home:reservations.join", { first: when, second: row.ringName });
  let extra: string | undefined;
  if (row.type === "CLASS_WAITLIST") extra = t("home:reservations.waitlistNotice");
  else if (row.type === "CLASS") {
    const hours = hiddenHours(row);
    extra =
      row.instructorName !== null && row.instructorName !== undefined && row.instructorName !== ""
        ? row.instructorName
        : hours === undefined
          ? undefined
          : t("home:reservations.instructorHidden", { hours });
  }
  const second =
    extra === undefined ? place : t("home:reservations.join", { first: place, second: extra });
  const title =
    !showDog || row.dogName === null || row.dogName === undefined
      ? row.title
      : t("home:reservations.withDog", { dogName: row.dogName, title: row.title });
  const link = href(row, branding.modules.includes("WAITLIST"));
  const tone = row.state === "CONFIRMED" ? "success" : "warning";
  const content = (
    <>
      <span className="reservation-row__line">
        <strong className="reservation-row__title">{title}</strong>
        <Badge className="reservation-row__badge" tone={tone}>
          {t(`enums:reservationState.${row.state}`)}
        </Badge>
      </span>
      <span className="reservation-row__line reservation-row__line--muted">
        <span>{second}</span>
        {link === undefined ? null : (
          <Icon aria-hidden="true" className="reservation-row__chevron" name="chev" />
        )}
      </span>
    </>
  );
  return (
    <Card className="reservation-row">
      {link === undefined ? (
        <div className="reservation-row__body">{content}</div>
      ) : (
        <a className="reservation-row__body" href={link}>
          {content}
        </a>
      )}
    </Card>
  );
}
