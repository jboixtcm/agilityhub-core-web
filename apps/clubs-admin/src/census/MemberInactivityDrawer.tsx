import { isApiError, type ApiClient, type components, useSubmissionKeys } from "@agilityhub/api-client";
import { useClubFormats } from "@agilityhub/i18n";
import { Badge, Button, Checkbox, Drawer, FormField, Input, Modal, Textarea, Toast, useBranding } from "@agilityhub/ui";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

type Period = components["schemas"]["InactivityPeriod"];
type PeriodRow = components["schemas"]["InactivityPeriodListItem"];

function detail(error: unknown, key: string): unknown {
  return isApiError(error) && typeof error.details === "object" && error.details !== null ? (error.details as Record<string, unknown>)[key] : undefined;
}

export function MemberInactivityDrawer({ client, memberId, onChanged, onClose, open }: { client: ApiClient; memberId: string; onChanged: () => void; onClose: () => void; open: boolean }) {
  const { t } = useTranslation(["admin-census", "enums", "errors"]);
  const branding = useBranding();
  const formats = useClubFormats();
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
  const [failure, setFailure] = useState<unknown>();
  const [reload, setReload] = useState(0);

  useEffect(() => {
    if (!open) return undefined;
    let current = true;
    void Promise.all([
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
    ]).then(
      async ([list, parameter, cancellationParameter]) => {
        if (!current) return;
        const nextRows = list.data?.items ?? [];
        setRows(nextRows);
        const live = nextRows.find((item) => item.state === "REQUESTED" || item.state === "APPROVED" || item.state === "ACTIVE");
        if (live !== undefined) {
          const result = await client.GET("/inactivity-periods/{id}", {
            params: { path: { id: live.id } },
          });
          // The second read can finish after the drawer closed.
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
        if (current) setLoading(false);
      },
      (error: unknown) => {
        if (current) {
          setFailure(error);
          setLoading(false);
        }
      },
    );
    return () => {
      current = false;
    };
  }, [client, memberId, open, reload]);

  useEffect(() => {
    if (!open) keys.drop(memberId);
  }, [keys, memberId, open]);

  const submit = async (signature: string, write: (key: string) => Promise<unknown>, onSuccess?: (result: unknown) => void) => {
    setPending(true);
    setFailure(undefined);
    try {
      const result = await keys.send(signature, write, memberId);
      onSuccess?.(result);
      setReload((value) => value + 1);
      onChanged();
    } catch (error) {
      setFailure(error);
      if (isApiError(error, "STALE_VERSION")) setReload((value) => value + 1);
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
    } finally {
      setPending(false);
    }
  };
  const errorMessage = useMemo(() => {
    if (failure === undefined) return undefined;
    if (isApiError(failure, "INACTIVITY_DEADLINE_PASSED")) {
      const earliestMonth = detail(failure, "earliestMonth");
      return t("admin-census:inactivity.errors.deadline", {
        month: typeof earliestMonth === "string" ? earliestMonth : "",
      });
    }
    if (isApiError(failure, "INACTIVITY_OVERLAP")) return t("admin-census:inactivity.errors.overlap");
    if (isApiError(failure, "INACTIVITY_NOT_APPLICABLE")) return t("admin-census:inactivity.notApplicable");
    return isApiError(failure) ? t(`errors:${failure.code}`, { defaultValue: t("admin-census:common.genericError") }) : t("admin-census:common.genericError");
  }, [failure, t]);

  return (
    <Drawer closeLabel={t("admin-census:common.close")} onClose={onClose} open={open} title={t("admin-census:inactivity.title")}>
      {loading ? <p role="status">{t("admin-census:common.loading")}</p> : null}
      {isApiError(failure, "INACTIVITY_NOT_APPLICABLE") ? (
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
                    first: formats.formatMoney(period.feeSnapshot.firstMonth.amountMinor / 100),
                    following: formats.formatMoney(period.feeSnapshot.followingMonths.amountMinor / 100),
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

          {(period?.state === "APPROVED" || period?.state === "ACTIVE") && !editing ? (
            <Button
              onClick={() => {
                setEditing(true);
              }}
              variant="secondary"
            >
              {t("admin-census:inactivity.modify")}
            </Button>
          ) : null}

          {period === undefined || editing ? (
            <form
              className="census-record__form"
              onSubmit={(event) => {
                event.preventDefault();
                const body = {
                  comments: comments.trim() === "" ? null : comments,
                  fromMonth,
                  overrideDeadline,
                  toMonth: toMonth === "" ? null : toMonth,
                };
                if (period === undefined) {
                  void submitUnkeyed(() =>
                    client.POST("/inactivity-periods", {
                      body: { memberId, ...body },
                    }),
                  );
                } else {
                  void submitUnkeyed(() =>
                    client.PATCH("/inactivity-periods/{id}", {
                      body: { ...body, version: period.version },
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
          setConfirmApprove(false);
        }}
        open={confirmApprove}
        title={t("admin-census:inactivity.approveConfirmTitle")}
      >
        <p>{cancelBookings ? t("admin-census:inactivity.approveConfirmCancel") : t("admin-census:inactivity.approveConfirmKeep")}</p>
        <div className="census-record__dialog-actions">
          <Button
            onClick={() => {
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
                      : t("admin-census:inactivity.noCancellationToast"),
                  );
                },
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
