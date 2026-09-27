import {
  type ApiClient,
  RING_BLOCK_DAY_END,
  RING_BLOCK_HORIZON_DAYS,
  RING_BLOCK_REASONS_BY_KIND,
  type RingBlockConflict,
  ringBlockFallbackTimes,
  type RingBlockFailure,
  type RingBlockKind,
  ringBlockKinds,
  ringBlockLocalDateTime,
  type RingBlockReason,
  type RingBlockSlot,
  useActiveRings,
  useRingBlockGrid,
  useRingBlockSubmit,
} from "@agilityhub/api-client";
import { clubLocalInstant, useClubFormats } from "@agilityhub/i18n";
import {
  AppBar,
  Button,
  Card,
  Icon,
  IconButton,
  Input,
  Skeleton,
  type SlotCellModel,
  SlotGrid,
  type SlotGridRow,
  useBranding,
} from "@agilityhub/ui";
import { type CSSProperties, useState } from "react";
import { useTranslation } from "react-i18next";

import "../booking/booking.css";
import { navigateInApp, type Translate } from "../booking/shared";
import "../training/training.css";
import {
  addDays,
  AFTERNOON_STARTS_AT,
  type Band,
  bandOf,
  clubToday,
  shortTime,
} from "../training/shared";

const NOTE_MAX_LENGTH = 200;

function kindLabel(t: Translate, kind: RingBlockKind): string {
  return kind === "BLOCK"
    ? t("instructor:ringBlock.kind.BLOCK")
    : t("instructor:ringBlock.kind.RESERVATION");
}

export function reasonLabel(t: Translate, reason: RingBlockReason): string {
  switch (reason) {
    case "PRIVATE_CLASS":
      return t("instructor:ringBlock.reason.PRIVATE_CLASS");
    case "THERAPY":
      return t("instructor:ringBlock.reason.THERAPY");
    case "PREPARATION":
      return t("instructor:ringBlock.reason.PREPARATION");
    case "MAINTENANCE":
      return t("instructor:ringBlock.reason.MAINTENANCE");
    default:
      return t("instructor:ringBlock.reason.OTHER");
  }
}

function submitLabel(t: Translate, kind: RingBlockKind): string {
  return kind === "BLOCK"
    ? t("instructor:ringBlock.submit.BLOCK")
    : t("instructor:ringBlock.submit.RESERVATION");
}

/** The instructor projection's second line: who trains, the block's reason, or the class. */
export function slotDetail(t: Translate, slot: RingBlockSlot): string | null {
  const cell = slot.cell;
  if (cell === undefined || cell.state === "FREE") return null;
  if (cell.classSession !== null && cell.classSession !== undefined) {
    return cell.classSession.description;
  }
  if (cell.block !== null && cell.block !== undefined) {
    return t(`enums:ringBlockReason.${cell.block.reason}`);
  }
  const who = (cell.occupants ?? []).map((occupant) =>
    t("instructor:ringBlock.occupant", { dog: occupant.dogName, member: occupant.memberName }),
  );
  return who.length === 0 ? null : who.join(", ");
}

/** A conflict of `409 RING_BLOCK_CONFLICT` overlaps a cell of the grid. */
function overlapsConflict(
  slot: RingBlockSlot,
  date: string,
  zone: string,
  conflict: RingBlockConflict,
) {
  if (conflict.from === undefined || conflict.to === undefined) return false;
  const start = clubLocalInstant(`${date}T${slot.start}`, zone);
  const end = clubLocalInstant(`${date}T${slot.end}`, zone);
  return Date.parse(conflict.from) < end && Date.parse(conflict.to) > start;
}

/**
 * The band's half hours when there is no grid (the api validates the times): every start of the
 * band and every end up to its closing boundary included (14:00 for the morning, midnight for the
 * afternoon), so the band's last half hour can be taken.
 */
function fallbackTimes(band: Band): { ends: string[]; starts: string[] } {
  return band === "morning"
    ? ringBlockFallbackTimes("00:00", AFTERNOON_STARTS_AT)
    : ringBlockFallbackTimes(AFTERNOON_STARTS_AT, RING_BLOCK_DAY_END);
}

