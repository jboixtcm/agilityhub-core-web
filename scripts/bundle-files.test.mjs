// CFG-04: the Content-Security-Policy each build emits next to its index.html (bundle-files.mjs)
// and its check on a built dist (check-bundle-files.mjs). Run by `apps/clubs`'s `test`: node --test.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  CONTENT_SECURITY_POLICY_FILE,
  contentSecurityPolicy,
  contentSecurityPolicyFor,
  contentSecurityPolicyProblems,
  inlineScriptHashes,
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

/** Runs the plugin's `generateBundle` on a bundle as Rollup would; returns the emitted files. */
function generate(bundle) {
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
  contentSecurityPolicy().generateBundle.call(context, {}, bundle);
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
  const folder = await dist("good", {
    [CONTENT_SECURITY_POLICY_FILE]: contentSecurityPolicyFor(BUILT_INDEX),
    "index.html": BUILT_INDEX,
  });
  assert.deepEqual(await checkBundleFiles(folder), []);
});

test("CFG-04 a dist without the policy, with another script's hash or a multi-line file is refused", async () => {
  assert.deepEqual(await checkBundleFiles(await dist("none", { "index.html": BUILT_INDEX })), [
    `${CONTENT_SECURITY_POLICY_FILE}: missing`,
  ]);
  const stale = await dist("stale", {
    [CONTENT_SECURITY_POLICY_FILE]: contentSecurityPolicyFor("<script>old()</script>"),
    "index.html": BUILT_INDEX,
  });
  const problems = await checkBundleFiles(stale);
  assert.equal(problems.length, 2);
  assert.match(
    problems[0] ?? "",
    /an inline script of index\.html .* is not allowed by script-src/u,
  );
  assert.match(problems[1] ?? "", /not the policy the build computes/u);
  const twoLines = await dist("two-lines", {
    [CONTENT_SECURITY_POLICY_FILE]: `${contentSecurityPolicyFor(BUILT_INDEX)}\n`,
    "index.html": BUILT_INDEX,
  });
  assert.deepEqual(await checkBundleFiles(twoLines), [
    `${CONTENT_SECURITY_POLICY_FILE}: not a single line (a header value)`,
  ]);
});
