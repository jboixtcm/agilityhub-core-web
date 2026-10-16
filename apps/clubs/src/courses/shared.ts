import { type ApiClient, type components, isApiError } from "@agilityhub/api-client";
import { clubDaysSince } from "@agilityhub/i18n";
import { useCallback } from "react";

import { type Translate, useLoader } from "../booking/shared";

export type MeRingSetup = components["schemas"]["MeRingSetup"];
export type MeRingSetupSummary = components["schemas"]["MeRingSetupSummary"];
export type StaffRingSetup = components["schemas"]["RingSetup"];
export type MemberRingSetup = components["schemas"]["MemberRingSetup"];
export type ViewedRingSetup = MemberRingSetup | StaffRingSetup;
export type SetupKind = StaffRingSetup["kind"];
export type RingSetupSummary = components["schemas"]["RingSetupSummary"];

/** S16 §2: the setup kinds «Què hi ha muntat?» offers, in the spec's order. */
export const SETUP_KINDS: readonly SetupKind[] = [
  "AGILITY",
  "JUMPING",
  "FUN",
  "OBSTACLE_DRILL",
  "EMPTY",
];

/** The members' app routes of S16 §2. */
export const coursePaths = {
  register: (ringId: string) => `/instructor/pistes/${encodeURIComponent(ringId)}/muntat`,
  ring: (ringId: string) => `/recorreguts/muntat/${encodeURIComponent(ringId)}`,
  session: (sessionId: string) => `/instructor/muntatge/${encodeURIComponent(sessionId)}`,
  setup: (setupId: string) => `/recorreguts/${encodeURIComponent(setupId)}`,
};

/** The label of a setup kind (`enums:setupKind.*`; the summaries' `kind` is a plain string). */
export function kindLabel(t: Translate, kind: string): string {
  return t(`enums:setupKind.${kind}`, { defaultValue: kind });
}

/**
 * «muntat ahir», «muntat fa 2 dies» (S16 §10, T-16-22): whole days between the setup and today,
 * both read as the club's local days (never the device's zone).
 */
export function builtAgoText(
  t: Translate,
  builtAt: string,
  timeZone: string,
  now: Date = new Date(),
): string {
  return t("courses:builtAgo", { days: clubDaysSince(builtAt, timeZone, now) });
}

/**
 * «Jumping · nivell C–D · muntat ahir» (S16 §2, 08 and 07): the kind, the orientative level when
 * there is one, and how long ago it was built. `level` is the api's label (club level codes joined
 * by an en dash, or the AgilityHub level).
 */
export function setupLine(
  t: Translate,
  setup: { builtAt: string; kind: string; level?: string | null | undefined },
  timeZone: string,
): string {
  const kind = kindLabel(t, setup.kind);
  const level =
    setup.level === null || setup.level === undefined || setup.level === ""
      ? null
      : agilityhubLevelLabel(t, setup.level);
  return [
    kind,
    ...(level === null ? [] : [t("courses:level", { level })]),
    builtAgoText(t, setup.builtAt, timeZone),
  ].join(t("courses:separator"));
}

/** The AgilityHub scale reads in the reader's language; a club level code stays as it is. */
export function agilityhubLevelLabel(t: Translate, level: string): string {
  return ["EASY", "MEDIUM", "HARD"].includes(level) ? t(`enums:agilityhubLevel.${level}`) : level;
}

/** `RingSetupSummary.levelNames` (08's `rings[].setup`) as one label («C–D»). */
export function levelNamesLabel(levelNames: readonly string[]): string | null {
  return levelNames.length === 0 ? null : levelNames.join("–");
}

function required<Data>(data: Data | undefined): Data {
  if (data === undefined) throw new TypeError("The response did not contain data");
  return data;
}

/**
 * `GET /me/ring-setups?ringIds=` (R-16-09): the ring's ACTIVE setup summary, or `null` («Sense
 * recorregut registrat»). A MEMBER reads `null` everywhere while `courses.showSetupToMembers` is off.
 */
export async function readMeRingSetup(
  client: ApiClient,
  ringId: string,
): Promise<MeRingSetupSummary | null> {
  const items = required(
    (await client.GET("/me/ring-setups", { params: { query: { ringIds: [ringId] } } })).data,
  );
  return items.find((item) => item.ringId === ringId)?.setup ?? null;
}

/** `readMeRingSetup` as a page's state (`ringId` empty = nothing to read). */
export function useMeRingSetup(client: ApiClient, ringId: string, refresh?: unknown) {
  const load = useCallback(
    async () => (ringId === "" ? null : readMeRingSetup(client, ringId)),
    [client, ringId],
  );
  return useLoader(load, refresh);
}

/** What «Substituirà el muntatge actual ({tipus}, de {dia})» names (R-16-07). */
export interface ActiveSetup {
  builtAt: string;
  id: string;
  kind: string;
}

/**
 * The ring's ACTIVE setup for whoever registers one: `GET /me/ring-setups` (MEMBER · INSTRUCTOR);
 * an ADMIN session without the INSTRUCTOR role is refused there (`403`), and reads the ring's
 * history instead (`GET /rings/{id}/setups`, INSTRUCTOR · ADMIN, newest first).
 */
export async function readActiveSetup(
  client: ApiClient,
  ringId: string,
): Promise<ActiveSetup | null> {
  try {
    return await readMeRingSetup(client, ringId);
  } catch (error) {
    if (!isApiError(error, "FORBIDDEN")) throw error;
    const page = required(
      (
        await client.GET("/rings/{id}/setups", {
          params: { path: { id: ringId }, query: { page: 0, size: 20 } },
        })
      ).data,
    );
    return page.items.find((item) => item.status === "ACTIVE") ?? null;
  }
}

export function useActiveSetup(client: ApiClient, ringId: string) {
  const load = useCallback(
    async () => (ringId === "" ? null : readActiveSetup(client, ringId)),
    [client, ringId],
  );
  return useLoader(load);
}

/** A `404` the api answers for something the reader may not see (or that is gone). */
export function isNotFound(error: unknown): boolean {
  return isApiError(error) && error.status === 404;
}

export function isStaffSetup(setup: ViewedRingSetup): setup is StaffRingSetup {
  return setup.view === "STAFF";
}
