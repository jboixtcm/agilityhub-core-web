import type { components } from "../../generated/schema";

import { PAST_ACTIVITY_ID } from "./activities";
import { BOOKING_DOG_IDS } from "./bookings";
import { censusDogs } from "./census";

type Actor = components["schemas"]["Actor"];
type Attachment = components["schemas"]["Attachment"];
type AttachmentEntity = components["schemas"]["AttachmentRequest"]["entityType"];
type CardAttachment = components["schemas"]["CardAttachment"];
type HistoryDog = components["schemas"]["HistoryDog"];
type HistoryItem = components["schemas"]["HistoryItem"];
type MemberHistory = components["schemas"]["MemberHistory"];
type ObservationsBlock = components["schemas"]["ObservationsBlock"];
type Task = components["schemas"]["Task"];
type TasksBlock = components["schemas"]["TasksBlock"];
type UploadPurpose = components["schemas"]["UploadRequest"]["purpose"];

/**
 * The S10 follow-up world of screens 25 and 26 and of D13 (E6-W02), drawn on the same day as the
 * attendance world (`ATTENDANCE_MOCK_NOW`, Monday 3 August 2026): the member's history of the two
 * months before, and Duna's tasks, observations and attachments. Fictional people only.
 */

// ── Screen 25 · `GET /me/history` (R-10-14) ──────────────────────────────────────────────────

/** Club-wide variants of the history (one per scenario). */
export type HistoryVariant = "allReasons" | "empty" | "singleDog";

const DUNA = BOOKING_DOG_IDS.duna;
const ROCK = BOOKING_DOG_IDS.rock;
const TOBY = BOOKING_DOG_IDS.toby;

/**
 * The activity of mockup 25's «Seminari d'obstacles» row: the activities world's past activity
 * (FINISHED, so `GET /me/activities/{id}` answers it, `pastActivity`).
 */
export const HISTORY_DONE_ACTIVITY_ID = PAST_ACTIVITY_ID;

/** Mockup 25's dogs: Laura's Duna and Rock, and Toby of Joan Antoni's family group. */
const HISTORY_DOGS: readonly HistoryDog[] = [
  { id: DUNA, levelCode: "C", name: "Duna", own: true },
  { id: ROCK, levelCode: "D", name: "Rock", own: true },
  { id: TOBY, levelCode: "B", name: "Toby", own: false, ownerFirstName: "Joan Antoni" },
];

function classRow(
  id: string,
  date: string,
  time: string,
  title: string,
  dog: "Duna" | "Rock" | "Toby",
  state: HistoryItem["state"],
  counts: boolean,
  detail: NonNullable<HistoryItem["detail"]> | null,
): HistoryItem {
  const dogId = dog === "Duna" ? DUNA : dog === "Rock" ? ROCK : TOBY;
  return {
    // The api sends `activityId` on every row: null but on an activity whose page answers.
    activityId: null,
    counts,
    date,
    detail,
    dogId,
    dogName: dog,
    id,
    startsAtLocal: `${date}T${time}`,
    state,
    title,
    type: "CLASS",
  };
}

/** The seven rows of mockup 25, in the api's order (`startsAt` desc) — S10 §6's example. */
function mockupRows(): HistoryItem[] {
  return [
    classRow("b9", "2026-07-28", "18:50", "Classe B+C", "Duna", "DONE", true, null),
    {
      activityId: null,
      counts: null,
      date: "2026-07-24",
      detail: null,
      dogId: ROCK,
      dogName: "Rock",
      id: "tb4",
      startsAtLocal: "2026-07-24T08:00",
      state: "DONE",
      title: "Entrenament",
      type: "TRAINING",
    },
    classRow("b8", "2026-07-21", "18:50", "Classe B+C", "Duna", "CANCELLED_LATE", true, {
      at: "2026-07-21T17:10:00Z",
      atLocal: "19:10",
      kind: "BY_MEMBER",
    }),
    classRow("b7", "2026-07-17", "19:00", "Classe D i sup.", "Rock", "CANCELLED_BY_CLUB", false, {
      kind: "BY_CLUB",
      message: "Pluja forta: pistes tancades",
    }),
    classRow("b6", "2026-07-14", "18:50", "Classe B+C", "Duna", "NO_SHOW", true, {
      kind: "NO_SHOW",
    }),
    {
      // A FINISHED activity: its page answers (S07 §6), so the row links to it (E74, E75).
      activityId: HISTORY_DONE_ACTIVITY_ID,
      counts: null,
      date: "2026-07-12",
      detail: null,
      dogId: null,
      dogName: null,
      id: "ar1",
      startsAtLocal: "2026-07-12T09:00",
      state: "DONE",
      title: "Seminari d'obstacles",
      type: "ACTIVITY",
    },
    classRow("b5", "2026-07-08", "18:50", "Classe C+D", "Duna", "CANCELLED", false, {
      kind: "BY_MEMBER_IN_TIME",
    }),
  ];
}

