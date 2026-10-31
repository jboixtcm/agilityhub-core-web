import type { components } from "@agilityhub/api-client";
import { Card, RadioGroup } from "@agilityhub/ui";
import { type CSSProperties, useId, useState } from "react";
import { useTranslation } from "react-i18next";

export function DogLevelsChart({ data }: { data: components["schemas"]["DogsByLevel"] }) {
  const { t, i18n } = useTranslation("admin-dashboard");
  const [filter, setFilter] = useState("all");
  const descriptionId = useId();
  const recent = filter === "recent";
  // R-14-07: only progression levels participate; `others` is deliberately excluded.
  const values = data.levels.map((level) => (recent ? level.withRecentBooking : level.total));
  const total = values.reduce((sum, value) => sum + value, 0);
  const title = recent
    ? t("admin-dashboard:chart.titleRecent", { count: total })
    : t("admin-dashboard:chart.title", { count: total });
  const number = new Intl.NumberFormat(i18n.language);
  const percent = new Intl.NumberFormat(i18n.language, {
    style: "percent",
    maximumFractionDigits: 1,
  });
  const { stops } = data.levels.reduce<{ offset: number; stops: string[] }>(
    (result, level, index) => {
      const value = values[index] ?? 0;
      if (value === 0 || total === 0) return result;
      const offset = result.offset + (value / total) * 100;
      return {
        offset,
        stops: [...result.stops, `${level.color} ${String(result.offset)}% ${String(offset)}%`],
      };
    },
    { offset: 0, stops: [] },
  );

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
            stops.length === 0 ? undefined : { background: `conic-gradient(${stops.join(", ")})` }
          }
        >
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
                    <span className="dashboard-chart__level">
                      <i
                        aria-hidden="true"
                        className="dashboard-chart__swatch"
                        style={{ "--ah-level-color": level.color } as CSSProperties}
                      />
                      {level.code}
                    </span>
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
