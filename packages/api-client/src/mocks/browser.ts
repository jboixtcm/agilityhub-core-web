import { setupWorker } from "msw/browser";

import { handlers } from "./handlers";
import { mockScenario, mockScenarios } from "./scenarios";

export const worker = setupWorker(...handlers);
export const MOCK_SCENARIO_STORAGE_KEY = "agilityhub.mockScenario";

export async function startMockWorker(): Promise<boolean> {
  const selected = localStorage.getItem(MOCK_SCENARIO_STORAGE_KEY);
  if (selected !== null && mockScenarios.includes(selected as (typeof mockScenarios)[number])) {
    mockScenario(selected as (typeof mockScenarios)[number]);
  } else if (window.location.hostname.startsWith("minim.")) {
    mockScenario("minimal");
  } else if (window.location.hostname.startsWith("instructor.")) {
    mockScenario("instructor");
  }

  await worker.start({ onUnhandledRequest: "bypass" });
  return true;
}
