import type { components } from "./generated/schema";

export type NotificationPreferences = components["schemas"]["NotificationPreferences"];
export type PreferencesPatch = components["schemas"]["NotificationPreferencesRequest"];
type Category = keyof NotificationPreferences["emailByCategory"];

/** R-11-04: the partial save waits 300 ms after the last change (S11 §2, screen 12 and D10). */
export const PREFERENCES_DEBOUNCE_MS = 300;

/** No key changed (a `null` category or push value is no change). */
export function isEmptyPatch(patch: PreferencesPatch): boolean {
  return (
    Object.values(patch.emailByCategory ?? {}).every((value) => value == null) &&
    patch.pushClubNews == null &&
    patch.reminderMinutesBefore === undefined
  );
}

/** `next` over `base`, key by key (the categories one by one). */
export function mergePatches(base: PreferencesPatch, next: PreferencesPatch): PreferencesPatch {
  return {
    ...base,
    ...next,
    ...(base.emailByCategory == null && next.emailByCategory == null
      ? {}
      : { emailByCategory: { ...base.emailByCategory, ...next.emailByCategory } }),
  };
}

/** The api's state with the user's changes on top (her own changes always win). */
export function patchedPreferences(
  base: NotificationPreferences,
  patch: PreferencesPatch,
): NotificationPreferences {
  const emailByCategory = { ...base.emailByCategory };
  for (const [category, value] of Object.entries(patch.emailByCategory ?? {})) {
    if (value != null) emailByCategory[category as Category] = value;
  }
  return {
    ...base,
    emailByCategory,
    ...(patch.pushClubNews == null ? {} : { pushClubNews: patch.pushClubNews }),
    ...(patch.reminderMinutesBefore === undefined
      ? {}
      : { reminderMinutesBefore: patch.reminderMinutesBefore }),
  };
}

export interface PreferencesSaverState {
  /** The changes of the `PUT`s on their way, merged in the order they were sent. */
  inFlight: PreferencesPatch | undefined;
  /** The changes made since, waiting for their own `PUT`. */
  queued: PreferencesPatch;
  /** The api's last answer. */
  server: NotificationPreferences | undefined;
  /** A debounce is running. */
  waiting: boolean;
}

/** What the page shows: the api's answer, then the saves on their way, then the waiting changes. */
export function shownPreferences(
  state: PreferencesSaverState,
): NotificationPreferences | undefined {
  return state.server === undefined
    ? undefined
    : patchedPreferences(patchedPreferences(state.server, state.inFlight ?? {}), state.queued);
}

export interface PreferencesSaverIo {
  /** The partial `PUT`; `keepalive` when the page is being left. */
  save: (
    body: PreferencesPatch,
    keepalive: boolean,
  ) => Promise<NotificationPreferences | undefined>;
  changed: (state: PreferencesSaverState) => void;
  /** An answer became the api's state while the page is open. */
  saved?: () => void;
  /** A save failed while the page is open: its changes show the api's values again. */
  failed?: (cause: unknown) => void;
  /**
   * The page is left with `unsaved` changes: keep them for the next visit. `undefined`: what this
   * visit kept is not needed any more (the latest choice is saved, or the page saw every answer).
   */
  kept?: (unsaved: PreferencesPatch | undefined) => void;
}

interface Sent {
  body: PreferencesPatch;
  done: Promise<void>;
  seq: number;
}

/** The newest change the user made, and the request that must confirm it. */
interface Latest {
  body: PreferencesPatch;
  /** Its `PUT` 2xx-answered: the latest choice is saved. */
  confirmed: boolean;
  /** The request that confirms it: its own, or its resend once the older ones settled. */
  final: number | undefined;
  /** It was sent while an older `PUT` was out, so it goes again once every older one settled. */
  resend: boolean;
  seq: number;
}

/**
 * The preference saves of screen 12 and D10 (R-11-04): every change shows at once and is sent as a
 * partial `PUT` after a 300 ms pause, one `PUT` at a time while the page is open. An answer newer
 * than the last one applied is the api's state, with the changes made since on top; a failure
 * drops its changes, so the api's values show again.
 *
 * The latest choice wins whatever fails (E7-W05 step 1). The order in which answers arrive says
 * nothing about the order in which the `PUT`s reached the api. So a body sent while an older `PUT`
 * was still out — leaving the page sends everything unsaved at once, with `keepalive` — is sent
 * again, once, after every older `PUT` has settled, however it settled (an answer or a network
 * failure). It then lands after all of them. What the page left with stays kept (`kept`) until
 * that final request is answered with a 2xx; while the page is open the user sees every answer,
 * so nothing stays kept once nothing is unsaved.
 *
 * `leave` hands over what is unsaved; `restore` (a page back from the back-forward cache) makes the
 * page save again, and `adopt` queues what an earlier departure kept as a normal change.
 */
