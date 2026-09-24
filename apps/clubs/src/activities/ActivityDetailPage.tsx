import { isApiError, type ApiClient } from "@agilityhub/api-client";
import { useClubFormats } from "@agilityhub/i18n";
import {
  AppBar,
  Badge,
  Button,
  Card,
  EmptyState,
  Icon,
  Modal,
  SafeHtml,
  Skeleton,
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

function useActivityDetail(client: ApiClient, activityId: string) {
  const [state, setState] = useState<LoadState<MemberActivityDetail>>({ status: "loading" });
  const [loadedAt, setLoadedAt] = useState(0);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    let current = true;
    void client.GET("/me/activities/{activityId}", { params: { path: { activityId } } }).then(
      (result) => {
        if (!current) return;
        setLoadedAt(Date.now());
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
  return { ...state, loadedAt, refetch };
}

function waitlistAvailable(error: unknown): boolean {
  if (!isApiError(error)) return false;
  const details = error.details as { waitlistAvailable?: unknown } | undefined;
  return details?.waitlistAvailable === true;
}

/**
 * Activity detail of the app (`/activitats/:id`, S07 §2, no mockup): image, title, type, day and
 * hours, place, texts (rich text through `SafeHtml`), documents, registration deadline and places,
 * and the R-07-07/08/09 action by `myRegistration` / `rowState`.
 */
export function ActivityDetailPage({
  activityId,
  client,
}: {
  activityId: string;
  client: ApiClient;
}) {
  const { t } = useTranslation(["activities", "enums", "errors", "common"]);
  const formats = useClubFormats();
  const detail = useActivityDetail(client, activityId);
  const [dialog, setDialog] = useState<Dialog>();
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>();

  const bar = (
    <AppBar
      className="activities-screen__bar"
      start={
        <a
          aria-label={t("activities:detail.back")}
          className="activities-screen__back"
          href="/reservar"
        >
          <span aria-hidden="true">‹</span>
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
  // R-07-09: the deadline is compared with the moment the detail was (re)loaded.
  const beforeDeadline =
    detail.loadedAt < Date.parse(mine?.cancellableUntil ?? activity.cancellableUntil);
  const hours = activity.startTime ?? null;
  const place = !activity.location.atClub
    ? [activity.location.name, activity.location.address].filter(Boolean).join(" · ")
    : activity.allRings
      ? t("activities:detail.allRings")
      : activity.rings.map((ring) => ring.name).join(", ");

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
    setPending(true);
    setFeedback(undefined);
    try {
      await client.POST("/activity-registrations/{id}/cancellation", {
        body: {},
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
      setDialog(undefined);
      fail(cause);
    } finally {
      setPending(false);
    }
  };

  const live = mine !== null && mine !== undefined && mine.state !== "CANCELLED" ? mine : undefined;
  let action = null;
  if (activity.state === "PUBLISHED") {
    if (live !== undefined) {
      action = beforeDeadline ? (
        <Button
          onClick={() => {
            setDialog(live.state === "WAITLISTED" ? "leave" : "cancel");
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
            {live.state === "WAITLISTED"
              ? t("activities:detail.waitlistPosition", { position: live.position ?? "" })
              : t("enums:activityRegistrationState.ACTIVE")}
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
      {dialog === "cancel" || dialog === "leave" ? (
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
