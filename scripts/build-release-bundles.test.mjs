// REL-03: what the production bundles are built from (build-release-bundles.mjs): the committed
// release configuration only, never a mock value, an inherited one or a build outside CI. Run by
// `apps/clubs`'s `test`: node --test.
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";

import { MEMBER_PWA_FILES, parseReleaseEnv, releasePlan } from "./build-release-bundles.mjs";

const SHA = "0123456789abcdef0123456789abcdef01234567";
const CI = { GITHUB_SHA: SHA, PATH: "/usr/bin" };

let directory;
before(async () => {
  directory = await mkdtemp(path.join(tmpdir(), "build-release-bundles-"));
});
after(async () => {
  await rm(directory, { force: true, recursive: true });
});

/** A repository root with these files (`release/…`, `apps/…`). */
async function repository(name, files) {
  const root = path.join(directory, name);
  await mkdir(root, { recursive: true });
  for (const [file, contents] of Object.entries(files)) {
    await mkdir(path.dirname(path.join(root, file)), { recursive: true });
    await writeFile(path.join(root, file), contents);
  }
  return root;
}

const MEMBER_PWA = Object.fromEntries(
  MEMBER_PWA_FILES.map((file) => [`release/member-pwa/${file}`, "reviewed"]),
);

/** The release configuration of a member app with its install files (invented hosts). */
const CONFIGURED = {
  "release/clubs-admin.env": "",
  "release/clubs.env":
    '# the member app\nVITE_CLUBS_URL=https://app.example.test\nVITE_MEMBER_PWA_NAME="Club Exemple"\n',
  "release/id.env": "VITE_LEARN_ENABLED=false\n",
  ...MEMBER_PWA,
};

test("REL-03 a release .env holds VITE_* values only, never VITE_MOCK", () => {
  assert.deepEqual(
    parseReleaseEnv(
      "# comment\n\nVITE_CLUBS_URL=https://app.example.test\nVITE_MEMBER_PWA_NAME='Club Exemple'\nVITE_EMPTY=\n",
      "release/clubs.env",
    ),
    {
      problems: [],
      values: {
        VITE_CLUBS_URL: "https://app.example.test",
        VITE_EMPTY: "",
        VITE_MEMBER_PWA_NAME: "Club Exemple",
      },
    },
  );
  assert.deepEqual(
    parseReleaseEnv(
      "VITE_MOCK=1\nSTRIPE_SECRET_KEY=x\nVITE_A=1\nVITE_A=2\nexport VITE_B=1\n",
      "release/clubs.env",
    ).problems,
    [
      "release/clubs.env:1: VITE_MOCK is never part of a production bundle",
      "release/clubs.env:2: STRIPE_SECRET_KEY is not a VITE_* build value",
      "release/clubs.env:4: VITE_A is set twice",
      "release/clubs.env:5: not KEY=value",
    ],
  );
});

test("REL-03 a configured release builds each app with its own values from CI's commit", async () => {
  const root = await repository("configured", CONFIGURED);
  assert.deepEqual(releasePlan({ environment: CI, root }), {
    commit: SHA,
    memberPwa: true,
    problems: [],
    values: {
      clubs: { VITE_CLUBS_URL: "https://app.example.test", VITE_MEMBER_PWA_NAME: "Club Exemple" },
      "clubs-admin": {},
      id: { VITE_LEARN_ENABLED: "false" },
    },
  });
});

test("REL-03 no release without the committed configuration or outside CI", async () => {
  const root = await repository("empty", { "apps/clubs/package.json": "{}" });
  assert.deepEqual(releasePlan({ environment: { PATH: "/usr/bin" }, root }).problems, [
    "release/clubs.env: missing (the VITE_* values of the clubs bundle; may be empty)",
    "release/clubs-admin.env: missing (the VITE_* values of the clubs-admin bundle; may be empty)",
    "release/id.env: missing (the VITE_* values of the id bundle; may be empty)",
    "GITHUB_SHA is not a full commit id: the production bundles are CI's builds",
  ]);
});

test("REL-03 nothing but release/ reaches the build: inherited VITE_* values and app .env files are refused", async () => {
  const root = await repository("leaks", {
    ...CONFIGURED,
    "apps/clubs/.env.example": "VITE_MOCK=1\n",
    "apps/clubs/.env.local": "VITE_MOCK=1\n",
    "apps/id/.env": "VITE_LEARN_ENABLED=true\n",
  });
  assert.deepEqual(
    releasePlan({ environment: { ...CI, VITE_MOCK: "1", VITE_CLUBS_URL: "x" }, root }).problems,
    [
      "apps/clubs/.env.local: Vite would read it too; the release takes release/ only",
      "apps/id/.env: Vite would read it too; the release takes release/ only",
      "the environment sets VITE_MOCK, VITE_CLUBS_URL; the release takes release/ only",
    ],
  );
});

test("REL-03 the member app's install files go in exactly when clubs.env names the app", async () => {
  const withoutIcon = { ...CONFIGURED };
  delete withoutIcon[`release/member-pwa/${MEMBER_PWA_FILES[1]}`];
  assert.deepEqual(
    releasePlan({ environment: CI, root: await repository("no-icon", withoutIcon) }).problems,
    ["release/member-pwa/icon-192.png: missing (clubs.env sets VITE_MEMBER_PWA_NAME)"],
  );
  const unnamed = await repository("unnamed", {
    ...CONFIGURED,
    "release/clubs.env": "VITE_CLUBS_URL=https://app.example.test\n",
  });
  assert.deepEqual(releasePlan({ environment: CI, root: unnamed }).problems, [
    "release/member-pwa: present, but clubs.env does not set VITE_MEMBER_PWA_NAME",
  ]);
  const stale = await repository("stale", {
    ...CONFIGURED,
    "apps/clubs/public/pwa/icon-192.png": "old",
  });
  assert.deepEqual(releasePlan({ environment: CI, root: stale }).problems, [
    "apps/clubs/public/pwa: exists; the release copies release/member-pwa there",
  ]);
});
