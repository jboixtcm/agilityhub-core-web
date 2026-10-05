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
  Input,
  Select,
  Skeleton,
  Textarea,
  useBranding,
  useToast,
} from "@agilityhub/ui";
import { useEffect, useState, type SyntheticEvent } from "react";
import { useTranslation } from "react-i18next";

type Context = components["schemas"]["MeLeaveContext"];

export function LeavePage({
  client,
  navigate = (path) => {
    window.location.assign(path);
  },
}: {
  client: ApiClient;
  navigate?: (path: string) => void;
}) {
  const branding = useBranding();
  const formats = useClubFormats();
  const { t } = useTranslation("leave");
  const keys = useSubmissionKeys();
  const toast = useToast();
  const [context, setContext] = useState<Context>();
  const [loadError, setLoadError] = useState(false);
  const [reload, setReload] = useState(0);
  const [date, setDate] = useState("");
  const [reason, setReason] = useState("");
  const [nps, setNps] = useState<number>();
  const [comment, setComment] = useState("");
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<unknown>();
  const [sent, setSent] = useState(false);

  useEffect(() => {
    let active = true;
    void client.GET("/me/leave-requests").then(
      ({ data }) => {
        if (!active) return;
        if (data === undefined) {
          setLoadError(true);
          return;
        }
        setContext(data);
        setDate(data.defaultDate);
        const live = data.requests.find((item) => item.state === "PENDING");
        setReason(live?.reasonKey ?? "");
        setNps(live?.nps ?? undefined);
        setComment(live?.comment ?? "");
      },
      () => {
        if (active) setLoadError(true);
      },
    );
    return () => {
      active = false;
    };
  }, [client, reload]);

  const errorMessage = (() => {
    if (failure === undefined) return undefined;
    if (isApiError(failure, "LEAVE_ALREADY_REQUESTED")) return t("leave:errors.alreadyRequested");
    if (isApiError(failure, "LEAVE_ALREADY_SCHEDULED")) return t("leave:errors.alreadyScheduled");
    if (isApiError(failure, "MEMBER_NOT_ACTIVE")) return t("leave:errors.memberNotActive");
    if (isApiError(failure, "LEAVE_DATE_INVALID")) return t("leave:errors.dateInvalid");
    if (isApiError(failure, "LEAVE_REASON_UNKNOWN")) return t("leave:errors.reasonUnknown");
    return t("leave:errors.generic");
  })();
  const live = context?.requests.find((item) => item.state === "PENDING");

  const submit = async (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (reason === "") {
      setFailure("reason-required");
      return;
    }
    const body = {
      requestedDate: date,
      reasonKey: reason,
      ...(context?.npsEnabled === true && nps !== undefined ? { nps } : {}),
      ...(comment.trim() === "" ? {} : { comment: comment.trim() }),
    };
    setPending(true);
    setFailure(undefined);
    try {
      await keys.send(JSON.stringify(["leave", body]), (key) =>
        client.POST("/me/leave-requests", { body, params: { header: { "Idempotency-Key": key } } }),
      );
      toast.push(t("leave:form.saved"), "success");
      setSent(true);
    } catch (cause) {
      setFailure(cause);
    } finally {
      setPending(false);
    }
  };
  const withdraw = async () => {
    if (live === undefined || !window.confirm(t("leave:form.confirmWithdraw"))) return;
    setPending(true);
    setFailure(undefined);
    try {
      await keys.send(JSON.stringify(["leave-cancel", live.id]), (key) =>
        client.POST("/me/leave-requests/{id}/cancellation", {
          headers: { "Idempotency-Key": key },
          params: { path: { id: live.id } },
        }),
      );
      toast.push(t("leave:form.withdrawn"), "success");
      navigate("/perfil");
    } catch (cause) {
      setFailure(cause);
    } finally {
      setPending(false);
    }
  };

  if (loadError)
    return (
      <div className="lifecycle-page">
        <EmptyState
          action={
            <Button
              onClick={() => {
                setLoadError(false);
                setReload((value) => value + 1);
              }}
            >
              {t("leave:loadError")}
            </Button>
          }
          description={t("leave:loadError")}
          title={t("leave:loadError")}
        />
      </div>
    );
  if (context === undefined)
    return (
      <div className="lifecycle-page">
        <Skeleton height="20rem" label={t("leave:loading")} />
      </div>
    );
  return (
    <div className="lifecycle-page">
      <header className="lifecycle-page__bar">
        <a aria-label={t("leave:back")} href="/perfil">
          ‹
        </a>
        <h1>{t("leave:title")}</h1>
      </header>
      {context.offerInactivity ? (
        <Card className="leave-offer">
          <h2>{t("leave:offer.title")}</h2>
          <p>{t("leave:offer.text")}</p>
          {context.fee == null ? null : (
            <p>
              {t("leave:offer.fee", {
                first: formats.formatMoney(context.fee.firstMonth.amountMinor / 100),
                following: formats.formatMoney(context.fee.followingMonths.amountMinor / 100),
              })}
            </p>
          )}
          <a className="ah-button ah-button--secondary" href="/inactivitat">
            {t("leave:offer.action")}
          </a>
        </Card>
      ) : null}
      {context.plannedLeave == null ? (
        sent ? (
          <Card className="leave-sent" role="status">
            <p>{t("leave:form.footer")}</p>
            <Button
              onClick={() => {
                navigate("/perfil");
              }}
            >
              {t("leave:back")}
            </Button>
          </Card>
        ) : (
          <form className="lifecycle-form" onSubmit={(event) => void submit(event)}>
            <FormField
              {...(date === context.defaultDate
                ? {
                    help: t("leave:form.today", {
                      date: formats.formatPlainDate(context.defaultDate, "long"),
                    }),
                  }
                : {})}
              id="leave-date"
              label={t("leave:form.date")}
            >
              <Input
                aria-invalid={isApiError(failure, "LEAVE_DATE_INVALID") || undefined}
                disabled={live !== undefined}
                id="leave-date"
                min={context.defaultDate}
                onChange={(event) => {
                  setDate(event.currentTarget.value);
                }}
                required
                type="date"
                value={date}
              />
            </FormField>
            {context.fullMonthIfLater && branding.modules.includes("BILLING") ? (
              <p className="lifecycle-note">{t("leave:form.fullMonth")}</p>
            ) : null}
            <FormField
              {...(failure === "reason-required" || isApiError(failure, "LEAVE_REASON_UNKNOWN")
                ? { error: t("leave:errors.reasonUnknown") }
                : {})}
              id="leave-reason"
              label={t("leave:form.reason")}
            >
              <Select
                disabled={live !== undefined}
                id="leave-reason"
                onChange={(event) => {
                  setReason(event.currentTarget.value);
                }}
                required
                value={reason}
              >
                <option value="">{t("leave:form.reasonPlaceholder")}</option>
                {context.reasons.map((item) => (
                  <option key={item.key} value={item.key}>
                    {item.label}
                  </option>
                ))}
              </Select>
            </FormField>
            {context.npsEnabled ? (
              <fieldset className="leave-nps">
                <legend>{t("leave:form.nps")}</legend>
                <div>
                  {Array.from({ length: 11 }, (_, value) => (
                    <button
                      aria-pressed={nps === value}
                      disabled={live !== undefined}
                      key={value}
                      onClick={() => {
                        setNps(value);
                      }}
                      type="button"
                    >
                      {value}
                    </button>
                  ))}
                </div>
              </fieldset>
            ) : null}
            <FormField id="leave-comment" label={t("leave:form.comment")}>
              <Textarea
                disabled={live !== undefined}
                id="leave-comment"
                maxLength={2000}
                onChange={(event) => {
                  setComment(event.currentTarget.value);
                }}
                value={comment}
              />
            </FormField>
            {errorMessage === undefined ? null : (
              <p className="lifecycle-error" role="alert">
                {errorMessage}
              </p>
            )}
            {live === undefined ? (
              <Button disabled={pending} loading={pending} type="submit">
                {t("leave:form.submit")}
              </Button>
            ) : (
              <Button
                disabled={pending}
                onClick={() => void withdraw()}
                type="button"
                variant="danger"
              >
                {t("leave:form.withdraw")}
              </Button>
            )}
            <p className="lifecycle-footer">{t("leave:form.footer")}</p>
          </form>
        )
      ) : (
        <Card className="leave-planned">
          <p>
            {t("leave:plannedLeave", {
              date: formats.formatPlainDate(context.plannedLeave.date, "long"),
            })}
          </p>
        </Card>
      )}
    </div>
  );
}
