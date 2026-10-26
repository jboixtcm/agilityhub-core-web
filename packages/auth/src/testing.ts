/**
 * A FIFO Web Lock per name for jsdom. Production uses it to order cookie writes across tabs;
 * without Web Locks the auth client retains a same-page queue only. Returns its cleanup.
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
