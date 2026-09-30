import { http, HttpResponse } from "msw";

import type { components } from "../generated/schema";

import { BOOKING_DOG_IDS } from "./fixtures/bookings";
import {
  applyOtherObservationsSave,
  attachmentView,
  dogTasks,
  findTask,
  FOLLOWUP_MAX_ATTACHMENTS,
  FOLLOWUP_UPLOAD_PATH,
  followupDogStatus,
  followupState,
  inboxRows,
  inboxState,
  inboxUnreadCount,
  liveAttachments,
  memberHistoryView,
  nextFollowupId,
  readAllInbox,
  readInboxItem,
  resetFollowupState,
  resetInboxState,
  storedObservations,
  taskView,
} from "./fixtures/followup";
import { fieldsProjection } from "./list-fields";
import { apiError, levelsEnabled, validationError } from "./planning-handlers";
import { currentMockScenario, type MockScenarioDefinition } from "./scenarios";

type FollowupItem = components["schemas"]["FollowupItem"];
type AttachmentRequest = components["schemas"]["AttachmentRequest"];
type AttachmentEntity = AttachmentRequest["entityType"];
type ObservationsRequest = components["schemas"]["ObservationsRequest"];
type TaskCreateRequest = components["schemas"]["TaskCreateRequest"];
type TaskPatchRequest = components["schemas"]["TaskPatchRequest"];
type UploadRequest = components["schemas"]["UploadRequest"];

/** `files.maxSizeMb` and `files.allowedTypes` of the catalog (CATALEG_PARAMETRES «Fitxers»). */
const MAX_SIZE_MB = 25;
const ALLOWED_TYPES = ["image/*", "video/mp4", "video/quicktime", "application/pdf"];
/** The member's own dogs in the booking world (Toby is the family group's: 404 for tasks). */
const MEMBER_OWN_DOGS: readonly string[] = [BOOKING_DOG_IDS.duna, BOOKING_DOG_IDS.rock];

/** Resets the follow-up world (tests call it between cases, like the other mock states). */
export function resetFollowupMockState(): void {
  resetFollowupState();
  resetInboxState();
}

function impersonated(scenario: MockScenarioDefinition): boolean {
  return scenario.me.impersonation !== undefined;
}

function roles(scenario: MockScenarioDefinition): readonly string[] {
  return scenario.me.membership?.roles ?? [];
}

function staff(scenario: MockScenarioDefinition): boolean {
  return roles(scenario).includes("INSTRUCTOR") || roles(scenario).includes("ADMIN");
}

function member(scenario: MockScenarioDefinition): boolean {
  return impersonated(scenario) || roles(scenario).includes("MEMBER");
}

/** INSTRUCTOR/ADMIN writes (S10 §6): an impersonation token → `IMPERSONATION_DENIED`, a member → 403. */
function staffOnly(scenario: MockScenarioDefinition) {
  if (impersonated(scenario)) {
    return apiError("IMPERSONATION_DENIED", "Impersonation tokens cannot use this route", 403);
  }
  return staff(scenario) ? undefined : apiError("FORBIDDEN", "Forbidden", 403);
}

/** §9: without TASKS every `/tasks*`, `/attachments*` and observations route is 404. */
function tasksOff(scenario: MockScenarioDefinition) {
  return scenario.branding.modules.includes("TASKS")
    ? undefined
    : apiError("MODULE_DISABLED", "Module disabled", 404);
}

/** The first refusal of a TASKS staff write: the module, then the caller. */
function staffWrite(scenario: MockScenarioDefinition) {
  return tasksOff(scenario) ?? staffOnly(scenario);
}

function callerName(scenario: MockScenarioDefinition): string {
  // The `instructor` scenario is Estel's profile in the S10 world (`OWN_INSTRUCTOR_ID`).
  if (roles(scenario).includes("INSTRUCTOR")) return "Estel";
  return scenario.me.account.name.split(" ")[0] ?? scenario.me.account.name;
}

function callerActor(scenario: MockScenarioDefinition) {
  const role = roles(scenario).includes("INSTRUCTOR")
    ? ("INSTRUCTOR" as const)
    : roles(scenario).includes("ADMIN")
      ? ("ADMIN" as const)
      : ("MEMBER" as const);
  return {
    accountId: scenario.me.account.id,
    displayName: callerName(scenario),
    gender: scenario.me.membership?.gender ?? null,
    role,
  };
}