export function createPreferencesSaver(
  io: PreferencesSaverIo,
  debounceMs = PREFERENCES_DEBOUNCE_MS,
) {
  let state: PreferencesSaverState = {
    inFlight: undefined,
    queued: {},
    server: undefined,
    waiting: false,
  };
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pending: Sent[] = [];
  let sequence = 0;
  /** The newest request whose answer was applied. */
  let answered = 0;
  let latest: Latest | undefined;
  /** The page was left (`pagehide`, unmount): the departure's request and `kept` own the changes. */
  let left = false;
  /** Something this visit wrote or took over is kept for the next visit. */
  let holding = false;
  /** Who hears the answers: `io`'s handlers, or the page's latest ones (`listen`). */
  let heard: Pick<PreferencesSaverIo, "failed" | "saved"> = io;

  const set = (next: Partial<PreferencesSaverState>) => {
    state = { ...state, ...next };
    io.changed(state);
  };
  /** The latest choice still owes its resend (an older `PUT` it was sent behind is still out). */
  const owed = (): Latest | undefined =>
    latest?.resend === true && latest.final === undefined ? latest : undefined;
  /**
   * The changes not saved yet, oldest first: the `PUT`s on their way, then the latest choice while
   * it owes its resend — it is newer than every request still out, so it always wins.
   */
  const inFlight = (): PreferencesPatch | undefined => {
    const bodies = pending.map((sent) => sent.body);
    const due = owed();
    if (due !== undefined) bodies.push(due.body);
    return bodies.length === 0
      ? undefined
      : bodies.reduce<PreferencesPatch>((merged, body) => mergePatches(merged, body), {});
  };

  /** After every settled request: the resend that is due, what is kept, and what waits. */
  const settled = () => {
    const due = owed();
    if (due !== undefined && !pending.some((sent) => sent.seq < due.seq)) {
      send(due.body, left, true);
    }
    if (holding && pending.length === 0 && isEmptyPatch(state.queued)) {
      // Left: only the latest choice's 2xx frees it. Open: the user saw every answer.
      if (!left || latest === undefined || latest.confirmed) {
        holding = false;
        io.kept?.(undefined);
      }
    }
    // Changes made meanwhile whose pause is over go now; a running pause sends them itself.
    if (!left && timer === undefined && pending.length === 0 && !isEmptyPatch(state.queued)) {
      flush();
    }
  };

  const send = (body: PreferencesPatch, keepalive: boolean, resend = false): void => {
    sequence += 1;
    const seq = sequence;
    if (resend) {
      if (latest !== undefined) latest.final = seq;
    } else {
      const older = pending.length > 0;
      latest = { body, confirmed: false, final: older ? undefined : seq, resend: older, seq };
    }
    const sent: Sent = {
      body,
      done: io.save(body, keepalive).then(
        (data) => {
          pending = pending.filter((item) => item !== sent);
          if (latest?.final === seq) latest.confirmed = true;
          if (seq > answered) {
            // The newest answer so far: the api's state after this and every older request.
            answered = seq;
            set({ inFlight: inFlight(), ...(data === undefined ? {} : { server: data }) });
            if (!left) heard.saved?.();
          } else {
            set({ inFlight: inFlight() });
          }
          settled();
        },
        (cause: unknown) => {
          pending = pending.filter((item) => item !== sent);
          set({ inFlight: inFlight() });
          // A departure's request is covered by its resend and by what it kept.
          if (!left && !keepalive) heard.failed?.(cause);
          settled();
        },
      ),
      seq,
    };
    pending = [...pending, sent];
    set({ inFlight: inFlight() });
  };

  const flush = (): void => {
    clearTimeout(timer);
    timer = undefined;
    if (pending.length > 0 || isEmptyPatch(state.queued)) {
      if (state.waiting) set({ waiting: false });
      return;
    }
    const body = state.queued;
    set({ queued: {}, waiting: false });
    send(body, false);
  };

  const edit = (patch: PreferencesPatch): void => {
    clearTimeout(timer);
    set({ queued: mergePatches(state.queued, patch), waiting: true });
    timer = setTimeout(flush, debounceMs);
  };

  /** What an earlier departure kept (taken over by this visit): sent again as a normal change. */
  const adopt = (patch: PreferencesPatch): void => {
    if (isEmptyPatch(patch)) return;
    holding = true;
    edit(patch);
  };

  /** Sends at once what waits for its pause; resolves when nothing is unsaved any more. */
  const settle = async (): Promise<void> => {
    clearTimeout(timer);
    timer = undefined;
    if (pending.length === 0 && isEmptyPatch(state.queued)) {
      if (state.waiting) set({ waiting: false });
      return;
    }
    flush();
    await Promise.all(pending.map((sent) => sent.done));
    await settle();
  };

  return {
    adopt,
    edit,
    /**
     * The page is being left (another route, `pagehide`): every unsaved change — the waiting ones,
     * the ones on their way and a resend still owed — goes at once in one `PUT` with `keepalive`,
     * and `kept` holds it for the next visit in case this page is gone before the latest choice is
     * saved. A second call sends only the changes made after the first (E7-W02 review #1).
     */
    leave(): void {
      clearTimeout(timer);
      timer = undefined;
      const unsaved = mergePatches(inFlight() ?? {}, state.queued);
      if (isEmptyPatch(unsaved) || (left && isEmptyPatch(state.queued))) {
        if (state.waiting) set({ waiting: false });
        return;
      }
      left = true;
      holding = true;
      set({ queued: {}, waiting: false });
      io.kept?.(unsaved);
      send(unsaved, true);
    },
    /**
     * The page's handlers of the answers, set from an effect so they read the page's latest props
     * and texts (they replace `io`'s).
     */
    listen(handlers: Pick<PreferencesSaverIo, "failed" | "saved">): void {
      heard = handlers;
    },
    /** The api's state, read by the page's `GET`. */
    load(server: NotificationPreferences): void {
      set({ server });
    },
    /**
     * Back from the back-forward cache (`pageshow` with `persisted`): the page saves as before, and
     * `kept` — what its departure kept and nothing confirmed since — goes again as a normal change
     * (E7-W04 step 4, E7-W05 step 2).
     */
    restore(kept: PreferencesPatch | undefined): void {
      if (!left) return;
      left = false;
      if (kept === undefined) settled();
      else adopt(kept);
    },
    settle,
    state(): PreferencesSaverState {
      return state;
    },
  };
}

