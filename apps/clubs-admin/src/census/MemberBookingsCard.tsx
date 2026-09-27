import { type ApiClient, type components, isApiError, listFields } from "@agilityhub/api-client";
import { useClubFormats } from "@agilityhub/i18n";
import { Badge, Button, Card, DataTable, type Tone, useBranding } from "@agilityhub/ui";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { timeLabel } from "../planning/calendar-shared";
import { BOOKING_STATE_TONES } from "../planning/ClassRegistrantsPanel";

type BookingRow = components["schemas"]["BookingListItem"];
type TrainingRow = components["schemas"]["TrainingBookingListItem"];

/** The first page of each table (CONVENCIONS_API §4 sizes); the rest behind «Veure'ls tots ›». */
const FIRST_PAGE = 20;
/** «Veure'ls tots» of the classes: the api's largest page (no back-office list shows them yet). */
const ALL_PAGE = 1000;

const BOOKING_FIELDS = ["classStartsAt", "dogName", "state", "origin", "late"] as const;
const TRAINING_FIELDS = [
  "date",
  "startsAtLocal",
  "ringName",
  "dogName",
  "state",
  "origin",
] as const;

const TRAINING_STATE_TONES: Readonly<Record<NonNullable<TrainingRow["state"]>, Tone>> = {
  ACTIVE: "success",
  CANCELLED: "neutral",
  CANCELLED_BY_CLUB: "danger",
};

/** «dl 10/08»: the club formatter's short weekday (without its dot) and the numeric day. */
function shortDay(weekday: string, dayMonth: string): string {
  return `${weekday.replaceAll(/[.,]/gu, "")} ${dayMonth}`;
}

type Page<Row> =
  | { status: "loading" }
  | { error: unknown; status: "error" }
  | { rows: Row[]; status: "ready"; totalPages: number };

