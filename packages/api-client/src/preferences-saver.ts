import { isApiError } from "./api-error";
import type { components } from "./generated/schema";
import { isUnanswered } from "./submission-key";

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

/** `base` without the preferences `patch` changes (a `null` category or push value is no change). */
function withoutPreferencesOf(base: PreferencesPatch, patch: PreferencesPatch): PreferencesPatch {
  const emailByCategory = Object.fromEntries(
    Object.entries(base.emailByCategory ?? {}).filter(
      ([category, value]) => value != null && patch.emailByCategory?.[category as Category] == null,
    ),
  );
  return {
    ...(Object.keys(emailByCategory).length === 0 ? {} : { emailByCategory }),
    ...(base.pushClubNews == null || patch.pushClubNews != null
      ? {}
      : { pushClubNews: base.pushClubNews }),
    ...(base.reminderMinutesBefore === undefined || patch.reminderMinutesBefore !== undefined
      ? {}
      : { reminderMinutesBefore: base.reminderMinutesBefore }),
  };
}

/**
 * An answer that ends every save of the page: the member was erased (`409 MEMBER_ERASED`, S14 §5).
 * Nothing is sent, read or kept again (E7-W07 round 2 #2).
 */
function isFinalRefusal(cause: unknown): boolean {
  return isApiError(cause, "MEMBER_ERASED");
}

/**
 * The api refused the save with its body (a 4xx, CONVENCIONS_API §7, E85): an answer, so what it
 * refused is not kept to be sent again. A 429 (busy) or a 401 (the token, not the choice) saved
 * nothing and refused nothing: like a lost answer, they keep the choice (E7-W07 round 2).
 */
function isRefusal(cause: unknown): boolean {
  return (
    !isUnanswered(cause) && !(isApiError(cause) && (cause.status === 429 || cause.status === 401))
  );
}

/** `base` without the preferences `refused` set to the same value: the api refused those. */
function withoutRefusedValues(base: PreferencesPatch, refused: PreferencesPatch): PreferencesPatch {
  const emailByCategory = Object.fromEntries(
    Object.entries(base.emailByCategory ?? {}).filter(
      ([category, value]) =>
        value != null && refused.emailByCategory?.[category as Category] !== value,
    ),
  );
  return {
    ...(Object.keys(emailByCategory).length === 0 ? {} : { emailByCategory }),
    ...(base.pushClubNews == null || refused.pushClubNews === base.pushClubNews
      ? {}
      : { pushClubNews: base.pushClubNews }),
    ...(base.reminderMinutesBefore === undefined ||
    refused.reminderMinutesBefore === base.reminderMinutesBefore
      ? {}
      : { reminderMinutesBefore: base.reminderMinutesBefore }),
  };
}