/**
 * Every other line of R-10-14's table: a cancelled future class at the top (§13-14), «ha avisat»
 * late and in time, the club on the member's behalf, the system (inactivity or leave), a
 * training the member cancelled, one the club cancelled, and a club cancellation without a
 * message.
 */
function allReasonRows(): HistoryItem[] {
  return [
    classRow("b20", "2026-08-10", "18:50", "Classe B+C", "Duna", "CANCELLED", false, {
      kind: "BY_MEMBER_IN_TIME",
    }),
    classRow("b19", "2026-07-30", "18:50", "Classe B+C", "Duna", "CANCELLED_LATE", true, {
      at: "2026-07-30T15:05:00Z",
      atLocal: "17:05",
      kind: "INSTRUCTOR_NOTICE",
    }),
    classRow("b18", "2026-07-27", "18:50", "Classe A+B", "Toby", "CANCELLED", false, {
      kind: "INSTRUCTOR_NOTICE_IN_TIME",
    }),
    classRow("b17", "2026-07-23", "19:00", "Classe D i sup.", "Rock", "CANCELLED", false, {
      kind: "BY_CLUB_ON_BEHALF",
    }),
    classRow("b16", "2026-07-20", "18:50", "Classe B+C", "Duna", "CANCELLED", false, {
      kind: "SYSTEM",
    }),
    {
      activityId: null,
      counts: null,
      date: "2026-07-18",
      detail: { kind: "BY_MEMBER_IN_TIME" },
      dogId: ROCK,
      dogName: "Rock",
      id: "tb3",
      startsAtLocal: "2026-07-18T10:30",
      state: "CANCELLED",
      title: "Entrenament",
      type: "TRAINING",
    },
    {
      activityId: null,
      counts: null,
      date: "2026-07-16",
      detail: { kind: "BY_CLUB", message: null },
      dogId: ROCK,
      dogName: "Rock",
      id: "tb2",
      startsAtLocal: "2026-07-16T08:00",
      state: "CANCELLED_BY_CLUB",
      title: "Entrenament",
      type: "TRAINING",
    },
    classRow("b15", "2026-07-15", "19:00", "Classe D i sup.", "Rock", "CANCELLED_BY_CLUB", false, {
      kind: "BY_CLUB",
      message: null,
    }),
  ];
}

export interface HistoryQuery {
  dogId: string | null;
  /** The club's modules (FREE_TRAINING, ACTIVITIES, FAMILY_GROUP decide types and dogs). */
  modules: readonly string[];
  type: string | null;
  variant: HistoryVariant | undefined;
}

/**
 * `GET /me/history` as the api builds it (S10 §6, R-10-14): the accessible dogs (own first, the
 * group's with `FAMILY_GROUP`), `showDog` with more than one, the types the modules allow and the
 * rows of the requested dog and type, newest first. `undefined` = the dog is not accessible (404).
 */
export function memberHistoryView(query: HistoryQuery): MemberHistory | undefined {
  const family = query.modules.includes("FAMILY_GROUP");
  const dogs =
    query.variant === "singleDog"
      ? HISTORY_DOGS.filter((dog) => dog.id === DUNA)
      : HISTORY_DOGS.filter((dog) => dog.own || family);
  if (query.dogId !== null && !dogs.some((dog) => dog.id === query.dogId)) return undefined;
  const types: MemberHistory["types"] = [
    "CLASS",
    ...(query.modules.includes("FREE_TRAINING") ? (["TRAINING"] as const) : []),
    ...(query.modules.includes("ACTIVITIES") ? (["ACTIVITY"] as const) : []),
  ];
  const source =
    query.variant === "empty"
      ? []
      : query.variant === "allReasons"
        ? [...allReasonRows(), ...mockupRows()]
        : mockupRows();
  const accessible = new Set(dogs.map((dog) => dog.id));
  const items = source
    .filter((item) => types.includes(item.type))
    .filter((item) => item.dogId == null || accessible.has(item.dogId))
    // Activities are the member's, not a dog's: listed with «Tots» only (the contract's description).
    .filter((item) =>
      query.dogId === null ? true : item.type !== "ACTIVITY" && item.dogId === query.dogId,
    )
    .filter((item) => query.type === null || item.type === query.type)
    .sort((left, right) =>
      (right.startsAtLocal ?? right.date).localeCompare(left.startsAtLocal ?? left.date),
    );
  return {
    dogs: [...dogs],
    from: "2026-06-03",
    items,
    monthsVisible: 2,
    showDog: dogs.length > 1,
    types,
  };
}

