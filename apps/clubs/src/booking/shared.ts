import { type ApiClient, type components, isApiError } from "@agilityhub/api-client";
import { useCallback, useEffect, useState } from "react";
import type { useTranslation } from "react-i18next";

import type { LoadState } from "../activities/shared";

export type Translate = ReturnType<typeof useTranslation>["t"];

export type MeHome = components["schemas"]["MeHome"];
export type HomeDog = components["schemas"]["HomeDog"];
export type ReservationRowData = components["schemas"]["ReservationRow"];
export type BookableClasses = components["schemas"]["BookableClasses"];
export type BookableClass = components["schemas"]["BookableClass"];
export type BookableDog = components["schemas"]["BookableDog"];
export type SeatHoldResponse = components["schemas"]["SeatHoldResponse"];
export type Booking = components["schemas"]["Booking"];
export type WaitlistEntry = components["schemas"]["WaitlistEntry"];
export type BookingLimitReachedDetails = components["schemas"]["BookingLimitReachedDetails"];

/**
 * In-app navigation of the S08 flow: the history entry changes without a reload (the App listens
 * to `popstate`), so the seat hold travels in `history.state` and the back gesture leaves the
 * confirmation like any other page.
 */
export function navigateInApp(path: string, state: unknown = null, replace = false): void {
  if (replace) window.history.replaceState(state, "", path);
  else window.history.pushState(state, "", path);
  window.dispatchEvent(new PopStateEvent("popstate", { state }));
}

/**
 * A notice one page leaves for the next (`history.state.notice`): an api error `code` (shown
 * through `errors:`) or a `booking:` key of this flow.
 */
export interface PageNotice {
  code?: string;
  messageKey?: "booking:waitlist.joined" | "booking:waitlist.left";
  tone: "danger" | "success";
}

export function noticeText(t: Translate, notice: PageNotice): string {
  if (notice.messageKey === "booking:waitlist.left") return t("booking:waitlist.left");
  if (notice.messageKey === "booking:waitlist.joined") return t("booking:waitlist.joined");
  return t(`errors:${notice.code ?? "INTERNAL_ERROR"}`, {
    defaultValue: t("errors:INTERNAL_ERROR"),
  });
}

export function pageNotice(): PageNotice | undefined {
  const state: unknown = window.history.state;
  if (typeof state !== "object" || state === null || !("notice" in state)) return undefined;
  const notice = (state as { notice?: unknown }).notice;
  return typeof notice === "object" && notice !== null ? (notice as PageNotice) : undefined;
}

/** The message of a failed request, by its `code` (never the api `message` as copy). */
export function errorText(t: Translate, cause: unknown): string {
  const fallback = t("errors:INTERNAL_ERROR");
  return isApiError(cause) ? t(`errors:${cause.code}`, { defaultValue: fallback }) : fallback;
}

/**
 * A request's state; `load` changes with its inputs (a dog, an id), and an answer that arrives
 * after they changed is dropped. `refetch(true)` keeps the rows on screen while it reloads.
 */
export function useLoader<Data>(load: () => Promise<Data>) {
  const [state, setState] = useState<LoadState<Data>>({ status: "loading" });
  const [reload, setReload] = useState(0);
  useEffect(() => {
    let current = true;
    load().then(
      (data) => {
        if (current) setState({ data, status: "ready" });
      },
      (error: unknown) => {
        if (current) setState({ error, status: "error" });
      },
    );
    return () => {
      current = false;
    };
  }, [load, reload]);
  const refetch = useCallback((quiet = false) => {
    if (!quiet) setState({ status: "loading" });
    setReload((value) => value + 1);
  }, []);
  return { ...state, refetch };
}

function required<Data>(data: Data | undefined): Data {
  if (data === undefined) throw new TypeError("The response did not contain data");
  return data;
}

/** `GET /me/home?dogId=` (03): no `dogId` = «Tots». */
export function useMeHome(client: ApiClient, dogId: string | null) {
  const load = useCallback(
    async () =>
      required(
        (
          await client.GET("/me/home", {
            params: { query: dogId === null ? {} : { dogId } },
          })
        ).data,
      ),
    [client, dogId],
  );
  return useLoader(load);
}

/** `GET /me/bookable-classes?dogId=` (04): no `dogId` = the api's proposed dog. */
export function useBookableClasses(client: ApiClient, dogId: string | null) {
  const load = useCallback(
    async () =>
      required(
        (
          await client.GET("/me/bookable-classes", {
            params: { query: dogId === null ? {} : { dogId } },
          })
        ).data,
      ),
    [client, dogId],
  );
  return useLoader(load);
}

export function useBooking(client: ApiClient, id: string) {
  const load = useCallback(
    async () => required((await client.GET("/bookings/{id}", { params: { path: { id } } })).data),
    [client, id],
  );
  return useLoader(load);
}

export function useWaitlistEntry(client: ApiClient, id: string) {
  const load = useCallback(
    async () =>
      required((await client.GET("/waitlist-entries/{id}", { params: { path: { id } } })).data),
    [client, id],
  );
  return useLoader(load);
}

/** The club-local date part `YYYY-MM-DD` and time `HH:mm` of a `YYYY-MM-DDTHH:mm`. */
export function localParts(local: string): { date: string; time: string } {
  return { date: local.slice(0, 10), time: local.slice(11, 16) };
}
