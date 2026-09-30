import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import openapiDocument from "../../openapi/openapi.json";
import { isApiError } from "../api-error";
import { createApiClient } from "../client";
import { putSignedFile } from "../uploads";

import { memberHistoryView } from "./fixtures/followup";
import {
  ATTENDANCE_MOCK_NOW,
  mockScenario,
  resetAttendanceMockState,
  resetFollowupMockState,
  type MockScenario,
} from "./handlers";
import { server } from "./server";

const openapiSchemaId = "https://agilityhub.local/followup-openapi.json";
const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);
ajv.addSchema(openapiDocument, openapiSchemaId);

function expectValid(name: string, value: unknown) {
  const validate = ajv.compile({ $ref: `${openapiSchemaId}#/components/schemas/${name}` });
  expect(validate(value), JSON.stringify(validate.errors, null, 2)).toBe(true);
}

const base = "https://core.example.test/api/v1";
let client = createApiClient({ baseUrl: base });

function use(scenario: MockScenario) {
  mockScenario(scenario);
  client = createApiClient({ baseUrl: base, getLocale: () => "ca" });
}

async function failure(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    if (isApiError(error)) {
      return { code: error.code, details: error.details, status: error.status };
    }
    throw error;
  }
  throw new Error("Expected an ApiError");
}

const history = (query: { dogId?: string; type?: "ACTIVITY" | "CLASS" | "TRAINING" } = {}) =>
  client.GET("/me/history", { params: { query } });
const tasks = (dogId = "dog-duna") => client.GET("/tasks", { params: { query: { dogId } } });
const create = (
  body: { attachmentIds?: string[]; dogId: string; text: string },
  key: string = crypto.randomUUID(),
) => client.POST("/tasks", { body, params: { header: { "Idempotency-Key": key } } });
const card = (id = "dog-duna") =>
  client.GET("/dogs/{id}/instructor-card", { params: { path: { id } } });
const saveObservations = (text: string, version: number, key: string = crypto.randomUUID()) =>
  client.PUT("/dogs/{id}/observations", {
    body: { text, version },
    params: { header: { "Idempotency-Key": key }, path: { id: "dog-duna" } },
  });
const signed = (
  purpose: "DOG_DOCUMENT" | "DOG_OBSERVATIONS" | "TASK",
  mimeType = "video/mp4",
  sizeBytes = 1_000,
) =>
  client.POST("/attachments/upload-url", {
    body: { fileName: "vídeo_salt.mp4", mimeType, purpose, sizeBytes },
  });

/** The signed flow of CONVENCIONS_API §5: upload url → PUT with the signed headers → fileKey. */
async function uploadedKey(purpose: "DOG_OBSERVATIONS" | "TASK", mimeType = "video/mp4") {
  const { data } = await signed(purpose, mimeType);
  if (data === undefined) throw new TypeError("No upload");
  await putSignedFile(data, new Blob(["x"], { type: mimeType }));
  return data.fileKey;
}

beforeAll(() => {
  server.listen({ onUnhandledRequest: "error" });
});
beforeEach(() => {
  vi.useFakeTimers({ now: new Date(ATTENDANCE_MOCK_NOW), toFake: ["Date"] });
  resetFollowupMockState();
  resetAttendanceMockState();
  use("member");
});
afterEach(() => {
  server.resetHandlers();
  vi.useRealTimers();
  resetFollowupMockState();
  resetAttendanceMockState();
  mockScenario("member");
});
afterAll(() => {
  server.close();
});

