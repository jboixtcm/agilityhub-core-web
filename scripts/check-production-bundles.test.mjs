// FE-05: the production bundle check refuses MSW's worker and the mock world's sentinels in every
// text file of a built `dist` folder, at any depth. Run by `apps/clubs`'s `test`: node --test.
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";

import { checkProductionBundle, SENTINELS } from "./check-production-bundles.mjs";

let directory;
before(async () => {
  directory = await mkdtemp(path.join(tmpdir(), "check-production-bundles-"));
});
after(async () => {
  await rm(directory, { force: true, recursive: true });
});

/** A dist folder with these files (`assets/…` creates the subfolder). */
async function dist(name, files) {
  const folder = path.join(directory, name);
  for (const [file, contents] of Object.entries(files)) {
    await mkdir(path.dirname(path.join(folder, file)), { recursive: true });
    await writeFile(path.join(folder, file), contents);
  }
  return folder;
}

test("a clean build passes", async () => {
  const folder = await dist("clean", {
    "assets/index-AbCdEf12.js": 'console.log("app");',
    "index.html": '<script type="module" src="/assets/index-AbCdEf12.js"></script>',
    "sw.js": "self.addEventListener('push',()=>{});",
  });
  assert.deepEqual(await checkProductionBundle(folder), { files: 3, problems: [] });
});

test("each sentinel is refused in a chunk, at any depth", async () => {
  for (const [index, sentinel] of SENTINELS.entries()) {
    const folder = await dist(`sentinel-${index}`, {
      "assets/index-AbCdEf12.js": `const e={url:"https://club.${sentinel}/x"};`,
      "index.html": "<div id=root></div>",
    });
    assert.deepEqual(await checkProductionBundle(folder), {
      files: 2,
      problems: [`${path.join("assets", "index-AbCdEf12.js")}: contains «${sentinel}»`],
    });
  }
});

test("MSW's worker file is refused by its name, and its contents too", async () => {
  const folder = await dist("worker", {
    "index.html": "<div id=root></div>",
    "mockServiceWorker.js": "/* Mock Service Worker */ self.mockServiceWorker = true;",
  });
  assert.deepEqual((await checkProductionBundle(folder)).problems, [
    "mockServiceWorker.js: MSW's worker file",
    "mockServiceWorker.js: contains «mockServiceWorker»",
  ]);
});

test("binary assets are not searched", async () => {
  const folder = await dist("binary", {
    "index.html": "<div id=root></div>",
    "obstacle-models/jump.fbx": "example.test",
  });
  assert.deepEqual(await checkProductionBundle(folder), { files: 2, problems: [] });
});

test("a missing or empty folder is a problem, never a pass", async () => {
  const missing = path.join(directory, "missing");
  const { problems } = await checkProductionBundle(missing);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /^cannot read .*missing \(ENOENT\)$/u);
  const empty = path.join(directory, "empty");
  await mkdir(empty);
  assert.deepEqual(await checkProductionBundle(empty), {
    files: 0,
    problems: [`no file in ${empty}`],
  });
});
