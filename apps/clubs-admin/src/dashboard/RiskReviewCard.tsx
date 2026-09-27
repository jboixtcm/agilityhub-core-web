import { type ApiClient, type components, isApiError } from "@agilityhub/api-client";
import { useClubFormats } from "@agilityhub/i18n";
import { Badge, Button, Card, Icon, Skeleton, type Tone } from "@agilityhub/ui";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { mondayOf } from "../planning/shared";

type RiskReviewForm = components["schemas"]["RiskReviewForm"];
type RiskReviewItem = components["schemas"]["RiskReviewItem"];

/** The card shows at most this many rows; the rest open D4 on the first of them (E3-W02). */
const RISK_ROWS = 6;

const STATUS_TONES: Readonly<Record<RiskReviewItem["status"], Tone>> = {
  AT_RISK: "warning",
  AUTO_CANCELLED: "danger",
  WILL_CANCEL: "neutral",
  WILL_REVIEW: "warning",
};

/** «7:30» from a club-local «07:30». */
function clockTime(value: string): string {
  return value.replace(/^0(?=\d:)/u, "");
}

/** D4 on the class's week with the class selected; a cancelled class lives under «Anul·lades». */
export function riskReviewPath(item: RiskReviewItem): string {
  const query = new URLSearchParams({
    classe: item.classId,
    estat: item.status === "AUTO_CANCELLED" ? "anul·lades" : "actives",
    setmana: mondayOf(item.date),
  });
  return `/calendari?${query.toString()}`;
}

/**
 * D1 «Revisió de classes en risc» (S15 §2 and §6 form A, `GET /risk-review`; S14 R-14-06 names it
 * the card's single source): one row per class the api lists, with the status it decided. Every
 * day and hour is club-local. Exported for S14's D1 (E9).
 */
export function RiskReviewCard({
  client,
  onNavigate,
}: {
  client: ApiClient;
  onNavigate: (path: string) => void;
}) {
  const formats = useClubFormats();
  const { t } = useTranslation(["admin-dashboard", "errors"]);
  const [review, setReview] = useState<RiskReviewForm>();
  const [error, setError] = useState<unknown>();
  const [request, setRequest] = useState(0);

  const load = useCallback(() => {
    client.GET("/risk-review").then(
      ({ data }) => {
        if (data === undefined) return;
        setReview(data);
        setError(undefined);
      },
      (cause: unknown) => {
        setError(cause);
      },
    );
  }, [client]);

  useEffect(() => {
    load();
    // S14 §2: D1 reads again when the window gets the focus back.
    window.addEventListener("focus", load);
    return () => {
      window.removeEventListener("focus", load);
    };
  }, [load, request]);

  const dayOf = (item: RiskReviewItem) =>
    item.dayLabel === "OTHER"
      ? formats.formatPlainDate(item.date, "weekdayShort").replaceAll(/[.,]/gu, "")
      : t(`admin-dashboard:risk.day.${item.dayLabel}`);

  const statusText = (item: RiskReviewItem) => {
    const names = item.notified
      .map((person) =>
        t("admin-dashboard:risk.name", { dog: person.dogName, member: person.memberName }),
      )
      .join(", ");
    switch (item.status) {
      case "AUTO_CANCELLED":
      case "AT_RISK": {
        const status = t(`admin-dashboard:risk.status.${item.status}`);
        return names === ""
          ? status
          : `${status} · ${t(`admin-dashboard:risk.notified.${item.status}`, { names })}`;
      }
      case "WILL_CANCEL": {
        // `reviewAt` is the class day's review instant (S15 §6): its club-local day and time.
        const reviewAt = item.reviewAt;
        const sameDay =
          reviewAt === null ||
          reviewAt === undefined ||
          formats.formatDate(reviewAt, "short") === formats.formatPlainDate(item.date, "short");
        return t("admin-dashboard:risk.status.WILL_CANCEL", {
          day: sameDay
            ? dayOf(item)
            : formats.formatDate(reviewAt, "weekdayShort").replaceAll(/[.,]/gu, ""),
          time:
            reviewAt === null || reviewAt === undefined
              ? clockTime(review?.reviewTime ?? "")
              : clockTime(formats.formatTime(reviewAt)),
        });
      }
      default:
        return t("admin-dashboard:risk.status.WILL_REVIEW");
    }
  };

  if (review === undefined) {
    return (
      <Card className="dashboard-risk">
        {error === undefined ? (
          <Skeleton label={t("admin-dashboard:risk.loading")} />
        ) : (
          <p role="alert">
            {isApiError(error)
              ? t(`errors:${error.code}`, { defaultValue: t("admin-dashboard:risk.error") })
              : t("admin-dashboard:risk.error")}{" "}
            <Button
              onClick={() => {
                setError(undefined);
                setRequest((value) => value + 1);
              }}
              variant="ghost"
            >
              {t("admin-dashboard:common.retry")}
            </Button>
          </p>
        )}
      </Card>
    );
  }

  const hidden = review.items.slice(RISK_ROWS);
  const firstHidden = hidden[0];
  return (
    <Card className="dashboard-risk">
      <header>
        <h2>
          <Icon aria-hidden="true" name="warn" />{" "}
          {t("admin-dashboard:risk.title", {
            days: review.lookaheadDays,
            time: clockTime(review.reviewTime),
          })}
        </h2>
        <Badge tone={review.items.length > 0 ? "warning" : "neutral"}>
          {t("admin-dashboard:risk.alerts", { count: review.items.length })}
        </Badge>
      </header>
      {review.items.length === 0 ? (
        <p>{t("admin-dashboard:risk.empty")}</p>
      ) : (
        review.items.slice(0, RISK_ROWS).map((item) => (
          <article className="dashboard-risk__row" data-class-id={item.classId} key={item.classId}>
            <a
              href={riskReviewPath(item)}
              onClick={(event) => {
                event.preventDefault();
                onNavigate(riskReviewPath(item));
              }}
            >
              <strong>{item.displayDescription}</strong> · {dayOf(item)} {clockTime(item.startTime)}
              {item.ringName === null || item.ringName === undefined ? "" : ` · ${item.ringName}`}
            </a>
            <span className="dashboard-risk__booked">
              {t("admin-dashboard:risk.booked", { count: item.bookedCount })}
            </span>
            <Badge tone={STATUS_TONES[item.status]}>{statusText(item)}</Badge>
          </article>
        ))
      )}
      {firstHidden === undefined ? null : (
        <a
          className="dashboard-risk__more"
          href={riskReviewPath(firstHidden)}
          onClick={(event) => {
            event.preventDefault();
            onNavigate(riskReviewPath(firstHidden));
          }}
        >
          {t("admin-dashboard:risk.more", { count: hidden.length })}
        </a>
      )}
    </Card>
  );
}
