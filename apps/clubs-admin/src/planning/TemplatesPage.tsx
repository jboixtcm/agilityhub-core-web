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
import {
  CLASS_CARD_ID,
  ClassForm,
  type ClassFormMode,
  type ClassFormPatch,
  type ClassFormValues,
} from "./ClassForm";
import {
  bandLabel,
  businessDate,
  clubToday,
  errorCode,
  errorProp,
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

/** [＋ Franja] / click on a row label; mounted only while open. */
function BandDrawer({
  band,
  onClose,
  onRemove,
  onSave,
  slotMinutes,
}: {
  band?: TimeBand | undefined;
  onClose: () => void;
  onRemove: (band: TimeBand) => Promise<void>;
  onSave: (startTime: string, endTime: string) => Promise<void>;
  slotMinutes: number;
}) {
  const { t } = useTranslation(["admin-scheduling", "errors"]);
  const errorMessage = useErrorMessage();
  const [startTime, setStartTime] = useState(band?.startTime ?? "");
  const [endTime, setEndTime] = useState(band?.endTime ?? "");
  const [error, setError] = useState<{ field: "end" | "general" | "start"; message: string }>();
  const [pending, setPending] = useState(false);

  const fail = (cause: unknown) => {
    const code = errorCode(cause);
    setError({
      field:
        code === "BAND_NOT_EMPTY" || code === "STALE_VERSION"
          ? "general"
          : code === "INVALID_TIME_RANGE"
            ? "end"
            : "start",
      message: errorMessage(cause),
    });
  };

  const submit = async (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
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
  const { formatDate } = useClubFormats();
  const bands = sortedBands(template.bands);
  const ringsById = new Map(catalogs.rings.map((ring) => [ring.id, ring]));
  const inconsistencyTypes = new Map(template.inconsistencies.map((item) => [item.id, item.type]));

  return (
    <Card className="planning-grid-card">
      <ScheduleGrid<{ columnId: string; id: string; item: TemplateClass }>
        columns={template.days.map((day) => ({
          id: day,
          label: weekdayLabel(day, formatDate, "weekdayLong"),
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
                      day: weekdayLabel(day, formatDate, "weekdayLong"),
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
  const { formatDate, formatTime, formatWeekRange } = useClubFormats();
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
            render: (week) => formatDate(businessDate(week.startDate), "dayMonthNumeric"),
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
              candidate === undefined ? "" : formatDate(businessDate(candidate.startDate), "short"),
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

  const loadFailure = lists.error ?? template.error ?? catalogs.error;

  const applyTemplate = (next: WeekTemplate) => {
    template.setData(next);
    lists.reload();
    coverage.reload();
  };

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

  const patchClass = async (patch: ClassFormPatch) => {
    if (current === undefined || cardMode.kind !== "edit") return;
    const result = await client.PATCH("/week-templates/{id}/classes/{classId}", {
      body: { ...patch, version: current.version },
      params: { path: { classId: cardMode.item.id, id: current.id } },
    });
    if (result.data !== undefined) {
      applyTemplate(result.data);
      const updated = result.data.classes.find((item) => item.id === cardMode.item.id);
      if (updated !== undefined) setCardMode({ item: updated, kind: "edit" }, false);
    }
  };

  const removeClass = async () => {
    if (current === undefined || cardMode.kind !== "edit") return;
    await client.DELETE("/week-templates/{id}/classes/{classId}", {
      params: { path: { classId: cardMode.item.id, id: current.id } },
    });
    setCardMode({ fromEmptyCell: false, kind: "create" });
    template.reload();
    lists.reload();
    coverage.reload();
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
            body: { endTime, startTime, version: current.version },
            params: { path: { bandId: band.id, id: current.id } },
          });
    if (result.data !== undefined) applyTemplate(result.data);
    setBandDrawer(undefined);
  };

  const removeBand = async (band: TimeBand) => {
    if (current === undefined) return;
    await client.DELETE("/week-templates/{id}/bands/{bandId}", {
      params: { path: { bandId: band.id, id: current.id } },
    });
    setBandDrawer(undefined);
    template.reload();
    lists.reload();
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
          onClose={() => {
            setBandDrawer(undefined);
          }}
          onRemove={removeBand}
          onSave={saveBand}
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

  const coverageToast =
    coverage.error === undefined ? null : (
      <Toast tone="danger">{errorMessage(coverage.error)}</Toast>
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
      {coverageToast}
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
          weeks={weeks.data}
        />
      </div>
      {coverage.data === undefined || coverage.data === null ? null : (
        <CoverageCard coverage={coverage.data} />
      )}
      {overlays}
    </section>
  );
}
