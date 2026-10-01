import { useCallback, useEffect, useRef, useState } from "react";

import { isApiError } from "./api-error";
import type { ApiClient } from "./client";
import type { components } from "./generated/schema";
import { type FileLimits, loadFileLimits, uploadSignedGrant } from "./uploads";

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
 * The api has not given this submission its answer yet: no answer at all (a network failure), or
 * `409 IDEMPOTENCY_KEY_REUSED {reason: IN_PROGRESS}` — its first request is still running, which
 * is not its answer (CONVENCIONS_API §7, E79).
 */
function unanswered(cause: unknown): boolean {
  if (!isApiError(cause) || cause.status === 0) return true;
  const details = cause.details as { reason?: unknown } | null | undefined;
  return cause.code === "IDEMPOTENCY_KEY_REUSED" && details?.reason === "IN_PROGRESS";
}

/**
 * The api refused an uploaded file's key itself, so the file uploaded again gives the submission a
 * key it can claim (R-10-11): its grant is over (`INVALID_STATE` from the claim), or the key is
 * bound to another entity already (`422 ATTACHMENT_ENTITY_MISMATCH`: an earlier submission the api
 * created with it, E6-W04 step 0d). The frozen dog of a pending readmission is `INVALID_STATE` too,
 * with its own reason: uploading again would not change it.
 */
function refusedKey(cause: unknown): boolean {
  if (!isApiError(cause) || cause.status === 0) return false;
  if (cause.code === "ATTACHMENT_ENTITY_MISMATCH") return true;
  if (cause.code !== "INVALID_STATE") return false;
  const details = cause.details as { reason?: unknown } | null | undefined;
  return details?.reason !== "READMISSION_PENDING";
}

/** A file the api refused for itself (R-10-11): said by its name, while the other files go on. */
export interface FollowupFileRefusal {
  file: File;
  reason: "ATTACHMENT_LIMIT_REACHED" | "FILE_TOO_LARGE" | "FILE_TYPE_NOT_ALLOWED";
}

const FILE_REFUSALS: readonly FollowupFileRefusal["reason"][] = [
  "ATTACHMENT_LIMIT_REACHED",
  "FILE_TOO_LARGE",
  "FILE_TYPE_NOT_ALLOWED",
];

const NO_REFUSALS: readonly FollowupFileRefusal[] = [];

/** The api's refusal of one file (its type, its size, the entity's limit); none for the rest. */
function fileRefusal(cause: unknown): FollowupFileRefusal["reason"] | undefined {
  if (!isApiError(cause) || cause.status === 0) return undefined;
  return FILE_REFUSALS.find((code) => code === cause.code);
}

const fileNumbers = new WeakMap<File, number>();
let lastFileNumber = 0;

/** A picked file's number: a submission's signature names its files by it (E74). */
function fileNumber(file: File): number {
  const known = fileNumbers.get(file);
  if (known !== undefined) return known;
  lastFileNumber += 1;
  fileNumbers.set(file, lastFileNumber);
  return lastFileNumber;
}

/** A picked file and the key of its upload. */
interface UploadedFile {
  file: File;
  fileKey: string;
}

/**
 * How long before its `expiresAt` an uploaded file is uploaded again rather than claimed: the
 * time the claim takes to reach the api, and a device clock a little behind the api's. A clock
 * further off is caught by the api's refusal (`refusedKey`).
 */
const UPLOAD_GRANT_MARGIN_MS = 30_000;

/**
 * One `Idempotency-Key` per submission (CONVENCIONS_API §7, ruling E74): the key is created when a
 * submission starts and reused by its retries — the same payload sent again after a request that
 * got no answer (a network failure, or `IN_PROGRESS`, E79) — so the api creates or deletes once; it
 * is retired as soon as the api answers, success or refusal, so the next submission of the same
 * payload is a new one with a new key. (A double tap while a write runs sends nothing: `run`
 * refuses it.)
 */
