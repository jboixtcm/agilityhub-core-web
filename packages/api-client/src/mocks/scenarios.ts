import type { components } from "../generated/schema";

import type { AttendanceVariant } from "./fixtures/attendance";
import type { BillingVariant } from "./fixtures/billing";
import brandingCanic from "./fixtures/branding-canic.json";
import brandingMinim from "./fixtures/branding-minim.json";
import type { FollowupVariant, HistoryVariant, InboxVariant } from "./fixtures/followup";
import meAdmin from "./fixtures/me-admin.json";
import meImpersonated from "./fixtures/me-impersonated.json";
import meInstructor from "./fixtures/me-instructor.json";
import meMember from "./fixtures/me-member.json";
import meMultiProfile from "./fixtures/me-multi-profile.json";
import type { NotificationsVariant } from "./fixtures/notifications";
import { importedAccountOnboarding, policyReconsentOnboarding } from "./fixtures/onboarding";
import sessions from "./fixtures/sessions.json";
import type { SignupReviewVariant } from "./fixtures/signup-review";

type Branding = components["schemas"]["BrandingResponse"];
type Me = components["schemas"]["Me"];
type SessionList = components["schemas"]["Session"][];
type OnboardingState = components["schemas"]["OnboardingState"];

export interface MockScenarioDefinition {
  /** The S10 world's club-wide variant (`fixtures/attendance.ts`, screens 20–22). */
  attendance?: AttendanceVariant;
  /**
   * The S12 world of D6 (`fixtures/billing.ts`, E8-W01): the club's payment providers and the
   * month's state. Default: the Cànic's SEPA + cash with the mockup's generated September.
   */
  billing?: BillingVariant;
  branding: Branding;
  /**
   * S08 R-08-09, the limit worlds (`fixtures/bookings.ts`), both at 2 of 2 (R-08-03): `swap`
   * (mockup 06), Duna has two cancellable bookings this week, so a hold proposes the swap; `done`
   * (mockup 29), her week holds two classes, both done at `BOOKING_LIMIT_DONE_NOW`, so the hold is
   * refused (at `BOOKING_MOCK_NOW` only Sunday 2's has begun: 06 with its inert row).
   */
  bookingLimit?: "done" | "swap";
  dashboardNulls?: boolean;
  /** Every list export answers `202 {jobId, statusUrl}`, as above `ExportPolicy.syncMaxRows` (R-14-12). */
  exportsQueued?: boolean;
  /**
   * S10 (E6-W02): `stale` — another instructor saves the observations just before the caller
   * (409); `many` — Duna has 52 tasks, more than one page of `GET /tasks`.
   */
  followup?: FollowupVariant;
  /** The screen 25 variant of `GET /me/history` (`fixtures/followup.ts`). */
  history?: HistoryVariant;
  /** The D14 variant (`fixtures/followup.ts`): the caller has read every row already. */
  inbox?: InboxVariant;
  me: Me;
  /** S12/S13 member/D10 variants added by E8-W02. */
  memberBilling?: "cardInvalid" | "deadlinePassed" | "noInactivity" | "packPlan" | "plannedLeave";
  /** S13 admin lifecycle variants used by D10 and `/inactivitats`. */
  lifecycle?:
    | "inactivityNoCancelBookings"
    | "inactivityDeadlinePassed"
    | "leaveDateInvalid"
    | "memberLeft"
    | "memberPackPlan";
  /** The S11 feed variant of screen 11 (`fixtures/notifications.ts`, E7-W02). */
  notifications?: NotificationsVariant;
  sessions: SessionList;
  invalidMagicLink?: boolean;
  /** Parameter `levels.enabled` (R-06-15); default true. */
  levelsEnabled?: boolean;
  /** Parameter `classes.maxInstructorsPerClass` (R-06-15); default 1. */
  maxInstructorsPerClass?: number;
  onboarding?: OnboardingState;
  outdatedConsentOnce?: boolean;
  rateLimited?: boolean;
  signupStripe?: boolean;
  /** Parameter `signup.allowFamilyGroupPending` (R-04-12); default true. */
  signupFamilyPendingAllowed?: boolean;
  /** Parameter `signup.requireDogDocumentAtSignup` (R-04-08); default false. */
  signupRequireDogDocument?: boolean;
  /** The club's date `GET /signup` quotes for (R-04-15); default `SIGNUP_MOCK_TODAY` (17-08-2026). */
  signupToday?: string;
  /** R-04-09 (S05 B34): the member adding a dog has no plan, so 17 offers the plans to choose. */
  signupMemberWithoutPlan?: boolean;
  /** The D2 variant of the Marta Roca signup (`fixtures/signup-review.ts`). */
  signupReview?: SignupReviewVariant;
  /** The S09 world (`fixtures/training.ts`): Rock at the limit, or no dog with the right. */
  training?: "atLimit" | "atLimitNone" | "default" | "noRight";
}

