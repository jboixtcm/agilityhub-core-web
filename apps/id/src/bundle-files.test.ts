// @vitest-environment node
import type { Plugin, PluginOption } from "vite";
import { describe, expect, it } from "vitest";

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
    const emitted: { fileName: string; source: string }[] = [];
    const hook = plugin.generateBundle;
    const handler = typeof hook === "function" ? hook : hook?.handler;
    (handler as ((this: unknown) => void) | undefined)?.call({
      emitFile(file: { fileName: string; source: string }) {
        emitted.push(file);
      },
    });
    expect(emitted).toEqual([
      { fileName: "robots.txt", source: "User-agent: *\nDisallow: /\n", type: "asset" },
    ]);
  });
});
