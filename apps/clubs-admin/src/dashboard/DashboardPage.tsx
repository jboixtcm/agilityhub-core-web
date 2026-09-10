import { isApiError, type ApiClient, type components } from "@agilityhub/api-client";
import { useClubFormats } from "@agilityhub/i18n";
import { Badge, BarChart, Button, Card, Skeleton, Toast } from "@agilityhub/ui";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

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

function relativeDay(
  date: string,
  today: string,
  formatDate: (value: string, presentation: "weekdayShort") => string,
  t: (key: string) => string,
): string {
  if (date === today) return t("admin-dashboard:risk.today");
  const tomorrow = new Date(`${today}T12:00:00Z`);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  if (date === tomorrow.toISOString().slice(0, 10)) return t("admin-dashboard:risk.tomorrow");
  return formatDate(`${date}T12:00:00Z`, "weekdayShort").replaceAll(/[.,]/gu, "");
}

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
  const { formatDate, formatTime } = useClubFormats();
  const { t } = useTranslation("admin-dashboard");
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

  return (
    <section className="dashboard-page">
      {new URLSearchParams(window.location.search).get("signup") === "validated" ? <Toast tone="success">{t("admin-dashboard:signups.validated")}</Toast> : null}
      {error === undefined ? null : <Toast tone="danger">{isApiError(error) ? t(`errors:${error.code}`, { defaultValue: t("admin-dashboard:common.error") }) : t("admin-dashboard:common.error")}</Toast>}
      <h1>{t("admin-dashboard:greeting", { date: sentenceCase(formatDate(`${dashboard.today}T12:00:00Z`, "weekday")), period })}</h1>
      <div className="dashboard-kpis">
        {dashboard.kpis.activeMembers === null ? null : (
          <KpiCard detail={t("admin-dashboard:kpi.thisMonth", { count: dashboard.kpis.activeMembers.deltaThisMonth })} label={t("admin-dashboard:kpi.activeMembers")} value={dashboard.kpis.activeMembers.value} />
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
            <header><h2>{t("admin-dashboard:risk.title", { time: risk.reviewTime, days: risk.lookaheadDays })}</h2><Badge tone={risk.count > 0 ? "warning" : "neutral"}>{t("admin-dashboard:risk.alerts", { count: risk.count })}</Badge></header>
            {risk.items.length === 0 ? <p>{t("admin-dashboard:risk.empty")}</p> : risk.items.map((item) => {
              const day = relativeDay(item.date, dashboard.today, formatDate, t);
              const names = item.notified.map((person) => `${person.memberFirstName} + ${person.dogName}`).join(", ");
              const gender = item.notified[0]?.gender === "FEMALE" ? "female" : "other";
              const notified = item.notified.length === 0 ? "" : t("admin-dashboard:risk.notified", { count: item.notified.length, gender, names });
              const status = item.status === "WILL_CANCEL"
                ? t("admin-dashboard:risk.status.WILL_CANCEL", { day, time: risk.reviewTime })
                : t(`admin-dashboard:risk.status.${item.status}`);
              return (
                <article className="dashboard-risk__row" key={item.classSessionId}>
                  <div><strong>{item.displayDescription} · {day} {item.startTime} · {item.ringName}</strong><small>{t("admin-dashboard:risk.booked", { count: item.booked })}</small></div>
                  <Badge tone={item.status === "CANCELLED" ? "neutral" : "warning"}>{status}{notified === "" ? "" : ` · ${notified}`}</Badge>
                </article>
              );
            })}
          </Card>
        )}

        {dashboard.pendingSignups === null ? null : (
          <Card className="dashboard-signups">
            <header><h2>{t("admin-dashboard:signups.title")}</h2><Badge>{dashboard.pendingSignups.count}</Badge></header>
            {dashboard.pendingSignups.items.length === 0 ? <p>{t("admin-dashboard:signups.empty")}</p> : dashboard.pendingSignups.items.map((signup) => (
              <article className="dashboard-signups__row" key={signup.memberId}>
                <div><strong>{signup.shortName} + {signup.dogs.map((dog) => `${dog.name} (${dog.breed})`).join(", ")}</strong><small>{signup.planName}{signup.paymentMethodType === undefined ? "" : ` · ${t(`admin-dashboard:signups.payment.${signup.paymentMethodType}`)}`}</small></div>
                {signup.warnings.includes("ACCOUNT_NOT_PROVIDED") ? <Badge tone="danger">{t("admin-dashboard:signups.accountNotProvided")}</Badge> : null}
                <Button onClick={() => { onNavigate(`/preinscripcions/${signup.memberId}`); }}>{t("admin-dashboard:signups.validate")}</Button>
              </article>
            ))}
          </Card>
        )}
      </div>

      {dashboard.dogsByLevel === null ? null : (
        <Card className="dashboard-chart">
          <header><h2>{t("admin-dashboard:chart.title", { count: dashboard.dogsByLevel.totalActiveDogs })}</h2><small>{t("admin-dashboard:chart.legend")}</small></header>
          <BarChart data={dashboard.dogsByLevel.levels.map((level) => ({ highlighted: level.withRecentBooking, label: level.code, total: level.total }))} highlightedLabel={t("admin-dashboard:chart.recent")} label={t("admin-dashboard:chart.title", { count: dashboard.dogsByLevel.totalActiveDogs })} totalLabel={t("admin-dashboard:chart.total")} valueLabel={(item) => t("admin-dashboard:chart.value", { recent: item.highlighted, total: item.total })} />
        </Card>
      )}
    </section>
  );
}