function usePage<Row>(load: () => Promise<{ items: Row[]; totalPages: number }>, key: string) {
  const [state, setState] = useState<Page<Row> & { key: string }>({ key: "", status: "loading" });
  const [reload, setReload] = useState(0);
  const requestKey = `${key}|${String(reload)}`;
  useEffect(() => {
    let current = true;
    load().then(
      (data) => {
        if (current) {
          setState({
            key: requestKey,
            rows: data.items,
            status: "ready",
            totalPages: data.totalPages,
          });
        }
      },
      (error: unknown) => {
        if (current) setState({ error, key: requestKey, status: "error" });
      },
    );
    return () => {
      current = false;
    };
    // `load` is rebuilt on every render; the request identity is `requestKey`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestKey]);
  const view: Page<Row> = state.key === requestKey ? state : { status: "loading" };
  return {
    ...view,
    retry: () => {
      setReload((value) => value + 1);
    },
  };
}

/**
 * D10 «Reserves» (S08 §2, S09 §2): the member's class bookings (`GET /bookings`) and, with
 * `FREE_TRAINING`, training bookings (`GET /training-bookings`), newest first. Read-only for every
 * role: an administrator books or cancels through «Entra com l'abonat» (R-08-19).
 */
export function MemberBookingsCard({
  client,
  memberId,
  onNavigate = (path) => {
    window.location.assign(path);
  },
}: {
  client: ApiClient;
  memberId: string;
  onNavigate?: (path: string) => void;
}) {
  const branding = useBranding();
  const formats = useClubFormats();
  const { t } = useTranslation(["admin-census", "admin-training", "enums", "errors"]);
  const trainingEnabled = branding.modules.includes("FREE_TRAINING");
  const [allClasses, setAllClasses] = useState(false);
  const memberFilter = `memberId:eq:${memberId}`;

  const classes = usePage<BookingRow>(
    async () => {
      const result = await client.GET("/bookings", {
        params: {
          query: {
            fields: listFields(BOOKING_FIELDS),
            filter: [memberFilter],
            page: 0,
            size: allClasses ? ALL_PAGE : FIRST_PAGE,
            sort: ["classStartsAt,desc"],
          },
        },
      });
      if (result.data === undefined) throw new TypeError("Booking list without data");
      return result.data;
    },
    `${memberId}|${String(allClasses)}`,
  );

  const trainings = usePage<TrainingRow>(
    async () => {
      if (!trainingEnabled) return { items: [], totalPages: 0 };
      const result = await client.GET("/training-bookings", {
        params: {
          query: {
            fields: listFields(TRAINING_FIELDS),
            filter: [memberFilter],
            page: 0,
            size: FIRST_PAGE,
            sort: ["startsAt,desc"],
          },
        },
      });
      if (result.data === undefined) throw new TypeError("Training list without data");
      return result.data;
    },
    `${memberId}|${String(trainingEnabled)}`,
  );

  const empty = t("admin-census:values.empty");
  const failure = (error: unknown, retry: () => void) => (
    <p className="member-bookings__error" role="alert">
      {isApiError(error)
        ? t(`errors:${error.code}`, { defaultValue: t("admin-census:bookings.error") })
        : t("admin-census:bookings.error")}{" "}
      <Button onClick={retry} variant="ghost">
        {t("admin-census:bookings.retry")}
      </Button>
    </p>
  );
  const trainingListPath = `/entrenaments?${new URLSearchParams([
    ["vista", "reserves"],
    ["filter", memberFilter],
    ["sort", "startsAt,desc"],
  ]).toString()}`;

  return (
    <Card aria-labelledby="member-bookings-title" className="member-bookings" role="region">
      <h2 className="census-record__section-title" id="member-bookings-title">
        {t("admin-census:bookings.title")}
      </h2>
      <p className="member-bookings__note">{t("admin-census:bookings.actAsMember")}</p>

      <h3>{t("admin-census:bookings.classes")}</h3>
      {classes.status === "error" ? (
        failure(classes.error, classes.retry)
      ) : (
        <DataTable<BookingRow>
          caption={t("admin-census:bookings.classes")}
          columns={[
            {
              header: t("admin-census:bookings.columns.when"),
              key: "when",
              render: (row) =>
                row.classStartsAt === undefined
                  ? empty
                  : t("admin-census:bookings.when", {
                      day: shortDay(
                        formats.formatDate(row.classStartsAt, "weekdayShort"),
                        formats.formatDate(row.classStartsAt, "dayMonthNumeric"),
                      ),
                      time: timeLabel(formats.formatTime(row.classStartsAt)),
                    }),
            },
            {
              header: t("admin-census:bookings.columns.dog"),
              key: "dog",
              render: (row) => row.dogName ?? empty,
            },
            {
              header: t("admin-census:bookings.columns.state"),
              key: "state",
              render: (row) =>
                row.state === undefined ? (
                  empty
                ) : (
                  <Badge tone={BOOKING_STATE_TONES[row.state]}>
                    {t(`enums:bookingState.${row.state}`)}
                  </Badge>
                ),
            },
            {
              header: t("admin-census:bookings.columns.origin"),
              key: "origin",
              render: (row) =>
                row.origin === undefined ? empty : t(`enums:bookingOrigin.${row.origin}`),
            },
          ]}
          empty={t("admin-census:bookings.noClasses")}
          loading={classes.status === "loading"}
          loadingLabel={t("admin-census:bookings.loading")}
          rowKey={(row) => row.id}
          rows={classes.status === "ready" ? classes.rows : []}
        />
      )}
      {classes.status === "ready" && classes.totalPages > 1 && !allClasses ? (
        <Button
          className="member-bookings__more"
          onClick={() => {
            setAllClasses(true);
          }}
          variant="ghost"
        >
          {t("admin-census:bookings.seeAll")}
        </Button>
      ) : null}

      {trainingEnabled ? (
        <>
          <h3>{t("admin-census:bookings.trainings")}</h3>
          {trainings.status === "error" ? (
            failure(trainings.error, trainings.retry)
          ) : (
            <DataTable<TrainingRow>
              caption={t("admin-census:bookings.trainings")}
              columns={[
                {
                  header: t("admin-census:bookings.columns.when"),
                  key: "when",
                  render: (row) =>
                    row.date === undefined || row.startsAtLocal === undefined
                      ? empty
                      : t("admin-census:bookings.when", {
                          day: shortDay(
                            formats.formatPlainDate(row.date, "weekdayShort"),
                            formats.formatPlainDate(row.date, "dayMonthNumeric"),
                          ),
                          time: timeLabel(row.startsAtLocal),
                        }),
                },
                {
                  header: t("admin-census:bookings.columns.ring"),
                  key: "ring",
                  render: (row) => row.ringName ?? empty,
                },
                {
                  header: t("admin-census:bookings.columns.dog"),
                  key: "dog",
                  render: (row) => row.dogName ?? empty,
                },
                {
                  header: t("admin-census:bookings.columns.state"),
                  key: "state",
                  render: (row) =>
                    row.state === undefined ? (
                      empty
                    ) : (
                      <Badge tone={TRAINING_STATE_TONES[row.state]}>
                        {t(`enums:trainingBookingState.${row.state}`)}
                      </Badge>
                    ),
                },
                {
                  header: t("admin-census:bookings.columns.origin"),
                  key: "origin",
                  render: (row) =>
                    row.origin === undefined ? empty : t(`enums:trainingOrigin.${row.origin}`),
                },
              ]}
              empty={t("admin-census:bookings.noTrainings")}
              loading={trainings.status === "loading"}
              loadingLabel={t("admin-census:bookings.loading")}
              rowKey={(row) => row.id}
              rows={trainings.status === "ready" ? trainings.rows : []}
            />
          )}
          {trainings.status === "ready" && trainings.totalPages > 1 ? (
            <a
              className="member-bookings__more"
              href={trainingListPath}
              onClick={(event) => {
                event.preventDefault();
                onNavigate(trainingListPath);
              }}
            >
              {t("admin-census:bookings.seeAll")}
            </a>
          ) : null}
        </>
      ) : null}
    </Card>
  );
}
