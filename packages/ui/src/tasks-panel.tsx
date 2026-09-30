import { type ChangeEvent, type ReactNode, useEffect, useId, useRef, useState } from "react";

import { Badge, Button, Drawer, IconButton, Modal, Skeleton, Textarea } from "./components";
import { Icon } from "./icons/Icon";

// ── Attachments ──────────────────────────────────────────────────────────────────────────────

/** The club's file limits (R-10-11): each is absent when the session cannot read it. */
export interface AttachmentLimits {
  allowedTypes?: readonly string[] | undefined;
  maxPerEntity?: number | undefined;
  maxSizeMb?: number | undefined;
}

/** Why a file is refused before asking for a signed url: the api's own codes (R-10-11). */
export type AttachmentRejection =
  "ATTACHMENT_LIMIT_REACHED" | "FILE_TOO_LARGE" | "FILE_TYPE_NOT_ALLOWED";

function typeAllowed(type: string, allowed: readonly string[]): boolean {
  return allowed.some((item) =>
    item.endsWith("/*") ? type.startsWith(item.slice(0, -1)) : type === item,
  );
}

/**
 * The client-side check of a file against the club's limits, with the same numbers as the api:
 * `files.maxSizeMb` (MiB), `files.allowedTypes` (`image/*` covers every image) and
 * `files.maxAttachmentsPerEntity` counting the `current` ones. A limit that is not known is not
 * checked here (the api refuses the file instead).
 */
export function attachmentRejection(
  file: { size: number; type: string },
  limits: AttachmentLimits,
  current: number,
): AttachmentRejection | undefined {
  if (limits.maxPerEntity !== undefined && current >= limits.maxPerEntity) {
    return "ATTACHMENT_LIMIT_REACHED";
  }
  if (limits.allowedTypes !== undefined && !typeAllowed(file.type, limits.allowedTypes)) {
    return "FILE_TYPE_NOT_ALLOWED";
  }
  if (limits.maxSizeMb !== undefined && file.size > limits.maxSizeMb * 1024 * 1024) {
    return "FILE_TOO_LARGE";
  }
  return undefined;
}

export interface AttachmentPickerProps extends AttachmentLimits {
  /** How many the entity has already (live and picked): the limit counts them. */
  current: number;
  disabled?: boolean;
  label: string;
  onPick: (files: File[]) => void;
  onReject: (reason: AttachmentRejection, file: File) => void;
}

/**
 * The clip button of 26 and D13: picks files and checks each against the club's limits before any
 * signed url is asked for; the refused ones go to `onReject` with the reason, the rest to `onPick`.
 */
export function AttachmentPicker({
  allowedTypes,
  current,
  disabled = false,
  label,
  maxPerEntity,
  maxSizeMb,
  onPick,
  onReject,
}: AttachmentPickerProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const limits: AttachmentLimits = { allowedTypes, maxPerEntity, maxSizeMb };
  const change = (event: ChangeEvent<HTMLInputElement>) => {
    const files = [...(event.currentTarget.files ?? [])];
    event.currentTarget.value = "";
    const accepted: File[] = [];
    for (const file of files) {
      const reason = attachmentRejection(file, limits, current + accepted.length);
      if (reason === undefined) accepted.push(file);
      else onReject(reason, file);
    }
    if (accepted.length > 0) onPick(accepted);
  };
  return (
    <span className="ah-attachment-picker">
      <Button
        disabled={disabled}
        onClick={() => {
          inputRef.current?.click();
        }}
        variant="ghost"
      >
        <Icon aria-hidden="true" name="clip" /> {label}
      </Button>
      <input
        accept={allowedTypes?.join(",")}
        aria-label={label}
        className="ah-sr-only"
        disabled={disabled}
        multiple
        onChange={change}
        ref={inputRef}
        tabIndex={-1}
        type="file"
      />
    </span>
  );
}

export interface AttachmentChip {
  id: string;
  name: string;
}

/**
 * «{icona de clip} {fitxer}» (mockups 26 and D13): each opens its file through `onOpen` (a fresh
 * signed url, never a kept one); with `onRemove`, a ✕ beside each.
 */
