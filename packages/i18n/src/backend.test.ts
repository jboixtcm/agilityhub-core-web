import type { ReadCallback } from "i18next";
import { describe, expect, it, vi } from "vitest";

import { createLoaderBackend } from "./backend";

/** Reads one namespace through the backend and resolves with what its callback received. */
function read(load: Parameters<typeof createLoaderBackend>[1], namespace = "booking") {
  const backend = createLoaderBackend(["booking"], load);
  return new Promise<Parameters<ReadCallback>>((resolve) => {
    backend.read("ca", namespace, (...answer) => {
      resolve(answer);
    });
  });
}

describe("WEB-10: a locale chunk that fails to load is asked once more", () => {
  it("a first failure followed by a load hands i18next the messages", async () => {
    const load = vi
      .fn<Parameters<typeof createLoaderBackend>[1]>()
      .mockRejectedValueOnce(new TypeError("Failed to fetch dynamically imported module"))
      .mockResolvedValueOnce({ default: { title: "Reserva" } });
    const [error, data] = await read(load);
    expect(error).toBeNull();
    expect(data).toEqual({ title: "Reserva" });
    expect(load).toHaveBeenCalledTimes(2);
    expect(load).toHaveBeenLastCalledWith("ca", "booking");
  });

  it("two failures report the second error, and nothing is retried after that", async () => {
    const load = vi
      .fn<Parameters<typeof createLoaderBackend>[1]>()
      .mockRejectedValueOnce(new TypeError("first"))
      .mockRejectedValueOnce(new TypeError("second"));
    const [error, data] = await read(load);
    expect(error).toBeInstanceOf(TypeError);
    expect((error as Error).message).toBe("second");
    expect(data).toBe(false);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("an unknown namespace is refused without loading anything", async () => {
    const load = vi.fn<Parameters<typeof createLoaderBackend>[1]>();
    const [error, data] = await read(load, "admin-courses");
    expect(error).toBeInstanceOf(Error);
    expect(data).toBe(false);
    expect(load).not.toHaveBeenCalled();
  });
});
