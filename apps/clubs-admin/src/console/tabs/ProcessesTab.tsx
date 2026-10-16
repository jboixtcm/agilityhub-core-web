import type { components } from "@agilityhub/api-client";
import { Badge, Button, DataTable, Modal, Skeleton, type Tone } from "@agilityhub/ui";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";

import { useCatalogData } from "../../catalogs/shared";
import type { ConsoleTabProps } from "../ClubRecordPage";
import {
  consoleErrorMessage,
  formatClubDateTime,
  FormMessage,
  LoadError,
  SectionCard,
  useWriteState,
} from "../shared";

type JobCell = components["schemas"]["PlatformJobCell"];
type JobRun = components["schemas"]["JobRun"];

/** A process's route name (`week-opening`) as S15's job key (`WEEK_OPENING`), for its label. */
export function jobKey(name: string): string {
  return name.toUpperCase().replaceAll("-", "_");
}

function healthTone(health: JobCell["health"]): Tone {
  return health === "OK" ? "success" : health === "WARN" ? "warning" : "danger";
}

/**
 * S17 §2 «Processos» (S15): the club's row of `GET /platform/jobs/overview?clubId=`, and [Executa
 * ara] with its simulation (`POST /platform/clubs/{clubId}/jobs/{name}/trigger {dryRun}`).
 */
export function ProcessesTab({ client, club }: ConsoleTabProps) {
  const { i18n, t } = useTranslation(["console", "admin-settings", "enums", "errors", "common"]);
  const locale = i18n.resolvedLanguage ?? i18n.language;
  const load = useCallback(async () => {
    const result = await client.GET("/platform/jobs/overview", {
      params: { query: { clubId: club.id } },
    });
    if (result.data === undefined) throw new TypeError("Jobs overview without data");
    return result.data.clubs.find((row) => row.clubId === club.id)?.jobs ?? [];
  }, [client, club.id]);
  const jobs = useCatalogData(load, club.id);
  const write = useWriteState();
  const [confirming, setConfirming] = useState<JobCell>();
  const [run, setRun] = useState<{ name: string; run: JobRun }>();
  const label = (name: string) =>
    t(`admin-settings:jobs.name.${jobKey(name)}`, { defaultValue: name });

  const trigger = async (cell: JobCell, dryRun: boolean) => {
    setConfirming(undefined);
    setRun(undefined);
    const result = await write.run(async () => {
      const response = await client.POST("/platform/clubs/{clubId}/jobs/{name}/trigger", {
        body: { dryRun },
        params: { path: { clubId: club.id, name: cell.name } },
      });
      if (response.data === undefined) throw new TypeError("Job run without data");
      return response.data;
    });
    if (result !== undefined) {
      setRun({ name: cell.name, run: result });
      if (!dryRun) jobs.reload();
    }
  };

  const counters = (values: Record<string, number> | undefined) =>
    Object.entries(values ?? {})
      .map(([key, count]) =>
        t(`admin-settings:jobs.counter.${key}`, {
          count,
          defaultValue: t("admin-settings:jobs.counterRaw", { count, key }),
        }),
      )
      .join(" · ");

  if (jobs.error !== undefined) return <LoadError error={jobs.error} onRetry={jobs.reload} />;
  if (jobs.loading && jobs.items.length === 0)
    return <Skeleton label={t("console:common.loading")} />;

  return (
    <div className="console-form">
      <SectionCard
        description={t("console:processes.description")}
        title={t("console:processes.title")}
      >
        <DataTable<JobCell>
          caption={t("console:processes.title")}
          columns={[
            {
              header: t("console:processes.columns.name"),
              key: "name",
              render: (cell) => label(cell.name),
            },
            {
              header: t("console:processes.columns.enabled"),
              key: "enabled",
              render: (cell) => (cell.enabled ? t("console:common.yes") : t("console:common.no")),
            },
            {
              header: t("console:processes.columns.health"),
              key: "health",
              render: (cell) => (
                <Badge tone={healthTone(cell.health)}>
                  {t(`console:processes.health.${cell.health}`)}
                </Badge>
              ),
            },
            {
              header: t("console:processes.columns.lastRun"),
              key: "lastRun",
              render: (cell) =>
                cell.lastRun === null || cell.lastRun === undefined
                  ? t("admin-settings:jobs.lastRun.never")
                  : [
                      t(`enums:jobRunStatus.${cell.lastRun.status}`),
                      t(`enums:jobTrigger.${cell.lastRun.trigger}`),
                      formatClubDateTime(cell.lastRun.finishedAt, club.timeZone, locale),
                      counters(cell.lastRun.counters),
                    ]
                      .filter((part) => part !== undefined && part !== "")
                      .join(" · "),
            },
            {
              header: t("console:processes.columns.actions"),
              key: "actions",
              render: (cell) => (
                <span className="console-row-actions">
                  <Button
                    aria-label={t("admin-settings:jobs.dryRunLabel", { name: label(cell.name) })}
                    disabled={write.pending}
                    onClick={() => void trigger(cell, true)}
                    variant="secondary"
                  >
                    {t("admin-settings:jobs.dryRun")}
                  </Button>
                  <Button
                    aria-label={t("admin-settings:jobs.runLabel", { name: label(cell.name) })}
                    disabled={write.pending}
                    onClick={() => {
                      setConfirming(cell);
                    }}
                  >
                    {t("admin-settings:jobs.run")}
                  </Button>
                </span>
              ),
            },
          ]}
          empty={t("console:processes.empty")}
          loading={jobs.loading}
          loadingLabel={t("console:common.loading")}
          rowKey={(cell) => cell.name}
          rows={jobs.items}
        />
        {write.pending ? (
          <p className="console-muted" role="status">
            {t("admin-settings:jobs.running")}
          </p>
        ) : null}
        <FormMessage
          message={write.error === undefined ? undefined : consoleErrorMessage(t, write.error)}
          tone="danger"
        />
        {run === undefined ? null : (
          <div className="console-message console-message--success" role="status">
            <p>
              {run.run.dryRun ? `${t("admin-settings:jobs.dryRunTag")} · ` : ""}
              {t("admin-settings:jobs.runDone", {
                name: label(run.name),
                summary:
                  counters(run.run.effects.counters) || t(`enums:jobRunStatus.${run.run.status}`),
              })}
            </p>
            {run.run.dryRun ? <p>{t("admin-settings:jobs.dryRunNote")}</p> : null}
          </div>
        )}
      </SectionCard>
      <Modal
        closeLabel={t("console:common.close")}
        onClose={() => {
          setConfirming(undefined);
        }}
        open={confirming !== undefined}
        title={t("admin-settings:jobs.runTitle", {
          name: confirming === undefined ? "" : label(confirming.name),
        })}
      >
        <p>{t("admin-settings:jobs.runConfirm")}</p>
        <div className="console-actions">
          <Button
            onClick={() => {
              setConfirming(undefined);
            }}
            variant="ghost"
          >
            {t("admin-settings:jobs.cancel")}
          </Button>
          <Button
            onClick={() => {
              if (confirming !== undefined) void trigger(confirming, false);
            }}
          >
            {t("admin-settings:jobs.run")}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