export function AttachmentChips({
  busy = false,
  items,
  onOpen,
  onRemove,
  removeLabel,
}: {
  busy?: boolean;
  items: readonly AttachmentChip[];
  onOpen: (item: AttachmentChip) => void;
  onRemove?: ((item: AttachmentChip) => void) | undefined;
  removeLabel?: ((name: string) => string) | undefined;
}) {
  if (items.length === 0) return null;
  return (
    <span className="ah-attachment-chips">
      {items.map((item) => (
        <span className="ah-attachment-chip" key={item.id}>
          <button
            className="ah-attachment-chip__open"
            onClick={() => {
              onOpen(item);
            }}
            type="button"
          >
            <Icon aria-hidden="true" name="clip" />
            <span>{item.name}</span>
          </button>
          {onRemove === undefined || removeLabel === undefined ? null : (
            <IconButton
              className="ah-attachment-chip__remove"
              disabled={busy}
              icon="x"
              label={removeLabel(item.name)}
              onClick={() => {
                onRemove(item);
              }}
            />
          )}
        </span>
      ))}
    </span>
  );
}

// ── Tasks ────────────────────────────────────────────────────────────────────────────────────

export type TaskPanelState = "DONE" | "PENDING";

/** The fields of a `Task` (S10 §6) the panel paints; the callbacks get the caller's own type back. */
export interface TaskPanelItem {
  attachments: readonly AttachmentChip[];
  id: string;
  state: TaskPanelState;
  text: string;
  /** The optimistic lock (`PATCH`): an edit is sent with the version it was opened at. */
  version?: number | undefined;
}

export interface TasksPanelLabels<Task extends TaskPanelItem = TaskPanelItem> {
  add: string;
  attach: string;
  cancel: string;
  close: string;
  complete: string;
  create: string;
  /** «feta per la Laura el 02-08» for a done task. */
  doneLine: (task: Task) => string | undefined;
  edit: string;
  editField: string;
  empty: string;
  loading: string;
  /** «12-08 · Estel». */
  meta: (task: Task) => string;
  newTask: string;
  newTaskField: string;
  rejection: (reason: AttachmentRejection, file: File) => string;
  remove: string;
  removeConfirm: string;
  removeFile: (name: string) => string;
  removeTitle: string;
  reopen: string;
  save: string;
  state: (state: TaskPanelState) => string;
  title: string;
}

export interface TasksPanelProps<Task extends TaskPanelItem> {
  /** What is being written now (`create`, `patch:{id}`…): every action waits for it. */
  busy?: string | undefined;
  canEdit: boolean;
  /** A failed write or a refused file: shown inside the panel, where the user is. */
  error?: ReactNode;
  labels: TasksPanelLabels<Task>;
  limits: AttachmentLimits;
  loading?: boolean;
  tasks: readonly Task[];
  /** Absent: the history's read-only list (no «＋ Afegir»). */
  onCreate?: ((text: string, files: readonly File[]) => Promise<boolean>) | undefined;
  onAttach?: ((task: Task, files: readonly File[]) => Promise<boolean>) | undefined;
  onComplete?: ((task: Task) => Promise<boolean>) | undefined;
  onDelete?: ((task: Task) => Promise<boolean>) | undefined;
  onDetach?: ((task: Task, attachment: AttachmentChip) => Promise<boolean>) | undefined;
  onOpenAttachment: (task: Task, attachment: AttachmentChip) => void;
  /** `baseVersion`: the task's version when the pencil was tapped (never a later read's). */
  onPatch?:
    ((task: Task, text: string, baseVersion: number | undefined) => Promise<boolean>) | undefined;
  onReject?: ((message: string) => void) | undefined;
  onReopen?: ((task: Task) => Promise<boolean>) | undefined;
}

const TEXT_LIMIT = 2000;

/**
 * The tasks of a dog (S10 R-10-10, mockup 26 and D13's drawer), a controlled presenter with no
 * fetching: «Tasques» + «＋ Afegir» beside the title (mockup V8) opening an inline form (text and
 * files); one card per task with its state chip, the text (struck through when done), «{dd-mm} ·
 * {autor}» with the clip chips and, done, «feta per …»; the pencil edits the text in place, the ✕
 * asks first, ✓ completes a pending task and ↺ reopens a done one. While one write runs every
 * action waits for it.
 */