/**
 * Screen 24 «Reservar o bloquejar pista» (`/instructor/pistes/:ringId/reservar`; S09 §2 writes
 * `/instructor/ring-blocks/new`): «Reserva de pista» / «Bloqueig» (only «Bloqueig» without
 * FREE_TRAINING), the S09 §3 reasons, the day (up to `ringBlocks.maxHorizonDays`), the band
 * (14:00 cut), every active ring, the ring's half hours as the api computes them with a contiguous
 * selection, the note and the summary. `POST /ring-blocks` never carries `cancelBookings` here:
 * an instructor cannot force a ring with bookings (R-09-11, R-09-13).
 */
export function RingBlockPage({
  client,
  ringId: routeRingId,
}: {
  client: ApiClient;
  ringId: string;
}) {
  const { t } = useTranslation(["instructor", "enums", "errors", "training", "booking"]);
  const formats = useClubFormats();
  const branding = useBranding();
  const kinds = ringBlockKinds(branding.modules);
  const [kind, setKind] = useState<RingBlockKind>(kinds[0] ?? "BLOCK");
  const [reason, setReason] = useState<RingBlockReason>(
    RING_BLOCK_REASONS_BY_KIND[kinds[0] ?? "BLOCK"][0] ?? "OTHER",
  );
  const today = clubToday(branding.timeZone);
  const [date, setDate] = useState(today);
  const [band, setBand] = useState<Band>(() => bandOf(formats.formatTime(new Date())));
  const rings = useActiveRings(client);
  const [ringId, setRingId] = useState(routeRingId);
  const ring = rings.data?.find((item) => item.id === ringId) ?? rings.data?.[0];
  const grid = useRingBlockGrid(client, {
    date,
    enabled: branding.modules.includes("FREE_TRAINING"),
    ringId: ring?.id ?? "",
  });
  const [cellIds, setCellIds] = useState<string[]>([]);
  const [manual, setManual] = useState<{ from: string; to: string }>();
  const [note, setNote] = useState("");
  const [failure, setFailure] = useState<RingBlockFailure>();
  const [conflicts, setConflicts] = useState<RingBlockConflict[]>([]);
  const { pending, submit } = useRingBlockSubmit(client);

  const reset = () => {
    setCellIds([]);
    setManual(undefined);
    setFailure(undefined);
    setConflicts([]);
  };

  const close = () => {
    if (window.history.length > 1) window.history.back();
    else navigateInApp("/instructor/avui");
  };

  const bar = (
    <AppBar
      className="booking-screen__bar"
      end={
        <IconButton
          className="booking-screen__close"
          icon="x"
          label={t("instructor:ringBlock.close")}
          onClick={close}
        />
      }
      title={<h1>{t("instructor:ringBlock.title")}</h1>}
    />
  );

  const bandSlots =
    grid.status === "ready" ? grid.slots.filter((slot) => bandOf(slot.start) === band) : [];
  const ringKey = ring?.id ?? "";
  const cellOf = (slot: RingBlockSlot): SlotCellModel => ({
    bookable: slot.bookable,
    columnId: ringKey,
    conflict: conflicts.some((conflict) =>
      overlapsConflict(slot, date, branding.timeZone, conflict),
    ),
    detail: slotDetail(t, slot),
    id: `${ringKey}_${slot.startsAt}`,
    reason: slot.cell?.reason ?? null,
    state: slot.cell?.state ?? "BOOKED",
  });
  const rows: SlotGridRow[] = bandSlots.map((slot) => ({
    cells: [cellOf(slot)],
    time: slot.start,
  }));
  const chosen = bandSlots.filter((slot) => cellIds.includes(`${ringKey}_${slot.startsAt}`));
  const range =
    grid.status === "ready"
      ? chosen.length === 0
        ? undefined
        : { from: chosen[0]?.start ?? "", to: chosen.at(-1)?.end ?? "" }
      : manual;
  const fallback = fallbackTimes(band);

  const send = async () => {
    if (ring === undefined || range === undefined) return;
    setFailure(undefined);
    setConflicts([]);
    const instant = (time: string) =>
      new Date(
        clubLocalInstant(ringBlockLocalDateTime(date, time), branding.timeZone),
      ).toISOString();
    const result = await submit({
      from: instant(range.from),
      kind,
      note,
      reason,
      ringId: ring.id,
      to: instant(range.to),
    });
    if (result.status === "created") {
      navigateInApp(`/instructor/avui?date=${date}`, {
        notice: {
          messageKey:
            kind === "BLOCK"
              ? "instructor:ringBlock.saved.BLOCK"
              : "instructor:ringBlock.saved.RESERVATION",
          tone: "success",
        },
      });
      return;
    }
    setFailure(result.failure);
    if (result.failure.kind === "conflict") {
      // R-09-11: the overlaps are marked and the grid read again (it was out of date).
      setConflicts(result.failure.conflicts);
      setCellIds([]);
    }
    if (result.failure.kind === "conflict" || result.failure.kind === "bookings") grid.refetch();
  };

  const failureMessage =
    failure === undefined
      ? undefined
      : t(`errors:${failure.code}`, { defaultValue: t("errors:INTERNAL_ERROR") });

  const segment = (
    <div
      aria-label={t("instructor:ringBlock.kindLabel")}
      className="ring-block-segment"
      role="group"
    >
      {kinds.map((value) => (
        <button
          aria-pressed={value === kind}
          disabled={pending}
          key={value}
          onClick={() => {
            if (value === kind) return;
            setKind(value);
            setReason(RING_BLOCK_REASONS_BY_KIND[value][0] ?? "OTHER");
            setFailure(undefined);
          }}
          type="button"
        >
          {kindLabel(t, value)}
        </button>
      ))}
    </div>
  );

  return (
    <section className="booking-screen ring-block-screen">
      {bar}
      {segment}
      <h2 className="booking-section__title">{t("instructor:ringBlock.reasonTitle")}</h2>
      <div
        aria-label={t("instructor:ringBlock.reasonTitle")}
        className="training-chips"
        role="group"
      >
        {RING_BLOCK_REASONS_BY_KIND[kind].map((value) => (
          <button
            aria-pressed={value === reason}
            className={`ah-chip training-chip${value === reason ? " training-chip--selected" : ""}`}
            disabled={pending}
            key={value}
            onClick={() => {
              setReason(value);
            }}
            type="button"
          >
            {reasonLabel(t, value)}
          </button>
        ))}
      </div>
      <div className="ring-block-selects">
        <select
          aria-label={t("instructor:ringBlock.day")}
          disabled={pending}
          onChange={(event) => {
            setDate(event.currentTarget.value);
            reset();
          }}
          value={date}
        >
          {Array.from({ length: RING_BLOCK_HORIZON_DAYS + 1 }, (_, index) =>
            addDays(today, index),
          ).map((day) => (
            <option key={day} value={day}>
              {formats.formatActivityDate(day, null, null, "list", day)}
            </option>
          ))}
        </select>
        <select
          aria-label={t("instructor:ringBlock.band.label")}
          disabled={pending}
          onChange={(event) => {
            setBand(event.currentTarget.value === "afternoon" ? "afternoon" : "morning");
            reset();
          }}
          value={band}
        >
          <option value="morning">{t("instructor:ringBlock.band.morning")}</option>
          <option value="afternoon">{t("instructor:ringBlock.band.afternoon")}</option>
        </select>
      </div>
      {rings.status === "loading" ? (
        <Skeleton height="1.75rem" label={t("instructor:ringBlock.loading")} />
      ) : null}
      {rings.status === "error" ? (
        <Card className="booking-error" role="alert">
          <p>{t("instructor:ringBlock.error")}</p>
          <Button onClick={rings.refetch} variant="secondary">
            {t("instructor:ringBlock.retry")}
          </Button>
        </Card>
      ) : null}
      {rings.data === undefined ? null : (
        <div aria-label={t("instructor:ringBlock.ring")} className="training-chips" role="group">
          {rings.data.map((item) => {
            const pressed = item.id === ring?.id;
            return (
              <button
                aria-pressed={pressed}
                className={`ah-chip training-chip${pressed ? " training-chip--selected" : ""}`}
                disabled={pending}
                key={item.id}
                onClick={() => {
                  setRingId(item.id);
                  reset();
                }}
                type="button"
              >
                <span
                  aria-hidden="true"
                  className="training-ring-dot"
                  style={{ "--ah-ring-color": item.color } as CSSProperties}
                />
                {item.name}
              </button>
            );
          })}
        </div>
      )}
      {grid.status === "loading" ? (
        <Skeleton height="6rem" label={t("instructor:ringBlock.loading")} />
      ) : null}
      {grid.status === "error" ? (
        <Card className="booking-error" role="alert">
          <p>{t("instructor:ringBlock.error")}</p>
          <Button onClick={grid.refetch} variant="secondary">
            {t("instructor:ringBlock.retry")}
          </Button>
        </Card>
      ) : null}
      {grid.status === "closed" ? (
        <Card className="training-closed">
          <p>{t("training:day.closed")}</p>
        </Card>
      ) : null}
      {grid.status === "ready" ? (
        rows.length === 0 ? (
          <p className="booking-screen__intro">{t("instructor:ringBlock.noSlots")}</p>
        ) : (
          // Inert while the block is sent: the answer belongs to the cells shown.
          <fieldset className="training-fieldset" disabled={pending}>
            <SlotGrid
              columns={[{ id: ringKey, label: ring?.name ?? "" }]}
              labels={{
                cell: (time, state) => t("training:grid.cell", { state, time }),
                classLabel: (time) => t("training:grid.classLabel", { time }),
                free: t("training:grid.free"),
                grid: t("instructor:ringBlock.grid"),
                own: (time) => t("training:grid.own", { time }),
                reason: (reason) => t(`enums:slotReason.${reason}`),
                taken: t("training:grid.taken"),
                time: t("training:grid.time"),
              }}
              mode="contiguous"
              onSelectionChange={(next) => {
                setCellIds(next);
                setFailure(undefined);
              }}
              rows={rows}
              selection={{ cellIds }}
            />
          </fieldset>
        )
      ) : null}
      {grid.status === "unavailable" && ring !== undefined ? (
        <div className="ring-block-selects">
          <label>
            {t("instructor:ringBlock.card.from")}
            <select
              disabled={pending}
              onChange={(event) => {
                const from = event.currentTarget.value;
                const to =
                  manual?.to !== undefined && manual.to > from
                    ? manual.to
                    : (fallback.ends.find((end) => end > from) ?? "");
                setManual({ from, to });
                setFailure(undefined);
              }}
              value={manual?.from ?? ""}
            >
              <option disabled value="">
                —
              </option>
              {fallback.starts.map((time) => (
                <option key={time} value={time}>
                  {shortTime(time)}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t("instructor:ringBlock.card.to")}
            <select
              disabled={pending || manual === undefined}
              onChange={(event) => {
                const to = event.currentTarget.value;
                setManual((current) => (current === undefined ? undefined : { ...current, to }));
                setFailure(undefined);
              }}
              value={manual?.to ?? ""}
            >
              <option disabled value="">
                —
              </option>
              {fallback.ends
                .filter((time) => manual === undefined || time > manual.from)
                .map((time) => (
                  <option key={time} value={time}>
                    {shortTime(time)}
                  </option>
                ))}
            </select>
          </label>
        </div>
      ) : null}
      <Input
        aria-label={t("instructor:ringBlock.note.label")}
        className="ring-block-note"
        disabled={pending}
        maxLength={NOTE_MAX_LENGTH}
        onChange={(event) => {
          setNote(event.currentTarget.value);
        }}
        placeholder={t("instructor:ringBlock.note.placeholder")}
        value={note}
      />
      {range === undefined || ring === undefined ? null : (
        <p className="booking-note ring-block-summary">
          {t("instructor:ringBlock.summary", {
            from: shortTime(range.from),
            ring: ring.name,
            to: shortTime(range.to),
          })}
        </p>
      )}
      {failure === undefined ? null : (
        <div className="booking-note booking-note--danger ring-block-conflicts" role="alert">
          <p>
            <Icon aria-hidden="true" name="warn" />
            {failureMessage}
          </p>
          {failure.kind === "bookings" ? <p>{t("instructor:ringBlock.askAdmin")}</p> : null}
          {failure.kind === "conflict" && failure.conflicts.length > 0 ? (
            <>
              <p>{t("instructor:ringBlock.conflicts")}</p>
              <ul>
                {failure.conflicts.map((conflict, index) => (
                  <li key={`${conflict.label ?? ""}-${String(index)}`}>
                    {t("instructor:ringBlock.conflictRow", {
                      from:
                        conflict.from === undefined
                          ? ""
                          : shortTime(formats.formatTime(conflict.from)),
                      label: conflict.label ?? "",
                      to:
                        conflict.to === undefined ? "" : shortTime(formats.formatTime(conflict.to)),
                    })}
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </div>
      )}
      <Button
        className="ring-block-submit"
        disabled={range === undefined || range.to === "" || ring === undefined}
        loading={pending}
        loadingLabel={t("instructor:ringBlock.sending")}
        onClick={() => void send()}
      >
        {submitLabel(t, kind)}
      </Button>
    </section>
  );
}
