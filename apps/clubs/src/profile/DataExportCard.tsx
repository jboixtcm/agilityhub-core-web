import {
  downloadExportJob,
  isApiError,
  type ApiClient,
  type components,
  openDownloadUrl,
  saveFile,
} from "@agilityhub/api-client";
import { Button, Card, Icon } from "@agilityhub/ui";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

type ExportJob = components["schemas"]["ExportJob"];

export const MEMBER_DATA_EXPORT_STORAGE_KEY = "agilityhub.memberDataExportJob";

function jobStorageKey(accountId: string): string {
  return `${MEMBER_DATA_EXPORT_STORAGE_KEY}:${accountId}`;
}

function storedJobId(accountId: string): string | undefined {
  try {
    return sessionStorage.getItem(jobStorageKey(accountId)) ?? undefined;
  } catch {
    return undefined;
  }
}

function storeJobId(accountId: string, jobId: string | undefined): void {
  try {
    const key = jobStorageKey(accountId);
    if (jobId === undefined) sessionStorage.removeItem(key);
    else sessionStorage.setItem(key, jobId);
  } catch {
    // The export still works in a privacy-restricted browser; only reload recovery is unavailable.
  }
}

export function DataExportCard({ accountId, client }: { accountId: string; client: ApiClient }) {
  const { t } = useTranslation(["auth", "errors"]);
  const [jobId, setJobId] = useState(() => storedJobId(accountId));
  const [job, setJob] = useState<ExportJob>();
  const [requesting, setRequesting] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [failure, setFailure] = useState<string>();

  useEffect(() => {
    if (jobId === undefined) return undefined;
    let current = true;
    let timer: number | undefined;
    const load = async () => {
      try {
        const { data } = await client.GET("/exports/{id}", {
          params: { path: { id: jobId } },
        });
        if (!current || data === undefined) return;
        setJob(data);
        setFailure(undefined);
        if (data.status === "QUEUED" || data.status === "RUNNING") {
          timer = window.setTimeout(() => {
            void load();
          }, 1_000);
        } else if (data.status === "FAILED" || data.status === "EXPIRED") {
          storeJobId(accountId, undefined);
          setJobId(undefined);
        }
      } catch (cause) {
        if (!current) return;
        setFailure(
          isApiError(cause)
            ? t(`errors:${cause.code}`, { defaultValue: t("auth:profile.dataExport.error") })
            : t("auth:profile.dataExport.error"),
        );
        if (isApiError(cause, "NOT_FOUND") || isApiError(cause, "EXPORT_EXPIRED")) {
          storeJobId(accountId, undefined);
          setJobId(undefined);
        }
      }
    };
    void load();
    return () => {
      current = false;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [accountId, client, jobId, t]);

  const preparing =
    requesting ||
    (jobId !== undefined &&
      (job === undefined || job.status === "QUEUED" || job.status === "RUNNING"));

  return (
    <Card className="profile-data-export">
      <div className="profile-data-export__heading">
        <Icon aria-hidden="true" name="export" />
        <div>
          <h2>{t("auth:profile.dataExport.title")}</h2>
          <p>{t("auth:profile.dataExport.description")}</p>
        </div>
      </div>
      {jobId === undefined ? (
        <Button
          loading={requesting}
          loadingLabel={t("auth:profile.dataExport.preparing")}
          onClick={() => {
            setRequesting(true);
            setFailure(undefined);
            void client
              .POST("/me/data-export")
              .then(({ data }) => {
                if (data === undefined) throw new TypeError("Data export response had no job");
                storeJobId(accountId, data.jobId);
                setJob(undefined);
                setJobId(data.jobId);
              })
              .catch((cause: unknown) => {
                setFailure(
                  isApiError(cause)
                    ? t(`errors:${cause.code}`, {
                        defaultValue: t("auth:profile.dataExport.error"),
                      })
                    : t("auth:profile.dataExport.error"),
                );
              })
              .finally(() => {
                setRequesting(false);
              });
          }}
        >
          {t("auth:profile.dataExport.action")}
        </Button>
      ) : null}
      {preparing ? <p role="status">{t("auth:profile.dataExport.preparing")}</p> : null}
      {job?.status === "READY" ? (
        <div className="profile-data-export__ready">
          <p role="status">{t("auth:profile.dataExport.ready")}</p>
          <Button
            loading={downloading}
            loadingLabel={t("auth:profile.dataExport.downloading")}
            onClick={() => {
              setDownloading(true);
              setFailure(undefined);
              void downloadExportJob(client, job.id, job.fileName ?? "dades-personals.zip")
                .then((file) => {
                  if (file.kind === "file") saveFile(file.blob, file.fileName);
                  else openDownloadUrl(file.url);
                })
                .catch((cause: unknown) => {
                  setFailure(
                    isApiError(cause)
                      ? t(`errors:${cause.code}`, {
                          defaultValue: t("auth:profile.dataExport.downloadError"),
                        })
                      : t("auth:profile.dataExport.downloadError"),
                  );
                })
                .finally(() => {
                  setDownloading(false);
                });
            }}
          >
            {t("auth:profile.dataExport.download")}
          </Button>
        </div>
      ) : null}
      {job?.status === "FAILED" ? (
        <p role="alert">{job.error?.message ?? t("auth:profile.dataExport.failed")}</p>
      ) : null}
      {job?.status === "EXPIRED" ? (
        <p role="alert">{t("auth:profile.dataExport.expired")}</p>
      ) : null}
      {failure === undefined ? null : <p role="alert">{failure}</p>}
    </Card>
  );
}
