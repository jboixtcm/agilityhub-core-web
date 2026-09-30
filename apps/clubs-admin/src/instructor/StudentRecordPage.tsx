import {
  type ApiClient,
  type components,
  type FollowupTask,
  useDogFollowup,
} from "@agilityhub/api-client";
import { useClubFormats, useFollowupTexts } from "@agilityhub/i18n";
import {
  Badge,
  Button,
  Card,
  Chip,
  DataTable,
  DogFollowupEditor,
  Drawer,
  FollowupHistoryDrawer,
  Icon,
  Skeleton,
  Toast,
  type Tone,
  useBranding,
} from "@agilityhub/ui";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import "./student-record.css";

type LastClass = components["schemas"]["LastClass"];
type CardAttachment = components["schemas"]["CardAttachment"];

const DISPLAY_TONES: Readonly<Record<LastClass["displayState"], Tone>> = {
  CANCELLED_LATE: "warning",
  NO_SHOW: "danger",
  NOTIFIED: "warning",
  PENDING: "neutral",
  PRESENT: "success",
};

/**
 * D13 «Fitxa d'alumne» (`/alumnes/:id`, S10 §2, R-10-00, R-10-08, R-10-09): the aggregate of
 * screen 22 (`GET /dogs/{id}/instructor-card`) laid out for 1280 px — the header with the level,
 * «Abonat/Abonada» and the dog, four metric cards with their subtitles, the member's note, the
 * tasks (the api's list, `GET /tasks`), the private observations and the «5 darreres classes»
 * table; [GESTIONAR TASQUES I NOTES] opens the same editor as screen 26 in a drawer. The three
 * blocks and the button need TASKS; nothing is recomputed here.
 */
