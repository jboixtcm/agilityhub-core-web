import { type ApiClient, isApiError } from "@agilityhub/api-client";
import { dogArticle, useClubFormats } from "@agilityhub/i18n";
import { AppBar, Badge, Button, Card, Chip, Icon, IconButton } from "@agilityhub/ui";
import { type CSSProperties, useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import "./booking.css";
import {
  type Booking,
  type BookingLimitReachedDetails,
  errorText,
  localParts,
  navigateInApp,
  type SeatHoldResponse,
} from "./shared";
import {
  CONFIRM_PATH,
  type ConfirmState,
  formatCountdown,
  type HeldSeat,
  holdSeat,
  openConfirmation,
  readConfirmState,
  releaseHold,
  useCountdown,
  useReleaseOnLeave,
} from "./useSeatHold";

interface CardSession {
  description: string;
  endsAtLocal?: string | null;
  ringColor?: string | null;
  ringName?: string | null;
  startsAtLocal: string;
}

/** «Dissabte 8 · 9:00–10:00»: the club-local day (03's «day» presentation) and hours. */
function useDayTime() {
  const formats = useClubFormats();
  return (local: string, endLocal?: string | null, withTime = true) => {
    const start = localParts(local);
    const end = endLocal === null || endLocal === undefined ? null : localParts(endLocal).time;
    return formats.formatActivityDate(
      start.date,
      withTime ? start.time : null,
      withTime ? end : null,
      "day",
    );
  };
}

function NewBookingCard({
  dog,
  isNew,
  levels,
  session,
}: {
  dog: { name: string; sex?: "FEMALE" | "MALE" | null };
  isNew: boolean;
  levels: readonly string[] | undefined;
  session: CardSession;
}) {
  const { t } = useTranslation("booking");
  const formats = useClubFormats();
  const dayTime = useDayTime();
  return (
    <>
      <h2 className="booking-section__title">{t("booking:confirm.newBooking")}</h2>
      <Card className="confirm-card">
        <p className="confirm-card__line">
          <span
            aria-hidden="true"
            className="class-row__dot"
            style={{ "--class-row-ring": session.ringColor ?? undefined } as CSSProperties}
          />
          <strong className="confirm-card__when">
            {dayTime(session.startsAtLocal, session.endsAtLocal)}
          </strong>
          {isNew ? <Badge tone="success">{t("booking:confirm.newBadge")}</Badge> : null}
        </p>
        <p className="confirm-card__line">
          {levels === undefined ? (
            <Chip className="confirm-card__level">{session.description}</Chip>
          ) : levels.length === 0 ? null : (
            <Chip className="confirm-card__level">
              {t("booking:confirm.levels", { levels: formats.formatList(levels) })}
            </Chip>
          )}
          <Chip>
            <Icon aria-hidden="true" name="paw" />
            {t("booking:confirm.withDog", {
              dogArticle: dogArticle(dog.name, dog.sex, formats.locale),
              dogName: dog.name,
            })}
          </Chip>
          {session.ringName === null || session.ringName === undefined ? null : (
            <span className="confirm-card__ring">{session.ringName}</span>
          )}
        </p>
      </Card>
    </>
  );
}

/** One key per payload (R-08-08): a retry of the same confirmation replays the api's answer. */
function useIdempotencyKeys() {
  const keys = useRef(new Map<string, string>());
  return (payload: unknown) => {
    const signature = JSON.stringify(payload);
    const known = keys.current.get(signature);
    if (known !== undefined) return known;
    const key = crypto.randomUUID();
    keys.current.set(signature, key);
    return key;
  };
}

function HeldSeatView({ client, seat }: { client: ApiClient; seat: HeldSeat }) {
  const { t } = useTranslation(["booking", "errors"]);
  const formats = useClubFormats();
  const dayTime = useDayTime();
  const hold: SeatHoldResponse = seat.hold;
  const left = useCountdown(seat);
  const [expiredByApi, setExpiredByApi] = useState(false);
  const [swapId, setSwapId] = useState<string | undefined>(hold.limit.swappable[0]?.bookingId);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const [booked, setBooked] = useState<Booking>();
  const idempotencyKey = useIdempotencyKeys();
  // The hold is released when the page is left, unless the booking consumed it or it was released.
  const kept = useRef(false);
  const keep = useCallback(() => kept.current, []);
  useReleaseOnLeave(client, hold.id, keep);

  const expired = expiredByApi || left === 0;
  const dog = hold.dog;
  const article = dogArticle(dog.name, dog.sex, formats.locale);
  const swap = hold.limit.reached;
  const price =
    hold.payment === null || hold.payment === undefined
      ? undefined
      : formats.formatMoney(hold.payment.price.amountMinor / 100);

  const leave = async () => {
    kept.current = true;
    await releaseHold(client, hold.id);
    navigateInApp("/reservar");
  };

  const confirm = async () => {
    const body = {
      seatHoldId: hold.id,
      ...(swap && swapId !== undefined ? { swapBookingId: swapId } : {}),
    };
    const header = { "Idempotency-Key": idempotencyKey(body) };
    setPending(true);
    setError(undefined);
    try {
      const response =
        seat.waitlistEntryId === null
          ? await client.POST("/bookings", { body, params: { header } })
          : await client.POST("/waitlist-entries/{id}/claim", {
              body,
              params: { header, path: { id: seat.waitlistEntryId } },
            });
      const booking = response.data;
      if (booking === undefined) throw new TypeError("The booking response did not contain data");
      kept.current = true;
      // PAY_TO_BOOK (R-08-18): the booking waits for the payment on the api's Checkout page.
      if (booking.state === "PAYMENT_PENDING" && typeof booking.checkoutUrl === "string") {
        window.location.assign(booking.checkoutUrl);
        return;
      }
      setBooked(booking);
    } catch (cause) {
      if (isApiError(cause, "SEAT_HOLD_EXPIRED")) {
        setExpiredByApi(true);
      } else if (
        isApiError(cause, "SWAP_NOT_ALLOWED") ||
        !isApiError(cause) ||
        cause.code === "NETWORK" ||
        cause.status >= 500
      ) {
        // The member stays with the hold: a retry sends the same payload with the same key.
        setError(errorText(t, cause));
      } else {
        // Claim refusals (SEAT_TAKEN, WAITLIST_*) and any other code: back to 04 with the message.
        navigateInApp("/reservar", {
          notice: { code: isApiError(cause) ? cause.code : "INTERNAL_ERROR", tone: "danger" },
        });
      }
    } finally {
      setPending(false);
    }
  };

  if (booked !== undefined) {
    return (
      <>
        <NewBookingCard
          dog={dog}
          isNew={false}
          levels={hold.classSession.levelNames}
          session={hold.classSession}
        />
        <div className="booking-note booking-note--success" role="status">
          <p>{t("booking:confirm.done")}</p>
          <p className="booking-note__links">
            <a href={booked.calendarLinks.google} rel="noopener noreferrer" target="_blank">
              {t("booking:confirm.calendarGoogle")}
            </a>
            {t("booking:separator")}
            <a href={booked.calendarLinks.outlook} rel="noopener noreferrer" target="_blank">
              {t("booking:confirm.calendarOutlook")}
            </a>
            {t("booking:separator")}
            <a href={booked.calendarLinks.ics} rel="noopener noreferrer" target="_blank">
              {t("booking:confirm.calendarIcs")}
            </a>
          </p>
        </div>
        <a
          className="ah-button ah-button--primary"
          href={`/reserves/${encodeURIComponent(booked.id)}`}
        >
          {t("booking:confirm.seeBooking")}
        </a>
      </>
    );
  }

  const selected = hold.limit.swappable.find((option) => option.bookingId === swapId);
  const upper = (text: string) => text.toLocaleUpperCase(formats.locale);
  return (
    <>
      <NewBookingCard
        dog={dog}
        isNew={swap}
        levels={hold.classSession.levelNames}
        session={hold.classSession}
      />
      {expired ? (
        <div role="alert">
          <button
            className="booking-note booking-note--danger booking-note--action"
            onClick={() => {
              navigateInApp("/reservar");
            }}
            type="button"
          >
            <Icon aria-hidden="true" name="warn" />
            {t("booking:confirm.expired")}
          </button>
        </div>
      ) : (
        <p className="confirm-hold">
          <span className="confirm-hold__chip">
            <Icon aria-hidden="true" name="lock" />
            {t("booking:confirm.hold", { countdown: formatCountdown(left) })}
          </span>
        </p>
      )}
      {swap ? (
        <>
          <p className="booking-note booking-note--warning">
            <Icon aria-hidden="true" name="warn" />
            {t("booking:confirm.limitNote", {
              count: hold.limit.count,
              dogArticle: article,
              dogName: dog.name,
              unit: hold.limit.unit,
              week: hold.limit.week,
            })}
          </p>
          <h2 className="booking-section__title confirm-swap__title" id="confirm-swap-title">
            <Icon aria-hidden="true" name="swap" />
            {t("booking:confirm.swapTitle")}
          </h2>
          <div aria-labelledby="confirm-swap-title" className="confirm-swap" role="radiogroup">
            {hold.limit.swappable.map((option) => {
              const checked = option.bookingId === swapId;
              return (
                <button
                  aria-checked={checked}
                  className={`ah-card confirm-option${checked ? " confirm-option--selected" : ""}`}
                  disabled={pending || expired}
                  key={option.bookingId}
                  onClick={() => {
                    setSwapId(option.bookingId);
                  }}
                  role="radio"
                  type="button"
                >
                  <span aria-hidden="true" className="confirm-option__check">
                    {checked ? <Icon name="check" /> : null}
                  </span>
                  <span className="confirm-option__text">
                    <strong>{dayTime(option.startsAtLocal)}</strong>
                    <small>
                      {t("booking:confirm.swappable", {
                        description: option.description,
                        ring: option.ringName ?? "none",
                      })}
                    </small>
                  </span>
                </button>
              );
            })}
            {hold.limit.notSelectable.map((option) => (
              <div
                aria-disabled="true"
                className="ah-card confirm-option confirm-option--inert"
                key={option.bookingId}
              >
                <span aria-hidden="true" className="confirm-option__check">
                  <Icon name="ban" />
                </span>
                <span className="confirm-option__text">
                  {option.startsAtLocal === null || option.startsAtLocal === undefined ? null : (
                    <strong>{dayTime(option.startsAtLocal)}</strong>
                  )}
                  <small>
                    {option.reason === "DONE"
                      ? t("booking:confirm.notSelectableDONE", {
                          description: option.description ?? "",
                        })
                      : t("booking:confirm.notSelectableLATE_WINDOW", {
                          description: option.description ?? "",
                        })}
                  </small>
                </span>
              </div>
            ))}
          </div>
        </>
      ) : null}
      {hold.payment?.mode === "CHARGE_ON_ATTENDANCE" && price !== undefined ? (
        <p className="booking-note booking-note--neutral">
          {t("booking:confirm.chargeOnAttendance", { price })}
        </p>
      ) : null}
      {error === undefined ? null : (
        <p className="booking-note booking-note--danger" role="alert">
          {error}
        </p>
      )}
      <Button
        disabled={expired || (swap && selected === undefined)}
        loading={pending}
        loadingLabel={t("booking:confirm.sending")}
        onClick={() => void confirm()}
      >
        {swap && selected !== undefined
          ? t("booking:confirm.swapButton", {
              newDay: upper(dayTime(hold.classSession.startsAtLocal, null, false)),
              oldDay: upper(dayTime(selected.startsAtLocal, null, false)),
            })
          : hold.payment?.mode === "PAY_TO_BOOK" && price !== undefined
            ? t("booking:confirm.payAndBook", { price })
            : t("booking:confirm.submit")}
      </Button>
      {swap ? (
        <Button disabled={pending} onClick={() => void leave()} variant="ghost">
          {t("booking:confirm.cancelNew")}
        </Button>
      ) : null}
    </>
  );
}

function RefusedView({
  client,
  state,
}: {
  client: ApiClient;
  state: Extract<ConfirmState, { kind: "refused" }>;
}) {
  const { t } = useTranslation(["booking", "errors"]);
  const formats = useClubFormats();
  const [pending, setPending] = useState(false);
  const article = dogArticle(state.dog.name, state.dog.sex, formats.locale);

  const retry = async () => {
    setPending(true);
    try {
      openConfirmation(await holdSeat(client, state.classSession.id, state.dog.id), true);
    } catch (cause) {
      const heldOnly =
        isApiError(cause, "CLASS_FULL") &&
        (cause.details as { heldOnly?: unknown } | undefined)?.heldOnly === true;
      if (!heldOnly) {
        navigateInApp("/reservar", {
          notice: { code: isApiError(cause) ? cause.code : "INTERNAL_ERROR", tone: "danger" },
        });
      }
    } finally {
      setPending(false);
    }
  };

  let note;
  if (state.code === "BOOKING_LIMIT_REACHED") {
    const details = state.details as Partial<BookingLimitReachedDetails>;
    note = (
      <p className="booking-note booking-note--warning">
        <Icon aria-hidden="true" name="warn" />
        {t("booking:confirm.limitDone", {
          count: details.current ?? details.limit ?? 0,
          dogArticle: article,
          dogName: state.dog.name,
        })}
        {typeof details.nextBookableAt === "string"
          ? ` ${t("booking:confirm.nextBookableAt", {
              nextBookableAt: formats.formatDayAtTime(details.nextBookableAt),
            })}`
          : null}
      </p>
    );
  } else if (state.code === "NOT_YET_OPEN") {
    const opensAt = state.details.opensAt;
    note = (
      <p className="booking-note booking-note--neutral">
        <Icon aria-hidden="true" name="clock" />
        {typeof opensAt === "string"
          ? t("booking:confirm.notYetOpen", { opensAt: formats.formatDayAtTime(opensAt) })
          : t("errors:NOT_YET_OPEN")}
      </p>
    );
  } else {
    note = (
      <>
        <p className="booking-note booking-note--warning" role="status">
          <Icon aria-hidden="true" name="warn" />
          {t("booking:confirm.seatTakenRetry")}
        </p>
        <Button
          loading={pending}
          loadingLabel={t("booking:confirm.sending")}
          onClick={() => void retry()}
        >
          {t("booking:confirm.retry")}
        </Button>
      </>
    );
  }
  return (
    <>
      <NewBookingCard
        dog={state.dog}
        isNew={false}
        levels={undefined}
        session={state.classSession}
      />
      {note}
    </>
  );
}

/**
 * Screens 06 and 29 (`/reservar/confirmar`, S08 §2): painted from the seat hold that 04 (or the
 * claim of a waiting entry) left in the history entry — the hold with its 30 s countdown on the
 * api clock, the swap when the week's limit is reached, the single-class payment — or from the
 * refusal the api gave instead (limit done, «Properament», a seat another hold takes). Without
 * that state (a reload after it was lost) it goes back to 04.
 */
export function ConfirmPage({ client }: { client: ApiClient }) {
  const { t } = useTranslation("booking");
  const [state, setState] = useState<ConfirmState | undefined>(readConfirmState);
  useEffect(() => {
    // A retry replaces this history entry with a live hold: paint the new state.
    const repaint = () => {
      if (window.location.pathname === CONFIRM_PATH) setState(readConfirmState());
    };
    window.addEventListener("popstate", repaint);
    return () => {
      window.removeEventListener("popstate", repaint);
    };
  }, []);
  useEffect(() => {
    if (state === undefined) navigateInApp("/reservar", null, true);
  }, [state]);
  if (state === undefined) return null;
  return (
    <section className="booking-screen">
      <AppBar
        className="booking-screen__bar"
        end={
          <IconButton
            className="booking-screen__close"
            icon="x"
            label={t("booking:confirm.close")}
            onClick={() => {
              // Leaving the page releases the hold (`useReleaseOnLeave`).
              navigateInApp("/reservar");
            }}
          />
        }
        title={<h1>{t("booking:confirm.title")}</h1>}
      />
      {state.kind === "hold" ? (
        <HeldSeatView client={client} key={state.hold.id} seat={state} />
      ) : (
        <RefusedView client={client} key={`${state.code}-${state.classSession.id}`} state={state} />
      )}
    </section>
  );
}