/** A task the caller may read: staff any live one, a member the tasks of their own dogs. */
function readableTask(id: string, scenario: MockScenarioDefinition) {
  const task = findTask(id);
  if (task === undefined) return undefined;
  return staff(scenario) || MEMBER_OWN_DOGS.includes(task.dogId) ? task : undefined;
}

/**
 * CONVENCIONS_API §7: the same key and payload replay the first answer; the same key with another
 * payload is `409 IDEMPOTENCY_KEY_REUSED`.
 */
function idempotent(
  key: string,
  signature: string,
  answer: () => { body: unknown; status: number },
) {
  const replay = followupState.idempotency.get(key);
  if (replay !== undefined) {
    if (replay.signature !== signature) {
      return apiError("IDEMPOTENCY_KEY_REUSED", "Idempotency key reused", 409, {
        reason: "DIFFERENT_REQUEST",
      });
    }
    return replay.status === 204
      ? new HttpResponse(null, { status: 204 })
      : HttpResponse.json(replay.body as Record<string, unknown>, { status: replay.status });
  }
  const result = answer();
  // Only a success is remembered: a refused request may be sent again with the same key.
  if (result.status < 300) followupState.idempotency.set(key, { ...result, signature });
  return result.status === 204
    ? new HttpResponse(null, { status: 204 })
    : HttpResponse.json(result.body as Record<string, unknown>, { status: result.status });
}

function failure(status: number, code: string, details: Record<string, unknown> = {}) {
  return { body: { code, details, message: code, traceId: "mock-trace-id" }, status };
}

function allowedType(mimeType: string): boolean {
  return ALLOWED_TYPES.some((allowed) =>
    allowed.endsWith("/*") ? mimeType.startsWith(allowed.slice(0, -1)) : mimeType === allowed,
  );
}

/** The live attachments of the entity a request names, or its refusal (404). */
function attachmentEntityExists(entityType: AttachmentEntity, entityId: string): boolean {
  return entityType === "TASK"
    ? findTask(entityId) !== undefined
    : followupDogStatus(entityId) !== undefined;
}

/**
 * S10 (E6-W02): screen 25's history, screen 26's and D13's tasks, observations and attachments,
 * mocks-first on the published contract. Stateful: a write shows on the next read (also on the
 * card of 22 and D13, `fixtures/attendance.ts`).
 */
