import { type ApiClient, type components } from "@agilityhub/api-client";
import { useClubFormats } from "@agilityhub/i18n";
import { Button, Card, Select, useBranding } from "@agilityhub/ui";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";

import { errorText, useLoader } from "../booking/shared";

import { RsceProgressPanel } from "./RsceProgressPanel";

import "./statistics.css";

type Statistics = components["schemas"]["CompetitionStatistics"];
type Result = components["schemas"]["CompetitionResult"];

function Source({ row }: { row: Result }) {
  const { t } = useTranslation("statistics");
  const formats = useClubFormats();
  return (
    <p className="competition-source">
      <a href={row.sourceUrl} rel="noopener noreferrer" target="_blank">
        {t("statistics:source")}
      </a>
      {" · "}
      {t("statistics:importedAt", { date: formats.formatDate(row.importedAt, "dayMonthNumeric") })}
    </p>
  );
}

function DogStatistics({
  client,
  id,
  year,
  season,
}: {
  client: ApiClient;
  id: string;
  year: number;
  season: string;
}) {
  const { t, i18n } = useTranslation(["statistics", "errors"]);
  const formats = useClubFormats();
  const [scoredOnly, setScoredOnly] = useState(false);
  const [license, setLicense] = useState("");
  const load = useCallback(async () => {
    const { data } = await client.GET("/me/dogs/{id}/competition-statistics", {
      params: { path: { id }, query: { year, season } },
    });
    if (data === undefined) throw new Error("Missing statistics response");
    return data;
  }, [client, id, year, season]);
  const state = useLoader<Statistics>(load);
  const number = (value: number | null | undefined) =>
    value == null
      ? t("statistics:unknown")
      : new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 2 }).format(value);
  if (state.status === "loading") return <p role="status">{t("statistics:loading")}</p>;
  if (state.status === "error")
    return (
      <Card>
        <p role="alert">{errorText(t, state.error)}</p>
        <Button
          onClick={() => {
            state.refetch();
          }}
        >
          {t("statistics:retry")}
        </Button>
      </Card>
    );
  const stats = state.data;
  const progression =
    stats.rsceProgress.find((row) => row.license === license) ?? stats.rsceProgress[0];
  const selectedRuns = stats.results.filter(
    (row) => !progression || row.result.license === progression.license,
  );
  const summaries = progression?.summaries ?? stats.summaries;
  const scoredTrials = new Set(
    selectedRuns
      .filter((row) => row.result.point && row.result.point !== "NONE")
      .map((row) => row.result.trialId),
  ).size;
  const runs = selectedRuns.filter(
    (row) => !scoredOnly || (row.result.point != null && row.result.point !== "NONE"),
  );
  return (
    <>
      <Card>
        <h2>{t("statistics:fcag")}</h2>
        {stats.standings.length === 0 ? (
          <p>{t("statistics:noStandings")}</p>
        ) : (
          stats.standings.map((row) => (
            <section key={row.result.key}>
              <h3>
                {row.result.division}
                {" · "}
                {row.result.category}
              </h3>
              <dl className="competition-metrics">
                <div>
                  <dt>{t("statistics:position")}</dt>
                  <dd>{number(row.result.position)}</dd>
                </div>
                <div>
                  <dt>{t("statistics:netPoints")}</dt>
                  <dd>{number(row.result.points)}</dd>
                </div>
              </dl>
              <Source row={row} />
            </section>
          ))
        )}
      </Card>
      <Card>
        <h2>{t("statistics:rsce")}</h2>
        {stats.rsceProgress.length > 1 && (
          <label className="competition-license">
            {t("statistics:license")}
            <Select
              value={progression?.license ?? ""}
              onChange={(event) => {
                setLicense(event.target.value);
              }}
            >
              {stats.rsceProgress.map((row) => (
                <option key={row.license} value={row.license}>
                  {row.license}
                </option>
              ))}
            </Select>
          </label>
        )}
        {progression && <RsceProgressPanel progress={progression} year={year} />}
        <h3>{t("statistics:progress.annualPoints", { year })}</h3>
        {selectedRuns.length === 0 ? (
          <p>{t("statistics:noRuns")}</p>
        ) : (
          <>
            <p>{t("statistics:scoredTrials", { count: scoredTrials })}</p>
            <p className="competition-source">{t("statistics:officialPointsHelp")}</p>
            <div className="competition-grid">
              {summaries.map((summary) => (
                <section key={summary.discipline}>
                  <h3>
                    {summary.discipline === "AGILITY"
                      ? t("statistics:discipline.AGILITY")
                      : t("statistics:discipline.JUMPING")}
                  </h3>
                  <dl className="competition-metrics competition-awards">
                    <div>
                      <dt>{t("statistics:pointP")}</dt>
                      <dd>{summary.p}</dd>
                    </div>
                    <div>
                      <dt>{t("statistics:pointPV")}</dt>
                      <dd>{summary.pv}</dd>
                    </div>
                    <div>
                      <dt>{t("statistics:pointPA")}</dt>
                      <dd>{summary.pa}</dd>
                    </div>
                    <div>
                      <dt>{t("statistics:runs")}</dt>
                      <dd>{summary.runs}</dd>
                    </div>
                    <div>
                      <dt>{t("statistics:clearRuns")}</dt>
                      <dd>{summary.clearRuns}</dd>
                    </div>
                    <div>
                      <dt>{t("statistics:averageSpeed")}</dt>
                      <dd>{number(summary.averageSpeedMps)}</dd>
                    </div>
                  </dl>
                </section>
              ))}
            </div>
            <label className="competition-check">
              <input
                type="checkbox"
                checked={scoredOnly}
                onChange={(event) => {
                  setScoredOnly(event.target.checked);
                }}
              />
              {t("statistics:scoredOnly")}
            </label>
            {runs.length === 0 ? (
              <p>{t("statistics:noScoredRuns")}</p>
            ) : (
              <ul className="competition-runs">
                {runs.map((row) => (
                  <li key={row.result.key}>
                    <details>
                      <summary>
                        {formats.formatPlainDate(row.result.date ?? "", "dayMonthNumeric")}
                        {" · "}
                        {row.result.trial}
                        {" · "}
                        {row.result.discipline === "JUMPING"
                          ? t("statistics:discipline.JUMPING")
                          : t("statistics:discipline.AGILITY")}
                        {" · "}
                        {row.result.point === "NONE" ? t("statistics:noPoint") : row.result.point}
                      </summary>
                      <p>
                        {row.result.grade}
                        {" · "}
                        {row.result.category}
                        {" · "}
                        {row.result.qualification}
                      </p>
                      <dl className="competition-metrics">
                        <div>
                          <dt>{t("statistics:position")}</dt>
                          <dd>{number(row.result.position)}</dd>
                        </div>
                        <div>
                          <dt>{t("statistics:faults")}</dt>
                          <dd>{number(row.result.faults)}</dd>
                        </div>
                        <div>
                          <dt>{t("statistics:refusals")}</dt>
                          <dd>{number(row.result.refusals)}</dd>
                        </div>
                        <div>
                          <dt>{t("statistics:penalty")}</dt>
                          <dd>{number(row.result.totalPenalty)}</dd>
                        </div>
                        <div>
                          <dt>{t("statistics:time")}</dt>
                          <dd>{number(row.result.timeSeconds)}</dd>
                        </div>
                        <div>
                          <dt>{t("statistics:speed")}</dt>
                          <dd>{number(row.result.speedMps)}</dd>
                        </div>
                      </dl>
                      <Source row={row} />
                    </details>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </Card>
    </>
  );
}

export default function CompetitionStatisticsPage({ client }: { client: ApiClient }) {
  const { t } = useTranslation(["statistics", "errors"]);
  const branding = useBranding();
  const today = new Intl.DateTimeFormat("sv-SE", {
    timeZone: branding.timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const currentYear = Number(today.slice(0, 4));
  const currentSeason = Number(today.slice(5, 7)) >= 9 ? currentYear : currentYear - 1;
  const [dogId, setDogId] = useState("");
  const [year, setYear] = useState(currentYear);
  const [seasonStart, setSeasonStart] = useState(currentSeason);
  const load = useCallback(async () => {
    const { data } = await client.GET("/me/dogs");
    if (data === undefined) throw new Error("Missing dogs response");
    return data.dogs.filter((dog) => dog.status === "ACTIVE");
  }, [client]);
  const dogs = useLoader(load);
  const selected =
    dogs.status === "ready"
      ? (dogs.data.find((dog) => dog.id === dogId) ?? dogs.data[0])
      : undefined;
  const season = `${String(seasonStart)}-${String(seasonStart + 1)}`;
  return (
    <div className="competition-page">
      <h1>{t("statistics:title")}</h1>
      <p>{t("statistics:description")}</p>
      {dogs.status === "loading" ? (
        <p role="status">{t("statistics:loading")}</p>
      ) : dogs.status === "error" ? (
        <Card>
          <p role="alert">{errorText(t, dogs.error)}</p>
          <Button
            onClick={() => {
              dogs.refetch();
            }}
          >
            {t("statistics:retry")}
          </Button>
        </Card>
      ) : selected === undefined ? (
        <Card>
          <p>{t("statistics:noDogs")}</p>
        </Card>
      ) : (
        <>
          <div className="competition-filters">
            <label>
              {t("statistics:dog")}
              <Select
                value={selected.id}
                onChange={(event) => {
                  setDogId(event.target.value);
                }}
              >
                {dogs.data.map((dog) => (
                  <option key={dog.id} value={dog.id}>
                    {dog.name}
                  </option>
                ))}
              </Select>
            </label>
            <label>
              {t("statistics:year")}
              <Select
                value={year}
                onChange={(event) => {
                  setYear(Number(event.target.value));
                }}
              >
                {Array.from({ length: currentYear - 1999 }, (_, index) => currentYear - index).map(
                  (value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ),
                )}
              </Select>
            </label>
            <label>
              {t("statistics:season")}
              <Select
                value={seasonStart}
                onChange={(event) => {
                  setSeasonStart(Number(event.target.value));
                }}
              >
                {Array.from(
                  { length: currentSeason - 1999 },
                  (_, index) => currentSeason - index,
                ).map((value) => (
                  <option
                    key={value}
                    value={value}
                  >{`${String(value)}-${String(value + 1)}`}</option>
                ))}
              </Select>
            </label>
          </div>
          <DogStatistics
            client={client}
            id={selected.id}
            year={year}
            season={season}
            key={`${selected.id}:${String(year)}:${season}`}
          />
        </>
      )}
    </div>
  );
}
