import type { ApiClient, components } from "@agilityhub/api-client";
import { useClubFormats } from "@agilityhub/i18n";
import {
  AppBar,
  Avatar,
  Badge,
  Button,
  Card,
  Chip,
  Icon,
  IconButton,
  Skeleton,
  Toast,
  type Tone,
  useBranding,
} from "@agilityhub/ui";
import { type MouseEvent, useCallback, useState } from "react";
import { useTranslation } from "react-i18next";

import {
  navigateInApp,
  noticeText,
  pageNotice,
  type PageNotice,
  useLoader,
} from "../booking/shared";

import "./instructor.css";
import { bareWeekday, readErrorText, studentName } from "./shared";

type LastClass = components["schemas"]["LastClass"];

const DISPLAY_TONES: Readonly<Record<LastClass["displayState"], Tone>> = {
  CANCELLED_LATE: "warning",
  NO_SHOW: "danger",
  NOTIFIED: "warning",
  PENDING: "neutral",
  PRESENT: "success",
};

function openInApp(event: MouseEvent<HTMLAnchorElement>, path: string) {
  event.preventDefault();
  navigateInApp(path);
}

/**
 * Screen 22 «Fitxa d'alumne» (`/instructor/alumnes/:dogId`, S10 §2, R-10-08, R-10-09): the api's
 * card as delivered — its 30-day metrics («—» without classes), the five last classes with their
 * `displayState`, and the three TASKS blocks when the club has the module.
 */
