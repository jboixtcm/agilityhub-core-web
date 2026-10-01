import {
  type ApiClient,
  type ExportResult,
  isApiError,
  type ListExportPath,
  type ListExportQuery,
  requestExport,
  saveFile,
} from "@agilityhub/api-client";
import { useCallback, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { useOptionalExportsDrawer } from "./ExportsDrawer";

export interface ListExportError {
  message: string;
  /** The button that ran the export (`list` = the «Excel · PDF» menu). */
  source: string;
}

/**
 * The export buttons of every list (S14 R-14-12, CONVENCIONS_API §4): the inline `200` file is
 * saved byte for byte; a queued `202` opens the exports drawer; `EXPORT_LIMIT` shows the drawer's
 * notice; any other code shows `errors:{code}` next to the button that ran it. One export at a time.
 * `runWith` takes another export route with the same answers (D6's accounting export, R-12-26).
 */
export function useListExport(client: ApiClient) {
  const { t } = useTranslation(["census", "errors"]);
  const exportsDrawer = useOptionalExportsDrawer();
  const running = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ListExportError>();

  const runWith = useCallback(
    async (request: () => Promise<ExportResult>, source = "list"): Promise<boolean> => {
      if (running.current) return false;
      running.current = true;
      setBusy(true);
      setError(undefined);
      try {
        const result = await request();
        if (result.kind === "queued") {
          exportsDrawer?.openExports({ jobId: result.jobId });
        } else {
          saveFile(result.blob, result.fileName);
        }
        return true;
      } catch (cause) {
        if (isApiError(cause, "EXPORT_LIMIT") && exportsDrawer !== undefined) {
          exportsDrawer.openExports({ errorCode: "EXPORT_LIMIT" });
          return true;
        }
        setError({
          message: isApiError(cause)
            ? t(`errors:${cause.code}`, { defaultValue: t("census:list.exportError") })
            : t("census:list.exportError"),
          source,
        });
        return false;
      } finally {
        running.current = false;
        setBusy(false);
      }
    },
    [exportsDrawer, t],
  );

  const run = useCallback(
    async (path: ListExportPath, query: ListExportQuery, source = "list") => {
      await runWith(() => requestExport(client, path, query), source);
    },
    [client, runWith],
  );

  return { busy, error, run, runWith };
}
