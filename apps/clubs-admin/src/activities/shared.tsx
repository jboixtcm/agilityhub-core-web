import {
  apiFieldErrors,
  isApiError,
  type ApiClient,
  type components,
} from "@agilityhub/api-client";
import type { UniversalFilter, UniversalListSavedView, UniversalListState } from "@agilityhub/ui";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
type SavedView = components["schemas"]["SavedView"];

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

/**
 * One `Idempotency-Key` per payload (CONVENCIONS_API §7): a retry of the same body reuses its
 * key, any other body gets a new one. `reset()` starts a new flow (a dialog opened again).
 */
export function usePayloadKeys() {
  const keys = useRef(new Map<string, string>());
  const keyFor = useCallback((payload: unknown) => {
    const fingerprint = JSON.stringify(payload);
    const known = keys.current.get(fingerprint);
    if (known !== undefined) return known;
    const key = crypto.randomUUID();
    keys.current.set(fingerprint, key);
    return key;
  }, []);
  const reset = useCallback(() => {
    keys.current.clear();
  }, []);
  return useMemo(() => ({ keyFor, reset }), [keyFor, reset]);
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

/** Message of an api error by its `code` (never its `message`), with the D7 fallback. */
export function useActivityErrorMessage() {
  const { t } = useTranslation(["admin-activities", "errors"]);
  return useCallback(
    (error: unknown) =>
      isApiError(error)
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

/** Signed upload (S03 pattern): upload URL → `PUT` with the returned headers → the `fileKey`. */
export async function uploadFile(
  client: ApiClient,
  file: File,
  purpose: "ACTIVITY_DOCUMENT" | "ACTIVITY_IMAGE",
): Promise<string> {
  const signed = await client.POST("/attachments/upload-url", {
    body: { fileName: file.name, mimeType: file.type, purpose, sizeBytes: file.size },
  });
  if (signed.data === undefined) throw new TypeError("Upload response did not contain data");
  const response = await fetch(signed.data.uploadUrl, {
    body: file,
    headers: signed.data.headers,
    method: "PUT",
  });
  if (!response.ok) throw new TypeError("File upload failed");
  return signed.data.fileKey;
}

function filterValue(value: unknown): string {
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean"
    ? String(value)
    : "";
}

function toSavedView(view: SavedView): UniversalListSavedView {
  return {
    columns: [...view.columns],
    filters: view.filters.map((filter) => ({
      field: filter.field,
      operator: filter.op,
      value: filterValue(filter.value),
    })),
    id: view.id,
    name: view.name,
    shared: view.shared,
    sort: [...view.sort],
  };
}

/** Saved views of a universal list (`/saved-views?listKey=`), as D5. */
export function useSavedViews(
  client: ApiClient,
  listKey: string,
  onDefault: (view: UniversalListSavedView) => void,
) {
  const [views, setViews] = useState<SavedView[]>([]);
  useEffect(() => {
    let current = true;
    void client.GET("/saved-views", { params: { query: { listKey: listKey } } }).then(
      (result) => {
        if (!current || result.data === undefined) return;
        setViews(result.data);
        const defaultId = localStorage.getItem(`agilityhub.list.defaultView.${listKey}`);
        const view = result.data.find((item) => item.id === defaultId);
        if (view !== undefined && new URLSearchParams(window.location.search).size === 0) {
          onDefault(toSavedView(view));
        }
      },
      () => undefined,
    );
    return () => {
      current = false;
    };
  }, [client, listKey, onDefault]);

  const filters = (state: { filters: UniversalFilter[] }) =>
    state.filters.map((filter) => ({
      field: filter.field,
      op: filter.operator,
      value: filter.value,
    }));

  return {
    create: async (name: string, shared: boolean, state: UniversalListState) => {
      const result = await client.POST("/saved-views", {
        body: {
          columns: state.columns,
          filters: filters(state),
          listKey: listKey,
          name,
          shared,
          sort: state.sort,
        },
      });
      if (result.data === undefined)
        throw new TypeError("Saved view response did not contain data");
      const created = result.data;
      setViews((current) => [...current, created]);
      return toSavedView(created);
    },
    remove: async (id: string) => {
      await client.DELETE("/saved-views/{id}", { params: { path: { id } } });
      setViews((current) => current.filter((view) => view.id !== id));
    },
    rename: async (view: UniversalListSavedView, name: string) => {
      const source = views.find((item) => item.id === view.id);
      if (source === undefined) throw new TypeError("Saved view version is unavailable");
      const result = await client.PUT("/saved-views/{id}", {
        body: {
          columns: view.columns,
          filters: filters(view),
          listKey: listKey,
          name,
          shared: view.shared,
          sort: view.sort,
          version: source.version,
        },
        params: { path: { id: view.id } },
      });
      if (result.data === undefined)
        throw new TypeError("Saved view response did not contain data");
      const updated = result.data;
      setViews((current) => current.map((item) => (item.id === view.id ? updated : item)));
      return toSavedView(updated);
    },
    views: views.map(toSavedView),
  };
}