function useSubmissionKeys() {
  const pending = useRef(new Map<string, string>());
  return useCallback(
    async <Result>(signature: string, send: (key: string) => Promise<Result>): Promise<Result> => {
      const key = pending.current.get(signature) ?? crypto.randomUUID();
      pending.current.set(signature, key);
      try {
        const result = await send(key);
        pending.current.delete(signature);
        return result;
      } catch (cause) {
        if (!unanswered(cause)) pending.current.delete(signature);
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
  // The files the last write's api refused one by one (E6-W04 step 0d), said with its error.
  const [refusals, setRefusals] = useState<readonly FollowupFileRefusal[]>(NO_REFUSALS);
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
  // Each picked file's upload: its key, good until the grant's end (epoch ms, R-10-11), and spent
  // once the api registers it.
  const uploaded = useRef(new WeakMap<File, { expiresAt: number; fileKey: string }>());
  // The keys of each submission the api has not answered, by its signature (its payload: the
  // text and the picked files). Only that submission sent again — its retry — sends them as they
  // were, whatever their grant (E74); any other one uploads those files again, since the api may
  // have bound them to what it created (E6-W04 step 0d). An answer releases them.
  const held = useRef(new Map<string, ReadonlyMap<File, string>>());
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
      setRefusals(NO_REFUSALS);
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

  /**
   * Uploads each file of the submission `signature`, or reuses a key: the one this submission
   * holds since the api left it unanswered (E74: its retry repeats its payload and key, whatever
   * the grant), or a key no unanswered submission holds while its grant lasts (R-10-11). A key
   * another submission holds is never reused (E6-W04 step 0d). `reused`: the files whose key was
   * not uploaded now.
   */
  const upload = useCallback(
    async (files: readonly File[], purpose: FollowupAttachmentEntity, signature: string) => {
      const own = held.current.get(signature);
      const holding = new Set([...held.current.values()].flatMap((keys) => [...keys.values()]));
      const keys: UploadedFile[] = [];
      const reused: File[] = [];
      for (const file of files) {
        const known = uploaded.current.get(file);
        const fileKey =
          own?.get(file) ??
          (known !== undefined &&
          !holding.has(known.fileKey) &&
          Date.now() < known.expiresAt - UPLOAD_GRANT_MARGIN_MS
            ? known.fileKey
            : undefined);
        if (fileKey !== undefined) {
          keys.push({ file, fileKey });
          reused.push(file);
          continue;
        }
        const grant = await uploadSignedGrant(client, file, purpose);
        // An `expiresAt` that cannot be read is over at once: the file is uploaded again.
        const expiresAt = Date.parse(grant.expiresAt);
        uploaded.current.set(file, {
          expiresAt: Number.isFinite(expiresAt) ? expiresAt : 0,
          fileKey: grant.fileKey,
        });
        keys.push({ file, fileKey: grant.fileKey });
      }
      return { keys, reused };
    },
    [client],
  );

  /**
   * Sends the submission `signature`, which claims `keys`: they are held for it while the api has
   * not answered it, released by any answer, and spent when it registers them (R-10-11).
   */
  const claim = useCallback(
    async <Result>(
      signature: string,
      keys: readonly UploadedFile[],
      send: () => Promise<Result>,
    ): Promise<Result> => {
      try {
        const result = await send();
        held.current.delete(signature);
        for (const { file } of keys) uploaded.current.delete(file);
        return result;
      } catch (cause) {
        if (unanswered(cause)) {
          held.current.set(signature, new Map(keys.map(({ file, fileKey }) => [file, fileKey])));
        } else {
          held.current.delete(signature);
        }
        throw cause;
      }
    },
    [],
  );

  /**
   * Uploads `files` and sends the submission `signature` that claims them. When the api refuses a
   * reused key itself (`refusedKey`: its grant is over — a retry after the five minutes, or the
   * retry of an unanswered submission the api never received — or it is bound to what an earlier
   * submission created), those files are uploaded again and the submission, a new one with new
   * keys, is sent once more.
   */
  const withUploads = useCallback(
    async (
      files: readonly File[],
      purpose: FollowupAttachmentEntity,
      signature: string,
      send: (keys: readonly UploadedFile[]) => Promise<void>,
    ) => {
      const first = await upload(files, purpose, signature);
      try {
        await send(first.keys);
      } catch (cause) {
        if (first.reused.length === 0 || !refusedKey(cause)) throw cause;
        for (const file of first.reused) uploaded.current.delete(file);
        await send((await upload(files, purpose, signature)).keys);
      }
    },
    [upload],
  );

  const createTask = useCallback(
    (text: string, files: readonly File[]) =>
      run("create", () => {
        const signature = `create:${JSON.stringify({ dogId, files: files.map(fileNumber), text })}`;
        return withUploads(files, "TASK", signature, async (keys) => {
          const body = { attachmentIds: keys.map((item) => item.fileKey), dogId, text };
          await claim(signature, keys, () =>
            submit(`create:${JSON.stringify(body)}`, (key) =>
              client.POST("/tasks", { body, params: { header: { "Idempotency-Key": key } } }),
            ),
          );
        });
      }),
    [claim, client, dogId, run, submit, withUploads],
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

  /**
   * A selection's files, each uploaded and registered on its own (E6-W04 step 0d): an instructor
   * cannot read the club's limits, so the api is the first to check them. A file it refuses for
   * itself (`fileRefusal`) is kept in `refusals` and the next files still go; any other failure
   * stops the selection there. `false` when a file was not attached.
   */
  const addAttachments = useCallback(
    async (entityType: "DOG_OBSERVATIONS" | "TASK", entityId: string, files: readonly File[]) => {
      const refused: FollowupFileRefusal[] = [];
      let attached = 0;
      const done = await run(`attachment:${entityId}`, async () => {
        try {
          for (const file of files) {
            const name = attachmentName(file.name);
            const signature = `attach:${JSON.stringify({
              entityId,
              entityType,
              file: fileNumber(file),
              name,
            })}`;
            try {
              await withUploads([file], entityType, signature, async (keys) => {
                // A file registered already answers the same attachment again (R-10-11).
                for (const { fileKey } of keys) {
                  const body = { entityId, entityType, fileKey, name };
                  await claim(signature, keys, () =>
                    submit(`attach:${JSON.stringify(body)}`, (key) =>
                      client.POST("/attachments", {
                        body,
                        params: { header: { "Idempotency-Key": key } },
                      }),
                    ),
                  );
                }
              });
              attached += 1;
            } catch (cause) {
              const reason = fileRefusal(cause);
              if (reason === undefined) {
                // The files registered before this one are attached: they show next to the error
                // (even without an answer, which `run` does not read again), so none is picked twice.
                if (attached > 0) await Promise.all([readTasks("quiet"), readCard(true)]);
                throw cause;
              }
              refused.push({ file, reason });
            }
          }
        } finally {
          if (refused.length > 0) setRefusals(refused);
        }
      });
      return done && refused.length === 0;
    },
    [claim, client, readCard, readTasks, run, submit, withUploads],
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
      setRefusals(NO_REFUSALS);
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
    /** The files the last write's api refused one by one: «{fitxer}: {missatge}» each. */
    refusals,
    reloadCard: () => void readCard(false),
    reloadTasks: () => void readTasks("load"),
    removeAttachment,
    reopenTask,
    tasks,
    tasksPaging,
  };
}

export type DogFollowup = ReturnType<typeof useDogFollowup>;
