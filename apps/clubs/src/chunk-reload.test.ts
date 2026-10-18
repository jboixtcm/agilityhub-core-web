import { afterEach, describe, expect, it, vi } from "vitest";

import { isChunkLoadError, reloadOnce } from "./chunk-reload";

afterEach(() => {
  sessionStorage.clear();
  vi.useRealTimers();
});

describe("E11-W02 round 2 (review #4): a chunk that cannot load reloads the document once", () => {
  it.each([
    "Failed to fetch dynamically imported module: https://club.example/assets/screens-a1.js",
    "Importing a module script failed.",
    "error loading dynamically imported module: https://club.example/assets/screens-a1.js",
    "Unable to preload CSS for /assets/screens-a1.css",
  ])("«%s» is a chunk-load error", (message) => {
    expect(isChunkLoadError(new TypeError(message))).toBe(true);
  });

  it("a loader's error that wraps one (its `cause`) is one too", () => {
    const missing = new TypeError("Failed to fetch dynamically imported module: /assets/a1.js");
    expect(isChunkLoadError(new Error("Could not load the module", { cause: missing }))).toBe(true);
  });

  it("an error of the screen itself is not", () => {
    expect(isChunkLoadError(new TypeError("Cannot read properties of undefined"))).toBe(false);
    expect(isChunkLoadError("Failed to fetch dynamically imported module")).toBe(false);
  });

  it("reloads the first time, and not again within a minute (no loop when the chunk stays missing)", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-18T10:00:00Z"));
    const reload = vi.fn();
    expect(reloadOnce(reload)).toBe(true);
    expect(reloadOnce(reload)).toBe(false);
    expect(reload).toHaveBeenCalledTimes(1);
    vi.setSystemTime(new Date("2026-10-18T10:01:01Z"));
    expect(reloadOnce(reload)).toBe(true);
    expect(reload).toHaveBeenCalledTimes(2);
  });
});