/** How many preferences a patch changes. */
function changedPreferences(patch: PreferencesPatch): number {
  return (
    Object.values(patch.emailByCategory ?? {}).filter((value) => value != null).length +
    (patch.pushClubNews == null ? 0 : 1) +
    (patch.reminderMinutesBefore === undefined ? 0 : 1)
  );
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
  /**
   * The page's `GET`: after a failed save on a page whose departure sent overlapping `PUT`s, the
   * last answer may not be what the api holds, so the page reads it again (E7-W06 step 4).
   */
  read?: () => Promise<NotificationPreferences | undefined>;
  changed: (state: PreferencesSaverState) => void;
  /** An answer became the api's state while the page is open. */
  saved?: () => void;
  /**
   * A save failed while the page is open: its changes show the api's values again, what is kept
   * excepted. Also `409 MEMBER_ERASED`, once, whenever it comes: the saver has stopped.
   */
  failed?: (cause: unknown) => void;
  /**
   * The page is left with `unsaved` changes: keep them for the next visit. `undefined`: what this
   * visit kept is not needed any more (a 2xx confirmed the latest choice, or the member was erased);
   * never after a failure (E7-W07 round 2 #1).
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
 * that final request is answered with a 2xx.
 *
 * Once a departure has sent a `PUT` while an older one was out (and the page came back from the
 * back-forward cache), the newest answer is not necessarily what the api holds, until the latest
 * choice's own request is answered with nothing else out. Until then a failed save reads the
 * preferences again (`read`) instead of showing the last answer, and what is kept stays kept until
 * the latest choice gets its 2xx (E7-W06 step 4).
 *
 * Such a failure never hides the member's last choice (E7-W07 step 2; ruling E85, option a): what
 * is kept goes back on top at once as a pending change, waits for that read, and is sent again on
 * top of what the api holds. If that resend fails as well, the choice stays on top, unsent, until
 * the next change, the departure or the next visit sends it (never a loop of resends).
 *
 * A failure never drops what is kept (E7-W07 round 2 #1, ruling E86): without overlapping `PUT`s
 * too — the next visit's resend of what a departure kept, say — the choice stays on top, unsent,
 * and kept. The kept entry goes only when a 2xx confirms the choice, or when the member changes
 * the same preference again (the new choice wins). A change of the member's own that fails, with
 * nothing kept, still shows the api's values again. A refusal with the api's body (a 4xx other
 * than 429) is the api's answer, not a failure: the preferences it refused leave what is kept.
 *
 * `409 MEMBER_ERASED` is final (E7-W07 round 2 #2; S14 §5): the saver stops — the changes waiting,
 * the re-read and the departure's resend are dropped, and so is what is kept.
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
  /**
   * What this visit keeps for the next one (what it last handed to `kept`, or took over from an
   * earlier departure): the member's last choice, until a 2xx confirms it or she changes the same
   * preference again.
   */
  let held: PreferencesPatch | undefined;
  /**
   * A `PUT` was sent while an older one was out (a departure): the order of the answers says
   * nothing about what the api holds, until the latest choice's own request is answered alone.
   */
  let overlapped = false;
  /** A save failed while `overlapped`: the api's state is read again once nothing is out. */
  let unsure = false;
  /** That read is out: the held choice waits on top for it before it is sent again. */
  let rereading = false;
  /** The request that sent the held choice again after that read: its failure is not retried. */
  let resent: number | undefined;
  /** The held choice is on top, unsent, after its resend failed: the next save or departure sends it. */
  let parked = false;
  /** The api answered `MEMBER_ERASED`: nothing is sent, read or kept any more. */
  let stopped = false;
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

  /**
   * `MEMBER_ERASED` (E7-W07 round 2 #2): the changes waiting and the resend still owed are dropped,
   * nothing is read or sent again (the departure included), and what is kept goes. The page hears
   * it once, also when it was left, so a page restored later shows the final state.
   */
  const stop = (cause: unknown): void => {
    if (stopped) return;
    stopped = true;
    clearTimeout(timer);
    timer = undefined;
    latest = undefined;
    unsure = false;
    parked = false;
    set({ inFlight: undefined, queued: {}, waiting: false });
    if (held !== undefined) {
      held = undefined;
      io.kept?.(undefined);
    }
    heard.failed?.(cause);
  };

  /**
   * The api's state, read again (E7-W06 step 4); dropped when a `PUT` was sent meanwhile. Then the
   * held choice, waiting on top, is sent again over it (E7-W07 step 2), unless the member's own
   * change sent it meanwhile or its pause is running (that pause sends it).
   */
  const read = (): void => {
    const at = sequence;
    const resume = () => {
      rereading = false;
      if (stopped) return;
      if (left || sequence !== at || timer !== undefined || pending.length > 0) {
        settled();
        return;
      }
      if (isEmptyPatch(state.queued)) {
        if (state.waiting) set({ waiting: false });
        settled();
        return;
      }
      resent = sequence + 1;
      flush();
    };
    if (io.read === undefined) {
      resume();
      return;
    }
    rereading = true;
    io.read().then(
      (data) => {
        if (stopped) return;
        if (data !== undefined && sequence === at) set({ server: data });
        resume();
      },
      // The failure was already said: the choice goes again on top of what the page shows. An
      // erased member's read ends every save (E7-W07 round 2 #2).
      (cause: unknown) => {
        if (isFinalRefusal(cause)) stop(cause);
        resume();
      },
    );
  };

  /** After every settled request: the resend that is due, what is kept, and what waits. */
  const settled = () => {
    if (stopped) return;
    const due = owed();
    if (due !== undefined && !pending.some((sent) => sent.seq < due.seq)) {
      send(due.body, left, true);
    }
    // Only the latest choice's 2xx frees what is kept, never a failure (E7-W07 round 2 #1): a
    // failure of the latest request leaves it unconfirmed, and what is kept back on top.
    if (
      held !== undefined &&
      pending.length === 0 &&
      isEmptyPatch(state.queued) &&
      latest?.confirmed === true
    ) {
      held = undefined;
      io.kept?.(undefined);
    }
    // A failed save after overlapping PUTs: what the api holds, once nothing is out or pausing.
    if (unsure && !left && timer === undefined && pending.length === 0) {
      unsure = false;
      read();
      return;
    }
    // Changes made meanwhile whose pause is over go now; a running pause sends them itself.
    if (
      !left &&
      !rereading &&
      !parked &&
      timer === undefined &&
      pending.length === 0 &&
      !isEmptyPatch(state.queued)
    ) {
      flush();
    }
  };

  const send = (body: PreferencesPatch, keepalive: boolean, resend = false): void => {
    sequence += 1;
    const seq = sequence;
    // Every older request settled before this one left (none is out).
    const alone = pending.length === 0;
    if (!alone) overlapped = true;
    if (resend) {
      if (latest !== undefined) latest.final = seq;
    } else {
      latest = { body, confirmed: false, final: alone ? seq : undefined, resend: !alone, seq };
    }
    const sent: Sent = {
      body,
      done: io.save(body, keepalive).then(
        (data) => {
          pending = pending.filter((item) => item !== sent);
          if (stopped) return;
          if (latest?.final === seq) {
            latest.confirmed = true;
            // The latest choice answered alone, with nothing out since: its answer is the api's.
            if (alone && pending.length === 0) {
              overlapped = false;
              unsure = false;
            }
          }
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
          if (stopped) return;
          // An erased member: final, whoever sent it (E7-W07 round 2 #2).
          if (isFinalRefusal(cause)) {
            stop(cause);
            return;
          }
          set({ inFlight: inFlight() });
          // A departure's request is covered by its resend and by what it kept.
          if (!left && !keepalive) {
            heard.failed?.(cause);
            // The api refused this body: what is kept, and a copy of it waiting to go again (an
            // adopted resend), lose the values it refused — they would be refused again, with
            // every change sent on top of them — and the api's values show.
            if (isRefusal(cause)) {
              if (held !== undefined) {
                const rest = withoutRefusedValues(held, body);
                if (changedPreferences(rest) !== changedPreferences(held)) {
                  held = isEmptyPatch(rest) ? undefined : rest;
                  io.kept?.(held);
                }
              }
              const waiting = withoutRefusedValues(state.queued, body);
              if (changedPreferences(waiting) !== changedPreferences(state.queued)) {
                set({
                  queued: waiting,
                  ...(isEmptyPatch(waiting) && timer === undefined ? { waiting: false } : {}),
                });
              }
              if (overlapped) unsure = true;
              settled();
              return;
            }
            // After overlapping PUTs the last answer may not be the api's: read it again, then
            // send the choice again (E7-W06 step 4, E7-W07 step 2).
            const reread = overlapped && seq !== resent;
            // The changes the member made since: they still go, the kept choice with them.
            const since = state.queued;
            // The member's last choice never disappears (E7-W07 step 2, round 2 #1; rulings E85
            // and E86): it goes back on top as a pending change, the changes made since on top of
            // it, and stays kept. Without that read, or when its resend fails as well, it stays
            // there unsent until the next change, the departure or the next visit: no loop.
            if (held !== undefined) {
              set({
                queued: mergePatches(held, since),
                waiting: reread ? true : state.waiting,
              });
            }
            if (reread) unsure = true;
            else if (held !== undefined || overlapped) parked = isEmptyPatch(since);
          }
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
    if (stopped) return;
    if (pending.length > 0 || isEmptyPatch(state.queued)) {
      if (state.waiting) set({ waiting: false });
      return;
    }
    parked = false;
    const body = state.queued;
    set({ queued: {}, waiting: false });
    send(body, false);
  };

  /** A change shows at once and waits for its pause. */
  const queue = (patch: PreferencesPatch): void => {
    if (stopped) return;
    clearTimeout(timer);
    parked = false;
    set({ queued: mergePatches(state.queued, patch), waiting: true });
    timer = setTimeout(flush, debounceMs);
  };

  /**
   * The member's change. It replaces what is kept for the same preference (the new choice wins,
   * E7-W07 step 2): the kept entry keeps only the other preferences, or goes.
   */
  const edit = (patch: PreferencesPatch): void => {
    if (stopped) return;
    if (held !== undefined) {
      const rest = withoutPreferencesOf(held, patch);
      if (changedPreferences(rest) !== changedPreferences(held)) {
        held = isEmptyPatch(rest) ? undefined : rest;
        io.kept?.(held);
      }
    }
    queue(patch);
  };

  /** What an earlier departure kept (taken over by this visit): sent again as a normal change. */
  const adopt = (patch: PreferencesPatch): void => {
    if (stopped || isEmptyPatch(patch)) return;
    held = held === undefined ? patch : mergePatches(held, patch);
    queue(patch);
  };

  /**
   * Sends at once what waits for its pause; resolves when nothing is unsaved any more, or when what
   * is left waits for a read or for the member (a failed resend, E7-W07 step 2).
   */
  const settle = async (): Promise<void> => {
    clearTimeout(timer);
    timer = undefined;
    if (stopped) return;
    if (pending.length === 0 && isEmptyPatch(state.queued)) {
      if (state.waiting) set({ waiting: false });
      return;
    }
    if (pending.length === 0 && (rereading || unsure || parked)) return;
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
     * saved. A second call sends only the changes made after the first (E7-W02 review #1). After
     * `MEMBER_ERASED` nothing is sent (E7-W07 round 2 #2).
     */
    leave(): void {
      clearTimeout(timer);
      timer = undefined;
      if (stopped) return;
      const unsaved = mergePatches(inFlight() ?? {}, state.queued);
      if (isEmptyPatch(unsaved) || (left && isEmptyPatch(state.queued))) {
        if (state.waiting) set({ waiting: false });
        return;
      }
      left = true;
      parked = false;
      held = unsaved;
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
     * `kept` — what the outbox of this scope handed over: its departure's change and nothing
     * confirmed since, or what a newer visit left — goes again as a normal change (E7-W04 step 4,
     * E7-W05 step 2). A page that left with nothing unsaved adopts it too, never takes it over to
     * ignore it (E7-W05 review #4).
     */
    restore(kept: PreferencesPatch | undefined): void {
      if (stopped) return;
      const wasLeft = left;
      left = false;
      if (kept !== undefined) adopt(kept);
      else if (wasLeft) settled();
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
