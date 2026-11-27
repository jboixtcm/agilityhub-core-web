import { type ApiClient, isApiError } from "@agilityhub/api-client";
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
import { type CSSProperties, useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { BookingCourseLines } from "../courses/blocks";
import { useNowUntil, useWindowFocus } from "../training/shared";

import "./booking.css";
import { memberNoticeField, NotifyMemberChoice, useMemberNoticeChoice } from "./NotifyMemberChoice";
import {
  type Booking,
  errorText,
  localParts,
  type Translate,
  useBooking,
  useLoader,
} from "./shared";
import { holdSeat, openConfirmation } from "./useSeatHold";

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

/**
 * Mockup 07: the ring's dot before the card's title, in the colour the api sends with the class
 * (`classSession.ringColor`, api E5-T29); none for a ring without a colour.
 */
export function RingDot({ color }: { color: string | null | undefined }) {
  if (color === null || color === undefined || color === "") return null;
  return (
    <span
      aria-hidden="true"
      className="detail-card__dot"
      style={{ "--class-row-ring": color } as CSSProperties}
    />
  );
}

function RebookClass({ client, booking }: { client: ApiClient; booking: Booking }) {
  const { t } = useTranslation(["booking", "errors"]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const load = useCallback(async () => {
    const { data } = await client.GET("/me/bookable-classes", {
      params: { query: { dogId: booking.dogId } },
    });
    return data?.classes.some(
      (row) => row.id === booking.classSessionId && row.state === "BOOKABLE" && row.freeSeats > 0,
    );
  }, [client, booking.classSessionId, booking.dogId]);
  const available = useLoader(load, undefined, false, true);
  const rebook = async () => {
    setPending(true);
    setError(undefined);
    try {
      openConfirmation(await holdSeat(client, booking.classSessionId, booking.dogId));
    } catch (cause) {
      setError(errorText(t, cause));
      available.refetch(true);
    } finally {
      setPending(false);
    }
  };
  return (
    <>
      {available.status === "ready" && available.data ? (
        <Button disabled={pending} onClick={() => void rebook()}>
          {t("booking:detail.rebook")}
        </Button>
      ) : null}
      {available.status === "error" ? (
        <div role="alert">
          <p>{errorText(t, available.error)}</p>
          <Button
            variant="secondary"
            onClick={() => {
              available.refetch();
            }}
          >
            {t("booking:detail.retry")}
          </Button>
        </div>
      ) : null}
      {error === undefined ? null : <p role="alert">{error}</p>}
    </>
  );
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
 * booking's `lateCancelThresholdMinutes`; a MEMBER cannot read `/parameters`); only this page's
 * own cancellation leaves a note, by the `late` of its answer (R-08-10).
 */
export function BookingDetailPage({
  bookingId,
  client,
  refresh,
}: {
  bookingId: string;
  client: ApiClient;
  refresh?: unknown;
}) {
  const { t } = useTranslation(["booking", "enums", "errors", "common"]);
  const formats = useClubFormats();
  const { timeZone } = useBranding();
  const booking = useBooking(client, bookingId, refresh);
  const startsAt =
    booking.status === "ready"
      ? clubLocalInstant(booking.data.classSession.startsAtLocal, timeZone)
      : Number.NaN;
  const now = useNowUntil([startsAt]);
  const [dialog, setDialog] = useState<{ late: boolean }>();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  // COMM-03: an ADMIN acting as the member may cancel without notifying them (N-36).
  const noticeChoice = useMemberNoticeChoice();
  const [notify, setNotify] = useState(true);
  // The answer of this page's own cancellation: only it says «dins el termini» or «tard» (step 6).
  // A booking cancelled elsewhere (a swap, the system, an old one) shows just its state chip.
  const [cancelled, setCancelled] = useState<{ late: boolean }>();
  // WEB-09 (R-08-10): a dialog opened in time and still open when `cancellableInTimeUntil` passes
  // warns before the member confirms.
  const inTimeUntil =
    booking.status === "ready" ? Date.parse(booking.data.cancellableInTimeUntil) : Number.NaN;
  const openInTime = dialog?.late === false;
  useEffect(() => {
    if (!openInTime || !Number.isFinite(inTimeUntil)) return undefined;
    const wait = Math.max(inTimeUntil + 1 - Date.now(), 0);
    // `setTimeout` holds at most 2^31 − 1 ms (~24.8 days); no dialog stays open that long.
    if (wait > 2_147_483_647) return undefined;
    const timer = window.setTimeout(() => {
      setDialog((current) => (current === undefined ? current : { late: true }));
    }, wait);
    return () => {
      window.clearTimeout(timer);
    };
  }, [inTimeUntil, openInTime]);
  // A phone that slept with the dialog open runs that timer late: the app coming back checks too.
  useWindowFocus(
    useCallback(() => {
      if (Date.now() > inTimeUntil) {
        setDialog((current) => (current?.late === false ? { late: true } : current));
      }
    }, [inTimeUntil]),
  );

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
    data.dog == null
      ? t("booking:detail.classWithoutDog", { description: session.description })
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
  // The api says whether the reader's own account booked it (`BookedBy.self`, api E5-T25): two
  // members of a family group may share a first name, so names are never compared.
  const bookedLine = data.bookedBy.viaClub
    ? t("booking:detail.bookedByClub", bookedAt)
    : data.bookedBy.self
      ? t("booking:detail.bookedAt", bookedAt)
      : t("booking:detail.bookedByMember", { ...bookedAt, name: data.bookedBy.displayName });
  const displayState: DisplayState =
    data.displayState ?? (data.state === "ACTIVE" ? "CONFIRMED" : data.state);
  // Always sent with the booking (api E5-T25): a MEMBER cannot read `/parameters`.
  const threshold = data.lateCancelThresholdMinutes;
  const cancellable = data.state === "ACTIVE" && displayState === "CONFIRMED";
  // The note waits for the booking read again, so it lands together with the new state chip.
  const note =
    cancelled !== undefined && (data.state === "CANCELLED" || data.state === "CANCELLED_LATE")
      ? cancelled
      : undefined;

  const open = () => {
    setError(undefined);
    setNotify(true);
    // R-08-10: in time while now ≤ `cancellableInTimeUntil`, the instant the api computes (the
    // class start minus the threshold); after it the dialog warns first.
    setDialog({ late: Date.now() > Date.parse(data.cancellableInTimeUntil) });
  };

  const cancel = async () => {
    setPending(true);
    setError(undefined);
    try {
      const response = await client.POST("/bookings/{id}/cancellation", {
        body: memberNoticeField(noticeChoice, notify),
        params: { path: { id: data.id } },
      });
      const result = response.data;
      if (result === undefined)
        throw new TypeError("The cancellation response did not contain data");
      setCancelled({ late: result.cancellation?.late ?? result.state === "CANCELLED_LATE" });
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
          <RingDot color={session.ringColor} />
          <strong className="detail-card__title">{title}</strong>
          <Badge tone={STATE_TONES[displayState]}>{t(`enums:bookingState.${displayState}`)}</Badge>
        </p>
        <p className="detail-card__when">{line}</p>
        <p className="detail-card__booked">
          <Icon aria-hidden="true" name="clock" />
          {bookedLine}
        </p>
        {/* S16 §2 / R-16-13: what is set up on the class's ring, and the course it plans. */}
        <BookingCourseLines classSessionId={data.classSessionId} client={client} />
      </Card>
      {data.state === "PAYMENT_PENDING" && data.checkoutUrl ? (
        <a className="ah-button ah-button--primary" href={data.checkoutUrl}>
          {t("booking:detail.completePayment")}
        </a>
      ) : null}
      {(data.state === "CANCELLED" || data.state === "CANCELLED_LATE") &&
      data.dog != null &&
      data.cancellation?.byRole === "MEMBER" &&
      startsAt > now ? (
        <RebookClass client={client} booking={data} />
      ) : null}
      {cancellable ? <Button onClick={open}>{t("booking:detail.cancel")}</Button> : null}
      {note !== undefined ? (
        note.late ? (
          <p className="booking-note booking-note--warning" role="status">
            {t("booking:detail.cancelledLate", { threshold: thresholdText(t, threshold) })}
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
          {dialog.late ? (
            <p className="booking-note booking-note--warning">
              <Icon aria-hidden="true" name="warn" />
              {t("booking:detail.lateWarning", { threshold: thresholdText(t, threshold) })}
            </p>
          ) : (
            <p className="booking-note booking-note--neutral">{t("booking:detail.inTimeNotice")}</p>
          )}
          {noticeChoice ? (
            <NotifyMemberChoice
              checked={notify}
              disabled={pending}
              id="booking-cancel-notify-member"
              onChange={setNotify}
            />
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
