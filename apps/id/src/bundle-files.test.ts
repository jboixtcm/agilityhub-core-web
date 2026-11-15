// @vitest-environment node
import type { Plugin, PluginOption } from "vite";
import { afterEach, describe, expect, it, vi } from "vitest";

import packageJson from "../package.json";
import viteConfig from "../vite.config";

function flatPlugins(options: PluginOption[] | undefined): Plugin[] {
  return (options ?? []).flat(Infinity as 1).filter((item): item is Plugin => {
    return typeof item === "object" && item !== null && "name" in item;
  });
}

/** The plugins of this app's `vite build` (production mode). */
function productionPlugins(): Plugin[] {
  const config = viteConfig({
    command: "build",
    isPreview: false,
    isSsrBuild: false,
    mode: "production",
  });
  return flatPlugins(config.plugins);
}

/** One of this app's build plugins, by name. */
function buildPlugin(name: string): Plugin {
  const plugin = productionPlugins().find((item) => item.name === name);
  if (plugin === undefined) throw new Error(`vite.config.ts has no ${name} plugin`);
  return plugin;
}

/** Runs a build plugin's `generateBundle`; returns the files it emits. */
function emittedBy(plugin: Plugin): unknown[] {
  const emitted: unknown[] = [];
  const hook = plugin.generateBundle;
  const handler = typeof hook === "function" ? hook : hook?.handler;
  (handler as ((this: unknown) => void) | undefined)?.call({
    emitFile(file: unknown) {
      emitted.push(file);
    },
    error(message: string): never {
      throw new Error(message);
    },
  });
  return emitted;
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("the files this app's bundle carries (scripts/bundle-files.mjs)", () => {
  it("CFG-04 emits the Content-Security-Policy of its built index.html", () => {
    const plugin = buildPlugin("content-security-policy");
    expect(plugin.apply).toBe("build");
    // After Vite's HTML plugin, so the policy is computed from the final index.html.
    expect(plugin.enforce).toBe("post");
  });

  it("CFG-05 emits a robots.txt that disallows every path to every robot", () => {
    const plugin = buildPlugin("robots-txt");
    expect(plugin.apply).toBe("build");
    expect(emittedBy(plugin)).toEqual([
      { fileName: "robots.txt", source: "User-agent: *\nDisallow: /\n", type: "asset" },
    ]);
  });

  it("REL-02 emits version.json with this app's version and the commit CI builds", () => {
    const { version } = packageJson;
    const sha = "89abcdef0123456789abcdef0123456789abcdef";
    vi.stubEnv("GITHUB_SHA", sha);
    const plugin = buildPlugin("version-json");
    expect(plugin.apply).toBe("build");
    expect(emittedBy(plugin)).toEqual([
      {
        fileName: "version.json",
        source: `{"version":"${version}","commit":"${sha}"}\n`,
        type: "asset",
      },
    ]);
    vi.stubEnv("GITHUB_SHA", "");
    expect(emittedBy(plugin)).toEqual([
      {
        fileName: "version.json",
        source: `{"version":"${version}","commit":null}\n`,
        type: "asset",
      },
    ]);
  });
});
