// @vitest-environment node
import type { Plugin, PluginOption } from "vite";
import { afterEach, describe, expect, it, vi } from "vitest";

import viteConfig from "../../vite.config";

import { PRIVACY_POLICY_EFFECTIVE_DATE } from "./privacy-policy";
import { privacyPolicyBuildGuard, privacyPolicyBuildProblem } from "./release-guard";

const GUARD_NAME = "privacy-policy-effective-date";

/** Runs a plugin's `buildStart` as Rollup would: `this.error` throws. */
function runBuildStart(plugin: Plugin): void {
  const hook = plugin.buildStart;
  const handler = typeof hook === "function" ? hook : hook?.handler;
  const context = {
    error(message: string): never {
      throw new Error(message);
    },
  };
  (handler as ((this: typeof context) => void) | undefined)?.call(context);
}

function flatPlugins(options: PluginOption[] | undefined): Plugin[] {
  return (options ?? []).flat(Infinity as 1).filter((item): item is Plugin => {
    return typeof item === "object" && item !== null && "name" in item;
  });
}

/** The guard among the plugins of apps/id's `vite build` (production mode). */
function productionGuard(): Plugin {
  const config = viteConfig({
    command: "build",
    isPreview: false,
    isSsrBuild: false,
    mode: "production",
  });
  const guard = flatPlugins(config.plugins).find((plugin) => plugin.name === GUARD_NAME);
  if (guard === undefined) throw new Error(`apps/id's vite.config.ts has no ${GUARD_NAME} plugin`);
  return guard;
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("PRIV-01 a production build needs the privacy policy's effective date", () => {
  it("names the unset constant and refuses a day that is not a calendar day", () => {
    expect(privacyPolicyBuildProblem(null)).toContain("PRIVACY_POLICY_EFFECTIVE_DATE");
    expect(privacyPolicyBuildProblem(null)).toContain("is unset");
    expect(privacyPolicyBuildProblem("2026-02-30")).toContain("is not a calendar day");
    expect(privacyPolicyBuildProblem("01-12-2026")).toContain("is not a calendar day");
    expect(privacyPolicyBuildProblem("2026-12-01")).toBeNull();
  });

  it("stops a build only while the date is missing, and never a mock build", () => {
    const unset = privacyPolicyBuildGuard(null, { mock: false });
    expect(unset.apply).toBe("build");
    expect(() => {
      runBuildStart(unset);
    }).toThrow(/PRIVACY_POLICY_EFFECTIVE_DATE .*is unset/u);
    expect(() => {
      runBuildStart(privacyPolicyBuildGuard("2026-12-01", { mock: false }));
    }).not.toThrow();
    expect(() => {
      runBuildStart(privacyPolicyBuildGuard(null, { mock: true }));
    }).not.toThrow();
  });

  it("is wired into apps/id's production build with the content file's date", () => {
    vi.stubEnv("VITE_MOCK", "");
    const guard = productionGuard();
    expect(guard.apply).toBe("build");
    const build = () => {
      runBuildStart(guard);
    };
    if (PRIVACY_POLICY_EFFECTIVE_DATE === null) {
      expect(build).toThrow(/is unset/u);
    } else {
      expect(build).not.toThrow();
    }
  });

  it("lets apps/id's mock build through", () => {
    vi.stubEnv("VITE_MOCK", "1");
    const guard = productionGuard();
    expect(() => {
      runBuildStart(guard);
    }).not.toThrow();
  });
});
