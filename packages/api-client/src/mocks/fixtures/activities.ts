import type { components } from "../../generated/schema";

import { clubInstant, clubTimeZone } from "./calendar";
import { catalogState } from "./catalogs";

export type Activity = components["schemas"]["Activity"];
export type ActivityListItem = components["schemas"]["ActivityListItem"];
export type ActivityRegistration = components["schemas"]["ActivityRegistration"];
export type ActivityRegistrationListItem = components["schemas"]["ActivityRegistrationListItem"];
export type ActivityRegistrationSummary = components["schemas"]["ActivityRegistrationSummary"];
export type ActivityRow = components["schemas"]["ActivityRow"];
export type ActivityType = Activity["type"];
export type MemberActivityDetail = components["schemas"]["MemberActivityDetail"];
export type RingConflicts = components["schemas"]["RingConflicts"];
export type ActivityCancellationPreview = components["schemas"]["ActivityCancellationPreview"];

/** Fictional account of the `member` scenario (Biel Roca), registered to the Torneig. */
export const MEMBER_ID = "20000000-0000-4000-8000-000000000002";
const MOCK_ADMIN_ACCOUNT = "10000000-0000-4000-8000-000000000001";
const PUBLIC_SITE = "https://agilitycanic.cat";

export const ACTIVITY_IDS = {
  demonstration: "activity-demostracio-festa-major",
  league: "activity-lliga-social-3",
  seminar: "activity-seminari-handling",
  tournament: "activity-torneig-estiu-2026",
  workshop: "activity-taller-contactes",
} as const;

/** Stored activity: form A without the fields derived at read time. */
export interface StoredActivity {
  cancellation: NonNullable<Activity["cancellation"]> | null;
  date: string;
  documents: Activity["documents"];
  endTime: string | null;
  id: string;
  image: NonNullable<Activity["image"]> | null;
  internalNotes: string | null;
  levelIds: string[];
  location: Activity["location"];
  longDescriptionI18n: Record<string, string> | null;
  maxPlaces: number | null;
  minPlaces: number | null;
  publishedAt: string | null;
  registrationFrom: string | null;
  registrationTo: string | null;
  ringBlockWindow: NonNullable<Activity["ringBlockWindow"]> | null;
  ringIds: string[];
  shortDescriptionI18n: Record<string, string> | null;
  slug: string;
  startTime: string | null;
  state: Activity["state"];
  titleI18n: Record<string, string>;
  type: ActivityType;
  typeLabel: Record<string, string> | null;
  version: number;
  waitlistEnabled: boolean;
  createdAt: string;
}

export interface StoredRegistration {
  activityId: string;
  cancelReason: NonNullable<ActivityRegistrationListItem["cancelReason"]> | null;
  cancelledAt: string | null;
  cancelledBy: "ADMIN" | "MEMBER" | "SYSTEM" | null;
  id: string;
  member: ActivityRegistrationListItem["member"];
  origin: ActivityRegistrationListItem["origin"];
  position: number | null;
  promotedAt: string | null;
  registeredAt: string;
  state: ActivityRegistrationListItem["state"];
}

const firstNames = [
  "Laura",
  "Marc",
  "Montse",
  "Pau",
  "Aina",
  "Jordi",
  "Núria",
  "Oriol",
  "Clara",
  "Arnau",
  "Berta",
  "Guillem",
  "Irene",
  "Joan",
  "Marta",
  "Pol",
  "Sílvia",
  "Toni",
  "Carla",
  "Dani",
  "Emma",
  "Xavi",
  "Rosa",
  "Quim",
];
const lastNames = [
  "Puig",
  "Serra",
  "Vila",
  "Soler",
  "Ferrer",
  "Costa",
  "Font",
  "Riera",
  "Camps",
  "Mas",
  "Pujol",
  "Roig",
  "Bosch",
  "Casals",
  "Prat",
  "Sala",
  "Valls",
  "Sabater",
  "Codina",
  "Marín",
  "Torrent",
  "Grau",
  "Pons",
  "Vidal",
];