export type PreferencesSaver = ReturnType<typeof createPreferencesSaver>;

/** A change older than this is not sent again (someone may have changed the preferences since). */
export const PREFERENCES_OUTBOX_MAX_AGE_MS = 5 * 60_000;

interface OutboxEntry {
  at: number;
  patch: PreferencesPatch;
  /** The visit that owns the entry (E7-W02 review #4); older entries have none. */
  visit?: string;
  [scope: string]: unknown;
}

/**
 * The changes a page was left with, in this tab's `sessionStorage`, for the next visit of the same
 * scope (screen 12: the account and the club; D10: the member) — only the partial body, never
 * personal data. Each visit owns its entry: taking an earlier one over makes it this visit's, and
 * `clear` removes this visit's entry only, so an older visit's late success never erases what a
 * newer visit kept (E7-W02 review #4).
 */
export function createPreferencesOutbox(
  storageKey: string,
  scope: Readonly<Record<string, string>>,
  now: () => number = Date.now,
) {
  const visit = crypto.randomUUID();
  const read = (): OutboxEntry | undefined => {
    try {
      const entry = JSON.parse(sessionStorage.getItem(storageKey) ?? "null") as OutboxEntry | null;
      if (entry === null) return undefined;
      return Object.entries(scope).every(([key, value]) => entry[key] === value)
        ? entry
        : undefined;
    } catch {
      return undefined;
    }
  };
  const store = (entry: OutboxEntry) => {
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(entry));
    } catch {
      // Without storage the keepalive request is the only way out.
    }
  };
  return {
    /** What a departure of this scope left unsaved, now owned by this visit; nothing if too old. */
    take(): PreferencesPatch | undefined {
      const entry = read();
      if (entry === undefined) return undefined;
      if (now() - entry.at > PREFERENCES_OUTBOX_MAX_AGE_MS || isEmptyPatch(entry.patch)) {
        sessionStorage.removeItem(storageKey);
        return undefined;
      }
      if (entry.visit !== visit) store({ ...entry, visit });
      return entry.patch;
    },
    write(patch: PreferencesPatch): void {
      store({ ...scope, at: now(), patch, visit });
    },
    /** Drops this visit's entry (another visit's stays). */
    clear(): void {
      if (read()?.visit === visit) sessionStorage.removeItem(storageKey);
    },
  };
}

export type PreferencesOutbox = ReturnType<typeof createPreferencesOutbox>;
