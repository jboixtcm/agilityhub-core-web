import type { components } from "@agilityhub/api-client";
import { Card, RadioGroup } from "@agilityhub/ui";
import { type CSSProperties, useId, useState } from "react";
import { useTranslation } from "react-i18next";

export function dogLevelListPath(levelId: string): string {
  const search = new URLSearchParams();
  search.append("filter", "status:eq:ACTIVE");
  search.append("filter", `levelId:eq:${levelId}`);
  search.append("sort", "levelAssignedAt,asc");
  search.append("sort", "name,asc");
  search.set("fields", "name,breed,level,owner,levelAssignedAt,birthDate,displayStatus");
  return `/gossos?${search.toString()}`;
}

export function DogLevelsChart({
  data,
  onNavigate,
}: {
  data: components["schemas"]["DogsByLevel"];
  onNavigate: (path: string) => void;
}) {
  const { t, i18n } = useTranslation("admin-dashboard");
  const [filter, setFilter] = useState("all");
  const descriptionId = useId();
  const recent = filter === "recent";
  // Every active catalog level participates; unassigned/inactive levels remain outside the chart.
  const values = data.levels.map((level) => (recent ? level.withRecentBooking : level.total));
  const total = values.reduce((sum, value) => sum + value, 0);
  const title = recent
    ? t("admin-dashboard:chart.titleRecent", { count: total })
    : t("admin-dashboard:chart.title", { count: total });
  const number = new Intl.NumberFormat(i18n.language);
  const percent = new Intl.NumberFormat(i18n.language, {
    style: "percent",
    maximumFractionDigits: 0,
  });
  const segments = [];
  let offset = 0;
  for (const [index, level] of data.levels.entries()) {
    const value = values[index] ?? 0;
    if (!value || !total) continue;
    const start = offset;
    offset += value / total;
    const angle = (start + offset) * Math.PI;
    segments.push({
      level,
      stop: `${level.color} ${String(start * 100)}% ${String(offset * 100)}%`,
      x: 50 + 42 * Math.sin(angle),
      y: 50 - 42 * Math.cos(angle),
    });
  }

  return (
    <Card className="dashboard-chart">
      <header>
        <h2>{title}</h2>
        <div className="dashboard-chart__filter">
          <RadioGroup
            label={t("admin-dashboard:chart.filter")}
            onValueChange={setFilter}
            options={[
              { value: "all", label: t("admin-dashboard:chart.all") },
              { value: "recent", label: t("admin-dashboard:chart.withBookings") },
            ]}
            value={filter}
          />
        </div>
      </header>
      <p className="dashboard-chart__description" id={descriptionId}>
        {recent
          ? t("admin-dashboard:chart.legendRecent", {
              previous: Math.max(0, data.activeDogWeeks - 1),
            })
          : t("admin-dashboard:chart.descriptionAll")}
      </p>
      <figure
        aria-describedby={descriptionId}
        aria-label={title}
        className="dashboard-chart__figure"
      >
        <div
          aria-hidden="true"
          className="dashboard-chart__donut"
          style={
            segments.length === 0
              ? undefined
              : {
                  background: `conic-gradient(${segments.map((segment) => segment.stop).join(", ")})`,
                }
          }
        >
          {segments.map(({ level, x, y }) => (
            <span
              key={level.levelId}
              className="dashboard-chart__segment"
              style={{ left: `${String(x)}%`, top: `${String(y)}%` }}
            >
              {level.code}
            </span>
          ))}
          <div className="dashboard-chart__center">
            <strong>{number.format(total)}</strong>
            <span>
              {recent
                ? t("admin-dashboard:chart.withBookings")
                : t("admin-dashboard:chart.activeDogs")}
            </span>
          </div>
        </div>
        <table className="dashboard-chart__legend">
          <caption className="ah-sr-only">{title}</caption>
          <thead>
            <tr>
              <th scope="col">{t("admin-dashboard:chart.level")}</th>
              <th scope="col">{t("admin-dashboard:chart.dogs")}</th>
              <th scope="col">{t("admin-dashboard:chart.share")}</th>
            </tr>
          </thead>
          <tbody>
            {data.levels.map((level, index) => {
              const value = values[index] ?? 0;
              return (
                <tr key={level.levelId} title={level.name}>
                  <th scope="row">
                    <a
                      className="dashboard-chart__level"
                      href={dogLevelListPath(level.levelId)}
                      onClick={(event) => {
                        if (
                          event.button !== 0 ||
                          event.metaKey ||
                          event.ctrlKey ||
                          event.shiftKey ||
                          event.altKey
                        )
                          return;
                        event.preventDefault();
                        onNavigate(dogLevelListPath(level.levelId));
                      }}
                    >
                      <i
                        aria-hidden="true"
                        className="dashboard-chart__swatch"
                        style={{ "--ah-level-color": level.color } as CSSProperties}
                      />
                      {level.code}
                    </a>
                  </th>
                  <td>{number.format(value)}</td>
                  <td>
                    {total === 0
                      ? t("admin-dashboard:common.empty")
                      : percent.format(value / total)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {total === 0 ? (
          <p className="dashboard-chart__empty" role="status">
            {recent ? t("admin-dashboard:chart.emptyRecent") : t("admin-dashboard:chart.emptyAll")}
          </p>
        ) : null}
      </figure>
    </Card>
  );
}
