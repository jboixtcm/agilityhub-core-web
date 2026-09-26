import { type ApiClient, isApiError } from "@agilityhub/api-client";
import { useSession } from "@agilityhub/auth";
import { clubLocalInstant, dogArticle, useClubFormats } from "@agilityhub/i18n";
import {
  AppBar,
  Badge,
  Button,
  Card,
  EmptyState,
  Icon,
  Modal,
  Skeleton,
  type Tone,
  useBranding,
} from "@agilityhub/ui";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import "./booking.css";
import { type Booking, errorText, localParts, type Translate, useBooking } from "./shared";

type DisplayState = NonNullable<Booking["displayState"]>;

const STATE_TONES: Readonly<Record<DisplayState, Tone>> = {
  CANCELLED: "neutral",
  CANCELLED_BY_CLUB: "neutral",
  CANCELLED_LATE: "warning",
  CONFIRMED: "success",
  DONE: "neutral",
  NO_SHOW: "danger",
  PAYMENT_PENDING: "warning",
};

/** `bookings.lateCancelThresholdMinutes` in words: «4 hores» on the hour, minutes otherwise. */
export function thresholdText(t: Translate, minutes: number): string {
  return minutes % 60 === 0
    ? t("booking:detail.thresholdHours", { count: minutes / 60 })
    : t("booking:detail.thresholdMinutes", { count: minutes });
}

/** The first word of the session's name: how the api names a member in `bookedBy` («Laura»). */
function firstName(name: string | undefined): string {
  return name?.trim().split(/\s+/u)[0] ?? "";
}

export function BookingBar() {
  const { t } = useTranslation("booking");
  return (
    <AppBar
      className="booking-screen__bar"
      start={
        <a aria-label={t("booking:detail.back")} className="booking-screen__back" href="/inici">
          <span aria-hidden="true">{t("booking:detail.backGlyph")}</span>
        </a>
      }
      title={<h1>{t("booking:detail.title")}</h1>}
    />
  );
}

/**
 * Screen 07 «Detall de la reserva» (`/reserves/:id`, S08 §2): the class with the dog, the api's
 * `displayState`, when and by whom it was booked, and [ANUL·LA LA RESERVA] while the api still
 * shows it confirmed. The confirmation warns inside `bookings.lateCancelThresholdMinutes` (the
 * booking's `lateCancelThresholdMinutes`; a MEMBER cannot read `/parameters`); the note after the
 * cancellation follows the api's `late` (R-08-10).
 */
