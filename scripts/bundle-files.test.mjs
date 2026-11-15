// The files each build emits next to its index.html (bundle-files.mjs) and their check on a built
// dist (check-bundle-files.mjs): CFG-04 the Content-Security-Policy, CFG-05 robots.txt, REL-02
// version.json and the one version of the web workspaces. Run by `apps/clubs`'s `test`: node --test.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  buildCommit,
  CONTENT_SECURITY_POLICY_FILE,
  contentSecurityPolicy,
  contentSecurityPolicyFor,
  contentSecurityPolicyProblems,
  inlineScriptHashes,
  ROBOTS_FILE,
  ROBOTS_TXT,
  robotsTxt,
  VERSION_FILE,
  versionJson,
} from "./bundle-files.mjs";
import { checkBundleFiles } from "./check-bundle-files.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** The text between the first classic `<script>` and its `</script>`, found without a regex. */
function bootScript(html) {
  const start = html.indexOf("<script>") + "<script>".length;
  return html.slice(start, html.indexOf("</script>", start));
}

/** A browser's CSP hash source of a script's text: base64 of its UTF-8 bytes' SHA-256. */
function browserHash(text) {
  return `'sha256-${createHash("sha256").update(Buffer.from(text, "utf8")).digest("base64")}'`;
}

/** Runs a plugin's `generateBundle` on a bundle as Rollup would; returns the emitted files. */
function generate(bundle, plugin = contentSecurityPolicy()) {
  const emitted = [];
  const context = {
    emitFile(file) {
      emitted.push(file);
      return file.fileName;
    },
    error(message) {
      throw new Error(message);
    },
  };
  plugin.generateBundle.call(context, {}, bundle);
  return emitted;
}

const BUILT_INDEX = `<!doctype html><html><head><script>
  document.documentElement.dataset.theme = "dark";
</script><script type="module" crossorigin src="/assets/index-AbCdEf12.js"></script></head><body><div id="root"></div></body></html>`;

let directory;
before(async () => {
  directory = await mkdtemp(path.join(tmpdir(), "bundle-files-"));
});
after(async () => {
  await rm(directory, { force: true, recursive: true });
});

/** The files a build writes for BUILT_INDEX, with `files` replacing or removing (`null`) some. */
function built(files = {}) {
  const all = {
    [CONTENT_SECURITY_POLICY_FILE]: contentSecurityPolicyFor(BUILT_INDEX),
    "index.html": BUILT_INDEX,
    [ROBOTS_FILE]: ROBOTS_TXT,
    [VERSION_FILE]: '{"version":"1.0.0","commit":null}\n',
    ...files,
  };
  return Object.fromEntries(Object.entries(all).filter(([, contents]) => contents !== null));
}

async function dist(name, files) {
  const folder = path.join(directory, name);
  await mkdir(folder, { recursive: true });
  for (const [file, contents] of Object.entries(files)) {
    await writeFile(path.join(folder, file), contents);
  }
  return folder;
}

test("CFG-04 the policy allows each inline script by its hash, never a module script's source", () => {
  assert.deepEqual(inlineScriptHashes(BUILT_INDEX), [browserHash(bootScript(BUILT_INDEX))]);
  assert.equal(
    contentSecurityPolicyFor(BUILT_INDEX),
    "default-src 'self'; " +
      `script-src 'self' ${browserHash(bootScript(BUILT_INDEX))}; ` +
      "style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; object-src 'none'; " +
      "base-uri 'self'; form-action 'self'; frame-ancestors 'none'",
  );
  // apps/id's index.html has no inline script: 'self' alone.
  assert.match(
    contentSecurityPolicyFor('<script type="module" src="/assets/index-AbCdEf12.js"></script>'),
    /script-src 'self'; style-src/u,
  );
});

test("CFG-04 the boot script of apps/clubs and apps/clubs-admin is allowed by the policy their build computes, and an edit of it is not", async () => {
  for (const app of ["clubs", "clubs-admin"]) {
    const html = await readFile(path.join(root, "apps", app, "index.html"), "utf8");
    const script = bootScript(html);
    assert.match(script, /agilityhub\.branding/u, `${app}: the cached-branding boot script`);
    const [file] = generate({ "index.html": { source: html, type: "asset" } });
    assert.equal(file.fileName, CONTENT_SECURITY_POLICY_FILE);
    assert.ok(file.source.includes(browserHash(script)), `${app}: the boot script's hash`);
    assert.deepEqual(contentSecurityPolicyProblems(file.source, html), []);
    // The script changes and the old policy no longer allows it: the policy must come from the build.
    const edited = html.replace(script, script.replace("return;", "return undefined;"));
    assert.notEqual(edited, html);
    assert.equal(contentSecurityPolicyProblems(file.source, edited).length, 1);
  }
});

test("CFG-04 the build stops without an index.html or with an inline event handler", () => {
  assert.throws(() => generate({}), /no index\.html/u);
  assert.throws(
    () =>
      generate({
        "index.html": {
          source: '<body onload="boot()"><div id="root"></div></body>',
          type: "asset",
        },
      }),
    /inline event handler.*onload/u,
  );
  // A handler-like text inside a script is not an attribute.
  assert.equal(
    generate({
      "index.html": { source: "<script>if (a<b && x.onclick= 1) {}</script>", type: "asset" },
    }).length,
    1,
  );
});

test("CFG-04 a built dist passes with the policy its build emitted", async () => {
  assert.deepEqual(await checkBundleFiles(await dist("good", built())), []);
});

