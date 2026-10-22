/**
 * R-01-06's refresh lock in tests (E11-W05, E160 #2). Every browser the apps support has Web Locks;
 * jsdom has none, so `AuthClient` would take the `localStorage` fallback, whose settle pause lets a
 * refresh started by a finished test reach the next one. This is a FIFO lock per name, as the
 * browser's. The fallback keeps its own tests (`auth-client.test.ts`, without this). Returns the
 * function that removes it.
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
