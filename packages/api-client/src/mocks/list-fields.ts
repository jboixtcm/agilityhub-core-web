/**
 * A list's `fields` as the core applies it (CONVENCIONS_API §4, api E5-T20 and E5-T22): a key outside
 * the operation's `x-fields` is `400 INVALID_FILTER`, and every key that was not asked for is omitted
 * from each item (never `null` nor `false` in its place), except the row id the core always sends
 * (`always`). `null` = no `fields`: whole items.
 */
export function fieldsProjection<Item extends object>(
  url: URL,
  itemKeys: readonly string[],
  always: readonly string[],
): ((item: Item) => Item) | null | undefined {
  const raw = url.searchParams.get("fields");
  if (raw === null || raw.trim() === "") return null;
  const keys = raw
    .split(",")
    .map((key) => key.trim())
    .filter((key) => key !== "");
  if (!keys.every((key) => itemKeys.includes(key))) return undefined;
  const kept = new Set([...always, ...keys]);
  return (item) =>
    Object.fromEntries(Object.entries(item).filter(([key]) => kept.has(key))) as Item;
}

/** `x-fields` of `GET /members` in the adopted snapshot (api E5-T22). */
export const MEMBER_LIST_FIELDS = [
  "id",
  "memberNumber",
  "fullName",
  "dogs",
  "plan",
  "displayStatus",
  "contact",
  "paymentMethod",
  "nextInvoiceDate",
  "familyGroup",
  "joinedAt",
  "leaveDate",
  "bookingBlocked",
  "imageRights",
  "roles",
  "city",
  "postalCode",
  "pendingDocuments",
  "freeTraining",
  "birthDate",
  "gender",
  "idDocument",
  "version",
  "signupPending",
  "pendingDogs",
  "warnings",
  "signup",
  "firstName",
  "lastName1",
  "lastName2",
  "contactEmails",
  "phones",
  "address",
  "status",
] as const;

/** `x-fields` of `GET /dogs` in the adopted snapshot (api E5-T22). */
export const DOG_LIST_FIELDS = [
  "id",
  "name",
  "breed",
  "level",
  "owner",
  "handler",
  "handlerName",
  "freeTraining",
  "licenses",
  "displayStatus",
  "sex",
  "age",
  "chip",
  "pendingDocuments",
  "levelAssignedAt",
  "pack",
  "registeredAt",
  "version",
] as const;

/** `x-fields` of `GET /audit-entries` and `GET /members/{id}/audit-entries` (api E5-T22). */
export const AUDIT_LIST_FIELDS = [
  "id",
  "clubId",
  "at",
  "actorAccountId",
  "actorName",
  "actorRole",
  "impersonatedMemberId",
  "impersonatedName",
  "origin",
  "entityType",
  "entityId",
  "entityLabel",
  "memberId",
  "action",
  "changes",
  "reason",
  "details",
] as const;

/** `x-fields` of `GET /weeks` in the adopted snapshot (api E5-T22). */
export const WEEK_LIST_FIELDS = [
  "id",
  "isoYear",
  "isoWeek",
  "startDate",
  "endDate",
  "state",
  "generatedAt",
  "validatedAt",
  "weekdayTemplateName",
  "saturdayTemplateName",
  "classCounts",
] as const;
