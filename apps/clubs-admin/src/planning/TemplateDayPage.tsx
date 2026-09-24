import { isApiError, type ApiClient } from "@agilityhub/api-client";
import { useClubFormats } from "@agilityhub/i18n";
import {
  Button,
  Card,
  Chip,
  Icon,
  IconButton,
  ScheduleCell,
  ScheduleGrid,
  type ScheduleColumn,
  Select,
  Skeleton,
  Toast,
} from "@agilityhub/ui";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import "./planning.css";
import {
  bandLabel,
  type DayOfWeek,
  instructorNames,
  loadPlanningCatalogs,
  sentenceCase,
  sortedBands,
  type TemplateClass,
  useResource,
  weekdayLabel,
} from "./shared";

export type DayView = "instructor" | "ring";

const NO_RING = "none";

interface DayCell {
  columnId: string;
  id: string;
  item: TemplateClass;
}

function initialView(): DayView {
  return new URLSearchParams(window.location.search).get("vista") === "instructor"
    ? "instructor"
    : "ring";
}

/**
 * D3b · one template day per ring or per instructor (`/plantilles/:templateId/dia/:dayOfWeek`),
 * derived on the client from `GET /week-templates/{id}` (S06 §2). Read-only for everyone.
 */
export function TemplateDayPage({
  client,
  dayOfWeek,
  onNavigate = (path) => {
    window.location.assign(path);
  },
  templateId,
}: {
  client: ApiClient;
  dayOfWeek: DayOfWeek | undefined;
  onNavigate?: (path: string) => void;
  templateId: string;
}) {
  const { t } = useTranslation(["admin-scheduling", "enums", "errors"]);
  const { formatPlainDate } = useClubFormats();
  const [view, setView] = useState<DayView>(initialView);
  const template = useResource(
    useCallback(async () => {
      const result = await client.GET("/week-templates/{id}", {
        params: { path: { id: templateId } },
      });
      if (result.data === undefined) throw new TypeError("Template response did not contain data");
      return result.data;
    }, [client, templateId]),
  );
  const catalogs = useResource(useCallback(() => loadPlanningCatalogs(client), [client]));

  const data = template.data;
  const cat = catalogs.data;
  const day =
    data === undefined
      ? undefined
      : data.days.includes(dayOfWeek ?? "SUNDAY")
        ? dayOfWeek
        : data.days[0];
  const dayIndex = data === undefined || day === undefined ? -1 : data.days.indexOf(day);

  // An unknown or unsupported `:dayOfWeek` (e.g. `/dia/sunday`) shows the template's first day;
  // the URL is rewritten to it so the route round-trips.
  useEffect(() => {
    if (day === undefined || day === dayOfWeek) return;
    const url = new URL(window.location.href);
    url.pathname = `/plantilles/${templateId}/dia/${day.toLowerCase()}`;
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}`);
  }, [day, dayOfWeek, templateId]);

  const grid = useMemo(() => {
    if (data === undefined || cat === undefined || day === undefined) return undefined;
    const classes = data.classes.filter((item) => item.dayOfWeek === day);
    let columns: ScheduleColumn[];
    let cellsFor: (item: TemplateClass) => DayCell[];
    if (view === "ring") {
      const used = new Set(classes.map((item) => item.ringId ?? NO_RING));
      columns = [
        ...cat.rings
          .filter((ring) => used.has(ring.id))
          .map((ring) => ({ color: ring.color, id: ring.id, label: ring.name })),
        ...(used.has(NO_RING)
          ? [{ id: NO_RING, label: t("admin-scheduling:templates.day.noRing") }]
          : []),
      ];
      cellsFor = (item) => [{ columnId: item.ringId ?? NO_RING, id: item.id, item }];
    } else {
      const used = new Set(classes.flatMap((item) => item.instructorIds));
      columns = cat.instructors
        .filter((instructor) => used.has(instructor.id))
        .map((instructor) => ({
          color: instructor.color,
          id: instructor.id,
          label: instructor.shortName,
        }));
      cellsFor = (item) =>
        item.instructorIds.map((instructorId) => ({
          columnId: instructorId,
          id: `${item.id}:${instructorId}`,
          item,
        }));
    }
    return {
      columns,
      rows: sortedBands(data.bands).map((band) => ({
        cells: classes.filter((item) => item.bandId === band.id).flatMap(cellsFor),
        id: band.id,
        label: bandLabel(band.startTime),
      })),
    };
  }, [cat, data, day, t, view]);

  const goToDay = (next: DayOfWeek) => {
    onNavigate(
      `/plantilles/${templateId}/dia/${next.toLowerCase()}${view === "instructor" ? "?vista=instructor" : ""}`,
    );
  };

  const switchView = (next: DayView) => {
    setView(next);
    const url = new URL(window.location.href);
    if (next === "instructor") url.searchParams.set("vista", "instructor");
    else url.searchParams.delete("vista");
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}`);
  };

  const failure = template.error ?? catalogs.error;
  const back = (
    <Button
      className="planning-back"
      onClick={() => {
        onNavigate(`/plantilles?template=${templateId}`);
      }}
      variant="ghost"
    >
      <Icon aria-hidden="true" className="planning-back__icon" name="chev" />
      {t("admin-scheduling:templates.day.back")}
    </Button>
  );

  if (failure !== undefined) {
    return (
      <section className="planning-page">
        <h1>{t("admin-scheduling:templates.title")}</h1>
        <Toast tone="danger">
          {isApiError(failure)
            ? t(`errors:${failure.code}`, { defaultValue: t("admin-scheduling:common.error") })
            : t("admin-scheduling:common.error")}
        </Toast>
        <Button
          onClick={() => {
            template.reload();
            catalogs.reload();
          }}
        >
          {t("admin-scheduling:common.retry")}
        </Button>
        {back}
      </section>
    );
  }

  return (
    <section className="planning-page">
      <header className="planning-header">
        <h1>{t("admin-scheduling:templates.title")}</h1>
        {data === undefined ? null : (
          <Chip className="planning-template-chip">
            {t("admin-scheduling:templates.day.header", {
              kind: t(`enums:templateKind.${data.kind}`),
              name: data.name,
            })}
          </Chip>
        )}
        {data === undefined || day === undefined ? null : (
          <div className="planning-day-selector">
            <IconButton
              className="planning-day-selector__previous"
              disabled={dayIndex <= 0}
              icon="chev"
              label={t("admin-scheduling:templates.day.previous")}
              onClick={() => {
                const previous = data.days[dayIndex - 1];
                if (previous !== undefined) goToDay(previous);
              }}
            />
            <Select
              aria-label={t("admin-scheduling:templates.day.select")}
              onChange={(event) => {
                const next = data.days.find((candidate) => candidate === event.currentTarget.value);
                if (next !== undefined) goToDay(next);
              }}
              value={day}
            >
              {data.days.map((candidate) => (
                <option key={candidate} value={candidate}>
                  {sentenceCase(weekdayLabel(candidate, formatPlainDate, "weekdayLong"))}
                </option>
              ))}
            </Select>
            <IconButton
              disabled={dayIndex >= data.days.length - 1}
              icon="chev"
              label={t("admin-scheduling:templates.day.next")}
              onClick={() => {
                const next = data.days[dayIndex + 1];
                if (next !== undefined) goToDay(next);
              }}
            />
          </div>
        )}
        <div
          aria-label={t("admin-scheduling:templates.day.viewLabel")}
          className="planning-segmented"
          role="group"
        >
          <button
            aria-pressed={view === "ring"}
            onClick={() => {
              switchView("ring");
            }}
            type="button"
          >
            {t("admin-scheduling:templates.day.byRing")}
          </button>
          <button
            aria-pressed={view === "instructor"}
            onClick={() => {
              switchView("instructor");
            }}
            type="button"
          >
            {t("admin-scheduling:templates.day.byInstructor")}
          </button>
        </div>
      </header>
      {grid === undefined || data === undefined || cat === undefined || day === undefined ? (
        <Card className="planning-grid-card">
          <Skeleton height="16rem" label={t("admin-scheduling:common.loading")} />
        </Card>
      ) : (
        <Card className="planning-grid-card">
          <ScheduleGrid<DayCell>
            columns={grid.columns}
            label={t("admin-scheduling:templates.day.gridLabel", {
              day: weekdayLabel(day, formatPlainDate, "weekdayLong"),
              name: data.name,
            })}
            renderCell={({ item }) => {
              const ring =
                item.ringId === null || item.ringId === undefined
                  ? undefined
                  : cat.rings.find((candidate) => candidate.id === item.ringId);
              const instructors = instructorNames(item, cat.instructors);
              return (
                <ScheduleCell
                  color={ring?.color ?? null}
                  label={t("admin-scheduling:templates.cellLabel", {
                    description: item.displayDescription,
                    hasWarnings: "no",
                    instructors,
                    ring: ring?.name ?? t("admin-scheduling:classCard.noRing"),
                    warnings: "",
                  })}
                  subtitle={
                    view === "ring"
                      ? instructors
                      : (ring?.name ?? t("admin-scheduling:classCard.noRing"))
                  }
                  title={item.displayDescription}
                  warning={item.inconsistencyIds.length > 0}
                />
              );
            }}
            rows={grid.rows}
          />
        </Card>
      )}
      {back}
    </section>
  );
}
