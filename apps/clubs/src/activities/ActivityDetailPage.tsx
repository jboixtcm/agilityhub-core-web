import { apiFieldErrors, isApiError, type ApiClient } from "@agilityhub/api-client";
import { useClubFormats } from "@agilityhub/i18n";
import {
  AppBar,
  Badge,
  Button,
  Card,
  EmptyState,
  FormField,
  Icon,
  Modal,
  SafeHtml,
  Skeleton,
  Textarea,
  Toast,
  type Tone,
} from "@agilityhub/ui";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import "./activities.css";
import type { LoadState, MemberActivityDetail } from "./shared";

type Dialog = "cancel" | "leave" | "waitlist";

interface Feedback {
  message: string;
  tone: Tone;
}

// `setTimeout` holds at most 2^31 − 1 ms (~24.8 days): a later deadline is reached in steps.
const MAX_TIMER_MS = 2_147_483_647;

/**
 * R-07-09: whether `now < deadline`, kept live: one timer to the deadline flips it when it
 * passes (no remount), and `recheck()` compares with the clock again on demand (a device that
 * slept past the deadline before its timer could fire).
 */
function useBeforeDeadline(deadline: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!Number.isFinite(deadline) || now >= deadline) return undefined;
    // A deadline that already passed (e.g. while the detail loaded) fires at once.
    const remaining = Math.max(deadline - Date.now(), 0);
    const timer = window.setTimeout(
      () => {
        setNow(Date.now());
      },
      Math.min(remaining, MAX_TIMER_MS),
    );
    return () => {
      window.clearTimeout(timer);
    };
  }, [deadline, now]);
  const recheck = useCallback(() => {
    const current = Date.now();
    setNow(current);
    return current < deadline;
  }, [deadline]);
  return { before: now < deadline, recheck };
}

function useActivityDetail(client: ApiClient, activityId: string) {
  const [state, setState] = useState<LoadState<MemberActivityDetail>>({ status: "loading" });
  const [reload, setReload] = useState(0);
  useEffect(() => {
    let current = true;
    void client.GET("/me/activities/{activityId}", { params: { path: { activityId } } }).then(
      (result) => {
        if (!current) return;
        setState(
          result.data === undefined
            ? { error: new TypeError("Missing activity"), status: "error" }
            : { data: result.data, status: "ready" },
        );
      },
      (error: unknown) => {
        if (current) setState({ error, status: "error" });
      },
    );
    return () => {
      current = false;
    };
  }, [activityId, client, reload]);
  const refetch = useCallback(() => {
    setReload((value) => value + 1);
  }, []);
  return { ...state, refetch };
}

function waitlistAvailable(error: unknown): boolean {
  if (!isApiError(error)) return false;
  const details = error.details as { waitlistAvailable?: unknown } | undefined;
  return details?.waitlistAvailable === true;
}

/**
 * A `VALIDATION_ERROR` about `field` (mapped by code): the core names it in `details.field` (e.g.
 * `CancellationDeadline.check` on `reason`) or in `details.fieldErrors[]`; both are accepted.
 */
function isFieldError(error: unknown, field: string): boolean {
  return (
    isApiError(error, "VALIDATION_ERROR") &&
    apiFieldErrors(error).some((entry) => entry.field === field)
  );
}

const REASON_MAX_LENGTH = 500;

/**
 * Activity detail of the app (`/activitats/:id`, S07 §2, no mockup): image, title, type, day and
 * hours, place, texts (rich text through `SafeHtml`), documents, registration deadline and places,
 * and the R-07-07/08/09 action by `myRegistration` / `rowState`.
 *
 * `impersonated` (R-07-09/10): the admin cancels «as the member» and the api requires a
 * `reason`, so the confirmation asks for «Motiu»; a member's own cancellation sends `{}`.
 */
