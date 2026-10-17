import { setupWorker } from "msw/browser";

import { handlers } from "./handlers";
import { mockScenario, mockScenarios, mockThemeMode } from "./scenarios";

export const worker = setupWorker(...handlers);
export const MOCK_SCENARIO_STORAGE_KEY = "agilityhub.mockScenario";
/** E9-W05: `light` or `dark` draws the scenario's branding with that theme mode (screenshots). */
export const MOCK_THEME_STORAGE_KEY = "agilityhub.mockTheme";

export async function startMockWorker(): Promise<boolean> {
  const theme = localStorage.getItem(MOCK_THEME_STORAGE_KEY);
  mockThemeMode(theme === "light" || theme === "dark" ? theme : null);
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
