import type { components } from "../../generated/schema";

type EmailByCategory = components["schemas"]["EmailByCategory"];
type MeNotification = components["schemas"]["MeNotification"];
type NotificationActionType = components["schemas"]["NotificationActionType"];
type NotificationCategory = components["schemas"]["NotificationCategory"];
type NotificationChannel = components["schemas"]["NotificationChannel"];
type TemplateColor = components["schemas"]["TemplateColor"];
type TemplateIcon = components["schemas"]["TemplateIcon"];

/**
 * The club-local instant screen 11's mockup times are read at: Sunday 2 August 2026, 18:00
 * (Europe/Madrid), the afternoon of the S08 world (`BOOKING_MOCK_NOW`, noon). N-08a is «fa 2 min»,
 * N-15 «fa 4 min», N-19 and N-16 «avui 8:00» and «avui 7:00», N-09 and N-06 «ahir 19:12» and
 * «ahir 18:40». The Playwright and Vitest suites of screen 11 pin their clock here.
 */
export const NOTIFICATIONS_MOCK_NOW = "2026-08-02T18:00:00+02:00";

/**
 * The S08 ids the feed's actions name (the booking world's own): Laura's Duna and Rock, Duna's
 * waiting entry for Thursday 6 at 20:00 (N-15), and Rock's Tuesday 4 training (N-06).
 */
export const FEED_IDS = {
  duna: "dog-duna",
  rock: "dog-rock",
  thu6Class: "class-2026-08-06-2000",
  thu6Entry: "waitlist-duna-thu6",
  tue4Training: "training-rock-tue4",
} as const;

/** The mock tokens of the «Deixar de rebre aquests comunicats» link (R-11-08, api E7-T02). */
export const UNSUBSCRIBE_TOKENS = {
  expired: "mock-unsubscribe-expired",
  valid: "mock-unsubscribe-valid",
} as const;

/** A feed item as stored: the rendered, frozen texts and the action without its read-time `enabled`. */
export interface StoredFeedItem {
  action: { params: Record<string, string>; type: NotificationActionType } | null;
  body: string;
  category: NotificationCategory;
  /** The channels that reached the member (the api lists APP, and SMS/PUSH when SENT/DELIVERED). */
  channels: NotificationChannel[];
  code: string;
  color: TemplateColor;
  createdAt: string;
  icon: TemplateIcon;
  id: string;
  readAt: string | null;
  title: string;
}

export interface StoredPushSubscription {
  endpoint: string;
  id: string;
  status: "ACTIVE" | "EXPIRED";
}

export interface StoredPreferences {
  emailByCategory: EmailByCategory;
  pushClubNews: boolean;
  reminderMinutesBefore: number | null;
}

/**
 * `empty`: nothing in the feed yet (11's empty state). `seatTaken`: another member took Duna's
 * seat, so N-15's entry is not NOTIFIED any more and [AGAFA LA PLAÇA] reads disabled.
 */
export type NotificationsVariant = "default" | "empty" | "seatTaken";

export interface NotificationWorld {
  items: StoredFeedItem[];
  /** Whether N-15's waiting entry was notified in the S08 world (drawn with the feed). */
  entryNotified: boolean;
  preferences: StoredPreferences;
  sequence: number;
  subscriptions: StoredPushSubscription[];
  variant: NotificationsVariant;
}

/** The product defaults (R-11-04): Operativa OFF · the rest ON · no reminder · push of club news ON. */
export function defaultPreferences(): StoredPreferences {
  return {
    emailByCategory: { CLUB_CHANGES: true, CLUB_NEWS: true, OPERATIONAL: false, PERSONAL: true },
    pushClubNews: true,
    reminderMinutesBefore: null,
  };
}

