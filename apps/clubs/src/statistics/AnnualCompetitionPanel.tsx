import type { components } from "@agilityhub/api-client";
import { useClubFormats } from "@agilityhub/i18n";
import { BarChart } from "@agilityhub/ui";
import { useTranslation } from "react-i18next";

type Annual = components["schemas"]["CompetitionAnnualSummary"];
type Summary = components["schemas"]["CompetitionRunSummary"];

export function AnnualCompetitionPanel({ years }: { years: Annual[] }) {
  const { t, i18n } = useTranslation("statistics");
  const formats = useClubFormats();
  const number = (value: number | null | undefined, digits = 1) =>
    value == null
      ? t("statistics:unknown")
      : new Intl.NumberFormat(i18n.language, { maximumFractionDigits: digits }).format(value);
  const percent = (value: number | null | undefined) =>
    value == null ? t("statistics:unknown") : `${number(value)} %`;
  const metrics: { label: string; value: (summary: Summary) => number | string }[] = [
    { label: t("statistics:runs"), value: (s) => s.runs },
    { label: t("statistics:clearRuns"), value: (s) => s.clearRuns },
    { label: t("statistics:comparison.clearRate"), value: (s) => percent(s.clearRatePercent) },
    { label: t("statistics:comparison.eliminated"), value: (s) => s.eliminatedRuns },
    {
      label: t("statistics:comparison.eliminatedRate"),
      value: (s) => percent(s.eliminatedRatePercent),
    },
    { label: t("statistics:averageSpeed"), value: (s) => number(s.averageSpeedMps, 2) },
    { label: t("statistics:comparison.speedSamples"), value: (s) => s.speedSamples },
    { label: t("statistics:pointP"), value: (s) => s.p },
    { label: t("statistics:pointPV"), value: (s) => s.pv },
    { label: t("statistics:pointPA"), value: (s) => s.pa },
    {
      label: t("statistics:comparison.outcomeSamples"),
      value: (s) => `${String(s.outcomeSamples)} / ${String(s.runs)}`,
    },
  ];
  if (!years.some((year) => year.summaries.some((summary) => summary.runs > 0))) return null;
  return (
    <section className="competition-comparison" aria-label={t("statistics:comparison.title")}>
      <h3>{t("statistics:comparison.title")}</h3>
      <p className="competition-source">{t("statistics:comparison.description")}</p>
      <p className="competition-source">{t("statistics:comparison.legend")}</p>
      <div className="competition-comparison-grid">
        {(["AGILITY", "JUMPING"] as const).map((discipline) => {
          const name =
            discipline === "AGILITY"
              ? t("statistics:discipline.AGILITY")
              : t("statistics:discipline.JUMPING");
          const columns = years.map((year) => ({
            ...year,
            summary: year.summaries.find((summary) => summary.discipline === discipline),
          }));
          return (
            <section
              key={discipline}
              aria-label={t("statistics:comparison.chart", { discipline: name })}
            >
              <h4>{name}</h4>
              <BarChart
                label={t("statistics:comparison.chart", { discipline: name })}
                totalLabel={t("statistics:runs")}
                highlightedLabel={t("statistics:clearRuns")}
                data={columns.map((column) => ({
                  label: String(column.year),
                  total: column.summary?.runs ?? 0,
                  highlighted: column.summary?.clearRuns ?? 0,
                }))}
                valueLabel={(item) =>
                  item.total === 0
                    ? t("statistics:comparison.noData")
                    : t("statistics:comparison.chartValue", {
                        clear: item.highlighted,
                        runs: item.total,
                      })
                }
              />
              <details className="competition-comparison-detail">
                <summary>{t("statistics:comparison.details", { discipline: name })}</summary>
                <table className="competition-comparison-table">
                  <caption className="ah-sr-only">
                    {t("statistics:comparison.details", { discipline: name })}
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">{t("statistics:comparison.metric")}</th>
                      {columns.map((column) => (
                        <th key={column.year} scope="col">
                          {column.year}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <th scope="row">{t("statistics:comparison.grades")}</th>
                      {columns.map((column) => (
                        <td key={column.year}>
                          {column.grades.join(" / ") || t("statistics:unknown")}
                        </td>
                      ))}
                    </tr>
                    {metrics.map((metric) => (
                      <tr key={metric.label}>
                        <th scope="row">{metric.label}</th>
                        {columns.map((column) => (
                          <td key={column.year}>
                            {column.summary
                              ? metric.value(column.summary)
                              : t("statistics:unknown")}
                          </td>
                        ))}
                      </tr>
                    ))}
                    <tr>
                      <th scope="row">{t("statistics:comparison.period")}</th>
                      {columns.map((column) => (
                        <td key={column.year}>
                          {column.firstResultDate && column.lastResultDate ? (
                            <span className="competition-comparison-dates">
                              <time dateTime={column.firstResultDate}>
                                {formats.formatPlainDate(column.firstResultDate, "dayMonthNumeric")}
                              </time>
                              <span aria-hidden="true">–</span>
                              <time dateTime={column.lastResultDate}>
                                {formats.formatPlainDate(column.lastResultDate, "dayMonthNumeric")}
                              </time>
                            </span>
                          ) : (
                            t("statistics:unknown")
                          )}
                        </td>
                      ))}
                    </tr>
                  </tbody>
                </table>
                <p className="competition-source">{t("statistics:comparison.samplesHelp")}</p>
              </details>
            </section>
          );
        })}
      </div>
    </section>
  );
}
