/**
 * R-01-06's refresh lock in tests (E11-W05). Every browser the apps support has Web Locks and the
 * refresh relies on them alone (ruling E163); jsdom has none, so without this each `AuthClient`
 * would refresh on its own. This is a FIFO lock per name, as the browser's, so the apps' tests run
 * the refresh as production does. `auth-client.test.ts` installs it per test, and keeps one case
 * without it. Returns the function that removes it.
 */
export function installWebLocks(): () => void {
  if ("locks" in navigator) {
    return () => undefined;
  }
  const queues = new Map<string, Promise<void>>();
  Object.defineProperty(navigator, "locks", {
    configurable: true,
    value: {
      request: (name: string, callback: () => Promise<unknown>) => {
        const run = (queues.get(name) ?? Promise.resolve()).then(() => callback());
        queues.set(
          name,
          run.then(
            () => undefined,
            () => undefined,
          ),
        );
        return run;
      },
    },
  });
  return () => {
    Reflect.deleteProperty(navigator, "locks");
  };
}