export const followupHandlers = [
  http.get("*/api/v1/me/history", ({ request }) => {
    const scenario = currentMockScenario();
    if (!member(scenario)) return apiError("FORBIDDEN", "Forbidden", 403);
    const url = new URL(request.url);
    const type = url.searchParams.get("type");
    if (type !== null && !["ACTIVITY", "CLASS", "TRAINING"].includes(type)) {
      return validationError("type");
    }
    const view = memberHistoryView({
      dogId: url.searchParams.get("dogId"),
      modules: scenario.branding.modules,
      type,
      variant: scenario.history,
    });
    return view === undefined
      ? apiError("DOG_NOT_ACCESSIBLE", "Dog not accessible", 404)
      : HttpResponse.json(view);
  }),
  http.get("*/api/v1/tasks", ({ request }) => {
    const scenario = currentMockScenario();
    const off = tasksOff(scenario);
    if (off !== undefined) return off;
    const url = new URL(request.url);
    const dogId = url.searchParams.get("dogId");
    if (dogId === null || dogId === "") return validationError("dogId", "REQUIRED");
    const includeDeleted = url.searchParams.get("includeDeleted") === "true";
    if (includeDeleted && !roles(scenario).includes("ADMIN")) {
      return apiError("FORBIDDEN", "Forbidden", 403);
    }
    if (!staff(scenario) && !impersonated(scenario) && !member(scenario)) {
      return apiError("FORBIDDEN", "Forbidden", 403);
    }
    if (!staff(scenario) && !MEMBER_OWN_DOGS.includes(dogId)) {
      return apiError("DOG_NOT_ACCESSIBLE", "Dog not accessible", 404);
    }
    if (followupDogStatus(dogId) === undefined) return apiError("NOT_FOUND", "Dog not found", 404);
    const page = Number(url.searchParams.get("page") ?? "0");
    const size = Number(url.searchParams.get("size") ?? "50");
    if (!Number.isInteger(page) || page < 0) return validationError("page");
    if (!Number.isInteger(size) || size < 1 || size > 200) return validationError("size");
    const state = url.searchParams.get("state");
    const includeDone = url.searchParams.get("includeDone") !== "false";
    const tasks = dogTasks(dogId, includeDeleted).filter((task) =>
      state === "PENDING" || state === "DONE"
        ? task.state === state
        : includeDone || task.state === "PENDING",
    );
    return HttpResponse.json({
      items: tasks
        .slice(page * size, page * size + size)
        .map((task) => taskView(task, includeDeleted)),
    });
  }),
  http.post("*/api/v1/tasks", async ({ request }) => {
    const scenario = currentMockScenario();
    const refused = staffWrite(scenario);
    if (refused !== undefined) return refused;
    const key = request.headers.get("Idempotency-Key");
    if (key === null || key === "") return validationError("Idempotency-Key", "REQUIRED");
    const body = (await request.json().catch(() => null)) as TaskCreateRequest | null;
    return idempotent(key, JSON.stringify(body), () => {
      const text = typeof body?.text === "string" ? body.text.trim() : "";
      if (body === null || typeof body.dogId !== "string" || body.dogId === "") {
        return failure(400, "VALIDATION_ERROR", {
          fieldErrors: [{ code: "REQUIRED", field: "dogId" }],
        });
      }
      if (text === "" || body.text.length > 2000) {
        return failure(400, "VALIDATION_ERROR", {
          fieldErrors: [{ code: text === "" ? "REQUIRED" : "TOO_LONG", field: "text" }],
        });
      }
      const status = followupDogStatus(body.dogId);
      if (status === undefined) return failure(404, "NOT_FOUND");
      if (status !== "ACTIVE") return failure(422, "DOG_NOT_ACTIVE");
      const fileKeys = body.attachmentIds ?? [];
      if (fileKeys.length > FOLLOWUP_MAX_ATTACHMENTS) {
        return failure(422, "ATTACHMENT_LIMIT_REACHED", { max: FOLLOWUP_MAX_ATTACHMENTS });
      }
      const uploads = fileKeys.map((fileKey) => followupState.uploads.get(fileKey));
      if (uploads.some((upload) => upload?.purpose !== "TASK")) {
        // A refused attachment leaves no task (the api's single transaction).
        return failure(422, "ATTACHMENT_ENTITY_MISMATCH");
      }
      const now = new Date().toISOString().replace(/\.\d{3}Z$/u, "Z");
      const task = {
        createdAt: now,
        createdBy: callerActor(scenario),
        deletedAt: null,
        dogId: body.dogId,
        doneAt: null,
        doneBy: null,
        id: nextFollowupId("task"),
        state: "PENDING" as const,
        text: body.text,
        version: 1,
      };
      followupState.tasks.push(task);
      fileKeys.forEach((fileKey, index) => {
        const upload = uploads[index];
        if (upload === undefined) return;
        followupState.attachments.push({
          entityId: task.id,
          entityType: "TASK",
          fileKey,
          id: nextFollowupId("attachment"),
          mimeType: upload.mimeType,
          name: upload.fileName.slice(0, 80),
          removedAt: null,
          sizeBytes: upload.sizeBytes,
          uploadedAt: now,
        });
      });
      return { body: taskView(task), status: 201 };
    });
  }),
  http.get("*/api/v1/tasks/:id", ({ params }) => {
    const scenario = currentMockScenario();
    const off = tasksOff(scenario);
    if (off !== undefined) return off;
    if (impersonated(scenario)) {
      return apiError("IMPERSONATION_DENIED", "Impersonation tokens cannot use this route", 403);
    }
    const task = readableTask(String(params.id), scenario);
    return task === undefined
      ? apiError("NOT_FOUND", "Task not found", 404)
      : HttpResponse.json(taskView(task));
  }),
  http.patch("*/api/v1/tasks/:id", async ({ params, request }) => {
    const scenario = currentMockScenario();
    const refused = staffWrite(scenario);
    if (refused !== undefined) return refused;
    const task = findTask(String(params.id));
    if (task === undefined) return apiError("NOT_FOUND", "Task not found", 404);
    const body = (await request.json().catch(() => null)) as TaskPatchRequest | null;
    if (body === null || typeof body.version !== "number") return validationError("version");
    if (typeof body.text !== "string" || body.text.trim() === "" || body.text.length > 2000) {
      return validationError("text");
    }
    if (body.version !== task.version) return apiError("STALE_VERSION", "Stale task version", 409);
    // The same text changes nothing (the contract's description).
    if (body.text !== task.text) {
      task.text = body.text;
      task.version += 1;
    }
    return HttpResponse.json(taskView(task));
  }),
  http.delete("*/api/v1/tasks/:id", ({ params, request }) => {
    const scenario = currentMockScenario();
    const refused = staffWrite(scenario);
    if (refused !== undefined) return refused;
    const key = request.headers.get("Idempotency-Key");
    if (key === null || key === "") return validationError("Idempotency-Key", "REQUIRED");
    const id = String(params.id);
    return idempotent(key, `delete:${id}`, () => {
      const task = findTask(id);
      if (task === undefined) return failure(404, "NOT_FOUND");
      task.deletedAt = new Date().toISOString();
      return { body: null, status: 204 };
    });
  }),
  http.post("*/api/v1/tasks/:id/completion", ({ params }) => {
    const scenario = currentMockScenario();
    const off = tasksOff(scenario);
    if (off !== undefined) return off;
    // MEMBER owner of the dog (also the impersonation token), INSTRUCTOR, ADMIN.
    const task = readableTask(String(params.id), scenario);
    if (task === undefined) return apiError("NOT_FOUND", "Task not found", 404);
    if (task.state === "DONE") return apiError("TASK_ALREADY_DONE", "Task already done", 422);
    task.state = "DONE";
    task.doneAt = new Date().toISOString().replace(/\.\d{3}Z$/u, "Z");
    task.doneBy = callerActor(scenario);
    task.version += 1;
    return HttpResponse.json(taskView(task));
  }),
  http.post("*/api/v1/tasks/:id/reopening", ({ params }) => {
    const scenario = currentMockScenario();
    const refused = staffWrite(scenario);
    if (refused !== undefined) return refused;
    const task = findTask(String(params.id));
    if (task === undefined) return apiError("NOT_FOUND", "Task not found", 404);
    if (task.state !== "DONE") return apiError("TASK_NOT_DONE", "Task not done", 422);
    task.state = "PENDING";
    task.doneAt = null;
    task.doneBy = null;
    task.version += 1;
    return HttpResponse.json(taskView(task));
  }),
  http.put("*/api/v1/dogs/:id/observations", async ({ params, request }) => {
    const scenario = currentMockScenario();
    const refused = staffWrite(scenario);
    if (refused !== undefined) return refused;
    const key = request.headers.get("Idempotency-Key");
    if (key === null || key === "") return validationError("Idempotency-Key", "REQUIRED");
    const dogId = String(params.id);
    const body = (await request.json().catch(() => null)) as ObservationsRequest | null;
    return idempotent(key, JSON.stringify({ body, dogId }), () => {
      if (followupDogStatus(dogId) === undefined) return failure(404, "NOT_FOUND");
      if (body === null || typeof body.version !== "number" || typeof body.text !== "string") {
        return failure(400, "VALIDATION_ERROR", {
          fieldErrors: [{ code: "REQUIRED", field: "version" }],
        });
      }
      if (body.text.length > 2000) {
        return failure(400, "VALIDATION_ERROR", {
          fieldErrors: [{ code: "TOO_LONG", field: "text" }],
        });
      }
      const now = new Date().toISOString().replace(/\.\d{3}Z$/u, "Z");
      if (scenario.followup === "stale") applyOtherObservationsSave(dogId, now);
      const stored = storedObservations(dogId);
      if (body.version !== stored.version) return failure(409, "STALE_VERSION");
      // The same text changes nothing (R-10-12).
      if (body.text !== (stored.text ?? "")) {
        stored.text = body.text === "" ? null : body.text;
        stored.updatedAt = now;
        stored.updatedByName = callerName(scenario);
        stored.version += 1;
      }
      return {
        body: {
          text: stored.text ?? "",
          updatedAt: stored.updatedAt ?? now,
          updatedByName: stored.updatedByName ?? "",
          version: stored.version,
        },
        status: 200,
      };
    });
  }),
  // The S10 purposes of the signed upload (R-10-11); the other purposes fall through to the
  // census and activity handler of `handlers.ts`.
  http.post("*/api/v1/attachments/upload-url", async ({ request }) => {
    const body = (await request.clone().json()) as UploadRequest;
    if (body.purpose !== "TASK" && body.purpose !== "DOG_OBSERVATIONS") return undefined;
    const scenario = currentMockScenario();
    const refused = staffWrite(scenario);
    if (refused !== undefined) return refused;
    if (!allowedType(body.mimeType)) {
      return apiError("FILE_TYPE_NOT_ALLOWED", "File type not allowed", 400);
    }
    if (body.sizeBytes > MAX_SIZE_MB * 1024 * 1024) {
      return apiError("FILE_TOO_LARGE", "File too large", 400, { maxSizeMb: MAX_SIZE_MB });
    }
    const fileKey = `${body.purpose.toLocaleLowerCase()}/mock/${nextFollowupId("upload")}`;
    followupState.uploads.set(fileKey, {
      fileName: body.fileName,
      mimeType: body.mimeType,
      purpose: body.purpose,
      sizeBytes: body.sizeBytes,
    });
    const origin = new URL(request.url).origin;
    return HttpResponse.json(
      {
        expiresAt: new Date(Date.now() + 5 * 60_000).toISOString(),
        fileKey,
        headers: { "Content-Type": body.mimeType, "If-None-Match": "*" },
        uploadUrl: `${origin}${FOLLOWUP_UPLOAD_PATH}${encodeURIComponent(fileKey)}`,
      },
      { status: 201 },
    );
  }),
  // The storage of those uploads, on the page's origin: it checks the signed headers came back
  // unchanged and that no bearer travelled with the file (CONVENCIONS_API §5).
  http.put(`*${FOLLOWUP_UPLOAD_PATH}:fileKey`, ({ params, request }) => {
    const upload = followupState.uploads.get(decodeURIComponent(String(params.fileKey)));
    if (upload === undefined) return new HttpResponse(null, { status: 404 });
    if (request.headers.has("Authorization")) return new HttpResponse(null, { status: 400 });
    if (
      request.headers.get("Content-Type") !== upload.mimeType ||
      request.headers.get("If-None-Match") !== "*"
    ) {
      return new HttpResponse(null, { status: 403 });
    }
    return new HttpResponse(null, { status: 200 });
  }),
  http.get("*/api/v1/attachments", ({ request }) => {
    const scenario = currentMockScenario();
    const off = tasksOff(scenario);
    if (off !== undefined) return off;
    const url = new URL(request.url);
    const entityType = url.searchParams.get("entityType") as AttachmentEntity | null;
    const entityId = url.searchParams.get("entityId");
    if (
      entityType === null ||
      !["DOG_OBSERVATIONS", "INSTRUCTOR_NOTE", "TASK"].includes(entityType) ||
      entityId === null
    ) {
      return validationError("entityType");
    }
    if (!staff(scenario)) {
      // R-10-11: the observations are never a member's; a task or a note of their own dogs only.
      const dogId = entityType === "TASK" ? findTask(entityId)?.dogId : entityId;
      if (
        entityType === "DOG_OBSERVATIONS" ||
        dogId === undefined ||
        !MEMBER_OWN_DOGS.includes(dogId)
      ) {
        return apiError("NOT_FOUND", "Not found", 404);
      }
    }
    if (!attachmentEntityExists(entityType, entityId))
      return apiError("NOT_FOUND", "Not found", 404);
    return HttpResponse.json({ items: liveAttachments(entityType, entityId).map(attachmentView) });
  }),
  http.post("*/api/v1/attachments", async ({ request }) => {
    const scenario = currentMockScenario();
    const off = tasksOff(scenario);
    if (off !== undefined) return off;
    const body = (await request.json().catch(() => null)) as AttachmentRequest | null;
    if (body === null) return validationError("fileKey", "REQUIRED");
    if (body.entityType !== "INSTRUCTOR_NOTE") {
      const refused = staffOnly(scenario);
      if (refused !== undefined) return refused;
    } else if (staff(scenario) && !member(scenario)) {
      return apiError("FORBIDDEN", "Forbidden", 403);
    }
    const register = () => {
      if (body.name.length > 80) {
        return failure(400, "VALIDATION_ERROR", {
          fieldErrors: [{ code: "TOO_LONG", field: "name" }],
        });
      }
      if (!attachmentEntityExists(body.entityType, body.entityId)) return failure(404, "NOT_FOUND");
      const upload = followupState.uploads.get(body.fileKey);
      if (upload?.purpose !== body.entityType) return failure(422, "ATTACHMENT_ENTITY_MISMATCH");
      // The same fileKey again → the same attachment (R-10-11).
      const known = followupState.attachments.find(
        (item) => item.fileKey === body.fileKey && item.removedAt === null,
      );
      if (known !== undefined) return { body: attachmentView(known), status: 201 };
      if (liveAttachments(body.entityType, body.entityId).length >= FOLLOWUP_MAX_ATTACHMENTS) {
        return failure(422, "ATTACHMENT_LIMIT_REACHED", { max: FOLLOWUP_MAX_ATTACHMENTS });
      }
      const stored = {
        entityId: body.entityId,
        entityType: body.entityType,
        fileKey: body.fileKey,
        id: nextFollowupId("attachment"),
        mimeType: upload.mimeType,
        name: body.name === "" ? upload.fileName.slice(0, 80) : body.name,
        removedAt: null,
        sizeBytes: upload.sizeBytes,
        uploadedAt: new Date().toISOString().replace(/\.\d{3}Z$/u, "Z"),
      };
      followupState.attachments.push(stored);
      return { body: attachmentView(stored), status: 201 };
    };
    const key = request.headers.get("Idempotency-Key");
    if (key === null || key === "") {
      const result = register();
      return HttpResponse.json(result.body as Record<string, unknown>, { status: result.status });
    }
    return idempotent(key, JSON.stringify(body), register);
  }),
  http.delete("*/api/v1/attachments/:id", ({ params, request }) => {
    const scenario = currentMockScenario();
    const off = tasksOff(scenario);
    if (off !== undefined) return off;
    const key = request.headers.get("Idempotency-Key");
    if (key === null || key === "") return validationError("Idempotency-Key", "REQUIRED");
    const id = String(params.id);
    const attachment = followupState.attachments.find((item) => item.id === id);
    if (attachment !== undefined && attachment.entityType !== "INSTRUCTOR_NOTE") {
      const refused = staffOnly(scenario);
      if (refused !== undefined) return refused;
    }
    return idempotent(key, `detach:${id}`, () => {
      const live = followupState.attachments.find(
        (item) => item.id === id && item.removedAt === null,
      );
      if (live === undefined) return failure(404, "NOT_FOUND");
      live.removedAt = new Date().toISOString();
      return { body: null, status: 204 };
    });
  }),
  // ── D14 (R-10-13) ──
  http.get("*/api/v1/followup", ({ request }) => {
    const scenario = currentMockScenario();
    const refused = staffWrite(scenario);
    if (refused !== undefined) return refused;
    const url = new URL(request.url);
    const page = Number(url.searchParams.get("page") ?? "0");
    const size = Number(url.searchParams.get("size") ?? "50");
    // The api (E6-T02, snapshot db7c6c6) pages this list by 20 or 50 rows at most (S10 §3).
    if (!Number.isInteger(page) || page < 0 || !INBOX_PAGE_SIZES.includes(size)) {
      return apiError("INVALID_FILTER", "Invalid follow-up page", 400);
    }
    const sort = url.searchParams.getAll("sort");
    const [sortField, direction = "desc"] = (sort[0] ?? "activityAt,desc").split(",");
    if (sort.length > 1 || sortField !== "activityAt" || !["asc", "desc"].includes(direction)) {
      return apiError("INVALID_FILTER", "Invalid follow-up sort", 400);
    }
    const filters = url.searchParams.getAll("filter").map((raw) => {
      const [field = "", op = "", ...rest] = raw.split(":");
      return { field, op, value: rest.join(":") };
    });
    if (
      filters.some(
        (filter) =>
          !INBOX_FILTERABLE.includes(filter.field) ||
          !INBOX_OPERATORS.includes(filter.op) ||
          filter.value === "",
      )
    ) {
      return apiError("INVALID_FILTER", "Invalid follow-up filter", 400);
    }
    const project = fieldsProjection<FollowupItem>(url, INBOX_FIELDS, ["id"]);
    if (project === undefined) return apiError("INVALID_FILTER", "Invalid follow-up fields", 400);
    const rows = inboxRows({
      accountId: scenario.me.account.id,
      filters,
      levelsEnabled: levelsEnabled(),
      order: direction === "asc" ? "asc" : "desc",
      q: url.searchParams.get("q") ?? "",
      variant: scenario.inbox,
    });
    const items = rows.slice(page * size, (page + 1) * size);
    return HttpResponse.json({
      appliedFilters: filters.map((filter) => ({
        field: filter.field,
        op: filter.op,
        value: filter.field === "unread" ? filter.value === "true" : filter.value,
      })),
      items: project === null ? items : items.map(project),
      page,
      size,
      totalItems: rows.length,
      totalPages: Math.ceil(rows.length / size),
    });
  }),
  http.get("*/api/v1/followup/unread-count", () => {
    const scenario = currentMockScenario();
    const refused = staffWrite(scenario);
    if (refused !== undefined) return refused;
    return HttpResponse.json({ count: inboxUnreadCount(scenario.me.account.id, scenario.inbox) });
  }),
  http.post("*/api/v1/followup/:id/read", ({ params, request }) => {
    const scenario = currentMockScenario();
    const refused = staffWrite(scenario);
    if (refused !== undefined) return refused;
    const key = request.headers.get("Idempotency-Key");
    if (key === null || key === "") return validationError("Idempotency-Key", "REQUIRED");
    const id = String(params.id);
    return inboxIdempotent(key, `read:${id}`, () =>
      readInboxItem(scenario.me.account.id, id, scenario.inbox)
        ? { body: null, status: 204 }
        : failure(404, "NOT_FOUND"),
    );
  }),
  http.post("*/api/v1/followup/read-all", ({ request }) => {
    const scenario = currentMockScenario();
    const refused = staffWrite(scenario);
    if (refused !== undefined) return refused;
    const key = request.headers.get("Idempotency-Key");
    if (key === null || key === "") return validationError("Idempotency-Key", "REQUIRED");
    return inboxIdempotent(key, "read-all", () => {
      readAllInbox(scenario.me.account.id, Date.now());
      return { body: null, status: 204 };
    });
  }),
];

