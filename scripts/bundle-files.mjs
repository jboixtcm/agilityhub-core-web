// Files every production bundle of the three SPAs carries, emitted by the app's own `vite build`
// (the `plugins` of apps/clubs, apps/clubs-admin and apps/id `vite.config.ts`), so they always
// describe the bundle they are in. `scripts/check-bundle-files.mjs` checks them on a built `dist`.
//
// CFG-04 `content-security-policy.txt`: the Content-Security-Policy header value the server (Caddy)
// sends with the bundle's static answers, one line. It is computed from the built `index.html`:
// `script-src` allows the hash of every inline script that file carries (the cached-branding boot
// script of apps/clubs and apps/clubs-admin), so the policy and the script cannot drift.
//
// CFG-05 `robots.txt`: `Disallow: /` for every robot. Each host (the product hosts, the identity
// host and every club alias) serves one of the three bundles, so each answers its own robots.txt.
//
// REL-02 `version.json`: `{"version", "commit"}`, the version of the app's `package.json` and the
// git commit the bundle was built from (`GITHUB_SHA` in CI; `null` elsewhere, where the tree may
// differ from any commit), so a deployed bundle names its source.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

export const CONTENT_SECURITY_POLICY_FILE = "content-security-policy.txt";

/**
 * The policy of the three SPAs, directive by directive; `script-src` also gets the bundle's inline
 * script hashes. Everything is the host's own origin (the api is proxied under each SPA host and
 * its signed file URLs are relative paths). `style-src 'unsafe-inline'`: the admin's e-mail preview
 * (an `<iframe srcdoc>`, which inherits this policy) is styled by `style` attributes. `img-src`
 * `data:` and `blob:`: local previews of a chosen file and the 3D viewer's embedded textures.
 * `object-src`, `base-uri`, `form-action` and `frame-ancestors` as the api's own answers.
 */
export const CONTENT_SECURITY_POLICY = Object.freeze([
  Object.freeze(["default-src", "'self'"]),
  Object.freeze(["script-src", "'self'"]),
  Object.freeze(["style-src", "'self'", "'unsafe-inline'"]),
  Object.freeze(["img-src", "'self'", "data:", "blob:"]),
  Object.freeze(["object-src", "'none'"]),
  Object.freeze(["base-uri", "'self'"]),
  Object.freeze(["form-action", "'self'"]),
  Object.freeze(["frame-ancestors", "'none'"]),
]);

const SCRIPT_ELEMENT = /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/giu;
const SRC_ATTRIBUTE = /(?:^|\s)src\s*=/iu;
// An attribute `on…=` inside a start tag (`<body onload="…">`): no policy with hashes allows it.
const EVENT_HANDLER_ATTRIBUTE = /<[a-z][^>]*\son[a-z]+\s*=/giu;

/** The text of every inline `<script>` (no `src`) of an HTML document, exactly as written. */
export function inlineScripts(html) {
  return [...html.matchAll(SCRIPT_ELEMENT)]
    .filter((match) => !SRC_ATTRIBUTE.test(match[1] ?? ""))
    .map((match) => match[2] ?? "");
}

/** A CSP hash source (`'sha256-<base64>'`) of a script's text, as a browser computes it. */
export function scriptHash(text) {
  return `'sha256-${createHash("sha256").update(text, "utf8").digest("base64")}'`;
}

/** The hash sources of an HTML document's inline scripts, in document order, without repeats. */
export function inlineScriptHashes(html) {
  return [...new Set(inlineScripts(html).map(scriptHash))];
}

/** The start tags of an HTML document (outside its scripts) that carry an inline event handler. */
export function inlineEventHandlers(html) {
  const markup = html.replaceAll(SCRIPT_ELEMENT, "<script></script>");
  return [...markup.matchAll(EVENT_HANDLER_ATTRIBUTE)].map((match) => match[0]);
}

/** The Content-Security-Policy header value of a bundle whose `index.html` is `html`. */
export function contentSecurityPolicyFor(html) {
  const hashes = inlineScriptHashes(html);
  return CONTENT_SECURITY_POLICY.map(([directive, ...sources]) =>
    [directive, ...sources, ...(directive === "script-src" ? hashes : [])].join(" "),
  ).join("; ");
}

/** The source sets of a policy's directives (`script-src` → its sources). */
export function policyDirectives(policy) {
  return new Map(
    policy
      .split(";")
      .map((part) => part.trim().split(/\s+/u))
      .filter((tokens) => tokens[0] !== undefined && tokens[0] !== "")
      .map(([directive, ...sources]) => [directive.toLowerCase(), sources]),
  );
}

