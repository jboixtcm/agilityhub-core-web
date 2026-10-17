// E9-W05 round 2 #6 (review #4): the students' app bundle check finds a backoffice/ID namespace by
// its chunk's name and inside any other chunk. Run by `apps/clubs`'s `test`: node --test.
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";

import {
  checkClubsBundle,
  isForbiddenNamespace,
  LOCALES_DIRECTORY,
  sentinelsOf,
} from "./check-clubs-bundle.mjs";

let directory;
before(async () => {
  directory = await mkdtemp(path.join(tmpdir(), "check-clubs-bundle-"));
});
after(async () => {
  await rm(directory, { force: true, recursive: true });
});

/** A dist/assets folder with these chunks; a namespace goes in as Vite's JSON module does. */
async function assets(name, chunks) {
  const folder = path.join(directory, name);
  await mkdir(folder);
  for (const [file, contents] of Object.entries(chunks)) {
    await writeFile(path.join(folder, file), contents);
  }
  return folder;
}

async function namespaceModule(locale, namespace) {
  const json = await readFile(path.join(LOCALES_DIRECTORY, locale, `${namespace}.json`), "utf8");
  return `const e=JSON.parse(${JSON.stringify(JSON.stringify(JSON.parse(json)))});export{e as default};`;
}

test("every forbidden namespace has sentinels in ca, es and en", async () => {
  const namespaces = await sentinelsOf();
  const forbidden = namespaces.map((item) => `${item.locale}/${item.namespace}`);
  for (const locale of ["ca", "es", "en"]) {
    for (const namespace of ["admin-courses", "admin-billing", "console", "id"]) {
      assert.ok(forbidden.includes(`${locale}/${namespace}`), `${locale}/${namespace}`);
    }
  }
  assert.ok(namespaces.every((item) => isForbiddenNamespace(item.namespace)));
  assert.ok(namespaces.every((item) => item.sentinels.length > 0));
});

test("a clean bundle (the app's own namespaces only) passes", async () => {
  const folder = await assets("clean", {
    "courses-AbCdEf12.js": await namespaceModule("ca", "courses"),
    "index-Zx9_Yw-8.js": `${await namespaceModule("ca", "common")}console.log("app");`,
  });
  assert.deepEqual(await checkClubsBundle(folder), { chunks: 2, problems: [] });
});

test("a namespace chunk is refused by its name", async () => {
  const folder = await assets("by-name", {
    "admin-courses-AbCdEf12.js": "export default {};",
    "index-Zx9_Yw-8.js": 'console.log("app");',
  });
  const { problems } = await checkClubsBundle(folder);
  assert.deepEqual(problems, ["admin-courses-AbCdEf12.js: a backoffice/ID namespace chunk"]);
});

test("a namespace merged into another chunk is refused by its contents", async () => {
  const folder = await assets("merged", {
    "index-Zx9_Yw-8.js": [
      await namespaceModule("ca", "common"),
      await namespaceModule("ca", "admin-courses"),
      await namespaceModule("en", "console"),
    ].join("\n"),
  });
  const { problems } = await checkClubsBundle(folder);
  assert.equal(problems.length, 2);
  assert.match(problems[0], /^index-Zx9_Yw-8\.js: contains ca\/admin-courses\.json /u);
  assert.match(problems[1], /^index-Zx9_Yw-8\.js: contains en\/console\.json /u);
});

test("a forbidden namespace with no usable sentinel fails the check instead of weakening it", async () => {
  const locales = path.join(directory, "locales");
  await mkdir(path.join(locales, "ca"), { recursive: true });
  await writeFile(path.join(locales, "ca", "common.json"), JSON.stringify({ a: "Desa" }));
  await writeFile(path.join(locales, "ca", "id.json"), JSON.stringify({ a: "Desa", b: "D'acord" }));
  const folder = await assets("no-sentinel", { "index-Zx9_Yw-8.js": "" });
  await assert.rejects(checkClubsBundle(folder, locales), /no sentinel string for ca\/id\.json/u);
});

test("an unreadable or empty assets folder is a problem", async () => {
  assert.match(
    (await checkClubsBundle(path.join(directory, "missing"))).problems[0],
    /^cannot read /u,
  );
  const empty = await assets("empty", {});
  assert.match((await checkClubsBundle(empty)).problems[0], /^no JavaScript chunk in /u);
});
