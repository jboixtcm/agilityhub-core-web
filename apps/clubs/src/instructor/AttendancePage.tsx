import type { ApiClient } from "@agilityhub/api-client";
import { useClubFormats } from "@agilityhub/i18n";
import {
  AppBar,
  AttendanceCircles,
  type AttendanceState,
  Avatar,
  Badge,
  Button,
  Card,
  Chip,
  Icon,
  IconButton,
  Skeleton,
  Toast,
  useBranding,
} from "@agilityhub/ui";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";

import { navigateInApp, type Translate } from "../booking/shared";
import { shortTime } from "../training/shared";

import "./instructor.css";
import { bareWeekday, readErrorText, studentName } from "./shared";
import { type AttendanceRow, type SheetNotice, useAttendanceSheet } from "./useAttendanceSheet";

const STATES: readonly AttendanceState[] = ["PENDING", "PRESENT", "NOTIFIED", "NO_SHOW"];

function stateLabels(t: Translate): Record<AttendanceState, string> {
  return Object.fromEntries(
    STATES.map((state) => [state, t(`enums:attendanceState.${state}`)]),
  ) as Record<AttendanceState, string>;
}

const FOCUSABLE = "a[href], button:not([disabled]), [tabindex]:not([tabindex='-1'])";

/**
 * The dog's photo full screen (mockup 21, V6), a modal dialog (AGENTS rule 6). While it is open,
 * the rest of the page is inert and does not scroll, and Tab and Shift+Tab stay inside it. A tap
 * anywhere, or Escape, closes it; the page is then as it was (same scroll, focus back on the photo).
 */
function PhotoLightbox({ alt, onClose, src }: { alt: string; onClose: () => void; src: string }) {
  const dialog = useRef<HTMLDivElement>(null);
  const close = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const opener =
      document.activeElement instanceof HTMLElement ? document.activeElement : undefined;
    const scroll = { x: window.scrollX, y: window.scrollY };
    const overflow = document.body.style.overflow;
    // Everything but the dialog (rendered on `body`) leaves the focus order and the accessibility
    // tree; what was inert already stays so.
    const outside = [...document.body.children].filter(
      (element) => element !== dialog.current && !element.hasAttribute("inert"),
    );
    for (const element of outside) element.setAttribute("inert", "");
    document.body.style.overflow = "hidden";
    close.current?.focus({ preventScroll: true });
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
        return;
      }
      if (event.key !== "Tab" || dialog.current === null) return;
      const focusable = [...dialog.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
      const first = focusable[0];
      const last = focusable.at(-1);
      if (first === undefined || last === undefined) return;
      const active = document.activeElement;
      const inside = active instanceof Node && dialog.current.contains(active);
      if (event.shiftKey ? !inside || active === first : !inside || active === last) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus({ preventScroll: true });
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      for (const element of outside) element.removeAttribute("inert");
      document.body.style.overflow = overflow;
      opener?.focus({ preventScroll: true });
      if (window.scrollX !== scroll.x || window.scrollY !== scroll.y) {
        window.scrollTo(scroll.x, scroll.y);
      }
    };
  }, [onClose]);
  return createPortal(
    <div
      aria-label={alt}
      aria-modal="true"
      className="instructor-lightbox"
      ref={dialog}
      role="dialog"
    >
      <button
        aria-label={alt}
        className="instructor-lightbox__close"
        onClick={onClose}
        ref={close}
        type="button"
      >
        <img alt="" src={src} />
      </button>
    </div>,
    document.body,
  );
}

function statusLines(t: Translate, row: AttendanceRow, noShowNoticeTime: string): string[] {
  if (row.notice != null) {
    return [
      t("instructor:attendance.notice", { time: shortTime(row.notice.atLocal) }),
      ...(row.notice.seatReleased ? [t("instructor:attendance.noticeSeatReleased")] : []),
      ...(row.notice.waitlistNotified ? [t("instructor:attendance.noticeWaitlist")] : []),
    ];
  }
  if (row.state === "NO_SHOW") {
    return [
      row.noShowNotice?.sentAt == null
        ? t("instructor:attendance.noShowNotice", { time: shortTime(noShowNoticeTime) })
        : t("instructor:attendance.noticeAlreadySent"),
    ];
  }
  return [];
}

