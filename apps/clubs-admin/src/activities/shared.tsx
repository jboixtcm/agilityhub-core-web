import {
  apiFieldErrors,
  isApiError,
  isInProgress,
  type ApiClient,
  type components,
  uploadSigned,
} from "@agilityhub/api-client";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";

import { holidayDates } from "../planning/calendar-shared";

export type Activity = components["schemas"]["Activity"];
export type ActivityListItem = components["schemas"]["ActivityListItem"];
export type ActivityPatch = components["schemas"]["ActivityPatchRequest"];
export type ActivityRegistrationListItem = components["schemas"]["ActivityRegistrationListItem"];
export type ActivityState = Activity["state"];
export type ActivityType = Activity["type"];
export type RingConflicts = components["schemas"]["RingConflicts"];
export type RingConflict = components["schemas"]["ActivityRingConflict"];
export type TrainingBookingConflict = components["schemas"]["ActivityTrainingBooking"];
export type CancellationPreview = components["schemas"]["ActivityCancellationPreview"];
export type Ring = components["schemas"]["Ring"];
export type Level = components["schemas"]["Level"];
export { useSavedViews } from "@agilityhub/club-staff/saved-views";

export const ACTIVITY_TYPES: readonly ActivityType[] = [
  "SEMINAR",
  "SOCIAL_LEAGUE",
  "COMPETITION",
  "DEMONSTRATION",
  "COURSE",
  "OTHER",
];

/** Options of `POST …/publication` and of a resynchronising `PATCH` (R-07-05). */
export interface ConflictOptions {
  adminText?: string;
  cancelBookings?: boolean;
  cancelClasses?: boolean;
}

export function errorCode(error: unknown): string | undefined {
  return isApiError(error) ? error.code : undefined;
}

export function errorDetails(error: unknown): Record<string, unknown> {
  return isApiError(error) && typeof error.details === "object" && error.details !== null
    ? (error.details as Record<string, unknown>)
    : {};
}

/**
 * The api's field paths of a 400/409/422 (e.g. `registrationTo`): `details.fieldErrors[].field`,
 * or the single `details.field` (CONVENCIONS_API §5).
 */
export function errorFields(error: unknown): string[] {
  return apiFieldErrors(error).map((entry) => entry.field);
}

/**
 * Message of an api error by its `code` (never its `message`), with the D7 fallback; a write still
 * in progress (the publication and the cancellation keep their key) reads the shared
 * `common:inProgress` (CONVENCIONS_API §7, E80).
 */
export function useActivityErrorMessage() {
  const { t } = useTranslation(["admin-activities", "errors", "common"]);
  return useCallback(
    (error: unknown) =>
      isInProgress(error)
        ? t("common:inProgress")
        : isApiError(error)
          ? t(`errors:${error.code}`, { defaultValue: t("admin-activities:common.error") })
          : t("admin-activities:common.error"),
    [t],
  );
}

export function sentenceCase(value: string): string {
  return `${value.charAt(0).toLocaleUpperCase()}${value.slice(1)}`;
}

/** «6/08»: the day without a leading zero and the two-digit month of a `YYYY-MM-DD` date. */
export function dayMonthParts(date: string): { day: string; month: string } {
  return { day: String(Number(date.slice(8, 10))), month: date.slice(5, 7) };
}

/** The public URL without its scheme, as the mockup prints it. */
export function displayUrl(url: string | null | undefined): string {
  return (url ?? "").replace(/^https?:\/\//u, "");
}

export interface ActivitySettings {
  holidays: string[];
  /** `null`: the reader cannot read `/parameters` (INSTRUCTOR, 403 — MATRIU_PERMISOS). */
  levelsEnabled: boolean | null;
  maxSizeMb: number;
  slotMinutes: number;
}

const PARAMETER_DENIED = Symbol("parameter denied");

async function parameterValue(client: ApiClient, key: string): Promise<unknown> {
  try {
    return (await client.GET("/parameters/{key}", { params: { path: { key } } })).data?.value;
  } catch (error) {
    return isApiError(error) && error.status === 403 ? PARAMETER_DENIED : undefined;
  }
}

/** `levels.enabled`, `classes.slotMinutes`, `files.maxSizeMb` (catalog default 25) and holidays. */
export async function loadActivitySettings(client: ApiClient): Promise<ActivitySettings> {
  const [levelsEnabled, slotMinutes, maxSizeMb, holidays] = await Promise.all([
    parameterValue(client, "levels.enabled"),
    parameterValue(client, "classes.slotMinutes"),
    parameterValue(client, "files.maxSizeMb"),
    client.GET("/club/holidays").then(
      (result) => holidayDates(result.data?.value),
      () => [],
    ),
  ]);
  const positive = (value: unknown, fallback: number) =>
    typeof value === "number" && value > 0 ? value : fallback;
  return {
    holidays,
    levelsEnabled: levelsEnabled === PARAMETER_DENIED ? null : levelsEnabled !== false,
    maxSizeMb: positive(maxSizeMb, 25),
    slotMinutes: positive(slotMinutes, 10),
  };
}

/** Signed upload (CONVENCIONS_API §5) through the shared helper → the `fileKey`. */
export function uploadFile(
  client: ApiClient,
  file: File,
  purpose: "ACTIVITY_DOCUMENT" | "ACTIVITY_IMAGE",
): Promise<string> {
  return uploadSigned(client, file, purpose);
}
