import {
  type ApiClient,
  RING_BLOCK_HORIZON_DAYS,
  RING_BLOCK_REASONS_BY_KIND,
  type RingBlockFailure,
  type RingBlockKind,
  ringBlockKinds,
  type RingBlockReason,
  type RingBlockSlot,
  useActiveRings,
  useRingBlockGrid,
  useRingBlockSubmit,
} from "@agilityhub/api-client";
import { useSession } from "@agilityhub/auth";
import { clubLocalInstant, useClubFormats } from "@agilityhub/i18n";
import { Button, Card, useBranding } from "@agilityhub/ui";
import { type CSSProperties, useState } from "react";
import { useTranslation } from "react-i18next";

import { RingBookingList } from "../planning/SelectedClassCard";

import "./training.css";

type Translate = ReturnType<typeof useTranslation>["t"];

function clubToday(timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone,
    year: "numeric",
  }).format(new Date());
}

function addDays(date: string, days: number): string {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function shortTime(time: string): string {
  return time.replace(/^0(?=\d:)/u, "");
}

function reasonLabel(t: Translate, reason: RingBlockReason): string {
  switch (reason) {
    case "PRIVATE_CLASS":
      return t("enums:ringBlockReason.PRIVATE_CLASS");
    case "THERAPY":
      return t("enums:ringBlockReason.THERAPY");
    case "PREPARATION":
      return t("enums:ringBlockReason.PREPARATION");
    case "MAINTENANCE":
      return t("enums:ringBlockReason.MAINTENANCE");
    default:
      return t("enums:ringBlockReason.OTHER");
  }
}

/** Every half-hour boundary of the day, for a ring without a grid (the api validates them). */
const DAY_TIMES = Array.from(
  { length: 48 },
  (_, index) =>
    `${String(Math.floor(index / 2)).padStart(2, "0")}:${index % 2 === 0 ? "00" : "30"}`,
);

/**
 * The starts a block may take and, for a start, the ends of its run of free cells: the same
 * contiguous rule as screen 24's grid (R-09-11), without drawing it.
 */
function timeOptions(slots: readonly RingBlockSlot[] | undefined, from: string) {
  if (slots === undefined) {
    return { ends: DAY_TIMES.filter((time) => time > from), starts: DAY_TIMES.slice(0, -1) };
  }
  const starts = slots.filter((slot) => slot.bookable).map((slot) => slot.start);
  const ends: string[] = [];
  const index = slots.findIndex((slot) => slot.start === from);
  for (let position = index; position >= 0 && position < slots.length; position += 1) {
    const slot = slots[position];
    if (slot?.bookable !== true) break;
    ends.push(slot.end);
  }
  return { ends, starts };
}

/**
 * D12 card «Reservar o bloquejar pista (sense alumne)» (S09 §2 row D12): the same contract,
 * request and error handling as screen 24 (`useRingBlockGrid`, `useRingBlockSubmit`), with the day
 * and the times as selects. `cancelBookings: true` only for an ADMIN, after E4-W02's confirmation
 * listing `details.bookings[]` (R-09-13); an instructor is told to ask the administration.
 */
export function RingBlockCard({ client }: { client: ApiClient }) {
  const { t } = useTranslation(["instructor", "enums", "errors", "admin-scheduling", "training"]);
  const formats = useClubFormats();
  const branding = useBranding();
  const session = useSession();
  const admin = session.roles.includes("ADMIN");
  const kinds = ringBlockKinds(branding.modules);
  const [kind, setKind] = useState<RingBlockKind>(kinds[0] ?? "BLOCK");
  const [reason, setReason] = useState<RingBlockReason>(
    RING_BLOCK_REASONS_BY_KIND[kinds[0] ?? "BLOCK"][0] ?? "OTHER",
  );
  const today = clubToday(branding.timeZone);
  const [date, setDate] = useState(today);
  const rings = useActiveRings(client);
  const [ringId, setRingId] = useState("");
  const ring = rings.data?.find((item) => item.id === ringId) ?? rings.data?.[0];
  const grid = useRingBlockGrid(client, {
    date,
    enabled: branding.modules.includes("FREE_TRAINING"),
    ringId: ring?.id ?? "",
  });
  const slots =
    grid.status === "ready" ? grid.slots : grid.status === "unavailable" ? undefined : [];
  const [from, setFrom] = useState("");
  const starts = timeOptions(slots, "").starts;
  const start = starts.includes(from) ? from : (starts[0] ?? "");
  const ends = timeOptions(slots, start).ends;
  const [to, setTo] = useState("");
  const end = ends.includes(to) ? to : (ends[0] ?? "");
  const [failure, setFailure] = useState<RingBlockFailure>();
  const [saved, setSaved] = useState<RingBlockKind>();
  const { pending, submit } = useRingBlockSubmit(client);
  /** The fields a `RING_HAS_BOOKINGS` answered for: a change drops the confirmation. */
  const placement = `${ring?.id ?? ""}|${date}|${start}|${end}`;
  const [answeredFor, setAnsweredFor] = useState<string>();

  const changed = () => {
    setFailure(undefined);
    setSaved(undefined);
    setAnsweredFor(undefined);
  };

  const send = async (cancelBookings = false) => {
    if (ring === undefined || start === "" || end === "") return;
    const sent = placement;
    const instant = (time: string) =>
      new Date(clubLocalInstant(`${date}T${time}`, branding.timeZone)).toISOString();
    setFailure(undefined);
    setSaved(undefined);
    const result = await submit(
      { from: instant(start), kind, note: "", reason, ringId: ring.id, to: instant(end) },
      cancelBookings && admin,
    );
    if (result.status === "created") {
      setSaved(kind);
      setAnsweredFor(undefined);
      grid.refetch();
      return;
    }
    setFailure(result.failure);
    setAnsweredFor(result.failure.kind === "bookings" ? sent : undefined);
    if (result.failure.kind === "conflict" || result.failure.kind === "bookings") grid.refetch();
  };

  const message =
    failure === undefined
      ? undefined
      : t(`errors:${failure.code}`, { defaultValue: t("errors:INTERNAL_ERROR") });
  const confirmBookings = failure?.kind === "bookings" && admin && answeredFor === placement;

  return (
    <Card className="ring-block-card">
      <h2 className="ring-block-card__title">{t("instructor:ringBlock.card.title")}</h2>
      <div className="ring-block-card__row">
        <div
          aria-label={t("instructor:ringBlock.kindLabel")}
          className="ring-block-card__kinds"
          role="group"
        >
          {kinds.map((value) => (
            <button
              aria-pressed={value === kind}
              className={`ah-chip ring-block-card__chip${value === kind ? " ring-block-card__chip--on" : ""}`}
              disabled={pending}
              key={value}
              onClick={() => {
                if (value === kind) return;
                setKind(value);
                setReason(RING_BLOCK_REASONS_BY_KIND[value][0] ?? "OTHER");
                changed();
              }}
              type="button"
            >
              {value === "BLOCK"
                ? t("instructor:ringBlock.kind.BLOCK")
                : t("instructor:ringBlock.kind.RESERVATION")}
            </button>
          ))}
        </div>
        <select
          aria-label={t("instructor:ringBlock.reasonTitle")}
          className="ring-block-card__select"
          disabled={pending}
          onChange={(event) => {
            const next = RING_BLOCK_REASONS_BY_KIND[kind].find(
              (value) => value === event.currentTarget.value,
            );
            if (next !== undefined) setReason(next);
            changed();
          }}
          value={reason}
        >
          {RING_BLOCK_REASONS_BY_KIND[kind].map((value) => (
            <option key={value} value={value}>
              {t("instructor:ringBlock.card.reason", { reason: reasonLabel(t, value) })}
            </option>
          ))}
        </select>
      </div>
      <div className="ring-block-card__row">
        <div
          aria-label={t("instructor:ringBlock.card.when")}
          className="ring-block-card__when"
          role="group"
        >
          <select
            aria-label={t("instructor:ringBlock.day")}
            disabled={pending}
            onChange={(event) => {
              setDate(event.currentTarget.value);
              setFrom("");
              setTo("");
              changed();
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
          <span aria-hidden="true">·</span>
          <select
            aria-label={t("instructor:ringBlock.card.from")}
            disabled={pending || starts.length === 0}
            onChange={(event) => {
              setFrom(event.currentTarget.value);
              setTo("");
              changed();
            }}
            value={start}
          >
            {starts.map((time) => (
              <option key={time} value={time}>
                {shortTime(time)}
              </option>
            ))}
          </select>
          <span aria-hidden="true">–</span>
          <select
            aria-label={t("instructor:ringBlock.card.to")}
            disabled={pending || ends.length === 0}
            onChange={(event) => {
              setTo(event.currentTarget.value);
              changed();
            }}
            value={end}
          >
            {ends.map((time) => (
              <option key={time} value={time}>
                {shortTime(time)}
              </option>
            ))}
          </select>
        </div>
        <label className="ring-block-card__ring">
          <span
            aria-hidden="true"
            className="ring-block-card__dot"
            style={{ "--ah-ring-color": ring?.color } as CSSProperties}
          />
          <select
            aria-label={t("instructor:ringBlock.ring")}
            disabled={pending || rings.data === undefined}
            onChange={(event) => {
              setRingId(event.currentTarget.value);
              setFrom("");
              setTo("");
              changed();
            }}
            value={ring?.id ?? ""}
          >
            {(rings.data ?? []).map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        <Button
          className="ring-block-card__submit"
          disabled={ring === undefined || start === "" || end === "" || grid.status === "loading"}
          loading={pending}
          loadingLabel={t("instructor:ringBlock.sending")}
          onClick={() => void send()}
        >
          {kind === "BLOCK"
            ? t("instructor:ringBlock.card.submit.BLOCK")
            : t("instructor:ringBlock.card.submit.RESERVATION")}
        </Button>
      </div>
      {grid.status === "closed" ? (
        <p className="ring-block-card__note">{t("training:day.closed")}</p>
      ) : null}
      {grid.status === "error" || rings.status === "error" ? (
        <p className="ring-block-card__note" role="alert">
          {t("instructor:ringBlock.error")}{" "}
          <button
            className="ring-block-card__retry"
            onClick={() => {
              if (rings.status === "error") rings.refetch();
              else grid.refetch();
            }}
            type="button"
          >
            {t("instructor:ringBlock.retry")}
          </button>
        </p>
      ) : null}
      {saved === undefined ? null : (
        <p className="ring-block-card__note ring-block-card__note--success" role="status">
          {saved === "BLOCK"
            ? t("instructor:ringBlock.saved.BLOCK")
            : t("instructor:ringBlock.saved.RESERVATION")}
        </p>
      )}
      {failure === undefined ? null : (
        <div className="ring-block-card__note ring-block-card__note--danger" role="alert">
          <p>{message}</p>
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
          {failure.kind === "bookings" && !admin ? (
            <p>{t("instructor:ringBlock.askAdmin")}</p>
          ) : null}
          {confirmBookings ? (
            <>
              <p>
                <strong>{t("admin-scheduling:calendar.ringBookings.title")}</strong>
              </p>
              <p>{t("admin-scheduling:calendar.ringBookings.text")}</p>
              <RingBookingList bookings={failure.bookings} />
              <div className="ring-block-card__actions">
                <Button
                  disabled={pending}
                  onClick={() => {
                    changed();
                  }}
                  variant="ghost"
                >
                  {t("admin-scheduling:calendar.ringBookings.back")}
                </Button>
                <Button loading={pending} onClick={() => void send(true)} variant="danger">
                  {t("admin-scheduling:calendar.ringBookings.confirm")}
                </Button>
              </div>
            </>
          ) : null}
        </div>
      )}
    </Card>
  );
}

/**
 * `/agenda` (D12): the weekly agenda grid, the registrants and the attendance are S10 (E6-W03);
 * until then the page holds only the ring card of E5-W02.
 */
export function AgendaRingCardPage({ client }: { client: ApiClient }) {
  const { t } = useTranslation("shell");
  return (
    <section className="planning-page agenda-page">
      <h1 className="ah-sr-only">{t("shell:nav.training")}</h1>
      <RingBlockCard client={client} />
    </section>
  );
}
