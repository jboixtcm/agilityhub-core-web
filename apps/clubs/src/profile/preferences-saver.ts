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
  /** The edits of the `PUT`s on their way, merged in the order they were sent. */
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

export function mergeEdits(base: Edits, next: Edits): Edits {
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

/** What screen 12 shows: the api's answer, then the saves on their way, then the waiting edits. */
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
  /**
   * The page is being left with `unsaved` changes (`undefined`: nothing is unsaved any more):
   * the card keeps them for the next visit of the same account and club (E7-W02 round 2 #1).
   */
  kept?: (unsaved: Edits | undefined) => void;
}

interface Sent {
  body: Edits;
  keepalive: boolean;
  seq: number;
}

/**
 * Screen 12's saves (R-11-04): every change is shown at once and sent as a partial `PUT` after a
 * 300 ms pause; one `PUT` at a time while the page is open. An answer replaces the api's state and
 * the edits made while it travelled stay on top of it; a failure drops the failed edits only, so
 * the api's values show again for them. Leaving the page (`leave`) sends every unsaved change at
 * once with `keepalive` (the one on its way included) and hands it to `kept`; an older `PUT` that
 * answers after a newer one may have landed last at the api, so the newest body is sent again and
 * the latest choice wins (E7-W02 round 2 #1).
 */
export function createPreferencesSaver(
  io: PreferencesSaverIo,
  debounceMs = PREFERENCES_DEBOUNCE_MS,
) {
  let state: SaverState = { inFlight: undefined, queued: {}, server: undefined, waiting: false };
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pending: Sent[] = [];
  let sequence = 0;
  /** The newest request answered so far. */
  let answered = 0;
  /** The newest request sent, and whether its body was already sent again. */
  let newest: (Sent & { resent: boolean }) | undefined;
  let left = false;

  const set = (next: Partial<SaverState>) => {
    state = { ...state, ...next };
    io.changed(state);
  };
  const inFlight = (): Edits | undefined =>
    pending.length === 0
      ? undefined
      : pending.reduce<Edits>((merged, sent) => mergeEdits(merged, sent.body), {});

  const send = (body: Edits, keepalive: boolean, resend = false): void => {
    sequence += 1;
    const sent: Sent = { body, keepalive, seq: sequence };
    pending = [...pending, sent];
    if (!resend) newest = { ...sent, resent: false };
    set({ inFlight: inFlight() });
    io.save(preferencesRequest(body), keepalive)
      .then(
        (data) => {
          pending = pending.filter((item) => item !== sent);
          if (sent.seq > answered) {
            // The newest answer so far: the api's state after this and every older request.
            answered = sent.seq;
            set({ inFlight: inFlight(), ...(data === undefined ? {} : { server: data }) });
          } else {
            set({ inFlight: inFlight() });
            // An older request answered after a newer one: it may have landed last at the api,
            // over the newer values. The newest body goes again, once.
            if (newest !== undefined && !newest.resent && newest.seq > sent.seq) {
              newest.resent = true;
              send(newest.body, newest.keepalive, true);
            }
          }
          if (left && pending.length === 0) io.kept?.(undefined);
        },
        (cause: unknown) => {
          pending = pending.filter((item) => item !== sent);
          set({ inFlight: inFlight() });
          io.failed(cause);
        },
      )
      .finally(() => {
        // Edits made meanwhile whose pause is over go now; a running pause sends them itself.
        if (!left && timer === undefined && pending.length === 0 && !isEmpty(state.queued)) {
          flush();
        }
      });
  };

  const flush = (): void => {
    clearTimeout(timer);
    timer = undefined;
    if (pending.length > 0 || isEmpty(state.queued)) {
      if (state.waiting) set({ waiting: false });
      return;
    }
    const body = state.queued;
    set({ queued: {}, waiting: false });
    send(body, false);
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
        flush();
      }, debounceMs);
    },
    /**
     * The page is being left (another route, `pagehide`): every unsaved change — the waiting ones
     * and the ones on their way — goes at once in one `PUT` with `keepalive`, and `kept` holds it
     * for the next visit in case this page is gone before the api answers.
     */
    leave(): void {
      clearTimeout(timer);
      timer = undefined;
      const unsaved = mergeEdits(inFlight() ?? {}, state.queued);
      if (left || isEmpty(unsaved)) {
        if (state.waiting) set({ waiting: false });
        return;
      }
      left = true;
      set({ queued: {}, waiting: false });
      io.kept?.(unsaved);
      send(unsaved, true);
    },
    state(): SaverState {
      return state;
    },
  };
}

export type PreferencesSaver = ReturnType<typeof createPreferencesSaver>;

/**
 * The changes screen 12 was left with, for the next visit in this tab (E7-W02 round 2 #1): only
 * the partial body (switches, reminder, push), never personal data, and only for the account and
 * club that made them.
 */
export const NOTICES_OUTBOX_KEY = "agilityhub.noticePreferences.outbox.v1";
/** A change older than this is not sent again (someone may have changed the preferences since). */
export const NOTICES_OUTBOX_MAX_AGE_MS = 5 * 60_000;

interface OutboxEntry {
  accountId: string;
  at: number;
  clubId: string;
  patch: Edits;
}

export interface OutboxScope {
  accountId: string;
  clubId: string;
}

export function readNoticesOutbox(scope: OutboxScope, now = Date.now()): Edits | undefined {
  try {
    const entry = JSON.parse(
      sessionStorage.getItem(NOTICES_OUTBOX_KEY) ?? "null",
    ) as OutboxEntry | null;
    if (entry === null) return undefined;
    if (entry.accountId !== scope.accountId || entry.clubId !== scope.clubId) return undefined;
    if (now - entry.at > NOTICES_OUTBOX_MAX_AGE_MS || isEmpty(entry.patch)) {
      sessionStorage.removeItem(NOTICES_OUTBOX_KEY);
      return undefined;
    }
    return entry.patch;
  } catch {
    return undefined;
  }
}

export function writeNoticesOutbox(scope: OutboxScope, patch: Edits | undefined): void {
  try {
    if (patch === undefined) {
      const entry = JSON.parse(
        sessionStorage.getItem(NOTICES_OUTBOX_KEY) ?? "null",
      ) as OutboxEntry | null;
      if (entry?.accountId === scope.accountId && entry.clubId === scope.clubId) {
        sessionStorage.removeItem(NOTICES_OUTBOX_KEY);
      }
      return;
    }
    const entry: OutboxEntry = { ...scope, at: Date.now(), patch };
    sessionStorage.setItem(NOTICES_OUTBOX_KEY, JSON.stringify(entry));
  } catch {
    // Without storage the keepalive request is the only way out.
  }
}
