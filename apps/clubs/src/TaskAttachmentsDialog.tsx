import { type ApiClient } from "@agilityhub/api-client";
import { AttachmentChips, Button, Modal, type AttachmentChip } from "@agilityhub/ui";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";

import { errorText, useLoader } from "./booking/shared";

export function TaskAttachmentsDialog({
  client,
  onClose,
  taskId,
}: {
  client: ApiClient;
  onClose: () => void;
  taskId: string;
}) {
  const { t } = useTranslation(["census", "errors", "common"]);
  const list = useCallback(async () => {
    const { data } = await client.GET("/attachments", {
      params: { query: { entityId: taskId, entityType: "TASK" } },
    });
    if (data === undefined) throw new TypeError("Missing task attachments");
    return data.items;
  }, [client, taskId]);
  const files = useLoader(list);

  const open = async ({ id }: AttachmentChip) => {
    // Mobile browsers need the new tab to be opened during the tap. Resolve the
    // signed URL afterwards so a list left open for several minutes still works.
    const tab = window.open("", "_blank");
    if (tab !== null) tab.opener = null;
    try {
      const file = (await list()).find((item) => item.id === id);
      if (!file) {
        tab?.close();
        return t("census:myDogs.attachmentUnavailable");
      }
      const url = new URL(file.url, window.location.href).href;
      if (tab === null) window.location.assign(url);
      else tab.location.replace(url);
      return undefined;
    } catch (error) {
      tab?.close();
      return errorText(t, error);
    }
  };

  return (
    <Modal
      closeLabel={t("census:selfService.close")}
      onClose={onClose}
      open
      title={t("census:myDogs.taskFiles")}
    >
      {files.status === "loading" ? (
        <span role="status">{t("common:gallery.loading")}</span>
      ) : files.status === "error" ? (
        <>
          <p role="alert">{errorText(t, files.error)}</p>
          <Button
            onClick={() => {
              files.refetch();
            }}
            variant="secondary"
          >
            {t("common:boot.retry")}
          </Button>
        </>
      ) : files.data.length === 0 ? (
        <p>{t("census:myDogs.noDocuments")}</p>
      ) : (
        <div className="dog-task-files">
          <AttachmentChips items={files.data} onOpen={open} />
        </div>
      )}
    </Modal>
  );
}
