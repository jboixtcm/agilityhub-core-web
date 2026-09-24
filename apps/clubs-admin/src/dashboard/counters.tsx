import { createContext, useContext } from "react";

/**
 * R-14-08: the shell reads `GET /dashboard/counters` on load, when the window regains the focus
 * and after a command that changes them (a D2 validation or rejection), never on every navigation.
 */
export const CountersRefreshContext = createContext<() => void>(() => undefined);

export function useRefreshCounters(): () => void {
  return useContext(CountersRefreshContext);
}