describe("E6-W02 step 7 · GET /me/history reproduces mockup 25 and its variants (R-10-14)", () => {
  it("the member reads the seven rows of mockup 25 with three dogs, «Tots» and the two months", async () => {
    const { data } = await history();
    expectValid("MemberHistory", data);
    expect(data?.showDog).toBe(true);
    expect(data?.monthsVisible).toBe(2);
    expect(data?.types).toEqual(["CLASS", "TRAINING", "ACTIVITY"]);
    expect(
      data?.dogs.map((dog) => `${dog.name}·${String(dog.own)}·${dog.ownerFirstName ?? ""}`),
    ).toEqual(["Duna·true·", "Rock·true·", "Toby·false·Joan Antoni"]);
    expect(
      data?.items.map(
        (item) => `${item.date} ${item.type} ${item.state} ${item.detail?.kind ?? "-"}`,
      ),
    ).toEqual([
      "2026-07-28 CLASS DONE -",
      "2026-07-24 TRAINING DONE -",
      "2026-07-21 CLASS CANCELLED_LATE BY_MEMBER",
      "2026-07-17 CLASS CANCELLED_BY_CLUB BY_CLUB",
      "2026-07-14 CLASS NO_SHOW NO_SHOW",
      "2026-07-12 ACTIVITY DONE -",
      "2026-07-08 CLASS CANCELLED BY_MEMBER_IN_TIME",
    ]);
    expect(data?.items[2]?.detail).toEqual({
      at: "2026-07-21T17:10:00Z",
      atLocal: "19:10",
      kind: "BY_MEMBER",
    });
    expect(data?.items[3]?.detail?.message).toBe("Pluja forta: pistes tancades");
  });

  it("filters by dog (activities with «Tots» only) and by type; a dog outside the member's is 404 DOG_NOT_ACCESSIBLE", async () => {
    const rock = (await history({ dogId: "dog-rock" })).data;
    expectValid("MemberHistory", rock);
    expect(rock?.items.map((item) => item.id)).toEqual(["tb4", "b7"]);
    const trainings = (await history({ type: "TRAINING" })).data;
    expect(trainings?.items.map((item) => item.id)).toEqual(["tb4"]);
    await expect(failure(history({ dogId: "dog-unknown" }))).resolves.toMatchObject({
      code: "DOG_NOT_ACCESSIBLE",
      status: 404,
    });
  });

  it("the single-dog member, the club without FREE_TRAINING and ACTIVITIES, every detail kind and the empty history", async () => {
    use("historySingleDog");
    const single = (await history()).data;
    expectValid("MemberHistory", single);
    expect(single?.showDog).toBe(false);
    expect(single?.dogs.map((dog) => dog.name)).toEqual(["Duna"]);
    use("historyNoModules");
    const classes = (await history()).data;
    expect(classes?.types).toEqual(["CLASS"]);
    expect(new Set(classes?.items.map((item) => item.type))).toEqual(new Set(["CLASS"]));
    // A type the club does not offer is read as asked: no rows, and `types` says what it offers.
    const trainingsOff = (await history({ type: "TRAINING" })).data;
    expect(trainingsOff?.types).toEqual(["CLASS"]);
    expect(trainingsOff?.items).toEqual([]);
    use("historyAllReasons");
    const all = (await history()).data;
    expectValid("MemberHistory", all);
    // §13-14: a cancelled future booking stays in the history, at the top by its date.
    expect(all?.items[0]).toMatchObject({ date: "2026-08-10", state: "CANCELLED" });
    expect(new Set(all?.items.map((item) => item.detail?.kind))).toEqual(
      new Set([
        "BY_CLUB",
        "BY_CLUB_ON_BEHALF",
        "BY_MEMBER",
        "BY_MEMBER_IN_TIME",
        "INSTRUCTOR_NOTICE",
        "INSTRUCTOR_NOTICE_IN_TIME",
        "NO_SHOW",
        "SYSTEM",
        undefined,
      ]),
    );
    use("historyEmpty");
    expect((await history()).data?.items).toEqual([]);
  });

  it("FAMILY_GROUP off leaves the member's own dogs only (S10 §9)", () => {
    const view = memberHistoryView({
      dogId: null,
      modules: ["TASKS"],
      type: null,
      variant: undefined,
    });
    expect(view?.dogs.map((dog) => dog.name)).toEqual(["Duna", "Rock"]);
    expect(view?.types).toEqual(["CLASS"]);
  });

  it("the impersonated session reads it as the member; an instructor gets 403", async () => {
    use("impersonated");
    expect((await history()).data?.items).toHaveLength(7);
    use("instructor");
    await expect(failure(history())).resolves.toMatchObject({ code: "FORBIDDEN", status: 403 });
  });
});

