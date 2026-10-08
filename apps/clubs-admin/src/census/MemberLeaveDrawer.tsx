import { isApiError, isInProgress, type ApiClient, type components, useSubmissionKeys } from "@agilityhub/api-client";
import { useClubFormats } from "@agilityhub/i18n";
import { Badge, Button, Drawer, FormField, Input, Modal, Select, Textarea, Toast, useBranding } from "@agilityhub/ui";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { clubToday, formatMoney, useBillingLocale } from "../billing/shared";

type Member = components["schemas"]["Member"];
type Leave = components["schemas"]["LeaveRequest"];
type LeaveRow = components["schemas"]["LeaveRequestListItem"];
type Plan = components["schemas"]["Plan"];
type Price = components["schemas"]["Price"];

function parameterReasons(value: unknown, language: string): { key: string; label: string }[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (typeof entry !== "object" || entry === null) return [];
    const item = entry as Record<string, unknown>;
    if (typeof item.key !== "string") return [];
    if (item.audience !== "MEMBER" && item.audience !== "ADMIN") return [];
    if (typeof item.label === "string") return [{ key: item.key, label: item.label }];
    if (typeof item.label !== "object" || item.label === null) return [];
    const labels = item.label as Record<string, unknown>;
    const label = labels[language] ?? labels.ca;
    return typeof label === "string" ? [{ key: item.key, label }] : [];
  });
}