function fictionalMember(index: number, prefix: string): StoredRegistration["member"] {
  const first = firstNames[index % firstNames.length] ?? "Laura";
  const last = lastNames[(index * 7) % lastNames.length] ?? "Puig";
  const slug = `${first}.${last}`.normalize("NFD").replaceAll(/\p{Diacritic}/gu, "");
  return {
    emails: [`${slug.toLocaleLowerCase()}@example.test`],
    fullName: `${first} ${last}`,
    id: `member-${prefix}-${String(index + 1).padStart(2, "0")}`,
    memberNumber: String(200 + index * 3),
    phones:
      index % 4 === 1
        ? [
            { label: null, number: `6000001${String(index).padStart(2, "0")}`, prefix: "+34" },
            { label: null, number: `6000002${String(index).padStart(2, "0")}`, prefix: "+34" },
          ]
        : [{ label: null, number: `6000001${String(index).padStart(2, "0")}`, prefix: "+34" }],
  };
}

const bielRoca: StoredRegistration["member"] = {
  emails: ["biel.roca@example.test"],
  fullName: "Biel Roca",
  id: MEMBER_ID,
  memberNumber: "118",
  phones: [{ label: null, number: "600000118", prefix: "+34" }],
};

function registrations(
  activityId: string,
  prefix: string,
  active: number,
  waiting: number,
  firstAt: string,
  withMember = false,
): StoredRegistration[] {
  const start = Date.parse(firstAt);
  const rows: StoredRegistration[] = [];
  for (let index = 0; index < active + waiting; index += 1) {
    const member = withMember && index === 2 ? bielRoca : fictionalMember(index, prefix);
    rows.push({
      activityId,
      cancelReason: null,
      cancelledAt: null,
      cancelledBy: null,
      id: `registration-${prefix}-${String(index + 1).padStart(2, "0")}`,
      member,
      origin: index % 6 === 5 ? "BACKOFFICE" : "APP",
      position: index < active ? null : index - active + 1,
      promotedAt: null,
      registeredAt: new Date(start + index * 7 * 3_600_000).toISOString().replace(".000Z", "Z"),
      state: index < active ? "ACTIVE" : "WAITLISTED",
    });
  }
  return rows;
}

function allActiveRingIds(): string[] {
  return catalogState.rings
    .filter((ring) => ring.active)
    .sort((left, right) => left.order - right.order)
    .map((ring) => ring.id);
}

