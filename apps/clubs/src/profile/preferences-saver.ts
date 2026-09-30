import type { components } from "@agilityhub/api-client";

type Preferences = components["schemas"]["NotificationPreferences"];
type PreferencesRequest = components["schemas"]["NotificationPreferencesRequest"];
export type Category = keyof Preferences["emailByCategory"];

/** The member's own changes not confirmed by the api yet (only the keys she touched). */
export interface Edits {
  emailByCategory?: Partial<Record<Category, boolean>>;
  pushClubNews?: boolean;
  reminderMinutesBefore?: number | null;
}

/** R-11-04: the partial save is debounced by 300 ms (S11 §2 row 12). */
export const PREFERENCES_DEBOUNCE_MS = 300;

export interface SaverState {
  /** The edits of the `PUT` on its way. */
  inFlight: Edits | undefined;
  /** The edits made since, waiting for their own `PUT`. */
  queued: Edits;
  /** The api's last answer. */
  server: Preferences | undefined;
  /** A debounce is running. */
  waiting: boolean;
}

function isEmpty(edits: Edits): boolean {
  return (
    Object.keys(edits.emailByCategory ?? {}).length === 0 &&
    edits.pushClubNews === undefined &&
    !("reminderMinutesBefore" in edits)
  );
}

function mergeEdits(base: Edits, next: Edits): Edits {
  return {
    ...base,
    ...next,
    ...(base.emailByCategory === undefined && next.emailByCategory === undefined
      ? {}
      : { emailByCategory: { ...base.emailByCategory, ...next.emailByCategory } }),
  };
}

/** The api's state with the member's edits on top (her own edits always win). */
function applied(base: Preferences, edits: Edits): Preferences {
  return {
    ...base,
    emailByCategory: { ...base.emailByCategory, ...edits.emailByCategory },
    ...(edits.pushClubNews === undefined ? {} : { pushClubNews: edits.pushClubNews }),
    ...("reminderMinutesBefore" in edits
      ? { reminderMinutesBefore: edits.reminderMinutesBefore ?? null }
      : {}),
  };
}

/** What screen 12 shows: the api's answer, then the save on its way, then the waiting edits. */
export function shownPreferences(state: SaverState): Preferences | undefined {
  return state.server === undefined
    ? undefined
    : applied(applied(state.server, state.inFlight ?? {}), state.queued);
}

/** The partial body (T-11-20): only the keys the member changed. */
export function preferencesRequest(edits: Edits): PreferencesRequest {
  return {
    ...(edits.emailByCategory === undefined ? {} : { emailByCategory: edits.emailByCategory }),
    ...(edits.pushClubNews === undefined ? {} : { pushClubNews: edits.pushClubNews }),
    ...("reminderMinutesBefore" in edits
      ? { reminderMinutesBefore: edits.reminderMinutesBefore ?? null }
      : {}),
  };
}

export interface PreferencesSaverIo {
  /** `PUT /me/notification-preferences`; `keepalive` when the page is being left. */
  save: (body: PreferencesRequest, keepalive: boolean) => Promise<Preferences | undefined>;
  changed: (state: SaverState) => void;
  failed: (cause: unknown) => void;
}

/**
 * Screen 12's saves (R-11-04): every change is shown at once and sent as a partial `PUT` after a
 * 300 ms pause; one `PUT` at a time. An answer replaces the api's state and the edits made while
 * it travelled stay on top of it (a late answer never undoes a newer choice); a failure drops the
 * failed edits only, so the api's values show again for them.
 */
export function createPreferencesSaver(
  io: PreferencesSaverIo,
  debounceMs = PREFERENCES_DEBOUNCE_MS,
) {
  let state: SaverState = { inFlight: undefined, queued: {}, server: undefined, waiting: false };
  let timer: ReturnType<typeof setTimeout> | undefined;

  const set = (next: Partial<SaverState>) => {
    state = { ...state, ...next };
    io.changed(state);
  };

  const flush = (keepalive: boolean): void => {
    clearTimeout(timer);
    timer = undefined;
    if (state.inFlight !== undefined || isEmpty(state.queued)) {
      if (state.waiting) set({ waiting: false });
      return;
    }
    const sent = state.queued;
    set({ inFlight: sent, queued: {}, waiting: false });
    io.save(preferencesRequest(sent), keepalive)
      .then(
        (data) => {
          set({ inFlight: undefined, ...(data === undefined ? {} : { server: data }) });
        },
        (cause: unknown) => {
          set({ inFlight: undefined });
          io.failed(cause);
        },
      )
      .finally(() => {
        // Edits made meanwhile whose pause is over go now; a running pause sends them itself.
        if (timer === undefined && !isEmpty(state.queued)) flush(keepalive);
      });
  };

  return {
    /** The api's state, read by `GET /me/notification-preferences`. */
    load(server: Preferences): void {
      set({ server });
    },
    edit(edits: Edits): void {
      clearTimeout(timer);
      set({ queued: mergeEdits(state.queued, edits), waiting: true });
      timer = setTimeout(() => {
        flush(false);
      }, debounceMs);
    },
    /** Sends a change still in its pause at once (the page is being left). */
    flushNow(): void {
      if (timer !== undefined) flush(true);
    },
    state(): SaverState {
      return state;
    },
  };
}

export type PreferencesSaver = ReturnType<typeof createPreferencesSaver>;
