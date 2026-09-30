import type { ApiClient } from "@agilityhub/api-client";
import { useClubFormats } from "@agilityhub/i18n";
import { AppBar, Badge, Button, Card, Icon, Skeleton, Toast, useBranding } from "@agilityhub/ui";
import { type CSSProperties, type MouseEvent, useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { navigateInApp, useLoader } from "../booking/shared";
import { clubToday, shortTime } from "../training/shared";

import "./instructor.css";
import {
  bareWeekday,
  capitalized,
  dateParam,
  type DayRingBlock,
  type InstructorDayClass,
  readErrorText,
  writeParam,
} from "./shared";

function openInApp(event: MouseEvent<HTMLAnchorElement>, path: string) {
  event.preventDefault();
  navigateInApp(path);
}

function ClassCard({ item, waitlist }: { item: InstructorDayClass; waitlist: boolean }) {
  const { t } = useTranslation(["instructor", "enums"]);
  const values = {
    description: item.displayDescription,
    end: shortTime(item.endTime),
    start: shortTime(item.startTime),
  };
  const notes = [
    item.attendance.status === "PENDING" ? t("instructor:day.pendingSheet") : undefined,
    item.attendance.status === "DONE" ? t("instructor:day.sheetDone") : undefined,
    item.individual ? t("instructor:day.individual") : undefined,
  ].filter((note): note is string => note !== undefined);
  const cancelled = item.state === "CANCELLED";
  const path = `/instructor/classes/${encodeURIComponent(item.id)}`;
  return (
    <a
      className={`ah-card instructor-day__class${cancelled ? " instructor-day__class--cancelled" : ""}`}
      href={path}
      onClick={(event) => {
        openInApp(event, path);
      }}
    >
      <span className="instructor-day__row">
        <span
          aria-hidden="true"
          className="instructor-day__dot"
          style={
            item.ring == null
              ? undefined
              : ({ "--instructor-ring-color": item.ring.color } as CSSProperties)
          }
        />
        <strong className="instructor-day__title">
          {item.ring == null
            ? t("instructor:day.classLineNoRing", values)
            : t("instructor:day.classLine", { ...values, ring: item.ring.name })}
        </strong>
        {cancelled ? <Badge tone="danger">{t("enums:classState.CANCELLED")}</Badge> : null}
        <Badge tone="success">
          {t("instructor:day.occupancy", { booked: item.booked, capacity: item.capacity })}
        </Badge>
        {waitlist && item.waiting !== undefined && item.waiting > 0 ? (
          <Badge className="instructor-day__waiting" tone="warning">
            <Icon aria-hidden="true" name="hour" />
            <span aria-hidden="true">{item.waiting}</span>
            <span className="ah-sr-only">
              {t("instructor:day.waiting", { count: item.waiting })}
            </span>
          </Badge>
        ) : null}
        <Icon aria-hidden="true" className="instructor-day__chevron" name="chev" />
      </span>
      {notes.length === 0 ? null : (
        <span className="instructor-day__notes">
          {notes.map((note) => (
            <span key={note}>{note}</span>
          ))}
        </span>
      )}
    </a>
  );
}

function BlockCard({ block }: { block: DayRingBlock }) {
  const { i18n, t } = useTranslation(["instructor", "enums"]);
  const [open, setOpen] = useState(false);
  const reason = capitalized(
    t(`enums:ringBlockReason.${block.reason}`),
    i18n.resolvedLanguage ?? i18n.language,
  );
  const note = block.note?.trim() ?? "";
  return (
    <button
      aria-expanded={open}
      className="ah-card instructor-day__block"
      onClick={() => {
        setOpen((value) => !value);
      }}
      type="button"
    >
      <span className="instructor-day__row">
        <Icon aria-hidden="true" className="instructor-day__cone" name="cone" />
        <strong className="instructor-day__title">
          {t("instructor:day.blockLine", {
            from: shortTime(block.fromLocal),
            ring: block.ringName,
            to: shortTime(block.toLocal),
          })}
        </strong>
        <Badge tone="warning">{t("instructor:day.blocked")}</Badge>
      </span>
      <span className="instructor-day__notes">
        <span>{note === "" ? reason : t("instructor:day.blockDetail", { note, reason })}</span>
      </span>
      {open ? (
        <span className="instructor-day__detail">
          {t("instructor:day.blockCreatedBy", { name: block.createdByName })}
        </span>
      ) : null}
    </button>
  );
}

/**
 * Screen 20 «Grups del dia» (`/instructor/dia?date=&instructorId=`, S10 §2, R-10-01): the api's
 * day for the chosen instructor (the caller's by default, never «Tot el club»), every ring block of
 * the day whoever made it, and the way to 24. «Today» is the club's local day (S06 R-06-14).
 */
export function DayPage({ client }: { client: ApiClient }) {
  const { t } = useTranslation(["instructor", "home", "enums", "errors"]);
  const branding = useBranding();
  const { formatPlainDate } = useClubFormats();
  const [date, setDateState] = useState(() => dateParam("date") ?? clubToday(branding.timeZone));
  const [instructorId, setInstructorId] = useState<string | undefined>(
    () => new URLSearchParams(window.location.search).get("instructorId") ?? undefined,
  );
  const waitlist = branding.modules.includes("WAITLIST");

  useEffect(() => {
    // A shared link with a date that is not real is rewritten, never a crashed page.
    const raw = new URLSearchParams(window.location.search).get("date");
    if (raw !== null && dateParam("date") === undefined) writeParam("date", date);
    // Mount only: the chosen date is written by `setDate`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const load = useCallback(async () => {
    const { data } = await client.GET("/instructor/day", {
      params: { query: { date, ...(instructorId === undefined ? {} : { instructorId }) } },
    });
    if (data === undefined) throw new TypeError("The day response did not contain data");
    return data;
  }, [client, date, instructorId]);
  const day = useLoader(load);

  const setDate = (next: string) => {
    setDateState(next);
    writeParam("date", next);
  };

  const data = day.status === "ready" ? day.data : undefined;
  const firstRing = data?.classes.find((item) => item.ring != null)?.ring?.id;

  return (
    <section className="instructor-screen instructor-day">
      <AppBar
        className="instructor-screen__bar"
        end={
          data === undefined || data.instructors.length === 0 ? null : (
            <label className="instructor-day__instructor">
              <Icon aria-hidden="true" name="user" />
              <span className="ah-sr-only">{t("instructor:day.instructor")}</span>
              <select
                onChange={(event) => {
                  const next = event.currentTarget.value;
                  setInstructorId(next);
                  writeParam("instructorId", next);
                }}
                value={data.selectedInstructorId ?? ""}
              >
                {data.instructors.map((instructor) => (
                  <option key={instructor.id} value={instructor.id}>
                    {instructor.shortName}
                  </option>
                ))}
              </select>
            </label>
          )
        }
        title={<h1>{t("instructor:day.title")}</h1>}
      />
      {data === undefined ? null : (
        <div aria-label={t("instructor:day.days")} className="instructor-day__chips" role="group">
          {data.days.map((chip) => (
            <button
              aria-pressed={chip.date === date}
              className={`instructor-day__chip${chip.hasClasses ? "" : " instructor-day__chip--empty"}`}
              key={chip.date}
              onClick={() => {
                setDate(chip.date);
              }}
              type="button"
            >
              {t("home:today.dayChip", {
                day: String(Number(chip.date.slice(8, 10))),
                weekday: bareWeekday(formatPlainDate(chip.date, "weekdayShort")),
              })}
            </button>
          ))}
        </div>
      )}
      {day.status === "loading" ? (
        <Skeleton
          className="instructor-screen__skeleton"
          height="14rem"
          label={t("instructor:day.loading")}
        />
      ) : null}
      {day.status === "error" ? (
        <Toast tone="danger">
          <span className="instructor-screen__error">
            {readErrorText(t, day.error, t("instructor:day.loadError"))}
            <Button
              onClick={() => {
                day.refetch();
              }}
              variant="secondary"
            >
              {t("instructor:day.retry")}
            </Button>
          </span>
        </Toast>
      ) : null}
      {data === undefined ? null : (
        <>
          {data.classes.length === 0 ? (
            <Card className="instructor-day__empty">
              <p>{t("instructor:day.empty")}</p>
            </Card>
          ) : (
            <>
              {data.classes.map((item) => (
                <ClassCard item={item} key={item.id} waitlist={waitlist} />
              ))}
              <p className="instructor-day__legend instructor-day__notes">
                <span>{t("instructor:day.legendOccupancy")}</span>
                {waitlist ? (
                  <span>
                    <Icon aria-hidden="true" name="hour" /> {t("instructor:day.legendWaiting")}
                  </span>
                ) : null}
              </p>
            </>
          )}
          {data.ringBlocks.map((block) => (
            <BlockCard block={block} key={block.id} />
          ))}
          <Button
            className="instructor-day__book"
            onClick={() => {
              // Screen 24 opens on a ring (its route needs one): this day's first class's, else
              // its own first active ring; its «Pista» select changes it.
              navigateInApp(`/instructor/pistes/${encodeURIComponent(firstRing ?? "-")}/reservar`);
            }}
            variant="secondary"
          >
            {t("instructor:day.bookOrBlock")}
          </Button>
        </>
      )}
    </section>
  );
}