function initialActivities(): StoredActivity[] {
  return [
    {
      cancellation: null,
      createdAt: "2026-06-12T09:00:00Z",
      date: "2026-08-07",
      documents: [
        {
          id: "file-normativa",
          name: "normativa.pdf",
          url: "https://files.example.test/normativa.pdf",
        },
      ],
      endTime: "20:30",
      id: ACTIVITY_IDS.tournament,
      image: {
        fileId: "file-imatge-torneig",
        name: "imatge_torneig.jpg",
        url: "https://files.example.test/imatge_torneig.jpg",
      },
      internalNotes: null,
      levelIds: [],
      location: { address: null, atClub: true, name: null, url: null },
      longDescriptionI18n: {
        ca: "<h3>Horaris</h3><p>Recollida de dorsals a les <strong>18:00</strong>.</p><ul><li>Categories per nivell</li><li>Cal portar la cartilla</li></ul>",
        es: "<h3>Horarios</h3><p>Recogida de dorsales a las <strong>18:00</strong>.</p><ul><li>Categorías por nivel</li><li>Hay que traer la cartilla</li></ul>",
      },
      maxPlaces: 40,
      minPlaces: null,
      publishedAt: "2026-06-20T10:02:00Z",
      registrationFrom: "2026-07-01",
      registrationTo: "2026-08-06",
      ringBlockWindow: null,
      ringIds: allActiveRingIds(),
      shortDescriptionI18n: {
        ca: "Jornada social de tancament de l'estiu",
        es: "Jornada social de cierre del verano",
      },
      slug: "torneig-estiu-2026",
      startTime: "18:30",
      state: "PUBLISHED",
      titleI18n: { ca: "Torneig d'Estiu 2026", es: "Torneo de Verano 2026" },
      type: "COMPETITION",
      typeLabel: null,
      version: 7,
      waitlistEnabled: true,
    },
    {
      cancellation: null,
      createdAt: "2026-06-25T09:00:00Z",
      date: "2026-09-12",
      documents: [],
      endTime: "13:00",
      id: ACTIVITY_IDS.seminar,
      image: null,
      internalNotes: null,
      levelIds: [],
      location: { address: null, atClub: true, name: null, url: null },
      longDescriptionI18n: null,
      maxPlaces: 12,
      minPlaces: null,
      publishedAt: "2026-07-10T08:00:00Z",
      registrationFrom: "2026-07-15",
      registrationTo: "2026-09-06",
      ringBlockWindow: null,
      ringIds: ["ring-central"],
      shortDescriptionI18n: { ca: "Matí de treball de handling amb grups reduïts" },
      slug: "seminari-de-handling",
      startTime: "09:00",
      state: "PUBLISHED",
      titleI18n: { ca: "Seminari de handling", es: "Seminario de handling" },
      type: "SEMINAR",
      typeLabel: null,
      version: 3,
      waitlistEnabled: false,
    },
    {
      cancellation: null,
      createdAt: "2026-07-01T09:00:00Z",
      date: "2026-09-19",
      documents: [],
      endTime: null,
      id: ACTIVITY_IDS.league,
      image: null,
      internalNotes: null,
      levelIds: [],
      location: { address: null, atClub: true, name: null, url: null },
      longDescriptionI18n: null,
      maxPlaces: null,
      minPlaces: null,
      publishedAt: "2026-07-20T08:00:00Z",
      registrationFrom: "2026-09-01",
      registrationTo: "2026-09-17",
      ringBlockWindow: null,
      ringIds: allActiveRingIds(),
      shortDescriptionI18n: null,
      slug: "lliga-social-3a-jornada",
      startTime: "09:00",
      state: "PUBLISHED",
      titleI18n: { ca: "Lliga social — 3a jornada", es: "Liga social — 3.ª jornada" },
      type: "SOCIAL_LEAGUE",
      typeLabel: null,
      version: 2,
      waitlistEnabled: false,
    },
    {
      cancellation: null,
      createdAt: "2026-07-28T09:00:00Z",
      date: "2026-10-04",
      documents: [],
      endTime: null,
      id: ACTIVITY_IDS.demonstration,
      image: null,
      internalNotes: "Confirmar l'espai amb l'ajuntament",
      levelIds: [],
      location: { address: "Plaça Major", atClub: false, name: "Plaça Major", url: null },
      longDescriptionI18n: null,
      maxPlaces: null,
      minPlaces: null,
      publishedAt: null,
      registrationFrom: null,
      registrationTo: null,
      ringBlockWindow: null,
      ringIds: [],
      shortDescriptionI18n: null,
      slug: "demostracio-festa-major",
      startTime: null,
      state: "DRAFT",
      titleI18n: { ca: "Demostració Festa Major", es: "Exhibición Fiesta Mayor" },
      type: "DEMONSTRATION",
      typeLabel: null,
      version: 1,
      waitlistEnabled: false,
    },
    {
      cancellation: null,
      createdAt: "2026-07-05T09:00:00Z",
      date: "2026-08-22",
      documents: [],
      endTime: "12:00",
      id: ACTIVITY_IDS.workshop,
      image: null,
      internalNotes: null,
      levelIds: [],
      location: { address: null, atClub: true, name: null, url: null },
      longDescriptionI18n: null,
      maxPlaces: 10,
      minPlaces: null,
      publishedAt: "2026-07-18T08:00:00Z",
      registrationFrom: "2026-07-20",
      registrationTo: "2026-08-20",
      ringBlockWindow: null,
      ringIds: ["ring-cadells"],
      shortDescriptionI18n: { ca: "Taller de zones de contacte per a tots els nivells" },
      slug: "taller-de-contactes",
      startTime: "10:00",
      state: "PUBLISHED",
      titleI18n: { ca: "Taller de contactes", es: "Taller de contactos" },
      type: "SEMINAR",
      typeLabel: null,
      version: 4,
      waitlistEnabled: true,
    },
  ];
}

function initialRegistrations(): StoredRegistration[] {
  return [
    ...registrations(ACTIVITY_IDS.tournament, "torneig", 22, 0, "2026-07-01T08:10:00Z", true),
    ...registrations(ACTIVITY_IDS.seminar, "seminari", 6, 0, "2026-07-15T09:00:00Z"),
    ...registrations(ACTIVITY_IDS.workshop, "taller", 10, 2, "2026-07-20T09:00:00Z"),
  ];
}

