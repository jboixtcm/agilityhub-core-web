import { isApiError, type ApiClient } from "@agilityhub/api-client";
import { Button, Drawer, FormField, Input, Select } from "@agilityhub/ui";
import {
  type CSSProperties,
  type SyntheticEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";

import {
  type CalendarSettings,
  clampTime,
  type ClassSession,
  errorCode,
  holidayDates,
  maskDate,
  minutesOf,
  type OpeningHours,
  openingOf,
  parseMaskedDate,
  placementKey,
  rangeOptions,
  timeLabel,
  timeOf,
  useCalendarErrorMessage,
} from "./calendar-shared";
import { automaticDescription } from "./description";
import { RingBookingList } from "./SelectedClassCard";
import {
  clubToday,
  errorProp,
  fieldOfValidationError,
  mondayOf,
  type PlanningCatalogs,
  useResource,
} from "./shared";

type FieldKey =
  "date" | "description" | "general" | "instructorIds" | "levelIds" | "ringId" | "time";

const fieldByCode: Readonly<Record<string, FieldKey>> = {
  DESCRIPTION_REQUIRED: "description",
  INVALID_SLOT_GRANULARITY: "time",
  INVALID_TIME_RANGE: "time",
  LEVEL_REQUIRED: "levelIds",
  OUTSIDE_OPENING_HOURS: "time",
  RING_BLOCKED: "ringId",
  TOO_MANY_INSTRUCTORS: "instructorIds",
};

/** «Els alumnes la veuran de seguida» when the week of the date is validated (R-06-09). */
function VisibleNowNote({ client, monday }: { client: ApiClient; monday: string }) {
  const { t } = useTranslation("admin-scheduling");
  const week = useResource(
    useCallback(
      async () =>
        (
          await client.GET("/weeks", {
            params: { query: { filter: [`startDate:eq:${monday}`] } },
          })
        ).data?.items[0],
      [client, monday],
    ),
  );
  return week.data?.state === "VALIDATED" ? (
    <p className="planning-note planning-note--warning" role="note">
      {t("admin-scheduling:calendar.createForm.visibleNow")}
    </p>
  ) : null;
}

function colorStyle(color: string): CSSProperties {
  return { "--planning-chip-color": color } as CSSProperties;
}

/** Length of a new class until the admin picks its end. */
const DEFAULT_LENGTH_MINUTES = 60;

/**
 * [Crear classe] of D4 (R-06-09): the class fields of the D3 card (ring, levels, instructor,
 * description preview, limit) plus a masked date and start/end times on `classes.slotMinutes`
 * boundaries inside the day's opening hours (S06 §3). Warns when the date is a holiday and when
 * the week is validated (the class is born ACTIVE); a closed day (R-02-09) offers no times and
 * cannot be sent. Mounted only while open.
 */
export function CreateClassDrawer({
  catalogs,
  client,
  onClose,
  onCreated,
  openingHours,
  settings,
  timeZone,
}: {
  catalogs: PlanningCatalogs;
  client: ApiClient;
  onClose: () => void;
  onCreated: (session: ClassSession) => void;
  openingHours: OpeningHours;
  settings: CalendarSettings;
  timeZone: string;
}) {
  const { t } = useTranslation(["admin-scheduling", "errors"]);
  const errorMessage = useCalendarErrorMessage();
  const activeRings = catalogs.rings.filter((ring) => ring.active);
  const activeLevels = catalogs.levels.filter((level) => level.active);
  const activeInstructors = catalogs.instructors.filter((instructor) => instructor.active);
  const today = clubToday(timeZone);
  const optionsOf = (day: string) =>
    rangeOptions(openingOf(openingHours, day), settings.slotMinutes, settings.slotMinutes);
  const [date, setDate] = useState("");
  const isoDate = parseMaskedDate(date);
  const { ends, starts } = optionsOf(isoDate ?? today);
  /** The typed date is a day the club is closed (absent from `club.openingHours`). */
  const closedDay = isoDate !== undefined && openingOf(openingHours, isoDate) === null;
  const [startTime, setStartTime] = useState(starts[0] ?? "");
  const [endTime, setEndTime] = useState(() =>
    starts[0] === undefined
      ? ""
      : clampTime(timeOf(minutesOf(starts[0]) + DEFAULT_LENGTH_MINUTES), ends),
  );

  /**
   * The `RING_HAS_BOOKINGS` list belongs to the ring, date and times it was answered for: any
   * change to them drops it, so [Anul·la les reserves i desa] never confirms a slot not shown.
   */
  const [conflict, setConflict] = useState<{ bookings: unknown[]; placement: string }>();
  const dropBookings = () => {
    setConflict(undefined);
  };
  /** A new start keeps the class length, with the end clamped to the day's closing time. */
  const moveStart = (nextStart: string, ends: readonly string[]) => {
    // No times yet (the drawer opened on a closed day): the default length.
    const length =
      startTime === "" || endTime === ""
        ? DEFAULT_LENGTH_MINUTES
        : Math.max(minutesOf(endTime) - minutesOf(startTime), settings.slotMinutes);
    setStartTime(nextStart);
    setEndTime(clampTime(timeOf(minutesOf(nextStart) + length), ends));
    dropBookings();
  };

  /** A new date keeps the times only inside that day's opening hours (clamped otherwise). */
  const changeDate = (value: string) => {
    const next = maskDate(value);
    setDate(next);
    dropBookings();
    const day = parseMaskedDate(next);
    if (day === undefined) return;
    const options = optionsOf(day);
    moveStart(clampTime(startTime, options.starts), options.ends);
  };
  const [ringId, setRingId] = useState<string | null>(null);
  const [levelIds, setLevelIds] = useState<string[]>([]);
  const [instructorIds, setInstructorIds] = useState<string[]>(() => {
    const first = activeInstructors[0];
    return settings.maxInstructors === 1 && first !== undefined ? [first.id] : [];
  });
  const [description, setDescription] = useState("");
  const [capacity, setCapacity] = useState("");
  const [pending, setPending] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<FieldKey, string>>>({});
  const placement = placementKey(ringId, isoDate, startTime, endTime);
  /** The placement the fields show now: an answer that arrives late is checked against it. */
  const latestPlacement = useRef(placement);
  useEffect(() => {
    latestPlacement.current = placement;
  }, [placement]);

  const holidays = useResource(
    useCallback(async () => {
      try {
        return holidayDates((await client.GET("/club/holidays")).data?.value);
      } catch {
        return [];
      }
    }, [client]),
  );
  const automatic = useMemo(
    () => automaticDescription(catalogs.levels, levelIds, t),
    [catalogs.levels, levelIds, t],
  );
  const autoCapacity = useMemo(() => {
    const capacities = catalogs.levels
      .filter((level) => levelIds.includes(level.id))
      .map((level) => level.capacity);
    return capacities.length === 0 ? "" : String(Math.min(...capacities));
  }, [catalogs.levels, levelIds]);
  const isHoliday = isoDate !== undefined && (holidays.data ?? []).includes(isoDate);
  // A day without times (closed, or no class fits its hours) shows none, not the times kept.
  const noTimes = starts.length === 0;
  const startOptions = noTimes ? [] : starts.includes(startTime) ? starts : [startTime, ...starts];
  const endOptions = noTimes ? [] : ends.includes(endTime) ? ends : [...ends, endTime];
  const dateError = closedDay ? t("admin-scheduling:calendar.closedDay") : errors.date;

  const create = async (cancelBookings = false) => {
    if (isoDate === undefined) {
      setErrors({ date: t("admin-scheduling:calendar.createForm.invalidDate") });
      return;
    }
    if (noTimes) return;
    const sent = placement;
    setPending(true);
    setErrors({});
    try {
      const result = await client.POST("/class-sessions", {
        body: {
          capacity: capacity.trim() === "" ? null : Number(capacity),
          date: isoDate,
          description: description.trim() === "" ? null : description.trim(),
          endTime,
          instructorIds,
          levelIds,
          ringId,
          startTime,
          ...(cancelBookings ? { cancelBookings: true } : {}),
        },
      });
      setConflict(undefined);
      if (result.data !== undefined) onCreated(result.data);
    } catch (cause) {
      const code = errorCode(cause);
      // The ring, date or times changed while the request was pending: its answer is about a
      // placement the fields no longer show, so it is dropped (the admin saves again).
      const moved = latestPlacement.current !== sent;
      if (code === "RING_HAS_BOOKINGS" && isApiError(cause)) {
        const list = (cause.details as { bookings?: unknown } | undefined)?.bookings;
        if (!moved) setConflict({ bookings: Array.isArray(list) ? list : [], placement: sent });
        return;
      }
      const validationField = fieldOfValidationError(cause);
      const field: FieldKey =
        (code === undefined ? undefined : fieldByCode[code]) ??
        (validationField === "date"
          ? "date"
          : validationField === "startTime" || validationField === "endTime"
            ? "time"
            : "general");
      if (moved && (field === "date" || field === "ringId" || field === "time")) return;
      setErrors({ [field]: errorMessage(cause) });
    } finally {
      setPending(false);
    }
  };

  const submit = (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    void create();
  };

  const listError = (message: string | undefined) =>
    message === undefined ? null : (
      <p className="ah-form-field__error" role="alert">
        {message}
      </p>
    );

  return (
    <Drawer
      closeLabel={t("admin-scheduling:common.close")}
      onClose={onClose}
      open
      title={t("admin-scheduling:calendar.createForm.title")}
    >
      <form className="planning-form calendar-drawer-form" noValidate onSubmit={submit}>
        <FormField
          {...errorProp(dateError)}
          id="calendar-create-date"
          label={t("admin-scheduling:calendar.createForm.date")}
        >
          <Input
            aria-describedby={dateError === undefined ? undefined : "calendar-create-date-error"}
            aria-invalid={dateError !== undefined || undefined}
            autoComplete="off"
            id="calendar-create-date"
            inputMode="numeric"
            onChange={(event) => {
              changeDate(event.currentTarget.value);
            }}
            placeholder={t("admin-scheduling:calendar.createForm.datePlaceholder")}
            required
            value={date}
          />
        </FormField>
        {isHoliday ? (
          <p className="planning-note planning-note--warning" role="note">
            {t("admin-scheduling:calendar.createForm.holiday")}
          </p>
        ) : null}
        {/* A closed day creates nothing: no «Els alumnes la veuran de seguida» under its message. */}
        {isoDate === undefined || closedDay ? null : (
          <VisibleNowNote client={client} monday={mondayOf(isoDate)} />
        )}
        <div className="calendar-form__pair">
          <FormField
            id="calendar-create-start"
            label={t("admin-scheduling:calendar.createForm.start")}
          >
            <Select
              disabled={noTimes}
              id="calendar-create-start"
              onChange={(event) => {
                moveStart(event.currentTarget.value, ends);
              }}
              value={startTime}
            >
              {startOptions.map((time) => (
                <option key={time} value={time}>
                  {timeLabel(time)}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField
            {...errorProp(errors.time)}
            id="calendar-create-end"
            label={t("admin-scheduling:calendar.createForm.end")}
          >
            <Select
              disabled={noTimes}
              id="calendar-create-end"
              onChange={(event) => {
                setEndTime(event.currentTarget.value);
                dropBookings();
              }}
              value={endTime}
            >
              {endOptions.map((time) => (
                <option key={time} value={time}>
                  {timeLabel(time)}
                </option>
              ))}
            </Select>
          </FormField>
        </div>
        {settings.maxInstructors <= 1 ? (
          <FormField
            {...errorProp(errors.instructorIds)}
            id="calendar-create-instructor"
            label={t("admin-scheduling:classCard.instructor")}
          >
            <Select
              id="calendar-create-instructor"
              onChange={(event) => {
                setInstructorIds([event.currentTarget.value]);
              }}
              value={instructorIds[0] ?? ""}
            >
              {activeInstructors.map((instructor) => (
                <option key={instructor.id} value={instructor.id}>
                  {instructor.shortName}
                </option>
              ))}
            </Select>
          </FormField>
        ) : (
          <fieldset className="planning-form__fieldset">
            <legend>
              {t("admin-scheduling:classCard.instructors", { max: settings.maxInstructors })}
            </legend>
            <div className="planning-chips">
              {activeInstructors.map((instructor) => {
                const selected = instructorIds.includes(instructor.id);
                return (
                  <button
                    aria-pressed={selected}
                    className="planning-chip"
                    disabled={!selected && instructorIds.length >= settings.maxInstructors}
                    key={instructor.id}
                    onClick={() => {
                      setInstructorIds(
                        selected
                          ? instructorIds.filter((id) => id !== instructor.id)
                          : [...instructorIds, instructor.id],
                      );
                    }}
                    type="button"
                  >
                    {instructor.shortName}
                  </button>
                );
              })}
            </div>
            {listError(errors.instructorIds)}
          </fieldset>
        )}
        <fieldset className="planning-form__fieldset">
          <legend>{t("admin-scheduling:classCard.ring")}</legend>
          <div className="planning-chips" role="radiogroup">
            {activeRings.map((ring) => (
              <button
                aria-checked={ringId === ring.id}
                className="planning-chip planning-chip--dot"
                key={ring.id}
                onClick={() => {
                  setRingId(ring.id);
                  dropBookings();
                }}
                role="radio"
                style={colorStyle(ring.color)}
                type="button"
              >
                {ring.name}
              </button>
            ))}
            <button
              aria-checked={ringId === null}
              className="planning-chip"
              onClick={() => {
                setRingId(null);
                dropBookings();
              }}
              role="radio"
              type="button"
            >
              {t("admin-scheduling:classCard.noRing")}
            </button>
          </div>
          {listError(errors.ringId)}
        </fieldset>
        {settings.levelsEnabled ? (
          <fieldset className="planning-form__fieldset">
            <legend>{t("admin-scheduling:classCard.levels")}</legend>
            <div className="planning-chips">
              {activeLevels.map((level) => (
                <button
                  aria-pressed={levelIds.includes(level.id)}
                  className="planning-chip"
                  key={level.id}
                  onClick={() => {
                    setLevelIds(
                      levelIds.includes(level.id)
                        ? levelIds.filter((id) => id !== level.id)
                        : catalogs.levels
                            .filter((item) => item.id === level.id || levelIds.includes(item.id))
                            .map((item) => item.id),
                    );
                  }}
                  type="button"
                >
                  {level.name}
                </button>
              ))}
            </div>
            {listError(errors.levelIds)}
          </fieldset>
        ) : null}
        <div className="calendar-form__pair">
          <FormField
            {...errorProp(errors.description)}
            id="calendar-create-description"
            label={t("admin-scheduling:classCard.description")}
          >
            <Input
              id="calendar-create-description"
              maxLength={40}
              onChange={(event) => {
                setDescription(event.currentTarget.value);
              }}
              placeholder={automatic}
              value={description}
            />
          </FormField>
          <FormField id="calendar-create-capacity" label={t("admin-scheduling:classCard.capacity")}>
            <Input
              id="calendar-create-capacity"
              min={1}
              onChange={(event) => {
                setCapacity(event.currentTarget.value);
              }}
              placeholder={autoCapacity}
              type="number"
              value={capacity}
            />
          </FormField>
        </div>
        {listError(errors.general)}
        {conflict?.placement !== placement ? null : (
          <div className="calendar-conflicts" role="alert">
            <p>
              <strong>{t("admin-scheduling:calendar.ringBookings.title")}</strong>
            </p>
            <p>{t("admin-scheduling:calendar.ringBookings.text")}</p>
            <RingBookingList bookings={conflict.bookings} />
            <div className="calendar-modal__actions">
              <Button
                onClick={() => {
                  setConflict(undefined);
                }}
                variant="ghost"
              >
                {t("admin-scheduling:calendar.ringBookings.back")}
              </Button>
              <Button loading={pending} onClick={() => void create(true)} variant="danger">
                {t("admin-scheduling:calendar.ringBookings.confirm")}
              </Button>
            </div>
          </div>
        )}
        <div className="planning-form__actions">
          <Button
            disabled={isoDate !== undefined && noTimes}
            loading={pending}
            loadingLabel={t("admin-scheduling:common.saving")}
            type="submit"
          >
            {t("admin-scheduling:calendar.createForm.submit")}
          </Button>
        </div>
      </form>
    </Drawer>
  );
}
