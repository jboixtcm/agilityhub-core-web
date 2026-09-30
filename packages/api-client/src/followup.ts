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

/** The paging of the editable list (26 and D13's drawer): the pages of `GET /tasks` read so far. */
export interface FollowupTasksPaging {
  /** «Mostra'n més» failed to read the next page. */
  error?: unknown;
  /** The last page came back full: there may be another. */
  more: boolean;
  /** «Mostra'n més» is reading the next page. */
  pending: boolean;
}

/** CONVENCIONS_API §4: the tasks are read in pages of 50 (the list and the history drawer). */
export const FOLLOWUP_HISTORY_PAGE_SIZE = 50;

/** `Attachment.name` is at most 80 characters (S10 §3): a longer file name keeps its extension. */
export function attachmentName(fileName: string): string {
  if (fileName.length <= 80) return fileName;
  const dot = fileName.lastIndexOf(".");
  const extension = dot > 0 && fileName.length - dot <= 10 ? fileName.slice(dot) : "";
  return `${fileName.slice(0, 80 - extension.length)}${extension}`;
}

/**
 * One `Idempotency-Key` per submission (CONVENCIONS_API §7, ruling E74): the key is created when a
 * submission starts and reused by its retries — the same payload sent again after a request that
 * got no answer (a network failure) — so the api creates or deletes once; it is retired as soon as
 * the api answers, success or refusal, so the next submission of the same payload is a new one
 * with a new key. (A double tap while a write runs sends nothing: `run` refuses it.)
 */
function useSubmissionKeys() {
  const unanswered = useRef(new Map<string, string>());
  return useCallback(
    async <Result>(signature: string, send: (key: string) => Promise<Result>): Promise<Result> => {
      const key = unanswered.current.get(signature) ?? crypto.randomUUID();
      unanswered.current.set(signature, key);
      try {
        const result = await send(key);
        unanswered.current.delete(signature);
        return result;
      } catch (cause) {
        if (isApiError(cause) && cause.status !== 0) unanswered.current.delete(signature);
        throw cause;
      }
    },
    [],
  );
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
  const [tasksPaging, setTasksPaging] = useState<FollowupTasksPaging>({
    more: false,
    pending: false,
  });
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
  // How many pages of `GET /tasks` the list shows: every read (after a write too) reads them all.
  const taskPages = useRef(1);
  const uploaded = useRef(new WeakMap<File, string>());
  const submit = useSubmissionKeys();

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

  /**
   * The dog's tasks, done ones included, as the api orders them (`createdAt` desc): the pages the
   * list shows, read again together so a write on any page is seen (R-10-10). `more` reads one
   * page further («Mostra'n més»); only the newest read is applied.
   */
  const readTasks = useCallback(
    async (mode: "load" | "more" | "quiet") => {
      if (!tasksEnabled) return;
      if (mode === "more") {
        taskPages.current += 1;
        setTasksPaging((value) => ({ ...value, error: undefined, pending: true }));
      }
      tasksRequest.current += 1;
      const request = tasksRequest.current;
      const pages = taskPages.current;
      if (mode === "load") setTasks({ status: "loading" });
      try {
        const lists = await Promise.all(
          Array.from({ length: pages }, async (_, page) => {
            const { data } = await client.GET("/tasks", {
              params: {
                query: { dogId, includeDone: true, page, size: FOLLOWUP_HISTORY_PAGE_SIZE },
              },
            });
            if (data === undefined) throw new TypeError("The tasks response did not contain data");
            return data.items;
          }),
        );
        if (request !== tasksRequest.current) return;
        // A task created between two page reads moves the others one place: keep each once.
        const seen = new Set<string>();
        const items = lists.flat().filter((item) => {
          if (seen.has(item.id)) return false;
          seen.add(item.id);
          return true;
        });
        setTasks({ data: items, status: "ready" });
        setTasksPaging({
          more: (lists.at(-1)?.length ?? 0) === FOLLOWUP_HISTORY_PAGE_SIZE,
          pending: false,
        });
      } catch (cause) {
        if (request !== tasksRequest.current) return;
        if (mode === "more") {
          // The list keeps what it showed; «Mostra'n més» says why and asks that page again.
          taskPages.current -= 1;
          setTasksPaging({ error: cause, more: true, pending: false });
        } else {
          setTasksPaging((value) => ({ ...value, pending: false }));
          if (mode === "quiet") setError(cause);
          else setTasks({ error: cause, status: "error" });
        }
      }
    },
    [client, dogId, tasksEnabled],
  );

  useEffect(() => {
    taskPages.current = 1;
    void readCard(false);
    void readTasks("load");
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
        if (reread) await Promise.all([readTasks("quiet"), readCard(true)]);
        return true;
      } catch (cause) {
        setError(cause);
        // The api refused it (a state or a version changed): show what is true now.
        if (isApiError(cause) && cause.status !== 0) {
          await Promise.all([readTasks("quiet"), readCard(true)]);
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
        await submit(`create:${JSON.stringify(body)}`, (key) =>
          client.POST("/tasks", { body, params: { header: { "Idempotency-Key": key } } }),
        );
      }),
    [client, dogId, run, submit, upload],
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
        await submit(`delete:${task.id}`, (key) =>
          client.DELETE("/tasks/{id}", {
            params: { header: { "Idempotency-Key": key }, path: { id: task.id } },
          }),
        );
      }),
    [client, run, submit],
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
          await submit(`attach:${JSON.stringify(body)}`, (key) =>
            client.POST("/attachments", { body, params: { header: { "Idempotency-Key": key } } }),
          );
        }
      }),
    [client, run, submit, upload],
  );

  const removeAttachment = useCallback(
    (attachmentId: string) =>
      run(`attachment:${attachmentId}`, async () => {
        await submit(`detach:${attachmentId}`, (key) =>
          client.DELETE("/attachments/{id}", {
            params: { header: { "Idempotency-Key": key }, path: { id: attachmentId } },
          }),
        );
      }),
    [client, run, submit],
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

  /**
   * A fresh signed url (they last 5 minutes, R-10-11), opened in a new tab. Resolves to the
   * failure (`undefined` when the file opened), which the clicked clip says next to it.
   */
  const openAttachment = useCallback(
    async (
      entityType: FollowupAttachmentEntity,
      entityId: string,
      attachmentId: string,
    ): Promise<unknown> => {
      try {
        const { data } = await client.GET("/attachments", {
          params: { query: { entityId, entityType } },
        });
        const found = data?.items.find((item) => item.id === attachmentId);
        if (found === undefined) throw new TypeError("The attachment is gone");
        window.open(found.url, "_blank", "noopener,noreferrer");
        return undefined;
      } catch (cause) {
        return cause;
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
    return run(
      "observations",
      async () => {
        try {
          const { data } = await submit(`observations:${JSON.stringify(body)}`, (key) =>
            client.PUT("/dogs/{id}/observations", {
              body,
              params: { header: { "Idempotency-Key": key }, path: { id: dogId } },
            }),
          );
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
  }, [client, dirty, dogId, draft, run, submit]);

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
    readMoreTasks: () => readTasks("more"),
    reloadCard: () => void readCard(false),
    reloadTasks: () => void readTasks("load"),
    removeAttachment,
    reopenTask,
    tasks,
    tasksPaging,
  };
}

export type DogFollowup = ReturnType<typeof useDogFollowup>;