/** `x-fields`, `x-filterable` and the page sizes of `GET /followup` (S10 §6, api E6-T02). */
const INBOX_FIELDS = [
  "id",
  "kind",
  "taskId",
  "dogId",
  "dogName",
  "levelCode",
  "memberId",
  "memberName",
  "authorName",
  "authorRole",
  "authorGender",
  "textExcerpt",
  "createdAt",
  "completedAt",
  "activityAt",
  "unread",
] as const;
const INBOX_FILTERABLE: readonly string[] = [
  "kind",
  "memberId",
  "dogId",
  "authorAccountId",
  "unread",
];
const INBOX_OPERATORS: readonly string[] = ["eq", "ne", "in", "nin"];
const INBOX_PAGE_SIZES: readonly number[] = [20, 50];

/** The D14 writes' `Idempotency-Key` (CONVENCIONS_API §7), as `idempotent` does for the tasks. */
function inboxIdempotent(
  key: string,
  signature: string,
  answer: () => { body: unknown; status: number },
) {
  const replay = inboxState.idempotency.get(key);
  if (replay !== undefined) {
    if (replay.signature !== signature) {
      return apiError("IDEMPOTENCY_KEY_REUSED", "Idempotency key reused", 409, {
        reason: "DIFFERENT_REQUEST",
      });
    }
    return replay.status === 204
      ? new HttpResponse(null, { status: 204 })
      : HttpResponse.json(replay.body as Record<string, unknown>, { status: replay.status });
  }
  const result = answer();
  if (result.status < 300) inboxState.idempotency.set(key, { ...result, signature });
  return result.status === 204
    ? new HttpResponse(null, { status: 204 })
    : HttpResponse.json(result.body as Record<string, unknown>, { status: result.status });
}
