import { type ApiClient, isApiError } from "@agilityhub/api-client";
import { dogArticle, useClubFormats } from "@agilityhub/i18n";
import {
  AppBar,
  Badge,
  Button,
  Card,
  Icon,
  Modal,
  Skeleton,
  Toast,
  type Tone,
  useBranding,
} from "@agilityhub/ui";
import { type CSSProperties, type ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";

import { ActivitiesBlock } from "../activities/ActivitiesBlock";

import "./booking.css";
import { DogChips } from "./DogChips";
import {
  type BookableClass,
  type BookableClasses,
  errorText,
  localParts,
  noticeText,
  pageNotice,
  type PageNotice,
  type Translate,
  useBookableClasses,
} from "./shared";
import { holdSeat, openConfirmation, type RefusedHold } from "./useSeatHold";

/** Tapping a row (S08 §2 04): a hold for these states, the waitlist dialog for WAITLIST_OPEN. */
const HOLD_STATES: readonly BookableClass["state"][] = [
  "BOOKABLE",
  "NOT_YET_OPEN",
  "WEEKLY_LIMIT_DONE",
];

function actionable(row: BookableClass, blocked: boolean): boolean {
  return !blocked && (HOLD_STATES.includes(row.state) || row.state === "WAITLIST_OPEN");
}

/** The hold refusals 29 explains itself (S08 §2 29): anything else stays on 04 with its message. */
function refusal(cause: unknown): RefusedHold["code"] | undefined {
  if (isApiError(cause, "BOOKING_LIMIT_REACHED")) return "BOOKING_LIMIT_REACHED";
  if (isApiError(cause, "NOT_YET_OPEN")) return "NOT_YET_OPEN";
  if (isApiError(cause, "CLASS_FULL")) {
    const details = cause.details as { heldOnly?: unknown } | undefined;
    return details?.heldOnly === true ? "CLASS_FULL" : undefined;
  }
  return undefined;
}

function Hourglass() {
  return <Icon aria-hidden="true" className="class-row__hourglass" name="hour" />;
}

/** The badge of a row by the api's `state` (R-08-03), with the price when SINGLE_CLASS sells it. */
function rowBadge(
  row: BookableClass,
  t: Translate,
  money: (amount: number) => string,
): { content: ReactNode; label?: string; tone: Tone } | undefined {
  let badge: { content: ReactNode; label?: string; tone: Tone } | undefined;
  const waiting = row.waiting ?? 0;
  switch (row.state) {
    case "BOOKABLE":
      badge = { content: t("booking:list.freeSeats", { count: row.freeSeats }), tone: "success" };
      break;
    case "WAITLIST_OPEN":
      badge = {
        content: (
          <>
            {t("booking:list.full")}
            {t("booking:separator")}
            <Hourglass />
            {String(waiting)}
          </>
        ),
        label: t("booking:list.waitlistLabel", { waiting }),
        tone: "danger",
      };
      break;
    case "WAITLIST_FULL":
      badge = {
        content: (
          <>
            {t("booking:list.full")}
            {t("booking:separator")}
            <Hourglass />
            {t("booking:list.waitlistFull", { max: row.waitlistMax ?? waiting, waiting })}
          </>
        ),
        label: t("booking:list.waitlistFullLabel", { max: row.waitlistMax ?? waiting, waiting }),
        tone: "danger",
      };
      break;
    case "FULL":
      badge = { content: t("booking:list.full"), tone: "danger" };
      break;
    case "WEEKLY_LIMIT_DONE":
      badge = { content: t("booking:list.weeklyLimit"), tone: "warning" };
      break;
    case "NOT_YET_OPEN":
      badge = { content: t("booking:list.soon"), tone: "neutral" };
      break;
    case "PACK_EMPTY":
      badge = { content: t("booking:list.packEmpty"), tone: "neutral" };
      break;
    default:
      return undefined;
  }
  if (row.price === null || row.price === undefined) return badge;
  const price = money(row.price.amountMinor / 100);
  return {
    content: (
      <>
        {badge.content}
        {t("booking:separator")}
        {price}
      </>
    ),
    ...(badge.label === undefined
      ? {}
      : { label: t("booking:list.withPrice", { label: badge.label, price }) }),
    tone: badge.tone,
  };
}

/**
 * Screen 04 «Reservar» (`/reservar`, S08 §2): one dog always (the api's proposed one first), its
 * pack, the booking block banner, the S07 activities of that dog and the class rows with the
 * mockup's badges. A row does what its `state` says (R-08-03): a seat hold → 06/29, the waiting
 * list dialog, or nothing. Nothing is computed here: weeks, limits and states are the api's.
 */
export function BookPage({ client }: { client: ApiClient }) {
  const { t } = useTranslation(["booking", "home", "enums", "errors", "shell"]);
  const formats = useClubFormats();
  const branding = useBranding();
  const [dogId, setDogId] = useState<string | null>(null);
  const view = useBookableClasses(client, dogId);
  const [pending, setPending] = useState<string>();
  const [joining, setJoining] = useState<BookableClass>();
  const [joinError, setJoinError] = useState<string>();
  const [notice, setNotice] = useState<PageNotice | undefined>(pageNotice);

  const bar = <AppBar className="booking-screen__bar" title={<h1>{t("shell:nav.reserve")}</h1>} />;

  if (view.status === "loading") {
    return (
      <section className="booking-screen">
        {bar}
        <Skeleton height="16rem" label={t("booking:classes.loading")} />
      </section>
    );
  }
  if (view.status === "error") {
    const error = view.error;
    return (
      <section className="booking-screen">
        {bar}
        <Card className="booking-error" role="alert">
          <p>{t("booking:classes.error")}</p>
          <Button
            onClick={() => {
              // A dog that left the group answers 404 DOG_NOT_ACCESSIBLE: back to the proposed dog.
              if (dogId !== null && isApiError(error, "DOG_NOT_ACCESSIBLE")) setDogId(null);
              else view.refetch();
            }}
            variant="secondary"
          >
            {t("booking:classes.retry")}
          </Button>
        </Card>
      </section>
    );
  }

  const data: BookableClasses = view.data;
  const dog = data.dog;
  const blocked = data.bookingBlock !== null && data.bookingBlock !== undefined;
  const busy = pending !== undefined || (dogId !== null && dogId !== dog.id);
  const article = dogArticle(dog.name, dog.sex, formats.locale);

  const hold = async (row: BookableClass) => {
    setPending(row.id);
    setNotice(undefined);
    try {
      openConfirmation(await holdSeat(client, row.id, dog.id));
    } catch (cause) {
      const code = refusal(cause);
      if (code !== undefined && isApiError(cause)) {
        openConfirmation({
          classSession: row,
          code,
          details: (cause.details ?? {}) as Record<string, unknown>,
          dog: { id: dog.id, name: dog.name, sex: dog.sex },
          kind: "refused",
        });
        return;
      }
      setNotice({ code: isApiError(cause) ? cause.code : "INTERNAL_ERROR", tone: "danger" });
      view.refetch(true);
    } finally {
      setPending(undefined);
    }
  };

  const join = async (row: BookableClass) => {
    setPending(row.id);
    setNotice(undefined);
    setJoinError(undefined);
    try {
      await client.POST("/waitlist-entries", { body: { classSessionId: row.id, dogId: dog.id } });
      setJoining(undefined);
      setNotice({ messageKey: "booking:waitlist.joined", tone: "success" });
    } catch (cause) {
      // The refusal stays in the dialog, where the member is.
      setJoinError(errorText(t, cause));
    } finally {
      setPending(undefined);
      // The joined row leaves the list (R-08-04); a refusal may have changed the row too.
      view.refetch(true);
    }
  };

  const tap = (row: BookableClass) => {
    if (row.state === "WAITLIST_OPEN") {
      setJoinError(undefined);
      setJoining(row);
    } else void hold(row);
  };

  const packState = data.pack?.state;
  const packTone: Tone = packState === "EXPIRED" || packState === "EMPTY" ? "danger" : "warning";
  return (
    <section className="booking-screen">
      {bar}
      {notice === undefined ? null : (
        <Toast
          dismissLabel={t("booking:confirm.close")}
          onDismiss={() => {
            setNotice(undefined);
          }}
          tone={notice.tone}
        >
          {noticeText(t, notice)}
        </Toast>
      )}
      <DogChips
        disabled={pending !== undefined}
        dogs={data.dogs}
        onSelect={(next) => {
          if (next !== null) setDogId(next);
        }}
        selected={dogId ?? dog.id}
        withAll={false}
      />
      {data.pack === null ||
      data.pack === undefined ||
      !branding.modules.includes("PACKS") ? null : (
        <Card className={`pack-card pack-card--${data.pack.state.toLowerCase()}`}>
          <div className="pack-card__head">
            <strong>
              {t("booking:pack.title", {
                dogArticle: article,
                dogName: dog.name,
                planName: data.pack.planName,
              })}
            </strong>
            <Badge tone={packTone}>
              {t("booking:pack.expires", {
                expiresOn: formats.formatPlainDate(data.pack.expiresOn),
              })}
            </Badge>
          </div>
          <div aria-hidden="true" className="pack-card__bar">
            <span className="pack-card__used" style={{ flexGrow: data.pack.consumed }} />
            <span className="pack-card__left" style={{ flexGrow: data.pack.available }} />
          </div>
          <p className="pack-card__counts">
            <strong>{t("booking:pack.consumed", { count: data.pack.consumed })}</strong>
            {t("booking:separator")}
            <strong className="pack-card__available">
              {t("booking:pack.available", { count: data.pack.available })}
            </strong>
          </p>
        </Card>
      )}
      {blocked ? (
        <p className="booking-note booking-note--danger" role="status">
          <Icon aria-hidden="true" name="warn" />
          {t("booking:block.banner", { reason: data.bookingBlock?.reason ?? "" })}
        </p>
      ) : null}
      <p className="booking-screen__intro">{t("booking:intro")}</p>
      <ActivitiesBlock client={client} dogId={dog.id} />
      <section
        aria-busy={busy || undefined}
        aria-labelledby="booking-classes-title"
        className="booking-section"
      >
        <h2 className="booking-section__title" id="booking-classes-title">
          {t("booking:classes.title")}
        </h2>
        {data.classes.length === 0 ? (
          <p className="booking-screen__intro">{t("booking:classes.empty")}</p>
        ) : (
          data.classes.map((row) => {
            const start = localParts(row.startsAtLocal);
            const badge = rowBadge(row, t, formats.formatMoney);
            const canTap = actionable(row, blocked);
            const content = (
              <>
                <span
                  aria-hidden="true"
                  className="class-row__dot"
                  style={{ "--class-row-ring": row.ringColor ?? undefined } as CSSProperties}
                />
                <span className="class-row__text">
                  <strong>
                    {formats.formatActivityDate(start.date, start.time, null, "list")}
                  </strong>
                  {t("booking:separator")}
                  {row.description}
                </span>
                {badge === undefined ? (
                  <span className="ah-sr-only">{t(`enums:bookableState.${row.state}`)}</span>
                ) : (
                  <Badge className="class-row__badge" tone={badge.tone}>
                    {badge.label === undefined ? (
                      badge.content
                    ) : (
                      <>
                        <span aria-hidden="true" className="class-row__badge-content">
                          {badge.content}
                        </span>
                        <span className="ah-sr-only">{badge.label}</span>
                      </>
                    )}
                  </Badge>
                )}
                {/* The mockup's › only on rows that act; a full waiting list is inert (V4). */}
                {canTap ? (
                  <Icon aria-hidden="true" className="class-row__chevron" name="chev" />
                ) : null}
              </>
            );
            return (
              <Card
                className={`class-row class-row--${row.state.toLowerCase().replaceAll("_", "-")}${canTap ? "" : " class-row--inert"}`}
                key={row.id}
              >
                {canTap ? (
                  <button
                    className="class-row__body"
                    disabled={busy}
                    onClick={() => {
                      tap(row);
                    }}
                    type="button"
                  >
                    {content}
                  </button>
                ) : (
                  <div aria-disabled="true" className="class-row__body">
                    {content}
                  </div>
                )}
              </Card>
            );
          })
        )}
      </section>
      {joining === undefined ? null : (
        <Modal
          closeLabel={t("booking:confirm.close")}
          onClose={() => {
            if (pending === undefined) setJoining(undefined);
          }}
          open
          title={t("booking:waitlist.joinDialog", {
            className: t("booking:waitlist.classLabel", {
              description: joining.description,
              when: formats.formatActivityDate(
                localParts(joining.startsAtLocal).date,
                localParts(joining.startsAtLocal).time,
                null,
                "list",
              ),
            }),
          })}
        >
          {joinError === undefined ? null : (
            <p className="booking-note booking-note--danger" role="alert">
              {joinError}
            </p>
          )}
          <div className="booking-dialog">
            <Button
              disabled={pending !== undefined}
              onClick={() => {
                setJoining(undefined);
              }}
              variant="ghost"
            >
              {t("booking:waitlist.back")}
            </Button>
            <Button
              loading={pending === joining.id}
              loadingLabel={t("booking:confirm.sending")}
              onClick={() => void join(joining)}
            >
              {t("booking:waitlist.join")}
            </Button>
          </div>
        </Modal>
      )}
    </section>
  );
}
