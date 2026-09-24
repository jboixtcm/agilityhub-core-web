import { isApiError, type ApiClient, type components } from "@agilityhub/api-client";
import { useClubFormats } from "@agilityhub/i18n";
import { Button, Drawer, FormField, Input, Select, Textarea } from "@agilityhub/ui";
import { type SyntheticEvent, useState } from "react";
import { useTranslation } from "react-i18next";

import {
  type CalendarSettings,
  clampTime,
  clubInstant,
  errorCode,
  formatMaskedDate,
  maskDate,
  minutesOf,
  type OpeningHours,
  openingOf,
  parseMaskedDate,
  type RingBlock,
  timeLabel,
  timeOf,
  timeOptions,
  useCalendarErrorMessage,
} from "./calendar-shared";
import { RingBookingList } from "./SelectedClassCard";
import { clubToday, errorProp, type Ring } from "./shared";

type RingBlockPatch = components["schemas"]["RingBlockPatchRequest"];
type Kind = RingBlock["kind"];
type Reason = RingBlock["reason"];

/** S06 §3 combinations (`ACTIVITY` only through S07). */
const reasonsByKind: Readonly<Record<Kind, readonly Reason[]>> = {
  BLOCK: ["MAINTENANCE", "OTHER"],
  RESERVATION: ["PRIVATE_CLASS", "THERAPY", "PREPARATION", "OTHER"],
};

interface Conflict {
  from?: string;
  label?: string;
  to?: string;
}

type FieldKey = "date" | "general" | "time";

export type RingBlockDrawerMode = { kind: "create" } | { block: RingBlock; kind: "edit" };

/**
 * [Bloqueja pista] (R-06-11): ring, masked date, from/to in steps of `classes.slotMinutes`
 * (duration ≥ `training.slotMinutes`), kind, reason and note; instants sent in UTC from the club
 * `timeZone`. Clicking a block opens it in edit mode (future blocks only) with its cancellation;
 * activity blocks are read-only with a link to the activity. Mounted only while open.
 */
