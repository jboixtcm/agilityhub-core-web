import type { components } from "@agilityhub/api-client";
import { parsePlainDate } from "@agilityhub/i18n";

import type { Translate } from "../booking/shared";

export type InstructorDay = components["schemas"]["InstructorDay"];
export type InstructorDayClass = components["schemas"]["InstructorDayClass"];
export type DayRingBlock = components["schemas"]["DayRingBlock"];
export type InstructorCard = components["schemas"]["InstructorCard"];

/** R-10-00: «{guia} + {gos}», the guide being `handlerName ?? memberFirstName`. */
export function studentName(
  t: Translate,
  student: { dogName: string; handlerName?: string | null | undefined; memberFirstName: string },
): string {
  return t("instructor:student.name", {
    dog: student.dogName,
    handler: student.handlerName ?? student.memberFirstName,
  });
}

/** «dt.» → «dt»: the bare short weekday of the mockups («dl 3», «dl 28/07»). */
export function bareWeekday(weekday: string): string {
  return weekday.replaceAll(/[.,]/gu, "");
}

/** `?name=` of the address when it is a real `YYYY-MM-DD` date. */
export function dateParam(name: string): string | undefined {
  const value = new URLSearchParams(window.location.search).get(name);
  return value !== null && parsePlainDate(value) !== undefined ? value : undefined;
}

/** Rewrites `?key=value` in place (no history entry), as screens 10 and 23 do with `?date=`. */
export function writeParam(key: string, value: string | undefined): void {
  const url = new URL(window.location.href);
  if (value === undefined) url.searchParams.delete(key);
  else url.searchParams.set(key, value);
  window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}`);
}

/** A ring block's reason as a line's first word: «Manteniment — regar i repassar el terra». */
export function capitalized(text: string, locale: string): string {
  return `${text.charAt(0).toLocaleUpperCase(locale)}${text.slice(1)}`;
}
