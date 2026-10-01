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
 * its `GET` (`read`) answers at once with what the api holds.
 */
function harness() {
  const puts: Put[] = [];
  let api: NotificationPreferences = PREFERENCES;
  const kept: (PreferencesPatch | undefined)[] = [];
  const failed: unknown[] = [];
  const reads = { count: 0 };
  const saver = createPreferencesSaver(
    {
      changed: () => undefined,
      failed: (cause) => failed.push(cause),
      kept: (unsaved) => kept.push(unsaved),
      read: () => {
        reads.count += 1;
        return Promise.resolve(api);
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
  return { api: () => api, at, failed, kept, land, puts, reads, saver };
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

describe("E7-W06 step 4 (E7-W05 review #1): a failed save after a restore whose departure overlapped", () => {
  it("seq1 {false} out, seq2 {true} with keepalive, restored before either settles, seq1 lands after seq2, the resend seq3 and the adopted save seq4 fail — the page reads the api again (GET) and shows false, and the outbox keeps the latest choice", async () => {
    const h = harness();
    await offOnLeave(h);
    // Back from the back-forward cache before either PUT settled: the departure's entry is adopted.
    h.saver.restore({ emailByCategory: { PERSONAL: true } });
    await tick();
    expect(h.puts).toHaveLength(2);
    // seq2 lands and answers first; seq1 lands after it, so the api holds false.
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
    expect(h.puts[3]).toMatchObject({
      body: { emailByCategory: { PERSONAL: true } },
      keepalive: false,
    });
    h.at(3).fail();
    await tick();
    expect(h.failed).toHaveLength(2);
    // Not the last answer (seq2's true): what the api holds, read again.
    expect(h.reads.count).toBe(1);
    expect(shownPreferences(h.saver.state())?.emailByCategory.PERSONAL).toBe(false);
    // The latest choice never got a 2xx: it stays kept for the next visit.
    expect(h.kept).toEqual([{ emailByCategory: { PERSONAL: true } }]);
    // The member chooses true again and that save gets its 2xx: only now is the entry freed.
    h.saver.edit({ emailByCategory: { PERSONAL: true } });
    await tick();
    expect(h.puts).toHaveLength(5);
    h.land(h.at(4).body);
    h.at(4).ok();
    await tick();
    expect(shownPreferences(h.saver.state())?.emailByCategory.PERSONAL).toBe(true);
    expect(h.kept).toEqual([{ emailByCategory: { PERSONAL: true } }, undefined]);
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