export function MemberLeaveDrawer({ client, member, onChanged, onClose, onErased, open }: { client: ApiClient; member: Member; onChanged: (member?: Member) => void; onClose: () => void; onErased: () => void; open: boolean }) {
  const branding = useBranding();
  const formats = useClubFormats();
  const { i18n, t } = useTranslation(["admin-census", "common", "enums", "errors"]);
  const billingLocale = useBillingLocale();
  const keys = useSubmissionKeys();
  const [rows, setRows] = useState<LeaveRow[]>([]);
  const [request, setRequest] = useState<Leave>();
  const [reasons, setReasons] = useState<{ key: string; label: string }[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [prices, setPrices] = useState<Price[]>([]);
  const [effectiveDate, setEffectiveDate] = useState("");
  const [reasonKey, setReasonKey] = useState("");
  const [note, setNote] = useState("");
  const [planId, setPlanId] = useState(member.planId ?? "");
  const [priceId, setPriceId] = useState(member.priceId ?? "");
  const [nextInvoiceDate, setNextInvoiceDate] = useState(member.nextInvoiceDate ?? "");
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [confirmDirect, setConfirmDirect] = useState(false);
  const [reactivationOpen, setReactivationOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [loading, setLoading] = useState(open);
  const [failure, setFailure] = useState<unknown>();
  const [success, setSuccess] = useState<string>();
  const [reload, setReload] = useState(0);
  const [erased, setErased] = useState(false);
  const billing = branding.modules.includes("BILLING");

  useEffect(() => {
    if (!open) return undefined;
    let current = true;
    void (async () => {
      try {
        const [list, parameter] = await Promise.all([
          client.GET("/leave-requests", {
        params: {
          query: {
            fields: "member,requestedDate,effectiveDate,reasonKey,source,state,nps,requestedAt,comment",
            filter: [`memberId:eq:${member.id}`],
            page: 0,
            size: 20,
            sort: ["requestedAt,desc"],
          },
        },
          }),
          client.GET("/parameters/{key}", { params: { path: { key: "leave.reasons" } } }),
        ] as const);
        // The promise may settle after the drawer has closed.
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        if (!current) return;
        const nextRows = list.data?.items ?? [];
        setRows(nextRows);
        setReasons(parameterReasons(parameter.data?.value, i18n.resolvedLanguage ?? "ca"));
        const pendingRow = nextRows.find((row) => row.state === "PENDING");
        if (pendingRow !== undefined) {
          const detail = await client.GET("/leave-requests/{id}", {
            params: { path: { id: pendingRow.id } },
          });
          // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
          if (current && detail.data !== undefined) {
            setRequest(detail.data);
            setEffectiveDate(detail.data.requestedDate);
          }
        } else {
          setRequest(undefined);
          setEffectiveDate("");
        }
        if (billing && member.status === "LEFT") {
          const planResult = await client.GET("/plans", {
            params: { query: { includeInactive: false } },
          });
          // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
          if (current) setPlans((planResult.data?.items ?? []) as Plan[]);
        }
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        if (current) setLoading(false);
      } catch (error: unknown) {
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        if (current) {
          setFailure(error);
          if (isApiError(error, "MEMBER_ERASED")) {
            setErased(true);
            onErased();
          }
          setLoading(false);
        }
      }
    })();
    return () => {
      current = false;
    };
  }, [billing, client, i18n.resolvedLanguage, member.id, member.status, onErased, open, reload]);

  useEffect(() => {
    if (!open) keys.drop(member.id);
  }, [keys, member.id, open]);

  useEffect(() => {
    if (!billing || member.status !== "LEFT" || planId === "") {
      return undefined;
    }
    let current = true;
    void client.GET("/prices", { params: { query: { planId } } }).then(
      (result) => { if (current) setPrices(result.data?.items ?? []); },
      (cause: unknown) => { if (current) setFailure(cause); },
    );
    return () => {
      current = false;
    };
  }, [billing, client, member.status, planId]);

  const run = async (signature: string, write: (key: string) => Promise<{ data?: unknown }>, onSuccess?: (data: unknown) => void) => {
    setPending(true);
    setFailure(undefined);
    try {
      const result = await keys.send(signature, write, member.id);
      onSuccess?.(result.data);
      setReload((value) => value + 1);
      onChanged(result.data as Member | undefined);
      setConfirmCancel(false);
      setConfirmDirect(false);
      setReactivationOpen(false);
    } catch (error) {
      setFailure(error);
      if (isApiError(error, "MEMBER_ERASED")) {
        setErased(true);
        setConfirmCancel(false);
        setConfirmDirect(false);
        setReactivationOpen(false);
        onErased();
      }
    } finally {
      setPending(false);
    }
  };
  const errorMessage = useMemo(() => {
    if (failure === undefined) return undefined;
    if (isInProgress(failure)) return t("common:inProgress");
    if (isApiError(failure, "LEAVE_DATE_INVALID")) return t("admin-census:leave.errors.dateInvalid");
    return isApiError(failure) ? t(`errors:${failure.code}`, { defaultValue: t("admin-census:common.genericError") }) : t("admin-census:common.genericError");
  }, [failure, t]);
  const plannedSource = rows.find((row) => row.effectiveDate === member.leaveDate)?.source;
  const today = clubToday(branding.timeZone);
  const modalOpen = confirmCancel || confirmDirect || reactivationOpen;

  return (
    <Drawer closeLabel={t("admin-census:common.close")} onClose={onClose} open={open} title={t("admin-census:leave.title")}>
      {loading ? <p role="status">{t("admin-census:common.loading")}</p> : null}
      {erased ? (
        <><p role="alert">{t("errors:MEMBER_ERASED")}</p><Button onClick={onClose} variant="ghost">{t("admin-census:common.cancel")}</Button></>
      ) : member.status === "LEFT" ? (
        <Button
          onClick={() => {
            setFailure(undefined);
            setReactivationOpen(true);
          }}
        >
          {t("admin-census:reactivation.action")}
        </Button>
      ) : (
        <>
          {member.leaveDate == null ? null : (
            <section className="census-record__fieldset">
              <h3>
                {t("admin-census:leave.planned", {
                  date: formats.formatPlainDate(member.leaveDate),
                })}
              </h3>
              {plannedSource === undefined ? null : <Badge>{t(`enums:leaveSource.${plannedSource}`)}</Badge>}
              <Button
                disabled={pending}
                onClick={() => {
                  setFailure(undefined);
                  setConfirmCancel(true);
                }}
                variant="secondary"
              >
                {t("admin-census:leave.cancelPlanned")}
              </Button>
            </section>
          )}
          {request?.state === "PENDING" ? (
            <section className="census-record__form">
              <h3>{t("admin-census:leave.pending")}</h3>
              <p>
                {formats.formatPlainDate(request.requestedDate)} · {request.reason ?? request.reasonKey ?? t("admin-census:values.empty")}
              </p>
              {request.nps == null ? null : <p>{t("admin-census:leave.nps", { value: request.nps })}</p>}
              {request.comment == null ? null : <p>{request.comment}</p>}
              <FormField {...(isApiError(failure, "LEAVE_DATE_INVALID") && errorMessage !== undefined ? { error: errorMessage } : {})} id="leave-effective-date" label={t("admin-census:leave.effectiveDate")}>
                <Input
                  id="leave-effective-date"
                  min={today}
                  onChange={(event) => {
                    setEffectiveDate(event.currentTarget.value);
                  }}
                  required
                  type="date"
                  value={effectiveDate}
                />
              </FormField>
              <FormField id="leave-decision-note" label={t("admin-census:leave.note")}>
                <Textarea
                  id="leave-decision-note"
                  maxLength={500}
                  onChange={(event) => {
                    setNote(event.currentTarget.value);
                  }}
                  value={note}
                />
              </FormField>
              <div className="census-record__dialog-actions">
                <Button
                  disabled={pending}
                  onClick={() =>
                    void run(JSON.stringify({ id: request.id, decision: "DENIED", note }), (key) =>
                      client.POST("/leave-requests/{id}/decision", {
                        body: { decision: "DENIED", ...(note.trim() === "" ? {} : { note }) },
                        headers: { "Idempotency-Key": key },
                        params: { path: { id: request.id } },
                      }),
                    )
                  }
                  variant="secondary"
                >
                  {t("admin-census:leave.deny")}
                </Button>
                <Button
                  loading={pending}
                  onClick={() =>
                    void run(
                      JSON.stringify({ id: request.id, decision: "APPROVED", effectiveDate, note }),
                      (key) =>
                        client.POST("/leave-requests/{id}/decision", {
                          body: {
                            decision: "APPROVED",
                            effectiveDate,
                            ...(note.trim() === "" ? {} : { note }),
                          },
                          headers: { "Idempotency-Key": key },
                          params: { path: { id: request.id } },
                        }),
                      (data) => {
                        setSuccess(
                          t("admin-census:leave.cancelledToast", {
                            count: (data as Leave | undefined)?.cancelledBookings.length ?? 0,
                          }),
                        );
                      },
                    )
                  }
                >
                  {t("admin-census:leave.approve")}
                </Button>
              </div>
            </section>
          ) : (
            <form
              className="census-record__form"
              onSubmit={(event) => {
                event.preventDefault();
                setFailure(undefined);
                setConfirmDirect(true);
              }}
            >
              <h3>{t("admin-census:leave.direct")}</h3>
              <p className="census-record__warning">{t("admin-census:leave.directWarning")}</p>
              <FormField {...(isApiError(failure, "LEAVE_DATE_INVALID") && errorMessage !== undefined ? { error: errorMessage } : {})} id="direct-leave-date" label={t("admin-census:leave.effectiveDate")}>
                <Input
                  id="direct-leave-date"
                  min={today}
                  onChange={(event) => {
                    setEffectiveDate(event.currentTarget.value);
                  }}
                  required
                  type="date"
                  value={effectiveDate}
                />
              </FormField>
              <FormField id="direct-leave-reason" label={t("admin-census:leave.reason")}>
                <Select
                  id="direct-leave-reason"
                  onChange={(event) => {
                    setReasonKey(event.currentTarget.value);
                  }}
                  value={reasonKey}
                >
                  <option value="">{t("admin-census:common.choose")}</option>
                  {reasons.map((reason) => (
                    <option key={reason.key} value={reason.key}>
                      {reason.label}
                    </option>
                  ))}
                </Select>
              </FormField>
              <FormField id="direct-leave-note" label={t("admin-census:leave.note")}>
                <Textarea
                  id="direct-leave-note"
                  maxLength={500}
                  onChange={(event) => {
                    setNote(event.currentTarget.value);
                  }}
                  value={note}
                />
              </FormField>
              <Button loading={pending} type="submit">
                {t("admin-census:leave.confirm")}
              </Button>
            </form>
          )}
        </>
      )}
      {erased || modalOpen || errorMessage === undefined || isApiError(failure, "LEAVE_DATE_INVALID") ? null : <p role="alert">{errorMessage}</p>}
      {success === undefined ? null : (
        <Toast
          dismissLabel={t("admin-census:common.close")}
          onDismiss={() => {
            setSuccess(undefined);
          }}
          tone="success"
        >
          {success}
        </Toast>
      )}
      <Modal
        closeLabel={t("admin-census:common.close")}
        onClose={() => { setConfirmDirect(false); }}
        open={!erased && confirmDirect}
        title={t("admin-census:leave.confirm")}
      >
        <p>{t("admin-census:leave.directWarning")}</p>
        {errorMessage === undefined ? null : <p role="alert">{errorMessage}</p>}
        <div className="census-record__dialog-actions">
          <Button onClick={() => { setConfirmDirect(false); }} variant="ghost">{t("admin-census:common.cancel")}</Button>
          <Button loading={pending} onClick={() => {
            void run(
              JSON.stringify({ memberId: member.id, effectiveDate, reasonKey, note }),
              (key) => client.POST("/members/{id}/leave", {
                body: {
                  effectiveDate,
                  ...(reasonKey === "" ? {} : { reasonKey }),
                  ...(note.trim() === "" ? {} : { note }),
                },
                headers: { "Idempotency-Key": key },
                params: { path: { id: member.id } },
              }),
              (data) => {
                setSuccess(t("admin-census:leave.cancelledToast", { count: (data as Leave | undefined)?.cancelledBookings.length ?? 0 }));
              },
            );
          }}>{t("admin-census:leave.confirm")}</Button>
        </div>
      </Modal>
      <Modal
        closeLabel={t("admin-census:common.close")}
        onClose={() => {
          setConfirmCancel(false);
        }}
        open={!erased && confirmCancel}
        title={t("admin-census:leave.cancelPlanned")}
      >
        <p>{t("admin-census:leave.cancelPlannedConfirm")}</p>
        {errorMessage === undefined ? null : <p role="alert">{errorMessage}</p>}
        <div className="census-record__dialog-actions">
          <Button
            onClick={() => {
              setConfirmCancel(false);
            }}
            variant="ghost"
          >
            {t("admin-census:common.cancel")}
          </Button>
          <Button
            loading={pending}
            onClick={() =>
              void run(
                JSON.stringify({ memberId: member.id, cancelPlanned: true }),
                (key) =>
                  client.DELETE("/members/{id}/planned-leave", {
                    params: { header: { "Idempotency-Key": key }, path: { id: member.id } },
                  }),
                () => {
                  setSuccess(t("admin-census:leave.cancelledPlannedToast"));
                },
              )
            }
          >
            {t("admin-census:leave.cancelPlanned")}
          </Button>
        </div>
      </Modal>
      <Modal
        closeLabel={t("admin-census:common.close")}
        onClose={() => {
          setReactivationOpen(false);
        }}
        open={!erased && reactivationOpen}
        title={t("admin-census:reactivation.title")}
      >
        <form
          className="census-record__form"
          onSubmit={(event) => {
            event.preventDefault();
            const body = billing ? { planId, priceId, nextInvoiceDate } : {};
            void run(
              JSON.stringify({ memberId: member.id, ...body }),
              (key) =>
                client.POST("/members/{id}/reactivation", {
                  body,
                  headers: { "Idempotency-Key": key },
                  params: { path: { id: member.id } },
                }),
              () => {
                setSuccess(t("admin-census:reactivation.success"));
              },
            );
          }}
        >
          <p>{t("admin-census:reactivation.description")}</p>
          {errorMessage === undefined ? null : <p role="alert">{errorMessage}</p>}
          {billing ? (
            <>
              <FormField id="reactivation-plan" label={t("admin-census:reactivation.plan")}>
                <Select
                  id="reactivation-plan"
                  onChange={(event) => {
                    setPlanId(event.currentTarget.value);
                    setPriceId("");
                    setPrices([]);
                  }}
                  required
                  value={planId}
                >
                  <option value="">{t("admin-census:common.choose")}</option>
                  {plans.map((plan) => (
                    <option key={plan.id} value={plan.id}>
                      {plan.name}
                    </option>
                  ))}
                </Select>
              </FormField>
              <FormField id="reactivation-price" label={t("admin-census:reactivation.price")}>
                <Select
                  id="reactivation-price"
                  onChange={(event) => {
                    setPriceId(event.currentTarget.value);
                  }}
                  required
                  value={priceId}
                >
                  <option value="">{t("admin-census:common.choose")}</option>
                  {prices.map((price) => (
                    <option key={price.id} value={price.id}>
                      {formatMoney(price.amount, billingLocale)}
                    </option>
                  ))}
                </Select>
              </FormField>
              <FormField id="reactivation-invoice-date" label={t("admin-census:reactivation.nextInvoiceDate")}>
                <Input
                  id="reactivation-invoice-date"
                  min={today}
                  onChange={(event) => {
                    setNextInvoiceDate(event.currentTarget.value);
                  }}
                  required
                  type="date"
                  value={nextInvoiceDate}
                />
              </FormField>
            </>
          ) : null}
          <Button loading={pending} type="submit">
            {t("admin-census:reactivation.action")}
          </Button>
        </form>
      </Modal>
    </Drawer>
  );
}