const canic = brandingCanic as Branding;
const minimal = brandingMinim as Branding;
const admin = meAdmin as Me;
const member = meMember as Me;
const multiProfile = meMultiProfile as Me;
const accountSessions = sessions;
const adminMembership = admin.membership;
const memberMembership = member.membership;

if (adminMembership === undefined || memberMembership === undefined) {
  throw new TypeError("The admin and member mock fixtures require a club membership");
}

/**
 * The club the mock worlds' records belong to: the tenant of the fixtures' memberships (the JWT's
 * club). A token of another club finds none of them (`adminOtherClub`, E5-W05 step 16).
 */
export const MOCK_CLUB_ID = adminMembership.clubId;

const scenarios = {
  admin: {
    branding: canic,
    me: meAdmin as Me,
    sessions: accountSessions,
  },
  adminAllLocales: {
    branding: { ...canic, locales: ["ca", "es", "en"] },
    me: meAdmin as Me,
    sessions: accountSessions,
  },
  /**
   * E5-W05 step 5: the ring-usage register with more than 1000 rows in the week of Monday 3, where
   * one member and one ring appear only after row 1000 (`backoffice-handlers.ts`).
   */
  registerMany: {
    branding: canic,
    me: meAdmin as Me,
    sessions: accountSessions,
  },
  /** The list exports take the queued path (`202`) instead of the inline file. */
  adminExportsQueued: {
    branding: { ...canic, locales: ["ca", "es", "en"] },
    exportsQueued: true,
    me: meAdmin as Me,
    sessions: accountSessions,
  },
  /**
   * S12 R-12-28 (E8-W01): a club paying by hand only (`MANUAL`): D6's button 2 reads «2 · GENERA
   * ELS REBUTS», September is simulated and not generated yet, and a run makes no remittance.
   */
  billingManualOnly: {
    billing: "manualOnly",
    branding: { ...canic, locales: ["ca", "es", "en"] },
    me: meAdmin as Me,
    sessions: accountSessions,
  },
  /**
   * S12 R-12-13 (E8-W01): a card club (`STRIPE` + `MANUAL`): the card KPI, September generated and
   * its cards not charged yet ([COBRA LES TARGETES]); charging declines one card («impagat
   * (targeta)») and finds another withdrawn.
   */
  billingStripe: {
    billing: "stripe",
    branding: { ...canic, locales: ["ca", "es", "en"] },
    me: meAdmin as Me,
    sessions: accountSessions,
  },
  /**
   * S12 R-12-14 (E8-W01): the month reads rollbackable, but another admin marks the remittance as
   * sent just before the rollback: `409 RUN_NOT_ROLLBACKABLE {reasons: [REMITTANCE_SUBMITTED]}`.
   */
  billingRollbackBlocked: {
    billing: "rollbackBlocked",
    branding: { ...canic, locales: ["ca", "es", "en"] },
    me: meAdmin as Me,
    sessions: accountSessions,
  },
  /**
   * S12 R-12-29 (E8-W01): an ADMIN of another club with BILLING on, so the billing routes answer by
   * tenant (404, an empty month), not by module.
   */
  billingOtherClub: {
    branding: {
      ...minimal,
      locales: ["ca", "es", "en"],
      modules: [...minimal.modules, "BILLING"],
    },
    me: {
      ...admin,
      membership: { ...adminMembership, clubId: "50000000-0000-4000-8000-000000000002" },
    },
    sessions: accountSessions,
  },
  /** S12 R-12-07 (E8-W01): September's simulation is older than the last change (409 SIMULATION_STALE). */
  billingStale: {
    billing: "stale",
    branding: { ...canic, locales: ["ca", "es", "en"] },
    me: meAdmin as Me,
    sessions: accountSessions,
  },
  /** S03 R-03-30 (INC-27): a club without BILLING, read by its ADMIN (D10 without invoices). */
  adminNoBilling: {
    branding: {
      ...canic,
      locales: ["ca", "es", "en"],
      modules: canic.modules.filter((module) => module !== "BILLING"),
    },
    me: meAdmin as Me,
    sessions: accountSessions,
  },
  inactivityNoCancelBookings: {
    branding: { ...canic, locales: ["ca", "es", "en"] },
    lifecycle: "inactivityNoCancelBookings",
    me: meAdmin as Me,
    sessions: accountSessions,
  },
  inactivityOff: {
    branding: {
      ...canic,
      locales: ["ca", "es", "en"],
      modules: canic.modules.filter((module) => module !== "INACTIVITY"),
    },
    me: meAdmin as Me,
    sessions: accountSessions,
  },
  adminMemberPackPlan: {
    branding: { ...canic, locales: ["ca", "es", "en"] },
    lifecycle: "memberPackPlan",
    me: meAdmin as Me,
    sessions: accountSessions,
  },
  leaveDateInvalid: {
    branding: { ...canic, locales: ["ca", "es", "en"] },
    lifecycle: "leaveDateInvalid",
    me: meAdmin as Me,
    sessions: accountSessions,
  },
  memberLeft: {
    branding: { ...canic, locales: ["ca", "es", "en"] },
    lifecycle: "memberLeft",
    me: meAdmin as Me,
    sessions: accountSessions,
  },
  inactivityDeadlinePassed: {
    branding: { ...canic, locales: ["ca", "es", "en"] },
    lifecycle: "inactivityDeadlinePassed",
    me: meAdmin as Me,
    sessions: accountSessions,
  },
  adminDashboardNulls: {
    branding: canic,
    dashboardNulls: true,
    me: meAdmin as Me,
    sessions: accountSessions,
  },
  adminSignupReviewManual: {
    branding: canic,
    me: meAdmin as Me,
    sessions: accountSessions,
    signupReview: "manual",
  },
  adminSignupReviewAddDog: {
    branding: canic,
    me: meAdmin as Me,
    sessions: accountSessions,
    signupReview: "addDog",
  },
  adminSignupReviewFamilyPending: {
    branding: canic,
    me: meAdmin as Me,
    sessions: accountSessions,
    signupReview: "familyPending",
  },
  /** R-04-06 (E38): a pending readmission, with the LEFT record's values and the submitted ones. */
  adminSignupReviewReadmission: {
    branding: canic,
    me: meAdmin as Me,
    sessions: accountSessions,
    signupReview: "readmission",
  },
  /** R-04-06: the same readmission, and the reused dog's record has no card (E4-W17 step 2). */
  adminSignupReviewReadmissionNoCard: {
    branding: canic,
    me: meAdmin as Me,
    sessions: accountSessions,
    signupReview: "readmissionNoCard",
  },
  member: {
    branding: canic,
    me: member,
    sessions: accountSessions,
  },
  memberCardInvalid: {
    branding: { ...canic, locales: ["ca", "es", "en"] },
    me: { ...member, paymentMethod: { invalid: true, type: "CARD" } },
    memberBilling: "cardInvalid",
    sessions: accountSessions,
  },
  memberPackPlan: {
    branding: { ...canic, locales: ["ca", "es", "en"] },
    me: member,
    memberBilling: "packPlan",
    sessions: accountSessions,
  },
  memberPlannedLeave: {
    branding: { ...canic, locales: ["ca", "es", "en"] },
    me: member,
    memberBilling: "plannedLeave",
    sessions: accountSessions,
  },
  memberDeadlinePassed: {
    branding: { ...canic, locales: ["ca", "es", "en"] },
    me: member,
    memberBilling: "deadlinePassed",
    sessions: accountSessions,
  },
  memberNoInactivity: {
    branding: { ...canic, locales: ["ca", "es", "en"] },
    me: member,
    memberBilling: "noInactivity",
    sessions: accountSessions,
  },
  billingOff: {
    branding: {
      ...canic,
      locales: ["ca", "es", "en"],
      modules: canic.modules.filter((module) => module !== "BILLING"),
    },
    me: member,
    sessions: accountSessions,
  },
  /** S08 R-08-09 (mockup 06): the week's limit is reached with two cancellable bookings. */
  bookingLimit: {
    bookingLimit: "swap",
    branding: canic,
    me: member,
    sessions: accountSessions,
  },
  /**
   * S08 R-08-09 (mockup 29, «Si aquesta setmana ja has fet les 2 classes»): Duna's week holds Sunday
   * 2's class and Monday 3's; read at `BOOKING_LIMIT_DONE_NOW` both are done, nothing can be swapped
   * and the hold answers `409 BOOKING_LIMIT_REACHED` (E5-W05 round 3 #2). Read at `BOOKING_MOCK_NOW`
   * it is 06's inert row: Sunday 2's class has begun (DONE), Monday 3 is still swappable (E7-W07
   * round 2 #5a).
   */
  bookingLimitDone: {
    bookingLimit: "done",
    branding: canic,
    me: member,
    sessions: accountSessions,
  },
  /** S08 §9 `WAITLIST` off: full classes read «Completa» (inert), no waiting rows on 03. */
  bookingNoWaitlist: {
    branding: { ...canic, modules: canic.modules.filter((module) => module !== "WAITLIST") },
    me: member,
    sessions: accountSessions,
  },
  /** S08 R-08-18 `SINGLE_CLASS`: Duna's plan pays to book, Rock's is charged on the receipt. */
  bookingSingleClass: {
    branding: {
      ...canic,
      locales: ["ca", "es", "en"],
      modules: [...canic.modules, "SINGLE_CLASS"],
    },
    me: member,
    sessions: accountSessions,
  },
  /** Screen 10 empty state: `GET /day-grid` answers `rows: []` for every date. */
  dayGridEmpty: {
    branding: canic,
    me: member,
    sessions: accountSessions,
  },
  /** A member of a club with `levels.enabled = false`: `GET /me/dogs` carries no `level` (R-03-30). */
  memberNoLevels: {
    branding: canic,
    levelsEnabled: false,
    me: member,
    sessions: accountSessions,
  },
  planningNoLevels: {
    branding: canic,
    levelsEnabled: false,
    me: meAdmin as Me,
    sessions: accountSessions,
  },
  planningTwoInstructors: {
    branding: canic,
    maxInstructorsPerClass: 2,
    me: meAdmin as Me,
    sessions: accountSessions,
  },
  instructor: {
    branding: canic,
    me: meInstructor as Me,
    sessions: accountSessions,
  },
  /** S10 R-10-04: another instructor saves the 8:30 sheet just before the caller (409). */
  attendanceStale: {
    attendance: "stale",
    branding: canic,
    me: meInstructor as Me,
    sessions: accountSessions,
  },
  /** S10 R-10-03: the sheets read after T1 (circles inert, `ATTENDANCE_WINDOW_CLOSED`). */
  attendanceClosed: {
    attendance: "closed",
    branding: canic,
    me: meInstructor as Me,
    sessions: accountSessions,
  },
  /** S10 R-10-03: `bookings.instructorLastMinuteNotice = false` (no yellow circle). */
  attendanceNoticeDisabled: {
    attendance: "noticeDisabled",
    branding: canic,
    me: meInstructor as Me,
    sessions: accountSessions,
  },
  /** S10 R-10-05: `waitlist.mode = FIFO` (21's rule sentence with `fifoConfirmMinutes`). */
  attendanceFifo: {
    attendance: "fifo",
    branding: canic,
    me: meInstructor as Me,
    sessions: accountSessions,
  },
  /** S10 §9: an instructor of a club without TASKS (no task lines, no blocks on 22). */
  instructorNoTasks: {
    branding: { ...canic, modules: canic.modules.filter((module) => module !== "TASKS") },
    me: meInstructor as Me,
    sessions: accountSessions,
  },
  /** S10 R-10-14 (E6-W02): a member with a single accessible dog (`showDog: false`, no chips on 25). */
  historySingleDog: {
    branding: canic,
    history: "singleDog",
    me: member,
    sessions: accountSessions,
  },
  /** S10 §9: a club without FREE_TRAINING and ACTIVITIES (25 without their chips and rows). */
  historyNoModules: {
    branding: {
      ...canic,
      modules: canic.modules.filter(
        (module) => module !== "FREE_TRAINING" && module !== "ACTIVITIES",
      ),
    },
    me: member,
    sessions: accountSessions,
  },
  /** R-10-14: every detail line (a future cancellation on top, «ha avisat», club, system…). */
  historyAllReasons: {
    branding: canic,
    history: "allReasons",
    me: member,
    sessions: accountSessions,
  },
  /** R-10-14: nothing in the window yet (25's empty state, §13-11). */
  historyEmpty: {
    branding: canic,
    history: "empty",
    me: member,
    sessions: accountSessions,
  },
  /** S10 §9 (D12): an ADMIN of a club without FREE_TRAINING (no `TRAINING` cells). */
  agendaNoTraining: {
    branding: { ...canic, modules: canic.modules.filter((module) => module !== "FREE_TRAINING") },
    me: meAdmin as Me,
    sessions: accountSessions,
  },
  /** S10 R-10-13 (D14): the instructor has read every row already (counter 0, no highlight). */
  followupAllRead: {
    branding: canic,
    inbox: "allRead",
    me: meInstructor as Me,
    sessions: accountSessions,
  },
  /** S10 R-10-12: another instructor saves Duna's observations just before the caller (409). */
  tasksStale: {
    branding: canic,
    followup: "stale",
    me: meInstructor as Me,
    sessions: accountSessions,
  },
  /** S11 R-11-17 (E7-W01): an ADMIN of a club without SMS (D9 hides the SMS column, D10 «+SMS»). */
  messagingNoSms: {
    branding: { ...canic, modules: canic.modules.filter((module) => module !== "SMS") },
    me: meAdmin as Me,
    sessions: accountSessions,
  },
  /** S11 R-11-17 (E7-W01): an ADMIN of a club without PUSH (no Push column, no push toggle). */
  messagingNoPush: {
    branding: {
      ...canic,
      modules: canic.modules.filter((module) => module !== "PUSH"),
      pushPublicKey: null,
    },
    me: meAdmin as Me,
    sessions: accountSessions,
  },
  /** S11 R-11-17 (E7-W02): a member of a club without SMS (no «+SMS» on 12, never «i per SMS»). */
  memberNoSms: {
    branding: { ...canic, modules: canic.modules.filter((module) => module !== "SMS") },
    me: member,
    sessions: accountSessions,
  },
  /** S11 R-11-17 (E7-W02): a member of a club without PUSH (no push toggle on 12, 404 on subscribe). */
  memberNoPush: {
    branding: {
      ...canic,
      modules: canic.modules.filter((module) => module !== "PUSH"),
      pushPublicKey: null,
    },
    me: member,
    sessions: accountSessions,
  },
  /** S11 R-11-14 (E7-W02): a member of a club without FAQ (30 keeps its club pages). */
  faqOff: {
    branding: { ...canic, modules: canic.modules.filter((module) => module !== "FAQ") },
    me: member,
    sessions: accountSessions,
  },
  /**
   * S11 R-11-17 (E7-W02): the Cànic fixture carries LEARN_LINK, so `member` is the «on» case; this
   * club has it off (no «Aprèn amb AgilityHub» row on 12).
   */
  learnLinkOff: {
    branding: { ...canic, modules: canic.modules.filter((module) => module !== "LEARN_LINK") },
    me: member,
    sessions: accountSessions,
  },
  /** S11 §2 row 11 (E7-W02): nothing in the feed yet («Encara no tens cap avís»). */
  notificationsEmpty: {
    branding: canic,
    me: member,
    notifications: "empty",
    sessions: accountSessions,
  },
  /** S11 R-11-11 (E7-W02): N-15's seat was taken, so its [AGAFA LA PLAÇA] reads disabled. */
  notificationsSeatTaken: {
    branding: canic,
    me: member,
    notifications: "seatTaken",
    sessions: accountSessions,
  },
  /**
   * S10 R-10-13 (D14, E6-W03 round 2 #5): an ADMIN with 52 more unread notes than mockup D14, so
   * the first page of `GET /followup` holds only unread notes; the three tasks, read, are on page 2.
   */
  followupMany: {
    branding: canic,
    inbox: "many",
    me: meAdmin as Me,
    sessions: accountSessions,
  },
  /** S10 R-10-10: Duna has 52 tasks, so the two oldest are on the second page of `GET /tasks`. */
  tasksMany: {
    branding: canic,
    followup: "many",
    me: meInstructor as Me,
    sessions: accountSessions,
  },
  /** S10 §9: an instructor of a club without WAITLIST (no hourglass, no waiting list on 21). */
  instructorNoWaitlist: {
    branding: { ...canic, modules: canic.modules.filter((module) => module !== "WAITLIST") },
    me: meInstructor as Me,
    sessions: accountSessions,
  },
  /** S09 R-09-01: no dog of the member (nor of the group) may train alone (tab 08 absent). */
  trainingNoRight: {
    branding: { ...canic, locales: ["ca", "es", "en"] },
    me: member,
    sessions: accountSessions,
    training: "noRight",
  },
  /** S09 R-09-05: Rock at 3/3 this week, with two sessions still cancellable. */
  trainingAtLimit: {
    branding: { ...canic, locales: ["ca", "es", "en"] },
    me: member,
    sessions: accountSessions,
    training: "atLimit",
  },
  /** S09 R-09-05: Rock at 3/3 this week and none of them cancellable any more. */
  trainingAtLimitNoCancellable: {
    branding: { ...canic, locales: ["ca", "es", "en"] },
    me: member,
    sessions: accountSessions,
    training: "atLimitNone",
  },
  /** S09 §9 `FREE_TRAINING` off: no tab 08, and 24 offers only «Bloqueig». */
  trainingModuleOff: {
    branding: {
      ...canic,
      locales: ["ca", "es", "en"],
      modules: canic.modules.filter((module) => module !== "FREE_TRAINING"),
    },
    me: member,
    sessions: accountSessions,
  },
  trainingModuleOffInstructor: {
    branding: {
      ...canic,
      locales: ["ca", "es", "en"],
      modules: canic.modules.filter((module) => module !== "FREE_TRAINING"),
    },
    me: meInstructor as Me,
    sessions: accountSessions,
  },
  id: {
    branding: minimal,
    me: member,
    sessions: accountSessions,
  },
  minimal: {
    branding: minimal,
    me: member,
    sessions: accountSessions,
  },
  minimalAdmin: {
    branding: minimal,
    me: meAdmin as Me,
    sessions: accountSessions,
  },
  /**
   * S15 T-15-32: a club with every module of R1's processes — the Cànic plus `SINGLE_CLASS`, so
   * `GET /jobs` lists `payment-timeouts` (the Cànic has none): ten in a FIFO club, nine under the
   * mock's `waitlist.mode = ALL_AT_ONCE` (no `waitlist-fifo`, R-15-01).
   */
  jobsFullClub: {
    branding: {
      ...canic,
      locales: ["ca", "es", "en"],
      modules: [...canic.modules, "SINGLE_CLASS"],
    },
    me: meAdmin as Me,
    sessions: accountSessions,
  },
  /**
   * S15 T-15-32 «club mínim» (WAITLIST, FAQ, PUSH): eight processes in a FIFO club, `waitlist-fifo`
   * included; seven under `waitlist.mode = ALL_AT_ONCE`.
   */
  jobsMinimalClub: {
    branding: { ...minimal, locales: ["ca", "es", "en"] },
    me: meAdmin as Me,
    sessions: accountSessions,
  },
  /** S15 T-15-33: `GET /risk-review` without items («Cap classe en risc»). */
  riskReviewEmpty: {
    branding: canic,
    me: meAdmin as Me,
    sessions: accountSessions,
  },
  /**
   * E5-W05 step 16 (tenant isolation): an ADMIN of another club, the «club mínim» with WAITLIST and
   * FREE_TRAINING on (so its lists answer by tenant, not by module). The token's club is not the
   * one the mock worlds belong to, so none of their records is found.
   */
  adminOtherClub: {
    branding: {
      ...minimal,
      locales: ["ca", "es", "en"],
      modules: [...minimal.modules, "FREE_TRAINING"],
    },
    me: {
      ...admin,
      membership: { ...adminMembership, clubId: "50000000-0000-4000-8000-000000000002" },
    },
    sessions: accountSessions,
  },
  catalogsNoFaq: {
    branding: {
      ...canic,
      modules: canic.modules.filter((module) => module !== "FAQ"),
    },
    me: meAdmin as Me,
    sessions: accountSessions,
  },
  multiProfile: {
    branding: canic,
    me: multiProfile,
    sessions: accountSessions,
  },
  activationFemale: {
    branding: canic,
    me: multiProfile,
    sessions: accountSessions,
  },
  activationMale: {
    branding: canic,
    me: {
      ...member,
      account: { ...member.account, name: "Marc Puig" },
      membership: { ...memberMembership, gender: "MALE" },
    },
    sessions: accountSessions,
  },
  activationNonBinary: {
    branding: canic,
    me: {
      ...member,
      account: { ...member.account, name: "Àlex Roca" },
      membership: { ...memberMembership, gender: "OTHER" },
    },
    sessions: accountSessions,
  },
  activationReset: {
    branding: canic,
    me: member,
    sessions: accountSessions,
  },
  invalidMagicLink: {
    branding: canic,
    invalidMagicLink: true,
    me: member,
    sessions: accountSessions,
  },
  rateLimited: {
    branding: canic,
    me: member,
    rateLimited: true,
    sessions: accountSessions,
  },
  impersonated: {
    branding: canic,
    me: meImpersonated as Me,
    sessions: accountSessions,
  },
  /**
   * E5-W05 step 24 (ruling E73): a family group's account opened on another member's record. The
   * account is the parent's; `/me`'s `impersonation.memberName` names the member the admin opened.
   */
  impersonatedFamily: {
    branding: canic,
    me: {
      ...(meImpersonated as Me),
      account: { ...(meImpersonated as Me).account, name: "Marta Vidal Roca" },
      impersonation: { actorName: "Jordi Soler", memberName: "Laura Serra Vidal" },
    },
    sessions: accountSessions,
  },
  onboarding: {
    branding: canic,
    me: {
      ...member,
      account: { ...member.account, onboardingPending: true },
    },
    onboarding: importedAccountOnboarding,
    sessions: accountSessions,
  },
  onboardingAdmin: {
    branding: canic,
    me: {
      ...(meAdmin as Me),
      account: { ...(meAdmin as Me).account, onboardingPending: true },
    },
    onboarding: {
      ...importedAccountOnboarding,
      fields: importedAccountOnboarding.fields.map((field) =>
        field.key === "name" ? { ...field, value: "Aina Serra" } : field,
      ),
    },
    sessions: accountSessions,
  },
  policyReconsent: {
    branding: canic,
    me: {
      ...member,
      account: { ...member.account, onboardingPending: true },
    },
    onboarding: policyReconsentOnboarding,
    sessions: accountSessions,
  },
  policyReconsentOutdated: {
    branding: canic,
    me: {
      ...member,
      account: { ...member.account, onboardingPending: true },
    },
    onboarding: policyReconsentOnboarding,
    outdatedConsentOnce: true,
    sessions: accountSessions,
  },
  signup: {
    branding: { ...canic, locales: ["ca", "es", "en"] },
    me: member,
    sessions: accountSessions,
  },
  signupNoBilling: {
    branding: {
      ...canic,
      locales: ["ca", "es", "en"],
      modules: canic.modules.filter((module) => module !== "BILLING"),
    },
    me: member,
    sessions: accountSessions,
  },
  signupNoFamily: {
    branding: {
      ...canic,
      locales: ["ca", "es", "en"],
      modules: canic.modules.filter((module) => module !== "FAMILY_GROUP"),
    },
    me: member,
    sessions: accountSessions,
  },
  /** R-04-01 `GENERIC` country profile: `PASSPORT` / `OTHER` documents only. */
  signupGeneric: {
    branding: {
      ...canic,
      countryProfile: { code: "GENERIC", idDocumentTypes: ["PASSPORT", "OTHER"], phonePrefix: "" },
      locales: ["ca", "es", "en"],
    },
    me: member,
    sessions: accountSessions,
  },
  signupStripe: {
    branding: { ...canic, locales: ["ca", "es", "en"] },
    me: member,
    sessions: accountSessions,
    signupStripe: true,
  },
  /** R-04-09 (S05 B34): the member adding a dog has no plan and must choose one on 17. */
  signupMemberNoPlan: {
    branding: { ...canic, locales: ["ca", "es", "en"] },
    me: member,
    sessions: accountSessions,
    signupMemberWithoutPlan: true,
  },
  /** R-04-08: `signup.requireDogDocumentAtSignup = true` (a submission without a file is 422). */
  signupDocumentRequired: {
    branding: { ...canic, locales: ["ca", "es", "en"] },
    me: member,
    sessions: accountSessions,
    signupRequireDogDocument: true,
  },
  /** R-04-12: `signup.allowFamilyGroupPending = false` (a `leavePending` claim is 400). */
  signupNoFamilyPending: {
    branding: { ...canic, locales: ["ca", "es", "en"] },
    me: member,
    sessions: accountSessions,
    signupFamilyPendingAllowed: false,
  },
  /** R-04-15 before the split day: the club's «today» is 05-08-2026 (full month today, half on the 16th). */
  signupEarlyMonth: {
    branding: { ...canic, locales: ["ca", "es", "en"] },
    me: member,
    sessions: accountSessions,
    signupToday: "2026-08-05",
  },
  /**
   * S07 R-07-14 variants: `WAITLIST` off, and `levels.enabled = false`. The account is the member
   * with the ADMIN role as well, so D7 (admin) and the app (member) read the same variant.
   */
  activitiesNoWaitlist: {
    branding: { ...canic, modules: canic.modules.filter((module) => module !== "WAITLIST") },
    me: {
      ...member,
      membership: { ...memberMembership, roles: ["MEMBER", "ADMIN"] },
    },
    sessions: accountSessions,
  },
  // A club whose default locale is not `ca` (R-07-04: the title is required in `defaultLocale`).
  activitiesDefaultEs: {
    branding: { ...canic, defaultLocale: "es" },
    me: {
      ...member,
      membership: { ...memberMembership, roles: ["MEMBER", "ADMIN"] },
    },
    sessions: accountSessions,
  },
  activitiesNoLevels: {
    branding: canic,
    levelsEnabled: false,
    me: {
      ...member,
      membership: { ...memberMembership, roles: ["MEMBER", "ADMIN"] },
    },
    sessions: accountSessions,
  },
  /** `levels.enabled = false` read by an INSTRUCTOR, who cannot read `/parameters` (403). */
  activitiesInstructorNoLevels: {
    branding: canic,
    levelsEnabled: false,
    me: meInstructor as Me,
    sessions: accountSessions,
  },
  signupClosed: {
    branding: {
      ...canic,
      locales: ["ca", "es", "en"],
      signup: { enabled: false },
    },
    me: member,
    sessions: accountSessions,
  },
} as const satisfies Record<string, MockScenarioDefinition>;

export type MockScenario = keyof typeof scenarios;

export const mockScenarios = Object.keys(scenarios) as MockScenario[];

let selectedScenario: MockScenario = "admin";

export function mockScenario(name: MockScenario): void {
  selectedScenario = name;
}

export function currentMockScenario(): MockScenarioDefinition {
  return scenarios[selectedScenario];
}

export function currentMockScenarioName(): MockScenario {
  return selectedScenario;
}

/**
 * The tenant comes from the JWT: the mock worlds are one club's records (`MOCK_CLUB_ID`), and a
 * token of another club finds none of them (E5-W05 step 16).
 */
export function callerClubOwnsTheWorld(
  scenario: MockScenarioDefinition = currentMockScenario(),
): boolean {
  return scenario.me.membership?.clubId === MOCK_CLUB_ID;
}