export const activityState: {
  activities: StoredActivity[];
  registrations: StoredRegistration[];
  replays: Map<string, { body: unknown; status: number }>;
  sequence: number;
} = {
  activities: initialActivities(),
  registrations: initialRegistrations(),
  replays: new Map(),
  sequence: 1,
};

export function resetActivityState(): void {
  activityState.activities = initialActivities();
  activityState.registrations = initialRegistrations();
  activityState.replays = new Map();
  activityState.sequence = 1;
}

export function nextActivityId(prefix: string): string {
  activityState.sequence += 1;
  return `${prefix}-${String(activityState.sequence)}`;
}

const typeLabels: Readonly<Record<string, Readonly<Record<ActivityType, string>>>> = {
  ca: {
    COMPETITION: "competició",
    COURSE: "curset",
    DEMONSTRATION: "demostració",
    OTHER: "altres",
    SEMINAR: "seminari",
    SOCIAL_LEAGUE: "lliga social",
  },
  en: {
    COMPETITION: "competition",
    COURSE: "course",
    DEMONSTRATION: "demonstration",
    OTHER: "other",
    SEMINAR: "seminar",
    SOCIAL_LEAGUE: "social league",
  },
  es: {
    COMPETITION: "competición",
    COURSE: "cursillo",
    DEMONSTRATION: "exhibición",
    OTHER: "otros",
    SEMINAR: "seminario",
    SOCIAL_LEAGUE: "liga social",
  },
};

const allRingsLabel: Readonly<Record<string, string>> = {
  ca: "totes les pistes",
  en: "all rings",
  es: "todas las pistas",
};

export function localized(
  values: Record<string, string> | null | undefined,
  locale: string,
): string | null {
  if (values === null || values === undefined) return null;
  return values[locale] ?? values.ca ?? Object.values(values)[0] ?? null;
}

export function typeDisplay(activity: StoredActivity, locale: string): string {
  return (
    localized(activity.typeLabel, locale) ??
    (typeLabels[locale] ?? typeLabels.ca)?.[activity.type] ??
    activity.type
  );
}

export function activityRings(activity: StoredActivity): Activity["rings"] {
  return activity.ringIds.flatMap((id) => {
    const ring = catalogState.rings.find((item) => item.id === id);
    return ring === undefined ? [] : [{ color: ring.color, id: ring.id, name: ring.name }];
  });
}

export function isAllRings(activity: StoredActivity): boolean {
  const active = allActiveRingIds();
  return (
    activity.location.atClub &&
    active.length > 0 &&
    active.every((id) => activity.ringIds.includes(id))
  );
}

function nextDay(date: string): string {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + 1);
  return value.toISOString().slice(0, 10);
}

export function startsAt(activity: StoredActivity): string {
  return clubInstant(activity.date, activity.startTime ?? "00:00", clubTimeZone);
}

/** `endTime`, or the end of the local day without one (S07 §3). */
export function endsAt(activity: StoredActivity): string {
  return activity.endTime === null
    ? clubInstant(nextDay(activity.date), "00:00", clubTimeZone)
    : clubInstant(activity.date, activity.endTime, clubTimeZone);
}

/** R-07-13: opens at 00:00 local of `from`, closes at 00:00 local of the day after `to`. */
export function registrationWindow(
  activity: StoredActivity,
): { closesAt: number; opensAt: number } | undefined {
  if (activity.registrationFrom === null || activity.registrationTo === null) return undefined;
  return {
    closesAt: Date.parse(clubInstant(nextDay(activity.registrationTo), "00:00", clubTimeZone)),
    opensAt: Date.parse(clubInstant(activity.registrationFrom, "00:00", clubTimeZone)),
  };
}

export function registrationOpen(activity: StoredActivity, now = Date.now()): boolean {
  const window = registrationWindow(activity);
  return (
    activity.state === "PUBLISHED" &&
    window !== undefined &&
    window.opensAt <= now &&
    now < window.closesAt
  );
}

export function liveRegistrations(activityId: string): StoredRegistration[] {
  return activityState.registrations.filter(
    (registration) =>
      registration.activityId === activityId &&
      (registration.state === "ACTIVE" || registration.state === "WAITLISTED"),
  );
}

export function counters(activityId: string): Activity["counters"] {
  const live = liveRegistrations(activityId);
  return {
    active: live.filter((registration) => registration.state === "ACTIVE").length,
    waiting: live.filter((registration) => registration.state === "WAITLISTED").length,
  };
}

