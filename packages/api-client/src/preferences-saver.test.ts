import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createPreferencesOutbox,
  createPreferencesSaver,
  type NotificationPreferences,
  type PreferencesPatch,
  PREFERENCES_OUTBOX_MAX_AGE_MS,
  shownPreferences,
} from "./preferences-saver";

const PREFERENCES: NotificationPreferences = {
  availableLocales: ["ca"],
  emailByCategory: { CLUB_CHANGES: true, CLUB_NEWS: true, OPERATIONAL: false, PERSONAL: true },
  locale: "ca",
  modules: { push: true, sms: true },
  pushClubNews: true,
  reminderMinutesBefore: null,
  reminderOptionsMinutes: [60, 120],
  smsFixed: true,
};

/** One `PUT` the test answers when it chooses: a 2xx with the api's state, or a network failure. */
interface Put {
  body: PreferencesPatch;
  fail: () => void;
  keepalive: boolean;
  ok: () => void;
}

/**
 * A saver whose `PUT`s wait for the test, and an api that applies a body when the test says so;
 * its `GET` (`read`) answers at once with what the api holds, or when the test says so
 * (`deferRead`). `onKept` sees what the saver keeps (an outbox).
 */
function harness(
  options: { deferRead?: boolean; onKept?: (unsaved: PreferencesPatch | undefined) => void } = {},
) {
  const puts: Put[] = [];
  let api: NotificationPreferences = PREFERENCES;
  const kept: (PreferencesPatch | undefined)[] = [];
  const failed: unknown[] = [];
  const reads = { count: 0 };
  const readers: (() => void)[] = [];
  const saver = createPreferencesSaver(
    {
      changed: () => undefined,
      failed: (cause) => failed.push(cause),
      kept: (unsaved) => {
        kept.push(unsaved);
        options.onKept?.(unsaved);
      },
      read: () => {
        reads.count += 1;
        if (options.deferRead !== true) return Promise.resolve(api);
        return new Promise((resolve) => {
          readers.push(() => {
            resolve(api);
          });
        });
      },
      save: (body, keepalive) =>
        new Promise((resolve, reject) => {
          puts.push({
            body,
            fail: () => {
              reject(new TypeError("Failed to fetch"));
            },
            keepalive,
            ok: () => {
              resolve(api);
            },
          });
        }),
    },
    0,
  );
  const land = (body: PreferencesPatch) => {
    api = {
      ...api,
      emailByCategory: {
        ...api.emailByCategory,
        ...(body.emailByCategory as Partial<NotificationPreferences["emailByCategory"]>),
      },
    };
  };
  saver.load(PREFERENCES);
  const at = (index: number): Put => {
    const put = puts[index];
    if (put === undefined) throw new TypeError(`No PUT ${String(index)} yet`);
    return put;
  };
  /** The api answers the oldest `GET` still out. */
  const answerRead = () => {
    readers.shift()?.();
  };
  return { answerRead, api: () => api, at, failed, kept, land, puts, reads, saver };
}

