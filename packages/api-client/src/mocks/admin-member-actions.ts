import { http, HttpResponse } from "msw";

import type { components } from "../generated/schema";

import { censusMembers, censusRecordState } from "./fixtures/census";
import { apiError } from "./planning-handlers";
import { callerClubOwnsTheWorld, currentMockScenario } from "./scenarios";

function refusal(request: Request, memberId: string) {
  const { me } = currentMockScenario();
  if (
    me.impersonation !== undefined ||
    request.headers.get("Authorization") === "Bearer mock-impersonation-token"
  ) {
    return apiError("IMPERSONATION_DENIED", "Impersonation tokens cannot use this route", 403);
  }
  if (me.membership?.roles.includes("ADMIN") !== true)
    return apiError("FORBIDDEN", "Forbidden", 403);
  if (!callerClubOwnsTheWorld() || memberId !== censusRecordState.memberOverview.member.id) {
    return apiError("NOT_FOUND", "Member not found", 404);
  }
  if (censusRecordState.memberOverview.member.erasedAt != null)
    return apiError("MEMBER_ERASED", "Member erased", 409);
  return undefined;
}

const responses = new WeakMap<object, Map<string, unknown>>();
function cache() {
  let value = responses.get(censusRecordState.memberOverview);
  if (value === undefined) {
    value = new Map();
    responses.set(censusRecordState.memberOverview, value);
  }
  return value;
}
function preview(targetId: string): components["schemas"]["MemberMergePreview"] {
  const member = censusRecordState.memberOverview.member;
  const target = censusMembers.find((item) => item.id === targetId);
  return {
    source: {
      id: member.id,
      fullName: member.fullName,
      version: member.version,
      memberNumber: member.memberNumber ?? 0,
    },
    target: {
      id: targetId,
      fullName: target?.fullName ?? targetId,
      version: target?.version ?? 0,
      memberNumber: target?.memberNumber ?? 0,
    },
    counts: {
      dogs: censusRecordState.memberOverview.dogs.length,
      classBookings: 0,
      waitlist: 0,
      seatHolds: 0,
      trainingBookings: 0,
      packs: 0,
      accessAccounts: 0,
      activityRegistrations: 0,
    },
    blockers: member.id === targetId ? ["SAME_MEMBER"] : [],
  };
}
export const adminMemberActionHandlers = [
  http.post("*/api/v1/members/:id/dogs", async ({ request, params }) => {
    const denied = refusal(request, String(params.id));
    if (denied !== undefined) return denied;
    const key = request.headers.get("Idempotency-Key") ?? "";
    const prior = cache().get(key);
    if (prior !== undefined) return HttpResponse.json(prior, { status: 201 });
    const input = (await request.json()) as components["schemas"]["AdminDogCreate"];
    const dog: components["schemas"]["Dog"] = {
      id: crypto.randomUUID(),
      memberId: String(params.id),
      ...input,
      chip: input.chip ?? "",
      status: "ACTIVE",
      registeredAt: new Date().toISOString(),
      version: 0,
      licenses: [],
      freeTrainingOverride: input.freeTrainingAllowed ?? false,
    };
    censusRecordState.memberOverview.dogs.push({
      id: dog.id,
      name: dog.name,
      breed: dog.breed,
      freeTrainingAllowed: input.freeTrainingAllowed ?? false,
      pendingDocuments: [],
    });
    cache().set(key, dog);
    return HttpResponse.json(dog, { status: 201 });
  }),
  http.get("*/api/v1/members/:id/merge-preview", ({ request, params }) => {
    const denied = refusal(request, String(params.id));
    return (
      denied ??
      HttpResponse.json(preview(new URL(request.url).searchParams.get("targetMemberId") ?? ""))
    );
  }),
  http.post("*/api/v1/members/:id/merge", async ({ request, params }) => {
    const denied = refusal(request, String(params.id));
    if (denied !== undefined) return denied;
    const input = (await request.json()) as components["schemas"]["MemberMergeRequest"];
    const result = preview(input.targetMemberId);
    censusRecordState.memberOverview.member = {
      ...censusRecordState.memberOverview.member,
      mergedIntoMemberId: input.targetMemberId,
      mergedAt: new Date().toISOString(),
      status: "LEFT",
      version: censusRecordState.memberOverview.member.version + 1,
    };
    return HttpResponse.json(result);
  }),
];
