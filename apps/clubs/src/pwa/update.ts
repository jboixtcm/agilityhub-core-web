import { useSyncExternalStore } from "react";

/**
 * FE-07: the member app's worker and the «new version» offer. `registerType: "autoUpdate"` keeps a
 * new worker taking over at once (`sw.ts`), but the page is no longer reloaded under the member
 * when it does (`registerSW`'s `onNeedReload`, `main.tsx`): the offer is shown instead, and the
 * reload waits for the member's press.
 */

/** How long a press waits for a new worker to take over before it reloads anyway. */
export const WORKER_TAKEOVER_TIMEOUT_MS = 10_000;

let updateRegistration: ServiceWorkerRegistration | undefined;
let workerUpdated = false;
const listeners = new Set<() => void>();

/** The app's own worker registration, handed in by `registerSW` (`onRegisteredSW`). */
export function setUpdateRegistration(registration: ServiceWorkerRegistration | undefined): void {
  updateRegistration = registration;
}

/** `onNeedReload`: a new worker controls the page; offer the reload instead of forcing it. */
export function markWorkerUpdated(): void {
  workerUpdated = true;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Whether a new worker took over since the page loaded. */
export function useWorkerUpdated(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => workerUpdated,
    () => false,
  );
}

/** The host serves another build: the worker looks for it now, so it is ready by the press. */
export function checkForWorkerUpdate(): void {
  void updateRegistration?.update().catch(() => undefined);
}

/**
 * Before the reload: a new worker being installed takes over first (at most
 * `WORKER_TAKEOVER_TIMEOUT_MS`), so the reload loads the new build and not the old precache.
 */
export async function prepareMemberAppReload(
  timeoutMs = WORKER_TAKEOVER_TIMEOUT_MS,
): Promise<void> {
  const registration = updateRegistration;
  if (registration === undefined) return;
  try {
    await registration.update();
  } catch {
    return;
  }
  const worker = registration.installing ?? registration.waiting;
  if (worker === null) return;
  await new Promise<void>((resolve) => {
    const finish = () => {
      window.clearTimeout(timer);
      worker.removeEventListener("statechange", onStateChange);
      resolve();
    };
    const onStateChange = () => {
      if (worker.state === "activated" || worker.state === "redundant") finish();
    };
    const timer = window.setTimeout(finish, timeoutMs);
    worker.addEventListener("statechange", onStateChange);
  });
}

/** Tests: a page that loaded without a worker update. */
export function resetWorkerUpdate(): void {
  workerUpdated = false;
  updateRegistration = undefined;
  for (const listener of listeners) listener();
}