// ── Screen 26 and D13 · tasks, observations and attachments (R-10-10…R-10-12) ───────────────

/** The world's Duna (the card of 22 and D13) and a dog that is no longer active (`DOG_NOT_ACTIVE`). */
export const FOLLOWUP_DOG_ID = DUNA;
export const FOLLOWUP_INACTIVE_DOG_ID = "dog-lluna-baixa";
/** `files.maxAttachmentsPerEntity` of the catalog (S10 §13 proposal, value 10). */
export const FOLLOWUP_MAX_ATTACHMENTS = 10;
/** Signed uploads go to the page's own origin (MSW answers them): no request leaves it. */
export const FOLLOWUP_UPLOAD_PATH = "/mock-uploads/";
/** A signed upload's grant lasts five minutes (R-10-11; the contract's «URLs last five minutes»). */
export const FOLLOWUP_UPLOAD_GRANT_MS = 5 * 60_000;

const ESTEL: Actor = {
  accountId: "account-estel",
  displayName: "Estel",
  gender: "FEMALE",
  role: "INSTRUCTOR",
};
const MARC: Actor = {
  accountId: "account-marc",
  displayName: "Marc",
  gender: "MALE",
  role: "INSTRUCTOR",
};
const LAURA: Actor = {
  accountId: "account-laura",
  displayName: "Laura",
  gender: "FEMALE",
  role: "MEMBER",
};

interface StoredTask {
  createdAt: string;
  createdBy: Actor;
  deletedAt: string | null;
  dogId: string;
  doneAt: string | null;
  doneBy: Actor | null;
  id: string;
  state: Task["state"];
  text: string;
  version: number;
}

interface StoredAttachment {
  entityId: string;
  entityType: AttachmentEntity;
  fileKey: string;
  id: string;
  mimeType: string;
  name: string;
  removedAt: string | null;
  sizeBytes: number;
  uploadedAt: string;
}

interface StoredObservations {
  text: string | null;
  updatedAt: string | null;
  updatedByName: string | null;
  version: number;
}

interface StoredUpload {
  /** The grant's end (epoch ms, the mock clock): the storage and a claim refuse it afterwards. */
  expiresAt: number;
  fileName: string;
  mimeType: string;
  purpose: UploadPurpose;
  sizeBytes: number;
}

/** A grant still in force at the mock clock's `now` (R-10-11). */
export function uploadGrantLive(upload: { expiresAt: number }, now = Date.now()): boolean {
  return now < upload.expiresAt;
}

interface Replay {
  body: unknown;
  signature: string;
  status: number;
}

function initialTasks(): StoredTask[] {
  return [
    {
      createdAt: "2026-07-31T16:00:00Z",
      createdBy: ESTEL,
      deletedAt: null,
      dogId: DUNA,
      doneAt: null,
      doneBy: null,
      id: "t1",
      state: "PENDING",
      text: "Aquesta setmana practiqueu el balancí amb calma: sessions curtes i moltes recompenses",
      version: 1,
    },
    {
      createdAt: "2026-07-30T17:30:00Z",
      createdBy: MARC,
      deletedAt: null,
      dogId: DUNA,
      doneAt: null,
      doneBy: null,
      id: "t2",
      state: "PENDING",
      text: "Repasseu la taula de contactes al jardí, 5 minuts al dia",
      version: 1,
    },
    {
      createdAt: "2026-07-28T16:00:00Z",
      createdBy: ESTEL,
      deletedAt: null,
      dogId: DUNA,
      doneAt: "2026-08-02T09:15:00Z",
      doneBy: LAURA,
      id: "t3",
      state: "DONE",
      text: "Treballar l'«espera» a la línia de sortida",
      version: 2,
    },
  ];
}

/** The `tasksMany` variant: Duna has this many tasks, more than one page of `GET /tasks` (50). */
export const FOLLOWUP_MANY_TASKS = 52;

/**
 * The older tasks of the `tasksMany` variant, one a day back from 27-07 (after mockup 26's three,
 * `createdAt` desc): every third one done by Laura; the two oldest — «Repàs 48», done, and «Repàs
 * 49», pending — sit on the second page.
 */
