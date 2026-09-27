import type { ApiClient } from "@agilityhub/api-client";
import { dogArticle, useClubFormats } from "@agilityhub/i18n";
import { Badge, Button, Card, EmptyState, Icon, Modal, Skeleton, type Tone } from "@agilityhub/ui";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { BookingBar, thresholdText } from "../booking/BookingDetailPage";
import "../booking/booking.css";
import { errorText, navigateInApp, type Translate } from "../booking/shared";

import "./training.css";
import {
  codeOf,
  detailsOf,
  reportTrainingRefusal,
  type TrainingBooking,
  useNowUntil,
  useTrainingBooking,
} from "./shared";

type DisplayState = "CANCELLED" | "CANCELLED_BY_CLUB" | "CONFIRMED" | "DONE";

const STATE_TONES: Readonly<Record<DisplayState, Tone>> = {
  CANCELLED: "neutral",
  CANCELLED_BY_CLUB: "neutral",
  CONFIRMED: "success",
  DONE: "neutral",
};

/** S09 §3/§5: «fet» is derived, an `ACTIVE` booking whose `endsAt` has passed. */
function displayState(booking: TrainingBooking, now: number): DisplayState {
  if (booking.state === "CANCELLED" || booking.state === "CANCELLED_BY_CLUB") return booking.state;
  return Date.parse(booking.endsAt) < now ? "DONE" : "CONFIRMED";
}

function stateLabel(t: Translate, state: DisplayState): string {
  switch (state) {
    case "CANCELLED":
      return t("enums:trainingBookingState.CANCELLED");
    case "CANCELLED_BY_CLUB":
      return t("enums:trainingBookingState.CANCELLED_BY_CLUB");
    case "DONE":
      return t("enums:trainingBookingState.DONE");
    default:
      return t("enums:trainingBookingState.CONFIRMED");
  }
}

/** «2 hores» / «45 minuts» from the minutes of `TRAINING_CANCEL_TOO_LATE`'s details. */
function minutesText(t: Translate, minutes: number): string {
  return thresholdText(t, Math.max(0, minutes));
}

/**
 * Training booking detail (`/entrenaments/:id`, S09 §2 rows 03/07/25): «Entrenament · amb {dog}»,
 * the state, «{Dimarts 4} · {8:00}–{8:30} · {ring}», who and when booked it, and [ANUL·LA LA
 * RESERVA] until the api's `cancellableUntil` (R-09-10); past it, the too-late notice. The
 * target of the 03 `TRAINING` rows.
 */
export function TrainingDetailPage({
  bookingId,
  client,
}: {
  bookingId: string;
  client: ApiClient;
}) {
  const { t } = useTranslation(["training", "booking", "enums", "errors", "common"]);
  const formats = useClubFormats();
  const booking = useTrainingBooking(client, bookingId);
  const now = useNowUntil(
    booking.status === "ready"
      ? [Date.parse(booking.data.cancellableUntil), Date.parse(booking.data.endsAt)]
      : [],
  );
  const [dialog, setDialog] = useState(false);
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
    const missing = codeOf(booking.error) === "NOT_FOUND";
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
            <Button onClick={booking.refetch} variant="secondary">
              {t("booking:detail.retry")}
            </Button>
          </Card>
        )}
      </section>
    );
  }

  const data = booking.data;
  const state = displayState(data, now);
  const when = formats.formatActivityDate(data.date, data.startsAtLocal, data.endsAtLocal, "day");
  const bookedAt = {
    date: t("booking:detail.weekdayDate", {
      date: formats.formatDate(data.createdAt, "dayMonthNumeric"),
      weekday: formats.formatDate(data.createdAt, "weekdayLong"),
    }),
    time: formats.formatTime(data.createdAt),
  };
  // R-09-16: a booking made through «Entra com l'abonat» reads as the club's.
  const bookedLine =
    data.origin === "BACKOFFICE"
      ? t("booking:detail.bookedByClub", bookedAt)
      : t("booking:detail.bookedAt", bookedAt);
  const future = state === "CONFIRMED";
  const cancellable = future && now < Date.parse(data.cancellableUntil);

  const cancel = async () => {
    setPending(true);
    setError(undefined);
    try {
      await client.POST("/training-bookings/{id}/cancellation", {
        body: {},
        params: { path: { id: data.id } },
      });
      setDialog(false);
      navigateInApp("/inici", {
        notice: { messageKey: "training:detail.cancelled", tone: "success" },
      });
    } catch (cause) {
      // The refusal stays in the dialog, where the member is; the booking is read again.
      const code = codeOf(cause);
      reportTrainingRefusal(cause);
      if (code === "TRAINING_CANCEL_TOO_LATE") {
        const details = detailsOf(cause);
        const threshold =
          typeof details.thresholdMinutes === "number" ? details.thresholdMinutes : 0;
        const before = typeof details.minutesBefore === "number" ? details.minutesBefore : 0;
        setError(
          t("training:detail.tooLateDetails", {
            remaining: minutesText(t, before),
            threshold: minutesText(t, threshold),
          }),
        );
      } else {
        setError(errorText(t, cause));
      }
      booking.refetch();
    } finally {
      setPending(false);
    }
  };

  return (
    <section className="booking-screen">
      <BookingBar />
      <Card className="detail-card">
        <p className="detail-card__line">
          <strong className="detail-card__title">
            {t("training:detail.withDog", {
              // The booking does not name the dog's sex: no Catalan article (S08 §10).
              dogArticle: dogArticle(data.dogName, null, formats.locale),
              dogName: data.dogName,
            })}
          </strong>
          <Badge tone={STATE_TONES[state]}>{stateLabel(t, state)}</Badge>
        </p>
        <p className="detail-card__when">{`${when}${t("booking:separator")}${data.ringName}`}</p>
        <p className="detail-card__booked">
          <Icon aria-hidden="true" name="clock" />
          {bookedLine}
        </p>
      </Card>
      {cancellable ? (
        <Button
          onClick={() => {
            setError(undefined);
            setDialog(true);
          }}
        >
          {t("booking:detail.cancel")}
        </Button>
      ) : future ? (
        <p className="booking-note booking-note--warning" role="note">
          {t("training:detail.tooLate")}
        </p>
      ) : null}
      {dialog ? (
        <Modal
          closeLabel={t("booking:confirm.close")}
          onClose={() => {
            if (!pending) setDialog(false);
          }}
          open
          title={t("training:detail.cancelDialog")}
        >
          {error === undefined ? null : (
            <p className="booking-note booking-note--danger" role="alert">
              {error}
            </p>
          )}
          <div className="booking-dialog">
            <Button
              disabled={pending}
              onClick={() => {
                setDialog(false);
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
      ) : null}
    </section>
  );
}
