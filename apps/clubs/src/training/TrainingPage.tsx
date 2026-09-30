import type { ApiClient } from "@agilityhub/api-client";
import { useClubFormats } from "@agilityhub/i18n";
import {
  AppBar,
  Button,
  Card,
  Icon,
  Skeleton,
  SlotGrid,
  type SlotGridLabels,
  type SlotGridRow,
  Toast,
  useBranding,
} from "@agilityhub/ui";
import {
  type CSSProperties,
  type MouseEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";

import "../booking/booking.css";
import { DogChips } from "../booking/DogChips";
import { errorText, navigateInApp, type Translate } from "../booking/shared";

import "./training.css";
import {
  ANY_COLUMN,
  anyCell,
  type Band,
  bandOf,
  type CancellableTraining,
  clubToday,
  codeOf,
  detailsOf,
  freeRingsOf,
  reportTrainingRefusal,
  ringCell,
  shortTime,
  slotStillFree,
  type TrainingRing,
  type TrainingSlot,
  useOnline,
  useTrainingEligibility,
  useTrainingSlots,
  useTrainingSummary,
  useWindowFocus,
} from "./shared";

/** The slot being confirmed: its start and the ring the button names. */
interface Choice {
  ringId: string;
  startsAt: string;
}

/** A refusal of `POST /training-bookings`, by `code` (S09 §6), shown next to the button. */
type Failure =
  | { cancellable: CancellableTraining[]; kind: "limit"; limit: number }
  | { kind: "message"; message: string };

/** «dg 20:00» from `weekOpensAt {dayOfWeek, time}` (S09 §10 «reinici {weekOpensAt}»). */
const WEEKDAY_REFERENCE: Readonly<Record<string, string>> = {
  FRIDAY: "2024-01-05",
  MONDAY: "2024-01-01",
  SATURDAY: "2024-01-06",
  SUNDAY: "2024-01-07",
  THURSDAY: "2024-01-04",
  TUESDAY: "2024-01-02",
  WEDNESDAY: "2024-01-03",
};

function slotGridLabels(t: Translate, grid: string): SlotGridLabels {
  return {
    cell: (time, state) => t("training:grid.cell", { state, time }),
    classLabel: (time) => t("training:grid.classLabel", { time }),
    free: t("training:grid.free"),
    grid,
    own: (time) => t("training:grid.own", { time }),
    reason: (reason) => t(`enums:slotReason.${reason}`),
    taken: t("training:grid.taken"),
    time: t("training:grid.time"),
  };
}

function RingDot({ color }: { color: string }) {
  return (
    <span
      aria-hidden="true"
      className="training-ring-dot"
      style={{ "--ah-ring-color": color } as CSSProperties}
    />
  );
}

function TrainingBar() {
  const { t } = useTranslation("training");
  return <AppBar className="booking-screen__bar" title={<h1>{t("training:title")}</h1>} />;
}

/**
 * Screen 08 «Entrenaments» (`/entrenaments`, S09 §2; the spec writes `/training`): the dogs with
 * the right (R-09-01, the default one selected), the api's days of the window (R-09-04), «Qualsevol»
 * and the rings open to training, the grid split at 14:00 club-local, the counter of the selected
 * day's training week (R-09-05) and [CONFIRMA …]. Every state comes from `GET /training-slots` and
 * `GET /me/training-summary`: the front never computes a slot, a window, a week or an eligibility.
 */
export function TrainingPage({ client }: { client: ApiClient }) {
  const { t } = useTranslation(["training", "home", "booking", "enums", "errors"]);
  const formats = useClubFormats();
  const branding = useBranding();
  const online = useOnline();
  const today = clubToday(branding.timeZone);
  // The shell's tab reads the same query (R-09-01): a change of rights shows in both at once.
  const eligibility = useTrainingEligibility(client);
  const [dogId, setDogId] = useState<string | null>(null);
  const dogs = eligibility.data?.eligibleDogs ?? [];
  const selectedDog =
    dogId !== null && dogs.some((dog) => dog.id === dogId)
      ? dogId
      : (eligibility.data?.defaultDogId ?? dogs[0]?.id ?? null);
  const slots = useTrainingSlots(client, selectedDog, today);
  const [day, setDay] = useState<string | null>(null);
  const days = slots.data?.days ?? [];
  const selectedDay =
    day !== null && days.some((item) => item.date === day) ? day : (days[0]?.date ?? null);
  const counter = useTrainingSummary(
    client,
    selectedDog,
    selectedDay,
    selectedDog !== null && selectedDay !== null,
  );
  const [ringFilter, setRingFilter] = useState(ANY_COLUMN);
  const [picked, setChoice] = useState<Choice>();
  /** «Qualsevol» with more than one free ring, or the free rings of a `SLOT_TAKEN`. */
  const [chooser, setChooser] = useState<{ ringIds: string[]; startsAt: string }>();
  // R-09-03: the choice holds only while the grid shown (read again on focus, after a refusal or a
  // retry) still has that ring free at that time; otherwise it is cleared (during this render, so
  // it never comes back with a later grid) and [Confirma] is disabled.
  const choice =
    picked !== undefined && slotStillFree(slots.data, selectedDay, picked) ? picked : undefined;
  if (picked !== undefined && choice === undefined) {
    setChoice(undefined);
    setChooser(undefined);
  }
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<Failure>();
  const [booked, setBooked] = useState(false);
  /** One `Idempotency-Key` per payload, kept only while its outcome is unknown (a lost answer). */
  const keys = useRef(new Map<string, string>());

  const refetchAll = useCallback(() => {
    eligibility.refetch();
    slots.refetch();
    counter.refetch();
  }, [counter, eligibility, slots]);
  useWindowFocus(refetchAll);

  const noRight = eligibility.status === "ready" && eligibility.data.eligibleDogs.length === 0;
  const moduleDisabled = [eligibility.error, slots.error, counter.error].some(
    (error) => codeOf(error) === "MODULE_DISABLED",
  );
  // R-09-01 / §9: without a dog with the right (or the module) there is no 08: back to 03.
  useEffect(() => {
    if (noRight || moduleDisabled) navigateInApp("/inici", null, true);
  }, [moduleDisabled, noRight]);

  const clear = () => {
    setChoice(undefined);
    setChooser(undefined);
    setFailure(undefined);
  };

  if (
    eligibility.status === "loading" ||
    (eligibility.status === "ready" && slots.status === "loading")
  ) {
    return (
      <section className="booking-screen training-screen">
        <TrainingBar />
        {/* S09 §2 «carregant»: the chips and the grid, one status for the screen. */}
        <div aria-hidden="true" className="training-skeleton">
          <Skeleton height="1.75rem" label="" width="60%" />
          <Skeleton height="1.75rem" label="" width="90%" />
        </div>
        <Skeleton height="16rem" label={t("training:loading")} />
      </section>
    );
  }
  const readError = eligibility.status === "error" ? eligibility.error : slots.error;
  if (eligibility.status === "error" || slots.status === "error") {
    return (
      <section className="booking-screen training-screen">
        <TrainingBar />
        {moduleDisabled ? null : (
          <Card className="booking-error" role="alert">
            <p>{t("training:error")}</p>
            {codeOf(readError) === "NETWORK" || codeOf(readError) === "INTERNAL_ERROR" ? null : (
              <p>{errorText(t, readError)}</p>
            )}
            <Button onClick={refetchAll} variant="secondary">
              {t("training:retry")}
            </Button>
          </Card>
        )}
      </section>
    );
  }
  if (noRight || slots.data === undefined) return null;

  const grid = slots.data;
  const rings = grid.rings;
  const ringById = (id: string) => rings.find((ring) => ring.id === id);
  const current = days.find((item) => item.date === selectedDay);
  const filter =
    ringFilter === ANY_COLUMN || ringById(ringFilter) !== undefined ? ringFilter : ANY_COLUMN;
  // S09 §2 «sense connexió»: a required read (the dogs, the grid, the counter) shows its offline
  // copy, or the navigator is offline. The api may be unreachable while `navigator.onLine` is
  // true, so the copy itself blocks the booking until a read succeeds again.
  const reads = [eligibility, slots, counter] as const;
  const stale = reads.some((read) => read.stale) || !online;
  const refreshing = reads.some((read) => read.status === "ready" && read.refreshing === true);
  const summary = counter.status === "ready" ? counter.data : undefined;
  const atLimit = summary !== undefined && summary.counter.remaining <= 0;

  const dayLabel = (date: string) => formats.formatActivityDate(date, null, null, "list", date);
  const slotOf = (startsAt: string): TrainingSlot | undefined =>
    current?.slots.find((slot) => slot.startsAt === startsAt);

  const press = (startsAt: string) => {
    const slot = slotOf(startsAt);
    if (slot === undefined) return;
    setFailure(undefined);
    setBooked(false);
    if (filter !== ANY_COLUMN) {
      setChooser(undefined);
      setChoice({ ringId: filter, startsAt });
      return;
    }
    // R-09-07: with more than one free ring the member picks one (the first preselected).
    const free = freeRingsOf(slot, rings);
    const first = free[0];
    if (first === undefined) return;
    setChoice({ ringId: first.id, startsAt });
    setChooser(free.length > 1 ? { ringIds: free.map((ring) => ring.id), startsAt } : undefined);
  };

  const rows = (band: Band): SlotGridRow[] =>
    (current?.slots ?? [])
      .filter((slot) => bandOf(slot.startsAtLocal) === band)
      .map((slot) => ({
        cells: [filter === ANY_COLUMN ? anyCell(slot, rings) : ringCell(slot, filter)],
        time: slot.startsAtLocal,
      }));
  const selectedCell =
    choice === undefined
      ? []
      : filter === ANY_COLUMN
        ? [`${ANY_COLUMN}_${choice.startsAt}`]
        : choice.ringId === filter
          ? [`${filter}_${choice.startsAt}`]
          : [];

  const cancellableLinks = (items: readonly CancellableTraining[]) =>
    items.length === 0 ? null : (
      <ul className="training-limit__links">
        {items.map((item) => (
          <li key={item.id}>
            <a
              href={`/entrenaments/${encodeURIComponent(item.id)}`}
              onClick={(event: MouseEvent<HTMLAnchorElement>) => {
                event.preventDefault();
                navigateInApp(`/entrenaments/${encodeURIComponent(item.id)}`);
              }}
            >
              {t("training:limit.booking", {
                day: formats.formatActivityDate(item.startsAt, null, null, "list"),
                ring: item.ringName,
                time: shortTime(formats.formatTime(item.startsAt)),
              })}
            </a>
          </li>
        ))}
      </ul>
    );

  const limitMessage = (limit: number, cancellable: readonly CancellableTraining[]) => (
    <div className="booking-note booking-note--warning training-limit" role="status">
      <p>
        {cancellable.length > 0
          ? t("training:limit.withCancellable", { limit })
          : t("training:limit.none", { limit })}
      </p>
      {cancellableLinks(cancellable)}
    </div>
  );

  const confirm = async () => {
    if (choice === undefined || selectedDog === null) return;
    const body = { dogId: selectedDog, ringId: choice.ringId, startsAt: choice.startsAt };
    const fingerprint = JSON.stringify(body);
    const key = keys.current.get(fingerprint) ?? crypto.randomUUID();
    keys.current.set(fingerprint, key);
    setPending(true);
    setFailure(undefined);
    setBooked(false);
    try {
      await client.POST("/training-bookings", {
        body,
        params: { header: { "Idempotency-Key": key } },
      });
      keys.current.delete(fingerprint);
      setChoice(undefined);
      setChooser(undefined);
      setBooked(true);
      refetchAll();
    } catch (cause) {
      const code = codeOf(cause);
      // A lost answer keeps its key, so a retry replays it instead of booking twice.
      if (code !== "NETWORK") keys.current.delete(fingerprint);
      reportTrainingRefusal(cause);
      const details = detailsOf(cause);
      if (code === "MODULE_DISABLED") {
        navigateInApp("/inici", null, true);
        return;
      }
      if (code === "TRAINING_LIMIT_REACHED") {
        setFailure({
          cancellable: Array.isArray(details.cancellableBookings)
            ? (details.cancellableBookings as CancellableTraining[])
            : [],
          kind: "limit",
          limit: typeof details.limit === "number" ? details.limit : (summary?.counter.limit ?? 0),
        });
      } else {
        setFailure({ kind: "message", message: errorText(t, cause) });
      }
      if (code === "SLOT_TAKEN") {
        // R-09-06: the rings still free at that time, when the api names them.
        const free = Array.isArray(details.freeRings)
          ? (details.freeRings as unknown[]).filter(
              (id): id is string => typeof id === "string" && ringById(id) !== undefined,
            )
          : [];
        const first = free[0];
        if (first === undefined) {
          setChoice(undefined);
          setChooser(undefined);
        } else {
          setChoice({ ringId: first, startsAt: choice.startsAt });
          setChooser({ ringIds: free, startsAt: choice.startsAt });
        }
      } else if (code !== "NETWORK") {
        setChoice(undefined);
        setChooser(undefined);
      }
      if (code !== "NETWORK") refetchAll();
    } finally {
      setPending(false);
    }
  };

  const chosenSlot = choice === undefined ? undefined : slotOf(choice.startsAt);
  const chosenRing = choice === undefined ? undefined : ringById(choice.ringId);
  const weekOpensAt =
    summary === undefined
      ? undefined
      : t("training:counter.weekOpensAt", {
          time: shortTime(summary.weekOpensAt.time),
          weekday: formats
            .formatPlainDate(
              WEEKDAY_REFERENCE[summary.weekOpensAt.dayOfWeek] ?? "2024-01-07",
              "weekdayShort",
            )
            .replaceAll(/[.,]/gu, ""),
        });

  return (
    <section className="booking-screen training-screen">
      <TrainingBar />
      {booked ? (
        <Toast
          dismissLabel={t("booking:confirm.close")}
          onDismiss={() => {
            setBooked(false);
          }}
          tone="success"
        >
          {t("training:confirm.done")}
        </Toast>
      ) : null}
      <DogChips
        disabled={pending}
        dogs={dogs.map((dog) => ({
          id: dog.id,
          levelName: dog.levelName ?? null,
          name: dog.name,
          own: dog.ownerName === null || dog.ownerName === undefined,
          ownerFirstName: dog.ownerName ?? null,
        }))}
        onSelect={(id) => {
          if (id === null) return;
          setDogId(id);
          clear();
        }}
        selected={selectedDog}
        withAll={false}
      />
      <div aria-label={t("training:days.label")} className="training-chips" role="group">
        {days.map((item) => {
          const label = dayLabel(item.date);
          const pressed = item.date === selectedDay;
          return (
            <button
              aria-pressed={pressed}
              className={`ah-chip training-chip${pressed ? " training-chip--selected" : ""}`}
              disabled={pending}
              key={item.date}
              onClick={() => {
                setDay(item.date);
                clear();
              }}
              type="button"
            >
              {item.date === today ? t("training:days.today", { day: label }) : label}
            </button>
          );
        })}
      </div>
      <div aria-label={t("training:rings.label")} className="training-chips" role="group">
        <button
          aria-pressed={filter === ANY_COLUMN}
          className={`ah-chip training-chip${filter === ANY_COLUMN ? " training-chip--selected" : ""}`}
          disabled={pending}
          onClick={() => {
            setRingFilter(ANY_COLUMN);
            clear();
          }}
          type="button"
        >
          {t("training:rings.any")}
        </button>
        {rings.map((ring: TrainingRing) => {
          const pressed = ring.id === filter;
          // R-09-15: the course built on the ring. S16's viewer is still a placeholder, so the
          // indicator is shown (and described) and the tap selects the ring only.
          const setup = ring.setup !== null && ring.setup !== undefined;
          return (
            <button
              aria-describedby={setup ? `training-setup-${ring.id}` : undefined}
              aria-pressed={pressed}
              className={`ah-chip training-chip${pressed ? " training-chip--selected" : ""}`}
              disabled={pending}
              key={ring.id}
              onClick={() => {
                setRingFilter(ring.id);
                clear();
              }}
              type="button"
            >
              <RingDot color={ring.color} />
              {ring.name}
              {setup ? (
                <Icon aria-hidden="true" className="training-chip__setup" name="flag" />
              ) : null}
            </button>
          );
        })}
        {rings
          .filter((ring) => ring.setup !== null && ring.setup !== undefined)
          .map((ring) => (
            <span hidden id={`training-setup-${ring.id}`} key={ring.id}>
              {t("training:rings.setup", { ring: ring.name })}
            </span>
          ))}
      </div>
      {stale ? (
        <div className="booking-note booking-note--neutral training-stale">
          <p role="status">{t("training:grid.stale")}</p>
          <Button
            className="training-stale__retry"
            loading={refreshing}
            loadingLabel={t("training:loading")}
            onClick={refetchAll}
            variant="secondary"
          >
            {t("training:retry")}
          </Button>
        </div>
      ) : null}
      {current === undefined || current.closed ? (
        <Card className="training-closed">
          <p>{t("training:day.closed")}</p>
        </Card>
      ) : (
        (["morning", "afternoon"] as const).map((band) => {
          const bandRows = rows(band);
          if (bandRows.length === 0) return null;
          const title =
            band === "morning" ? t("training:grid.morning") : t("training:grid.afternoon");
          return (
            <div className="booking-section" key={band}>
              <h2 className="booking-section__title">{title}</h2>
              {/* Inert while the booking is sent: the answer belongs to the slot shown. */}
              <fieldset className="training-fieldset" disabled={pending}>
                <SlotGrid
                  columns={[{ id: filter, label: title }]}
                  labels={slotGridLabels(t, title)}
                  mode="single"
                  onCellPress={(cell) => {
                    // The cell id is `{column}_{startsAt}` (the api's `slotId` for a ring).
                    press(cell.id.slice(cell.columnId.length + 1));
                  }}
                  rows={bandRows}
                  selection={{ cellIds: selectedCell }}
                />
              </fieldset>
            </div>
          );
        })
      )}
      {chooser === undefined || chosenSlot === undefined ? null : (
        <div className="training-chooser">
          <p>{t("training:anyRing.choose", { time: shortTime(chosenSlot.startsAtLocal) })}</p>
          <div aria-label={t("training:rings.label")} className="training-chips" role="group">
            {chooser.ringIds.map((id) => {
              const ring = ringById(id);
              // Only the rings still free in the grid shown are offered (R-09-03).
              const free = slotStillFree(grid, selectedDay, {
                ringId: id,
                startsAt: chooser.startsAt,
              });
              if (ring === undefined || !free) return null;
              const pressed = choice?.ringId === id;
              return (
                <button
                  aria-pressed={pressed}
                  className={`ah-chip training-chip${pressed ? " training-chip--selected" : ""}`}
                  disabled={pending}
                  key={id}
                  onClick={() => {
                    setChoice({ ringId: id, startsAt: chooser.startsAt });
                  }}
                  type="button"
                >
                  <RingDot color={ring.color} />
                  {ring.name}
                </button>
              );
            })}
          </div>
        </div>
      )}
      {counter.status === "error" ? (
        // The selected day's counter failed: its own error and retry, and no [Confirma] until
        // the summary is there (the limit is the api's, never guessed).
        <Card className="booking-error training-counter" role="alert">
          <p>{t("training:error")}</p>
          <Button onClick={counter.refetch} variant="secondary">
            {t("training:retry")}
          </Button>
        </Card>
      ) : summary === undefined ? (
        <Skeleton height="3.5rem" label={t("training:loading")} />
      ) : (
        <Card className="training-counter">
          <p className="training-counter__line">
            <strong>
              {t("training:counter.title", {
                limit: summary.counter.limit,
                used: summary.counter.used,
              })}
            </strong>
            <span className="training-counter__reset">
              {t("training:counter.reset", { weekOpensAt })}
            </span>
          </p>
          <progress
            aria-label={t("training:counter.title", {
              limit: summary.counter.limit,
              used: summary.counter.used,
            })}
            className="training-counter__bar"
            max={Math.max(summary.counter.limit, 1)}
            value={Math.min(summary.counter.used, summary.counter.limit)}
          />
        </Card>
      )}
      {failure?.kind === "message" ? (
        <p className="booking-note booking-note--danger" role="alert">
          {failure.message}
        </p>
      ) : null}
      {failure?.kind === "limit" ? (
        limitMessage(failure.limit, failure.cancellable)
      ) : atLimit ? (
        limitMessage(summary.counter.limit, summary.cancellableBookings)
      ) : (
        <Button
          className="training-confirm"
          disabled={
            choice === undefined ||
            chosenSlot === undefined ||
            chosenRing === undefined ||
            summary === undefined ||
            stale
          }
          loading={pending}
          loadingLabel={t("training:confirm.sending")}
          onClick={() => void confirm()}
        >
          {chosenSlot === undefined || chosenRing === undefined || current === undefined
            ? t("training:confirm.idle")
            : t("training:confirm.button", {
                day: formats.formatActivityDate(current.date, null, null, "day", current.date),
                from: shortTime(chosenSlot.startsAtLocal),
                ring: chosenRing.name,
                to: shortTime(chosenSlot.endsAtLocal),
              })}
        </Button>
      )}
    </section>
  );
}
