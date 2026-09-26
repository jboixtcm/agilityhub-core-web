import { type ApiClient, isApiError } from "@agilityhub/api-client";
import { dogArticle, useClubFormats } from "@agilityhub/i18n";
import { Badge, Button, Card, EmptyState, Icon, Modal, Skeleton } from "@agilityhub/ui";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import "./booking.css";
import { BookingBar } from "./BookingDetailPage";
import { errorText, localParts, navigateInApp, useWaitlistEntry } from "./shared";
import { startClaim } from "./useSeatHold";

/**
 * The waiting entry's detail (`/espera/:id`, S08 §2 07; `WAITLIST`): the class card with «en
 * llista d'espera», the FIFO position and deadline when the api sends them, [AGAFA LA PLAÇA] for
 * a NOTIFIED entry (the claim of R-08-15 until screen 11 exists) and [SURT DE LA LLISTA
 * D'ESPERA]. An entry that is no longer live is read-only with its state.
 */
export function WaitlistDetailPage({ client, entryId }: { client: ApiClient; entryId: string }) {
  const { t } = useTranslation(["booking", "enums", "errors", "common"]);
  const formats = useClubFormats();
  const entry = useWaitlistEntry(client, entryId);
  const [dialog, setDialog] = useState(false);
  const [pending, setPending] = useState<"claim" | "leave">();
  const [error, setError] = useState<string>();

  if (entry.status === "loading") {
    return (
      <section className="booking-screen">
        <BookingBar />
        <Skeleton height="10rem" label={t("booking:detail.loading")} />
      </section>
    );
  }
  if (entry.status === "error") {
    const missing = isApiError(entry.error) && entry.error.status === 404;
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
                entry.refetch();
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

  const data = entry.data;
  const session = data.classSession;
  const live = data.state === "ACTIVE" || data.state === "NOTIFIED";
  const start = localParts(session.startsAtLocal);
  const when = formats.formatActivityDate(start.date, start.time, null, "day");
  const line =
    session.ringName === null || session.ringName === undefined || session.ringName === ""
      ? when
      : `${when}${t("booking:separator")}${session.ringName}`;
  const dogName = data.dog?.name ?? data.dogName ?? undefined;
  const title =
    dogName === undefined
      ? t("booking:detail.classOnly", { description: session.description })
      : t("booking:detail.classWithDog", {
          description: session.description,
          dogArticle: dogArticle(dogName, data.dog?.sex, formats.locale),
          dogName,
        });
  const className = t("booking:waitlist.classLabel", {
    description: session.description,
    when: formats.formatActivityDate(start.date, start.time, null, "list"),
  });

  const claim = async () => {
    setPending("claim");
    setError(undefined);
    try {
      await startClaim(client, data.classSessionId, data.dogId, data.id);
    } catch (cause) {
      setError(errorText(t, cause));
      entry.refetch(true);
    } finally {
      setPending(undefined);
    }
  };

  const leave = async () => {
    setPending("leave");
    setError(undefined);
    try {
      await client.POST("/waitlist-entries/{id}/cancellation", {
        params: { path: { id: data.id } },
      });
      navigateInApp("/inici", { notice: { messageKey: "booking:waitlist.left", tone: "success" } });
    } catch (cause) {
      // The refusal stays in the dialog, where the member is; the entry is read again.
      setError(errorText(t, cause));
      entry.refetch(true);
    } finally {
      setPending(undefined);
    }
  };

  const errorNote =
    error === undefined ? null : (
      <p className="booking-note booking-note--danger" role="alert">
        {error}
      </p>
    );

  return (
    <section className="booking-screen">
      <BookingBar />
      <Card className="detail-card">
        <p className="detail-card__line">
          <strong className="detail-card__title">{title}</strong>
          <Badge tone={live ? "warning" : "neutral"}>
            {live ? t("enums:reservationState.WAITLISTED") : t(`enums:waitlistState.${data.state}`)}
          </Badge>
        </p>
        <p className="detail-card__when">{line}</p>
        {live && data.position !== null && data.position !== undefined ? (
          <p className="detail-card__booked">
            {t("booking:waitlist.position", { position: data.position })}
          </p>
        ) : null}
      </Card>
      {data.state === "NOTIFIED" ? (
        <>
          {data.confirmBy === null || data.confirmBy === undefined ? null : (
            <p className="booking-note booking-note--warning">
              <Icon aria-hidden="true" name="clock" />
              {t("booking:waitlist.confirmBy", { time: formats.formatTime(data.confirmBy) })}
            </p>
          )}
          <Button
            disabled={pending !== undefined}
            loading={pending === "claim"}
            loadingLabel={t("booking:confirm.sending")}
            onClick={() => void claim()}
          >
            {t("booking:waitlist.claim")}
          </Button>
        </>
      ) : null}
      {live ? (
        <Button
          disabled={pending !== undefined}
          onClick={() => {
            setError(undefined);
            setDialog(true);
          }}
          variant={data.state === "NOTIFIED" ? "ghost" : "primary"}
        >
          {t("booking:waitlist.leave")}
        </Button>
      ) : null}
      {dialog ? null : errorNote}
      {dialog ? (
        <Modal
          closeLabel={t("booking:confirm.close")}
          onClose={() => {
            if (pending === undefined) setDialog(false);
          }}
          open
          title={t("booking:waitlist.leaveDialog", { className })}
        >
          {errorNote}
          <div className="booking-dialog">
            <Button
              disabled={pending !== undefined}
              onClick={() => {
                setDialog(false);
              }}
              variant="ghost"
            >
              {t("booking:waitlist.back")}
            </Button>
            <Button
              loading={pending === "leave"}
              loadingLabel={t("booking:confirm.sending")}
              onClick={() => void leave()}
              variant="danger"
            >
              {t("booking:waitlist.leave")}
            </Button>
          </div>
        </Modal>
      ) : null}
    </section>
  );
}
