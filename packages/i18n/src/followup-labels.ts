import type { AttachmentRejection, DogFollowupTexts, TaskPanelItem } from "@agilityhub/ui";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import { personArticle, useClubFormats } from "./format";

/** The `Task` fields (S10 §6) the labels read: its author and date, and who completed it when. */
export interface FollowupTaskLike extends TaskPanelItem {
  createdAt: string;
  createdBy: { displayName: string };
  doneAt?: string | null | undefined;
  doneBy?:
    | { displayName: string; gender?: "FEMALE" | "MALE" | "OTHER" | null | undefined }
    | null
    | undefined;
}

/** The `code` of an answer the api gave (an `ApiError` with a status); none for a network failure. */
function apiCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const { code, status } = error as { code?: unknown; status?: unknown };
  return typeof code === "string" && typeof status === "number" && status !== 0 ? code : undefined;
}

/**
 * The texts of the shared follow-up editor (screen 26 and D13's drawer, S10 §10), one place for
 * both apps: «{dd-mm} · {autor}» in the club's time zone, «feta per {la Laura} el {dd-mm}» through
 * `personArticle`, the state chips from `enums:taskState.*`, a refused file as «{fitxer}:
 * {errors:<CODE>}», and every failure by its code (`errors:<CODE>`, never the api `message`).
 */
export function useFollowupTexts<Task extends FollowupTaskLike>(): DogFollowupTexts<Task> {
  const { t } = useTranslation(["instructor", "enums", "errors"]);
  const formats = useClubFormats();
  return useMemo(() => {
    const dayMonth = (instant: string) =>
      formats.formatDate(instant, "dayMonthNumeric").replaceAll("/", "-");
    const rejection = (reason: AttachmentRejection, file: File) =>
      t("instructor:tasks.fileRefused", {
        name: file.name,
        reason:
          reason === "FILE_TOO_LARGE"
            ? t("errors:FILE_TOO_LARGE")
            : reason === "FILE_TYPE_NOT_ALLOWED"
              ? t("errors:FILE_TYPE_NOT_ALLOWED")
              : t("errors:ATTACHMENT_LIMIT_REACHED"),
      });
    return {
      editor: {
        attach: t("instructor:tasks.attach"),
        historyLink: t("instructor:tasks.historyLink"),
        memberNotesHint: t("instructor:tasks.memberNotesHint"),
        memberNotesTitle: t("instructor:tasks.memberNotes"),
        noValue: t("instructor:tasks.noValue"),
        observationsField: t("instructor:tasks.observationsField"),
        observationsHint: t("instructor:tasks.observationsHint"),
        observationsTitle: t("instructor:tasks.observations"),
        recover: t("instructor:tasks.recover"),
        removeFile: (name) => t("instructor:tasks.removeFile", { name }),
        save: t("instructor:tasks.save"),
        saving: t("instructor:tasks.saving"),
        staleNotice: t("instructor:tasks.staleNotice"),
      },
      errorText: (error, fallback) => {
        const code = apiCode(error);
        return code === undefined
          ? fallback
          : t(`errors:${code}`, { defaultValue: t("errors:INTERNAL_ERROR") });
      },
      history: {
        close: t("instructor:tasks.close"),
        more: t("instructor:tasks.more"),
        title: t("instructor:tasks.historyTitle"),
      },
      loadError: t("instructor:tasks.loadError"),
      openError: t("instructor:tasks.openError"),
      rejection,
      retry: t("instructor:tasks.retry"),
      staleVersion: (error) => apiCode(error) === "STALE_VERSION",
      tasks: {
        add: t("instructor:tasks.add"),
        attach: t("instructor:tasks.attach"),
        cancel: t("instructor:tasks.cancel"),
        close: t("instructor:tasks.close"),
        complete: t("instructor:tasks.complete"),
        create: t("instructor:tasks.create"),
        doneLine: (task) =>
          task.doneAt == null || task.doneBy == null
            ? undefined
            : t("instructor:tasks.doneBy", {
                article: personArticle(task.doneBy.displayName, task.doneBy.gender, formats.locale),
                date: dayMonth(task.doneAt),
                name: task.doneBy.displayName,
              }),
        edit: t("instructor:tasks.edit"),
        editField: t("instructor:tasks.editField"),
        empty: t("instructor:tasks.empty"),
        loading: t("instructor:tasks.loading"),
        meta: (task) =>
          t("instructor:tasks.meta", {
            author: task.createdBy.displayName,
            date: dayMonth(task.createdAt),
          }),
        newTask: t("instructor:tasks.newTask"),
        newTaskField: t("instructor:tasks.newTaskField"),
        rejection,
        remove: t("instructor:tasks.remove"),
        removeConfirm: t("instructor:tasks.deleteAction"),
        removeFile: (name) => t("instructor:tasks.removeFile", { name }),
        removeTitle: t("instructor:tasks.deleteConfirm"),
        reopen: t("instructor:tasks.reopen"),
        save: t("instructor:tasks.save"),
        state: (state) => t(`enums:taskState.${state}`),
        title: t("instructor:tasks.tasksTitle"),
      },
      writeError: t("errors:INTERNAL_ERROR"),
    };
  }, [formats, t]);
}