function manyTasks(): StoredTask[] {
  return Array.from({ length: FOLLOWUP_MANY_TASKS - 3 }, (_, index) => {
    const created = new Date(Date.UTC(2026, 6, 27 - index, 16));
    const done = index % 3 === 2;
    return {
      createdAt: created.toISOString().replace(/\.\d{3}Z$/u, "Z"),
      createdBy: index % 2 === 0 ? ESTEL : MARC,
      deletedAt: null,
      dogId: DUNA,
      doneAt: done
        ? new Date(created.getTime() + 2 * 86_400_000).toISOString().replace(/\.\d{3}Z$/u, "Z")
        : null,
      doneBy: done ? LAURA : null,
      id: `t-repas-${String(index + 1)}`,
      state: done ? ("DONE" as const) : ("PENDING" as const),
      text: `Repàs ${String(index + 1)}: dues sessions curtes de contactes`,
      version: done ? 2 : 1,
    };
  });
}

function initialAttachments(): StoredAttachment[] {
  return [
    {
      entityId: "t1",
      entityType: "TASK",
      fileKey: "tasks/mock/video_balanci.mp4",
      id: "a2",
      mimeType: "video/mp4",
      name: "vídeo_balancí.mp4",
      removedAt: null,
      sizeBytes: 8_123_456,
      uploadedAt: "2026-07-31T16:00:00Z",
    },
    {
      entityId: DUNA,
      entityType: "INSTRUCTOR_NOTE",
      fileKey: "notes/mock/foto_balanci.jpg",
      id: "a1",
      mimeType: "image/jpeg",
      name: "foto_balancí.jpg",
      removedAt: null,
      sizeBytes: 412_000,
      uploadedAt: "2026-08-01T17:02:00Z",
    },
  ];
}

function initialObservations(): Map<string, StoredObservations> {
  return new Map([
    [
      DUNA,
      {
        text: "Va molt bé amb reforç de pilota. Evitar sobrecàrrega de salts: revisar espatlla dreta si coixeja. Parlar amb la Laura del pas a D a final de temporada.",
        updatedAt: "2026-08-01T10:00:00Z",
        updatedByName: "Marc",
        version: 4,
      },
    ],
  ]);
}

export const followupState: {
  attachments: StoredAttachment[];
  idempotency: Map<string, Replay>;
  /** The `many` variant's older tasks are in `tasks` already. */
  manySeeded: boolean;
  nextId: number;
  observations: Map<string, StoredObservations>;
  /** The `stale` variant's other save of the observations happened already. */
  otherSaved: boolean;
  tasks: StoredTask[];
  uploads: Map<string, StoredUpload>;
} = {
  attachments: initialAttachments(),
  idempotency: new Map(),
  manySeeded: false,
  nextId: 100,
  observations: initialObservations(),
  otherSaved: false,
  tasks: initialTasks(),
  uploads: new Map(),
};

export function resetFollowupState(): void {
  followupState.attachments = initialAttachments();
  followupState.idempotency = new Map();
  followupState.manySeeded = false;
  followupState.nextId = 100;
  followupState.observations = initialObservations();
  followupState.otherSaved = false;
  followupState.tasks = initialTasks();
  followupState.uploads = new Map();
}

/** The scenario's variant of the tasks world (`many`: 52 tasks on Duna), seeded once per reset. */
export type FollowupVariant = "many" | "stale";

export function syncFollowupVariant(variant: FollowupVariant | undefined): void {
  if (variant !== "many" || followupState.manySeeded) return;
  followupState.manySeeded = true;
  followupState.tasks.push(...manyTasks());
}

export function nextFollowupId(prefix: string): string {
  followupState.nextId += 1;
  return `${prefix}-${String(followupState.nextId)}`;
}

/** A dog the follow-up world knows: Duna, any census dog, or the inactive one. */
export function followupDogStatus(dogId: string): "ACTIVE" | "INACTIVE" | undefined {
  if (dogId === FOLLOWUP_INACTIVE_DOG_ID) return "INACTIVE";
  if (dogId === DUNA || censusDogs.some((dog) => dog.id === dogId)) return "ACTIVE";
  return undefined;
}

/** A short-lived signed url of the storage (fictional host, never fetched: R-10-11, 5 minutes). */
function signedUrl(attachment: StoredAttachment): string {
  return `https://files.example.test/${encodeURIComponent(attachment.fileKey)}?X-Amz-Expires=300&X-Amz-Signature=mock`;
}

export function attachmentView(attachment: StoredAttachment): Attachment {
  return {
    id: attachment.id,
    mimeType: attachment.mimeType,
    name: attachment.name,
    sizeBytes: attachment.sizeBytes,
    uploadedAt: attachment.uploadedAt,
    url: signedUrl(attachment),
  };
}