export function freeSeats(activity: StoredActivity): number | null {
  return activity.maxPlaces === null
    ? null
    : Math.max(0, activity.maxPlaces - counters(activity.id).active);
}

export function levelNames(activity: StoredActivity, locale: string): string[] {
  return activity.levelIds.flatMap((id) => {
    const level = catalogState.levels.find((item) => item.id === id);
    return level === undefined ? [] : [localized(level.nameI18n, locale) ?? level.name];
  });
}

export function placeLabel(activity: StoredActivity, locale: string): string {
  if (!activity.location.atClub) return activity.location.name ?? "";
  if (isAllRings(activity)) return allRingsLabel[locale] ?? allRingsLabel.ca ?? "";
  return activityRings(activity)
    .map((ring) => ring.name)
    .join(", ");
}

/** Form A (`GET /activities/{id}`); `internalNotes` only for ADMIN. */
export function activityResource(
  activity: StoredActivity,
  locale: string,
  admin: boolean,
  waitlistModule: boolean,
): Activity {
  const window = registrationWindow(activity);
  return {
    allRings: isAllRings(activity),
    belowMinimum: activity.minPlaces !== null && counters(activity.id).active < activity.minPlaces,
    cancellation: activity.cancellation,
    counters: counters(activity.id),
    date: activity.date,
    documents: activity.documents,
    endTime: activity.endTime,
    endsAt: endsAt(activity),
    freeSeats: freeSeats(activity),
    id: activity.id,
    image: activity.image,
    ...(admin ? { internalNotes: activity.internalNotes } : {}),
    levelIds: activity.levelIds,
    levelNames: levelNames(activity, locale),
    location: activity.location,
    longDescriptionHtml: localized(activity.longDescriptionI18n, locale),
    longDescriptionI18n: activity.longDescriptionI18n,
    maxPlaces: activity.maxPlaces,
    minPlaces: activity.minPlaces,
    placementIds: [],
    priceTiers: [],
    publicUrl: `${PUBLIC_SITE}/activitat/${activity.slug}`,
    publishedAt: activity.publishedAt,
    registrationFrom: activity.registrationFrom,
    registrationOpen: window !== undefined && registrationOpen(activity),
    registrationTo: activity.registrationTo,
    ringBlockIds:
      activity.state === "PUBLISHED"
        ? activity.ringIds.map((id) => `block-${activity.id}-${id}`)
        : [],
    ringBlockWindow: activity.ringBlockWindow,
    ringIds: activity.ringIds,
    rings: activityRings(activity),
    shortDescription: localized(activity.shortDescriptionI18n, locale),
    shortDescriptionI18n: activity.shortDescriptionI18n,
    slug: activity.slug,
    startTime: activity.startTime,
    startsAt: startsAt(activity),
    state: activity.state,
    title: localized(activity.titleI18n, locale) ?? "",
    titleI18n: activity.titleI18n,
    type: activity.type,
    typeDisplay: typeDisplay(activity, locale),
    typeLabel: activity.typeLabel,
    version: activity.version,
    visibility: "MEMBERS",
    waitlistEnabled: waitlistModule && activity.waitlistEnabled,
  };
}

/** D7 list row, as the api's `ActivityListItem`. */
export function activityListItem(activity: StoredActivity, locale: string): ActivityListItem {
  return {
    allRings: isAllRings(activity),
    createdAt: activity.createdAt,
    date: activity.date,
    endTime: activity.endTime,
    id: activity.id,
    // The free text of an activity away from the club; `null` at the club.
    location: activity.location.atClub
      ? null
      : (activity.location.name ?? activity.location.address ?? ""),
    maxPlaces: activity.maxPlaces,
    registrationTo: activity.registrationTo,
    registrations: counters(activity.id),
    rings: activityRings(activity),
    slug: activity.slug,
    startTime: activity.startTime,
    state: activity.state,
    title: localized(activity.titleI18n, locale) ?? "",
    type: activity.type,
    typeDisplay: typeDisplay(activity, locale),
  };
}