describe("E6-W02 step 7 · the tasks of 26 and D13 (R-10-10, §5), stateful", () => {
  beforeEach(() => {
    use("instructor");
  });

  it("GET /tasks lists mockup 26's three tasks, newest first, the video on the first", async () => {
    const { data } = await tasks();
    expectValid("TaskList", data);
    expect(
      data?.items.map((task) => `${task.id} ${task.state} ${task.createdBy.displayName}`),
    ).toEqual(["t1 PENDING Estel", "t2 PENDING Marc", "t3 DONE Estel"]);
    expect(data?.items[0]?.attachments.map((item) => `${item.name} ${item.mimeType}`)).toEqual([
      "vídeo_balancí.mp4 video/mp4",
    ]);
    expect(data?.items[2]?.doneBy).toEqual({
      accountId: "account-laura",
      displayName: "Laura",
      gender: "FEMALE",
      role: "MEMBER",
    });
    expect(data?.items[2]?.doneAt).toBe("2026-08-02T09:15:00Z");
  });

  it("tasksMany (round 2 #2): 52 tasks in pages of 50, the two oldest — one done, one pending — on the second page; the card counts all of them", async () => {
    use("tasksMany");
    const page = async (number: number) =>
      (
        await client.GET("/tasks", {
          params: { query: { dogId: "dog-duna", includeDone: true, page: number, size: 50 } },
        })
      ).data;
    const first = await page(0);
    const second = await page(1);
    expectValid("TaskList", first);
    expectValid("TaskList", second);
    expect(first?.items).toHaveLength(50);
    expect(first?.items.slice(0, 3).map((task) => task.id)).toEqual(["t1", "t2", "t3"]);
    expect(second?.items.map((task) => `${task.state} ${task.text}`)).toEqual([
      "DONE Repàs 48: dues sessions curtes de contactes",
      "PENDING Repàs 49: dues sessions curtes de contactes",
    ]);
    const all = [...(first?.items ?? []), ...(second?.items ?? [])];
    expect(new Set(all.map((task) => task.id)).size).toBe(52);
    expect((await card()).data?.tasks).toMatchObject({
      doneCount: all.filter((task) => task.state === "DONE").length,
      pendingCount: all.filter((task) => task.state === "PENDING").length,
    });
  });

  it("T-10-25 «＋ Afegir» with an uploaded video creates one task, even when the same key is sent twice; the card counts it", async () => {
    const fileKey = await uploadedKey("TASK");
    const key = crypto.randomUUID();
    const body = { attachmentIds: [fileKey], dogId: "dog-duna", text: "Salts amb calma" };
    const first = await create(body, key);
    const again = await create(body, key);
    expectValid("Task", first.data);
    expect(first.response.status).toBe(201);
    expect(again.data).toEqual(first.data);
    expect(first.data?.attachments.map((item) => item.name)).toEqual(["vídeo_salt.mp4"]);
    expect((await tasks()).data?.items.map((task) => task.text)).toContain("Salts amb calma");
    expect((await tasks()).data?.items).toHaveLength(4);
    expect((await card()).data?.tasks).toMatchObject({ doneCount: 1, pendingCount: 3 });
    await expect(failure(create({ ...body, text: "Una altra" }, key))).resolves.toMatchObject({
      code: "IDEMPOTENCY_KEY_REUSED",
      status: 409,
    });
  });

  it("the pencil, the ✕, the completion and the reopening, with their business errors at 422 (rule 0)", async () => {
    const patched = await client.PATCH("/tasks/{id}", {
      body: { text: "Repasseu la taula de contactes", version: 1 },
      params: { path: { id: "t2" } },
    });
    expectValid("Task", patched.data);
    expect(patched.data?.version).toBe(2);
    await expect(
      failure(
        client.PATCH("/tasks/{id}", {
          body: { text: "Una altra", version: 1 },
          params: { path: { id: "t2" } },
        }),
      ),
    ).resolves.toMatchObject({ code: "STALE_VERSION", status: 409 });
    const done = await client.POST("/tasks/{id}/completion", { params: { path: { id: "t1" } } });
    expect(done.data).toMatchObject({ doneBy: { displayName: "Estel" }, state: "DONE" });
    await expect(
      failure(client.POST("/tasks/{id}/completion", { params: { path: { id: "t1" } } })),
    ).resolves.toMatchObject({ code: "TASK_ALREADY_DONE", status: 422 });
    const reopened = await client.POST("/tasks/{id}/reopening", { params: { path: { id: "t3" } } });
    expect(reopened.data).toMatchObject({ doneAt: null, doneBy: null, state: "PENDING" });
    await expect(
      failure(client.POST("/tasks/{id}/reopening", { params: { path: { id: "t3" } } })),
    ).resolves.toMatchObject({ code: "TASK_NOT_DONE", status: 422 });
    const key = crypto.randomUUID();
    const remove = () =>
      client.DELETE("/tasks/{id}", {
        params: { header: { "Idempotency-Key": key }, path: { id: "t2" } },
      });
    expect((await remove()).response.status).toBe(204);
    expect((await remove()).response.status).toBe(204);
    expect((await tasks()).data?.items.map((task) => task.id)).toEqual(["t1", "t3"]);
  });

  it("DOG_NOT_ACTIVE, ATTACHMENT_ENTITY_MISMATCH and ATTACHMENT_LIMIT_REACHED are 422; a refused attachment leaves no task", async () => {
    await expect(
      failure(create({ dogId: "dog-lluna-baixa", text: "Salts" })),
    ).resolves.toMatchObject({ code: "DOG_NOT_ACTIVE", status: 422 });
    const observationsKey = await uploadedKey("DOG_OBSERVATIONS", "image/jpeg");
    await expect(
      failure(create({ attachmentIds: [observationsKey], dogId: "dog-duna", text: "Salts" })),
    ).resolves.toMatchObject({ code: "ATTACHMENT_ENTITY_MISMATCH", status: 422 });
    const eleven = await Promise.all(Array.from({ length: 11 }, () => uploadedKey("TASK")));
    await expect(
      failure(create({ attachmentIds: eleven, dogId: "dog-duna", text: "Salts" })),
    ).resolves.toMatchObject({
      code: "ATTACHMENT_LIMIT_REACHED",
      details: { max: 10 },
      status: 422,
    });
    expect((await tasks()).data?.items).toHaveLength(3);
  });

  it("a member cannot create (403), an impersonation token gets IMPERSONATION_DENIED, and TASKS off is 404 MODULE_DISABLED", async () => {
    use("member");
    await expect(failure(create({ dogId: "dog-duna", text: "Salts" }))).resolves.toMatchObject({
      code: "FORBIDDEN",
      status: 403,
    });
    // The member completes a task of their own dog (S10 §5).
    const done = await client.POST("/tasks/{id}/completion", { params: { path: { id: "t1" } } });
    expect(done.data?.state).toBe("DONE");
    use("impersonated");
    await expect(failure(create({ dogId: "dog-duna", text: "Salts" }))).resolves.toMatchObject({
      code: "IMPERSONATION_DENIED",
      status: 403,
    });
    use("instructorNoTasks");
    await expect(failure(tasks())).resolves.toMatchObject({ code: "MODULE_DISABLED", status: 404 });
  });
});

