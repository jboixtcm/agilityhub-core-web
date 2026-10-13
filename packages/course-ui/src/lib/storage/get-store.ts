import type { PlannerStore } from "./types";

let plannerStore: PlannerStore | undefined;

export function configurePlannerStore(store: PlannerStore): void {
  plannerStore = store;
}

export function getPlannerStore(): PlannerStore {
  if (plannerStore === undefined) {
    throw new Error("COURSE_UI_STORE_NOT_CONFIGURED");
  }
  return plannerStore;
}
