import type { components } from "../generated/schema";

import brandingCanic from "./fixtures/branding-canic.json";
import brandingMinim from "./fixtures/branding-minim.json";
import meAdmin from "./fixtures/me-admin.json";
import meImpersonated from "./fixtures/me-impersonated.json";
import meInstructor from "./fixtures/me-instructor.json";
import meMember from "./fixtures/me-member.json";
import meMultiProfile from "./fixtures/me-multi-profile.json";
import { importedAccountOnboarding, policyReconsentOnboarding } from "./fixtures/onboarding";
import sessions from "./fixtures/sessions.json";
import type { SignupReviewVariant } from "./fixtures/signup-review";

type Branding = components["schemas"]["BrandingResponse"];
type Me = components["schemas"]["Me"];
type SessionList = components["schemas"]["Session"][];
type OnboardingState = components["schemas"]["OnboardingState"];

export interface MockScenarioDefinition {
  branding: Branding;
  dashboardNulls?: boolean;
  /** Every list export answers `202 {jobId, statusUrl}`, as above `ExportPolicy.syncMaxRows` (R-14-12). */
  exportsQueued?: boolean;
  me: Me;
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
  /** The D2 variant of the Marta Roca signup (`fixtures/signup-review.ts`). */
  signupReview?: SignupReviewVariant;
}

const canic = brandingCanic as Branding;
const minimal = brandingMinim as Branding;
const member = meMember as Me;
const multiProfile = meMultiProfile as Me;
const accountSessions = sessions;
const memberMembership = member.membership;

if (memberMembership === undefined) {
  throw new TypeError("The member mock fixture requires a club membership");
}

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
  /** The list exports take the queued path (`202`) instead of the inline file. */
  adminExportsQueued: {
    branding: { ...canic, locales: ["ca", "es", "en"] },
    exportsQueued: true,
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
  member: {
    branding: canic,
    me: member,
    sessions: accountSessions,
  },
  /** Screen 10 empty state: `GET /day-grid` answers `rows: []` for every date. */
  dayGridEmpty: {
    branding: canic,
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
