import { type ApiClient, type components, isApiError } from "@agilityhub/api-client";
import { useClubFormats } from "@agilityhub/i18n";
import { Button, Card, Input, Select, Textarea } from "@agilityhub/ui";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import "./statistics.css";

type Preview = components["schemas"]["CompetitionPreview"];
type Receipt = components["schemas"]["CompetitionReceipt"];
type ImportRequest = components["schemas"]["CompetitionImportRequest"];
const CSV_HEADER =
  "license,dogName,trialId,runId,date,trial,grade,category,discipline,position,faults,refusals,totalPenalty,timeSeconds,speedMps,qualification,point";
const PAGE_SIZE = 25;

export default function CompetitionImportsPage({ client }: { client: ApiClient }) {
  const { t } = useTranslation(["statistics", "errors"]);
  const formats = useClubFormats();
  const [source, setSource] = useState<ImportRequest["source"]>("FCAG");
  const [sourceUrl, setSourceUrl] = useState("");
  const [content, setContent] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [assignments, setAssignments] = useState<Record<string, string>>({});
  const [history, setHistory] = useState<Receipt[]>([]);
  const [expanded, setExpanded] = useState<string>();
  const [visibleSources, setVisibleSources] = useState(PAGE_SIZE);
  const groups = useMemo(() => {
    const days = new Map<
      string,
      { date: string; source: Receipt["source"]; receipts: Receipt[]; results: number }
    >();
    for (const receipt of history) {
      const date = formats.formatDate(receipt.importedAt, "short");
      const key = date + receipt.source;
      const group = days.get(key) ?? { date, source: receipt.source, receipts: [], results: 0 };
      group.receipts.push(receipt);
      group.results += receipt.importedRows;
      days.set(key, group);
    }
    return Array.from(days.entries());
  }, [history, formats]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState<unknown>(null);
  const [refresh, setRefresh] = useState(0);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState<Receipt | null>(null);
  const [page, setPage] = useState(0);
  const [showAll, setShowAll] = useState(false);
  const [accepted, setAccepted] = useState(false);
  // Keep a write's key across a transport failure; a changed payload gets a new key.
  const submission = useRef<{ payload: string; key: string } | null>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const keyFor = (payload: unknown) => {
    const text = JSON.stringify(payload);
    if (submission.current?.payload !== text)
      submission.current = { payload: text, key: crypto.randomUUID() };
    return submission.current.key;
  };
  const message = (cause: unknown) => {
    if (cause === "FILE_TOO_LARGE") return t("statistics:fileTooLarge");
    if (isApiError(cause)) {
      if (cause.code === "VALIDATION_ERROR") {
        const details = cause.details as { reason?: string } | undefined;
        return details?.reason === "SOURCE_AUTH_REQUIRED"
          ? t("statistics:sourceAuthRequired")
          : t("statistics:invalidImport");
      }
      return t(`errors:${cause.code}`, { defaultValue: t("errors:INTERNAL_ERROR") });
    }
    return t("errors:INTERNAL_ERROR");
  };
  useEffect(() => {
    let active = true;
    void client
      .GET("/competition-imports")
      .then(({ data }) => {
        if (!active) return;
        if (data === undefined) throw new Error("Missing import history");
        setHistory(data);
        setHistoryLoading(false);
      })
      .catch((cause: unknown) => {
        if (active) {
          setHistoryError(cause);
          setHistoryLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [client, refresh]);
  async function prepare(request: ImportRequest) {
    if (busy) return;
    // The public gateway also bounds the JSON envelope, including escaped source text.
    if (new TextEncoder().encode(JSON.stringify(request)).length > 2_000_000) {
      setError("FILE_TOO_LARGE");
      return;
    }
    setBusy(true);
    setError(null);
    setSuccess(null);
    setPreview(null);
    try {
      const { data } = await client.POST("/competition-imports/preview", {
        params: { header: { "Idempotency-Key": keyFor(["preview", request]) } },
        body: request,
      });
      if (data === undefined) throw new Error("Missing preview");
      if (!mounted.current) return;
      setPreview(data);
      setPage(0);
      setShowAll(false);
      setAccepted(false);
      setAssignments(
        Object.fromEntries(
          data.rows
            .filter((row) => row.suggestedDogId != null)
            .map((row) => [row.entry.key, row.suggestedDogId ?? ""]),
        ),
      );
    } catch (cause) {
      if (mounted.current) setError(cause);
    } finally {
      if (mounted.current) setBusy(false);
    }
  }
  async function confirm() {
    if (preview === null || busy || !accepted) return;
    setBusy(true);
    setError(null);
    try {
      const selected = Object.fromEntries(
        Object.entries(assignments).filter(([, dog]) => dog !== ""),
      );
      const { data } = await client.POST("/competition-imports/{id}/confirm", {
        params: {
          path: { id: preview.id },
          header: { "Idempotency-Key": keyFor(["confirm", preview.id, selected]) },
        },
        body: { assignments: selected },
      });
      if (data === undefined) throw new Error("Missing receipt");
      if (!mounted.current) return;
      setSuccess(data);
      setPreview(null);
      setContent("");
      setHistoryLoading(true);
      setHistoryError(null);
      setRefresh((value) => value + 1);
      submission.current = null;
    } catch (cause) {
      if (mounted.current) setError(cause);
    } finally {
      if (mounted.current) setBusy(false);
    }
  }
  const selectedCount = Object.values(assignments).filter(Boolean).length;
  const rows = preview?.rows.filter((row) => showAll || row.match !== "UNMATCHED") ?? [];
  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  return (
    <div className="competition-admin">
      <h1>{t("statistics:adminTitle")}</h1>
      <p>{t("statistics:adminDescription")}</p>
      {error === null ? null : <p role="alert">{message(error)}</p>}
      {success === null ? null : (
        <p role="status">{t("statistics:saved", { count: success.importedRows })}</p>
      )}
      <Card>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void prepare({ source, sourceUrl, ...(content.trim() ? { content } : {}) });
          }}
        >
          <fieldset disabled={busy || preview !== null} className="competition-import-form">
            <legend>{t("statistics:newImport")}</legend>
            <label>
              {t("statistics:provider")}
              <Select
                value={source}
                onChange={(event) => {
                  setSource(event.target.value as ImportRequest["source"]);
                  setContent("");
                  setSourceUrl("");
                  setError(null);
                }}
              >
                <option value="FCAG">{t("statistics:fcag")}</option>
                <option value="FLOW_AGILITY">{t("statistics:flow")}</option>
              </Select>
            </label>
            <label>
              {t("statistics:sourceUrl")}
              <Input
                required
                type="url"
                value={sourceUrl}
                onChange={(event) => {
                  setSourceUrl(event.target.value);
                }}
              />
            </label>
            <p>{source === "FCAG" ? t("statistics:fcagHelp") : t("statistics:flowHelp")}</p>
            {source === "FLOW_AGILITY" ? (
              <a
                href={`data:text/csv;charset=utf-8,${encodeURIComponent(`${CSV_HEADER}\n`)}`}
                download="competition-results.csv"
              >
                {t("statistics:template")}
              </a>
            ) : null}
            <label>
              {t("statistics:file")}
              <Input
                type="file"
                accept={
                  source === "FCAG" ? ".html,.htm,text/html" : ".html,.htm,.csv,text/html,text/csv"
                }
                key={source}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file === undefined) return;
                  if (file.size > 2_000_000) {
                    setContent("");
                    setError("FILE_TOO_LARGE");
                    return;
                  }
                  setBusy(true);
                  setError(null);
                  void file
                    .text()
                    .then((text) => {
                      if (mounted.current) setContent(text);
                    })
                    .catch((cause: unknown) => {
                      if (mounted.current) setError(cause);
                    })
                    .finally(() => {
                      if (mounted.current) setBusy(false);
                    });
                }}
              />
            </label>
            <label>
              {t("statistics:content")}
              <Textarea
                rows={6}
                value={content}
                onChange={(event) => {
                  setContent(event.target.value);
                }}
              />
            </label>
            <Button type="submit" loading={busy}>
              {t("statistics:preview")}
            </Button>
          </fieldset>
        </form>
      </Card>
      {preview === null ? null : (
        <Card>
          <h2>{t("statistics:review")}</h2>
          <p>
            {preview.season}
            {" · "}
            {t("statistics:selection", { selected: selectedCount, total: preview.rows.length })}
          </p>
          <p>{t("statistics:matchingHelp")}</p>
          <label className="competition-admin-check">
            <input
              type="checkbox"
              checked={showAll}
              disabled={busy}
              onChange={(event) => {
                setShowAll(event.target.checked);
                setPage(0);
              }}
            />
            {t("statistics:showUnmatched")}
          </label>
          {rows.length === 0 ? (
            <p>{t("statistics:noMatches")}</p>
          ) : (
            <div className="competition-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th scope="col">{t("statistics:dog")}</th>
                    <th scope="col">{t("statistics:license")}</th>
                    <th scope="col">{t("statistics:result")}</th>
                    <th scope="col">{t("statistics:assignment")}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE).map((row) => (
                    <tr key={row.entry.key}>
                      <td>
                        {row.entry.dogName}
                        <small>{row.entry.handlerName}</small>
                        <small>{row.entry.clubName}</small>
                      </td>
                      <td>{row.entry.license}</td>
                      <td>
                        {row.entry.division ?? row.entry.trial}
                        {" · "}
                        {row.entry.category}
                        <small>
                          {row.entry.points ?? row.entry.point}
                          {" · "}
                          {row.entry.position ?? t("statistics:unknown")}
                        </small>
                      </td>
                      <td>
                        <Select
                          aria-label={t("statistics:assignDog", {
                            dog: row.entry.dogName,
                            license: row.entry.license,
                          })}
                          disabled={busy}
                          value={assignments[row.entry.key] ?? ""}
                          onChange={(event) => {
                            setAssignments((old) => ({
                              ...old,
                              [row.entry.key]: event.target.value,
                            }));
                            setAccepted(false);
                          }}
                        >
                          <option value="">{t("statistics:skip")}</option>
                          {preview.dogs.map((dog) => (
                            <option
                              key={dog.id}
                              value={dog.id}
                            >{`${dog.name} · ${dog.license}`}</option>
                          ))}
                        </Select>
                        <small>
                          {row.match === "EXACT_LICENSE"
                            ? t("statistics:match.EXACT_LICENSE")
                            : row.match === "AMBIGUOUS_LICENSE"
                              ? t("statistics:match.AMBIGUOUS_LICENSE")
                              : t("statistics:match.UNMATCHED")}
                        </small>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="competition-admin-actions">
            <Button
              variant="secondary"
              disabled={page === 0 || busy}
              onClick={() => {
                setPage((value) => value - 1);
              }}
            >
              {t("statistics:previous")}
            </Button>
            <span>{t("statistics:page", { page: page + 1, total: pages })}</span>
            <Button
              variant="secondary"
              disabled={page + 1 >= pages || busy}
              onClick={() => {
                setPage((value) => value + 1);
              }}
            >
              {t("statistics:next")}
            </Button>
          </div>
          <label className="competition-admin-check">
            <input
              type="checkbox"
              checked={accepted}
              disabled={busy}
              onChange={(event) => {
                setAccepted(event.target.checked);
              }}
            />
            {t("statistics:replaceWarning")}
          </label>
          <div className="competition-admin-actions">
            <Button
              disabled={!accepted || selectedCount === 0}
              loading={busy}
              onClick={() => {
                void confirm();
              }}
            >
              {t("statistics:confirm")}
            </Button>
            <Button
              disabled={busy}
              variant="secondary"
              onClick={() => {
                setPreview(null);
                setError(null);
                submission.current = null;
              }}
            >
              {t("statistics:edit")}
            </Button>
          </div>
        </Card>
      )}
      <Card>
        <h2>{t("statistics:history")}</h2>
        {historyLoading ? (
          <p role="status">{t("statistics:loading")}</p>
        ) : historyError !== null ? (
          <>
            <p role="alert">{message(historyError)}</p>
            <Button
              onClick={() => {
                setHistoryLoading(true);
                setHistoryError(null);
                setRefresh((value) => value + 1);
              }}
            >
              {t("statistics:retry")}
            </Button>
          </>
        ) : history.length === 0 ? (
          <p>{t("statistics:noHistory")}</p>
        ) : (
          <ul className="competition-import-history">
            {groups.map(([key, group]) => (
              <li key={key}>
                <Button
                  variant="secondary"
                  aria-expanded={expanded === key}
                  onClick={() => {
                    setExpanded(expanded === key ? undefined : key);
                    setVisibleSources(PAGE_SIZE);
                  }}
                >
                  {t("statistics:historyDay", {
                    date: group.date,
                    source: t(group.source === "FCAG" ? "statistics:fcag" : "statistics:flow"),
                    sources: group.receipts.length,
                    results: group.results,
                  })}
                </Button>
                {expanded === key && (
                  <>
                    <ul>
                      {group.receipts.slice(0, visibleSources).map((receipt) => (
                        <li key={receipt.id}>
                          <a href={receipt.sourceUrl} rel="noopener noreferrer" target="_blank">
                            {receipt.source === "FCAG"
                              ? t("statistics:fcag")
                              : t("statistics:flow")}
                            {" · "}
                            {receipt.season}
                          </a>
                          <p>
                            {t("statistics:importedAt", {
                              date: formats.formatDate(receipt.importedAt, "dayMonthNumeric"),
                            })}
                            {" · "}
                            {t("statistics:saved", { count: receipt.importedRows })}
                          </p>
                          {receipt.source === "FCAG" ||
                          receipt.sourceUrl.includes("/zone/prints/run/") ? (
                            <Button
                              disabled={busy || preview !== null}
                              variant="secondary"
                              onClick={() => {
                                setSource(receipt.source);
                                setSourceUrl(receipt.sourceUrl);
                                setContent("");
                                void prepare({
                                  source: receipt.source,
                                  sourceUrl: receipt.sourceUrl,
                                });
                              }}
                            >
                              {t("statistics:refreshSource")}
                            </Button>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                    {visibleSources < group.receipts.length && (
                      <Button
                        variant="secondary"
                        onClick={() => { setVisibleSources((n) => n + PAGE_SIZE); }}
                      >
                        {t("statistics:moreSources")}
                      </Button>
                    )}
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
