import assert from "node:assert/strict";
import { test } from "node:test";

import { OUTBOX_QUERY, waitForOutbox } from "./wait-for-outbox.mjs";

function scenario(snapshots, options = {}) {
  let time = 0;
  let reads = 0;
  const reports = [];
  return {
    reports,
    run: () =>
      waitForOutbox({
        readSnapshot: async () => snapshots[Math.min(reads++, snapshots.length - 1)],
        report: (snapshot) => {
          reports.push(snapshot);
        },
        now: () => time,
        sleep: async (milliseconds) => {
          time += milliseconds;
        },
        ...options,
      }),
  };
}

test("waits for the seed backlog and three empty observations over two seconds", async () => {
  const run = scenario([
    { pending: 1084, failed: 0 },
    { pending: 100, failed: 0 },
    { pending: 0, failed: 0 },
  ]);
  assert.deepEqual(await run.run(), { elapsedMs: 4000, emptySamples: 3 });
  assert.equal(run.reports.length, 5);
});

test("a child event appearing after an empty observation resets the stability window", async () => {
  const run = scenario([
    { pending: 0, failed: 0 },
    { pending: 0, failed: 0 },
    { pending: 1, failed: 0 },
    { pending: 0, failed: 0 },
  ]);
  assert.deepEqual(await run.run(), { elapsedMs: 5000, emptySamples: 3 });
});

test("a failed consumer stops readiness immediately instead of hiding it", async () => {
  const run = scenario([{ pending: 0, failed: 1 }]);
  await assert.rejects(run.run(), /contains 1 failed events/u);
  assert.equal(run.reports.length, 1);
});

test("a leased or retrying event cannot make readiness pass and the wait is bounded", async () => {
  const run = scenario([{ pending: 1, failed: 0 }], { timeoutMs: 3000 });
  await assert.rejects(run.run(), /did not drain within 3000 ms/u);
  assert.deepEqual(
    run.reports.map((row) => row.elapsedMs),
    [0, 1000, 2000],
  );
  assert.doesNotMatch(OUTBOX_QUERY, /nextAttemptAt/u);
  assert.match(OUTBOX_QUERY, /"PENDING", "FAILED"/u);
});

test("a slow read cannot declare success after the overall deadline", async () => {
  let time = 0;
  await assert.rejects(
    waitForOutbox({
      readSnapshot: async () => {
        time += 1500;
        return { pending: 0, failed: 0 };
      },
      now: () => time,
      sleep: async (milliseconds) => {
        time += milliseconds;
      },
      timeoutMs: 4000,
    }),
    /did not drain within 4000 ms/u,
  );
});

test("malformed or unavailable counts fail rather than becoming an empty queue", async () => {
  for (const snapshot of [{}, { pending: -1, failed: 0 }, { pending: 0, failed: null }]) {
    await assert.rejects(scenario([snapshot]).run(), /Invalid outbox readiness counts/u);
  }
  await assert.rejects(
    waitForOutbox({ readSnapshot: async () => Promise.reject(new Error("Unavailable")) }),
    /Unavailable/u,
  );
});
