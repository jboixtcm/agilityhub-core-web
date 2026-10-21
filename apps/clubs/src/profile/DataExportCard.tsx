import {
  downloadExportJob,
  isApiError,
  type ApiClient,
  type components,
  openDownloadUrl,
  saveFile,
} from "@agilityhub/api-client";
import { useClubFormats } from "@agilityhub/i18n";
import { Button, Card, Icon } from "@agilityhub/ui";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

type ExportJob = components["schemas"]["ExportJob"];

export const MEMBER_DATA_EXPORT_STORAGE_KEY = "agilityhub.memberDataExportJob";

/** How often a queued package is read, and for how long before [Actualitza] (as R-12-13). */
export const DATA_EXPORT_POLL_MS = 2_000;
export const DATA_EXPORT_POLL_LIMIT_MS = 120_000;

const JOB_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

/**
 * N-50's job (S14 §8, `OPEN_EXPORT` «obre `GET /exports/{id}`»): when the card's action names it
 * (`params.jobId`), the feed opens `/perfil?jobId={id}` and this card follows that package even on
 * another device. Only an export job's UUID passes.
 */
export function dataExportJobFromUrl(search: string): string | undefined {
  const jobId = new URLSearchParams(search).get("jobId");
  return jobId !== null && JOB_ID.test(jobId) ? jobId : undefined;
}

function jobStorageKey(accountId: string): string {
  return `${MEMBER_DATA_EXPORT_STORAGE_KEY}:${accountId}`;
}

/**
 * The account's last package on this device (its UUID only, never its contents): a closed tab or a
 * relaunched PWA finds it again (E11-W01 round 2 #2), as N-50 sends no job today and a MEMBER
 * cannot list `GET /exports`. The job is caller-owned, so the id opens nothing for anyone else.
 */
function storedJobId(accountId: string): string | undefined {
  try {
    return localStorage.getItem(jobStorageKey(accountId)) ?? undefined;
  } catch {
    return undefined;
  }
}

function storeJobId(accountId: string, jobId: string | undefined): void {
  try {
    const key = jobStorageKey(accountId);
    if (jobId === undefined) localStorage.removeItem(key);
    else localStorage.setItem(key, jobId);
  } catch {
    // The export still works in a privacy-restricted browser; only reload recovery is unavailable.
  }
}

export function DataExportCard({
  accountId,
  client,
  initialJobId,
}: {
  accountId: string;
  client: ApiClient;
  /** The job N-50 names (`OPEN_EXPORT`), ahead of the one this device stored. */
  initialJobId?: string;
}) {
  const formats = useClubFormats();
  const { t } = useTranslation(["auth", "errors"]);
  const [jobId, setJobId] = useState(() => {
    if (initialJobId === undefined) return storedJobId(accountId);
    storeJobId(accountId, initialJobId);
    return initialJobId;
  });
  const [job, setJob] = useState<ExportJob>();
  const [requesting, setRequesting] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [failure, setFailure] = useState<string>();
  // R-12-13's bound: after two minutes still queued, the card stops reading until [Actualitza].
  const [stalled, setStalled] = useState(false);
  const [pollRound, setPollRound] = useState(0);
  const pollStart = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (jobId === undefined || stalled) return undefined;
    let current = true;
    let timer: number | undefined;
    pollStart.current = Date.now();
    const load = async () => {
      try {
        const { data } = await client.GET("/exports/{id}", {
          params: { path: { id: jobId } },
        });
        if (!current || data === undefined) return;
        setJob(data);
        setFailure(undefined);
        if (data.status === "QUEUED" || data.status === "RUNNING") {
          if (Date.now() - (pollStart.current ?? Date.now()) >= DATA_EXPORT_POLL_LIMIT_MS) {
            setStalled(true);
            return;
          }
          timer = window.setTimeout(() => {
            void load();
          }, DATA_EXPORT_POLL_MS);
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
  }, [accountId, client, jobId, pollRound, stalled, t]);

  const waiting =
    jobId !== undefined &&
    (job === undefined || job.status === "QUEUED" || job.status === "RUNNING");
  const preparing = requesting || (waiting && !stalled);

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
                setStalled(false);
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
      {waiting && stalled ? (
        <div className="profile-data-export__stalled">
          <p role="status">{t("auth:profile.dataExport.stillPreparing")}</p>
          <Button
            onClick={() => {
              setStalled(false);
              setPollRound((value) => value + 1);
            }}
            variant="ghost"
          >
            {t("auth:profile.dataExport.refresh")}
          </Button>
        </div>
      ) : null}
      {job?.status === "READY" ? (
        <div className="profile-data-export__ready">
          <div className="profile-data-export__state">
            <p role="status">{t("auth:profile.dataExport.ready")}</p>
            {job.expiresAt === undefined ? null : (
              <small>
                {t("auth:profile.dataExport.availableUntil", {
                  date: formats.formatDate(job.expiresAt),
                })}
              </small>
            )}
          </div>
          <Button
            loading={downloading}
            loadingLabel={t("auth:profile.dataExport.downloading")}
            onClick={() => {
              setDownloading(true);
              setFailure(undefined);
              void downloadExportJob(client, job.id, job.fileName ?? job.id)
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
      {/* The worker's `error.message` is the api's English text: the code is what is translated. */}
      {job?.status === "FAILED" ? (
        <p role="alert">
          {job.error === undefined
            ? t("auth:profile.dataExport.failed")
            : t(`errors:${job.error.code}`, { defaultValue: t("auth:profile.dataExport.failed") })}
        </p>
      ) : null}
      {job?.status === "EXPIRED" ? (
        <p role="alert">{t("auth:profile.dataExport.expired")}</p>
      ) : null}
      {failure === undefined ? null : <p role="alert">{failure}</p>}
    </Card>
  );
}
