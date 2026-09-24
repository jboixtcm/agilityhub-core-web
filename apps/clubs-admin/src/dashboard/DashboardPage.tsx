import { isApiError, type ApiClient, type components } from "@agilityhub/api-client";
import { useClubFormats } from "@agilityhub/i18n";
import { Badge, BarChart, Button, Card, Icon, Skeleton, Toast } from "@agilityhub/ui";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { mondayOf } from "../planning/shared";

type ApiDashboard = components["schemas"]["Dashboard"];
type ClassOccupancy = Omit<ApiDashboard["kpis"]["classOccupancy"], "percent"> & { percent: number | null };
type Dashboard = Omit<ApiDashboard, "dogsByLevel" | "kpis" | "pendingSignups" | "riskReview"> & {
  dogsByLevel: ApiDashboard["dogsByLevel"] | null;
  kpis: Omit<ApiDashboard["kpis"], "activeMembers" | "classOccupancy" | "pendingSignups" | "trainingBookings"> & {
    activeMembers: ApiDashboard["kpis"]["activeMembers"] | null;
    classOccupancy: ClassOccupancy | null;
    pendingSignups: ApiDashboard["kpis"]["pendingSignups"] | null;
    trainingBookings: ApiDashboard["kpis"]["trainingBookings"] | null;
  };
  pendingSignups: ApiDashboard["pendingSignups"] | null;
  riskReview: ApiDashboard["riskReview"] | null;
};
type RiskItem = NonNullable<ApiDashboard["riskReview"]>["items"][number];

/** The risk card shows at most this many rows; the rest open D4 on the first of them. */
const RISK_ROWS = 6;

function relativeDay(
  date: string,
  today: string,
  formatPlainDate: (value: string, presentation: "weekdayShort") => string,
  t: (key: string) => string,
): string {
  if (date === today) return t("admin-dashboard:risk.today");
  const tomorrow = new Date(`${today}T12:00:00Z`);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  if (date === tomorrow.toISOString().slice(0, 10)) return t("admin-dashboard:risk.tomorrow");
  return formatPlainDate(date, "weekdayShort").replaceAll(/[.,]/gu, "");
}

function sentenceCase(value: string): string {
  return `${value.charAt(0).toLocaleUpperCase()}${value.slice(1)}`;
}

/** «7:30» from a club-local «07:30» (S14 §2 D1). */
function clockTime(value: string): string {
  return value.replace(/^0(?=\d:)/u, "");
}

/** D4 on the week and the class of a risk row (a cancelled class lives under «Anul·lades»). */
function calendarPath(item: RiskItem): string {
  const query = new URLSearchParams({
    classe: item.classSessionId,
    estat: item.status === "CANCELLED" ? "anul·lades" : "actives",
    setmana: mondayOf(item.date),
  });
  return `/calendari?${query.toString()}`;
}

function KpiCard({ detail, label, value }: { detail: string; label: string; value: string | number }) {
  return (
    <Card className="dashboard-kpi">
      <strong>{value}</strong>
      <span>{label}</span>
      <small>{detail}</small>
    </Card>
  );
}