describe("E6-W02 step 7 · observations and attachments (R-10-11, R-10-12)", () => {
  beforeEach(() => {
    use("instructor");
  });

  it("[DESA] saves the observations with their version; the card shows them; the same key replays", async () => {
    const key = crypto.randomUUID();
    const saved = await saveObservations("Va molt bé.", 4, key);
    expectValid("Observations", saved.data);
    expect(saved.data).toMatchObject({ text: "Va molt bé.", updatedByName: "Estel", version: 5 });
    expect((await saveObservations("Va molt bé.", 4, key)).data).toEqual(saved.data);
    expect((await card()).data?.observations).toMatchObject({ text: "Va molt bé.", version: 5 });
    await expect(failure(saveObservations("Una altra", 4))).resolves.toMatchObject({
      code: "STALE_VERSION",
      status: 409,
    });
  });

  it("tasksStale: another instructor saved first, so the caller's version is stale (409)", async () => {
    use("tasksStale");
    await expect(failure(saveObservations("Les meves", 4))).resolves.toMatchObject({
      code: "STALE_VERSION",
      status: 409,
    });
    expect((await card()).data?.observations).toMatchObject({ updatedByName: "Núria", version: 5 });
  });

  it("the upload url validates type and size (FILE_TYPE_NOT_ALLOWED, FILE_TOO_LARGE{maxSizeMb}); the storage wants the signed headers and no bearer", async () => {
    const ok = await signed("TASK", "video/quicktime", 20 * 1024 * 1024);
    expect(ok.response.status).toBe(201);
    expect(ok.data?.uploadUrl).toMatch(/^https:\/\/core\.example\.test\/mock-uploads\//u);
    await expect(failure(signed("TASK", "application/x-msdownload"))).resolves.toMatchObject({
      code: "FILE_TYPE_NOT_ALLOWED",
      status: 400,
    });
    await expect(failure(signed("TASK", "video/mp4", 30 * 1024 * 1024))).resolves.toMatchObject({
      code: "FILE_TOO_LARGE",
      details: { maxSizeMb: 25 },
      status: 400,
    });
    const target = ok.data;
    if (target === undefined) throw new TypeError("No upload");
    const withBearer = await fetch(target.uploadUrl, {
      body: "x",
      headers: { ...target.headers, Authorization: "Bearer leaked" },
      method: "PUT",
    });
    expect(withBearer.status).toBe(400);
    const withoutHeaders = await fetch(target.uploadUrl, { body: "x", method: "PUT" });
    expect(withoutHeaders.status).toBe(403);
    use("member");
    await expect(failure(signed("TASK"))).resolves.toMatchObject({
      code: "FORBIDDEN",
      status: 403,
    });
  });

  it("POST /attachments registers an observation file, GET lists it with a signed url, DELETE retires it", async () => {
    const fileKey = await uploadedKey("DOG_OBSERVATIONS", "image/jpeg");
    const added = await client.POST("/attachments", {
      body: { entityId: "dog-duna", entityType: "DOG_OBSERVATIONS", fileKey, name: "espatlla.jpg" },
    });
    expectValid("Attachment", added.data);
    const listed = await client.GET("/attachments", {
      params: { query: { entityId: "dog-duna", entityType: "DOG_OBSERVATIONS" } },
    });
    expectValid("AttachmentList", listed.data);
    expect(listed.data?.items.map((item) => item.name)).toEqual(["espatlla.jpg"]);
    expect((await card()).data?.observations?.attachments.map((item) => item.name)).toEqual([
      "espatlla.jpg",
    ]);
    const id = added.data?.id ?? "";
    const key = crypto.randomUUID();
    const detach = () =>
      client.DELETE("/attachments/{id}", {
        params: { header: { "Idempotency-Key": key }, path: { id } },
      });
    expect((await detach()).response.status).toBe(204);
    expect((await detach()).response.status).toBe(204);
    expect((await card()).data?.observations?.attachments).toEqual([]);
    use("member");
    await expect(
      failure(
        client.GET("/attachments", {
          params: { query: { entityId: "dog-duna", entityType: "DOG_OBSERVATIONS" } },
        }),
      ),
    ).resolves.toMatchObject({ code: "NOT_FOUND", status: 404 });
  });

  it("R-10-12 privacy: no /me/* answer of the member carries the observations", async () => {
    use("member");
    const answers = await Promise.all([
      client.GET("/me/history"),
      client.GET("/me/dogs"),
      client.GET("/me/home"),
    ]);
    for (const answer of answers) {
      const text = JSON.stringify(answer.data);
      expect(text).not.toContain("observations");
      expect(text).not.toContain("Va molt bé amb reforç de pilota");
    }
  });
});
