import {
  isApiError,
  type ApiClient,
  type components,
  useSubmissionKeys,
} from "@agilityhub/api-client";
import { useClubFormats } from "@agilityhub/i18n";
import {
  Button,
  Card,
  Checkbox,
  EmptyState,
  FormField,
  Input,
  Select,
  Skeleton,
  Textarea,
  useToast,
} from "@agilityhub/ui";
import { useEffect, useMemo, useRef, useState, type SyntheticEvent } from "react";
import { useTranslation } from "react-i18next";

type Context = components["schemas"]["MeInactivityContext"];
type Preview = components["schemas"]["InactivityPreview"];

function monthRange(start: string, count = 13): string[] {
  const [year, month] = start.split("-").map(Number);
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(Date.UTC(year ?? 0, (month ?? 1) - 1 + index, 1));
    return `${String(date.getUTCFullYear()).padStart(4, "0")}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
  });
}

function includeMonths(months: string[], ...required: (null | string | undefined)[]): string[] {
  return [...new Set([...months, ...required.filter((month): month is string => month != null)])].sort();
}

function livePeriod(context: Context | undefined, selectedId: null | string) {
  const live = context?.periods.filter((item) =>
    ["REQUESTED", "APPROVED", "ACTIVE"].includes(item.state),
  );
  return selectedId === null ? live?.[0] : live?.find((item) => item.id === selectedId);
}

export function InactivityPage({
  client,
  navigate = (path) => {
    window.location.assign(path);
  },
}: {
  client: ApiClient;
  navigate?: (path: string) => void;
}) {
  const { t } = useTranslation(["inactivity", "billing"]);
  const formats = useClubFormats();
  const toast = useToast();
  const keys = useSubmissionKeys();
  const [context, setContext] = useState<Context>();
  const [loadError, setLoadError] = useState(false);
  const [reload, setReload] = useState(0);
  const [fromMonth, setFromMonth] = useState("");
  const [toMonth, setToMonth] = useState("");
  const [comments, setComments] = useState("");
  const [previewResult, setPreviewResult] = useState<{
    data?: Preview;
    failed: boolean;
    key: string;
  }>();
  const [previewRetryKey, setPreviewRetryKey] = useState<string>();
  const [previewReload, setPreviewReload] = useState(0);
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<unknown>();
  const [selectedPeriodId, setSelectedPeriodId] = useState<null | string>(() =>
    new URLSearchParams(window.location.search).get("periodId"),
  );
  const baseline = useRef<{ comments: string; fromMonth: string; toMonth: string }>(undefined);
  const rebaseAfterStale = useRef(false);

  useEffect(() => {
    let active = true;
    void client.GET("/me/inactivity-periods").then(
      ({ data }) => {
        if (!active) return;
        if (data === undefined) {
          setLoadError(true);
          return;
        }
        setContext(data);
        const live = livePeriod(data, selectedPeriodId);
        const loaded = {
          comments: live?.comments ?? "",
          fromMonth: live?.fromMonth ?? data.proposedFromMonth,
          toMonth: live?.toMonth ?? "",
        };
        // After a 409 STALE_VERSION refetch, only the member's own edits (the fields that differ
        // from the version they started from) are kept on top of the new version, and only where
        // the new version still lets them edit; everything else takes the api's values.
        const previous = rebaseAfterStale.current ? baseline.current : undefined;
        rebaseAfterStale.current = false;
        baseline.current = loaded;
        const rebase = (field: keyof typeof loaded, editable: boolean) => (current: string) =>
          previous !== undefined && live !== undefined && editable && current !== previous[field]
            ? current
            : loaded[field];
        setFromMonth(rebase("fromMonth", live?.editable.fromMonth ?? false));
        setToMonth(rebase("toMonth", live?.editable.toMonth ?? false));
        setComments(rebase("comments", live !== undefined && live.state !== "ACTIVE"));
      },
      () => {
        if (active) setLoadError(true);
      },
    );
    return () => {
      active = false;
    };
  }, [client, reload, selectedPeriodId]);

  useEffect(() => {
    if (fromMonth === "") return;
    const requestKey = `${fromMonth}:${toMonth}`;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void client
        .GET("/me/inactivity-periods/preview", {
          params: { query: { fromMonth, ...(toMonth === "" ? {} : { toMonth }) } },
          signal: controller.signal,
        })
        .then(
          ({ data }) => {
            if (data !== undefined && !controller.signal.aborted) {
              setPreviewResult({ data, failed: false, key: requestKey });
              setPreviewRetryKey(undefined);
            }
          },
          () => {
            if (!controller.signal.aborted) {
              setPreviewResult({ failed: true, key: requestKey });
              setPreviewRetryKey(undefined);
            }
          },
        );
    }, 300);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [client, fromMonth, previewReload, toMonth]);

  const live = livePeriod(context, selectedPeriodId);
  const starts = useMemo(
    () =>
      includeMonths(
        monthRange(context?.earliestFromMonth ?? "2026-01"),
        live?.fromMonth,
      ),
    [context?.earliestFromMonth, live?.fromMonth],
  );
  const previewKey = fromMonth === "" ? undefined : `${fromMonth}:${toMonth}`;
  const currentPreview =
    previewResult !== undefined && previewResult.key === previewKey && !previewResult.failed
      ? previewResult.data
      : undefined;
  const currentPreviewFailed =
    previewResult !== undefined && previewResult.key === previewKey && previewResult.failed;
  const currentPreviewRetrying = previewRetryKey === previewKey;
  const currentPreviewReady = currentPreview !== undefined;
  const displayedFee = live === undefined ? context?.fee : live.fee;

  const overlap = isApiError(failure, "INACTIVITY_OVERLAP");

  const message = (() => {
    if (failure === undefined || context === undefined) return undefined;
    if (isApiError(failure, "INACTIVITY_DEADLINE_PASSED")) {
      const details = failure.details as Record<string, unknown>;
      const earliest =
        typeof details.earliestMonth === "string"
          ? details.earliestMonth
          : context.earliestFromMonth;
      return t("inactivity:errors.deadlinePassed", {
        deadlineDay: context.deadlineDay,
        month: formats.formatMonthTitle(earliest),
      });
    }
    if (isApiError(failure, "INACTIVITY_OVERLAP")) return t("inactivity:errors.overlap");
    if (isApiError(failure, "INACTIVITY_INVALID_RANGE")) return t("inactivity:errors.invalidRange");
    if (isApiError(failure, "MEMBER_NOT_ACTIVE")) return t("inactivity:errors.memberNotActive");
    if (isApiError(failure, "LEAVE_ALREADY_SCHEDULED"))
      return t("inactivity:errors.leaveScheduled");
    if (isApiError(failure, "STALE_VERSION")) return t("inactivity:errors.stale");
    return t("inactivity:errors.generic");
  })();

  const submit = async (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (context === undefined || !currentPreviewReady || currentPreviewFailed) return;
    const normalizedTo = toMonth === "" ? null : toMonth;
    const normalizedComments = comments.trim() === "" ? null : comments.trim();
    const request = {
      fromMonth,
      toMonth: normalizedTo,
      comments: normalizedComments,
    };
    setPending(true);
    setFailure(undefined);
    try {
      if (live === undefined) {
        await keys.send(JSON.stringify(["inactivity", request]), (key) =>
          client.POST("/me/inactivity-periods", {
            body: request,
            params: { header: { "Idempotency-Key": key } },
          }),
        );
      } else {
        const body: components["schemas"]["InactivityPatchRequest"] = {
          version: live.version,
        };
        if (live.editable.fromMonth && fromMonth !== live.fromMonth) body.fromMonth = fromMonth;
        if (live.editable.toMonth && normalizedTo !== live.toMonth) body.toMonth = normalizedTo;
        if (live.state !== "ACTIVE" && normalizedComments !== live.comments) {
          body.comments = normalizedComments;
        }
        await client.PATCH("/me/inactivity-periods/{id}", {
          body,
          params: { path: { id: live.id } },
        });
      }
      toast.push(t("inactivity:form.saved"), "success");
      navigate("/perfil");
    } catch (cause) {
      setFailure(cause);
      if (isApiError(cause, "STALE_VERSION")) {
        rebaseAfterStale.current = true;
        setReload((value) => value + 1);
      } else if (isApiError(cause, "INACTIVITY_OVERLAP")) {
        const details = cause.details as Record<string, unknown>;
        setSelectedPeriodId(typeof details.periodId === "string" ? details.periodId : null);
        setReload((value) => value + 1);
      }
    } finally {
      setPending(false);
    }
  };
  const withdraw = async () => {
    if (live === undefined || !window.confirm(t("inactivity:form.confirmWithdraw"))) return;
    setPending(true);
    setFailure(undefined);
    try {
      await keys.send(JSON.stringify(["inactivity-cancel", live.id]), (key) =>
        client.POST("/me/inactivity-periods/{id}/cancellation", {
          headers: { "Idempotency-Key": key },
          params: { path: { id: live.id } },
        }),
      );
      toast.push(t("inactivity:form.withdrawn"), "success");
      navigate("/perfil");
    } catch (cause) {
      setFailure(cause);
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="lifecycle-page">
      <header className="lifecycle-page__bar">
        <a aria-label={t("inactivity:back")} href="/perfil">
          ‹
        </a>
        <h1>{t("inactivity:title")}</h1>
      </header>
      {loadError ? (
        <EmptyState
          action={
            <Button
              onClick={() => {
                setLoadError(false);
                setReload((value) => value + 1);
              }}
            >
              {t("inactivity:loadError")}
            </Button>
          }
          description={t("inactivity:loadError")}
          title={t("inactivity:loadError")}
        />
      ) : context === undefined ? (
        <Skeleton height="20rem" label={t("inactivity:loading")} />
      ) : (
        <form className="lifecycle-form" onSubmit={(event) => void submit(event)}>
          <p className="lifecycle-intro">
            {t("inactivity:intro", { deadlineDay: context.deadlineDay })}
          </p>
          <FormField id="inactivity-from" label={t("inactivity:form.fromMonth")}>
            <Select
              disabled={live !== undefined && !live.editable.fromMonth}
              id="inactivity-from"
              onChange={(event) => {
                const next = event.currentTarget.value;
                setFromMonth(next);
                setToMonth((current) => (current !== "" && current < next ? "" : current));
              }}
              value={fromMonth}
            >
              {starts.map((month) => (
                <option key={month} value={month}>
                  {formats.formatMonthTitle(month)}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField id="inactivity-to" label={t("inactivity:form.toMonth")}>
            <Input
              disabled={live !== undefined && !live.editable.toMonth}
              id="inactivity-to"
              min={fromMonth}
              onChange={(event) => {
                setToMonth(event.currentTarget.value);
              }}
              type="month"
              value={toMonth}
            />
          </FormField>
          <label className="lifecycle-open-end" htmlFor="inactivity-open-end">
            <Checkbox
              checked={toMonth === ""}
              disabled={live !== undefined && !live.editable.toMonth}
              id="inactivity-open-end"
              onChange={(event) => {
                setToMonth(event.currentTarget.checked ? "" : fromMonth);
              }}
            />
            <span>{t("inactivity:form.openEnd")}</span>
          </label>
          <FormField id="inactivity-comments" label={t("inactivity:form.comments")}>
            <Textarea
              disabled={live?.state === "ACTIVE"}
              id="inactivity-comments"
              maxLength={500}
              onChange={(event) => {
                setComments(event.currentTarget.value);
              }}
              value={comments}
            />
          </FormField>
          {displayedFee == null ? null : (
            <Card className="lifecycle-fee">
              <div>
                <span>{t("inactivity:form.firstMonth")}</span>
                <strong>{formats.formatMoney(displayedFee.firstMonth.amountMinor / 100)}</strong>
              </div>
              <div>
                <span>{t("inactivity:form.followingMonths")}</span>
                <strong>
                  {t("inactivity:form.perMonth", {
                    amount: formats.formatMoney(displayedFee.followingMonths.amountMinor / 100),
                  })}
                </strong>
              </div>
            </Card>
          )}
          <p className="lifecycle-note">
            {t("inactivity:endNote", { deadlineDay: context.deadlineDay })}
          </p>
          {(currentPreview?.bookingsInside.total ?? 0) > 0 ? (
            <p className="lifecycle-warning">
              {t("inactivity:form.bookingsInside", {
                count: currentPreview?.bookingsInside.total ?? 0,
              })}
            </p>
          ) : null}
          {currentPreviewFailed ? (
            <div className="lifecycle-error" role="alert">
              <p>{t("inactivity:loadError")}</p>
              <Button
                disabled={currentPreviewRetrying}
                loading={currentPreviewRetrying}
                onClick={() => {
                  setPreviewRetryKey(previewKey);
                  setPreviewReload((value) => value + 1);
                }}
                type="button"
                variant="secondary"
              >
                {t("billing:retry")}
              </Button>
            </div>
          ) : null}
          {message === undefined ? null : (
            <p className="lifecycle-error" role="alert">
              {overlap ? (
                <a
                  href={
                    selectedPeriodId === null
                      ? "/inactivitat"
                      : `/inactivitat?periodId=${encodeURIComponent(selectedPeriodId)}`
                  }
                >
                  {message}
                </a>
              ) : (
                message
              )}
            </p>
          )}
          <Button
            disabled={
              pending || !currentPreviewReady || currentPreviewFailed || currentPreviewRetrying
            }
            loading={pending}
            type="submit"
          >
            {live === undefined ? t("inactivity:form.submit") : t("inactivity:form.modify")}
          </Button>
          {live?.editable.cancel === true ? (
            <Button
              disabled={pending}
              onClick={() => void withdraw()}
              type="button"
              variant="danger"
            >
              {t("inactivity:form.withdraw")}
            </Button>
          ) : null}
        </form>
      )}
    </div>
  );
}
