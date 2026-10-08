import { isApiError, isInProgress, type ApiClient, type components, useSubmissionKeys } from "@agilityhub/api-client";
import { useClubFormats } from "@agilityhub/i18n";
import { Badge, Button, Checkbox, Drawer, FormField, Input, Modal, Textarea, Toast, useBranding } from "@agilityhub/ui";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { formatMoney, useBillingLocale } from "../billing/shared";

type Period = components["schemas"]["InactivityPeriod"];
type PeriodRow = components["schemas"]["InactivityPeriodListItem"];

function detail(error: unknown, key: string): unknown {
  return isApiError(error) && typeof error.details === "object" && error.details !== null ? (error.details as Record<string, unknown>)[key] : undefined;
}

export function MemberInactivityDrawer({ client, initialPeriodId, memberId, onChanged, onClose, onErased, open }: { client: ApiClient; initialPeriodId?: string; memberId: string; onChanged: () => void; onClose: () => void; onErased: () => void; open: boolean }) {
  const { t } = useTranslation(["admin-census", "common", "enums", "errors"]);
  const branding = useBranding();
  const formats = useClubFormats();
  const billingLocale = useBillingLocale();
  const keys = useSubmissionKeys();
  const [rows, setRows] = useState<PeriodRow[]>([]);
  const [period, setPeriod] = useState<Period>();
  const [deadlineDay, setDeadlineDay] = useState(25);
  const [cancelBookings, setCancelBookings] = useState(true);
  const [fromMonth, setFromMonth] = useState("");
  const [toMonth, setToMonth] = useState("");
  const [comments, setComments] = useState("");
  const [overrideDeadline, setOverrideDeadline] = useState(false);
  const [note, setNote] = useState("");
  const [pending, setPending] = useState(false);
  const [loading, setLoading] = useState(open);
  const [editing, setEditing] = useState(false);
  const [confirmApprove, setConfirmApprove] = useState(false);
  const [success, setSuccess] = useState<string>();
  const [readFailure, setReadFailure] = useState<unknown>();
  const [failure, setFailure] = useState<unknown>();
  const [modalFailure, setModalFailure] = useState<unknown>();
  const [reload, setReload] = useState(0);
  const [erased, setErased] = useState(false);
  const [notApplicable, setNotApplicable] = useState(false);

  useEffect(() => {
    if (!open) return undefined;
    let current = true;
    void (async () => {
      try {
        const [list, parameter, cancellationParameter, overview, plansResult] = await Promise.all([
          client.GET("/inactivity-periods", {
        params: {
          query: {
            fields: "member,fromMonth,toMonth,state,origin,requestedAt,comments,decision,feeSnapshot",
            filter: [`memberId:eq:${memberId}`],
            page: 0,
            size: 20,
            sort: ["fromMonth,desc"],
          },
        },
          }),
          client.GET("/parameters/{key}", {
        params: { path: { key: "inactivity.requestDeadlineDay" } },
          }),
          client.GET("/parameters/{key}", {
        params: { path: { key: "inactivity.cancelBookingsOnApproval" } },
          }),
          client.GET("/members/{id}/overview", { params: { path: { id: memberId } } }),
          client.GET("/plans", { params: { query: { includeInactive: false } } }),
        ]);
        // The promise may settle after the drawer has closed.
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        if (!current) return;
        const nextRows = list.data?.items ?? [];
        setRows(nextRows);
        const planId = overview.data?.member.planId;
        const memberPlan = (plansResult.data?.items ?? []).find((plan) => plan.id === planId);
        const blockedByPlan = memberPlan?.type === "PACK" || memberPlan?.type === "SINGLE_CLASS";
        setNotApplicable(blockedByPlan);
        const live = initialPeriodId === undefined
          ? nextRows.find((item) => item.state === "REQUESTED" || item.state === "APPROVED" || item.state === "ACTIVE")
          : nextRows.find((item) => item.id === initialPeriodId) ?? { id: initialPeriodId };
        if (!blockedByPlan && live !== undefined) {
          const result = await client.GET("/inactivity-periods/{id}", {
            params: { path: { id: live.id } },
          });
          // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
          if (current && result.data !== undefined) {
            setPeriod(result.data);
            setFromMonth(result.data.fromMonth);
            setToMonth(result.data.toMonth ?? "");
            setComments(result.data.comments ?? "");
            setEditing(false);
          }
        } else {
          setPeriod(undefined);
          setFromMonth("");
          setToMonth("");
          setComments("");
        }
        if (typeof parameter.data?.value === "number") setDeadlineDay(parameter.data.value);
        if (typeof cancellationParameter.data?.value === "boolean") {
          setCancelBookings(cancellationParameter.data.value);
        }
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        if (current) {
          setReadFailure(undefined);
          setLoading(false);
        }
      } catch (error: unknown) {
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        if (current) {
          setReadFailure(error);
          if (isApiError(error, "INACTIVITY_NOT_APPLICABLE")) setNotApplicable(true);
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
  }, [client, initialPeriodId, memberId, onErased, open, reload]);

  useEffect(() => {
    if (!open) keys.drop(memberId);
  }, [keys, memberId, open]);

  const submit = async (signature: string, write: (key: string) => Promise<unknown>, onSuccess?: (result: unknown) => void, errorInModal = false) => {
    setPending(true);
    setFailure(undefined);
    setModalFailure(undefined);
    try {
      const result = await keys.send(signature, write, memberId);
      onSuccess?.(result);
      setReload((value) => value + 1);
      onChanged();
    } catch (error) {
      if (errorInModal) setModalFailure(error);
      else setFailure(error);
      if (isApiError(error, "STALE_VERSION")) setReload((value) => value + 1);
      if (isApiError(error, "MEMBER_ERASED")) {
        setErased(true);
        setConfirmApprove(false);
        onErased();
      }
    } finally {
      setPending(false);
    }
  };
  const submitUnkeyed = async (write: () => Promise<unknown>) => {
    setPending(true);
    setFailure(undefined);
    try {
      await write();
      setReload((value) => value + 1);
      onChanged();
    } catch (error) {
      setFailure(error);
      if (isApiError(error, "STALE_VERSION")) setReload((value) => value + 1);
      if (isApiError(error, "MEMBER_ERASED")) {
        setErased(true);
        setConfirmApprove(false);
        onErased();
      }
    } finally {
      setPending(false);
    }
  };
  const errorMessage = useMemo(() => {
    const visibleFailure = failure ?? readFailure;
    if (visibleFailure === undefined) return undefined;
    if (isInProgress(visibleFailure)) return t("common:inProgress");
    if (isApiError(visibleFailure, "INACTIVITY_DEADLINE_PASSED")) {
      const earliestMonth = detail(visibleFailure, "earliestMonth");
      return t("admin-census:inactivity.errors.deadline", {
        month: typeof earliestMonth === "string" ? earliestMonth : "",
      });
    }
    if (isApiError(visibleFailure, "INACTIVITY_OVERLAP")) return t("admin-census:inactivity.errors.overlap");
    if (isApiError(visibleFailure, "INACTIVITY_NOT_APPLICABLE")) return t("admin-census:inactivity.notApplicable");
    return isApiError(visibleFailure) ? t(`errors:${visibleFailure.code}`, { defaultValue: t("admin-census:common.genericError") }) : t("admin-census:common.genericError");
  }, [failure, readFailure, t]);
  const modalErrorMessage = useMemo(() => {
    if (modalFailure === undefined) return undefined;
    if (isInProgress(modalFailure)) return t("common:inProgress");
    return isApiError(modalFailure)
      ? t(`errors:${modalFailure.code}`, { defaultValue: t("admin-census:common.genericError") })
      : t("admin-census:common.genericError");
  }, [modalFailure, t]);
  const closeDrawer = () => {
    setFailure(undefined);
    setReadFailure(undefined);
    setModalFailure(undefined);
    setConfirmApprove(false);
    onClose();
  };

  return (
    <Drawer closeLabel={t("admin-census:common.close")} onClose={closeDrawer} open={open} title={t("admin-census:inactivity.title")}>
      {loading ? <p role="status">{t("admin-census:common.loading")}</p> : null}
      {erased ? (
        <><p role="alert">{t("errors:MEMBER_ERASED")}</p><Button onClick={onClose} variant="ghost">{t("admin-census:common.cancel")}</Button></>
      ) : notApplicable || isApiError(readFailure, "INACTIVITY_NOT_APPLICABLE") ? (
        <p role="alert">{t("admin-census:inactivity.notApplicable")}</p>
      ) : (
        <>
          {period === undefined ? null : (
            <section className="census-record__fieldset">
              <h3>{t("admin-census:inactivity.current")}</h3>
              <p>
                <Badge>{t(`enums:inactivityState.${period.state}`)}</Badge> · {formats.formatMonthTitle(period.fromMonth)} · {period.toMonth === null || period.toMonth === undefined ? t("admin-census:inactivity.openEnded") : formats.formatMonthTitle(period.toMonth)}
              </p>
              {period.comments == null ? null : <p>{period.comments}</p>}
              {!branding.modules.includes("BILLING") || period.feeSnapshot == null ? null : (
                <p className="census-record__muted">
                  {t("admin-census:inactivity.feeSnapshot", {
                    first: formatMoney(period.feeSnapshot.firstMonth, billingLocale),
                    following: formatMoney(period.feeSnapshot.followingMonths, billingLocale),
                  })}
                </p>
              )}
              <p className="census-record__muted">
                {t("admin-census:inactivity.cancelledBookings", {
                  count: period.cancelledBookings.length,
                })}
              </p>
              {period.cancelledBookings.length === 0 ? null : (
                <ul className="census-record__history">
                  {(["CLASS", "WAITLIST", "TRAINING", "ACTIVITY"] as const).map((type) => {
                    const count = period.cancelledBookings.filter((booking) => booking.type === type).length;
                    return count === 0 ? null : (
                      <li key={type}>
                        {t("admin-census:inactivity.bookingBreakdown", {
                          count,
                          type: t(`enums:cancelledBookingType.${type}`),
                        })}
                      </li>
                    );
                  })}
                </ul>
              )}
              {period.history.length === 0 ? null : (
                <ul className="census-record__history">
                  {period.history.map((entry) => (
                    <li key={`${entry.at}-${entry.fromMonth}`}>
                      {formats.formatDateTime(entry.at)} · {formats.formatMonthTitle(entry.fromMonth)} · {entry.toMonth == null ? t("admin-census:inactivity.openEnded") : formats.formatMonthTitle(entry.toMonth)}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          {period?.state === "REQUESTED" ? (
            <section className="census-record__form">
              <FormField id="inactivity-decision-note" label={t("admin-census:inactivity.note")}>
                <Textarea
                  id="inactivity-decision-note"
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
                    void submit(JSON.stringify({ id: period.id, decision: "DENIED", note }), (key) =>
                      client.POST("/inactivity-periods/{id}/decision", {
                        body: { decision: "DENIED", ...(note.trim() === "" ? {} : { note }) },
                        headers: { "Idempotency-Key": key },
                        params: { path: { id: period.id } },
                      }),
                    )
                  }
                  variant="secondary"
                >
                  {t("admin-census:inactivity.deny")}
                </Button>
                <Button
                  loading={pending}
                  onClick={() => {
                    setConfirmApprove(true);
                  }}
                >
                  {t("admin-census:inactivity.approve")}
                </Button>
              </div>
            </section>
          ) : null}

          {(period?.state === "APPROVED" || period?.state === "ACTIVE") && !editing && Object.values(period.editable).some(Boolean) ? (
            <Button
              onClick={() => {
                setEditing(true);
              }}
              variant="secondary"
            >
              {t("admin-census:inactivity.modify")}
            </Button>
          ) : null}

          {!loading && readFailure === undefined && (period === undefined || editing) ? (
            <form
              className="census-record__form"
              onSubmit={(event) => {
                event.preventDefault();
                if (period === undefined) {
                  const body = {
                    comments: comments.trim() === "" ? null : comments,
                    fromMonth,
                    overrideDeadline,
                    toMonth: toMonth === "" ? null : toMonth,
                  };
                  void submitUnkeyed(() =>
                    client.POST("/inactivity-periods", {
                      body: { memberId, ...body },
                    }),
                  );
                } else {
                  const body: components["schemas"]["AdminInactivityPatchRequest"] = {
                    ...(period.editable.fromMonth ? { fromMonth } : {}),
                    ...(period.editable.toMonth ? { toMonth: toMonth === "" ? null : toMonth } : {}),
                    ...(period.state === "ACTIVE" ? {} : { comments: comments.trim() === "" ? null : comments }),
                    ...(overrideDeadline ? { overrideDeadline: true } : {}),
                    version: period.version,
                  };
                  void submitUnkeyed(() =>
                    client.PATCH("/inactivity-periods/{id}", {
                      body,
                      params: { path: { id: period.id } },
                    }),
                  );
                }
              }}
            >
              <h3>{period === undefined ? t("admin-census:inactivity.new") : t("admin-census:inactivity.modify")}</h3>
              <FormField id="inactivity-from" label={t("admin-census:inactivity.fromMonth")}>
                <Input
                  id="inactivity-from"
                  onChange={(event) => {
                    setFromMonth(event.currentTarget.value);
                  }}
                  disabled={period !== undefined && !period.editable.fromMonth}
                  required
                  type="month"
                  value={fromMonth}
                />
              </FormField>
              <FormField id="inactivity-to" label={t("admin-census:inactivity.toMonth")}>
                <Input
                  id="inactivity-to"
                  onChange={(event) => {
                    setToMonth(event.currentTarget.value);
                  }}
                  disabled={period !== undefined && !period.editable.toMonth}
                  type="month"
                  value={toMonth}
                />
              </FormField>
              <FormField id="inactivity-comments" label={t("admin-census:inactivity.comments")}>
                <Textarea
                  id="inactivity-comments"
                  maxLength={500}
                  onChange={(event) => {
                    setComments(event.currentTarget.value);
                  }}
                  disabled={period?.state === "ACTIVE"}
                  value={comments}
                />
              </FormField>
              <label className="census-record__check-row">
                <Checkbox
                  checked={overrideDeadline}
                  onChange={(event) => {
                    setOverrideDeadline(event.currentTarget.checked);
                    if (event.currentTarget.checked && isApiError(failure, "INACTIVITY_DEADLINE_PASSED")) setFailure(undefined);
                  }}
                />
                {t("admin-census:inactivity.overrideDeadline", { day: deadlineDay })}
              </label>
              <Button loading={pending} type="submit">
                {period === undefined ? t("admin-census:inactivity.createApprove") : t("admin-census:common.save")}
              </Button>
            </form>
          ) : null}

          {period?.state === "ACTIVE" ? (
            <Button
              disabled={pending || toMonth === ""}
              onClick={() =>
                void submit(JSON.stringify({ id: period.id, toMonth }), (key) =>
                  client.POST("/inactivity-periods/{id}/termination", {
                    body: { toMonth },
                    headers: { "Idempotency-Key": key },
                    params: { path: { id: period.id } },
                  }),
                )
              }
              variant="secondary"
            >
              {t("admin-census:inactivity.terminate")}
            </Button>
          ) : period?.state === "APPROVED" ? (
            <Button
              disabled={pending}
              onClick={() =>
                void submit(JSON.stringify({ id: period.id, cancel: true }), (key) =>
                  client.POST("/inactivity-periods/{id}/cancellation", {
                    body: note.trim() === "" ? {} : { note },
                    headers: { "Idempotency-Key": key },
                    params: { path: { id: period.id } },
                  }),
                )
              }
              variant="secondary"
            >
              {t("admin-census:common.cancel")}
            </Button>
          ) : null}

          {errorMessage === undefined ? null : (
            <div role="alert">
              <p>{errorMessage}</p>
              {isApiError(failure, "INACTIVITY_OVERLAP") && detail(failure, "periodId") !== undefined ? <a href={`/inactivitats?period=${String(detail(failure, "periodId"))}`}>{t("admin-census:inactivity.errors.openExisting")}</a> : null}
            </div>
          )}
          {rows.length > 1 ? (
            <section>
              <h3>{t("admin-census:inactivity.history")}</h3>
              <ul className="census-record__history">
                {rows.map((row) => (
                  <li key={row.id}>
                    {row.fromMonth ?? "—"} · {row.toMonth ?? "—"} · {row.state === undefined ? "—" : t(`enums:inactivityState.${row.state}`)}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
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
        </>
      )}
      <Modal
        closeLabel={t("admin-census:common.close")}
        onClose={() => {
          setModalFailure(undefined);
          setConfirmApprove(false);
        }}
        open={!erased && confirmApprove}
        title={t("admin-census:inactivity.approveConfirmTitle")}
      >
        <p>
          {cancelBookings
            ? period?.bookingsInside == null
              ? t("admin-census:inactivity.approveConfirmCancel")
              : t("admin-census:inactivity.approveConfirmCancelCount", { count: period.bookingsInside })
            : t("admin-census:inactivity.approveConfirmKeep")}
        </p>
        {modalErrorMessage === undefined ? null : <p role="alert">{modalErrorMessage}</p>}
        <div className="census-record__dialog-actions">
          <Button
            onClick={() => {
              setModalFailure(undefined);
              setConfirmApprove(false);
            }}
            variant="ghost"
          >
            {t("admin-census:common.cancel")}
          </Button>
          <Button
            loading={pending}
            onClick={() => {
              if (period?.state !== "REQUESTED") return;
              void submit(
                JSON.stringify({ id: period.id, decision: "APPROVED", note }),
                (key) =>
                  client.POST("/inactivity-periods/{id}/decision", {
                    body: { decision: "APPROVED", ...(note.trim() === "" ? {} : { note }) },
                    headers: { "Idempotency-Key": key },
                    params: { path: { id: period.id } },
                  }),
                (result) => {
                  const data = (result as { data?: Period }).data;
                  setConfirmApprove(false);
                  setSuccess(
                    cancelBookings
                      ? t("admin-census:inactivity.cancelledToast", {
                          count: data?.cancelledBookings.length ?? 0,
                        })
                      : t("admin-census:inactivity.noCancellationToast", { count: data?.bookingsInside ?? 0 }),
                  );
                },
                true,
              );
            }}
          >
            {t("admin-census:inactivity.approve")}
          </Button>
        </div>
      </Modal>
    </Drawer>
  );
}
