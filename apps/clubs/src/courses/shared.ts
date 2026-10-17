import {
  type ApiClient,
  type components,
  isApiError,
  readRingSetups,
  useSubmissionKeys,
} from "@agilityhub/api-client";
import { useSession } from "@agilityhub/auth";
import { clubDaysSince } from "@agilityhub/i18n";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";

import { errorText, navigateInApp, type Translate, useLoader } from "../booking/shared";

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

/**
 * The ring's ACTIVE setup for anyone who may read it: `GET /me/ring-setups` (MEMBER · INSTRUCTOR);
 * an ADMIN session without the INSTRUCTOR role is refused there (`403`), and reads the ring's
 * history instead (`GET /rings/{id}/setups`, INSTRUCTOR · ADMIN, newest first) — `readRingSetups`.
 */
export async function readActiveSetup(
  client: ApiClient,
  ringId: string,
): Promise<MeRingSetupSummary | null> {
  const items = await readRingSetups(client, { ringIds: [ringId] });
  return items.find((item) => item.ringId === ringId)?.setup ?? null;
}

/**
 * `readActiveSetup` as a page's state (`ringId` empty = nothing to read): the viewer of
 * `/recorreguts/muntat/:ringId` and «Substituirà el muntatge actual ({tipus}, de {dia})» of the
 * register form (R-16-07).
 */
export function useActiveSetup(client: ApiClient, ringId: string, refresh?: unknown) {
  const load = useCallback(
    async () => (ringId === "" ? null : readActiveSetup(client, ringId)),
    [client, ringId],
  );
  return useLoader(load, refresh);
}

/**
 * [Sessió de muntatge] (R-16-11): `POST /build-sessions {placementId, live: true}` under one
 * `Idempotency-Key` per payload (kept while the api has not answered it), then the session's page;
 * a refusal stays where it was asked (`error`). Used by the viewer of an ACTIVE setup and by 07's
 * «Recorregut previst» for staff. No course store: 07 is part of the app's start.
 */
export function useStartBuildSession(client: ApiClient) {
  const { t } = useTranslation(["courses", "errors", "common"]);
  const keys = useSubmissionKeys();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const start = useCallback(
    async (placementId: string) => {
      const body = { live: true, placementId };
      setPending(true);
      setError(undefined);
      try {
        const created = await keys.send(JSON.stringify(body), (key) =>
          client.POST("/build-sessions", { body, headers: { "Idempotency-Key": key } }),
        );
        navigateInApp(coursePaths.session(required(created.data).id));
      } catch (cause) {
        setError(errorText(t, cause));
        setPending(false);
      }
    },
    [client, keys, t],
  );
  return { error, pending, start };
}

/** INSTRUCTOR or ADMIN, never an impersonated session (S16 §2: the instructors' actions). */
export function useStaffRoles(): boolean {
  const session = useSession();
  return (
    session.me?.impersonation === undefined &&
    session.roles.some((role) => role === "INSTRUCTOR" || role === "ADMIN")
  );
}

/** A `404` the api answers for something the reader may not see (or that is gone). */
export function isNotFound(error: unknown): boolean {
  return isApiError(error) && error.status === 404;
}

export function isStaffSetup(setup: ViewedRingSetup): setup is StaffRingSetup {
  return setup.view === "STAFF";
}
