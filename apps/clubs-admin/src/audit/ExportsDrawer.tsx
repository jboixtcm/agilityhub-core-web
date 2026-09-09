import type { ApiClient, components } from "@agilityhub/api-client";
import { Badge, Drawer, Icon, useBranding } from "@agilityhub/ui";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useTranslation } from "react-i18next";

type ExportJob = components["schemas"]["ExportJob"];

interface OpenExportsOptions {
  errorCode?: "EXPORT_LIMIT";
  jobId?: string;
}

interface ExportsContextValue {
  openExports: (options?: OpenExportsOptions) => void;
}

const ExportsContext = createContext<ExportsContextValue | undefined>(undefined);

function exportStatusLabel(status: ExportJob["status"], t: ReturnType<typeof useTranslation>["t"]) {
  switch (status) {
    case "QUEUED":
      return t("admin-audit:exports.status.QUEUED");
    case "RUNNING":
      return t("admin-audit:exports.status.RUNNING");
    case "READY":
      return t("admin-audit:exports.status.READY");
    case "FAILED":
      return t("admin-audit:exports.status.FAILED");
    case "EXPIRED":
      return t("admin-audit:exports.status.EXPIRED");
  }
}

function exportTone(status: ExportJob["status"]) {
  if (status === "READY") return "success" as const;
  if (status === "FAILED" || status === "EXPIRED") return "danger" as const;
  return "warning" as const;
}

export function ExportJobsProvider({
  children,
  client,
}: {
  children: ReactNode;
  client: ApiClient;
}) {
  const branding = useBranding();
  const { i18n, t } = useTranslation("admin-audit");
  const [open, setOpen] = useState(false);
  const [jobs, setJobs] = useState<ExportJob[]>([]);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [notice, setNotice] = useState<"EXPORT_LIMIT" | "queued">();
  const [refreshKey, setRefreshKey] = useState(0);
  const locale = i18n.resolvedLanguage ?? branding.defaultLocale;

  const openExports = useCallback((options?: OpenExportsOptions) => {
    setNotice(
      options?.errorCode === "EXPORT_LIMIT"
        ? "EXPORT_LIMIT"
        : options?.jobId
          ? "queued"
          : undefined,
    );
    setOpen(true);
    setRefreshKey((value) => value + 1);
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    let current = true;
    let timer: number | undefined;
    const load = async () => {
      setLoading(true);
      try {
        const result = await client.GET("/exports", { params: { query: { kind: "LIST" } } });
        if (!current) return;
        const next = result.data ?? [];
        setJobs(next);
        setFailed(false);
        if (next.some((job) => job.status === "QUEUED" || job.status === "RUNNING")) {
          timer = window.setTimeout(() => {
            void load();
          }, 1_000);
        }
      } catch {
        if (current) setFailed(true);
      } finally {
        if (current) setLoading(false);
      }
    };
    void load();
    return () => {
      current = false;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [client, open, refreshKey]);

  const context = useMemo(() => ({ openExports }), [openExports]);

  return (
    <ExportsContext.Provider value={context}>
      {children}
      <Drawer
        closeLabel={t("admin-audit:exports.close")}
        onClose={() => {
          setOpen(false);
        }}
        open={open}
        title={t("admin-audit:exports.title")}
      >
        <div className="exports-drawer">
          <p>{t("admin-audit:exports.description")}</p>
          {notice === "queued" ? (
            <p className="exports-drawer__notice" role="status">
              {t("admin-audit:exports.queuedNotice")}
            </p>
          ) : null}
          {notice === "EXPORT_LIMIT" ? (
            <p className="exports-drawer__error" role="alert">
              {t("admin-audit:exports.limit")}
            </p>
          ) : null}
          {failed ? (
            <p className="exports-drawer__error" role="alert">
              {t("admin-audit:exports.error")}
            </p>
          ) : null}
          {loading && jobs.length === 0 ? (
            <p role="status">{t("admin-audit:exports.loading")}</p>
          ) : jobs.length === 0 ? (
            <p>{t("admin-audit:exports.empty")}</p>
          ) : (
            <ul className="exports-drawer__list">
              {jobs.map((job) => (
                <li key={job.id}>
                  <div className="exports-drawer__heading">
                    <strong>{job.fileName ?? job.id}</strong>
                    <Badge tone={exportTone(job.status)}>{exportStatusLabel(job.status, t)}</Badge>
                  </div>
                  <small>
                    {t("admin-audit:exports.created", {
                      date: new Intl.DateTimeFormat(locale, {
                        dateStyle: "short",
                        timeStyle: "short",
                        timeZone: branding.timeZone,
                      }).format(new Date(job.createdAt)),
                    })}
                  </small>
                  {job.rows === undefined ? null : (
                    <small>{t("admin-audit:exports.rows", { count: job.rows })}</small>
                  )}
                  {job.status === "RUNNING" && job.progressPct !== undefined ? (
                    <small>
                      {t("admin-audit:exports.progress", { progress: job.progressPct })}
                    </small>
                  ) : null}
                  {job.status === "READY" && job.downloadUrl !== undefined ? (
                    <a download href={job.downloadUrl}>
                      <Icon aria-hidden="true" name="export" />
                      {t("admin-audit:exports.download", { fileName: job.fileName ?? job.id })}
                    </a>
                  ) : null}
                  {job.status === "FAILED" ? (
                    <small className="exports-drawer__error">
                      {job.error?.message ?? t("admin-audit:exports.failed")}
                    </small>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      </Drawer>
    </ExportsContext.Provider>
  );
}

export function useExportsDrawer(): ExportsContextValue {
  const context = useContext(ExportsContext);
  if (context === undefined) {
    throw new Error("useExportsDrawer must be used inside ExportJobsProvider");
  }
  return context;
}

export function useOptionalExportsDrawer(): ExportsContextValue | undefined {
  return useContext(ExportsContext);
}