export function RingBlockDrawer({
  client,
  mode,
  modules,
  onClose,
  onNavigate,
  onSaved,
  openingHours,
  rings,
  settings,
  timeZone,
}: {
  client: ApiClient;
  mode: RingBlockDrawerMode;
  modules: readonly string[];
  onClose: () => void;
  onNavigate: (path: string) => void;
  onSaved: (message: string) => void;
  openingHours: OpeningHours;
  rings: readonly Ring[];
  settings: CalendarSettings;
  timeZone: string;
}) {
  const { t } = useTranslation(["admin-scheduling", "enums", "errors"]);
  const { formatTime } = useClubFormats();
  const errorMessage = useCalendarErrorMessage();
  const block = mode.kind === "edit" ? mode.block : undefined;
  const managed = block?.activityId !== null && block?.activityId !== undefined;
  const activeRings = rings.filter((ring) => ring.active || ring.id === block?.ringId);
  const moduleKinds: Kind[] = modules.includes("FREE_TRAINING")
    ? ["BLOCK", "RESERVATION"]
    : ["BLOCK"];
  // Edit mode always offers the stored kind, also a RESERVATION after FREE_TRAINING was turned off.
  const kinds =
    block === undefined || moduleKinds.includes(block.kind)
      ? moduleKinds
      : [...moduleKinds, block.kind];
  const today = clubToday(timeZone);
  const optionsOf = (day: string) => {
    const opening = openingOf(openingHours, day);
    return {
      ends: timeOptions(
        timeOf(minutesOf(opening.open) + settings.trainingSlotMinutes),
        opening.close,
        settings.slotMinutes,
      ),
      starts: timeOptions(
        opening.open,
        timeOf(minutesOf(opening.close) - settings.trainingSlotMinutes),
        settings.slotMinutes,
      ),
    };
  };
  const [ringId, setRingId] = useState(block?.ringId ?? activeRings[0]?.id ?? "");
  const [date, setDate] = useState(block === undefined ? "" : formatMaskedDate(block.date));
  const isoDate = parseMaskedDate(date);
  const { ends, starts } = optionsOf(isoDate ?? today);
  const [from, setFrom] = useState(block?.fromLocal ?? starts[0] ?? "");
  const [to, setTo] = useState(block?.toLocal ?? ends[0] ?? "");
  const [kind, setKind] = useState<Kind>(block?.kind ?? "BLOCK");
  const [reason, setReason] = useState<Reason>(block?.reason ?? "MAINTENANCE");
  const [note, setNote] = useState(block?.note ?? "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<{ field: FieldKey; message: string }>();
  const [conflicts, setConflicts] = useState<Conflict[]>([]);
  const [bookings, setBookings] = useState<unknown[]>();
  const reasons =
    kind === block?.kind && !reasonsByKind[kind].includes(block.reason)
      ? [...reasonsByKind[kind], block.reason]
      : reasonsByKind[kind];

  /** The end stays ≥ start + `training.slotMinutes` and inside the day's opening hours. */
  const fitTo = (start: string, end: string, options: readonly string[]) => {
    const minimum = timeOf(minutesOf(start) + settings.trainingSlotMinutes);
    return clampTime(end < minimum ? minimum : end, options);
  };
  /**
   * The `RING_HAS_BOOKINGS` list belongs to the ring, date and times it was answered for: any
   * change to them drops it, so [Anul·la les reserves i desa] never confirms a slot not shown.
   */
  const dropBookings = () => {
    setBookings(undefined);
  };

  /** A new date keeps the times only inside that day's opening hours (clamped otherwise). */
  const changeDate = (value: string) => {
    const next = maskDate(value);
    setDate(next);
    dropBookings();
    const day = parseMaskedDate(next);
    if (day === undefined) return;
    const options = optionsOf(day);
    const nextFrom = clampTime(from, options.starts);
    setFrom(nextFrom);
    setTo(fitTo(nextFrom, to, options.ends));
  };
  const readOnly = managed;
  const startOptions = starts.includes(from) ? starts : [from, ...starts];
  const endOptions = ends.includes(to) ? ends : [...ends, to];

  const fail = (cause: unknown) => {
    const code = errorCode(cause);
    const details = isApiError(cause)
      ? (cause.details as Record<string, unknown> | undefined)
      : undefined;
    if (code === "RING_BLOCK_CONFLICT") {
      setConflicts(Array.isArray(details?.conflicts) ? (details.conflicts as Conflict[]) : []);
      setError({ field: "general", message: errorMessage(cause) });
      return;
    }
    if (code === "RING_HAS_BOOKINGS") {
      setBookings(Array.isArray(details?.bookings) ? details.bookings : []);
      return;
    }
    setError({
      field:
        code === "INVALID_TIME_RANGE" ||
        code === "INVALID_SLOT_GRANULARITY" ||
        code === "OUTSIDE_OPENING_HOURS"
          ? "time"
          : "general",
      message: errorMessage(cause),
    });
  };

  const save = async (cancelBookings = false) => {
    if (isoDate === undefined) {
      setError({ field: "date", message: t("admin-scheduling:calendar.createForm.invalidDate") });
      return;
    }
    setPending(true);
    setError(undefined);
    setConflicts([]);
    const fields = {
      from: clubInstant(isoDate, from, timeZone),
      kind,
      note: note.trim() === "" ? null : note.trim(),
      reason,
      ringId,
      to: clubInstant(isoDate, to, timeZone),
    };
    try {
      if (block === undefined) {
        // A key per attempt (the form is disabled while pending): a retry after fixing a field
        // must not replay the first answer.
        await client.POST("/ring-blocks", {
          body: { ...fields, ...(cancelBookings ? { cancelBookings: true } : {}) },
          params: { header: { "Idempotency-Key": crypto.randomUUID() } },
        });
      } else {
        const patch: RingBlockPatch = { version: block.version };
        if (fields.ringId !== block.ringId) patch.ringId = fields.ringId;
        if (fields.from !== block.from) patch.from = fields.from;
        if (fields.to !== block.to) patch.to = fields.to;
        if (fields.kind !== block.kind) patch.kind = fields.kind;
        if (fields.reason !== block.reason) patch.reason = fields.reason;
        if (fields.note !== (block.note ?? null)) patch.note = fields.note;
        if (cancelBookings) patch.cancelBookings = true;
        await client.PATCH("/ring-blocks/{id}", {
          body: patch,
          params: { path: { id: block.id } },
        });
      }
      setBookings(undefined);
      onSaved(t("admin-scheduling:calendar.blockForm.saved"));
    } catch (cause) {
      fail(cause);
    } finally {
      setPending(false);
    }
  };

  const cancelBlock = async () => {
    if (block === undefined) return;
    setPending(true);
    setError(undefined);
    try {
      await client.POST("/ring-blocks/{id}/cancellation", {
        body: {},
        params: { path: { id: block.id } },
      });
      onSaved(t("admin-scheduling:calendar.blockForm.cancelledDone"));
    } catch (cause) {
      fail(cause);
    } finally {
      setPending(false);
    }
  };

  const submit = (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    void save();
  };

  const conflictTime = (value: string | undefined) =>
    value === undefined ? "" : formatTime(value);

  return (
    <Drawer
      closeLabel={t("admin-scheduling:common.close")}
      onClose={onClose}
      open
      title={
        block === undefined
          ? t("admin-scheduling:calendar.blockForm.title")
          : t("admin-scheduling:calendar.blockForm.editTitle")
      }
    >
      <form className="planning-form calendar-drawer-form" noValidate onSubmit={submit}>
        {managed ? (
          <p className="planning-note planning-note--warning" role="note">
            {t("admin-scheduling:calendar.blockForm.managedByActivity")}{" "}
            <a
              href={`/activitats/${block.activityId ?? ""}`}
              onClick={(event) => {
                event.preventDefault();
                onNavigate(`/activitats/${block.activityId ?? ""}`);
              }}
            >
              {t("admin-scheduling:calendar.blockForm.openActivity")}
            </a>
          </p>
        ) : null}
        <fieldset className="planning-form__fieldset" disabled={readOnly || pending}>
          <FormField id="calendar-block-ring" label={t("admin-scheduling:calendar.blockForm.ring")}>
            <Select
              id="calendar-block-ring"
              onChange={(event) => {
                setRingId(event.currentTarget.value);
                dropBookings();
              }}
              value={ringId}
            >
              {activeRings.map((ring) => (
                <option key={ring.id} value={ring.id}>
                  {ring.name}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField
            {...errorProp(error?.field === "date" ? error.message : undefined)}
            id="calendar-block-date"
            label={t("admin-scheduling:calendar.blockForm.date")}
          >
            <Input
              autoComplete="off"
              id="calendar-block-date"
              inputMode="numeric"
              onChange={(event) => {
                changeDate(event.currentTarget.value);
              }}
              placeholder={t("admin-scheduling:calendar.createForm.datePlaceholder")}
              required
              value={date}
            />
          </FormField>
          <div className="calendar-form__pair">
            <FormField
              id="calendar-block-from"
              label={t("admin-scheduling:calendar.blockForm.from")}
            >
              <Select
                id="calendar-block-from"
                onChange={(event) => {
                  const next = event.currentTarget.value;
                  setFrom(next);
                  setTo(fitTo(next, to, ends));
                  dropBookings();
                }}
                value={from}
              >
                {startOptions.map((time) => (
                  <option key={time} value={time}>
                    {timeLabel(time)}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField
              {...errorProp(error?.field === "time" ? error.message : undefined)}
              id="calendar-block-to"
              label={t("admin-scheduling:calendar.blockForm.to")}
            >
              <Select
                id="calendar-block-to"
                onChange={(event) => {
                  setTo(event.currentTarget.value);
                  dropBookings();
                }}
                value={to}
              >
                {endOptions.map((time) => (
                  <option key={time} value={time}>
                    {timeLabel(time)}
                  </option>
                ))}
              </Select>
            </FormField>
          </div>
          <FormField id="calendar-block-kind" label={t("admin-scheduling:calendar.blockForm.kind")}>
            <Select
              id="calendar-block-kind"
              onChange={(event) => {
                const next = kinds.find((value) => value === event.currentTarget.value) ?? "BLOCK";
                setKind(next);
                if (!reasonsByKind[next].includes(reason))
                  setReason(reasonsByKind[next][0] ?? "OTHER");
              }}
              value={kind}
            >
              {kinds.map((value) => (
                <option key={value} value={value}>
                  {t(`enums:ringBlockKind.${value}`)}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField
            id="calendar-block-reason"
            label={t("admin-scheduling:calendar.blockForm.reason")}
          >
            <Select
              id="calendar-block-reason"
              onChange={(event) => {
                setReason(reasons.find((value) => value === event.currentTarget.value) ?? "OTHER");
              }}
              value={reason}
            >
              {(managed ? [reason] : reasons).map((value) => (
                <option key={value} value={value}>
                  {t(`enums:ringBlockReason.${value}`)}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField id="calendar-block-note" label={t("admin-scheduling:calendar.blockForm.note")}>
            <Textarea
              id="calendar-block-note"
              maxLength={200}
              onChange={(event) => {
                setNote(event.currentTarget.value);
              }}
              rows={2}
              value={note}
            />
          </FormField>
        </fieldset>
        {error?.field === "general" ? (
          <p className="ah-form-field__error" role="alert">
            {error.message}
          </p>
        ) : null}
        {conflicts.length === 0 ? null : (
          <div className="calendar-conflicts">
            <p>{t("admin-scheduling:calendar.blockForm.conflicts")}</p>
            <ul aria-label={t("admin-scheduling:calendar.blockForm.conflicts")}>
              {conflicts.map((conflict, index) => (
                <li key={`${conflict.label ?? ""}-${String(index)}`}>
                  {t("admin-scheduling:calendar.blockForm.conflictRow", {
                    from: conflictTime(conflict.from),
                    label: conflict.label ?? "",
                    to: conflictTime(conflict.to),
                  })}
                </li>
              ))}
            </ul>
          </div>
        )}
        {bookings === undefined ? null : (
          <div className="calendar-conflicts" role="alert">
            <p>
              <strong>{t("admin-scheduling:calendar.ringBookings.title")}</strong>
            </p>
            <p>{t("admin-scheduling:calendar.ringBookings.text")}</p>
            <RingBookingList bookings={bookings} />
            <div className="calendar-modal__actions">
              <Button
                onClick={() => {
                  setBookings(undefined);
                }}
                variant="ghost"
              >
                {t("admin-scheduling:calendar.ringBookings.back")}
              </Button>
              <Button loading={pending} onClick={() => void save(true)} variant="danger">
                {t("admin-scheduling:calendar.ringBookings.confirm")}
              </Button>
            </div>
          </div>
        )}
        {readOnly ? null : (
          <div className="planning-form__actions">
            {block === undefined ? null : (
              <Button disabled={pending} onClick={() => void cancelBlock()} variant="danger">
                {t("admin-scheduling:calendar.blockForm.cancel")}
              </Button>
            )}
            <Button
              loading={pending}
              loadingLabel={t("admin-scheduling:common.saving")}
              type="submit"
            >
              {t("admin-scheduling:calendar.blockForm.submit")}
            </Button>
          </div>
        )}
      </form>
    </Drawer>
  );
}