function SheetRow({
  disabled,
  noShowNoticeTime,
  onChoose,
  onPhoto,
  permissions,
  row,
  tasks,
  value,
}: {
  disabled: boolean;
  noShowNoticeTime: string;
  onChoose: (state: AttendanceState) => void;
  onPhoto: (row: AttendanceRow) => void;
  permissions: { canMarkNotice: boolean; canMarkPresence: boolean };
  row: AttendanceRow;
  tasks: boolean;
  value: AttendanceState;
}) {
  const { t } = useTranslation(["instructor", "enums"]);
  const name = studentName(t, row);
  const lines = statusLines(t, row, noShowNoticeTime);
  return (
    <li className="instructor-sheet__row">
      <div className="instructor-sheet__main">
        {row.dogPhotoUrl == null ? (
          <span className="instructor-sheet__photo">
            <Avatar kind="dog" name={row.dogName} />
          </span>
        ) : (
          <button
            aria-label={t("instructor:attendance.photoOpen", { dog: row.dogName })}
            className="instructor-sheet__photo"
            onClick={() => {
              onPhoto(row);
            }}
            type="button"
          >
            <img alt="" src={row.dogPhotoUrl} />
          </button>
        )}
        <span className="instructor-sheet__who">
          <strong>{name}</strong>
          {row.memberFullName === undefined ? null : (
            <span className="instructor-sheet__owner">
              {t("instructor:student.owner", { name: row.memberFullName })}
            </span>
          )}
        </span>
        {row.levelCode == null ? null : <Chip className="instructor-level">{row.levelCode}</Chip>}
        <AttendanceCircles
          disabled={disabled}
          label={t("instructor:attendance.circles", { name })}
          labels={stateLabels(t)}
          onChange={onChoose}
          permissions={{ ...permissions, final: row.final }}
          value={value}
        />
      </div>
      {lines.length === 0 ? null : (
        <p className="instructor-sheet__status instructor-day__notes">
          {lines.map((line) => (
            <span key={line}>{line}</span>
          ))}
        </p>
      )}
      {tasks && row.pendingTasksCount !== undefined && row.pendingTasksCount > 0 ? (
        <p className="instructor-sheet__status">
          {t("instructor:attendance.pendingTasks", { count: row.pendingTasksCount })}
        </p>
      ) : null}
    </li>
  );
}

function noticeToast(
  t: Translate,
  notice: SheetNotice,
): { message: string; tone: "danger" | "success" | "warning" } {
  switch (notice.kind) {
    case "saved":
      return { message: t("instructor:attendance.saved"), tone: "success" };
    case "stale":
      return { message: t("instructor:attendance.staleToast"), tone: "warning" };
    case "error":
      return {
        message: t(`errors:${notice.code}`, { defaultValue: t("errors:INTERNAL_ERROR") }),
        tone: "danger",
      };
  }
}

/**
 * Screen 21 «Detall de classe i passar llista» (`/instructor/classes/:id`, S10 §2, R-10-02…R-10-06):
 * one row per booking in the api's order, the four circles as the api allows them, the status
 * lines built from the api's fields only, [DESA] with the changed rows, and the waiting list.
 */
