import { apiError } from "./planning-handlers";
import { currentMockScenario } from "./scenarios";

/**
 * S04 R-04-06 (INC-39, E11-T10): while a readmission waits for D2, the member's record (back to
 * `PENDING`) is frozen — the D10 writes that would change it (the booking block, the payment
 * method, the plan, the notification preferences, the next invoice date) answer `409
 * INVALID_STATE {reason: READMISSION_PENDING}`, as the api does (`memberReadmissionPending`).
 */
export function readmissionPendingRefusal() {
  return currentMockScenario().memberReadmissionPending === true
    ? apiError("INVALID_STATE", "The record waits for its readmission", 409, {
        reason: "READMISSION_PENDING",
      })
    : undefined;
}
