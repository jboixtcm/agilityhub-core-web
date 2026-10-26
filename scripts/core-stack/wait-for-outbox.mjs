import { execFile } from "node:child_process";
import { appendFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

const execute = promisify(execFile);

// Count every pending event, including leased and future-retry records. Filtering by
// nextAttemptAt would mistake an in-flight parent for a drained seed before it emits children.
export const OUTBOX_QUERY = `
const counts = db.domain_events.aggregate([
  {$match: {status: {$in: ["PENDING", "FAILED"]}}},
  {$group: {_id: {status: "$status", type: "$type"}, count: {$sum: 1}}}
]).toArray();
print(JSON.stringify({
  pending: counts.filter(row => row._id.status === "PENDING").reduce((sum, row) => sum + row.count, 0),
  failed: counts.filter(row => row._id.status === "FAILED").reduce((sum, row) => sum + row.count, 0),
  byType: counts.map(row => ({status: row._id.status, type: row._id.type, count: row.count}))
}));`;

/** Wait for seeded events and their descendants, without relaxing any browser assertion. */
export async function waitForOutbox({
  readSnapshot,
  report = () => {},
  now = () => performance.now(),
  sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
  timeoutMs = 180_000,
  intervalMs = 1000,
}) {
  const started = now();
  let emptySince;
  let emptySamples = 0;
  while (now() - started < timeoutMs) {
    const remainingMs = timeoutMs - (now() - started);
    const snapshot = await readSnapshot(remainingMs);
    if (
      !Number.isSafeInteger(snapshot.pending) ||
      snapshot.pending < 0 ||
      !Number.isSafeInteger(snapshot.failed) ||
      snapshot.failed < 0
    ) {
      throw new Error("Invalid outbox readiness counts");
    }
    const elapsedMs = Math.round(now() - started);
    await report({ elapsedMs, ...snapshot });
    if (snapshot.failed > 0) {
      throw new Error(`Seed outbox contains ${String(snapshot.failed)} failed events`);
    }
    if (elapsedMs >= timeoutMs) break;
    if (snapshot.pending === 0) {
      emptySince ??= now();
      emptySamples += 1;
      if (emptySamples >= 3 && now() - emptySince >= 2000) return { elapsedMs, emptySamples };
    } else {
      emptySince = undefined;
      emptySamples = 0;
    }
    await sleep(Math.min(intervalMs, timeoutMs - (now() - started)));
  }
  throw new Error(`Seed outbox did not drain within ${String(timeoutMs)} ms`);
}

async function main() {
  const [composeFile, evidenceFile] = process.argv.slice(2);
  if (!composeFile || !evidenceFile) {
    throw new Error("Usage: wait-for-outbox.mjs <compose-file> <evidence-jsonl>");
  }
  // The caller has already waited for the seed, activation and Core health. This read-only
  // barrier never deletes events, changes their timestamps, or disables application jobs.
  const result = await waitForOutbox({
    readSnapshot: async (remainingMs) => {
      let stdout;
      try {
        ({ stdout } = await execute(
          "docker",
          [
            "compose",
            "-f",
            composeFile,
            "exec",
            "-T",
            "mongo",
            "mongosh",
            "--quiet",
            "mongodb://localhost:27017/agilityhub_e1_web",
            "--eval",
            OUTBOX_QUERY,
          ],
          { timeout: Math.max(1, Math.min(5000, remainingMs)), maxBuffer: 1024 * 1024 },
        ));
      } catch {
        throw new Error("Could not read seed outbox readiness counts");
      }
      return JSON.parse(stdout);
    },
    report: async (snapshot) => {
      await appendFile(evidenceFile, `${JSON.stringify(snapshot)}\n`);
    },
  });
  console.log(`Seed outbox drained and stable after ${String(result.elapsedMs)} ms`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : "Seed outbox readiness failed");
    process.exitCode = 1;
  });
}
