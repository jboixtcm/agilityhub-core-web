// Types of bundle-files.mjs for the TypeScript that imports it (the three apps' vite.config.ts).

/** A Vite build plugin, structurally (the `vite` types do not resolve from this folder). */
export interface BundleFilePlugin {
  apply: "build";
  enforce: "post";
  name: string;
  generateBundle(...args: never[]): void;
}

export declare const CONTENT_SECURITY_POLICY_FILE: string;
export declare const CONTENT_SECURITY_POLICY: readonly (readonly string[])[];

export declare function inlineScripts(html: string): string[];
export declare function scriptHash(text: string): string;
export declare function inlineScriptHashes(html: string): string[];
export declare function inlineEventHandlers(html: string): string[];
export declare function contentSecurityPolicyFor(html: string): string;
export declare function policyDirectives(policy: string): Map<string, string[]>;
export declare function contentSecurityPolicyProblems(policy: string, html: string): string[];

/** CFG-04: emits `content-security-policy.txt` next to the built `index.html`. */
export declare function contentSecurityPolicy(): BundleFilePlugin;

export declare const ROBOTS_FILE: string;
export declare const ROBOTS_TXT: string;

/** CFG-05: emits `robots.txt` (`Disallow: /`) into the bundle. */
export declare function robotsTxt(): BundleFilePlugin;

export declare const VERSION_FILE: string;

/** REL-02: the commit a build comes from: CI's `GITHUB_SHA`, else `null`. */
export declare function buildCommit(
  environment?: Record<string, string | undefined>,
): string | null;
export declare function versionFileProblem(body: string): string | null;

/** REL-02: emits `version.json` with the app's version and the build's commit. */
export declare function versionJson(
  packageJson: string | URL,
  environment?: Record<string, string | undefined>,
): BundleFilePlugin;
