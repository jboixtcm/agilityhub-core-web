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
  EmptyState,
  FormField,
  Select,
  Skeleton,
  Textarea,
  useToast,
} from "@agilityhub/ui";
import { useEffect, useMemo, useState, type SyntheticEvent } from "react";
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

export function InactivityPage({
  client,
  navigate = (path) => {
    window.location.assign(path);
  },
}: {
  client: ApiClient;
  navigate?: (path: string) => void;
}) {
  const { t } = useTranslation("inactivity");
  const formats = useClubFormats();
  const toast = useToast();
  const keys = useSubmissionKeys();
  const [context, setContext] = useState<Context>();
  const [loadError, setLoadError] = useState(false);
  const [reload, setReload] = useState(0);
  const [fromMonth, setFromMonth] = useState("");
  const [toMonth, setToMonth] = useState("");
  const [comments, setComments] = useState("");
  const [preview, setPreview] = useState<Preview>();
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<unknown>();

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
        const live = data.periods.find((item) =>
          ["REQUESTED", "APPROVED", "ACTIVE"].includes(item.state),
        );
        setFromMonth(live?.fromMonth ?? data.proposedFromMonth);
        setToMonth(live?.toMonth ?? "");
        setComments(live?.comments ?? "");
      },
      () => {
        if (active) setLoadError(true);
      },
    );
    return () => {
      active = false;
    };
  }, [client, reload]);

  useEffect(() => {
    if (fromMonth === "") return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void client
        .GET("/me/inactivity-periods/preview", {
          params: { query: { fromMonth, ...(toMonth === "" ? {} : { toMonth }) } },
          signal: controller.signal,
        })
        .then(
          ({ data }) => {
            if (data !== undefined) setPreview(data);
          },
          () => undefined,
        );
    }, 300);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [client, fromMonth, toMonth]);

  const live = context?.periods.find((item) =>
    ["REQUESTED", "APPROVED", "ACTIVE"].includes(item.state),
  );
  const starts = useMemo(
    () => monthRange(context?.earliestFromMonth ?? "2026-01"),
    [context?.earliestFromMonth],
  );
  const ends = useMemo(() => (fromMonth === "" ? [] : monthRange(fromMonth)), [fromMonth]);

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
    if (context === undefined || (live?.editable.fromMonth === false && !live.editable.toMonth))
      return;
    const body = {
      fromMonth,
      toMonth: toMonth === "" ? null : toMonth,
      comments: comments.trim() === "" ? null : comments.trim(),
    };
    setPending(true);
    setFailure(undefined);
    try {
      if (live === undefined) {
        await keys.send(JSON.stringify(["inactivity", body]), (key) =>
          client.POST("/me/inactivity-periods", {
            body,
            params: { header: { "Idempotency-Key": key } },
          }),
        );
      } else {
        await client.PATCH("/me/inactivity-periods/{id}", {
          body: { ...body, version: live.version },
          params: { path: { id: live.id } },
        });
      }
      toast.push(t("inactivity:form.saved"), "success");
      navigate("/perfil");
    } catch (cause) {
      setFailure(cause);
      if (isApiError(cause, "STALE_VERSION")) setReload((value) => value + 1);
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
          <p>{t("inactivity:intro", { deadlineDay: context.deadlineDay })}</p>
          <FormField id="inactivity-from" label={t("inactivity:form.fromMonth")}>
            <Select
              disabled={live !== undefined && !live.editable.fromMonth}
              id="inactivity-from"
              onChange={(event) => {
                setFromMonth(event.currentTarget.value);
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
            <Select
              disabled={live !== undefined && !live.editable.toMonth}
              id="inactivity-to"
              onChange={(event) => {
                setToMonth(event.currentTarget.value);
              }}
              value={toMonth}
            >
              <option value="">{t("inactivity:form.openEnd")}</option>
              {ends.map((month) => (
                <option key={month} value={month}>
                  {formats.formatMonthTitle(month)}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField id="inactivity-comments" label={t("inactivity:form.comments")}>
            <Textarea
              id="inactivity-comments"
              maxLength={500}
              onChange={(event) => {
                setComments(event.currentTarget.value);
              }}
              value={comments}
            />
          </FormField>
          {context.fee == null ? null : (
            <Card className="lifecycle-fee">
              <strong>
                {t("inactivity:form.firstMonth", {
                  amount: formats.formatMoney(context.fee.firstMonth.amountMinor / 100),
                })}
              </strong>
              <span>
                {t("inactivity:form.followingMonths", {
                  amount: formats.formatMoney(context.fee.followingMonths.amountMinor / 100),
                })}
              </span>
            </Card>
          )}
          <p className="lifecycle-note">
            {t("inactivity:endNote", { deadlineDay: context.deadlineDay })}
          </p>
          {(preview?.bookingsInside.total ?? 0) > 0 ? (
            <p className="lifecycle-warning">
              {t("inactivity:form.bookingsInside", { count: preview?.bookingsInside.total ?? 0 })}
            </p>
          ) : null}
          {message === undefined ? null : (
            <p className="lifecycle-error" role="alert">
              {message}
            </p>
          )}
          <Button disabled={pending} loading={pending} type="submit">
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