export function BookingDetailPage({ bookingId, client }: { bookingId: string; client: ApiClient }) {
  const { t } = useTranslation(["booking", "enums", "errors", "common"]);
  const formats = useClubFormats();
  const branding = useBranding();
  const { me } = useSession();
  const booking = useBooking(client, bookingId);
  const [dialog, setDialog] = useState<{ late: boolean }>();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();

  if (booking.status === "loading") {
    return (
      <section className="booking-screen">
        <BookingBar />
        <Skeleton height="10rem" label={t("booking:detail.loading")} />
      </section>
    );
  }
  if (booking.status === "error") {
    const missing = isApiError(booking.error) && booking.error.status === 404;
    return (
      <section className="booking-screen">
        <BookingBar />
        {missing ? (
          <EmptyState
            description={t("booking:detail.notFound")}
            title={t("common:unavailable.title")}
          />
        ) : (
          <Card className="booking-error" role="alert">
            <p>{t("booking:detail.error")}</p>
            <Button
              onClick={() => {
                booking.refetch();
              }}
              variant="secondary"
            >
              {t("booking:detail.retry")}
            </Button>
          </Card>
        )}
      </section>
    );
  }

  const data = booking.data;
  const session = data.classSession;
  const start = localParts(session.startsAtLocal);
  const when = formats.formatActivityDate(
    start.date,
    start.time,
    localParts(session.endsAtLocal).time,
    "day",
  );
  const line =
    session.ringName === null || session.ringName === undefined || session.ringName === ""
      ? when
      : `${when}${t("booking:separator")}${session.ringName}`;
  const title =
    data.dog === undefined
      ? t("booking:detail.classOnly", { description: session.description })
      : t("booking:detail.classWithDog", {
          description: session.description,
          dogArticle: dogArticle(data.dog.name, data.dog.sex, formats.locale),
          dogName: data.dog.name,
        });
  const bookedAt = {
    date: t("booking:detail.weekdayDate", {
      date: formats.formatDate(data.bookedAt, "dayMonthNumeric"),
      weekday: formats.formatDate(data.bookedAt, "weekdayLong"),
    }),
    time: formats.formatTime(data.bookedAt),
  };
  const bookedLine = data.bookedBy.viaClub
    ? t("booking:detail.bookedByClub", bookedAt)
    : firstName(me?.account.name) !== "" &&
        data.bookedBy.displayName !== firstName(me?.account.name)
      ? t("booking:detail.bookedByMember", { ...bookedAt, name: data.bookedBy.displayName })
      : t("booking:detail.bookedAt", bookedAt);
  const displayState: DisplayState =
    data.displayState ?? (data.state === "ACTIVE" ? "CONFIRMED" : data.state);
  const threshold = data.lateCancelThresholdMinutes;
  const cancellable = data.state === "ACTIVE" && displayState === "CONFIRMED";
  const cancelled =
    data.cancellation !== null &&
    data.cancellation !== undefined &&
    (data.state === "CANCELLED" || data.state === "CANCELLED_LATE");

  const open = () => {
    setError(undefined);
    // Inside the threshold the session counts as done (R-08-10): the dialog says so first.
    const startsAt = clubLocalInstant(session.startsAtLocal, branding.timeZone);
    setDialog({ late: threshold !== undefined && Date.now() > startsAt - threshold * 60_000 });
  };

  const cancel = async () => {
    setPending(true);
    setError(undefined);
    try {
      await client.POST("/bookings/{id}/cancellation", {
        body: {},
        params: { path: { id: data.id } },
      });
      setDialog(undefined);
    } catch (cause) {
      // The refusal stays in the dialog, where the member is; the booking is read again.
      setError(errorText(t, cause));
    } finally {
      setPending(false);
      booking.refetch(true);
    }
  };

  return (
    <section className="booking-screen">
      <BookingBar />
      <Card className="detail-card">
        <p className="detail-card__line">
          <strong className="detail-card__title">{title}</strong>
          <Badge tone={STATE_TONES[displayState]}>{t(`enums:bookingState.${displayState}`)}</Badge>
        </p>
        <p className="detail-card__when">{line}</p>
        <p className="detail-card__booked">
          <Icon aria-hidden="true" name="clock" />
          {bookedLine}
        </p>
      </Card>
      {cancellable ? <Button onClick={open}>{t("booking:detail.cancel")}</Button> : null}
      {cancelled && data.cancellation !== null && data.cancellation !== undefined ? (
        data.cancellation.late ? (
          <p className="booking-note booking-note--warning" role="status">
            {threshold === undefined
              ? t("booking:detail.cancelledLateNoThreshold")
              : t("booking:detail.cancelledLate", { threshold: thresholdText(t, threshold) })}
          </p>
        ) : (
          <p className="booking-note booking-note--success" role="status">
            {t("booking:detail.cancelledInTime")}
          </p>
        )
      ) : null}
      {dialog === undefined ? null : (
        <Modal
          closeLabel={t("booking:confirm.close")}
          onClose={() => {
            if (!pending) setDialog(undefined);
          }}
          open
          title={t("booking:detail.cancelDialog", { description: session.description })}
        >
          {dialog.late && threshold !== undefined ? (
            <p className="booking-note booking-note--warning">
              <Icon aria-hidden="true" name="warn" />
              {t("booking:detail.lateWarning", { threshold: thresholdText(t, threshold) })}
            </p>
          ) : null}
          {error === undefined ? null : (
            <p className="booking-note booking-note--danger" role="alert">
              {error}
            </p>
          )}
          <div className="booking-dialog">
            <Button
              disabled={pending}
              onClick={() => {
                setDialog(undefined);
              }}
              variant="ghost"
            >
              {t("booking:waitlist.back")}
            </Button>
            <Button
              loading={pending}
              loadingLabel={t("booking:confirm.sending")}
              onClick={() => void cancel()}
              variant="danger"
            >
              {t("booking:detail.cancelConfirm")}
            </Button>
          </div>
        </Modal>
      )}
    </section>
  );
}