export function TasksPanel<Task extends TaskPanelItem>({
  busy,
  canEdit,
  error,
  labels,
  limits,
  loading = false,
  onAttach,
  onComplete,
  onCreate,
  onDelete,
  onDetach,
  onOpenAttachment,
  onPatch,
  onReject,
  onReopen,
  tasks,
}: TasksPanelProps<Task>) {
  const titleId = useId();
  const [adding, setAdding] = useState(false);
  const [newText, setNewText] = useState("");
  const [newFiles, setNewFiles] = useState<File[]>([]);
  // The text being edited and the version it was read at (sent as is: another instructor's change
  // in between answers `STALE_VERSION`, never overwritten).
  const [editing, setEditing] = useState<{
    baseVersion: number | undefined;
    id: string;
    text: string;
  }>();
  const [removing, setRemoving] = useState<Task>();
  const locked = busy !== undefined;
  const reject = (reason: AttachmentRejection, file: File) => {
    onReject?.(labels.rejection(reason, file));
  };
  // The form opens on a tap of «＋ Afegir» or of the pencil: the caret goes where the user types.
  const editingId = editing?.id;
  useEffect(() => {
    if (adding) document.getElementById(`${titleId}-new`)?.focus();
  }, [adding, titleId]);
  useEffect(() => {
    if (editingId !== undefined) document.getElementById(`${titleId}-${editingId}`)?.focus();
  }, [editingId, titleId]);

  const create = async () => {
    if (onCreate === undefined || newText.trim() === "" || locked) return;
    if (await onCreate(newText, newFiles)) {
      setAdding(false);
      setNewText("");
      setNewFiles([]);
    }
  };

  const saveEdit = async (task: Task) => {
    if (onPatch === undefined || editing === undefined || editing.text.trim() === "" || locked) {
      return;
    }
    if (editing.text === task.text || (await onPatch(task, editing.text, editing.baseVersion))) {
      setEditing(undefined);
    }
  };

  return (
    <section aria-labelledby={titleId} className="ah-tasks">
      <header className="ah-tasks__header">
        <h2 className="ah-tasks__title" id={titleId}>
          {labels.title}
        </h2>
        {canEdit && onCreate !== undefined && !adding ? (
          <Button
            className="ah-tasks__add"
            disabled={locked}
            onClick={() => {
              setAdding(true);
            }}
            variant="ghost"
          >
            <Icon aria-hidden="true" name="plus" /> {labels.add}
          </Button>
        ) : null}
      </header>
      {error === undefined || error === null ? null : (
        <div className="ah-tasks__error" role="alert">
          {error}
        </div>
      )}
      {adding ? (
        <form
          aria-label={labels.newTask}
          className="ah-task ah-task--form"
          onSubmit={(event) => {
            event.preventDefault();
            void create();
          }}
        >
          <label className="ah-sr-only" htmlFor={`${titleId}-new`}>
            {labels.newTaskField}
          </label>
          <Textarea
            id={`${titleId}-new`}
            maxLength={TEXT_LIMIT}
            onChange={(event) => {
              setNewText(event.currentTarget.value);
            }}
            readOnly={locked}
            rows={3}
            value={newText}
          />
          <AttachmentChips
            busy={locked}
            items={newFiles.map((file, index) => ({ id: String(index), name: file.name }))}
            onOpen={() => undefined}
            onRemove={(item) => {
              setNewFiles((files) => files.filter((_, index) => String(index) !== item.id));
            }}
            removeLabel={labels.removeFile}
          />
          <div className="ah-task__form-actions">
            <AttachmentPicker
              {...limits}
              current={newFiles.length}
              disabled={locked}
              label={labels.attach}
              onPick={(files) => {
                setNewFiles((current) => [...current, ...files]);
              }}
              onReject={reject}
            />
            <Button
              disabled={locked && busy !== "create"}
              onClick={() => {
                setAdding(false);
                setNewText("");
                setNewFiles([]);
              }}
              variant="ghost"
            >
              {labels.cancel}
            </Button>
            <Button
              disabled={newText.trim() === "" || (locked && busy !== "create")}
              loading={busy === "create"}
              loadingLabel={labels.loading}
              type="submit"
            >
              {labels.create}
            </Button>
          </div>
        </form>
      ) : null}
      {loading ? (
        <Skeleton height="8rem" label={labels.loading} />
      ) : tasks.length === 0 && !adding ? (
        <p className="ah-tasks__empty">{labels.empty}</p>
      ) : (
        <ul className="ah-tasks__list">
          {tasks.map((task) => {
            const done = task.state === "DONE";
            const mine = busy?.endsWith(`:${task.id}`) === true;
            const doneLine = done ? labels.doneLine(task) : undefined;
            const isEditing = editing?.id === task.id;
            return (
              <li
                aria-busy={mine || undefined}
                className={`ah-task${done ? " ah-task--done" : " ah-task--pending"}`}
                key={task.id}
              >
                <div className="ah-task__head">
                  <Badge tone={done ? "success" : "warning"}>{labels.state(task.state)}</Badge>
                  <span className="ah-task__actions">
                    {!done && onComplete !== undefined ? (
                      <IconButton
                        disabled={locked}
                        icon="check"
                        label={labels.complete}
                        onClick={() => void onComplete(task)}
                      />
                    ) : null}
                    {done && canEdit && onReopen !== undefined ? (
                      <IconButton
                        disabled={locked}
                        icon="undo"
                        label={labels.reopen}
                        onClick={() => void onReopen(task)}
                      />
                    ) : null}
                    {canEdit && !done && onPatch !== undefined && !isEditing ? (
                      <IconButton
                        disabled={locked}
                        icon="edit"
                        label={labels.edit}
                        onClick={() => {
                          setEditing({ baseVersion: task.version, id: task.id, text: task.text });
                        }}
                      />
                    ) : null}
                    {canEdit && onDelete !== undefined ? (
                      <IconButton
                        disabled={locked}
                        icon="x"
                        label={labels.remove}
                        onClick={() => {
                          setRemoving(task);
                        }}
                      />
                    ) : null}
                  </span>
                </div>
                {isEditing ? (
                  <form
                    className="ah-task__edit"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void saveEdit(task);
                    }}
                  >
                    <label className="ah-sr-only" htmlFor={`${titleId}-${task.id}`}>
                      {labels.editField}
                    </label>
                    <Textarea
                      id={`${titleId}-${task.id}`}
                      maxLength={TEXT_LIMIT}
                      onChange={(event) => {
                        const text = event.currentTarget.value;
                        setEditing((current) =>
                          current === undefined ? current : { ...current, text },
                        );
                      }}
                      readOnly={locked}
                      rows={3}
                      value={editing.text}
                    />
                    <AttachmentChips
                      busy={locked}
                      items={task.attachments}
                      onOpen={(attachment) => {
                        onOpenAttachment(task, attachment);
                      }}
                      onRemove={
                        onDetach === undefined
                          ? undefined
                          : (attachment) => void onDetach(task, attachment)
                      }
                      removeLabel={labels.removeFile}
                    />
                    <div className="ah-task__form-actions">
                      {onAttach === undefined ? null : (
                        <AttachmentPicker
                          {...limits}
                          current={task.attachments.length}
                          disabled={locked}
                          label={labels.attach}
                          onPick={(files) => void onAttach(task, files)}
                          onReject={reject}
                        />
                      )}
                      <Button
                        disabled={locked && !mine}
                        onClick={() => {
                          setEditing(undefined);
                        }}
                        variant="ghost"
                      >
                        {labels.cancel}
                      </Button>
                      <Button
                        disabled={editing.text.trim() === "" || (locked && !mine)}
                        loading={busy === `patch:${task.id}`}
                        loadingLabel={labels.loading}
                        type="submit"
                      >
                        {labels.save}
                      </Button>
                    </div>
                  </form>
                ) : (
                  <p className="ah-task__text">{task.text}</p>
                )}
                {isEditing ? null : (
                  <p className="ah-task__meta">
                    <span>
                      {labels.meta(task)}
                      {doneLine === undefined ? null : ` · ${doneLine}`}
                      {task.attachments.length === 0 ? null : " · "}
                    </span>
                    <AttachmentChips
                      items={task.attachments}
                      onOpen={(attachment) => {
                        onOpenAttachment(task, attachment);
                      }}
                    />
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <Modal
        closeLabel={labels.close}
        onClose={() => {
          setRemoving(undefined);
        }}
        open={removing !== undefined}
        title={labels.removeTitle}
      >
        <p className="ah-tasks__confirm-text">{removing?.text}</p>
        <div className="ah-task__form-actions">
          <Button
            disabled={locked}
            onClick={() => {
              setRemoving(undefined);
            }}
            variant="ghost"
          >
            {labels.cancel}
          </Button>
          <Button
            loading={removing !== undefined && busy === `delete:${removing.id}`}
            loadingLabel={labels.loading}
            onClick={() => {
              const task = removing;
              if (task === undefined || onDelete === undefined || locked) return;
              void onDelete(task).then((deleted) => {
                if (deleted) setRemoving(undefined);
              });
            }}
            variant="danger"
          >
            {labels.removeConfirm}
          </Button>
        </div>
      </Modal>
    </section>
  );
}

// ── Observations, the member's note and the whole editor of 26 / D13's drawer ────────────────

export interface FollowupEditorLabels {
  attach: string;
  historyLink: string;
  memberNotesHint: string;
  memberNotesTitle: string;
  noValue: string;
  observationsField: string;
  observationsHint: string;
  observationsTitle: string;
  recover: string;
  removeFile: (name: string) => string;
  save: string;
  saving: string;
  staleNotice: string;
}

export interface FollowupEditorProps<Task extends TaskPanelItem> {
  /** The failed write's message (or a refused file), shown inside the editor. */
  error?: ReactNode;
  busy?: string | undefined;
  labels: FollowupEditorLabels;
  limits: AttachmentLimits;
  memberNote?:
    | {
        attachments: readonly AttachmentChip[];
        onOpen: (attachment: AttachmentChip) => void;
        text: string | null | undefined;
      }
    | undefined;
  observations: {
    attachments: readonly AttachmentChip[];
    dirty: boolean;
    onAttach: (files: readonly File[]) => void;
    onChange: (text: string) => void;
    onDetach: (attachment: AttachmentChip) => void;
    onOpen: (attachment: AttachmentChip) => void;
    onRecover: () => void;
    onSave: () => void;
    /** The text typed before someone else saved first (R-10-12), waiting to be recovered. */
    recoverable?: string | undefined;
    saving: boolean;
    stale: boolean;
    text: string;
  };
  onHistory?: (() => void) | undefined;
  onReject: (message: string) => void;
  rejection: (reason: AttachmentRejection, file: File) => string;
  /** The tasks block: the same `TasksPanel` as everywhere (26 and D13's drawer). */
  tasks: TasksPanelProps<Task>;
}

/**
 * Screen 26's body, and D13's drawer (one component, two shells): «Observacions · privades · camp
 * únic» (a single private field with its clips, R-10-12), the tasks, «Veure l'historial complet ›»,
 * the member's note read-only and [DESA] for the observations, as mockup 26 lays them out.
 */
export function FollowupEditor<Task extends TaskPanelItem>({
  busy,
  error,
  labels,
  limits,
  memberNote,
  observations,
  onHistory,
  onReject,
  rejection,
  tasks,
}: FollowupEditorProps<Task>) {
  const fieldId = useId();
  const locked = busy !== undefined;
  return (
    <div className="ah-followup">
      {error === undefined || error === null ? null : (
        <div className="ah-followup__error" role="alert">
          {error}
        </div>
      )}
      <section aria-labelledby={`${fieldId}-title`} className="ah-followup__block">
        <h2 className="ah-followup__title" id={`${fieldId}-title`}>
          {labels.observationsTitle} <span>{labels.observationsHint}</span>
        </h2>
        {observations.stale ? (
          <div className="ah-followup__stale" role="status">
            <p>{labels.staleNotice}</p>
            {observations.recoverable === undefined ? null : (
              <>
                <blockquote>{observations.recoverable}</blockquote>
                <Button disabled={locked} onClick={observations.onRecover} variant="secondary">
                  {labels.recover}
                </Button>
              </>
            )}
          </div>
        ) : null}
        <label className="ah-sr-only" htmlFor={fieldId}>
          {labels.observationsField}
        </label>
        <Textarea
          className="ah-followup__field"
          id={fieldId}
          maxLength={TEXT_LIMIT}
          onChange={(event) => {
            observations.onChange(event.currentTarget.value);
          }}
          readOnly={observations.saving}
          rows={3}
          value={observations.text}
        />
        <div className="ah-followup__clips">
          <AttachmentChips
            busy={locked}
            items={observations.attachments}
            onOpen={observations.onOpen}
            onRemove={observations.onDetach}
            removeLabel={labels.removeFile}
          />
          <AttachmentPicker
            {...limits}
            current={observations.attachments.length}
            disabled={locked}
            label={labels.attach}
            onPick={observations.onAttach}
            onReject={(reason, file) => {
              onReject(rejection(reason, file));
            }}
          />
        </div>
      </section>
      <TasksPanel {...tasks} busy={busy} />
      {onHistory === undefined ? null : (
        <button className="ah-followup__history" onClick={onHistory} type="button">
          {labels.historyLink}
        </button>
      )}
      {memberNote === undefined ? null : (
        <section aria-labelledby={`${fieldId}-note`} className="ah-followup__block">
          <h2 className="ah-followup__title" id={`${fieldId}-note`}>
            {labels.memberNotesTitle} <span>{labels.memberNotesHint}</span>
          </h2>
          <div className="ah-followup__note">
            <p>{memberNote.text ?? labels.noValue}</p>
            <AttachmentChips items={memberNote.attachments} onOpen={memberNote.onOpen} />
          </div>
        </section>
      )}
      <Button
        className="ah-followup__save"
        disabled={!observations.dirty || (locked && !observations.saving)}
        loading={observations.saving}
        loadingLabel={labels.saving}
        onClick={observations.onSave}
      >
        {labels.save}
      </Button>
    </div>
  );
}

// ── The model of 26 and D13's drawer: one editor, two shells ────────────────────────────────

export type FollowupLoadState<Data> =
  { status: "loading" } | { error: unknown; status: "error" } | { data: Data; status: "ready" };

type FollowupEntity = "DOG_OBSERVATIONS" | "INSTRUCTOR_NOTE" | "TASK";

/**
 * What the shared editor reads and calls: the shape of `useDogFollowup` (packages/api-client),
 * written structurally so this package stays free of the api client.
 */
export interface FollowupEditorModel<Task extends TaskPanelItem> {
  addAttachments: (
    entityType: "DOG_OBSERVATIONS" | "TASK",
    entityId: string,
    files: readonly File[],
  ) => Promise<boolean>;
  busy: string | undefined;
  card: FollowupLoadState<{
    instructorNote?:
      { attachments: readonly AttachmentChip[]; text?: string | null | undefined } | undefined;
    observations?: { attachments: readonly AttachmentChip[] } | undefined;
  }>;
  completeTask: (task: Task) => Promise<boolean>;
  createTask: (text: string, files: readonly File[]) => Promise<boolean>;
  deleteTask: (task: Task) => Promise<boolean>;
  error: unknown;
  history: {
    error?: unknown;
    items: readonly Task[];
    more: boolean;
    pending: boolean;
    read: number;
  };
  limits: AttachmentLimits;
  observations: {
    dirty: boolean;
    recover: () => void;
    recoverable: string | undefined;
    save: () => Promise<boolean>;
    saving: boolean;
    setText: (text: string) => void;
    stale: boolean;
    text: string;
  };
  openAttachment: (
    entityType: FollowupEntity,
    entityId: string,
    attachmentId: string,
  ) => Promise<void>;
  patchTask: (task: Task, text: string, baseVersion?: number) => Promise<boolean>;
  readHistory: (page: number) => Promise<void>;
  reloadTasks: () => void;
  removeAttachment: (attachmentId: string) => Promise<boolean>;
  reopenTask: (task: Task) => Promise<boolean>;
  tasks: FollowupLoadState<readonly Task[]>;
}

export interface DogFollowupTexts<Task extends TaskPanelItem> {
  editor: FollowupEditorLabels;
  /** A failed read or write, by its code (the app's catalog of `errors:`). */
  errorText: (error: unknown, fallback: string) => string;
  history: { close: string; more: string; title: string };
  loadError: string;
  /** A write that got no answer from the api (offline). */
  writeError: string;
  rejection: (reason: AttachmentRejection, file: File) => string;
  retry: string;
  /** Said by the stale notice instead of the error line (R-10-12). */
  staleVersion: (error: unknown) => boolean;
  tasks: TasksPanelLabels<Task>;
}

/**
 * The whole follow-up editor of a dog — screen 26's body and D13's drawer (S10 §2, «one
 * component, two shells»): `FollowupEditor` fed by the dog's model (`useDogFollowup`), every
 * write through it, a refused file or a failed write said inside, and «Veure l'historial complet
 * ›» opening the full history.
 */
export function DogFollowupEditor<Task extends TaskPanelItem>({
  dogId,
  model,
  onHistory,
  texts,
}: {
  dogId: string;
  model: FollowupEditorModel<Task>;
  onHistory: () => void;
  texts: DogFollowupTexts<Task>;
}) {
  const [refusedFile, setRefusedFile] = useState<string>();
  const card = model.card.status === "ready" ? model.card.data : undefined;
  const note = card?.instructorNote;
  const { tasks } = model;
  // Each new action clears the last refusal; a failed write stays until the next one.
  const act = <Result,>(action: () => Result): Result => {
    setRefusedFile(undefined);
    return action();
  };
  const error =
    refusedFile ??
    (model.error === undefined || (model.observations.stale && texts.staleVersion(model.error))
      ? undefined
      : texts.errorText(model.error, texts.writeError));
  return (
    <FollowupEditor<Task>
      busy={model.busy}
      error={error}
      labels={texts.editor}
      limits={model.limits}
      memberNote={
        note === undefined
          ? undefined
          : {
              attachments: note.attachments,
              onOpen: (attachment) =>
                void model.openAttachment("INSTRUCTOR_NOTE", dogId, attachment.id),
              text: note.text,
            }
      }
      observations={{
        attachments: card?.observations?.attachments ?? [],
        dirty: model.observations.dirty,
        onAttach: (files) => void act(() => model.addAttachments("DOG_OBSERVATIONS", dogId, files)),
        onChange: model.observations.setText,
        onDetach: (attachment) => void act(() => model.removeAttachment(attachment.id)),
        onOpen: (attachment) => void model.openAttachment("DOG_OBSERVATIONS", dogId, attachment.id),
        onRecover: model.observations.recover,
        onSave: () => void act(() => model.observations.save()),
        recoverable: model.observations.recoverable,
        saving: model.observations.saving,
        stale: model.observations.stale,
        text: model.observations.text,
      }}
      onHistory={onHistory}
      onReject={setRefusedFile}
      rejection={texts.rejection}
      tasks={{
        canEdit: true,
        error:
          tasks.status === "error" ? (
            <span className="ah-followup__load-error">
              {texts.errorText(tasks.error, texts.loadError)}
              <Button onClick={model.reloadTasks} variant="secondary">
                {texts.retry}
              </Button>
            </span>
          ) : undefined,
        labels: texts.tasks,
        limits: model.limits,
        loading: tasks.status === "loading",
        onAttach: (task, files) => act(() => model.addAttachments("TASK", task.id, files)),
        onComplete: (task) => act(() => model.completeTask(task)),
        onCreate: (text, files) => act(() => model.createTask(text, files)),
        onDelete: (task) => act(() => model.deleteTask(task)),
        onDetach: (_task, attachment) => act(() => model.removeAttachment(attachment.id)),
        onOpenAttachment: (task, attachment) =>
          void model.openAttachment("TASK", task.id, attachment.id),
        onPatch: (task, text, baseVersion) => act(() => model.patchTask(task, text, baseVersion)),
        onReject: setRefusedFile,
        onReopen: (task) => act(() => model.reopenTask(task)),
        tasks: tasks.status === "ready" ? tasks.data : [],
      }}
    />
  );
}

/**
 * «Veure l'historial complet ›» (S10 §2 row 26): every task of the dog, done ones included, in a
 * drawer, read-only, page by page with «Mostra'n més».
 */
export function FollowupHistoryDrawer<Task extends TaskPanelItem>({
  model,
  onClose,
  texts,
}: {
  model: FollowupEditorModel<Task>;
  onClose: () => void;
  texts: DogFollowupTexts<Task>;
}) {
  const { history, readHistory } = model;
  useEffect(() => {
    void readHistory(0);
  }, [readHistory]);
  return (
    <Drawer closeLabel={texts.history.close} onClose={onClose} open title={texts.history.title}>
      <TasksPanel<Task>
        canEdit={false}
        error={
          history.error === undefined ? undefined : texts.errorText(history.error, texts.loadError)
        }
        labels={texts.tasks}
        limits={{}}
        loading={history.read === 0 && history.pending}
        onOpenAttachment={(task, attachment) =>
          void model.openAttachment("TASK", task.id, attachment.id)
        }
        tasks={history.items}
      />
      {history.more || (history.error !== undefined && history.read > 0) ? (
        <Button
          className="ah-followup__more"
          loading={history.pending}
          loadingLabel={texts.tasks.loading}
          onClick={() => void readHistory(history.read)}
          variant="secondary"
        >
          {texts.history.more}
        </Button>
      ) : null}
    </Drawer>
  );
}
