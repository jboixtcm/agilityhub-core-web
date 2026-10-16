import type { components } from "@agilityhub/api-client";
import { formatMonthTitle } from "@agilityhub/i18n";
import { Card, FormField, Input, Skeleton } from "@agilityhub/ui";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";

import { useListData } from "../../lists/list-helpers";
import type { ConsoleTabProps } from "../ClubRecordPage";
import { formatBytes, formatCount, LoadError, SectionCard } from "../shared";

import { clubToday } from "./LegalTab";

type Usage = components["schemas"]["PlatformClubUsage"];

/** S17 §2 «Ús»: the month's counters (`GET /platform/clubs/{id}/usage?month=`), aggregates only. */
export function UsageTab({ client, club }: ConsoleTabProps) {
  const { i18n, t } = useTranslation(["console", "errors", "common"]);
  const locale = i18n.resolvedLanguage ?? i18n.language;
  // The month is the club's (its own zone), never the reader's device's.
  const [month, setMonth] = useState(() => clubToday(club.timeZone).slice(0, 7));
  const load = useCallback(async () => {
    const result = await client.GET("/platform/clubs/{id}/usage", {
      params: { path: { id: club.id }, query: { month } },
    });
    if (result.data === undefined) throw new TypeError("Usage without data");
    return { appliedFilters: [], items: [result.data], totalPages: 1 };
  }, [client, club.id, month]);
  const { data, error, loading, retry } = useListData<Usage>(load, `${club.id}|${month}`);
  const usage = data?.items[0];

  return (
    <SectionCard description={t("console:usage.description")} title={t("console:usage.title")}>
      <FormField id="console-usage-month" label={t("console:usage.month")}>
        <Input
          id="console-usage-month"
          onChange={(event) => {
            if (/^\d{4}-(0[1-9]|1[0-2])$/u.test(event.currentTarget.value))
              setMonth(event.currentTarget.value);
          }}
          type="month"
          value={month}
        />
      </FormField>
      {error !== undefined ? (
        <LoadError error={error} onRetry={retry} />
      ) : loading || usage === undefined ? (
        <Skeleton label={t("console:common.loading")} />
      ) : (
        <div
          aria-label={formatMonthTitle(
            usage.month,
            locale === "es" || locale === "en" ? locale : "ca",
          )}
          className="console-kpis"
          role="group"
        >
          <Card className="console-kpi">
            <span>{t("console:usage.membersActive")}</span>
            <strong>{formatCount(usage.membersActive, locale)}</strong>
          </Card>
          <Card className="console-kpi">
            <span>{t("console:usage.smsSentMonth")}</span>
            <strong>{formatCount(usage.smsSentMonth, locale)}</strong>
          </Card>
          <Card className="console-kpi">
            <span>{t("console:usage.storage")}</span>
            <strong>{formatBytes(usage.storageBytes, locale)}</strong>
          </Card>
        </div>
      )}
    </SectionCard>
  );
}
