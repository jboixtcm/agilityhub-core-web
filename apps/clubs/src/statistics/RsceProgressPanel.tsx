import { type components } from "@agilityhub/api-client";
import { useClubFormats } from "@agilityhub/i18n";
import { useTranslation } from "react-i18next";

type Progress = components["schemas"]["RsceLicenseProgress"];
type Route = components["schemas"]["RsceProgressRoute"];

function RouteProgress({ route }: { route: Route }) {
  const { t } = useTranslation("statistics");
  const names: Record<string, string> = {
    G1_THREE_AGILITY: t("statistics:progress.g1Agility"),
    G1_TWO_EACH: t("statistics:progress.g1Both"),
    G2_TO_G3: t("statistics:progress.g2Promotion"),
    G2_STANDARD: t("statistics:progress.g2Championship"),
    G3_STANDARD: t("statistics:progress.g3Championship"),
    G2_AFTER_PROMOTION: t("statistics:progress.afterPromotion"),
  };
  const kinds: Record<string, string> = {
    PA: t("statistics:pointPA"),
    PV: t("statistics:pointPV"),
    CLEAR_EXCELLENT: t("statistics:progress.clearExcellent"),
    CHAMPIONSHIP_POINT: t("statistics:progress.championshipPoint"),
  };
  return (
    <section className="competition-route" aria-label={names[route.code]}>
      <h4>{names[route.code]}</h4>
      <div className="competition-grid">
        {route.targets.map((target) => {
          const discipline =
            target.discipline === "AGILITY"
              ? t("statistics:discipline.AGILITY")
              : t("statistics:discipline.JUMPING");
          const label = `${discipline} · ${kinds[target.kind] ?? target.kind}`;
          return (
            <div className="competition-target" key={`${target.discipline}-${target.kind}`}>
              <p>{label}</p>
              <strong>{t("statistics:progress.target", target)}</strong>
              <progress
                aria-label={label}
                value={Math.min(target.earned, target.required)}
                max={target.required}
              />
              <span>{t("statistics:progress.remaining", { count: target.remaining })}</span>
            </div>
          );
        })}
      </div>
      {route.pointTargetsMet && <p>{t("statistics:progress.pointsReached")}</p>}
      {route.requiresDifferentJudges && <p>{t("statistics:progress.judges")}</p>}
      {route.code === "G2_AFTER_PROMOTION" && <p>{t("statistics:progress.promotionNotice")}</p>}
    </section>
  );
}

export function RsceProgressPanel({ progress, year }: { progress: Progress; year: number }) {
  const { t } = useTranslation("statistics");
  const formats = useClubFormats();
  const date = (value: string) => formats.formatPlainDate(value);
  return (
    <div className="competition-progress">
      <div className="competition-grade">
        <h3>
          {progress.gradeConflict
            ? t("statistics:progress.gradeToReview")
            : progress.gradeSource === "LAST_RESULT"
              ? t("statistics:progress.lastObservedGrade")
              : t("statistics:progress.grade")}{" "}
          <strong>{progress.currentGrade ?? t("statistics:unknown")}</strong>
        </h3>
        <p>
          {progress.gradeSource === "LICENSE"
            ? t("statistics:progress.licenseGrade")
            : progress.gradeSource === "LAST_RESULT" && progress.lastResultDate
              ? t("statistics:progress.observedGrade", { date: date(progress.lastResultDate) })
              : t("statistics:progress.unknownGrade")}
        </p>
      </div>
      {progress.gradeConflict && (
        <p className="competition-review" role="status">
          {t("statistics:progress.gradeConflict", {
            grade: progress.lastResultGrade ?? t("statistics:unknown"),
            date: progress.lastResultDate ? date(progress.lastResultDate) : t("statistics:unknown"),
          })}
        </p>
      )}
      {progress.previousHigherGrade && (
        <p className="competition-review">{t("statistics:progress.demotion")}</p>
      )}
      {progress.promotionRoutes.length > 0 && (
        <section aria-label={t("statistics:progress.promotion")}>
          <h3>{t("statistics:progress.promotion")}</h3>
          <p>{t("statistics:progress.lifetime")}</p>
          {progress.historyFrom && progress.historyThrough ? (
            <p className="competition-source">
              {t("statistics:progress.history", {
                from: date(progress.historyFrom),
                through: date(progress.historyThrough),
              })}
            </p>
          ) : (
            <p>{t("statistics:progress.noHistory")}</p>
          )}
          {progress.promotionRoutes.map((route) => (
            <RouteProgress key={route.code} route={route} />
          ))}
          <p className="competition-source">{t("statistics:progress.noAutomaticPromotion")}</p>
        </section>
      )}
      {progress.currentGrade === "G1" ? (
        <p>{t("statistics:progress.g1NoChampionship")}</p>
      ) : progress.currentGrade && year < 2026 ? (
        <p>{t("statistics:progress.olderRules")}</p>
      ) : progress.championshipRoutes.length > 0 ? (
        <section aria-label={t("statistics:progress.championship", { year: year + 1 })}>
          <h3>{t("statistics:progress.championship", { year: year + 1 })}</h3>
          <p>{t("statistics:progress.annual", { year })}</p>
          {progress.championshipRoutes.map((route) => (
            <RouteProgress key={route.code} route={route} />
          ))}
        </section>
      ) : null}
      <details className="competition-rule-notes">
        <summary>{t("statistics:progress.rules")}</summary>
        <p>{t("statistics:progress.importedOnly")}</p>
        <p>{t("statistics:progress.specialRoutes")}</p>
        <a href={progress.rulesUrl} target="_blank" rel="noopener noreferrer">
          {t("statistics:progress.source")}
        </a>
      </details>
    </div>
  );
}