export function registeredActivity(
  activity: StoredActivity,
  locale: string,
): components["schemas"]["RegisteredActivity"] {
  return {
    // As the api: without hours the start is `T00:00`; without an end, `endsAtLocal` is `null`
    // (S07 «Canvis» 24-09). `startTime`/`endTime` carry the hours themselves, `null` when absent
    // (E5-T15), so a date-only activity never reads 0:00.
    endTime: activity.endTime,
    endsAtLocal: activity.endTime === null ? null : `${activity.date}T${activity.endTime}`,
    id: activity.id,
    placeLabel: placeLabel(activity, locale),
    startTime: activity.startTime,
    startsAtLocal: `${activity.date}T${activity.startTime ?? "00:00"}`,
    title: localized(activity.titleI18n, locale) ?? "",
  };
}

/** R-07-09 with `activities.cancelDeadline = EVENT_START` (the Cànic value): until the start. */
export function cancellableUntil(activity: StoredActivity): string {
  return startsAt(activity);
}

export function registrationResource(
  registration: StoredRegistration,
  activity: StoredActivity,
  locale: string,
): ActivityRegistration {
  return {
    activity: registeredActivity(activity, locale),
    activityId: activity.id,
    cancellableUntil: cancellableUntil(activity),
    cancellation:
      registration.cancelledAt === null || registration.cancelReason === null
        ? null
        : {
            at: registration.cancelledAt,
            byRole: registration.cancelledBy ?? "MEMBER",
            reason: registration.cancelReason,
          },
    id: registration.id,
    impersonation: null,
    memberId: registration.member.id,
    origin: registration.origin,
    position: registration.position,
    registeredAt: registration.registeredAt,
    registeredBy: {
      displayName: registration.member.fullName.split(" ")[0] ?? registration.member.fullName,
      viaClub: registration.origin === "BACKOFFICE",
    },
    state: registration.state,
  };
}

export function registrationListItem(
  registration: StoredRegistration,
): ActivityRegistrationListItem {
  return {
    // `null` until the registration is cancelled, as the api sends them.
    cancelReason: registration.cancelReason,
    cancelledAt: registration.cancelledAt,
    member: registration.member,
    origin: registration.origin,
    position: registration.position,
    registeredAt: registration.registeredAt,
    registrationId: registration.id,
    state: registration.state,
  };
}

/** R-07-11 `rowState` of an activity for the member (no live registration of theirs). */
export function rowState(
  activity: StoredActivity,
  waitlistModule: boolean,
): ActivityRow["rowState"] {
  const free = freeSeats(activity);
  if (free === null || free > 0) return "OPEN";
  return waitlistModule && activity.waitlistEnabled ? "FULL_WAITLIST" : "FULL";
}

export function activityRow(
  activity: StoredActivity,
  locale: string,
  waitlistModule: boolean,
): ActivityRow {
  const registered = registeredActivity(activity, locale);
  return {
    endTime: registered.endTime,
    endsAtLocal: registered.endsAtLocal,
    freeSeats: freeSeats(activity),
    id: activity.id,
    notBookableReason: null,
    placeLabel: registered.placeLabel,
    rowState: rowState(activity, waitlistModule),
    startTime: registered.startTime,
    startsAtLocal: registered.startsAtLocal,
    title: registered.title,
    typeLabel: typeDisplay(activity, locale),
    waiting: counters(activity.id).waiting,
    waitlistEnabled: waitlistModule && activity.waitlistEnabled,
  };
}

export function memberActivityDetail(
  activity: StoredActivity,
  locale: string,
  memberId: string,
  waitlistModule: boolean,
): MemberActivityDetail {
  const mine = liveRegistrations(activity.id).find(
    (registration) => registration.member.id === memberId,
  );
  return {
    allRings: isAllRings(activity),
    cancellableUntil: cancellableUntil(activity),
    date: activity.date,
    documents: activity.documents,
    endTime: activity.endTime,
    endsAt: endsAt(activity),
    freeSeats: freeSeats(activity),
    id: activity.id,
    image: activity.image,
    levelNames: levelNames(activity, locale),
    location: activity.location,
    longDescriptionHtml: localized(activity.longDescriptionI18n, locale),
    maxPlaces: activity.maxPlaces,
    minPlaces: activity.minPlaces,
    myRegistration: mine === undefined ? null : registrationResource(mine, activity, locale),
    registrationFrom: activity.registrationFrom ?? activity.date,
    registrationOpen: registrationOpen(activity),
    registrationTo: activity.registrationTo ?? activity.date,
    rings: activityRings(activity),
    rowState: rowState(activity, waitlistModule),
    shortDescription: localized(activity.shortDescriptionI18n, locale),
    slug: activity.slug,
    startTime: activity.startTime,
    startsAt: startsAt(activity),
    state: activity.state,
    title: localized(activity.titleI18n, locale) ?? "",
    type: activity.type,
    typeDisplay: typeDisplay(activity, locale),
    waitlistEnabled: waitlistModule && activity.waitlistEnabled,
  };
}

