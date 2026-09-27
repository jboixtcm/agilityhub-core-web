import { isApiError, type ApiClient, type components } from "@agilityhub/api-client";
import { useClubFormats } from "@agilityhub/i18n";
import { Badge, BarChart, Button, Card, Skeleton, Toast } from "@agilityhub/ui";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { RiskReviewCard } from "./RiskReviewCard";

// S14 §6 sends every disabled block as `null`, and the snapshot declares it (api E5-T16).
type Dashboard = components["schemas"]["Dashboard"];

function sentenceCase(value: string): string {
  return `${value.charAt(0).toLocaleUpperCase()}${value.slice(1)}`;
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
  const delta = dashboard.kpis.activeMembers?.deltaThisMonth ?? 0;
  const warnDays = dashboard.kpis.pendingSignups?.warnDays;
  const signupResult = new URLSearchParams(window.location.search).get("signup");
  // «Dilluns 10 d'agost»: no comma after the weekday (mockup D1).
  const today = sentenceCase(formatPlainDate(dashboard.today, "weekday").replace(/^([^\s,]+),/u, "$1"));

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
        {/* S14 decides whether the block exists (`riskReview: null`); its rows are S15's form A
            (`GET /risk-review`, R-14-06 single source), rendered by the card S14 reuses (E5-W03). */}
        {dashboard.riskReview === null ? null : <RiskReviewCard client={client} onNavigate={onNavigate} />}

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