export function StudentRecordPage({ client, dogId }: { client: ApiClient; dogId: string }) {
  const { t } = useTranslation(["instructor", "enums", "errors"]);
  const branding = useBranding();
  const formats = useClubFormats();
  const tasksModule = branding.modules.includes("TASKS");
  const trainingModule = branding.modules.includes("FREE_TRAINING");
  const followup = useDogFollowup(client, dogId, { tasks: tasksModule });
  const texts = useFollowupTexts<FollowupTask>();
  const [drawer, setDrawer] = useState(false);
  const [history, setHistory] = useState(false);
  const { card } = followup;

  if (card.status !== "ready") {
    return (
      <section className="student-record">
        {card.status === "loading" ? (
          <Skeleton height="24rem" label={t("instructor:card.loading")} />
        ) : (
          <Toast tone="danger">
            <span className="student-record__error">
              {texts.errorText(card.error, t("instructor:card.loadError"))}
              <Button onClick={followup.reloadCard} variant="secondary">
                {t("instructor:card.retry")}
              </Button>
            </span>
          </Toast>
        )}
      </section>
    );
  }

  const { dog, level, member, metrics } = card.data;
  const guide = dog.handlerName ?? member.firstName;
  const age = dog.ageYears == null ? undefined : t("instructor:card.age", { count: dog.ageYears });
  const breed = dog.breed ?? undefined;
  const dogLine =
    breed !== undefined && age !== undefined
      ? t("instructor:card.breedAge", { age, breed })
      : (breed ?? age);
  const dayLabel = (date: string) =>
    t("instructor:card.lastClassDate", {
      date: formats.formatPlainDate(date, "dayMonthNumeric"),
      weekday: formats.formatPlainDate(date, "weekdayShort").replaceAll(/[.,]/gu, ""),
    });
  const dayMonth = (instant: string) =>
    formats.formatDate(instant, "dayMonthNumeric").replaceAll("/", "-");
  const trainings =
    trainingModule && metrics.trainingsPerWeek !== undefined
      ? new Intl.NumberFormat(formats.locale, {
          maximumFractionDigits: 1,
          minimumFractionDigits: 1,
        }).format(metrics.trainingsPerWeek)
      : undefined;
  const [last] = card.data.lastClasses;
  const lastLine = (item: LastClass) =>
    item.ringName != null && item.instructorName != null
      ? t("instructor:card.lastClassFull", {
          description: item.displayDescription,
          instructor: item.instructorName,
          ring: item.ringName,
        })
      : item.instructorName != null
        ? t("instructor:card.lastClassLine", {
            description: item.displayDescription,
            instructor: item.instructorName,
          })
        : item.displayDescription;
  const note = tasksModule ? card.data.instructorNote : undefined;
  const tasksBlock = tasksModule ? card.data.tasks : undefined;
  const observations = tasksModule ? card.data.observations : undefined;
  const tasks = followup.tasks.status === "ready" ? followup.tasks.data : [];
  const clips = (
    entityType: "DOG_OBSERVATIONS" | "INSTRUCTOR_NOTE",
    attachments: readonly CardAttachment[],
  ) =>
    attachments.length === 0 ? null : (
      <p className="student-record__clips">
        {attachments.map((attachment) => (
          <button
            key={attachment.id}
            onClick={() => void followup.openAttachment(entityType, dogId, attachment.id)}
            type="button"
          >
            <Icon aria-hidden="true" name="clip" /> {attachment.name}
          </button>
        ))}
      </p>
    );

  return (
    <section className="student-record">
      <header className="student-record__header">
        <div className="student-record__identity">
          <h1>{t("instructor:student.name", { dog: dog.name, handler: guide })}</h1>
          {level == null ? null : (
            // `Level.name` as the api delivers it (its own fallback when the reader's language has none).
            <Chip className="student-record__level" title={level.name}>
              {level.assignedAt == null
                ? t("instructor:card.headerLevelCode", { code: level.code })
                : t("instructor:card.headerLevel", {
                    code: level.code,
                    since: formats.formatMonthsSince(level.assignedAt),
                  })}
            </Chip>
          )}
          <Chip>
            {t("instructor:card.memberStatus", {
              gender: member.gender === "FEMALE" ? "female" : "other",
            })}
          </Chip>
          {dogLine === undefined ? null : <Chip className="student-record__dog">{dogLine}</Chip>}
          {dog.status === "ACTIVE" ? null : <Chip tone="danger">{t("instructor:card.left")}</Chip>}
          {dog.handlerName == null || dog.handlerName === member.firstName ? null : (
            <span className="student-record__owner">
              {t("instructor:student.owner", { name: member.fullName })}
            </span>
          )}
        </div>
        {tasksModule ? (
          <Button
            className="student-record__manage"
            onClick={() => {
              setDrawer(true);
            }}
            variant="secondary"
          >
            <Icon aria-hidden="true" name="edit" /> {t("instructor:card.manageButton")}
          </Button>
        ) : null}
      </header>
      <div className="student-record__metrics">
        <Card className="student-record__metric">
          <strong>
            {metrics.attendancePct == null
              ? t("instructor:card.noValue")
              : t("instructor:card.percent", { value: metrics.attendancePct })}
          </strong>
          <span>{t("instructor:card.attendanceTitle")}</span>
          <small>
            {t("instructor:card.attendanceSub", {
              noShow: metrics.noShow,
              notified: metrics.notified,
            })}
          </small>
        </Card>
        <Card className="student-record__metric">
          <strong>{metrics.classesCounted}</strong>
          <span>{t("instructor:card.classesTitle")}</span>
          <small>{t("instructor:card.classesSub")}</small>
        </Card>
        {trainings === undefined ? null : (
          <Card className="student-record__metric">
            <strong>{trainings}</strong>
            <span>{t("instructor:card.trainingsTitle")}</span>
            <small>{t("instructor:card.trainingsSub")}</small>
          </Card>
        )}
        <Card className="student-record__metric">
          <strong>{last === undefined ? t("instructor:card.noValue") : dayLabel(last.date)}</strong>
          <span>{t("instructor:card.lastClass")}</span>
          {last === undefined ? null : <small>{lastLine(last)}</small>}
        </Card>
      </div>
      {note === undefined && tasksBlock === undefined ? null : (
        <div className="student-record__blocks">
          {note === undefined ? null : (
            <Card className="student-record__block">
              <h2>{t("instructor:card.memberNotesWide")}</h2>
              <p>{note.text ?? t("instructor:card.noValue")}</p>
              {clips("INSTRUCTOR_NOTE", note.attachments)}
            </Card>
          )}
          {tasksBlock === undefined ? null : (
            <Card className="student-record__block">
              <div className="student-record__block-head">
                <h2>{t("instructor:card.tasksWide")}</h2>
                <Badge tone="warning">
                  {t("instructor:card.taskPending", { count: tasksBlock.pendingCount })}
                </Badge>
                <Badge tone="success">
                  {t("instructor:card.taskDone", { count: tasksBlock.doneCount })}
                </Badge>
              </div>
              {followup.tasks.status === "loading" ? (
                <Skeleton height="6rem" label={t("instructor:tasks.loading")} />
              ) : followup.tasks.status === "error" ? (
                <p className="student-record__error" role="alert">
                  {texts.errorText(followup.tasks.error, t("instructor:tasks.loadError"))}
                  <Button onClick={followup.reloadTasks} variant="secondary">
                    {t("instructor:tasks.retry")}
                  </Button>
                </p>
              ) : tasks.length === 0 ? (
                <p>{t("instructor:card.noTasks")}</p>
              ) : (
                <ul className="student-record__tasks">
                  {tasks.map((task) => (
                    <li data-done={task.state === "DONE" ? "" : undefined} key={task.id}>
                      <span className="student-record__task-meta">
                        {t("instructor:card.latestTask", {
                          author: task.createdBy.displayName,
                          date: dayMonth(task.createdAt),
                        })}
                      </span>
                      <span className="student-record__task-text">
                        <span>{task.text}</span>
                        {task.attachments.length === 0 ? null : (
                          <Icon aria-hidden="true" name="clip" />
                        )}
                      </span>
                      <Badge tone={task.state === "DONE" ? "success" : "warning"}>
                        {task.state === "DONE" && task.doneAt != null
                          ? t("instructor:card.taskDoneOn", { date: dayMonth(task.doneAt) })
                          : t(`enums:taskState.${task.state}`)}
                      </Badge>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          )}
        </div>
      )}
      {observations === undefined ? null : (
        <Card className="student-record__block student-record__block--private">
          <h2>
            <Icon aria-hidden="true" name="lock" /> {t("instructor:card.observationsWide")}
          </h2>
          <p>{observations.text ?? t("instructor:card.noValue")}</p>
          {clips("DOG_OBSERVATIONS", observations.attachments)}
        </Card>
      )}
      <Card className="student-record__block">
        <h2>{t("instructor:card.lastClasses")}</h2>
        <DataTable<LastClass>
          caption={t("instructor:card.lastClasses")}
          columns={[
            {
              header: t("instructor:card.table.date"),
              key: "date",
              render: (row) => dayLabel(row.date),
            },
            {
              header: t("instructor:card.table.levels"),
              key: "levels",
              render: (row) => row.displayDescription,
            },
            {
              header: t("instructor:card.table.ring"),
              key: "ring",
              render: (row) => row.ringName ?? t("instructor:card.noValue"),
            },
            {
              header: t("instructor:card.table.instructor"),
              key: "instructor",
              render: (row) => row.instructorName ?? t("instructor:card.noValue"),
            },
            {
              header: t("instructor:card.table.attendance"),
              key: "attendance",
              render: (row) => (
                <Badge tone={DISPLAY_TONES[row.displayState]}>
                  {t(`enums:attendanceStateShort.${row.displayState}`)}
                </Badge>
              ),
            },
          ]}
          empty={t("instructor:card.noClasses")}
          loadingLabel={t("instructor:card.loading")}
          rowKey={(row) => row.bookingId}
          rows={card.data.lastClasses}
        />
      </Card>
      {tasksModule ? (
        <Drawer
          closeLabel={t("instructor:tasks.close")}
          onClose={() => {
            setDrawer(false);
          }}
          // One overlay at a time: the history replaces the editor until it closes.
          open={drawer && !history}
          title={t("instructor:card.manageButton")}
        >
          <DogFollowupEditor<FollowupTask>
            dogId={dogId}
            model={followup}
            onHistory={() => {
              setHistory(true);
            }}
            texts={texts}
          />
        </Drawer>
      ) : null}
      {history ? (
        <FollowupHistoryDrawer<FollowupTask>
          model={followup}
          onClose={() => {
            setHistory(false);
          }}
          texts={texts}
        />
      ) : null}
    </section>
  );
}