function overlaps(fromA: string, toA: string, fromB: string, toB: string): boolean {
  return fromA < toB && fromB < toA;
}

/**
 * R-07-05 preview for the fixtures: a class «B+C» on Central 18:30–19:30 with 3 registrants and a
 * training booking on Muntanya 19:00–19:30 collide with any activity that uses those rings then.
 */
export function ringConflicts(activity: StoredActivity): RingConflicts {
  if (!activity.location.atClub || activity.startTime === null) {
    return { conflicts: [], trainingBookings: [] };
  }
  const start = activity.startTime;
  const end = activity.endTime ?? "24:00"; // without an end: until the next day at 00:00
  const conflicts: RingConflicts["conflicts"] = [];
  const trainingBookings: RingConflicts["trainingBookings"] = [];
  if (activity.ringIds.includes("ring-central") && overlaps(start, end, "18:30", "19:30")) {
    conflicts.push({
      bookedCount: 3,
      from: clubInstant(activity.date, "18:30", clubTimeZone),
      id: `class-${activity.date}-1830-central`,
      label: "B+C",
      ringId: "ring-central",
      to: clubInstant(activity.date, "19:30", clubTimeZone),
      type: "CLASS",
    });
  }
  // A manual ring block (S06/S09) on Petita, 4 October 17:00–21:00: never forceable (R-07-05).
  if (
    activity.date === "2026-10-04" &&
    activity.ringIds.includes("ring-petita") &&
    overlaps(start, end, "17:00", "21:00")
  ) {
    conflicts.push({
      from: clubInstant(activity.date, "17:00", clubTimeZone),
      id: "ring-block-2026-10-04-petita",
      label: "Manteniment de la pista",
      ringId: "ring-petita",
      to: clubInstant(activity.date, "21:00", clubTimeZone),
      type: "RING_BLOCK",
    });
  }
  if (activity.ringIds.includes("ring-muntanya") && overlaps(start, end, "19:00", "19:30")) {
    trainingBookings.push({
      bookingId: `training-${activity.date}-1900-muntanya`,
      dogName: "Blat",
      from: clubInstant(activity.date, "19:00", clubTimeZone),
      memberName: "Pau Soler",
      ringId: "ring-muntanya",
      to: clubInstant(activity.date, "19:30", clubTimeZone),
    });
  }
  return { conflicts, trainingBookings };
}

export function cancellationPreview(
  activityId: string,
  smsModule: boolean,
): ActivityCancellationPreview {
  const live = liveRegistrations(activityId);
  return {
    activeCount: live.filter((registration) => registration.state === "ACTIVE").length,
    registrations: live.map((registration) => ({
      channels:
        smsModule && registration.member.phones.length > 0
          ? ["APP", "EMAIL", "SMS"]
          : ["APP", "EMAIL"],
      memberName: registration.member.fullName,
      phoneCount: registration.member.phones.length,
      registrationId: registration.id,
      state: registration.state,
    })),
    waitingCount: live.filter((registration) => registration.state === "WAITLISTED").length,
  };
}

export const MOCK_ACTIVITY_ACCOUNT = MOCK_ADMIN_ACCOUNT;

/** R-07-02: «Torneig d'Estiu 2026» → `torneig-estiu-2026`; «-2», «-3»… when taken. */
export function slugFor(title: string): string {
  const base =
    title
      .normalize("NFD")
      .replaceAll(/\p{Diacritic}/gu, "")
      .toLocaleLowerCase()
      .replaceAll(/\b(d|l)['’]/gu, "")
      .replaceAll(/[^a-z0-9]+/gu, "-")
      .replaceAll(/^-+|-+$/gu, "")
      .slice(0, 80) || "activitat";
  let candidate = base;
  let suffix = 2;
  while (activityState.activities.some((activity) => activity.slug === candidate)) {
    candidate = `${base}-${String(suffix)}`;
    suffix += 1;
  }
  return candidate;
}