test("CFG-04 a dist without the policy, with another script's hash or a multi-line file is refused", async () => {
  assert.deepEqual(
    await checkBundleFiles(await dist("none", built({ [CONTENT_SECURITY_POLICY_FILE]: null }))),
    [`${CONTENT_SECURITY_POLICY_FILE}: missing`],
  );
  const stale = await dist(
    "stale",
    built({ [CONTENT_SECURITY_POLICY_FILE]: contentSecurityPolicyFor("<script>old()</script>") }),
  );
  const problems = await checkBundleFiles(stale);
  assert.equal(problems.length, 2);
  assert.match(
    problems[0] ?? "",
    /an inline script of index\.html .* is not allowed by script-src/u,
  );
  assert.match(problems[1] ?? "", /not the policy the build computes/u);
  const twoLines = await dist(
    "two-lines",
    built({ [CONTENT_SECURITY_POLICY_FILE]: `${contentSecurityPolicyFor(BUILT_INDEX)}\n` }),
  );
  assert.deepEqual(await checkBundleFiles(twoLines), [
    `${CONTENT_SECURITY_POLICY_FILE}: not a single line (a header value)`,
  ]);
});

test("CFG-05 every build writes a robots.txt that disallows every path to every robot", () => {
  assert.equal(ROBOTS_TXT, "User-agent: *\nDisallow: /\n");
  assert.deepEqual(generate({}, robotsTxt()), [
    { fileName: "robots.txt", source: "User-agent: *\nDisallow: /\n", type: "asset" },
  ]);
});

test("CFG-05 a dist without robots.txt, or with one that lets a robot in, is refused", async () => {
  assert.deepEqual(
    await checkBundleFiles(await dist("no-robots", built({ [ROBOTS_FILE]: null }))),
    [`${ROBOTS_FILE}: missing`],
  );
  assert.deepEqual(
    await checkBundleFiles(
      await dist("open-robots", built({ [ROBOTS_FILE]: "User-agent: *\nDisallow:\n" })),
    ),
    [`${ROBOTS_FILE}: not «Disallow: /» for every robot`],
  );
});

const SHA = "0123456789abcdef0123456789abcdef01234567";

test("REL-02 the build's commit is CI's GITHUB_SHA, and null without a full commit id", () => {
  assert.equal(buildCommit({ GITHUB_SHA: SHA }), SHA);
  assert.equal(buildCommit({ GITHUB_SHA: ` ${SHA.toUpperCase()}\n` }), SHA);
  assert.equal(buildCommit({}), null);
  assert.equal(buildCommit({ GITHUB_SHA: "0123456" }), null);
  assert.equal(buildCommit({ GITHUB_SHA: `${SHA}-dirty` }), null);
});

test("REL-02 every build writes version.json with its package.json version and its commit", async () => {
  const folder = await dist("app", { "package.json": '{"name":"app","version":"1.2.3"}' });
  const packageJson = path.join(folder, "package.json");
  assert.deepEqual(generate({}, versionJson(packageJson, { GITHUB_SHA: SHA })), [
    { fileName: "version.json", source: `{"version":"1.2.3","commit":"${SHA}"}\n`, type: "asset" },
  ]);
  assert.deepEqual(generate({}, versionJson(packageJson, {})), [
    { fileName: "version.json", source: '{"version":"1.2.3","commit":null}\n', type: "asset" },
  ]);
  await writeFile(packageJson, '{"name":"app"}');
  assert.throws(
    () => generate({}, versionJson(packageJson, {})),
    /version «undefined» is not x\.y\.z/u,
  );
});

test("REL-02 a dist without version.json, or with another shape, is refused", async () => {
  const refused = async (name, body) =>
    checkBundleFiles(await dist(name, built({ [VERSION_FILE]: body })));
  assert.deepEqual(await refused("no-version", null), [`${VERSION_FILE}: missing`]);
  assert.deepEqual(await refused("ci-version", `{"version":"1.0.0","commit":"${SHA}"}`), []);
  assert.deepEqual(await refused("not-json", "1.0.0"), [`${VERSION_FILE}: not JSON`]);
  assert.deepEqual(await refused("short-commit", '{"version":"1.0.0","commit":"0123456"}'), [
    `${VERSION_FILE}: commit «0123456» is neither a full commit id nor null`,
  ]);
  assert.deepEqual(await refused("snapshot", '{"version":"1.0.0-SNAPSHOT","commit":null}'), [
    `${VERSION_FILE}: version «1.0.0-SNAPSHOT» is not x.y.z`,
  ]);
  assert.deepEqual(await refused("extra-key", '{"version":"1.0.0","commit":null,"date":"x"}'), [
    `${VERSION_FILE}: has the keys «commit,date,version», not «commit,version»`,
  ]);
});

test("REL-02 the web workspaces share one real version", async () => {
  const manifests = ["package.json"];
  for (const folder of ["apps", "packages"]) {
    for (const entry of await readdir(path.join(root, folder), { withFileTypes: true })) {
      if (entry.isDirectory()) manifests.push(path.join(folder, entry.name, "package.json"));
    }
  }
  const versions = new Map();
  for (const manifest of manifests) {
    const { version } = JSON.parse(await readFile(path.join(root, manifest), "utf8"));
    versions.set(manifest, version);
  }
  assert.ok(versions.size >= 12, `the root, three apps and the packages: ${[...versions.keys()]}`);
  assert.deepEqual(
    new Set(versions.values()).size,
    1,
    JSON.stringify(Object.fromEntries(versions)),
  );
  const [version] = versions.values();
  assert.match(version, /^[1-9]\d*\.\d+\.\d+$/u, "a release version, not 0.x");
});
