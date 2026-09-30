import { useCallback, useEffect, useRef, useState } from "react";

import { isApiError } from "./api-error";
import type { ApiClient } from "./client";
import type { components } from "./generated/schema";
import { type FileLimits, loadFileLimits, uploadSigned } from "./uploads";

export type FollowupCard = components["schemas"]["InstructorCard"];
export type FollowupTask = components["schemas"]["Task"];
export type FollowupAttachmentEntity = components["schemas"]["AttachmentRequest"]["entityType"];

export type FollowupLoad<Data> =
  { status: "loading" } | { error: unknown; status: "error" } | { data: Data; status: "ready" };

/** What is being written now: one action at a time (a second tap is refused while it runs). */
export type FollowupBusy =
  | "create"
  | "observations"
  | `attachment:${string}`
  | `complete:${string}`
  | `delete:${string}`
  | `patch:${string}`
  | `reopen:${string}`;

/** The observations the caller is typing, and the version they were read at (R-10-12). */
interface ObservationsDraft {
  baseVersion: number;
  text: string;
}

/** «Veure l'historial complet ›»: the pages of `GET /tasks?includeDone=true` read so far. */
export interface FollowupHistory {
  error?: unknown;
  items: FollowupTask[];
  /** The last page came back full: there may be another. */
  more: boolean;
  pending: boolean;
  /** Pages read. */
  read: number;
}

/** CONVENCIONS_API §4: the history drawer reads pages of 50. */
export const FOLLOWUP_HISTORY_PAGE_SIZE = 50;

/** `Attachment.name` is at most 80 characters (S10 §3): a longer file name keeps its extension. */
export function attachmentName(fileName: string): string {
  if (fileName.length <= 80) return fileName;
  const dot = fileName.lastIndexOf(".");
  const extension = dot > 0 && fileName.length - dot <= 10 ? fileName.slice(dot) : "";
  return `${fileName.slice(0, 80 - extension.length)}${extension}`;
}

/**
 * One `Idempotency-Key` per payload (CONVENCIONS_API §7): a retry of the same payload (after a
 * network failure, or a double tap) reuses the key, so the api creates or deletes once; another
 * payload gets a new one.
 */
function useIdempotencyKeys() {
  const keys = useRef(new Map<string, string>());
  return useCallback((signature: string) => {
    const known = keys.current.get(signature);
    if (known !== undefined) return known;
    const key = crypto.randomUUID();
    keys.current.set(signature, key);
    return key;
  }, []);
}

/**
 * The data and the writes of screen 26 and of D13's drawer (S10 R-10-10…R-10-12), one hook for
 * both shells: the dog's instructor card (observations, the member's note), its tasks as the api
 * orders them, and every write — tasks created with their signed uploads, edited, deleted,
 * completed and reopened; attachments added and removed; the private observations saved with
 * their version. After a write the card and the list are read again, so a read in the same flow
 * sees it (the counters of 22 and D13 too). Nothing is recomputed here: states, counters, versions
 * and signed urls are the api's, and a url is never kept (it lasts 5 minutes): `openAttachment`
 * reads a fresh one.
 */