export function DashboardPage({
  client,
  onNavigate = (path) => { window.location.assign(path); },
}: {
  client: ApiClient;
  onNavigate?: (path: string) => void;
}) {
  const { formatDate, formatPlainDate, formatTime } = useClubFormats();
  const { t } = useTranslation(["admin-dashboard", "errors"]);
  const [dashboard, setDashboard] = useState<Dashboard>();
  const [error, setError] = useState<unknown>();
  const [request, setRequest] = useState(0);

  const load = useCallback(() => {
    void client.GET("/dashboard").then(
      (result) => {
        if (result.data === undefined) {
          setError(result.error);
          return;
        }
        setError(undefined);
        setDashboard(result.data);
      },
      (cause: unknown) => { setError(cause); },
    );
  }, [client]);

  useEffect(() => {
    load();
    const refetch = () => { load(); };
    window.addEventListener("focus", refetch);
    return () => { window.removeEventListener("focus", refetch); };
  }, [load, request]);

  if (dashboard === undefined && error === undefined) {
    return (
      <section aria-label={t("admin-dashboard:common.loading")} className="dashboard-page">
        <div className="dashboard-skeletons">
          {[0, 1, 2, 3].map((key) => <Card key={key}><Skeleton label={t("admin-dashboard:common.loading")} /></Card>)}
        </div>
      </section>
    );
  }

  if (dashboard === undefined) {
    return (
      <section className="dashboard-page">
        <Toast tone="danger">{isApiError(error) ? t(`errors:${error.code}`, { defaultValue: t("admin-dashboard:common.error") }) : t("admin-dashboard:common.error")}</Toast>
        <Button onClick={() => { setError(undefined); setRequest((value) => value + 1); }}>{t("admin-dashboard:common.retry")}</Button>
      </section>
    );
  }

  const hour = Number(formatTime(dashboard.generatedAt).split(":")[0] ?? 12);
  const period = hour < 14 ? "morning" : hour < 20 ? "afternoon" : "evening";
  const occupancy = dashboard.kpis.classOccupancy;
  const risk = dashboard.riskReview;
  const delta = dashboard.kpis.activeMembers?.deltaThisMonth ?? 0;
  const warnDays = dashboard.kpis.pendingSignups?.warnDays;
  const signupResult = new URLSearchParams(window.location.search).get("signup");
  // «Dilluns 10 d'agost»: no comma after the weekday (mockup D1).
  const today = sentenceCase(formatPlainDate(dashboard.today, "weekday").replace(/^([^\s,]+),/u, "$1"));
  const hiddenRisk = risk === null ? [] : risk.items.slice(RISK_ROWS);

  return (
    <section className="dashboard-page">
      {signupResult === "validated" ? <Toast tone="success">{t("admin-dashboard:signups.validated")}</Toast> : null}
      {/* R-04-23: a rejected signup with a collected payment still needs a refund from billing. */}
      {signupResult === "rejected-refund" ? <Toast tone="warning">{t("admin-dashboard:signups.refundRequired")}</Toast> : null}
      {error === undefined ? null : <Toast tone="danger">{isApiError(error) ? t(`errors:${error.code}`, { defaultValue: t("admin-dashboard:common.error") }) : t("admin-dashboard:common.error")}</Toast>}
      <h1>{t("admin-dashboard:greeting", { date: today, period })}</h1>
      <div className="dashboard-kpis">
        {dashboard.kpis.activeMembers === null ? null : (
          <KpiCard detail={t("admin-dashboard:kpi.thisMonth", { count: Math.abs(delta), sign: delta > 0 ? "plus" : delta < 0 ? "minus" : "zero" })} label={t("admin-dashboard:kpi.activeMembers")} value={dashboard.kpis.activeMembers.value} />
        )}
        {occupancy === null ? null : (
          <KpiCard detail={`${t("admin-dashboard:kpi.thisWeek")} · ${t("admin-dashboard:kpi.places", { booked: occupancy.booked, capacity: occupancy.capacity })}`} label={t("admin-dashboard:kpi.occupancy")} value={occupancy.percent === null ? t("admin-dashboard:common.empty") : `${String(occupancy.percent)}%`} />
        )}
        {dashboard.kpis.trainingBookings === null ? null : (
          <KpiCard detail={`${t("admin-dashboard:kpi.week")} · ${t("admin-dashboard:kpi.distinctMembers", { count: dashboard.kpis.trainingBookings.distinctMembers })}`} label={t("admin-dashboard:kpi.training")} value={dashboard.kpis.trainingBookings.value} />
        )}
        {dashboard.kpis.pendingSignups === null ? null : (
          <KpiCard detail={t("admin-dashboard:kpi.older", { count: dashboard.kpis.pendingSignups.olderThanWarn, days: dashboard.kpis.pendingSignups.warnDays })} label={t("admin-dashboard:kpi.pending")} value={dashboard.kpis.pendingSignups.value} />
        )}
      </div>

      <div className="dashboard-grid">
        {risk === null ? null : (
          <Card className="dashboard-risk">
            <header><h2><Icon aria-hidden="true" name="warn" /> {t("admin-dashboard:risk.title", { time: clockTime(risk.reviewTime), days: risk.lookaheadDays })}</h2><Badge tone={risk.count > 0 ? "warning" : "neutral"}>{t("admin-dashboard:risk.alerts", { count: risk.count })}</Badge></header>
            {risk.items.length === 0 ? <p>{t("admin-dashboard:risk.empty")}</p> : risk.items.slice(0, RISK_ROWS).map((item) => {
              const day = relativeDay(item.date, dashboard.today, formatPlainDate, t);
              const time = clockTime(item.startTime);
              const names = item.notified.map((person) => `${person.memberFirstName} + ${person.dogName}`).join(", ");
              const gender = item.notified[0]?.gender === "FEMALE" ? "female" : "other";
              const notified = item.notified.length === 0 ? "" : t("admin-dashboard:risk.notified", { count: item.notified.length, gender, names });
              const status = item.status === "WILL_CANCEL"
                ? t("admin-dashboard:risk.status.WILL_CANCEL", { day, time: clockTime(risk.reviewTime) })
                : t(`admin-dashboard:risk.status.${item.status}`);
              return (
                <article className="dashboard-risk__row" key={item.classSessionId}>
                  <a href={calendarPath(item)} onClick={(event) => { event.preventDefault(); onNavigate(calendarPath(item)); }}>
                    <strong>{item.displayDescription}</strong> · {day} {time} · {item.ringName}
                  </a>
                  <span className="dashboard-risk__booked">{t("admin-dashboard:risk.booked", { count: item.booked })}</span>
                  <Badge tone={item.status === "CANCELLED" ? "danger" : item.status === "WILL_CANCEL" ? "neutral" : "warning"}>{status}{notified === "" ? "" : ` · ${notified}`}</Badge>
                </article>
              );
            })}
            {hiddenRisk[0] === undefined ? null : (
              <a className="dashboard-risk__more" href={calendarPath(hiddenRisk[0])} onClick={(event) => { event.preventDefault(); if (hiddenRisk[0] !== undefined) onNavigate(calendarPath(hiddenRisk[0])); }}>
                {t("admin-dashboard:risk.more", { count: hiddenRisk.length })}
              </a>
            )}
          </Card>
        )}

        {dashboard.pendingSignups === null ? null : (
          <Card className="dashboard-signups">
            <header><h2>{t("admin-dashboard:signups.title")}</h2><Badge>{dashboard.pendingSignups.count}</Badge></header>
            {dashboard.pendingSignups.items.length === 0 ? <p>{t("admin-dashboard:signups.empty")}</p> : dashboard.pendingSignups.items.map((signup) => {
              const dogs = signup.dogs.map((dog) => t("admin-dashboard:signups.dog", { breed: dog.breed, isAddDog: String(dog.isAddDog), name: dog.name })).join(", ");
              const title = `${signup.shortName} + ${dogs}`;
              const overdue = warnDays !== undefined && signup.pendingDays > warnDays;
              return (
                <article className="dashboard-signups__row" key={signup.memberId}>
                  <div>
                    <strong>{title}</strong>
                    <small>{signup.planName}{signup.paymentMethodType === undefined ? "" : ` · ${t(`admin-dashboard:signups.payment.${signup.paymentMethodType}`)}`}</small>
                    {/* R-14-05: the submission date turns red past dashboard.pendingSignupAgeWarnDays. */}
                    <small className={overdue ? "dashboard-signups__date dashboard-signups__date--overdue" : "dashboard-signups__date"}>
                      {t("admin-dashboard:signups.submitted", { date: formatDate(signup.submittedAt, "short") })}
                    </small>
                  </div>
                  {(signup.warnings ?? []).includes("ACCOUNT_NOT_PROVIDED") ? <Badge tone="danger">{t("admin-dashboard:signups.accountNotProvided")}</Badge> : null}
                  <Button aria-label={t("admin-dashboard:signups.validateLabel", { name: title })} onClick={() => { onNavigate(`/preinscripcions/${signup.memberId}`); }}>{t("admin-dashboard:signups.validate")}</Button>
                </article>
              );
            })}
          </Card>
        )}
      </div>

      {dashboard.dogsByLevel === null ? null : (
        <Card className="dashboard-chart">
          <header><h2>{t("admin-dashboard:chart.title", { count: dashboard.dogsByLevel.totalActiveDogs })}</h2><small>{t("admin-dashboard:chart.legend", { previous: Math.max(0, dashboard.dogsByLevel.activeDogWeeks - 1) })}</small></header>
          {/* R-14-07 (E35): one column per progression level; `others` is counted, never painted. */}
          <BarChart data={dashboard.dogsByLevel.levels.map((level) => ({ highlighted: level.withRecentBooking, label: level.code, title: level.name, total: level.total }))} highlightedLabel={t("admin-dashboard:chart.recent")} label={t("admin-dashboard:chart.title", { count: dashboard.dogsByLevel.totalActiveDogs })} totalLabel={t("admin-dashboard:chart.total")} valueLabel={(item) => t("admin-dashboard:chart.value", { recent: item.highlighted, total: item.total })} />
        </Card>
      )}
    </section>
  );
}
