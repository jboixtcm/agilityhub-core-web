import { type ApiClient, type components, isApiError, isInProgress } from "@agilityhub/api-client";
import { useCallback, useEffect, useRef, useState } from "react";
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
  messageKey?:
    | "booking:waitlist.joined"
    | "booking:waitlist.left"
    | "instructor:ringBlock.saved.BLOCK"
    | "instructor:ringBlock.saved.RESERVATION"
    | "training:detail.cancelled";
  tone: "danger" | "success";
}

export function noticeText(t: Translate, notice: PageNotice): string {
  if (notice.messageKey === "booking:waitlist.left") return t("booking:waitlist.left");
  if (notice.messageKey === "booking:waitlist.joined") return t("booking:waitlist.joined");
  // S09 (E5-W02): the training detail's cancellation and screen 24's block, back on 03 / 23.
  if (notice.messageKey === "training:detail.cancelled") return t("training:detail.cancelled");
  if (notice.messageKey === "instructor:ringBlock.saved.BLOCK") {
    return t("instructor:ringBlock.saved.BLOCK");
  }
  if (notice.messageKey === "instructor:ringBlock.saved.RESERVATION") {
    return t("instructor:ringBlock.saved.RESERVATION");
  }
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

/**
 * The message of a failed request, by its `code` (never the api `message` as copy). A keyed write
 * whose first request still runs (`409 IDEMPOTENCY_KEY_REUSED {reason: IN_PROGRESS}`) keeps its key
 * and reads the shared `common:inProgress`, never `DIFFERENT_REQUEST`'s text (CONVENCIONS_API §7, E80).
 */
export function errorText(t: Translate, cause: unknown): string {
  if (isInProgress(cause)) return t("common:inProgress");
  const fallback = t("errors:INTERNAL_ERROR");
  return isApiError(cause) ? t(`errors:${cause.code}`, { defaultValue: fallback }) : fallback;
}

/**
 * A request's state; `load` changes with its inputs (a dog, an id), and an answer that arrives
 * after they changed is dropped. `refetch(true)` and a new `refresh` read the same request again
 * with the rows kept on screen while they load. A quiet read that fails shows the error with its
 * retry (04's join and failed hold, 07, the waiting entry), unless `keepRows`: only 03 keeps its
 * rows then, for its `refresh` and `pageshow` reads (E7-W02 review #3, E7-W06 step 3). Another
 * request (another dog) always shows its own error.
 */
export function useLoader<Data>(load: () => Promise<Data>, refresh?: unknown, keepRows = false) {
  const [state, setState] = useState<LoadState<Data>>({ status: "loading" });
  const [reload, setReload] = useState(0);
  // The request whose rows are on screen.
  const shownBy = useRef<() => Promise<Data>>(undefined);
  useEffect(() => {
    let current = true;
    load().then(
      (data) => {
        if (!current) return;
        shownBy.current = load;
        setState({ data, status: "ready" });
      },
      (error: unknown) => {
        if (!current) return;
        setState((previous) =>
          keepRows && previous.status === "ready" && shownBy.current === load
            ? previous
            : { error, status: "error" },
        );
      },
    );
    return () => {
      current = false;
    };
  }, [keepRows, load, refresh, reload]);
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

/**
 * `GET /me/home?dogId=` (03): no `dogId` = «Tots». A new `refresh` (a read-all that landed, S11
 * R-11-10) and `refetch(true)` (back from the page cache) read it again with the rows kept on
 * screen, even if that read fails (the only screen that keeps them, E7-W06 step 3); an older
 * answer is dropped.
 */
export function useMeHome(client: ApiClient, dogId: string | null, refresh = 0) {
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
  return useLoader(load, refresh, true);
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

export function useBooking(client: ApiClient, id: string, refresh?: unknown) {
  const load = useCallback(
    async () => required((await client.GET("/bookings/{id}", { params: { path: { id } } })).data),
    [client, id],
  );
  return useLoader(load, refresh);
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