export function useDogFollowup(client: ApiClient, dogId: string, options: { tasks: boolean }) {
  const tasksEnabled = options.tasks;
  const [card, setCard] = useState<FollowupLoad<FollowupCard>>({ status: "loading" });
  const [tasks, setTasks] = useState<FollowupLoad<FollowupTask[]>>({ status: "loading" });
  const [limits, setLimits] = useState<FileLimits>({});
  const [busy, setBusy] = useState<FollowupBusy>();
  const [error, setError] = useState<unknown>();
  const [draft, setDraft] = useState<ObservationsDraft>();
  const [recoverable, setRecoverable] = useState<string>();
  const [stale, setStale] = useState(false);
  const [history, setHistory] = useState<FollowupHistory>({
    items: [],
    more: false,
    pending: false,
    read: 0,
  });
  const historyReading = useRef(false);
  const running = useRef(false);
  const cardRequest = useRef(0);
  const tasksRequest = useRef(0);
  const uploaded = useRef(new WeakMap<File, string>());
  const keyFor = useIdempotencyKeys();

  const readCard = useCallback(
    async (quiet: boolean) => {
      cardRequest.current += 1;
      const request = cardRequest.current;
      if (!quiet) setCard({ status: "loading" });
      try {
        const { data } = await client.GET("/dogs/{id}/instructor-card", {
          params: { path: { id: dogId } },
        });
        if (data === undefined) throw new TypeError("The card response did not contain data");
        if (request !== cardRequest.current) return;
        setCard((previous) => {
          // A read answered after a newer save never brings older observations back.
          const kept = previous.status === "ready" ? previous.data.observations : undefined;
          return kept !== undefined &&
            data.observations !== undefined &&
            kept.version > data.observations.version
            ? { data: { ...data, observations: kept }, status: "ready" }
            : { data, status: "ready" };
        });
      } catch (cause) {
        if (request !== cardRequest.current) return;
        if (quiet) setError(cause);
        else setCard({ error: cause, status: "error" });
      }
    },
    [client, dogId],
  );

  const readTasks = useCallback(
    async (quiet: boolean) => {
      if (!tasksEnabled) return;
      tasksRequest.current += 1;
      const request = tasksRequest.current;
      if (!quiet) setTasks({ status: "loading" });
      try {
        const { data } = await client.GET("/tasks", {
          params: { query: { dogId, includeDone: true } },
        });
        if (data === undefined) throw new TypeError("The tasks response did not contain data");
        if (request === tasksRequest.current) setTasks({ data: data.items, status: "ready" });
      } catch (cause) {
        if (request !== tasksRequest.current) return;
        if (quiet) setError(cause);
        else setTasks({ error: cause, status: "error" });
      }
    },
    [client, dogId, tasksEnabled],
  );

  useEffect(() => {
    void readCard(false);
    void readTasks(false);
  }, [readCard, readTasks]);

  useEffect(() => {
    if (!tasksEnabled) return undefined;
    let current = true;
    loadFileLimits(client).then(
      (value) => {
        if (current) setLimits(value);
      },
      () => undefined,
    );
    return () => {
      current = false;
    };
  }, [client, tasksEnabled]);

  /** Runs one write at a time; `false` when it was refused or failed (its error is kept). */
  const run = useCallback(
    async (label: FollowupBusy, write: () => Promise<void>, reread = true): Promise<boolean> => {
      if (running.current) return false;
      running.current = true;
      setBusy(label);
      setError(undefined);
      try {
        await write();
        if (reread) await Promise.all([readTasks(true), readCard(true)]);
        return true;
      } catch (cause) {
        setError(cause);
        // The api refused it (a state or a version changed): show what is true now.
        if (isApiError(cause) && cause.status !== 0) {
          await Promise.all([readTasks(true), readCard(true)]);
        }
        return false;
      } finally {
        running.current = false;
        setBusy(undefined);
      }
    },
    [readCard, readTasks],
  );

  /** Uploads each file once (a retry reuses its `fileKey`, so the payload and its key repeat). */
  const upload = useCallback(
    async (files: readonly File[], purpose: FollowupAttachmentEntity) => {
      const keys: { file: File; fileKey: string }[] = [];
      for (const file of files) {
        let fileKey = uploaded.current.get(file);
        if (fileKey === undefined) {
          fileKey = await uploadSigned(client, file, purpose);
          uploaded.current.set(file, fileKey);
        }
        keys.push({ file, fileKey });
      }
      return keys;
    },
    [client],
  );

  const createTask = useCallback(
    (text: string, files: readonly File[]) =>
      run("create", async () => {
        const attachmentIds = (await upload(files, "TASK")).map((item) => item.fileKey);
        const body = { attachmentIds, dogId, text };
        await client.POST("/tasks", {
          body,
          params: { header: { "Idempotency-Key": keyFor(`create:${JSON.stringify(body)}`) } },
        });
      }),
    [client, dogId, keyFor, run, upload],
  );

  /**
   * The pencil (R-10-10): the text with the version the edit was opened at (`baseVersion`), never
   * a later read's, so another instructor's change in between answers `STALE_VERSION`.
   */
  const patchTask = useCallback(
    (task: FollowupTask, text: string, baseVersion: number = task.version) =>
      run(`patch:${task.id}`, async () => {
        await client.PATCH("/tasks/{id}", {
          body: { text, version: baseVersion },
          params: { path: { id: task.id } },
        });
      }),
    [client, run],
  );

  const deleteTask = useCallback(
    (task: FollowupTask) =>
      run(`delete:${task.id}`, async () => {
        await client.DELETE("/tasks/{id}", {
          params: {
            header: { "Idempotency-Key": keyFor(`delete:${task.id}`) },
            path: { id: task.id },
          },
        });
      }),
    [client, keyFor, run],
  );

  const completeTask = useCallback(
    (task: FollowupTask) =>
      run(`complete:${task.id}`, async () => {
        await client.POST("/tasks/{id}/completion", { params: { path: { id: task.id } } });
      }),
    [client, run],
  );

  const reopenTask = useCallback(
    (task: FollowupTask) =>
      run(`reopen:${task.id}`, async () => {
        await client.POST("/tasks/{id}/reopening", { params: { path: { id: task.id } } });
      }),
    [client, run],
  );

  const addAttachments = useCallback(
    (entityType: "DOG_OBSERVATIONS" | "TASK", entityId: string, files: readonly File[]) =>
      run(`attachment:${entityId}`, async () => {
        for (const { file, fileKey } of await upload(files, entityType)) {
          const body = { entityId, entityType, fileKey, name: attachmentName(file.name) };
          await client.POST("/attachments", {
            body,
            params: { header: { "Idempotency-Key": keyFor(`attach:${JSON.stringify(body)}`) } },
          });
        }
      }),
    [client, keyFor, run, upload],
  );

  const removeAttachment = useCallback(
    (attachmentId: string) =>
      run(`attachment:${attachmentId}`, async () => {
        await client.DELETE("/attachments/{id}", {
          params: {
            header: { "Idempotency-Key": keyFor(`detach:${attachmentId}`) },
            path: { id: attachmentId },
          },
        });
      }),
    [client, keyFor, run],
  );

  /**
   * The full history of the dog's tasks, done ones included (S10 §2 row 26), page by page:
   * `page = 0` starts again, each next page is appended; one read at a time.
   */
  const readHistory = useCallback(
    async (page: number) => {
      if (historyReading.current) return;
      historyReading.current = true;
      setHistory((value) =>
        page === 0
          ? { items: [], more: false, pending: true, read: 0 }
          : { ...value, error: undefined, pending: true },
      );
      try {
        const { data } = await client.GET("/tasks", {
          params: {
            query: { dogId, includeDone: true, page, size: FOLLOWUP_HISTORY_PAGE_SIZE },
          },
        });
        const items = data?.items ?? [];
        setHistory((value) => {
          const known = new Set(value.items.map((item) => item.id));
          return {
            items: [...value.items, ...items.filter((item) => !known.has(item.id))],
            more: items.length === FOLLOWUP_HISTORY_PAGE_SIZE,
            pending: false,
            read: page + 1,
          };
        });
      } catch (cause) {
        setHistory((value) => ({ ...value, error: cause, pending: false }));
      } finally {
        historyReading.current = false;
      }
    },
    [client, dogId],
  );

  /** A fresh signed url (they last 5 minutes, R-10-11), opened in a new tab. */
  const openAttachment = useCallback(
    async (entityType: FollowupAttachmentEntity, entityId: string, attachmentId: string) => {
      setError(undefined);
      try {
        const { data } = await client.GET("/attachments", {
          params: { query: { entityId, entityType } },
        });
        const found = data?.items.find((item) => item.id === attachmentId);
        if (found === undefined) throw new TypeError("The attachment is gone");
        window.open(found.url, "_blank", "noopener,noreferrer");
      } catch (cause) {
        setError(cause);
      }
    },
    [client],
  );

  const server = card.status === "ready" ? card.data.observations : undefined;
  const serverText = server?.text ?? "";
  const text = draft?.text ?? serverText;
  const dirty = draft !== undefined && draft.text !== serverText;

  const setObservationsText = useCallback(
    (value: string) => {
      setDraft((current) =>
        current === undefined
          ? { baseVersion: server?.version ?? 0, text: value }
          : { ...current, text: value },
      );
    },
    [server?.version],
  );

  const saveObservations = useCallback(async () => {
    if (draft === undefined || !dirty) return false;
    const body = { text: draft.text, version: draft.baseVersion };
    const key = keyFor(`observations:${JSON.stringify(body)}`);
    return run(
      "observations",
      async () => {
        try {
          const { data } = await client.PUT("/dogs/{id}/observations", {
            body,
            params: { header: { "Idempotency-Key": key }, path: { id: dogId } },
          });
          if (data === undefined) throw new TypeError("The observations response had no data");
          setCard((previous) =>
            previous.status !== "ready" || previous.data.observations === undefined
              ? previous
              : {
                  data: {
                    ...previous.data,
                    observations: {
                      ...previous.data.observations,
                      text: data.text,
                      updatedAt: data.updatedAt,
                      updatedByName: data.updatedByName,
                      version: data.version,
                    },
                  },
                  status: "ready",
                },
          );
          setDraft(undefined);
          setRecoverable(undefined);
          setStale(false);
        } catch (cause) {
          if (isApiError(cause, "STALE_VERSION")) {
            // Someone saved them first: the field shows theirs, the typed text waits to be
            // recovered by hand (never sent again with the fresh version on its own).
            setRecoverable(draft.text);
            setDraft(undefined);
            setStale(true);
          }
          throw cause;
        }
      },
      false,
    );
  }, [client, dirty, dogId, draft, keyFor, run]);

  const recoverObservations = useCallback(() => {
    if (recoverable === undefined) return;
    setDraft({ baseVersion: server?.version ?? 0, text: recoverable });
    setRecoverable(undefined);
    setStale(false);
  }, [recoverable, server?.version]);

  return {
    addAttachments,
    busy,
    card,
    clearError: () => {
      setError(undefined);
    },
    completeTask,
    createTask,
    deleteTask,
    error,
    history,
    limits,
    observations: {
      dirty,
      recover: recoverObservations,
      recoverable,
      save: saveObservations,
      saving: busy === "observations",
      setText: setObservationsText,
      stale,
      text,
    },
    openAttachment,
    patchTask,
    readHistory,
    reloadCard: () => void readCard(false),
    reloadTasks: () => void readTasks(false),
    removeAttachment,
    reopenTask,
    tasks,
  };
}

export type DogFollowup = ReturnType<typeof useDogFollowup>;
