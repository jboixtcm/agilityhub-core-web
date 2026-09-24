import { isApiError, type ApiClient, type components } from "@agilityhub/api-client";
import {
  Badge,
  Button,
  Card,
  Chip,
  Icon,
  Input,
  Modal,
  Select,
  Textarea,
  type Tone,
} from "@agilityhub/ui";
import { type FocusEvent, type ReactNode, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import {
  type CalendarSettings,
  type ClassSession,
  errorCode,
  minutesOf,
  type OpeningHours,
  openingOf,
  timeLabel,
  timeOf,
  timeOptions,
  useCalendarErrorMessage,
} from "./calendar-shared";
import type { ClassHeading } from "./CancelClassModal";
import { automaticDescription } from "./description";
import type { PlanningCatalogs } from "./shared";

type ClassSessionPatch = components["schemas"]["ClassSessionPatchRequest"];

export const SELECTED_CARD_ID = "calendar-selected-card";

const stateTones: Readonly<Record<ClassSession["state"], Tone>> = {
  ACTIVE: "success",
  CANCELLED: "danger",
  DRAFT: "neutral",
  FINISHED: "info",
};

interface DraftValues {
  capacity: string;
  description: string;
  instructorIds: string[];
  levelIds: string[];
  notes: string;
  ringId: string | null;
  startTime: string;
}

function initialValues(session: ClassSession): DraftValues {
  return {
    capacity: session.capacityMode === "MANUAL" ? String(session.capacity) : "",
    description: session.description ?? "",
    instructorIds: [...session.instructorIds],
    levelIds: [...session.levelIds],
    notes: session.notes ?? "",
    ringId: session.ringId ?? null,
    startTime: session.startTime,
  };
}

function sameSet(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value) => right.includes(value));
}

/** Only the R-06-09 fields that changed (never `date`); the end time keeps the duration. */
function diffOf(session: ClassSession, values: DraftValues, editable: boolean): ClassSessionPatch {
  const patch: ClassSessionPatch = { version: session.version };
  const notes = values.notes.trim() === "" ? null : values.notes.trim();
  if (notes !== (session.notes ?? null)) patch.notes = notes;
  if (!editable) return patch;
  if (values.ringId !== (session.ringId ?? null)) patch.ringId = values.ringId;
  if (!sameSet(values.levelIds, session.levelIds)) patch.levelIds = values.levelIds;
  if (!sameSet(values.instructorIds, session.instructorIds)) {
    patch.instructorIds = values.instructorIds;
  }
  const capacity = values.capacity.trim() === "" ? null : Number(values.capacity);
  const currentCapacity = session.capacityMode === "MANUAL" ? session.capacity : null;
  if (capacity !== currentCapacity) patch.capacity = capacity;
  const description = values.description.trim() === "" ? null : values.description.trim();
  if (description !== (session.description ?? null)) patch.description = description;
  if (values.startTime !== session.startTime) {
    patch.startTime = values.startTime;
    patch.endTime = timeOf(
      minutesOf(values.startTime) + minutesOf(session.endTime) - minutesOf(session.startTime),
    );
  }
  return patch;
}