/** The live attachments of an entity, oldest first (the contract's order). */
export function liveAttachments(
  entityType: AttachmentEntity,
  entityId: string,
): StoredAttachment[] {
  return followupState.attachments
    .filter(
      (item) =>
        item.entityType === entityType && item.entityId === entityId && item.removedAt === null,
    )
    .sort((left, right) => left.uploadedAt.localeCompare(right.uploadedAt));
}

function cardAttachments(entityType: AttachmentEntity, entityId: string): CardAttachment[] {
  return liveAttachments(entityType, entityId).map((item) => ({
    id: item.id,
    mimeType: item.mimeType,
    name: item.name,
    url: signedUrl(item),
  }));
}

export function taskView(task: StoredTask, withDeleted = false): Task {
  return {
    attachments: liveAttachments("TASK", task.id).map(attachmentView),
    createdAt: task.createdAt,
    createdBy: task.createdBy,
    ...(withDeleted ? { deletedAt: task.deletedAt } : {}),
    dogId: task.dogId,
    doneAt: task.doneAt,
    doneBy: task.doneBy,
    id: task.id,
    state: task.state,
    text: task.text,
    version: task.version,
  };
}

export function findTask(id: string): StoredTask | undefined {
  return followupState.tasks.find((task) => task.id === id && task.deletedAt === null);
}

