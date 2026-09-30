import type { components } from "@agilityhub/api-client";
import { isModuleUiItemEnabled } from "@agilityhub/ui";

type FeedAction = components["schemas"]["FeedAction"];

/** Whether the session reads the app as staff (the instructor's screens), not as a member. */
export interface FeedReader {
  modules: readonly string[];
  staff: boolean;
}

function path(template: string, value: string): string {
  return template.replace(/:[a-zA-Z]+/u, encodeURIComponent(value));
}

/**
 * Where a card without a button opens (S11 R-11-11): the route the code fixes, or nothing. The
 * buttons (`CHANGE_CLASS`, `CLAIM_SEAT`) are not links, and the back-office actions
 * (`OPEN_SIGNUP`, `OPEN_MEMBER`, `OPEN_JOBS`, `OPEN_EXPORT`, `OPEN_CHALLENGE`) have no route in the
 * member app. A route whose module is off opens nothing (no dead link, AGENTS rule 3).
 */
export function feedActionHref(action: FeedAction, reader: FeedReader): string | undefined {
  const { params } = action;
  const gated = (pattern: string, value: string | undefined) =>
    value === undefined || value === "" || !isModuleUiItemEnabled(reader.modules, "routes", pattern)
      ? undefined
      : path(pattern, value);
  switch (action.type) {
    case "OPEN_BOOKING":
      // A class booking opens 07; a training booking its detail (the 07 pattern of S09); else 04.
      if (params.bookingId !== undefined && params.bookingId !== "") {
        return path("/reserves/:id", params.bookingId);
      }
      if (params.trainingBookingId !== undefined && params.trainingBookingId !== "") {
        return gated("/entrenaments/:id", params.trainingBookingId);
      }
      return "/reservar";
    case "OPEN_DOG":
      return "/gossos";
    case "OPEN_TASKS":
      // A member's tasks live on 13 (S03 R-03-18); staff open the student's screen 26.
      return reader.staff ? gated("/instructor/alumnes/:dogId/tasques", params.dogId) : "/gossos";
    case "OPEN_INVOICES":
      return "/perfil";
    case "OPEN_ACTIVITY":
      return gated("/activitats/:id", params.activityId);
    case "OPEN_SETUP":
      return gated("/recorreguts/muntat/:ringId", params.ringId);
    default:
      return undefined;
  }
}

/** [CANVIA DE CLASSE] (R-11-11): screen 04 with the notification's dog preselected. */
export function changeClassHref(action: FeedAction): string {
  const dogId = action.params.dogId;
  return dogId === undefined || dogId === ""
    ? "/reservar"
    : `/reservar?dogId=${encodeURIComponent(dogId)}`;
}