export function ActivityDetailPage({
  activityId,
  client,
  impersonated = false,
}: {
  activityId: string;
  client: ApiClient;
  impersonated?: boolean;
}) {
  const { t } = useTranslation(["activities", "enums", "errors", "common"]);
  const formats = useClubFormats();
  const detail = useActivityDetail(client, activityId);
  const [dialog, setDialog] = useState<Dialog>();
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>();
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState<string>();
  // R-07-09: the api's deadline (never computed here), compared with the clock while open.
  const deadline = useBeforeDeadline(
    detail.status === "ready"
      ? Date.parse(detail.data.myRegistration?.cancellableUntil ?? detail.data.cancellableUntil)
      : Number.POSITIVE_INFINITY,
  );

  const bar = (
    <AppBar
      className="activities-screen__bar"
      start={
        <a
          aria-label={t("activities:detail.back")}
          className="activities-screen__back"
          href="/reservar"
        >
          <span aria-hidden="true">{t("activities:detail.backGlyph")}</span>
        </a>
      }
      title={<h1>{t("activities:detail.title")}</h1>}
    />
  );

  if (detail.status === "loading") {
    return (
      <section className="activities-screen">
        {bar}
        <Skeleton height="12rem" label={t("activities:detail.loading")} />
      </section>
    );
  }
  if (detail.status === "error") {
    const missing = isApiError(detail.error) && detail.error.status === 404;
    return (
      <section className="activities-screen">
        {bar}
        {missing ? (
          <EmptyState
            description={t("activities:detail.notAvailable")}
            title={t("common:unavailable.title")}
          />
        ) : (
          <Card className="activity-detail__error" role="alert">
            <p>{t("activities:detail.loadError")}</p>
            <Button onClick={detail.refetch} variant="secondary">
              {t("activities:detail.retry")}
            </Button>
          </Card>
        )}
      </section>
    );
  }

  const activity = detail.data;
  const mine = activity.myRegistration;
  const hours = activity.startTime ?? null;
  const place = !activity.location.atClub
    ? [activity.location.name, activity.location.address]
        .filter(Boolean)
        .join(t("activities:detail.placeSeparator"))
    : activity.allRings
      ? t("activities:detail.allRings")
      : activity.rings.map((ring) => ring.name).join(t("activities:detail.ringSeparator"));

  const fail = (cause: unknown) => {
    if (isApiError(cause, "ACTIVITY_FULL")) {
      if (waitlistAvailable(cause)) {
        setDialog("waitlist");
        return;
      }
      setFeedback({ message: t("errors:ACTIVITY_FULL"), tone: "danger" });
    } else {
      setFeedback({
        message: isApiError(cause)
          ? t(`errors:${cause.code}`, { defaultValue: t("activities:detail.error") })
          : t("activities:detail.error"),
        tone: "danger",
      });
    }
    detail.refetch();
  };

  const register = async (joinWaitlist: boolean) => {
    setPending(true);
    setFeedback(undefined);
    try {
      const result = await client.POST("/activity-registrations", {
        body: { activityId: activity.id, ...(joinWaitlist ? { joinWaitlist: true } : {}) },
        params: { header: { "Idempotency-Key": crypto.randomUUID() } },
      });
      setDialog(undefined);
      setFeedback({
        message:
          result.data?.state === "WAITLISTED"
            ? t("activities:detail.waitlisted")
            : t("activities:detail.registered"),
        tone: "success",
      });
      detail.refetch();
    } catch (cause) {
      setDialog(undefined);
      fail(cause);
    } finally {
      setPending(false);
    }
  };

  const cancel = async () => {
    if (mine === null || mine === undefined) return;
    // A confirmation left open past the deadline closes instead of sending (R-07-09).
    if (!deadline.recheck()) {
      setDialog(undefined);
      return;
    }
    setPending(true);
    setFeedback(undefined);
    setReasonError(undefined);
    try {
      await client.POST("/activity-registrations/{id}/cancellation", {
        body: impersonated ? { reason: reason.trim() } : {},
        params: { path: { id: mine.id } },
      });
      setDialog(undefined);
      setFeedback({
        message:
          mine.state === "WAITLISTED"
            ? t("activities:detail.left")
            : t("activities:detail.cancelled"),
        tone: "success",
      });
      detail.refetch();
    } catch (cause) {
      if (impersonated && isFieldError(cause, "reason")) {
        // The reason stays where the admin wrote it, inside the confirmation.
        setReasonError(t("activities:detail.reasonInvalid", { max: REASON_MAX_LENGTH }));
        return;
      }
      setDialog(undefined);
      fail(cause);
    } finally {
      setPending(false);
    }
  };

  const openCancellation = (next: "cancel" | "leave") => {
    // The deadline may have passed without the timer (a device that slept): check the clock.
    if (!deadline.recheck()) return;
    setReason("");
    setReasonError(undefined);
    setDialog(next);
  };

  const live = mine !== null && mine !== undefined && mine.state !== "CANCELLED" ? mine : undefined;
  let action = null;
  if (activity.state === "PUBLISHED") {
    if (live !== undefined) {
      action = deadline.before ? (
        <Button
          onClick={() => {
            openCancellation(live.state === "WAITLISTED" ? "leave" : "cancel");
          }}
          variant="secondary"
        >
          {live.state === "WAITLISTED"
            ? t("activities:detail.leaveWaitlistButton")
            : t("activities:detail.cancelButton")}
        </Button>
      ) : (
        <p className="activity-detail__note">{t("activities:detail.contactClubToCancel")}</p>
      );
    } else if (activity.registrationOpen && activity.rowState === "OPEN") {
      action = (
        <Button
          loading={pending}
          loadingLabel={t("activities:detail.sending")}
          onClick={() => void register(false)}
        >
          {t("activities:detail.registerButton")}
        </Button>
      );
    } else if (activity.registrationOpen && activity.rowState === "FULL_WAITLIST") {
      action = (
        <Button
          onClick={() => {
            setDialog("waitlist");
          }}
        >
          {t("activities:detail.joinWaitlistButton")}
        </Button>
      );
    } else if (activity.rowState === "FULL") {
      action = <p className="activity-detail__note">{t("activities:list.full")}</p>;
    }
  }

  return (
    <section className="activities-screen activity-detail">
      {bar}
      {feedback === undefined ? null : (
        <Toast
          dismissLabel={t("activities:detail.close")}
          onDismiss={() => {
            setFeedback(undefined);
          }}
          tone={feedback.tone}
        >
          {feedback.message}
        </Toast>
      )}
      {activity.image === null || activity.image === undefined ? null : (
        <img alt="" className="activity-detail__image" src={activity.image.url} />
      )}
      <header className="activity-detail__header">
        <h2>{activity.title}</h2>
        <Badge>{activity.typeDisplay}</Badge>
        {live === undefined ? null : (
          <Badge tone={live.state === "WAITLISTED" ? "warning" : "success"}>
            {/* The live rank in the queue (R-07-08, api E5-T20), not the stored `position`. */}
            {live.state !== "WAITLISTED"
              ? t("enums:activityRegistrationState.ACTIVE")
              : live.waitlistRank === null
                ? t("enums:activityRegistrationState.WAITLISTED")
                : t("activities:detail.waitlistPosition", { position: live.waitlistRank })}
          </Badge>
        )}
      </header>
      <ul className="activity-detail__facts">
        <li>
          <Icon aria-hidden="true" name="cal" />
          {formats.formatActivityDate(activity.date, hours, activity.endTime, "long")}
        </li>
        {place === "" ? null : (
          <li>
            <Icon aria-hidden="true" name="flag" />
            {place}
          </li>
        )}
        <li>
          <Icon aria-hidden="true" name="clock" />
          {t("activities:detail.registrationUntil", {
            date: formats.formatPlainDate(activity.registrationTo, "dayMonth"),
          })}
        </li>
        <li>
          <Icon aria-hidden="true" name="user" />
          {activity.maxPlaces === null || activity.maxPlaces === undefined
            ? t("activities:list.open")
            : t("activities:detail.freeSeats", {
                count: activity.freeSeats ?? 0,
                max: activity.maxPlaces,
              })}
        </li>
      </ul>
      {activity.shortDescription === null || activity.shortDescription === undefined ? null : (
        <p className="activity-detail__short">{activity.shortDescription}</p>
      )}
      <SafeHtml className="activity-detail__long" html={activity.longDescriptionHtml} />
      {activity.documents.length === 0 ? null : (
        <section aria-labelledby="activity-documents" className="activity-detail__documents">
          <h3 id="activity-documents">{t("activities:detail.documents")}</h3>
          {activity.documents.map((document) => (
            <a href={document.url} key={document.id} rel="noreferrer" target="_blank">
              <Icon aria-hidden="true" name="doc" />
              {document.name}
            </a>
          ))}
        </section>
      )}
      <div className="activity-detail__action">{action}</div>

      {dialog === "waitlist" ? (
        <Modal
          closeLabel={t("activities:detail.close")}
          onClose={() => {
            setDialog(undefined);
          }}
          open
          title={t("activities:detail.waitlistQuestion", { title: activity.title })}
        >
          <div className="activity-detail__dialog">
            <Button
              onClick={() => {
                setDialog(undefined);
              }}
              variant="ghost"
            >
              {t("activities:detail.back")}
            </Button>
            <Button
              loading={pending}
              loadingLabel={t("activities:detail.sending")}
              onClick={() => void register(true)}
            >
              {t("activities:detail.joinWaitlistButton")}
            </Button>
          </div>
        </Modal>
      ) : null}
      {(dialog === "cancel" || dialog === "leave") && (deadline.before || pending) ? (
        <Modal
          closeLabel={t("activities:detail.close")}
          onClose={() => {
            setDialog(undefined);
          }}
          open
          title={
            dialog === "leave"
              ? t("activities:detail.leaveQuestion", { title: activity.title })
              : t("activities:detail.cancelQuestion", { title: activity.title })
          }
        >
          {impersonated ? (
            <FormField
              {...(reasonError === undefined ? {} : { error: reasonError })}
              help={t("activities:detail.reasonHelp")}
              id="activity-cancel-reason"
              label={t("activities:detail.reason")}
            >
              <Textarea
                aria-describedby={
                  reasonError === undefined ? undefined : "activity-cancel-reason-error"
                }
                aria-invalid={reasonError === undefined ? undefined : true}
                disabled={pending}
                id="activity-cancel-reason"
                maxLength={REASON_MAX_LENGTH}
                onChange={(event) => {
                  setReason(event.currentTarget.value);
                  setReasonError(undefined);
                }}
                required
                rows={3}
                value={reason}
              />
            </FormField>
          ) : null}
          <div className="activity-detail__dialog">
            <Button
              onClick={() => {
                setDialog(undefined);
              }}
              variant="ghost"
            >
              {t("activities:detail.back")}
            </Button>
            <Button
              disabled={impersonated && reason.trim() === ""}
              loading={pending}
              loadingLabel={t("activities:detail.sending")}
              onClick={() => void cancel()}
              variant="danger"
            >
              {dialog === "leave"
                ? t("activities:detail.leaveWaitlistButton")
                : t("activities:detail.cancelButton")}
            </Button>
          </div>
        </Modal>
      ) : null}
    </section>
  );
}