/** The six cards of mockup 11 with the `ca` texts of S11 §8, verbatim, newest first (R-11-10). */
function mockupItems(): StoredFeedItem[] {
  return [
    {
      action: { params: { dogId: FEED_IDS.duna }, type: "CHANGE_CLASS" },
      body: "Dimecres 12 · 18:50 · B+C · Central, amb Duna. «La classe queda anul·lada per la pluja. Podeu reservar-ne una altra des de l'app. Disculpeu les molèsties!» — Cànic Agility. Aquesta sessió no compta al teu còmput.",
      category: "CLUB_CHANGES",
      // The SMS is SENT (no Twilio callback at R1); the e-mail is never listed (api E7-T03).
      channels: ["APP", "SMS"],
      code: "N-08a",
      color: "ERROR",
      createdAt: "2026-08-02T15:58:00Z",
      icon: "x",
      id: "notification-n08a",
      readAt: null,
      title: "Classe anul·lada pel club",
    },
    {
      action: {
        params: {
          classSessionId: FEED_IDS.thu6Class,
          dogId: FEED_IDS.duna,
          waitlistEntryId: FEED_IDS.thu6Entry,
        },
        type: "CLAIM_SEAT",
      },
      body: "Classe C i superiors · dijous 6 · 20:00. Estàs a la llista d'espera — la plaça és per a qui confirmi primer.",
      category: "OPERATIONAL",
      // Mockup 11 prints no «i per SMS» here: this member's SMS was not sent.
      channels: ["APP", "PUSH"],
      code: "N-15",
      color: "ACCENT",
      createdAt: "2026-08-02T15:56:00Z",
      icon: "unlock",
      id: "notification-n15",
      readAt: null,
      title: "S'ha alliberat una plaça!",
    },
    {
      action: null,
      body: "Ahir no vas poder venir a la classe de B+C. Recorda que pots anul·lar des de l'app fins a última hora: així pot aprofitar la classe algú altre. La sessió compta dins el teu còmput.",
      category: "PERSONAL",
      channels: ["APP"],
      code: "N-19",
      color: "NEUTRAL",
      createdAt: "2026-08-02T06:00:00Z",
      icon: "heart",
      id: "notification-n19",
      readAt: "2026-08-02T06:40:00Z",
      title: "T'hem trobat a faltar",
    },
    {
      action: { params: { dogId: FEED_IDS.duna }, type: "CHANGE_CLASS" },
      body: "Demà 9:30 B+C esteu sols. Si ningú més no s'hi apunta abans de les 7:30 de demà, la classe es cancel·larà. Et proposem reservar-ne una altra.",
      category: "CLUB_CHANGES",
      channels: ["APP"],
      code: "N-16",
      color: "WARNING",
      createdAt: "2026-08-02T05:00:00Z",
      icon: "warn",
      id: "notification-n16",
      readAt: "2026-08-02T06:40:00Z",
      title: "Possible anul·lació de classe",
    },
    {
      action: { params: { dogId: FEED_IDS.rock }, type: "OPEN_DOG" },
      body: "Per la vostra evolució, en Rock ja ha pujat a nivell D. Ja podeu reservar classes en aquest nou nivell; les classes que ja teníeu reservades, encara que no siguin d'aquest nivell, segueixen sent vàlides.",
      category: "PERSONAL",
      channels: ["APP"],
      code: "N-09",
      color: "OK",
      createdAt: "2026-08-01T17:12:00Z",
      icon: "up",
      id: "notification-n09",
      readAt: "2026-08-01T19:30:00Z",
      title: "En Rock puja de nivell!",
    },
    {
      action: { params: { trainingBookingId: FEED_IDS.tue4Training }, type: "OPEN_BOOKING" },
      body: "Entrenament lliure · dt 4 · 8:00–8:30 · Muntanya · amb Rock.",
      category: "OPERATIONAL",
      channels: ["APP"],
      code: "N-06",
      color: "OK",
      createdAt: "2026-08-01T16:40:00Z",
      icon: "check",
      id: "notification-n06",
      readAt: "2026-08-01T19:30:00Z",
      title: "Reserva confirmada",
    },
  ];
}

/** The older, read notifications behind the mockup's six: 18 more, one a day back from 31 July. */
function olderItems(): StoredFeedItem[] {
  const kinds: readonly Omit<StoredFeedItem, "createdAt" | "id" | "readAt">[] = [
    {
      action: { params: { bookingId: "booking-duna-mon3" }, type: "OPEN_BOOKING" },
      body: "Classe B+C · dilluns 3 · 18:50 · Central · amb Duna.",
      category: "OPERATIONAL",
      channels: ["APP"],
      code: "N-04",
      color: "OK",
      icon: "check",
      title: "Reserva confirmada",
    },
    {
      action: { params: { bookingId: "booking-duna-mon3" }, type: "OPEN_BOOKING" },
      body: "Dilluns 27 a les 18:50 · B+C · Central · amb Duna.",
      category: "OPERATIONAL",
      channels: ["APP", "PUSH"],
      code: "N-13",
      color: "NEUTRAL",
      icon: "clock",
      title: "Recordatori de classe",
    },
    {
      action: null,
      body: "Aquest dissabte la pista Central estarà tancada al matí per manteniment. Gràcies per la vostra comprensió!",
      category: "CLUB_NEWS",
      channels: ["APP", "PUSH"],
      code: "N-24",
      color: "NEUTRAL",
      icon: "bell",
      title: "Pista Central tancada dissabte",
    },
    {
      // An older N-15 whose entry is gone: `enabled` is false on reading (R-11-11).
      action: {
        params: {
          classSessionId: "class-2026-07-23-2000",
          dogId: FEED_IDS.duna,
          waitlistEntryId: "waitlist-duna-jul23",
        },
        type: "CLAIM_SEAT",
      },
      body: "Classe C i superiors · dijous 23 · 20:00. Estàs a la llista d'espera — la plaça és per a qui confirmi primer.",
      category: "OPERATIONAL",
      channels: ["APP", "PUSH"],
      code: "N-15",
      color: "ACCENT",
      icon: "unlock",
      title: "S'ha alliberat una plaça!",
    },
    {
      action: { params: { dogId: FEED_IDS.duna, taskId: "task-duna-slalom" }, type: "OPEN_TASKS" },
      body: "Tens una tasca nova per a la Duna: practicar l'entrada de l'eslàlom.",
      category: "PERSONAL",
      channels: ["APP"],
      code: "N-20",
      color: "NEUTRAL",
      icon: "doc",
      title: "Nova tasca",
    },
    {
      action: { params: { trainingBookingId: FEED_IDS.tue4Training }, type: "OPEN_BOOKING" },
      body: "Entrenament lliure · dc 22 · 8:00–8:30 · Muntanya · amb Rock.",
      category: "OPERATIONAL",
      channels: ["APP"],
      code: "N-06",
      color: "OK",
      icon: "check",
      title: "Reserva confirmada",
    },
  ];
  return Array.from({ length: 18 }, (_, index) => index).flatMap((index) => {
    const kind = kinds[index % kinds.length];
    if (kind === undefined) return [];
    const day = new Date(Date.UTC(2026, 6, 31 - index, 16, 30));
    return [
      {
        ...kind,
        createdAt: day.toISOString().replace(".000Z", "Z"),
        id: `notification-older-${String(index + 1).padStart(2, "0")}`,
        readAt: new Date(day.getTime() + 3_600_000).toISOString().replace(".000Z", "Z"),
      },
    ];
  });
}

