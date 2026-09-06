import { setupWorker } from "msw/browser";

import { handlers } from "./handlers";

export const worker = setupWorker(...handlers);

export async function startMockWorker(): Promise<boolean> {
  const meta = import.meta as ImportMeta & {
    readonly env?: Record<string, string | undefined>;
  };

  if (meta.env?.VITE_MOCK !== "1") {
    return false;
  }

  await worker.start({ onUnhandledRequest: "bypass" });
  return true;
}
