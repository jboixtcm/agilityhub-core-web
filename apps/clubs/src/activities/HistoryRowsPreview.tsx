import { ActivityHistoryRow } from "./ActivityHistoryRow";
import type { ActivityRegistrationSummary } from "./shared";

/**
 * Development-only preview of the screen 25 activity rows (`/_gallery/historic-activitats`,
 * never built for production): `/me/history` and the page are S10/E6, so the evidence of the
 * row component is taken here with fictional contract-typed data.
 */
export function HistoryRowsPreview() {
  // The fictional rows live inside the component: module-level objects (with spreads) would
  // survive tree-shaking and ship in the production bundle.
  const done: ActivityRegistrationSummary = {
    activity: {
      endsAtLocal: "2025-07-12T13:00",
      id: "activity-seminari-obstacles",
      placeLabel: "Central",
      startsAtLocal: "2025-07-12T09:00",
      title: "Seminari d'obstacles",
    },
    activityId: "activity-seminari-obstacles",
    cancellableUntil: "2025-07-12T07:00:00Z",
    id: "registration-preview-done",
    origin: "APP",
    registeredAt: "2025-07-01T08:00:00Z",
    state: "ACTIVE",
  };

  const cancelledByClub: ActivityRegistrationSummary = {
    activity: {
      endsAtLocal: "2025-07-19T12:00",
      id: "activity-lliga-social-2",
      placeLabel: "totes les pistes",
      startsAtLocal: "2025-07-19T09:00",
      title: "Lliga social — 2a jornada",
    },
    activityId: "activity-lliga-social-2",
    cancellableUntil: "2025-07-19T07:00:00Z",
    cancellation: { at: "2025-07-18T17:00:00Z", byRole: "SYSTEM", reason: "ACTIVITY_CANCELLED" },
    id: "registration-preview-club",
    origin: "APP",
    registeredAt: "2025-07-02T08:00:00Z",
    state: "CANCELLED",
  };

  const cancelled: ActivityRegistrationSummary = {
    ...done,
    activity: { ...done.activity, startsAtLocal: "2025-07-05T09:00", title: "Curset de salts" },
    cancellation: { at: "2025-07-01T09:00:00Z", byRole: "MEMBER", reason: "MEMBER" },
    id: "registration-preview-cancelled",
    state: "CANCELLED",
  };
  return (
    <section className="activities-screen activities-screen--preview">
      <ActivityHistoryRow
        activityState="CANCELLED"
        adminText="Pluja forta: pistes tancades"
        registration={cancelledByClub}
      />
      <ActivityHistoryRow activityState="FINISHED" registration={done} />
      <ActivityHistoryRow activityState="FINISHED" registration={cancelled} />
    </section>
  );
}
