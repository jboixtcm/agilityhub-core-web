import { isApiError, type ApiClient, type components } from "@agilityhub/api-client";
import { useClubFormats } from "@agilityhub/i18n";
import {
  Badge,
  Button,
  Card,
  Chip,
  DataTable,
  Drawer,
  EmptyState,
  FormField,
  Icon,
  Input,
  Modal,
  RadioGroup,
  ScheduleCell,
  ScheduleGrid,
  Select,
  Skeleton,
  Toast,
  type Tone,
  useBranding,
} from "@agilityhub/ui";
import {
  type FocusEvent,
  type KeyboardEvent,
  type SyntheticEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";

import "./planning.css";
import { loadOpeningHours, type OpeningHours } from "./calendar-shared";
import {
  CLASS_CARD_ID,
  ClassForm,
  type ClassFormMode,
  type ClassFormPatch,
  type ClassFormValues,
} from "./ClassForm";
import {
  bandLabel,
  clubToday,
  type DayOfWeek,
  DroppedChangeError,
  errorCode,
  errorProp,
  fieldOfValidationError,
  instructorNames,
  loadPlanningCatalogs,
  mondayOf,
  type PlanningCatalogs,
  readTemplateChoice,
  sortedBands,
  type TemplateClass,
  type TemplateKind,
  type TimeBand,
  useResource,
  type WeekTemplate,
  type WeekTemplateSummary,
  weekdayLabel,
  writeTemplateChoice,
} from "./shared";

type Coverage = components["schemas"]["Coverage"];
type CoverageLevel = Coverage["levels"][number];
type WeekListItem = components["schemas"]["WeekListItem"];
type GenerationCandidate = components["schemas"]["GenerationCandidate"];

interface Feedback {
  message: string;
  tone: Tone;
}

interface TemplateLists {
  SATURDAY: WeekTemplateSummary[];
  WEEKDAYS: WeekTemplateSummary[];
}

interface PlanningSettings {
  levelsEnabled: boolean;
  maxInstructors: number;
  slotMinutes: number;
}

const defaultSettings: PlanningSettings = {
  levelsEnabled: true,
  maxInstructors: 1,
  slotMinutes: 10,
};

const coverageTones: Readonly<Record<CoverageLevel["status"], Tone>> = {
  EXPAND: "danger",
  NO_DOGS: "neutral",
  OK: "success",
  SHORT: "danger",
  TIGHT: "warning",
};

function useErrorMessage() {
  const { t } = useTranslation(["admin-scheduling", "errors"]);
  return useCallback(
    (error: unknown) =>
      isApiError(error)
        ? t(`errors:${error.code}`, { defaultValue: t("admin-scheduling:common.error") })
        : t("admin-scheduling:common.error"),
    [t],
  );
}

async function numericParameter(client: ApiClient, key: string, fallback: number): Promise<number> {
  try {
    const result = await client.GET("/parameters/{key}", { params: { path: { key } } });
    return typeof result.data?.value === "number" ? result.data.value : fallback;
  } catch {
    return fallback;
  }
}

async function loadSettings(client: ApiClient): Promise<PlanningSettings> {
  const [levelsEnabled, maxInstructors, slotMinutes] = await Promise.all([
    client
      .GET("/parameters/{key}", { params: { path: { key: "levels.enabled" } } })
      .then((result) => result.data?.value !== false)
      .catch(() => true),
    numericParameter(client, "classes.maxInstructorsPerClass", 1),
    numericParameter(client, "classes.slotMinutes", 10),
  ]);
  return { levelsEnabled, maxInstructors, slotMinutes };
}

function TemplateTab({
  active,
  items,
  label,
  onSelect,
  selectedId,
}: {
  active: boolean;
  items: readonly WeekTemplateSummary[];
  label: string;
  onSelect: (id: string) => void;
  selectedId: string | undefined;
}) {
  const [open, setOpen] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const closeOnFocusOut = (event: FocusEvent<HTMLButtonElement>) => {
    if (
      !(event.relatedTarget instanceof Node) ||
      container.current?.contains(event.relatedTarget) !== true
    ) {
      setOpen(false);
    }
  };
  const closeOnEscape = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "Escape") setOpen(false);
  };
  return (
    <div className="planning-tab" ref={container}>
      <button
        aria-expanded={open}
        aria-haspopup="menu"
        className={
          active ? "planning-tab__toggle planning-tab__toggle--active" : "planning-tab__toggle"
        }
        disabled={items.length === 0}
        onBlur={closeOnFocusOut}
        onClick={() => {
          setOpen((value) => !value);
        }}
        onKeyDown={closeOnEscape}
        type="button"
      >
        {label}
      </button>
      {open ? (
        <ul className="planning-tab__menu" role="menu">
          {items.map((item) => (
            <li key={item.id} role="none">
              <button
                aria-checked={item.id === selectedId}
                onBlur={closeOnFocusOut}
                onClick={() => {
                  setOpen(false);
                  onSelect(item.id);
                }}
                onKeyDown={closeOnEscape}
                role="menuitemradio"
                type="button"
              >
                {item.name}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/** [＋ Nova] / [Duplica]; mounted only while open, so every opening starts from its source. */
function TemplateModal({
  onClose,
  onSave,
  source,
}: {
  onClose: () => void;
  onSave: (name: string, kind: TemplateKind, copyFromId?: string) => Promise<void>;
  source?: WeekTemplate | undefined;
}) {
  const { t } = useTranslation(["admin-scheduling", "enums", "errors"]);
  const errorMessage = useErrorMessage();
  const [name, setName] = useState(() =>
    source === undefined
      ? ""
      : t("admin-scheduling:templates.form.copyName", { name: source.name }),
  );
  const [kind, setKind] = useState<TemplateKind>(source?.kind ?? "WEEKDAYS");
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);

  const submit = async (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPending(true);
    setError(undefined);
    try {
      await onSave(name.trim(), kind, source?.id);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setPending(false);
    }
  };

  return (
    <Modal
      closeLabel={t("admin-scheduling:common.close")}
      onClose={onClose}
      open
      title={
        source === undefined
          ? t("admin-scheduling:templates.form.newTitle")
          : t("admin-scheduling:templates.form.duplicateTitle")
      }
    >
      <form className="planning-form" onSubmit={(event) => void submit(event)}>
        <FormField
          {...errorProp(error)}
          id="planning-template-name"
          label={t("admin-scheduling:templates.form.name")}
        >
          <Input
            id="planning-template-name"
            maxLength={40}
            onChange={(event) => {
              setName(event.currentTarget.value);
            }}
            required
            value={name}
          />
        </FormField>
        <fieldset className="planning-form__fieldset" disabled={source !== undefined}>
          <legend>{t("admin-scheduling:templates.form.kind")}</legend>
          <RadioGroup
            label={t("admin-scheduling:templates.form.kind")}
            onValueChange={(value) => {
              setKind(value === "SATURDAY" ? "SATURDAY" : "WEEKDAYS");
            }}
            options={[
              { label: t("enums:templateKind.WEEKDAYS"), value: "WEEKDAYS" },
              { label: t("enums:templateKind.SATURDAY"), value: "SATURDAY" },
            ]}
            value={kind}
          />
        </fieldset>
        <div className="planning-form__actions">
          <Button onClick={onClose} variant="ghost">
            {t("admin-scheduling:common.cancel")}
          </Button>
          <Button
            loading={pending}
            loadingLabel={t("admin-scheduling:common.saving")}
            type="submit"
          >
            {t("admin-scheduling:common.save")}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

type BandField = "end" | "general" | "start";

function minutesOf(time: string): number {
  const [hours, mins] = time.split(":").map(Number);
  return (hours ?? 0) * 60 + (mins ?? 0);
}

interface TemplateOpening {
  /** Days of the kind absent from `club.openingHours` (closed, R-02-09). */
  closedDays: DayOfWeek[];
  /** The window shared by every day; `undefined` while the opening hours are not known. */
  window: { close: string; open: string } | undefined;
}

/**
 * Opening window shared by every day of the template (`club.openingHours`, R-06-01). The api
 * refuses a band unless every day of the kind is open and contains it (`WeekTemplateRules`): one
 * closed day leaves the template without bands.
 */
function templateOpening(
  hours: OpeningHours | undefined,
  days: readonly DayOfWeek[],
): TemplateOpening {
  if (hours === undefined) return { closedDays: [], window: undefined };
  const closedDays = days.filter((day) => hours[day] === undefined);
  const windows = days.flatMap((day) => {
    const window = hours[day];
    return window === undefined ? [] : [window];
  });
  const latestOpen = windows
    .map((window) => window.open)
    .sort()
    .at(-1);
  const earliestClose = windows.map((window) => window.close).sort()[0];
  return {
    closedDays,
    window:
      closedDays.length > 0 || latestOpen === undefined || earliestClose === undefined
        ? undefined
        : { close: earliestClose, open: latestOpen },
  };
}

/**
 * The band field an API error belongs to: the codes carry no field, so it is derived from the
 * values that were sent (e.g. `INVALID_SLOT_GRANULARITY` on «Fi» when only the end is off-slot).
 */
function bandErrorField(
  cause: unknown,
  values: { endTime: string; startTime: string },
  context: {
    /** The band being edited; `undefined` for a new one. */
    band: TimeBand | undefined;
    bands: readonly TimeBand[];
    opening: { close: string; open: string } | undefined;
    slotMinutes: number;
  },
): BandField {
  const code = errorCode(cause);
  const start = minutesOf(values.startTime);
  switch (code) {
    case "INVALID_TIME_RANGE":
      return "end";
    case "INVALID_SLOT_GRANULARITY":
      return start % context.slotMinutes === 0 ? "end" : "start";
    case "OUTSIDE_OPENING_HOURS": {
      if (context.opening !== undefined) {
        return start < minutesOf(context.opening.open) ? "start" : "end";
      }
      // Hours not read: never assume any. Only the time the admin moved can be blamed; a new band,
      // or both times moved, gets the message without a field.
      const startMoved = context.band !== undefined && context.band.startTime !== values.startTime;
      const endMoved = context.band !== undefined && context.band.endTime !== values.endTime;
      if (startMoved === endMoved) return "general";
      return startMoved ? "start" : "end";
    }
    case "BAND_OVERLAP":
      return context.bands.some(
        (band) => minutesOf(band.startTime) <= start && start < minutesOf(band.endTime),
      )
        ? "start"
        : "end";
    case "VALIDATION_ERROR":
      return fieldOfValidationError(cause) === "endTime" ? "end" : "start";
    default:
      return "general";
  }
}

/**
 * [＋ Franja] / click on a row label; mounted only while open. A template whose kind has a closed
 * day takes no band (R-06-01): the drawer names the closed days and [Desa] stays disabled.
 */
function BandDrawer({
  band,
  bands,
  onClose,
  onRemove,
  onSave,
  opening,
  slotMinutes,
}: {
  band?: TimeBand | undefined;
  /** The other bands of the template (the edited one excluded). */
  bands: readonly TimeBand[];
  onClose: () => void;
  onRemove: (band: TimeBand) => Promise<void>;
  onSave: (startTime: string, endTime: string) => Promise<void>;
  opening: TemplateOpening;
  slotMinutes: number;
}) {
  const { t } = useTranslation(["admin-scheduling", "errors"]);
  const { formatList, formatPlainDate } = useClubFormats();
  const errorMessage = useErrorMessage();
  const [startTime, setStartTime] = useState(band?.startTime ?? "");
  const [endTime, setEndTime] = useState(band?.endTime ?? "");
  const [error, setError] = useState<{ field: BandField; message: string }>();
  const [pending, setPending] = useState(false);
  const closed = opening.closedDays.length > 0;

  const fail = (cause: unknown) => {
    setError({
      field: bandErrorField(
        cause,
        { endTime, startTime },
        { band, bands, opening: opening.window, slotMinutes },
      ),
      message: errorMessage(cause),
    });
  };

  const submit = async (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (closed) return;
    setPending(true);
    setError(undefined);
    try {
      await onSave(startTime, endTime);
    } catch (cause) {
      fail(cause);
    } finally {
      setPending(false);
    }
  };

  const remove = async () => {
    if (band === undefined) return;
    setPending(true);
    try {
      await onRemove(band);
    } catch (cause) {
      fail(cause);
    } finally {
      setPending(false);
    }
  };

  return (
    <Drawer
      closeLabel={t("admin-scheduling:common.close")}
      onClose={onClose}
      open
      title={
        band === undefined
          ? t("admin-scheduling:templates.bandForm.newTitle")
          : t("admin-scheduling:templates.bandForm.editTitle", {
              range: t("admin-scheduling:templates.bandRange", {
                end: band.endTime,
                start: band.startTime,
              }),
            })
      }
    >
      <form className="planning-form" onSubmit={(event) => void submit(event)}>
        {closed ? (
          <p className="planning-note planning-note--warning" role="note">
            {t("admin-scheduling:templates.bandForm.closedDays", {
              days: formatList(
                opening.closedDays.map((day) => weekdayLabel(day, formatPlainDate, "weekdayLong")),
              ),
            })}
          </p>
        ) : null}
        <FormField
          {...errorProp(error?.field === "start" ? error.message : undefined)}
          id="planning-band-start"
          label={t("admin-scheduling:templates.bandForm.start")}
        >
          <Input
            id="planning-band-start"
            onChange={(event) => {
              setStartTime(event.currentTarget.value);
            }}
            required
            step={slotMinutes * 60}
            type="time"
            value={startTime}
          />
        </FormField>
        <FormField
          {...errorProp(error?.field === "end" ? error.message : undefined)}
          id="planning-band-end"
          label={t("admin-scheduling:templates.bandForm.end")}
        >
          <Input
            id="planning-band-end"
            onChange={(event) => {
              setEndTime(event.currentTarget.value);
            }}
            required
            step={slotMinutes * 60}
            type="time"
            value={endTime}
          />
        </FormField>
        {error?.field === "general" ? (
          <p className="ah-form-field__error" role="alert">
            {error.message}
          </p>
        ) : null}
        <div className="planning-form__actions">
          {band === undefined ? null : (
            <Button disabled={pending} onClick={() => void remove()} variant="danger">
              {t("admin-scheduling:templates.bandForm.remove")}
            </Button>
          )}
          <Button
            disabled={closed}
            loading={pending}
            loadingLabel={t("admin-scheduling:common.saving")}
            type="submit"
          >
            {t("admin-scheduling:common.save")}
          </Button>
        </div>
      </form>
    </Drawer>
  );
}

function GridSkeleton() {
  const { t } = useTranslation("admin-scheduling");
  return (
    <Card className="planning-grid-card">
      <div className="planning-skeleton">
        {[0, 1, 2, 3, 4, 5].map((row) => (
          <Skeleton height="2.6rem" key={row} label={t("admin-scheduling:common.loading")} />
        ))}
      </div>
    </Card>
  );
}

function WeekGrid({
  catalogs,
  onBand,
  onCell,
  onDay,
  onEmpty,
  readOnly,
  selectedClassId,
  template,
}: {
  catalogs: PlanningCatalogs;
  onBand: (band: TimeBand) => void;
  onCell: (item: TemplateClass) => void;
  onDay: (day: TemplateClass["dayOfWeek"]) => void;
  onEmpty: (band: TimeBand, day: TemplateClass["dayOfWeek"]) => void;
  readOnly: boolean;
  selectedClassId: string | undefined;
  template: WeekTemplate;
}) {
  const { t } = useTranslation(["admin-scheduling", "enums"]);
  const { formatPlainDate } = useClubFormats();
  const bands = sortedBands(template.bands);
  const ringsById = new Map(catalogs.rings.map((ring) => [ring.id, ring]));
  const inconsistencyTypes = new Map(template.inconsistencies.map((item) => [item.id, item.type]));

  return (
    <Card className="planning-grid-card">
      <ScheduleGrid<{ columnId: string; id: string; item: TemplateClass }>
        columns={template.days.map((day) => ({
          id: day,
          label: weekdayLabel(day, formatPlainDate, "weekdayLong"),
          onSelect: () => {
            onDay(day);
          },
        }))}
        footer={
          <div className="planning-grid__footer">
            <p className="planning-grid__hint">
              <Icon aria-hidden="true" name="chev" />
              {t("admin-scheduling:templates.gridFooter")}
            </p>
            {template.inconsistencies.map((inconsistency) => (
              <p
                className="planning-note planning-note--warning"
                key={inconsistency.id}
                role="note"
              >
                <Icon aria-hidden="true" name="warn" />
                {t("admin-scheduling:templates.inconsistencyNote", {
                  message: inconsistency.message,
                })}
              </p>
            ))}
          </div>
        }
        label={t("admin-scheduling:templates.gridLabel", { name: template.name })}
        renderCell={({ item }, selected) => {
          const ring =
            item.ringId === null || item.ringId === undefined
              ? undefined
              : ringsById.get(item.ringId);
          const instructors = instructorNames(item, catalogs.instructors);
          const warnings = item.inconsistencyIds
            .map((id) => inconsistencyTypes.get(id))
            .filter((type) => type !== undefined)
            .map((type) => t(`enums:inconsistencyType.${type}`));
          const label = t("admin-scheduling:templates.cellLabel", {
            description: item.displayDescription,
            hasWarnings: warnings.length > 0 ? "yes" : "no",
            instructors,
            ring: ring?.name ?? t("admin-scheduling:classCard.noRing"),
            warnings: warnings.join(" · "),
          });
          return (
            <ScheduleCell
              color={ring?.color ?? null}
              label={label}
              onClick={
                readOnly
                  ? undefined
                  : () => {
                      onCell(item);
                    }
              }
              selected={selected}
              subtitle={instructors}
              title={item.displayDescription}
              warning={item.inconsistencyIds.length > 0}
            />
          );
        }}
        renderEmpty={
          readOnly
            ? undefined
            : (row, column) => {
                const band = bands.find((candidate) => candidate.id === row.id);
                const day = template.days.find((candidate) => candidate === column.id);
                if (band === undefined || day === undefined) return null;
                return (
                  <button
                    aria-label={t("admin-scheduling:templates.emptyCell", {
                      day: weekdayLabel(day, formatPlainDate, "weekdayLong"),
                      time: bandLabel(band.startTime),
                    })}
                    className="ah-schedule-cell ah-schedule-cell--empty"
                    onClick={() => {
                      onEmpty(band, day);
                    }}
                    type="button"
                  />
                );
              }
        }
        rows={bands.map((band) => ({
          cells: template.classes
            .filter((item) => item.bandId === band.id)
            .map((item) => ({ columnId: item.dayOfWeek, id: item.id, item })),
          id: band.id,
          label: bandLabel(band.startTime),
          ...(readOnly
            ? {}
            : {
                onSelect: () => {
                  onBand(band);
                },
                selectLabel: t("admin-scheduling:templates.bandLabel", {
                  range: t("admin-scheduling:templates.bandRange", {
                    end: band.endTime,
                    start: band.startTime,
                  }),
                }),
              }),
        }))}
        selectedCellId={selectedClassId}
      />
    </Card>
  );
}

function GenerationCard({
  blockedCount,
  candidates,
  onGenerate,
  readOnly,
  weeks,
  weekdayTemplateId,
}: {
  blockedCount: number;
  candidates: readonly GenerationCandidate[];
  onGenerate: (candidate: GenerationCandidate, idempotencyKey: string) => Promise<void>;
  readOnly: boolean;
  weekdayTemplateId: string | undefined;
  weeks: readonly WeekListItem[] | undefined;
}) {
  const { t } = useTranslation(["admin-scheduling", "enums"]);
  const { formatDate, formatPlainDate, formatTime, formatWeekRange } = useClubFormats();
  const proposed = candidates.find((candidate) => candidate.proposed) ?? candidates[0];
  const [chosen, setChosen] = useState<string>();
  const selected = candidates.some((candidate) => candidate.startDate === chosen)
    ? chosen
    : proposed?.startDate;
  // One key per confirmation: a double click or a retry of the same confirmation is harmless (R-06-07).
  const [confirming, setConfirming] = useState<string>();
  const [pending, setPending] = useState(false);

  const candidate = candidates.find((item) => item.startDate === selected);
  const stamp = (instant: string | null | undefined) =>
    instant === null || instant === undefined
      ? undefined
      : t("admin-scheduling:weeks.dateTime", {
          date: formatDate(instant, "dayMonthNumeric"),
          time: formatTime(instant),
        });

  return (
    <Card
      aria-labelledby="planning-generation-title"
      className="planning-generation-card"
      role="region"
    >
      <h2 className="planning-card-title" id="planning-generation-title">
        {t("admin-scheduling:templates.generation.title")}
      </h2>
      {readOnly ? null : (
        <>
          <Select
            aria-label={t("admin-scheduling:templates.generation.week")}
            disabled={candidates.length === 0}
            onChange={(event) => {
              setChosen(event.currentTarget.value);
            }}
            value={selected ?? ""}
          >
            {candidates.map((item) => (
              <option key={item.startDate} value={item.startDate}>
                {t("admin-scheduling:templates.generation.weekOption", {
                  range: formatWeekRange(item.startDate, item.endDate),
                })}
              </option>
            ))}
          </Select>
          <div className="planning-generation-card__actions">
            <Button
              disabled={
                blockedCount > 0 || candidate === undefined || weekdayTemplateId === undefined
              }
              onClick={() => {
                setConfirming(crypto.randomUUID());
              }}
              variant="ghost"
            >
              {t("admin-scheduling:templates.generation.submit")}
            </Button>
            {blockedCount > 0 ? (
              <Badge tone="danger">
                {t("admin-scheduling:templates.generation.blocked", { count: blockedCount })}
              </Badge>
            ) : null}
          </div>
        </>
      )}
      <DataTable<WeekListItem>
        caption={t("admin-scheduling:weeks.caption")}
        columns={[
          { header: t("admin-scheduling:weeks.year"), key: "year", render: (week) => week.isoYear },
          { header: t("admin-scheduling:weeks.week"), key: "week", render: (week) => week.isoWeek },
          {
            header: t("admin-scheduling:weeks.start"),
            key: "start",
            render: (week) => formatPlainDate(week.startDate, "dayMonthNumeric"),
          },
          {
            header: t("admin-scheduling:weeks.generated"),
            key: "generated",
            render: (week) =>
              stamp(week.generatedAt) ?? <Chip>{t("enums:weekState.PENDING")}</Chip>,
          },
          {
            header: t("admin-scheduling:weeks.validated"),
            key: "validated",
            render: (week) => stamp(week.validatedAt) ?? t("admin-scheduling:common.none"),
          },
        ]}
        empty={t("admin-scheduling:weeks.empty")}
        loading={weeks === undefined}
        loadingLabel={t("admin-scheduling:common.loading")}
        rowKey={(week) => week.id}
        rows={[...(weeks ?? [])]}
      />
      <Modal
        closeLabel={t("admin-scheduling:common.close")}
        onClose={() => {
          setConfirming(undefined);
        }}
        open={confirming !== undefined && candidate !== undefined}
        title={t("admin-scheduling:templates.generation.title")}
      >
        <p>
          {t("admin-scheduling:templates.generation.confirm", {
            date:
              candidate === undefined ? "" : formatPlainDate(candidate.startDate, "short"),
          })}
        </p>
        <div className="planning-form__actions">
          <Button
            onClick={() => {
              setConfirming(undefined);
            }}
            variant="ghost"
          >
            {t("admin-scheduling:common.cancel")}
          </Button>
          <Button
            loading={pending}
            loadingLabel={t("admin-scheduling:common.saving")}
            onClick={() => {
              if (candidate === undefined || confirming === undefined) return;
              setPending(true);
              void onGenerate(candidate, confirming).finally(() => {
                setPending(false);
                setConfirming(undefined);
              });
            }}
          >
            {t("admin-scheduling:templates.generation.submit")}
          </Button>
        </div>
      </Modal>
    </Card>
  );
}

function CoverageCard({ coverage }: { coverage: Coverage }) {
  const { t } = useTranslation(["admin-scheduling", "enums"]);
  const { locale } = useClubFormats();
  const decimal = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });
  const percent = (value: number | null | undefined) =>
    value === null || value === undefined
      ? t("admin-scheduling:common.none")
      : t("admin-scheduling:coverage.percent", { value });

  return (
    <Card
      aria-labelledby="planning-coverage-title"
      className="planning-coverage-card"
      role="region"
    >
      <h2 className="planning-card-title" id="planning-coverage-title">
        {t("admin-scheduling:coverage.title")}
      </h2>
      <DataTable<CoverageLevel>
        caption={t("admin-scheduling:coverage.title")}
        columns={[
          {
            header: t("admin-scheduling:coverage.level"),
            key: "level",
            render: (level) => level.name,
          },
          {
            header: t("admin-scheduling:coverage.maxSeats"),
            key: "max",
            render: (level) => decimal.format(level.maxSeats),
          },
          {
            header: t("admin-scheduling:coverage.propSeats"),
            key: "prop",
            render: (level) => decimal.format(level.propSeats),
          },
          {
            header: t("admin-scheduling:coverage.maxRatio"),
            key: "maxRatio",
            render: (level) => percent(level.maxRatioPct),
          },
          {
            header: t("admin-scheduling:coverage.propRatio"),
            key: "propRatio",
            render: (level) => percent(level.propRatioPct),
          },
          {
            header: t("admin-scheduling:coverage.status"),
            key: "status",
            render: (level) => (
              <Badge
                className={level.status === "SHORT" ? "planning-badge--muted" : undefined}
                tone={coverageTones[level.status]}
              >
                {t(`enums:coverageStatus.${level.status}`)}
              </Badge>
            ),
          },
        ]}
        empty={t("admin-scheduling:common.none")}
        loadingLabel={t("admin-scheduling:common.loading")}
        rowKey={(level) => level.levelId}
        rows={coverage.levels}
      />
      <p className="planning-coverage-card__footnote">
        {t("admin-scheduling:coverage.footnote", {
          ok: coverage.thresholds.ok,
          short: coverage.thresholds.short,
          tight: coverage.thresholds.tight,
        })}
      </p>
    </Card>
  );
}

function initialTemplateParam(): string | undefined {
  return new URLSearchParams(window.location.search).get("template") ?? undefined;
}

function resolveSelected(
  items: readonly WeekTemplateSummary[],
  stored: string | undefined,
): string | undefined {
  return items.find((item) => item.id === stored)?.id ?? items[0]?.id;
}

/** D3 · weekly templates (`/plantilles`). INSTRUCTOR reads everything without actions (A22 c). */
export function TemplatesPage({
  client,
  onNavigate = (path) => {
    window.location.assign(path);
  },
  readOnly,
}: {
  client: ApiClient;
  onNavigate?: (path: string) => void;
  readOnly: boolean;
}) {
  const { t } = useTranslation(["admin-scheduling", "enums", "errors"]);
  const branding = useBranding();
  const errorMessage = useErrorMessage();
  const [choice, setChoice] = useState(readTemplateChoice);
  const [visibleId, setVisibleId] = useState<string | undefined>(initialTemplateParam);
  const [feedback, setFeedback] = useState<Feedback>();
  const [card, setCard] = useState<{ key: number; mode: ClassFormMode }>({
    key: 0,
    mode: { fromEmptyCell: false, kind: "create" },
  });
  const cardMode = card.mode;
  /** A new card (another class or slot) remounts the form; a saved change of the same class keeps it. */
  const setCardMode = useCallback((mode: ClassFormMode, remount = true) => {
    setCard((currentCard) => ({ key: remount ? currentCard.key + 1 : currentCard.key, mode }));
  }, []);
  const [askAnother, setAskAnother] = useState<{
    bandId: string;
    dayOfWeek: TemplateClass["dayOfWeek"];
  }>();
  const [templateModal, setTemplateModal] = useState<{ source?: WeekTemplate } | undefined>();
  const [bandDrawer, setBandDrawer] = useState<{ band?: TimeBand } | undefined>();

  const loadLists = useCallback(async (): Promise<TemplateLists> => {
    const [weekdays, saturdays] = await Promise.all([
      client.GET("/week-templates", { params: { query: { active: true, kind: "WEEKDAYS" } } }),
      client.GET("/week-templates", { params: { query: { active: true, kind: "SATURDAY" } } }),
    ]);
    return { SATURDAY: saturdays.data?.items ?? [], WEEKDAYS: weekdays.data?.items ?? [] };
  }, [client]);
  const lists = useResource(loadLists);
  const catalogs = useResource(useCallback(() => loadPlanningCatalogs(client), [client]));
  const settings = useResource(
    useCallback(
      async () => (readOnly ? defaultSettings : loadSettings(client)),
      [client, readOnly],
    ),
  );

  const allSummaries = useMemo(
    () => [...(lists.data?.WEEKDAYS ?? []), ...(lists.data?.SATURDAY ?? [])],
    [lists.data],
  );
  const shownId = allSummaries.some((item) => item.id === visibleId)
    ? visibleId
    : (resolveSelected(lists.data?.WEEKDAYS ?? [], choice.WEEKDAYS) ??
      resolveSelected(lists.data?.SATURDAY ?? [], choice.SATURDAY));
  const shownKind = allSummaries.find((item) => item.id === shownId)?.kind;
  // The visible grid is always its tab's choice; the other tab keeps the remembered template.
  const weekdayId =
    shownKind === "WEEKDAYS"
      ? shownId
      : resolveSelected(lists.data?.WEEKDAYS ?? [], choice.WEEKDAYS);
  const saturdayId =
    shownKind === "SATURDAY"
      ? shownId
      : resolveSelected(lists.data?.SATURDAY ?? [], choice.SATURDAY);

  useEffect(() => {
    if (shownId === undefined) return;
    writeTemplateChoice({
      ...(weekdayId === undefined ? {} : { WEEKDAYS: weekdayId }),
      ...(saturdayId === undefined ? {} : { SATURDAY: saturdayId }),
    });
    const url = new URL(window.location.href);
    if (url.searchParams.get("template") !== shownId) {
      url.searchParams.set("template", shownId);
      window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}`);
    }
  }, [saturdayId, shownId, weekdayId]);

  const template = useResource(
    useMemo(
      () =>
        shownId === undefined
          ? undefined
          : async () => {
              const result = await client.GET("/week-templates/{id}", {
                params: { path: { id: shownId } },
              });
              if (result.data === undefined)
                throw new TypeError("Template response did not contain data");
              return result.data;
            },
      [client, shownId],
    ),
  );

  const coverage = useResource(
    useMemo(
      () =>
        weekdayId === undefined
          ? undefined
          : async (): Promise<Coverage | null> => {
              try {
                const result = await client.GET("/coverage", {
                  params: {
                    query: {
                      templateId: weekdayId,
                      ...(saturdayId === undefined ? {} : { saturdayTemplateId: saturdayId }),
                    },
                  },
                });
                return result.data ?? null;
              } catch (error) {
                if (isApiError(error, "LEVELS_DISABLED")) return null;
                throw error;
              }
            },
      [client, saturdayId, weekdayId],
    ),
  );

  const weeks = useResource(
    useCallback(async () => {
      const monday = mondayOf(clubToday(branding.timeZone));
      const result = await client.GET("/weeks", {
        params: { query: { filter: [`startDate:gte:${monday}`], sort: ["startDate,asc"] } },
      });
      return result.data?.items ?? [];
    }, [branding.timeZone, client]),
  );

  const candidates = useResource(
    useMemo(
      () =>
        readOnly
          ? undefined
          : async () => (await client.GET("/weeks/generation-candidates")).data?.items ?? [],
      [client, readOnly],
    ),
  );

  // Read-only: no band is edited, so the opening hours are never read (`undefined`, never `{}`,
  // which would mean «closed every day»).
  const openingHours = useResource(
    useMemo(() => (readOnly ? undefined : () => loadOpeningHours(client)), [client, readOnly]),
  );

  const loadFailure = lists.error ?? template.error ?? catalogs.error;
  // Secondary cards (and the opening hours the bands need): a failed load shows the toast with
  // [Torna-ho a provar] instead of a table that stays loading or assumed hours (S06 §2 «toast +
  // reintent»).
  const secondaryFailure = coverage.error ?? weeks.error ?? candidates.error ?? openingHours.error;

  /** Latest known template version: every PATCH of the queue reads it when it is sent. */
  const versionRef = useRef<{ id: string; version: number } | undefined>(undefined);
  useEffect(() => {
    if (template.data !== undefined) {
      versionRef.current = { id: template.data.id, version: template.data.version };
    }
  }, [template.data]);
  const cardRef = useRef(card);
  useEffect(() => {
    cardRef.current = card;
  }, [card]);
  /** Edit-mode PATCHes run one after the other (R-06-02 «each change is saved at once»). */
  const patchQueue = useRef<Promise<unknown>>(Promise.resolve());
  /**
   * Bumped when a PATCH fails or a class DELETE succeeds: the changes queued after it were built on
   * the rejected change or on the removed class, so they are dropped (and reject).
   */
  const patchGeneration = useRef(0);

  const applyTemplate = (next: WeekTemplate) => {
    versionRef.current = { id: next.id, version: next.version };
    template.setData(next);
    lists.reload();
    coverage.reload();
  };

  const cardShowsClass = (classId: string) =>
    cardRef.current.mode.kind === "edit" && cardRef.current.mode.item.id === classId;

  const selectTemplate = (id: string) => {
    setChoice({
      ...(weekdayId === undefined ? {} : { WEEKDAYS: weekdayId }),
      ...(saturdayId === undefined ? {} : { SATURDAY: saturdayId }),
    });
    setVisibleId(id);
    setCardMode({ fromEmptyCell: false, kind: "create" });
  };

  const focusCard = () => {
    window.requestAnimationFrame(() => {
      document.getElementById(CLASS_CARD_ID)?.focus();
    });
  };

  const current = template.data?.id === shownId ? template.data : undefined;
  const cat = catalogs.data;
  const config = settings.data ?? defaultSettings;
  const blockedCount = [weekdayId, saturdayId]
    .map((id) => allSummaries.find((item) => item.id === id)?.inconsistencyCount ?? 0)
    .reduce((total, value) => total + value, 0);

  const createClass = async (values: ClassFormValues) => {
    if (current === undefined) return;
    const capacity = values.capacity.trim() === "" ? null : Number(values.capacity);
    const description = values.description.trim() === "" ? null : values.description.trim();
    const result = await client.POST("/week-templates/{id}/classes", {
      body: {
        bandId: values.bandId,
        capacity,
        dayOfWeek: values.dayOfWeek,
        description,
        instructorIds: values.instructorIds,
        levelIds: values.levelIds,
        ringId: values.ringId,
      },
      params: { path: { id: current.id } },
    });
    if (result.data !== undefined) applyTemplate(result.data);
    if (cardMode.kind === "create" && cardMode.fromEmptyCell) {
      setAskAnother({ bandId: values.bandId, dayOfWeek: values.dayOfWeek });
    } else {
      setCardMode({ fromEmptyCell: false, kind: "create" });
    }
  };

  /** Another client changed the template: reload it and remount the card on the fresh class. */
  const recoverFromStaleVersion = async (templateId: string, classId: string, cause: unknown) => {
    setFeedback({ message: errorMessage(cause), tone: "warning" });
    const fresh = (
      await client.GET("/week-templates/{id}", { params: { path: { id: templateId } } })
    ).data;
    if (fresh === undefined || versionRef.current?.id !== templateId) return;
    applyTemplate(fresh);
    if (cardShowsClass(classId)) {
      const item = fresh.classes.find((candidate) => candidate.id === classId);
      setCardMode(
        item === undefined ? { fromEmptyCell: false, kind: "create" } : { item, kind: "edit" },
      );
    }
  };

  const patchClass = (patch: ClassFormPatch): Promise<void> => {
    if (current === undefined || cardMode.kind !== "edit") return Promise.resolve();
    const templateId = current.id;
    const classId = cardMode.item.id;
    const ticket = patchGeneration.current;
    const send = async () => {
      // Dropped, never silently: the form puts this change's chips back.
      if (ticket !== patchGeneration.current) throw new DroppedChangeError();
      const version =
        versionRef.current?.id === templateId ? versionRef.current.version : current.version;
      try {
        const result = await client.PATCH("/week-templates/{id}/classes/{classId}", {
          body: { ...patch, version },
          params: { path: { classId, id: templateId } },
        });
        if (result.data === undefined || versionRef.current?.id !== templateId) return;
        applyTemplate(result.data);
        const updated = result.data.classes.find((item) => item.id === classId);
        if (updated !== undefined && cardShowsClass(classId)) {
          setCardMode({ item: updated, kind: "edit" }, false);
        }
      } catch (error) {
        patchGeneration.current += 1;
        if (isApiError(error, "STALE_VERSION")) {
          await recoverFromStaleVersion(templateId, classId, error);
          return;
        }
        throw error;
      }
    };
    const task = patchQueue.current.then(send);
    patchQueue.current = task.catch(() => undefined);
    return task;
  };

  /**
   * A DELETE of the edit mode waits in the same queue as the PATCHes, so it never overtakes one
   * queued before it (E4-W01 review #3). Only a class DELETE that succeeded drops the changes
   * queued after it (they were built on the removed class); a failed one keeps them, and a band
   * removal never drops a class change.
   */
  const queueRemoval = (
    remove: () => Promise<void>,
    { dropsQueuedChanges }: { dropsQueuedChanges: boolean },
  ): Promise<void> => {
    const task = patchQueue.current.then(async () => {
      await remove();
      if (dropsQueuedChanges) patchGeneration.current += 1;
    });
    patchQueue.current = task.catch(() => undefined);
    return task;
  };

  const removeClass = (): Promise<void> => {
    if (current === undefined || cardMode.kind !== "edit") return Promise.resolve();
    const templateId = current.id;
    const classId = cardMode.item.id;
    return queueRemoval(
      async () => {
        await client.DELETE("/week-templates/{id}/classes/{classId}", {
          params: { path: { classId, id: templateId } },
        });
        if (cardShowsClass(classId)) setCardMode({ fromEmptyCell: false, kind: "create" });
        template.reload();
        lists.reload();
        coverage.reload();
      },
      { dropsQueuedChanges: true },
    );
  };

  const saveTemplate = async (name: string, kind: TemplateKind, copyFromId?: string) => {
    const result = await client.POST("/week-templates", {
      body: { kind, name, ...(copyFromId === undefined ? {} : { copyFromId }) },
    });
    setTemplateModal(undefined);
    lists.reload();
    if (result.data !== undefined) {
      selectTemplate(result.data.id);
    }
  };

  const saveBand = async (startTime: string, endTime: string) => {
    if (current === undefined) return;
    const band = bandDrawer?.band;
    const result =
      band === undefined
        ? await client.POST("/week-templates/{id}/bands", {
            body: { endTime, startTime },
            params: { path: { id: current.id } },
          })
        : await client.PATCH("/week-templates/{id}/bands/{bandId}", {
            body: {
              endTime,
              startTime,
              version:
                versionRef.current?.id === current.id
                  ? versionRef.current.version
                  : current.version,
            },
            params: { path: { bandId: band.id, id: current.id } },
          });
    if (result.data !== undefined) applyTemplate(result.data);
    setBandDrawer(undefined);
  };

  const removeBand = (band: TimeBand): Promise<void> => {
    if (current === undefined) return Promise.resolve();
    const templateId = current.id;
    return queueRemoval(
      async () => {
        await client.DELETE("/week-templates/{id}/bands/{bandId}", {
          params: { path: { bandId: band.id, id: templateId } },
        });
        setBandDrawer(undefined);
        // The DELETE (204) changed the template's version: read it before a class change queued
        // after the removal is sent, which carries only the admin's own field.
        const fresh = await client
          .GET("/week-templates/{id}", { params: { path: { id: templateId } } })
          .then(
            (result) => result.data,
            () => undefined,
          );
        if (fresh !== undefined && versionRef.current?.id === templateId) {
          applyTemplate(fresh);
        } else {
          template.reload();
          lists.reload();
        }
      },
      { dropsQueuedChanges: false },
    );
  };

  const generate = async (candidate: GenerationCandidate, idempotencyKey: string) => {
    if (weekdayId === undefined) return;
    try {
      const weekId =
        candidate.weekId ??
        (await client.POST("/weeks", { body: { startDate: candidate.startDate } })).data?.id;
      if (weekId === undefined) return;
      const result = await client.POST("/weeks/{id}/generation", {
        body: { saturdayTemplateId: saturdayId ?? null, weekdayTemplateId: weekdayId },
        params: { header: { "Idempotency-Key": idempotencyKey }, path: { id: weekId } },
      });
      const outcome = result.data;
      if (outcome !== undefined) {
        const skippedCount = outcome.skipped.reduce((total, item) => total + item.count, 0);
        const reasons = [...new Set(outcome.skipped.map((item) => item.reason))]
          .map((reason) => t(`enums:skipReason.${reason}`))
          .join(", ");
        setFeedback({
          message:
            skippedCount === 0
              ? t("admin-scheduling:templates.generation.done", { count: outcome.classCount })
              : `${t("admin-scheduling:templates.generation.done", { count: outcome.classCount })} · ${t(
                  "admin-scheduling:templates.generation.skipped",
                  { count: skippedCount, reasons },
                )}`,
          tone: "success",
        });
      }
    } catch (error) {
      setFeedback({ message: errorMessage(error), tone: "danger" });
    } finally {
      weeks.reload();
      candidates.reload();
    }
  };

  const header = (
    <header className="planning-header">
      <h1>{t("admin-scheduling:templates.title")}</h1>
      <div className="planning-tabs">
        <TemplateTab
          active={shownKind === "WEEKDAYS"}
          items={lists.data?.WEEKDAYS ?? []}
          label={
            weekdayId === undefined
              ? t("admin-scheduling:templates.weekdayTabEmpty")
              : t("admin-scheduling:templates.weekdayTab", {
                  name: allSummaries.find((item) => item.id === weekdayId)?.name ?? "",
                })
          }
          onSelect={selectTemplate}
          selectedId={weekdayId}
        />
        <TemplateTab
          active={shownKind === "SATURDAY"}
          items={lists.data?.SATURDAY ?? []}
          label={t("admin-scheduling:templates.saturdayTab")}
          onSelect={selectTemplate}
          selectedId={saturdayId}
        />
      </div>
      {readOnly ? null : (
        <div className="planning-header__actions">
          <Button
            onClick={() => {
              setTemplateModal({});
            }}
            variant="ghost"
          >
            <Icon aria-hidden="true" name="plus" />
            {t("admin-scheduling:templates.new")}
          </Button>
          <Button
            disabled={current === undefined}
            onClick={() => {
              if (current !== undefined) setTemplateModal({ source: current });
            }}
            variant="ghost"
          >
            <Icon aria-hidden="true" name="dup" />
            {t("admin-scheduling:templates.duplicate")}
          </Button>
          <Button
            disabled={current === undefined}
            onClick={() => {
              setBandDrawer({});
            }}
            variant="secondary"
          >
            <Icon aria-hidden="true" name="plus" />
            {t("admin-scheduling:templates.band")}
          </Button>
          <Button
            disabled={current === undefined || current.bands.length === 0}
            onClick={() => {
              setCardMode({ fromEmptyCell: false, kind: "create" });
              focusCard();
            }}
          >
            <Icon aria-hidden="true" name="plus" />
            {t("admin-scheduling:templates.createClass")}
          </Button>
        </div>
      )}
    </header>
  );

  const overlays = readOnly ? null : (
    <>
      {templateModal === undefined ? null : (
        <TemplateModal
          onClose={() => {
            setTemplateModal(undefined);
          }}
          onSave={saveTemplate}
          source={templateModal.source}
        />
      )}
      {bandDrawer === undefined ? null : (
        <BandDrawer
          band={bandDrawer.band}
          bands={(current?.bands ?? []).filter((band) => band.id !== bandDrawer.band?.id)}
          onClose={() => {
            setBandDrawer(undefined);
          }}
          onRemove={removeBand}
          onSave={saveBand}
          opening={templateOpening(openingHours.data, current?.days ?? [])}
          slotMinutes={config.slotMinutes}
        />
      )}
      <Modal
        closeLabel={t("admin-scheduling:common.close")}
        onClose={() => {
          setAskAnother(undefined);
          setCardMode({ fromEmptyCell: false, kind: "create" });
        }}
        open={askAnother !== undefined}
        title={t("admin-scheduling:templates.addAnotherInBand")}
      >
        <div className="planning-form__actions">
          <Button
            onClick={() => {
              setAskAnother(undefined);
              setCardMode({ fromEmptyCell: false, kind: "create" });
            }}
            variant="ghost"
          >
            {t("admin-scheduling:templates.addAnotherNo")}
          </Button>
          <Button
            onClick={() => {
              if (askAnother !== undefined) {
                setCardMode({ ...askAnother, fromEmptyCell: true, kind: "create" });
                focusCard();
              }
              setAskAnother(undefined);
            }}
          >
            {t("admin-scheduling:templates.addAnotherYes")}
          </Button>
        </div>
      </Modal>
    </>
  );

  const secondaryToast =
    secondaryFailure === undefined ? null : (
      <div className="planning-load-error">
        <Toast tone="danger">{errorMessage(secondaryFailure)}</Toast>
        <Button
          onClick={() => {
            if (coverage.error !== undefined) coverage.reload();
            if (weeks.error !== undefined) weeks.reload();
            if (candidates.error !== undefined) candidates.reload();
            if (openingHours.error !== undefined) openingHours.reload();
          }}
          variant="secondary"
        >
          {t("admin-scheduling:common.retry")}
        </Button>
      </div>
    );
  const feedbackToast =
    feedback === undefined ? null : (
      <Toast
        dismissLabel={t("admin-scheduling:common.close")}
        onDismiss={() => {
          setFeedback(undefined);
        }}
        tone={feedback.tone}
      >
        {feedback.message}
      </Toast>
    );

  if (loadFailure !== undefined) {
    return (
      <section className="planning-page">
        {header}
        <Toast tone="danger">{errorMessage(loadFailure)}</Toast>
        <Button
          onClick={() => {
            lists.reload();
            template.reload();
            catalogs.reload();
          }}
        >
          {t("admin-scheduling:common.retry")}
        </Button>
      </section>
    );
  }

  if (lists.data !== undefined && allSummaries.length === 0) {
    return (
      <section className="planning-page">
        {header}
        {feedbackToast}
        <Card>
          <EmptyState
            action={
              readOnly ? undefined : (
                <Button
                  onClick={() => {
                    setTemplateModal({});
                  }}
                >
                  <Icon aria-hidden="true" name="plus" />
                  {t("admin-scheduling:templates.new")}
                </Button>
              )
            }
            description={t("admin-scheduling:templates.empty.description")}
            icon="cal"
            title={t("admin-scheduling:templates.empty.title")}
          />
        </Card>
        {overlays}
      </section>
    );
  }

  return (
    <section className="planning-page">
      {header}
      {feedbackToast}
      {secondaryToast}
      {current === undefined || cat === undefined ? (
        <GridSkeleton />
      ) : (
        <WeekGrid
          catalogs={cat}
          onBand={(band) => {
            setBandDrawer({ band });
          }}
          onCell={(item) => {
            setCardMode({ item, kind: "edit" });
            focusCard();
          }}
          onDay={(day) => {
            onNavigate(`/plantilles/${current.id}/dia/${day.toLowerCase()}`);
          }}
          onEmpty={(band, day) => {
            setCardMode({ bandId: band.id, dayOfWeek: day, fromEmptyCell: true, kind: "create" });
            focusCard();
          }}
          readOnly={readOnly}
          selectedClassId={cardMode.kind === "edit" ? cardMode.item.id : undefined}
          template={current}
        />
      )}
      <div className="planning-cards">
        {readOnly ||
        current === undefined ||
        cat === undefined ||
        settings.data === undefined ? null : (
          <ClassForm
            bands={sortedBands(current.bands)}
            key={card.key}
            days={current.days}
            instructors={cat.instructors}
            levels={cat.levels}
            levelsEnabled={config.levelsEnabled}
            maxInstructors={config.maxInstructors}
            mode={cardMode}
            onChange={patchClass}
            onClose={() => {
              setCardMode({ fromEmptyCell: false, kind: "create" });
            }}
            onCreate={createClass}
            onRemove={removeClass}
            rings={cat.rings}
          />
        )}
        <GenerationCard
          blockedCount={blockedCount}
          candidates={candidates.data ?? []}
          onGenerate={generate}
          readOnly={readOnly}
          weekdayTemplateId={weekdayId}
          weeks={weeks.data ?? (weeks.error === undefined ? undefined : [])}
        />
      </div>
      {coverage.data === undefined || coverage.data === null ? null : (
        <CoverageCard coverage={coverage.data} />
      )}
      {overlays}
    </section>
  );
}
