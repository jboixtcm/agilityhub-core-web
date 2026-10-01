import type { components, PreferencesPatch } from "@agilityhub/api-client";

type Preferences = components["schemas"]["NotificationPreferences"];
export type Category = keyof Preferences["emailByCategory"];

/** The member's own changes not confirmed by the api yet (only the keys she touched). */
export type Edits = PreferencesPatch;

/**
 * The changes screen 12 was left with, for the next visit in this tab (E7-W02 round 2 #1): only
 * the partial body (switches, reminder, push), never personal data, and only for the account and
 * club that made them. The shared saver and outbox of `@agilityhub/api-client` own the rules
 * (R-11-04; E7-W05 steps 1 and 2, the visit id of review #4).
 */
export const NOTICES_OUTBOX_KEY = "agilityhub.noticePreferences.outbox.v1";