/** A dog's tasks, `createdAt` desc (S10 §6), without the deleted ones unless asked. */
export function dogTasks(dogId: string, includeDeleted = false): StoredTask[] {
  return followupState.tasks
    .filter((task) => task.dogId === dogId && (includeDeleted || task.deletedAt === null))
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

/** The card's `tasks` block (22, D13): the counters and the latest task, from the live tasks. */
export function tasksBlock(dogId: string): TasksBlock {
  const tasks = dogTasks(dogId);
  const [latest] = tasks;
  return {
    doneCount: tasks.filter((task) => task.state === "DONE").length,
    latest:
      latest === undefined
        ? null
        : {
            createdAt: latest.createdAt,
            createdByName: latest.createdBy.displayName,
            id: latest.id,
            text: latest.text,
          },
    pendingCount: tasks.filter((task) => task.state === "PENDING").length,
  };
}

/** The card's private `observations` block (R-10-12): never on a `/me/*` answer. */
export function observationsBlock(dogId: string): ObservationsBlock {
  const stored = followupState.observations.get(dogId);
  return {
    attachments: cardAttachments("DOG_OBSERVATIONS", dogId),
    text: stored?.text ?? null,
    updatedAt: stored?.updatedAt ?? null,
    updatedByName: stored?.updatedByName ?? null,
    version: stored?.version ?? 1,
  };
}

/** The member's note attachments (`INSTRUCTOR_NOTE`), read-only here (R-10-12). */
export function instructorNoteAttachments(dogId: string): CardAttachment[] {
  return cardAttachments("INSTRUCTOR_NOTE", dogId);
}

export function storedObservations(dogId: string): StoredObservations {
  const stored = followupState.observations.get(dogId);
  if (stored !== undefined) return stored;
  const created: StoredObservations = {
    text: null,
    updatedAt: null,
    updatedByName: null,
    version: 1,
  };
  followupState.observations.set(dogId, created);
  return created;
}

/** The `tasksStale` variant: another instructor saved Duna's observations a moment before. */
export function applyOtherObservationsSave(dogId: string, at: string): void {
  if (followupState.otherSaved) return;
  followupState.otherSaved = true;
  const stored = storedObservations(dogId);
  stored.text = "Va molt bé amb reforç de pilota. Evitar sobrecàrrega de salts.";
  stored.updatedAt = at;
  stored.updatedByName = "Núria";
  stored.version += 1;
}

// ── D14 · `GET /followup` and the read marks (R-10-13) ─────────────────────────────────────────

type FollowupItem = components["schemas"]["FollowupItem"];

/**
 * Club-wide variants of D14 (one per scenario): `allRead`, every row already read by the caller;
 * `many`, more rows than one page (see `manyInboxNotes`).
 */
export type InboxVariant = "allRead" | "many";

/** The account of the `instructor` scenario, which this world treats as Estel's (mockup 20). */
export const ESTEL_ACCOUNT_ID = "10000000-0000-4000-8000-000000000003";
const MARC_ACCOUNT_ID = "10000000-0000-4000-8000-0000000000c2";
const LAURA_ACCOUNT_ID = "10000000-0000-4000-8000-0000000000a1";
const PAU_ACCOUNT_ID = "10000000-0000-4000-8000-0000000000a2";
/** «Marcar-ho tot com a llegit» of the `followupAllRead` scenario: after every row of the world. */
export const INBOX_ALL_READ_AT = "2026-08-19T20:00:00Z";

interface StoredInboxItem {
  activityAt: string;
  authorAccountId: string;
  authorGender: NonNullable<FollowupItem["authorGender"]> | null;
  authorName: string;
  authorRole: NonNullable<FollowupItem["authorRole"]>;
  completedAt: string | null;
  createdAt: string;
  dogId: string;
  dogName: string;
  hidden: boolean;
  id: string;
  kind: NonNullable<FollowupItem["kind"]>;
  levelCode: string | null;
  memberId: string;
  memberName: string;
  taskId: string | null;
  /** The task's or the note's whole text, when the excerpt is shorter (`q` searches it, E75). */
  text?: string;
  textExcerpt: string;
}

/** Mockup D14's five rows (two members' notes, three tasks, one completed on 02-08). */
function initialInbox(): StoredInboxItem[] {
  const duna = {
    dogId: DUNA,
    dogName: "Duna",
    levelCode: "C",
    memberId: "member-laura",
    memberName: "Laura Serra",
  };
  return [
    {
      ...duna,
      activityAt: "2026-08-19T17:02:00Z",
      authorAccountId: LAURA_ACCOUNT_ID,
      authorGender: "FEMALE",
      authorName: "Laura",
      authorRole: "MEMBER",
      completedAt: null,
      createdAt: "2026-08-19T17:02:00Z",
      hidden: false,
      id: "f-note-duna",
      kind: "MEMBER_NOTE",
      taskId: null,
      textExcerpt:
        "A veure si treballem una mica el doble a classe. El gos s'atura molt aviat al balancí",
    },
    {
      activityAt: "2026-08-19T09:40:00Z",
      authorAccountId: PAU_ACCOUNT_ID,
      authorGender: "MALE",
      authorName: "Pau",
      authorRole: "MEMBER",
      completedAt: null,
      createdAt: "2026-08-19T09:40:00Z",
      dogId: "dog-blat",
      dogName: "Blat",
      hidden: false,
      id: "f-note-blat",
      kind: "MEMBER_NOTE",
      levelCode: "B",
      memberId: "member-pau",
      memberName: "Pau Riera",
      taskId: null,
      textExcerpt: "Aquesta setmana no podrem venir dijous",
    },
    {
      ...duna,
      activityAt: "2026-08-12T16:00:00Z",
      authorAccountId: ESTEL_ACCOUNT_ID,
      authorGender: null,
      authorName: "Estel",
      authorRole: "INSTRUCTOR",
      completedAt: null,
      createdAt: "2026-08-12T16:00:00Z",
      hidden: false,
      id: "f-task-balanci",
      kind: "TASK",
      taskId: "t-d14-balanci",
      text: "Practiqueu el balancí amb calma: sessions curtes i moltes recompenses",
      textExcerpt: "Practiqueu el balancí amb calma: sessions curtes",
    },
    {
      activityAt: "2026-08-10T17:30:00Z",
      authorAccountId: MARC_ACCOUNT_ID,
      authorGender: null,
      authorName: "Marc",
      authorRole: "INSTRUCTOR",
      completedAt: null,
      createdAt: "2026-08-10T17:30:00Z",
      dogId: "dog-nass",
      dogName: "Nass",
      hidden: false,
      id: "f-task-contactes",
      kind: "TASK",
      levelCode: "B",
      memberId: "member-anna",
      memberName: "Anna Ballart",
      taskId: "t-d14-contactes",
      text: "Repasseu la taula de contactes al jardí, 5 minuts al dia",
      textExcerpt: "Repasseu la taula de contactes al jardí",
    },
    {
      ...duna,
      // Completing a task sets `completedAt` but never moves `activityAt` (R-10-13).
      activityAt: "2026-07-28T16:00:00Z",
      authorAccountId: ESTEL_ACCOUNT_ID,
      authorGender: null,
      authorName: "Estel",
      authorRole: "INSTRUCTOR",
      completedAt: "2026-08-02T09:15:00Z",
      createdAt: "2026-07-28T16:00:00Z",
      hidden: false,
      id: "f-task-espera",
      kind: "TASK",
      taskId: "t3",
      text: "Treballar l'«espera» a la línia de sortida",
      textExcerpt: "Treballar l'«espera» a la sortida",
    },
  ];
}

/** The `followupMany` variant: this many more notes of Laura's, all newer than mockup D14's rows. */
export const INBOX_MANY_NOTES = 52;
/** In the `many` variant the caller has read mockup D14's three tasks one by one. */
const INBOX_MANY_READ_IDS = ["f-task-balanci", "f-task-contactes", "f-task-espera"];

/**
 * The `followupMany` variant's notes (Laura on Duna, one a minute back from 19-08 20:00 UTC): unread
 * and newer than every mockup row, so the first page (50) holds only unread notes, while the tasks
 * and the rows already read sit on the second one.
 */
function manyInboxNotes(): StoredInboxItem[] {
  return Array.from({ length: INBOX_MANY_NOTES }, (_, index) => {
    const at = new Date(Date.UTC(2026, 7, 19, 20, 0 - index))
      .toISOString()
      .replace(/\.\d{3}Z$/u, "Z");
    return {
      activityAt: at,
      authorAccountId: LAURA_ACCOUNT_ID,
      authorGender: "FEMALE",
      authorName: "Laura",
      authorRole: "MEMBER",
      completedAt: null,
      createdAt: at,
      dogId: DUNA,
      dogName: "Duna",
      hidden: false,
      id: `f-note-many-${String(index + 1)}`,
      kind: "MEMBER_NOTE",
      levelCode: "C",
      memberId: "member-laura",
      memberName: "Laura Serra",
      taskId: null,
      textExcerpt: `Nota ${String(index + 1)}: avui la Duna ha treballat bé el balancí`,
    };
  });
}

/** `FollowupReadMark` of one account (R-10-13): `readAllAt` and the rows read one by one. */
interface ReadMark {
  readAllAt: string | null;
  readItemIds: string[];
}

export const inboxState: {
  idempotency: Map<string, Replay>;
  items: StoredInboxItem[];
  /** The `many` variant's notes are in `items` already. */
  manySeeded: boolean;
  marks: Map<string, ReadMark>;
} = {
  idempotency: new Map(),
  items: initialInbox(),
  manySeeded: false,
  marks: new Map(),
};

export function resetInboxState(): void {
  inboxState.idempotency = new Map();
  inboxState.items = initialInbox();
  inboxState.manySeeded = false;
  inboxState.marks = new Map();
}

/** The scenario's variant of D14's rows (`many`), seeded once per reset. */
export function syncInboxVariant(variant: InboxVariant | undefined): void {
  if (variant !== "many" || inboxState.manySeeded) return;
  inboxState.manySeeded = true;
  inboxState.items.push(...manyInboxNotes());
}

function readMark(accountId: string, variant: InboxVariant | undefined): ReadMark {
  const known = inboxState.marks.get(accountId);
  if (known !== undefined) return known;
  const created: ReadMark = {
    readAllAt: variant === "allRead" ? INBOX_ALL_READ_AT : null,
    readItemIds: variant === "many" ? [...INBOX_MANY_READ_IDS] : [],
  };
  inboxState.marks.set(accountId, created);
  return created;
}

/** R-10-13: `activityAt > readAllAt ∧ id ∉ readItemIds ∧ author ≠ me`. */
function isUnread(item: StoredInboxItem, accountId: string, mark: ReadMark): boolean {
  return (
    (mark.readAllAt === null || item.activityAt > mark.readAllAt) &&
    !mark.readItemIds.includes(item.id) &&
    item.authorAccountId !== accountId
  );
}

export interface InboxQuery {
  accountId: string;
  /** `field:op:value` filters on `x-filterable` (already validated). */
  filters: readonly { field: string; op: string; value: string }[];
  levelsEnabled: boolean;
  /** `activityAt` direction within each group (unread first, then the rest). */
  order: "asc" | "desc";
  /** Free-text search (`q`); empty = none. */
  q: string;
  variant: InboxVariant | undefined;
}

/** A row's value of a filterable field as the filters compare it (`unread` is the caller's). */
function inboxFieldValue(item: StoredInboxItem, unread: boolean, field: string): string {
  if (field === "unread") return String(unread);
  const value = (item as unknown as Record<string, unknown>)[field];
  return typeof value === "string" ? value : "";
}

/** The visible rows the query selects (`q` and every filter), each with the caller's `unread`. */
function inboxSelection(query: InboxQuery): { item: StoredInboxItem; unread: boolean }[] {
  const mark = readMark(query.accountId, query.variant);
  const matches = (
    item: StoredInboxItem,
    unread: boolean,
    filter: InboxQuery["filters"][number],
  ) => {
    const value = inboxFieldValue(item, unread, filter.field);
    const values = filter.value.split(",");
    return filter.op === "ne"
      ? value !== filter.value
      : filter.op === "in"
        ? values.includes(value)
        : filter.op === "nin"
          ? !values.includes(value)
          : value === filter.value;
  };
  // `q` (E75): the member's full name, the dog, the author and the whole text (not only the
  // excerpt), any case, taken literally.
  const text = query.q.trim().toLocaleLowerCase("ca");
  const found = (item: StoredInboxItem) =>
    text === "" ||
    [item.memberName, item.dogName, item.authorName, item.text ?? item.textExcerpt].some((value) =>
      value.toLocaleLowerCase("ca").includes(text),
    );
  return inboxState.items
    .filter((item) => !item.hidden && found(item))
    .map((item) => ({ item, unread: isUnread(item, query.accountId, mark) }))
    .filter(({ item, unread }) => query.filters.every((filter) => matches(item, unread, filter)));
}

/**
 * `GET /followup/filter-values` (S10 §6, E75): the top 50 values of `field` over the whole set the
 * other filters and `q` select (the field's own filters left out; never one page), each counted,
 * labelled by the member's full name, the dog's name or the author's name as their newest row
 * stores it; `kind` and `unread` (the caller's) by their value.
 */
export function inboxFilterValues(
  query: InboxQuery,
  field: string,
): { count: number; label: string; value: boolean | string }[] {
  const rows = inboxSelection({
    ...query,
    filters: query.filters.filter((filter) => filter.field !== field),
  }).sort((left, right) => right.item.activityAt.localeCompare(left.item.activityAt));
  const counted = new Map<string, { count: number; label: string }>();
  for (const { item, unread } of rows) {
    const value = inboxFieldValue(item, unread, field);
    if (value === "") continue;
    const label =
      field === "memberId"
        ? item.memberName
        : field === "dogId"
          ? item.dogName
          : field === "authorAccountId"
            ? item.authorName
            : value;
    const known = counted.get(value);
    // Newest first: the first row seen gives the label.
    counted.set(value, { count: (known?.count ?? 0) + 1, label: known?.label ?? label });
  }
  return [...counted.entries()]
    .sort(([leftValue, left], [rightValue, right]) =>
      left.count === right.count ? leftValue.localeCompare(rightValue) : right.count - left.count,
    )
    .slice(0, 50)
    .map(([value, entry]) => ({
      count: entry.count,
      label: entry.label,
      value: field === "unread" ? value === "true" : value,
    }));
}

/** The visible rows as the caller reads them, unread first then by `activityAt` (R-10-13). */
export function inboxRows(query: InboxQuery): FollowupItem[] {
  return inboxSelection(query)
    .sort(
      (left, right) =>
        Number(right.unread) - Number(left.unread) ||
        (query.order === "asc"
          ? left.item.activityAt.localeCompare(right.item.activityAt)
          : right.item.activityAt.localeCompare(left.item.activityAt)),
    )
    .map(({ item, unread }): FollowupItem => ({
      activityAt: item.activityAt,
      authorGender: item.authorGender,
      authorName: item.authorName,
      authorRole: item.authorRole,
      completedAt: item.completedAt,
      createdAt: item.createdAt,
      dogId: item.dogId,
      dogName: item.dogName,
      id: item.id,
      kind: item.kind,
      levelCode: query.levelsEnabled ? item.levelCode : null,
      memberId: item.memberId,
      memberName: item.memberName,
      taskId: item.taskId,
      textExcerpt: item.textExcerpt,
      unread,
    }));
}

/** The menu counter: the caller's unread rows (the same count as the list's `unread` rows). */
export function inboxUnreadCount(accountId: string, variant: InboxVariant | undefined): number {
  const mark = readMark(accountId, variant);
  return inboxState.items.filter((item) => !item.hidden && isUnread(item, accountId, mark)).length;
}

/** `POST /followup/{id}/read`: `readItemIds += id`; `false` = no such visible row (404). */
export function readInboxItem(
  accountId: string,
  id: string,
  variant: InboxVariant | undefined,
): boolean {
  if (!inboxState.items.some((item) => item.id === id && !item.hidden)) return false;
  const mark = readMark(accountId, variant);
  if (!mark.readItemIds.includes(id)) mark.readItemIds.push(id);
  return true;
}

/** `POST /followup/read-all`: `readAllAt = now`, `readItemIds = []` (O(1), R-10-13). */
export function readAllInbox(accountId: string, now: number): void {
  inboxState.marks.set(accountId, {
    readAllAt: new Date(now).toISOString(),
    readItemIds: [],
  });
}

export type { StoredAttachment, StoredTask, StoredUpload };
