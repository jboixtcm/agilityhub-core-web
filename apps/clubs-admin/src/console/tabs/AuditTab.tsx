import type { components } from "@agilityhub/api-client";
import { Button, DataTable } from "@agilityhub/ui";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";

import { useListData } from "../../lists/list-helpers";
import type { ConsoleTabProps } from "../ClubRecordPage";
import { consoleErrorMessage, formatClubDateTime, LoadError, SectionCard } from "../shared";

type AuditRow = components["schemas"]["PlatformAuditEntry"];

const PAGE_SIZE = 20;

/**
 * S17 §2 «Auditoria» (R-17-12): the platform audit filtered by the club (`GET
 * /platform/audit-entries?filter=clubId:eq:{id}`), configuration actions only, newest first.
 */
export function AuditTab({ client, club }: ConsoleTabProps) {
  const { i18n, t } = useTranslation(["console", "admin-audit", "errors", "common"]);
  const locale = i18n.resolvedLanguage ?? i18n.language;
  const [page, setPage] = useState(0);
  const load = useCallback(async () => {
    const result = await client.GET("/platform/audit-entries", {
      params: {
        query: { filter: [`clubId:eq:${club.id}`], page, size: PAGE_SIZE, sort: ["at,desc"] },
      },
    });
    if (result.data === undefined) throw new TypeError("Audit entries without data");
    return result.data;
  }, [client, club.id, page]);
  const { data, error, loading, retry } = useListData<AuditRow>(load, `${club.id}|${String(page)}`);

  const changes = (row: AuditRow) =>
    row.changes
      .map((change) =>
        t("console:audit.change", {
          after: JSON.stringify(change.after),
          before: JSON.stringify(change.before),
          path: change.path,
        }),
      )
      .join(" · ");

  if (error !== undefined && data === undefined) return <LoadError error={error} onRetry={retry} />;

  return (
    <SectionCard description={t("console:audit.description")} title={t("console:audit.title")}>
      {error === undefined ? null : (
        <p className="console-message console-message--danger" role="alert">
          {consoleErrorMessage(t, error)}
        </p>
      )}
      <DataTable<AuditRow>
        caption={t("console:audit.title")}
        columns={[
          {
            header: t("admin-audit:columns.at"),
            key: "at",
            render: (row) => formatClubDateTime(row.at, club.timeZone, locale) ?? "",
          },
          {
            header: t("admin-audit:columns.action"),
            key: "action",
            render: (row) => t(`admin-audit:actions.${row.action}`, { defaultValue: row.action }),
          },
          {
            header: t("admin-audit:columns.entity"),
            key: "entity",
            render: (row) => row.entityLabel ?? "",
          },
          {
            header: t("admin-audit:columns.actor"),
            key: "actor",
            // The api sends `null` for a value it does not have (an actor without a name).
            render: (row) =>
              [row.actorName, t(`admin-audit:roles.${row.actorRole}`)]
                .filter((part) => part != null && part !== "")
                .join(" · "),
          },
          { header: t("admin-audit:columns.changes"), key: "changes", render: changes },
          {
            header: t("admin-audit:columns.origin"),
            key: "origin",
            render: (row) => t(`admin-audit:origins.${row.origin}`),
          },
        ]}
        empty={t("console:audit.empty")}
        loading={loading}
        loadingLabel={t("console:common.loading")}
        rowKey={(row) => row.id}
        rows={data?.items ?? []}
      />
      <div className="console-actions">
        <Button
          disabled={page === 0 || loading}
          onClick={() => {
            setPage((current) => Math.max(0, current - 1));
          }}
          variant="ghost"
        >
          {t("console:audit.previous")}
        </Button>
        <span className="console-muted">
          {t("console:audit.page", { page: page + 1, total: Math.max(1, data?.totalPages ?? 1) })}
        </span>
        <Button
          disabled={loading || page + 1 >= (data?.totalPages ?? 1)}
          onClick={() => {
            setPage((current) => current + 1);
          }}
          variant="ghost"
        >
          {t("console:audit.next")}
        </Button>
      </div>
    </SectionCard>
  );
}
