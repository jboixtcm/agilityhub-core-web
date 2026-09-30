import type { components } from "../../generated/schema";

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
  fileName: string;
  mimeType: string;
  purpose: UploadPurpose;
  sizeBytes: number;
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
  nextId: number;
  observations: Map<string, StoredObservations>;
  /** The `stale` variant's other save of the observations happened already. */
  otherSaved: boolean;
  tasks: StoredTask[];
  uploads: Map<string, StoredUpload>;
} = {
  attachments: initialAttachments(),
  idempotency: new Map(),
  nextId: 100,
  observations: initialObservations(),
  otherSaved: false,
  tasks: initialTasks(),
  uploads: new Map(),
};

export function resetFollowupState(): void {
  followupState.attachments = initialAttachments();
  followupState.idempotency = new Map();
  followupState.nextId = 100;
  followupState.observations = initialObservations();
  followupState.otherSaved = false;
  followupState.tasks = initialTasks();
  followupState.uploads = new Map();
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

export type { StoredAttachment, StoredTask, StoredUpload };