export function AttendancePage({ classId, client }: { classId: string; client: ApiClient }) {
  const { t } = useTranslation(["instructor", "enums", "errors", "home"]);
  const branding = useBranding();
  const formats = useClubFormats();
  const sheet = useAttendanceSheet(client, classId);
  const [photo, setPhoto] = useState<AttendanceRow>();
  const closePhoto = useCallback(() => {
    setPhoto(undefined);
  }, []);
  const tasks = branding.modules.includes("TASKS");
  const waitlistModule = branding.modules.includes("WAITLIST");

  const back = () => {
    if (window.history.length > 1) window.history.back();
    else navigateInApp("/instructor/dia");
  };
  const data = sheet.status === "ready" ? sheet.sheet : undefined;
  const session = data?.classSession;
  const cancelled = session?.state === "CANCELLED";
  const title =
    session === undefined
      ? ""
      : (() => {
          const values = {
            date: t("home:today.dayChip", {
              day: String(Number(session.date.slice(8, 10))),
              weekday: bareWeekday(formats.formatPlainDate(session.date, "weekdayShort")),
            }),
            description: session.displayDescription,
            time: shortTime(session.startTime),
          };
          return session.ring == null
            ? t("instructor:attendance.titleNoRing", values)
            : t("instructor:attendance.title", { ...values, ring: session.ring.name });
        })();
  const toast = sheet.notice === undefined ? undefined : noticeToast(t, sheet.notice);
  const waitlist = waitlistModule ? data?.waitlist : undefined;

  return (
    <section className="instructor-screen instructor-sheet">
      <AppBar
        className="instructor-screen__bar"
        start={
          <IconButton
            className="instructor-screen__back"
            icon="chev"
            label={t("instructor:attendance.back")}
            onClick={back}
          />
        }
        title={<h1>{title}</h1>}
      />
      {sheet.status === "loading" ? (
        <Skeleton
          className="instructor-screen__skeleton"
          height="16rem"
          label={t("instructor:attendance.loading")}
        />
      ) : null}
      {sheet.status === "error" ? (
        <Toast tone="danger">
          <span className="instructor-screen__error">
            {readErrorText(t, sheet.error, t("instructor:attendance.loadError"))}
            <Button onClick={sheet.refetch} variant="secondary">
              {t("instructor:attendance.retry")}
            </Button>
          </span>
        </Toast>
      ) : null}
      {data === undefined || session === undefined ? null : (
        <>
          <div className="instructor-sheet__meta">
            <Badge tone="success">
              {t("instructor:attendance.occupancy", {
                booked: session.booked,
                capacity: session.capacity,
              })}
            </Badge>
            {waitlistModule && session.waiting !== undefined && session.waiting > 0 ? (
              <Badge className="instructor-sheet__waiting" tone="warning">
                <Icon aria-hidden="true" name="hour" />{" "}
                {t("instructor:attendance.waiting", { count: session.waiting })}
              </Badge>
            ) : null}
            {session.instructorName == null ? null : (
              <span className="instructor-sheet__instructor">{session.instructorName}</span>
            )}
          </div>
          {cancelled ? (
            <Toast tone="danger">{t("instructor:attendance.cancelledBanner")}</Toast>
          ) : null}
          {toast === undefined ? null : (
            <Toast
              dismissLabel={t("instructor:attendance.dismiss")}
              onDismiss={sheet.dismissNotice}
              tone={toast.tone}
            >
              {toast.message}
            </Toast>
          )}
          <Card className="instructor-sheet__card">
            <ul className="instructor-sheet__rows">
              {data.rows.map((row) => (
                <SheetRow
                  disabled={sheet.saving || cancelled}
                  key={row.bookingId}
                  noShowNoticeTime={data.sheet.noShowNoticeTime}
                  onChoose={(state) => {
                    sheet.choose(row.bookingId, state);
                  }}
                  onPhoto={setPhoto}
                  permissions={data.sheet}
                  row={row}
                  tasks={tasks}
                  value={sheet.draft[row.bookingId] ?? row.state}
                />
              ))}
            </ul>
            {cancelled ? null : (
              <div className="instructor-sheet__actions">
                <span>{t("instructor:attendance.hint")}</span>
                <Button
                  disabled={sheet.changes.length === 0}
                  loading={sheet.saving}
                  loadingLabel={t("instructor:attendance.saving")}
                  onClick={() => void sheet.save()}
                  variant="secondary"
                >
                  {t("instructor:attendance.save")}
                </Button>
              </div>
            )}
          </Card>
          <ul aria-label={t("instructor:attendance.legend")} className="instructor-sheet__legend">
            {STATES.map((state) => (
              <li key={state}>
                <span
                  aria-hidden="true"
                  className={`instructor-sheet__legend-dot instructor-sheet__legend-dot--${state.toLowerCase().replace("_", "-")}`}
                />
                {t(`enums:attendanceState.${state}`)}
              </li>
            ))}
          </ul>
          {waitlist === undefined || waitlist.entries.length === 0 ? null : (
            <>
              <h2 className="instructor-screen__section">
                {t("instructor:attendance.waitlistTitle", { count: waitlist.entries.length })}
              </h2>
              <Card className="instructor-sheet__waitlist">
                <ul>
                  {waitlist.entries.map((entry) => {
                    const joined = formats.dayRelativeParts(entry.joinedAt);
                    return (
                      <li key={entry.entryId}>
                        <Icon aria-hidden="true" className="instructor-sheet__clock" name="clock" />
                        <strong>{studentName(t, entry)}</strong>
                        {entry.levelCode == null ? null : (
                          <Chip className="instructor-level">{entry.levelCode}</Chip>
                        )}
                        <span className="instructor-sheet__joined">
                          {t("instructor:attendance.joinedAt", {
                            count: joined.count,
                            date: joined.date,
                            kind: joined.kind,
                            time: joined.time,
                          })}
                        </span>
                      </li>
                    );
                  })}
                </ul>
                <p>
                  {t("instructor:attendance.waitlistRule", {
                    minutes: waitlist.fifoConfirmMinutes ?? 0,
                    mode: waitlist.mode,
                  })}
                </p>
              </Card>
            </>
          )}
        </>
      )}
      {photo?.dogPhotoUrl == null ? null : (
        <PhotoLightbox
          alt={t("instructor:attendance.photoClose", { dog: photo.dogName })}
          onClose={closePhoto}
          src={photo.dogPhotoUrl}
        />
      )}
    </section>
  );
}