export function initialFeedItems(variant: NotificationsVariant): StoredFeedItem[] {
  return variant === "empty" ? [] : [...mockupItems(), ...olderItems()];
}

export const notificationState: NotificationWorld = {
  entryNotified: false,
  items: initialFeedItems("default"),
  preferences: defaultPreferences(),
  sequence: 0,
  subscriptions: [],
  variant: "default",
};

export function resetNotificationState(variant: NotificationsVariant = "default"): void {
  notificationState.entryNotified = false;
  notificationState.items = initialFeedItems(variant);
  notificationState.preferences = defaultPreferences();
  notificationState.sequence = 0;
  notificationState.subscriptions = [];
  notificationState.variant = variant;
}

// In the browser the handlers live in the page: the world survives a full page load (the bell's
// link, a tab) through the tab's session storage, like the booking world does.
const STORAGE_KEY = "agilityhub.mockNotifications";
let worldScenario: string | undefined;

function tabStorage(): Storage | undefined {
  const storage: unknown = Reflect.get(globalThis, "sessionStorage");
  return typeof storage === "object" && storage !== null ? (storage as Storage) : undefined;
}

export function persistNotificationWorld(): void {
  try {
    tabStorage()?.setItem(
      STORAGE_KEY,
      JSON.stringify({ scenario: worldScenario, world: notificationState }),
    );
  } catch {
    // Node tests and privacy-restricted browsers run without persistent mock state.
  }
}

function restore(scenario: string): boolean {
  try {
    const serialized = tabStorage()?.getItem(STORAGE_KEY);
    if (serialized === null || serialized === undefined) return false;
    const saved = JSON.parse(serialized) as { scenario?: string; world?: NotificationWorld };
    if (saved.scenario !== scenario || saved.world === undefined) return false;
    Object.assign(notificationState, saved.world);
    return true;
  } catch {
    return false;
  }
}

/** The world of `scenario` (drawn, or restored from the tab, on its first read). */
export function notificationWorld(
  scenario: string,
  variant: NotificationsVariant,
): NotificationWorld {
  if (worldScenario !== scenario) {
    worldScenario = scenario;
    if (!restore(scenario)) resetNotificationState(variant);
  }
  return notificationState;
}

/** Forgets the drawn world (tests call it between cases). */
export function forgetNotificationWorld(): void {
  worldScenario = undefined;
  resetNotificationState();
  try {
    tabStorage()?.removeItem(STORAGE_KEY);
  } catch {
    // Nothing stored.
  }
}

/** `unreadCount` (R-11-10): the notifications without `readAt`, the same count `GET /me/home` sends. */
export function feedUnreadCount(world: NotificationWorld): number {
  return world.items.filter((item) => item.readAt === null).length;
}

/** A stored item as `GET /me/notifications` sends it, with its read-time `enabled`. */
export function meNotification(item: StoredFeedItem, enabled: boolean): MeNotification {
  return {
    action: item.action === null ? null : { ...item.action, enabled },
    body: item.body,
    category: item.category,
    channels: [...item.channels],
    code: item.code,
    color: item.color,
    createdAt: item.createdAt,
    icon: item.icon,
    id: item.id,
    readAt: item.readAt,
    title: item.title,
  };
}