/** A chip whose value opens a small panel of toggle chips (levels, several instructors). */
function MultiChip({
  label,
  onToggle,
  options,
  selected,
  summary,
  max,
}: {
  label: string;
  max?: number;
  onToggle: (id: string) => void;
  options: readonly { id: string; label: string }[];
  selected: readonly string[];
  summary: string;
}) {
  const [open, setOpen] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const closeOnFocusOut = (event: FocusEvent<HTMLDivElement>) => {
    if (
      !(event.relatedTarget instanceof Node) ||
      container.current?.contains(event.relatedTarget) !== true
    ) {
      setOpen(false);
    }
  };
  return (
    <div className="calendar-chip calendar-chip--multi" onBlur={closeOnFocusOut} ref={container}>
      <button
        aria-expanded={open}
        className="calendar-chip__toggle"
        onClick={() => {
          setOpen((value) => !value);
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") setOpen(false);
        }}
        type="button"
      >
        <span className="calendar-chip__label">{label}</span> {summary}
      </button>
      {open ? (
        <div aria-label={label} className="calendar-chip__panel" role="group">
          {options.map((option) => {
            const pressed = selected.includes(option.id);
            return (
              <button
                aria-pressed={pressed}
                className="planning-chip"
                disabled={!pressed && max !== undefined && selected.length >= max}
                key={option.id}
                onClick={() => {
                  onToggle(option.id);
                }}
                type="button"
              >
                {option.label}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function StaticChip({ label, value }: { label: string; value: ReactNode }) {
  return (
    <Chip className="calendar-chip calendar-chip--static">
      <span className="calendar-chip__label">{label}</span> {value}
    </Chip>
  );
}

/**
 * D4 «Classe seleccionada» (R-06-09): chip editors for ADMIN on DRAFT/ACTIVE classes, [ACCEPTA]
 * sends the diff with `version`; [ANUL·LA LA CLASSE] / [ELIMINA] go through D4c (parent).
 * FINISHED/CANCELLED keep only «Notes»; INSTRUCTOR sees the card read-only (A22 c).
 * The parent remounts it (`key`) on every new class or version.
 */
export function SelectedClassCard({
  catalogs,
  client,
  heading,
  onCancel,
  onClose,
  onReload,
  onSaved,
  openingHours,
  readOnly,
  session,
  settings,
  waitlistEnabled,
}: {
  catalogs: PlanningCatalogs;
  client: ApiClient;
  heading: ClassHeading;
  onCancel: (reason: "CLUB_MANUAL" | "DELETED") => void;
  onClose: () => void;
  onReload: () => void;
  onSaved: (session: ClassSession) => void;
  openingHours: OpeningHours;
  readOnly: boolean;
  session: ClassSession;
  settings: CalendarSettings;
  waitlistEnabled: boolean;
}) {
  const { t } = useTranslation(["admin-scheduling", "enums", "errors"]);
  const errorMessage = useCalendarErrorMessage();
  const [values, setValues] = useState(() => initialValues(session));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<{ field: "capacity" | "general"; message: string }>();
  const [ringBookings, setRingBookings] = useState<unknown[]>();
  const editable = !readOnly && (session.state === "ACTIVE" || session.state === "DRAFT");
  const notesOnly = !readOnly && !editable;
  const patch = diffOf(session, values, editable);
  const changed = Object.keys(patch).length > 1;

  const activeRings = catalogs.rings.filter((ring) => ring.active);
  const activeLevels = catalogs.levels.filter((level) => level.active);
  const activeInstructors = catalogs.instructors.filter((instructor) => instructor.active);
  const ringName = (ringId: string | null) =>
    ringId === null
      ? t("admin-scheduling:classCard.noRing")
      : (catalogs.rings.find((ring) => ring.id === ringId)?.name ?? "");
  const levelNames = (ids: readonly string[]) =>
    catalogs.levels
      .filter((level) => ids.includes(level.id))
      .map((level) => level.name)
      .join(", ") || t("admin-scheduling:calendar.selected.noLevels");
  const instructorNames = (ids: readonly string[]) =>
    ids
      .map((id) => catalogs.instructors.find((instructor) => instructor.id === id)?.shortName)
      .filter((name): name is string => name !== undefined)
      .join(", ");
  const preview = useMemo(
    () =>
      sameSet(values.levelIds, session.levelIds) && (session.description ?? "") === ""
        ? session.displayDescription
        : automaticDescription(catalogs.levels, values.levelIds, t),
    [catalogs.levels, session, t, values.levelIds],
  );
  const opening = openingOf(openingHours, session.date);
  const duration = minutesOf(session.endTime) - minutesOf(session.startTime);
  const hours = timeOptions(
    opening.open,
    timeOf(minutesOf(opening.close) - duration),
    settings.slotMinutes,
  );
  const hourOptions = hours.includes(session.startTime) ? hours : [session.startTime, ...hours];

  const set = (next: Partial<DraftValues>) => {
    setValues((current) => ({ ...current, ...next }));
    setError(undefined);
  };

  const save = async (cancelBookings = false) => {
    if (pending) return;
    setPending(true);
    setError(undefined);
    try {
      const result = await client.PATCH("/class-sessions/{id}", {
        body: { ...patch, ...(cancelBookings ? { cancelBookings: true } : {}) },
        params: { path: { id: session.id } },
      });
      setRingBookings(undefined);
      if (result.data !== undefined) onSaved(result.data);
    } catch (cause) {
      const code = errorCode(cause);
      if (code === "RING_HAS_BOOKINGS" && isApiError(cause)) {
        const bookings = (cause.details as { bookings?: unknown } | undefined)?.bookings;
        setRingBookings(Array.isArray(bookings) ? bookings : []);
      } else {
        setRingBookings(undefined);
        setError({
          field: code === "CAPACITY_BELOW_BOOKINGS" ? "capacity" : "general",
          message: errorMessage(cause),
        });
        if (code === "STALE_VERSION" || code === "INVALID_STATE") onReload();
      }
    } finally {
      setPending(false);
    }
  };

  const toggleExempt = async () => {
    if (pending) return;
    setPending(true);
    setError(undefined);
    try {
      const result = await client.POST("/class-sessions/{id}/risk-exemption", {
        body: { exempt: !session.riskExempt },
        params: { path: { id: session.id } },
      });
      if (result.data !== undefined) onSaved(result.data);
    } catch (cause) {
      setError({ field: "general", message: errorMessage(cause) });
      const code = errorCode(cause);
      if (code === "STALE_VERSION" || code === "INVALID_STATE") onReload();
    } finally {
      setPending(false);
    }
  };

  const counts =
    session.state === "DRAFT"
      ? null
      : `${t("admin-scheduling:calendar.cell.counts", {
          booked: session.counters.booked,
          capacity: session.capacity,
        })}${
          waitlistEnabled && session.counters.waiting > 0
            ? ` ${t("admin-scheduling:calendar.cell.waiting", { count: session.counters.waiting })}`
            : ""
        }`;

  return (
    <Card
      aria-labelledby="calendar-selected-title"
      className="calendar-selected-card"
      id={SELECTED_CARD_ID}
      role="region"
      tabIndex={-1}
    >
      <div className="calendar-selected-card__header">
        <h2 className="planning-card-title" id="calendar-selected-title">
          {t("admin-scheduling:calendar.selected.title", { ...heading })}
        </h2>
        <Badge className="calendar-state" tone={stateTones[session.state]}>
          {t(`enums:classState.${session.state}`)}
        </Badge>
        {counts === null ? null : <span className="calendar-selected-card__counts">{counts}</span>}
      </div>

      {editable ? (
        <div className="calendar-chips">
          <label className="calendar-chip calendar-chip--select">
            <span className="calendar-chip__label">{t("admin-scheduling:classCard.ring")}</span>
            <Select
              onChange={(event) => {
                const value = event.currentTarget.value;
                set({ ringId: value === "" ? null : value });
              }}
              value={values.ringId ?? ""}
            >
              {activeRings.map((ring) => (
                <option key={ring.id} value={ring.id}>
                  {ring.name}
                </option>
              ))}
              <option value="">{t("admin-scheduling:classCard.noRing")}</option>
            </Select>
          </label>
          {settings.levelsEnabled ? (
            <MultiChip
              label={t("admin-scheduling:classCard.levels")}
              onToggle={(levelId) => {
                const levelIds = values.levelIds.includes(levelId)
                  ? values.levelIds.filter((id) => id !== levelId)
                  : catalogs.levels
                      .filter((level) => level.id === levelId || values.levelIds.includes(level.id))
                      .map((level) => level.id);
                set({ levelIds });
              }}
              options={activeLevels.map((level) => ({ id: level.id, label: level.name }))}
              selected={values.levelIds}
              summary={levelNames(values.levelIds)}
            />
          ) : null}
          {settings.maxInstructors <= 1 ? (
            <label className="calendar-chip calendar-chip--select">
              <span className="calendar-chip__label">
                {t("admin-scheduling:classCard.instructor")}
              </span>
              <Select
                onChange={(event) => {
                  set({ instructorIds: [event.currentTarget.value] });
                }}
                value={values.instructorIds[0] ?? ""}
              >
                {activeInstructors.map((instructor) => (
                  <option key={instructor.id} value={instructor.id}>
                    {instructor.shortName}
                  </option>
                ))}
              </Select>
            </label>
          ) : (
            <MultiChip
              label={t("admin-scheduling:classCard.instructors", { max: settings.maxInstructors })}
              max={settings.maxInstructors}
              onToggle={(instructorId) => {
                set({
                  instructorIds: values.instructorIds.includes(instructorId)
                    ? values.instructorIds.filter((id) => id !== instructorId)
                    : [...values.instructorIds, instructorId],
                });
              }}
              options={activeInstructors.map((instructor) => ({
                id: instructor.id,
                label: instructor.shortName,
              }))}
              selected={values.instructorIds}
              summary={instructorNames(values.instructorIds)}
            />
          )}
          <label
            className={
              error?.field === "capacity" ? "calendar-chip calendar-chip--invalid" : "calendar-chip"
            }
          >
            <span className="calendar-chip__label">{t("admin-scheduling:classCard.capacity")}</span>
            <Input
              aria-describedby={error?.field === "capacity" ? "calendar-capacity-error" : undefined}
              aria-invalid={error?.field === "capacity" || undefined}
              className="calendar-chip__number"
              min={1}
              onChange={(event) => {
                set({ capacity: event.currentTarget.value });
              }}
              placeholder={String(session.capacity)}
              type="number"
              value={values.capacity}
            />
          </label>
          <label className="calendar-chip calendar-chip--select">
            <span className="calendar-chip__label">
              {t("admin-scheduling:calendar.selected.time")}
            </span>
            <Select
              onChange={(event) => {
                set({ startTime: event.currentTarget.value });
              }}
              value={values.startTime}
            >
              {hourOptions.map((time) => (
                <option key={time} value={time}>
                  {timeLabel(time)}
                </option>
              ))}
            </Select>
          </label>
          <label className="calendar-chip calendar-chip--wide">
            <span className="calendar-chip__label">
              {t("admin-scheduling:classCard.description")}
            </span>
            <Input
              maxLength={40}
              onChange={(event) => {
                set({ description: event.currentTarget.value });
              }}
              placeholder={preview}
              value={values.description}
            />
          </label>
          {session.state === "ACTIVE" ? (
            <button
              aria-pressed={session.riskExempt}
              className="planning-chip"
              disabled={pending}
              onClick={() => void toggleExempt()}
              type="button"
            >
              {t("admin-scheduling:calendar.selected.exempt")}
            </button>
          ) : null}
        </div>
      ) : (
        <div className="calendar-chips">
          <StaticChip
            label={t("admin-scheduling:classCard.ring")}
            value={ringName(session.ringId ?? null)}
          />
          {settings.levelsEnabled ? (
            <StaticChip
              label={t("admin-scheduling:classCard.levels")}
              value={levelNames(session.levelIds)}
            />
          ) : null}
          <StaticChip
            label={t("admin-scheduling:classCard.instructor")}
            value={instructorNames(session.instructorIds)}
          />
          <StaticChip
            label={t("admin-scheduling:classCard.capacity")}
            value={String(session.capacity)}
          />
          <StaticChip
            label={t("admin-scheduling:calendar.selected.time")}
            value={timeLabel(session.startTime)}
          />
          {session.riskExempt ? (
            <Chip tone="info">{t("admin-scheduling:calendar.selected.exempt")}</Chip>
          ) : null}
        </div>
      )}

      {notesOnly ? (
        <label className="calendar-notes">
          <span>{t("admin-scheduling:calendar.selected.notes")}</span>
          <Textarea
            maxLength={500}
            onChange={(event) => {
              set({ notes: event.currentTarget.value });
            }}
            rows={2}
            value={values.notes}
          />
        </label>
      ) : null}

      {error === undefined ? null : (
        <p
          className="ah-form-field__error"
          id={error.field === "capacity" ? "calendar-capacity-error" : undefined}
          role="alert"
        >
          {error.message}
        </p>
      )}

      <div className="calendar-selected-card__actions">
        {readOnly ? (
          <Button onClick={onClose} variant="ghost">
            {t("admin-scheduling:calendar.selected.close")}
          </Button>
        ) : (
          <>
            <Button
              disabled={!changed}
              loading={pending}
              loadingLabel={t("admin-scheduling:common.saving")}
              onClick={() => void save()}
            >
              <Icon aria-hidden="true" name="check" />
              {t("admin-scheduling:calendar.selected.accept")}
            </Button>
            <span className="calendar-selected-card__spacer" />
            {session.state === "ACTIVE" ? (
              <Button
                className="calendar-button--danger-outline"
                disabled={pending}
                onClick={() => {
                  onCancel("CLUB_MANUAL");
                }}
                variant="ghost"
              >
                <Icon aria-hidden="true" name="x" />
                {t("admin-scheduling:calendar.selected.cancel")}
              </Button>
            ) : null}
            {session.state === "ACTIVE" || session.state === "DRAFT" ? (
              <Button
                disabled={pending}
                onClick={() => {
                  onCancel("DELETED");
                }}
                variant="ghost"
              >
                {session.state === "ACTIVE"
                  ? t("admin-scheduling:calendar.selected.delete")
                  : t("admin-scheduling:calendar.selected.deleteDraft")}
              </Button>
            ) : null}
          </>
        )}
      </div>

      <Modal
        closeLabel={t("admin-scheduling:common.close")}
        onClose={() => {
          setRingBookings(undefined);
        }}
        open={ringBookings !== undefined}
        title={t("admin-scheduling:calendar.ringBookings.title")}
      >
        <p>{t("admin-scheduling:calendar.ringBookings.text")}</p>
        <RingBookingList bookings={ringBookings ?? []} />
        <div className="calendar-modal__actions">
          <Button
            onClick={() => {
              setRingBookings(undefined);
            }}
            variant="ghost"
          >
            {t("admin-scheduling:calendar.ringBookings.back")}
          </Button>
          <Button
            loading={pending}
            loadingLabel={t("admin-scheduling:common.saving")}
            onClick={() => void save(true)}
            variant="danger"
          >
            {t("admin-scheduling:calendar.ringBookings.confirm")}
          </Button>
        </div>
      </Modal>
    </Card>
  );
}

/** `details.bookings[]` of `RING_HAS_BOOKINGS` (training bookings, S09): shown as the api sends them. */
export function RingBookingList({ bookings }: { bookings: readonly unknown[] }) {
  const lines = bookings.map((booking, index) => {
    if (typeof booking !== "object" || booking === null) return { key: String(index), text: "" };
    const record = booking as Record<string, unknown>;
    const text = [record.label, record.memberName, record.dogName, record.who]
      .filter((value): value is string => typeof value === "string" && value !== "")
      .join(" · ");
    return {
      key: typeof record.bookingId === "string" ? record.bookingId : String(index),
      text,
    };
  });
  return lines.length === 0 ? null : (
    <ul className="calendar-list">
      {lines.map((line) => (
        <li key={line.key}>{line.text}</li>
      ))}
    </ul>
  );
}