/** A `sessionStorage` for the node environment. */
function memoryStorage(): Storage {
  const items = new Map<string, string>();
  return {
    clear: () => {
      items.clear();
    },
    getItem: (key) => items.get(key) ?? null,
    key: (index) => [...items.keys()][index] ?? null,
    get length() {
      return items.size;
    },
    removeItem: (key) => {
      items.delete(key);
    },
    setItem: (key, value) => {
      items.set(key, value);
    },
  };
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

/** PERSONAL off (on its way), back on, and the page left at once. */
async function offOnLeave(h: ReturnType<typeof harness>) {
  h.saver.edit({ emailByCategory: { PERSONAL: false } });
  await tick();
  h.saver.edit({ emailByCategory: { PERSONAL: true } });
  h.saver.leave();
  expect(h.puts.map((put) => [put.body, put.keepalive])).toEqual([
    [{ emailByCategory: { PERSONAL: false } }, false],
    [{ emailByCategory: { PERSONAL: true } }, true],
  ]);
  expect(h.kept).toEqual([{ emailByCategory: { PERSONAL: true } }]);
}

describe("E7-W05 step 1: the shared preference saver (R-11-04) — the latest choice wins whatever fails", () => {
  it("path a: the older PUT lands last and the resend is lost — nothing frees what the departure kept", async () => {
    const h = harness();
    await offOnLeave(h);
    h.land(h.at(1).body);
    h.at(1).ok();
    await tick();
    h.land(h.at(0).body);
    h.at(0).ok();
    await tick();
    expect(h.puts[2]).toMatchObject({
      body: { emailByCategory: { PERSONAL: true } },
      keepalive: true,
    });
    h.at(2).fail();
    await tick();
    expect(h.api().emailByCategory.PERSONAL).toBe(false);
    expect(h.kept).toEqual([{ emailByCategory: { PERSONAL: true } }]);
    expect(h.failed).toEqual([]);
  });

  it("path b: the older PUT lands last and fails — the latest choice goes again once it settles, and only its 2xx frees what was kept", async () => {
    const h = harness();
    await offOnLeave(h);
    h.land(h.at(1).body);
    h.at(1).ok();
    await tick();
    expect(h.kept).toHaveLength(1);
    h.land(h.at(0).body);
    h.at(0).fail();
    await tick();
    expect(h.puts).toHaveLength(3);
    h.land(h.at(2).body);
    expect(h.kept).toHaveLength(1);
    h.at(2).ok();
    await tick();
    expect(h.api().emailByCategory.PERSONAL).toBe(true);
    expect(h.kept).toEqual([{ emailByCategory: { PERSONAL: true } }, undefined]);
  });

  it("path c: the older PUT lands last but answers first — the latest choice goes again, and what was kept is freed once every PUT is answered", async () => {
    const h = harness();
    await offOnLeave(h);
    h.land(h.at(1).body);
    h.land(h.at(0).body);
    h.at(0).ok();
    await tick();
    expect(h.puts).toHaveLength(3);
    h.land(h.at(2).body);
    h.at(2).ok();
    await tick();
    // The departure's own PUT has not answered yet.
    expect(h.kept).toHaveLength(1);
    h.at(1).ok();
    await tick();
    expect(h.api().emailByCategory.PERSONAL).toBe(true);
    expect(h.kept).toEqual([{ emailByCategory: { PERSONAL: true } }, undefined]);
  });

  it("a page restored while the latest choice still owes its resend, and left again: the new departure carries the latest choice, never the older body still out", async () => {
    const h = harness();
    await offOnLeave(h);
    h.at(1).ok();
    await tick();
    h.saver.restore(undefined);
    expect(shownPreferences(h.saver.state())?.emailByCategory.PERSONAL).toBe(true);
    h.saver.leave();
    expect(h.puts.map((put) => put.body)).toEqual([
      { emailByCategory: { PERSONAL: false } },
      { emailByCategory: { PERSONAL: true } },
      { emailByCategory: { PERSONAL: true } },
    ]);
  });

  it("an open page shows a failure and frees what it took over once nothing is unsaved", async () => {
    const h = harness();
    h.saver.adopt({ reminderMinutesBefore: 60 });
    await tick();
    expect(h.puts).toHaveLength(1);
    h.at(0).fail();
    await tick();
    expect(h.failed).toHaveLength(1);
    expect(h.kept).toEqual([undefined]);
    expect(shownPreferences(h.saver.state())?.reminderMinutesBefore).toBeNull();
  });
});

/**
 * E7-W06 step 4's scenario up to the last of the overlapping PUTs failing: seq1 {false} out, seq2
 * {true} with keepalive, the page restored before either settles (the departure's entry adopted),
 * seq2 lands and answers first, seq1 lands after it (so the api holds false), and the resend seq3
 * of the latest choice fails (handled once this resolves).
 */
async function overlappedThenResendFails(h: ReturnType<typeof harness>) {
  await offOnLeave(h);
  h.saver.restore({ emailByCategory: { PERSONAL: true } });
  await tick();
  expect(h.puts).toHaveLength(2);
  h.land(h.at(1).body);
  h.at(1).ok();
  await tick();
  h.land(h.at(0).body);
  h.at(0).ok();
  await tick();
  expect(h.api().emailByCategory.PERSONAL).toBe(false);
  expect(h.puts[2]).toMatchObject({
    body: { emailByCategory: { PERSONAL: true } },
    keepalive: false,
  });
  h.at(2).fail();
  await tick();
}

describe("E7-W06 step 4 (E7-W05 review #1) and E7-W07 step 2 (E7-W06 review #3, ruling E85: option a): a failed save after a restore whose departure overlapped", () => {
  it("E7-W07 step 2 (R-11-04): the last PUT of overlapping ones fails, the GET answers PERSONAL = false, the page shows PERSONAL = true as a pending change, sends it again, and only its 2xx frees the outbox entry", async () => {
    const h = harness({ deferRead: true });
    await overlappedThenResendFails(h);
    expect(h.failed).toHaveLength(1);
    // What the api holds is read again (E7-W06 step 4); meanwhile nothing else is sent, and the
    // member's last choice shows as a pending change.
    expect(h.reads.count).toBe(1);
    expect(h.puts).toHaveLength(3);
    expect(shownPreferences(h.saver.state())?.emailByCategory.PERSONAL).toBe(true);
    expect(h.saver.state().waiting).toBe(true);
    h.answerRead();
    await tick();
    expect(h.saver.state().server?.emailByCategory.PERSONAL).toBe(false);
    // …and the kept choice goes back on top of it: shown, pending, and sent again.
    expect(shownPreferences(h.saver.state())?.emailByCategory.PERSONAL).toBe(true);
    expect(h.saver.state().inFlight).toEqual({ emailByCategory: { PERSONAL: true } });
    expect(h.puts).toHaveLength(4);
    expect(h.puts[3]).toMatchObject({
      body: { emailByCategory: { PERSONAL: true } },
      keepalive: false,
    });
    // Not freed while the retry is out.
    expect(h.kept).toEqual([{ emailByCategory: { PERSONAL: true } }]);
    h.land(h.at(3).body);
    h.at(3).ok();
    await tick();
    expect(h.api().emailByCategory.PERSONAL).toBe(true);
    expect(shownPreferences(h.saver.state())?.emailByCategory.PERSONAL).toBe(true);
    expect(h.saver.state().inFlight).toBeUndefined();
    expect(h.kept).toEqual([{ emailByCategory: { PERSONAL: true } }, undefined]);
  });

  it("E7-W07 step 2: when the retry fails too, the choice stays on top, unsent (no loop of resends) and kept; the member's next change of another preference sends it with that change", async () => {
    const h = harness();
    await overlappedThenResendFails(h);
    expect(h.puts).toHaveLength(4);
    h.at(3).fail();
    await tick();
    await tick();
    expect(h.failed).toHaveLength(2);
    // No third automatic PUT and no second read.
    expect(h.puts).toHaveLength(4);
    expect(h.reads.count).toBe(1);
    expect(shownPreferences(h.saver.state())?.emailByCategory.PERSONAL).toBe(true);
    expect(h.saver.state().waiting).toBe(false);
    expect(h.kept).toEqual([{ emailByCategory: { PERSONAL: true } }]);
    h.saver.edit({ emailByCategory: { OPERATIONAL: true } });
    await tick();
    expect(h.puts[4]?.body).toEqual({ emailByCategory: { OPERATIONAL: true, PERSONAL: true } });
    h.land(h.at(4).body);
    h.at(4).ok();
    await tick();
    expect(h.kept).toEqual([{ emailByCategory: { PERSONAL: true } }, undefined]);
  });

  it("E7-W07 step 2: the member changes the same preference again after the failure — the new choice wins: the kept entry goes and the old choice is never sent again", async () => {
    const h = harness({ deferRead: true });
    await overlappedThenResendFails(h);
    // While the GET is out, the member turns PERSONAL off.
    h.saver.edit({ emailByCategory: { PERSONAL: false } });
    expect(h.kept).toEqual([{ emailByCategory: { PERSONAL: true } }, undefined]);
    h.answerRead();
    await tick();
    await tick();
    expect(h.puts.slice(3).map((put) => put.body)).toEqual([
      { emailByCategory: { PERSONAL: false } },
    ]);
    expect(shownPreferences(h.saver.state())?.emailByCategory.PERSONAL).toBe(false);
    h.land(h.at(3).body);
    h.at(3).ok();
    await tick();
    expect(h.api().emailByCategory.PERSONAL).toBe(false);
    expect(h.kept).toEqual([{ emailByCategory: { PERSONAL: true } }, undefined]);
  });

  it("E7-W07 step 2: the member leaves right after the failure — the departure carries the last choice with keepalive and keeps it fresh, so the next visit within 5 minutes shows it as a pending change before it is saved", async () => {
    vi.stubGlobal("sessionStorage", memoryStorage());
    try {
      let now = 1_000_000;
      const clock = () => now;
      const scope = { memberId: "member-laura" };
      // The page's outbox: its first departure (seq2) writes the entry at `now`, and the restored
      // page owns it (as 12 and D10 do on `pageshow`).
      const outbox = createPreferencesOutbox("outbox", scope, clock);
      const h = harness({
        onKept: (unsaved) => {
          if (unsaved === undefined) outbox.clear();
          else outbox.write(unsaved);
        },
      });
      await overlappedThenResendFails(h);
      // The GET answered false and the choice went again (seq4). Four minutes after the first
      // departure, that last PUT fails too, and the member leaves at once.
      expect(h.puts).toHaveLength(4);
      now += 4 * 60_000;
      h.at(3).fail();
      await tick();
      expect(h.failed).toHaveLength(2);
      h.saver.leave();
      expect(h.puts).toHaveLength(5);
      expect(h.puts.at(-1)).toMatchObject({
        body: { emailByCategory: { PERSONAL: true } },
        keepalive: true,
      });
      // The page is gone before that request is answered. Two minutes later, the next visit.
      now += 2 * 60_000;
      const next = harness();
      const kept = createPreferencesOutbox("outbox", scope, clock).take();
      expect(kept).toEqual({ emailByCategory: { PERSONAL: true } });
      if (kept !== undefined) next.saver.adopt(kept);
      // Shown at once as a pending change, before its PUT is even sent.
      expect(shownPreferences(next.saver.state())?.emailByCategory.PERSONAL).toBe(true);
      expect(next.saver.state().waiting).toBe(true);
      await tick();
      expect(next.puts.map((put) => put.body)).toEqual([{ emailByCategory: { PERSONAL: true } }]);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("without overlapping PUTs a failed save shows the last answer, reads nothing and frees what it took over (unchanged)", async () => {
    const h = harness();
    h.saver.adopt({ emailByCategory: { PERSONAL: false } });
    await tick();
    h.at(0).fail();
    await tick();
    expect(h.reads.count).toBe(0);
    expect(h.kept).toEqual([undefined]);
    expect(shownPreferences(h.saver.state())?.emailByCategory.PERSONAL).toBe(true);
  });
});

describe("E7-W06 (E7-W05 review #4): a restored page that was not left", () => {
  it("adopts what the outbox hands it (a newer visit's entry) instead of ignoring it: the change is saved and freed after its 2xx", async () => {
    const h = harness();
    // Left with nothing unsaved: the saver was not left.
    h.saver.leave();
    expect(h.puts).toHaveLength(0);
    h.saver.restore({ emailByCategory: { OPERATIONAL: true } });
    expect(shownPreferences(h.saver.state())?.emailByCategory.OPERATIONAL).toBe(true);
    await tick();
    expect(h.puts.map((put) => [put.body, put.keepalive])).toEqual([
      [{ emailByCategory: { OPERATIONAL: true } }, false],
    ]);
    h.land(h.at(0).body);
    h.at(0).ok();
    await tick();
    expect(h.kept).toEqual([undefined]);
  });
});

describe("E7-W05 step 6 (E7-W02 review #4): the preferences outbox belongs to one visit", () => {
  beforeEach(() => {
    vi.stubGlobal("sessionStorage", memoryStorage());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("an older visit's clear never erases what a newer visit kept; taking an entry over makes it the taker's", () => {
    const older = createPreferencesOutbox("outbox", { memberId: "member-laura" });
    const newer = createPreferencesOutbox("outbox", { memberId: "member-laura" });
    older.write({ reminderMinutesBefore: 60 });
    expect(newer.take()).toEqual({ reminderMinutesBefore: 60 });
    older.clear();
    expect(sessionStorage.getItem("outbox")).not.toBeNull();
    newer.write({ pushClubNews: false });
    older.clear();
    expect(newer.take()).toEqual({ pushClubNews: false });
    newer.clear();
    expect(sessionStorage.getItem("outbox")).toBeNull();
  });

  it("another scope's entry is ignored, and an entry older than five minutes is dropped", () => {
    let now = 1_000_000;
    const laura = createPreferencesOutbox("outbox", { memberId: "member-laura" }, () => now);
    const anna = createPreferencesOutbox("outbox", { memberId: "member-anna" }, () => now);
    laura.write({ reminderMinutesBefore: 60 });
    expect(anna.take()).toBeUndefined();
    now += PREFERENCES_OUTBOX_MAX_AGE_MS + 1;
    expect(laura.take()).toBeUndefined();
    expect(sessionStorage.getItem("outbox")).toBeNull();
  });
});