export function StudentCardPage({ client, dogId }: { client: ApiClient; dogId: string }) {
  const { t } = useTranslation(["instructor", "enums", "errors"]);
  const branding = useBranding();
  const formats = useClubFormats();
  const load = useCallback(async () => {
    const { data } = await client.GET("/dogs/{id}/instructor-card", {
      params: { path: { id: dogId } },
    });
    if (data === undefined) throw new TypeError("The card response did not contain data");
    return data;
  }, [client, dogId]);
  const card = useLoader(load);
  // Screen 26 sends a caller back here when the club has no TASKS (`errors:MODULE_DISABLED`).
  const [notice, setNotice] = useState<PageNotice | undefined>(pageNotice);
  const tasksModule = branding.modules.includes("TASKS");
  const trainingModule = branding.modules.includes("FREE_TRAINING");
  const tasksPath = `/instructor/alumnes/${encodeURIComponent(dogId)}/tasques`;

  const back = () => {
    if (window.history.length > 1) window.history.back();
    else navigateInApp("/instructor/alumnes");
  };
  const bar = (
    <AppBar
      className="instructor-screen__bar"
      end={
        <a
          aria-label={t("instructor:card.search")}
          className="instructor-screen__search"
          href="/instructor/alumnes"
          onClick={(event) => {
            openInApp(event, "/instructor/alumnes");
          }}
        >
          <Icon aria-hidden="true" name="search" />
        </a>
      }
      start={
        <IconButton
          className="instructor-screen__back"
          icon="chev"
          label={t("instructor:card.back")}
          onClick={back}
        />
      }
      title={<h1>{t("instructor:card.title")}</h1>}
    />
  );
  const noticeToast =
    notice === undefined ? null : (
      <Toast
        dismissLabel={t("instructor:tasks.close")}
        onDismiss={() => {
          setNotice(undefined);
        }}
        tone={notice.tone}
      >
        {noticeText(t, notice)}
      </Toast>
    );

  if (card.status !== "ready") {
    return (
      <section className="instructor-screen instructor-card">
        {bar}
        {noticeToast}
        {card.status === "loading" ? (
          <Skeleton
            className="instructor-screen__skeleton"
            height="18rem"
            label={t("instructor:card.loading")}
          />
        ) : (
          <Toast tone="danger">
            <span className="instructor-screen__error">
              {readErrorText(t, card.error, t("instructor:card.loadError"))}
              <Button
                onClick={() => {
                  card.refetch();
                }}
                variant="secondary"
              >
                {t("instructor:card.retry")}
              </Button>
            </span>
          </Toast>
        )}
      </section>
    );
  }

  const { dog, member, metrics } = card.data;
  const name = studentName(t, {
    dogName: dog.name,
    handlerName: dog.handlerName,
    memberFirstName: member.firstName,
  });
  const age = dog.ageYears == null ? undefined : t("instructor:card.age", { count: dog.ageYears });
  const breed = dog.breed ?? undefined;
  const subtitle =
    breed !== undefined && age !== undefined
      ? t("instructor:card.breedAge", { age, breed })
      : (breed ?? age);
  const level = card.data.level;
  const trainings =
    trainingModule && metrics.trainingsPerWeek !== undefined
      ? new Intl.NumberFormat(formats.locale, {
          maximumFractionDigits: 1,
          minimumFractionDigits: 1,
        }).format(metrics.trainingsPerWeek)
      : undefined;
  const note = tasksModule ? card.data.instructorNote : undefined;
  const tasks = tasksModule ? card.data.tasks : undefined;
  const observations = tasksModule ? card.data.observations : undefined;

  return (
    <section className="instructor-screen instructor-card">
      {bar}
      {noticeToast}
      <Card className="instructor-card__header">
        <div className="instructor-card__who">
          {dog.photoUrl == null ? (
            <Avatar kind="dog" name={dog.name} />
          ) : (
            <img
              alt={t("instructor:card.photo", { dog: dog.name })}
              className="instructor-card__photo"
              src={dog.photoUrl}
            />
          )}
          <div className="instructor-card__name">
            <h2>{name}</h2>
            {dog.handlerName == null || dog.handlerName === member.firstName ? null : (
              <p>{t("instructor:student.owner", { name: member.fullName })}</p>
            )}
            {subtitle === undefined ? null : <p>{subtitle}</p>}
          </div>
          <div className="instructor-card__chips">
            {level == null ? null : (
              <Chip className="instructor-level">
                {level.assignedAt == null
                  ? level.code
                  : t("instructor:card.level", {
                      code: level.code,
                      since: formats.formatMonthsSince(level.assignedAt),
                    })}
              </Chip>
            )}
            {dog.status === "ACTIVE" ? null : (
              <Chip tone="danger">{t("instructor:card.left")}</Chip>
            )}
          </div>
        </div>
        <dl className="instructor-card__metrics">
          <div>
            <dt>{t("instructor:card.attendance30")}</dt>
            <dd>
              {metrics.attendancePct == null
                ? t("instructor:card.noValue")
                : t("instructor:card.percent", { value: metrics.attendancePct })}
            </dd>
          </div>
          <div>
            <dt>{t("instructor:card.classes30")}</dt>
            <dd>{metrics.classesCounted}</dd>
          </div>
          {trainings === undefined ? null : (
            <div>
              <dt>{t("instructor:card.trainings30")}</dt>
              <dd>{trainings}</dd>
            </div>
          )}
        </dl>
      </Card>
      <h2 className="instructor-screen__section">{t("instructor:card.lastClasses")}</h2>
      <Card className="instructor-card__classes">
        {card.data.lastClasses.length === 0 ? (
          <p>{t("instructor:card.noClasses")}</p>
        ) : (
          <ul>
            {card.data.lastClasses.map((item) => (
              <li key={item.bookingId}>
                <span className="instructor-card__date">
                  {t("instructor:card.lastClassDate", {
                    date: formats.formatPlainDate(item.date, "dayMonthNumeric"),
                    weekday: bareWeekday(formats.formatPlainDate(item.date, "weekdayShort")),
                  })}
                </span>
                <span className="instructor-card__class">
                  {item.instructorName == null
                    ? item.displayDescription
                    : t("instructor:card.lastClassLine", {
                        description: item.displayDescription,
                        instructor: item.instructorName,
                      })}
                </span>
                <Badge tone={DISPLAY_TONES[item.displayState]}>
                  {item.displayState === "PRESENT" ? (
                    <>
                      <Icon aria-hidden="true" name="check" />
                      <span className="ah-sr-only">{t("enums:attendanceStateShort.PRESENT")}</span>
                    </>
                  ) : (
                    t(`enums:attendanceStateShort.${item.displayState}`)
                  )}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </Card>
      {note === undefined ? null : (
        <>
          <h2 className="instructor-screen__section">{t("instructor:card.memberNotes")}</h2>
          <Card className="instructor-card__block">
            <p>{note.text ?? t("instructor:card.noValue")}</p>
            {note.attachments.length === 0 ? null : (
              <p className="instructor-card__clips">
                {note.attachments.map((attachment) => (
                  <a
                    href={attachment.url}
                    key={attachment.id}
                    rel="noopener noreferrer"
                    target="_blank"
                  >
                    <Icon aria-hidden="true" name="clip" /> {attachment.name}
                  </a>
                ))}
              </p>
            )}
          </Card>
        </>
      )}
      {tasks === undefined ? null : (
        <>
          <h2 className="instructor-screen__section">{t("instructor:card.tasks")}</h2>
          <Card className="instructor-card__block">
            <p className="instructor-card__tasks">
              <Badge tone="warning">
                {t("instructor:card.taskPending", { count: tasks.pendingCount })}
              </Badge>
              <Badge tone="success">
                {t("instructor:card.taskDone", { count: tasks.doneCount })}
              </Badge>
              <a
                className="instructor-card__manage-link"
                href={tasksPath}
                onClick={(event) => {
                  openInApp(event, tasksPath);
                }}
              >
                {t("instructor:card.manageLink")}
              </a>
            </p>
            {tasks.latest == null ? null : (
              <>
                <p>{tasks.latest.text}</p>
                <p className="instructor-card__meta">
                  {t("instructor:card.latestTask", {
                    author: tasks.latest.createdByName,
                    date: formats
                      .formatDate(tasks.latest.createdAt, "dayMonthNumeric")
                      .replaceAll("/", "-"),
                  })}
                </p>
              </>
            )}
          </Card>
        </>
      )}
      {observations === undefined ? null : (
        <>
          <h2 className="instructor-screen__section">{t("instructor:card.observations")}</h2>
          <Card className="instructor-card__block instructor-card__block--private">
            <p>{observations.text ?? t("instructor:card.noValue")}</p>
            {observations.attachments.length === 0 ? null : (
              <p className="instructor-card__clips">
                {observations.attachments.map((attachment) => (
                  <a
                    href={attachment.url}
                    key={attachment.id}
                    rel="noopener noreferrer"
                    target="_blank"
                  >
                    <Icon aria-hidden="true" name="clip" /> {attachment.name}
                  </a>
                ))}
              </p>
            )}
            <p className="instructor-card__meta">
              <Icon aria-hidden="true" name="lock" /> {t("instructor:card.observationsHint")}
            </p>
          </Card>
        </>
      )}
      {tasksModule ? (
        <a
          className="ah-button ah-button--secondary instructor-card__manage"
          href={tasksPath}
          onClick={(event) => {
            openInApp(event, tasksPath);
          }}
        >
          <span className="ah-button__content">
            <Icon aria-hidden="true" name="edit" /> {t("instructor:card.manageButton")}
          </span>
        </a>
      ) : null}
    </section>
  );
}