/**
 * Why `policy` does not fit the bundle whose `index.html` is `html`: an inline script whose hash
 * its `script-src` does not allow, or an inline event handler (never allowed). Empty when it fits.
 */
export function contentSecurityPolicyProblems(policy, html) {
  const scriptSources = policyDirectives(policy).get("script-src") ?? [];
  const problems = inlineScriptHashes(html)
    .filter((hash) => !scriptSources.includes(hash))
    .map((hash) => `an inline script of index.html (${hash}) is not allowed by script-src`);
  for (const tag of inlineEventHandlers(html)) {
    problems.push(`index.html has an inline event handler, which the policy blocks: ${tag}`);
  }
  return problems;
}

function assetText(asset) {
  return typeof asset.source === "string" ? asset.source : new TextDecoder().decode(asset.source);
}

/**
 * CFG-04: emits `content-security-policy.txt` next to the built `index.html` (a post plugin, so
 * the HTML is final). Refuses an `index.html` with an inline event handler.
 */
export function contentSecurityPolicy() {
  return {
    apply: "build",
    enforce: "post",
    generateBundle(_options, bundle) {
      const index = bundle["index.html"];
      if (index?.type !== "asset") {
        this.error(
          "CFG-04: the build has no index.html to compute its Content-Security-Policy from",
        );
      }
      const html = assetText(index);
      const handlers = inlineEventHandlers(html);
      if (handlers.length > 0) {
        this.error(
          `CFG-04: index.html has an inline event handler, which the policy blocks: ${handlers[0]}`,
        );
      }
      this.emitFile({
        fileName: CONTENT_SECURITY_POLICY_FILE,
        source: contentSecurityPolicyFor(html),
        type: "asset",
      });
    },
    name: "content-security-policy",
  };
}

export const ROBOTS_FILE = "robots.txt";

/** CFG-05: no robot may crawl any path of any host. */
export const ROBOTS_TXT = "User-agent: *\nDisallow: /\n";

/** CFG-05: emits `robots.txt` (`Disallow: /`) into the bundle. */
export function robotsTxt() {
  return {
    apply: "build",
    enforce: "post",
    generateBundle() {
      this.emitFile({ fileName: ROBOTS_FILE, source: ROBOTS_TXT, type: "asset" });
    },
    name: "robots-txt",
  };
}

export const VERSION_FILE = "version.json";

const SEMANTIC_VERSION = /^\d+\.\d+\.\d+$/u;
const COMMIT = /^[0-9a-f]{40}$/u;

/** REL-02: the commit a build comes from: CI's `GITHUB_SHA` (a full lowercase SHA-1), else `null`. */
export function buildCommit(environment = process.env) {
  const sha = environment.GITHUB_SHA?.trim().toLowerCase() ?? "";
  return COMMIT.test(sha) ? sha : null;
}

/** REL-02: why a `version.json` body is not `{"version": "x.y.z", "commit": <sha> | null}`. */
export function versionFileProblem(body) {
  let value;
  try {
    value = JSON.parse(body);
  } catch {
    return "not JSON";
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) return "not an object";
  const keys = Object.keys(value).sort().join(",");
  if (keys !== "commit,version") return `has the keys «${keys}», not «commit,version»`;
  if (typeof value.version !== "string" || !SEMANTIC_VERSION.test(value.version)) {
    return `version «${String(value.version)}» is not x.y.z`;
  }
  if (value.commit !== null && (typeof value.commit !== "string" || !COMMIT.test(value.commit))) {
    return `commit «${String(value.commit)}» is neither a full commit id nor null`;
  }
  return null;
}

/**
 * REL-02: emits `version.json` with the version of the app's `package.json` (`packageJson`, its
 * path or file URL) and the build's commit (`buildCommit`).
 */
export function versionJson(packageJson, environment = process.env) {
  return {
    apply: "build",
    enforce: "post",
    generateBundle() {
      const { version } = JSON.parse(readFileSync(packageJson, "utf8"));
      if (typeof version !== "string" || !SEMANTIC_VERSION.test(version)) {
        this.error(`REL-02: the app's package.json version «${String(version)}» is not x.y.z`);
      }
      this.emitFile({
        fileName: VERSION_FILE,
        source: `${JSON.stringify({ version, commit: buildCommit(environment) })}\n`,
        type: "asset",
      });
    },
    name: "version-json",
  };
}
