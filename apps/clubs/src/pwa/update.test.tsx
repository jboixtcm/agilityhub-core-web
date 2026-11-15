import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  checkForWorkerUpdate,
  markWorkerUpdated,
  prepareMemberAppReload,
  resetWorkerUpdate,
  setUpdateRegistration,
  useWorkerUpdated,
  WORKER_TAKEOVER_TIMEOUT_MS,
} from "./update";

/** A worker registration as far as the reload's preparation reads it. */
function registration({
  installing = null,
  update = () => Promise.resolve(),
}: {
  installing?: ServiceWorker | null;
  update?: () => Promise<void>;
} = {}) {
  const updateCall = vi.fn(update);
  const value = { installing, update: updateCall, waiting: null };
  return { current: value as unknown as ServiceWorkerRegistration, update: updateCall };
}

/** An installing worker whose state the test moves on. */
function installingWorker() {
  const target = new EventTarget() as ServiceWorker & { state: ServiceWorkerState };
  Object.defineProperty(target, "state", { value: "installing", writable: true });
  return {
    move: (state: ServiceWorkerState) => {
      target.state = state;
      target.dispatchEvent(new Event("statechange"));
    },
    worker: target,
  };
}

afterEach(() => {
  resetWorkerUpdate();
  vi.useRealTimers();
});

describe("FE-07 the member app's worker offers the reload instead of forcing it", () => {
  it("main.tsx hands a new worker's takeover to the offer, never to the plugin's own reload", () => {
    const main = readFileSync(resolve(import.meta.dirname, "../main.tsx"), "utf8");
    expect(main).toMatch(/registerSW\(\{[\s\S]*onNeedReload: markWorkerUpdated,[\s\S]*\}\)/u);
    expect(main).toMatch(/setUpdateRegistration\(registration\);/u);
  });

  it("a new worker in control is known to the page, which is not reloaded", () => {
    const { result } = renderHook(() => useWorkerUpdated());
    expect(result.current).toBe(false);
    act(() => {
      markWorkerUpdated();
    });
    expect(result.current).toBe(true);
  });

  it("another build on the host makes the worker look for it at once", () => {
    const { current, update } = registration();
    setUpdateRegistration(current);
    checkForWorkerUpdate();
    expect(update).toHaveBeenCalledOnce();
  });

  it("the press waits for a new worker to take over before the reload, so the reload loads it", async () => {
    const { move, worker } = installingWorker();
    setUpdateRegistration(registration({ installing: worker }).current);
    let ready = false;
    const preparing = prepareMemberAppReload().then(() => {
      ready = true;
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(ready).toBe(false);
    move("installed");
    await Promise.resolve();
    expect(ready).toBe(false);
    move("activated");
    await preparing;
    expect(ready).toBe(true);
  });

  it("a worker that does not take over in time does not hold the reload back", async () => {
    vi.useFakeTimers();
    const { worker } = installingWorker();
    setUpdateRegistration(registration({ installing: worker }).current);
    let ready = false;
    void prepareMemberAppReload().then(() => {
      ready = true;
    });
    await vi.advanceTimersByTimeAsync(WORKER_TAKEOVER_TIMEOUT_MS - 1);
    expect(ready).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(ready).toBe(true);
  });

  it("without a worker, with nothing to install, or when the update fails, the reload goes at once", async () => {
    await expect(prepareMemberAppReload()).resolves.toBeUndefined();
    setUpdateRegistration(registration().current);
    await expect(prepareMemberAppReload()).resolves.toBeUndefined();
    setUpdateRegistration(
      registration({ update: () => Promise.reject(new Error("offline")) }).current,
    );
    await expect(prepareMemberAppReload()).resolves.toBeUndefined();
  });
});
