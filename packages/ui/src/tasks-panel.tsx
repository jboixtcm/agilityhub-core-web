import {
  type ChangeEvent,
  Fragment,
  type ReactNode,
  type Ref,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";

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

/** A file the picker refused, and why. */
export interface AttachmentRefusal {
  file: File;
  reason: AttachmentRejection;
}

export interface AttachmentPickerProps extends AttachmentLimits {
  /** How many the entity has already (live and picked): the limit counts them. */
  current: number;
  disabled?: boolean;
  label: string;
  onPick: (files: File[]) => void;
  /**
   * Every refusal of one selection at once (an empty list when it had none), before its accepted
   * files go to `onPick`: the messages of a selection replace the last one's and stay while its
   * accepted files upload (E6-W05).
   */
  onReject: (refusals: readonly AttachmentRefusal[]) => void;
}

/**
 * The clip button of 26 and D13: picks files and checks each against the club's limits before any
 * signed url is asked for; the refused ones go to `onReject` with their reasons, the rest to
 * `onPick`.
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
    if (files.length === 0) return;
    const accepted: File[] = [];
    const refused: AttachmentRefusal[] = [];
    for (const file of files) {
      const reason = attachmentRejection(file, limits, current + accepted.length);
      if (reason === undefined) accepted.push(file);
      else refused.push({ file, reason });
    }
    onReject(refused);
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
 * Opens a clip: resolves to why it could not be opened (a translated message), or to nothing when
 * the file opened.
 */
export type AttachmentOpener = (item: AttachmentChip) => Promise<string | undefined> | undefined;

/**
 * «{icona de clip} {fitxer}» (mockups 26 and D13): each opens its file through `onOpen` (a fresh
 * signed url, never a kept one); with `onRemove`, a ✕ beside each. A file that cannot be opened
 * says why right after its clip, where it was clicked (AGENTS rule 4); the next click clears it,
 * and the answer of an earlier click that arrives late is dropped.
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
  onOpen: AttachmentOpener;
  onRemove?: ((item: AttachmentChip) => void) | undefined;
  removeLabel?: ((name: string) => string) | undefined;
}) {
  const [failure, setFailure] = useState<{ id: string; message: string }>();
  const attempt = useRef(0);
  if (items.length === 0) return null;
  const open = (item: AttachmentChip) => {
    attempt.current += 1;
    const current = attempt.current;
    setFailure(undefined);
    void Promise.resolve(onOpen(item)).then((message) => {
      if (current === attempt.current && message !== undefined && message !== "") {
        setFailure({ id: item.id, message });
      }
    });
  };
  return (
    <span className="ah-attachment-chips">
      {items.map((item) => (
        <Fragment key={item.id}>
          <span className="ah-attachment-chip">
            <button
              className="ah-attachment-chip__open"
              onClick={() => {
                open(item);
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
          {failure?.id === item.id ? (
            <span className="ah-attachment-chip__error" role="alert">
              {failure.message}
            </span>
          ) : null}
        </Fragment>
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
  /**
   * «Mostra'n més» below the list while the api may have another page: its reading state, and why
   * the last page could not be read (said above the button, which asks it again).
   */
  more?: { error?: ReactNode; label: string; loading?: boolean; onMore: () => void } | undefined;
  tasks: readonly Task[];
  /** Absent: the history's read-only list (no «＋ Afegir»). */
  onCreate?: ((text: string, files: readonly File[]) => Promise<boolean>) | undefined;
  onAttach?: ((task: Task, files: readonly File[]) => Promise<boolean>) | undefined;
  onComplete?: ((task: Task) => Promise<boolean>) | undefined;
  onDelete?: ((task: Task) => Promise<boolean>) | undefined;
  onDetach?: ((task: Task, attachment: AttachmentChip) => Promise<boolean>) | undefined;
  /** Opens a task's file; resolves to why it could not (said next to the clip). */
  onOpenAttachment: (
    task: Task,
    attachment: AttachmentChip,
  ) => Promise<string | undefined> | undefined;
  /** `baseVersion`: the task's version when the pencil was tapped (never a later read's). */
  onPatch?:
    ((task: Task, text: string, baseVersion: number | undefined) => Promise<boolean>) | undefined;
  /** A selection's refused files, as messages (an empty list when it had none). */
  onReject?: ((messages: readonly string[]) => void) | undefined;
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
  more,
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
  // The confirmation's own deletion was refused: its failure (`error`) is said inside it, where
  // the user is, and not behind it (E6-W05).
  const [removeFailed, setRemoveFailed] = useState(false);
  const locked = busy !== undefined;
  const reject = (refusals: readonly AttachmentRefusal[]) => {
    onReject?.(refusals.map(({ file, reason }) => labels.rejection(reason, file)));
  };
  const closeRemoval = () => {
    setRemoving(undefined);
    setRemoveFailed(false);
  };
  const hasError = error !== undefined && error !== null;
  const errorInDialog = removing !== undefined && removeFailed && hasError;
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
      {!hasError || errorInDialog ? null : (
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
                          setRemoveFailed(false);
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
                      onOpen={(attachment) => onOpenAttachment(task, attachment)}
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
                      onOpen={(attachment) => onOpenAttachment(task, attachment)}
                    />
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {more === undefined || loading ? null : (
        <div className="ah-tasks__more">
          {more.error === undefined || more.error === null ? null : (
            <p className="ah-tasks__error" role="alert">
              {more.error}
            </p>
          )}
          <Button
            loading={more.loading === true}
            loadingLabel={labels.loading}
            onClick={more.onMore}
            variant="secondary"
          >
            {more.label}
          </Button>
        </div>
      )}
      <Modal
        closeLabel={labels.close}
        onClose={closeRemoval}
        open={removing !== undefined}
        title={labels.removeTitle}
      >
        <p className="ah-tasks__confirm-text">{removing?.text}</p>
        {errorInDialog ? (
          <div className="ah-tasks__error" role="alert">
            {error}
          </div>
        ) : null}
        <div className="ah-task__form-actions">
          <Button disabled={locked} onClick={closeRemoval} variant="ghost">
            {labels.cancel}
          </Button>
          <Button
            loading={removing !== undefined && busy === `delete:${removing.id}`}
            loadingLabel={labels.loading}
            onClick={() => {
              const task = removing;
              if (task === undefined || onDelete === undefined || locked) return;
              setRemoveFailed(false);
              void onDelete(task).then((deleted) => {
                if (deleted) closeRemoval();
                else setRemoveFailed(true);
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
        onOpen: AttachmentOpener;
        text: string | null | undefined;
      }
    | undefined;
  observations: {
    attachments: readonly AttachmentChip[];
    dirty: boolean;
    onAttach: (files: readonly File[]) => void;
    onChange: (text: string) => void;
    onDetach: (attachment: AttachmentChip) => void;
    onOpen: AttachmentOpener;
    onRecover: () => void;
    onSave: () => void;
    /** The text typed before someone else saved first (R-10-12), waiting to be recovered. */
    recoverable?: string | undefined;
    saving: boolean;
    stale: boolean;
    text: string;
  };
  onHistory?: (() => void) | undefined;
  /** «Veure l'historial complet ›»: where the focus goes back when the history closes. */
  historyLinkRef?: Ref<HTMLButtonElement> | undefined;
  /** A selection's refused observation files, as messages (an empty list when it had none). */
  onReject: (messages: readonly string[]) => void;
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
  historyLinkRef,
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
            onReject={(refusals) => {
              onReject(refusals.map(({ file, reason }) => rejection(reason, file)));
            }}
          />
        </div>
      </section>
      <TasksPanel {...tasks} busy={busy} />
      {onHistory === undefined ? null : (
        <button
          className="ah-followup__history"
          onClick={onHistory}
          ref={historyLinkRef}
          type="button"
        >
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
  /** Resolves to the failure (`undefined` when the file opened). */
  openAttachment: (
    entityType: FollowupEntity,
    entityId: string,
    attachmentId: string,
  ) => Promise<unknown>;
  patchTask: (task: Task, text: string, baseVersion?: number) => Promise<boolean>;
  readHistory: (page: number) => Promise<void>;
  /** «Mostra'n més» of the editable list: one page further. */
  readMoreTasks: () => Promise<void>;
  reloadTasks: () => void;
  removeAttachment: (attachmentId: string) => Promise<boolean>;
  reopenTask: (task: Task) => Promise<boolean>;
  tasks: FollowupLoadState<readonly Task[]>;
  tasksPaging: { error?: unknown; more: boolean; pending: boolean };
}

export interface DogFollowupTexts<Task extends TaskPanelItem> {
  editor: FollowupEditorLabels;
  /** A failed read or write, by its code (the app's catalog of `errors:`). */
  errorText: (error: unknown, fallback: string) => string;
  history: { close: string; more: string; title: string };
  loadError: string;
  /** A file that could not be opened without an answer from the api (offline). */
  openError: string;
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
/** A clip's opener: the model's failure said by its code, or `openError` without an answer. */
function clipOpener<Task extends TaskPanelItem>(
  model: FollowupEditorModel<Task>,
  texts: DogFollowupTexts<Task>,
  entityType: FollowupEntity,
  entityId: string,
): AttachmentOpener {
  return (attachment) =>
    model
      .openAttachment(entityType, entityId, attachment.id)
      .then((failure) =>
        failure === undefined ? undefined : texts.errorText(failure, texts.openError),
      );
}

/** Which block an action started from: its failure is said there, where the user is. */
type FollowupScope = "observations" | "tasks";

export function DogFollowupEditor<Task extends TaskPanelItem>({
  dogId,
  historyLinkRef,
  model,
  onHistory,
  texts,
}: {
  dogId: string;
  historyLinkRef?: Ref<HTMLButtonElement> | undefined;
  model: FollowupEditorModel<Task>;
  onHistory: () => void;
  texts: DogFollowupTexts<Task>;
}) {
  // The refused files of the last selection, said where it was made.
  const [refused, setRefused] = useState<{ messages: readonly string[]; scope: FollowupScope }>();
  const [scope, setScope] = useState<FollowupScope>("observations");
  const card = model.card.status === "ready" ? model.card.data : undefined;
  const note = card?.instructorNote;
  const { tasks, tasksPaging } = model;
  // Each new action clears the last refusals and says where its own failure will show; a failed
  // write stays until the next one (one write runs at a time). The upload of a selection's
  // accepted files keeps that selection's refusals: they are said while it runs and after it
  // (`picked`, E6-W05).
  const act = <Result,>(from: FollowupScope, action: () => Result, picked = false): Result => {
    if (!picked) setRefused(undefined);
    setScope(from);
    return action();
  };
  const refuse = (from: FollowupScope) => (messages: readonly string[]) => {
    setRefused(messages.length === 0 ? undefined : { messages, scope: from });
  };
  const writeError =
    model.error === undefined || (model.observations.stale && texts.staleVersion(model.error))
      ? undefined
      : texts.errorText(model.error, texts.writeError);
  // A block's refusals and its write's failure, one line each.
  const said = (from: FollowupScope): ReactNode => {
    const lines = [
      ...(refused?.scope === from ? refused.messages : []),
      ...(scope === from && writeError !== undefined ? [writeError] : []),
    ];
    if (lines.length <= 1) return lines[0];
    return lines.map((line, index) => (
      <span className="ah-followup__line" key={`${String(index)}:${line}`}>
        {line}
      </span>
    ));
  };
  const tasksError = said("tasks");
  return (
    <FollowupEditor<Task>
      busy={model.busy}
      error={said("observations")}
      historyLinkRef={historyLinkRef}
      labels={texts.editor}
      limits={model.limits}
      memberNote={
        note === undefined
          ? undefined
          : {
              attachments: note.attachments,
              onOpen: clipOpener(model, texts, "INSTRUCTOR_NOTE", dogId),
              text: note.text,
            }
      }
      observations={{
        attachments: card?.observations?.attachments ?? [],
        dirty: model.observations.dirty,
        onAttach: (files) =>
          void act(
            "observations",
            () => model.addAttachments("DOG_OBSERVATIONS", dogId, files),
            true,
          ),
        onChange: model.observations.setText,
        onDetach: (attachment) =>
          void act("observations", () => model.removeAttachment(attachment.id)),
        onOpen: clipOpener(model, texts, "DOG_OBSERVATIONS", dogId),
        onRecover: model.observations.recover,
        onSave: () => void act("observations", () => model.observations.save()),
        recoverable: model.observations.recoverable,
        saving: model.observations.saving,
        stale: model.observations.stale,
        text: model.observations.text,
      }}
      onHistory={onHistory}
      onReject={refuse("observations")}
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
          ) : (
            tasksError
          ),
        labels: texts.tasks,
        limits: model.limits,
        loading: tasks.status === "loading",
        more:
          tasks.status === "ready" && (tasksPaging.more || tasksPaging.error !== undefined)
            ? {
                error:
                  tasksPaging.error === undefined
                    ? undefined
                    : texts.errorText(tasksPaging.error, texts.loadError),
                label: texts.history.more,
                loading: tasksPaging.pending,
                onMore: () => void model.readMoreTasks(),
              }
            : undefined,
        onAttach: (task, files) =>
          act("tasks", () => model.addAttachments("TASK", task.id, files), true),
        onComplete: (task) => act("tasks", () => model.completeTask(task)),
        onCreate: (text, files) => act("tasks", () => model.createTask(text, files)),
        onDelete: (task) => act("tasks", () => model.deleteTask(task)),
        onDetach: (_task, attachment) => act("tasks", () => model.removeAttachment(attachment.id)),
        onOpenAttachment: (task, attachment) =>
          clipOpener(model, texts, "TASK", task.id)(attachment),
        onPatch: (task, text, baseVersion) =>
          act("tasks", () => model.patchTask(task, text, baseVersion)),
        onReject: refuse("tasks"),
        onReopen: (task) => act("tasks", () => model.reopenTask(task)),
        tasks: tasks.status === "ready" ? tasks.data : [],
      }}
    />
  );
}

/**
 * «Veure l'historial complet ›» (S10 §2 row 26): every task of the dog, done ones included,
 * read-only, page by page with «Mostra'n més». The body of the history drawer of 26, and of D13's
 * drawer while it shows the history (`focusOnMount`: the focus moves into it there, since the link
 * that opened it is hidden).
 */
export function FollowupHistoryPanel<Task extends TaskPanelItem>({
  focusOnMount = false,
  model,
  texts,
}: {
  focusOnMount?: boolean;
  model: FollowupEditorModel<Task>;
  texts: DogFollowupTexts<Task>;
}) {
  const { history, readHistory } = model;
  const start = useRef<HTMLDivElement>(null);
  useEffect(() => {
    void readHistory(0);
  }, [readHistory]);
  useEffect(() => {
    if (focusOnMount) start.current?.focus();
  }, [focusOnMount]);
  const pageError = history.error !== undefined && history.read > 0;
  return (
    <div className="ah-followup-history" ref={start} tabIndex={-1}>
      <TasksPanel<Task>
        canEdit={false}
        error={
          history.error === undefined || pageError
            ? undefined
            : texts.errorText(history.error, texts.loadError)
        }
        labels={texts.tasks}
        limits={{}}
        loading={history.read === 0 && history.pending}
        more={
          history.more || pageError
            ? {
                error: pageError ? texts.errorText(history.error, texts.loadError) : undefined,
                label: texts.history.more,
                loading: history.pending,
                onMore: () => void readHistory(history.read),
              }
            : undefined
        }
        onOpenAttachment={(task, attachment) =>
          clipOpener(model, texts, "TASK", task.id)(attachment)
        }
        tasks={history.items}
      />
    </div>
  );
}

/** The history of 26 in its own drawer, over the editor (which keeps its drafts meanwhile). */
export function FollowupHistoryDrawer<Task extends TaskPanelItem>({
  model,
  onClose,
  texts,
}: {
  model: FollowupEditorModel<Task>;
  onClose: () => void;
  texts: DogFollowupTexts<Task>;
}) {
  return (
    <Drawer closeLabel={texts.history.close} onClose={onClose} open title={texts.history.title}>
      <FollowupHistoryPanel<Task> model={model} texts={texts} />
    </Drawer>
  );
}
