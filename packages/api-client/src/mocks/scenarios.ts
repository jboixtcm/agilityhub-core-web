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

type Branding = components["schemas"]["BrandingResponse"];
type Me = components["schemas"]["Me"];
type SessionList = components["schemas"]["Session"][];
type OnboardingState = components["schemas"]["OnboardingState"];

export interface MockScenarioDefinition {
  branding: Branding;
  me: Me;
  sessions: SessionList;
  invalidMagicLink?: boolean;
  onboarding?: OnboardingState;
  outdatedConsentOnce?: boolean;
  rateLimited?: boolean;
  signupStripe?: boolean;
  signupFamilyPending?: boolean;
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
  member: {
    branding: canic,
    me: member,
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
  signupStripe: {
    branding: { ...canic, locales: ["ca", "es", "en"] },
    me: member,
    sessions: accountSessions,
    signupStripe: true,
  },
  signupNoFamilyPending: {
    branding: { ...canic, locales: ["ca", "es", "en"] },
    me: member,
    sessions: accountSessions,
    signupFamilyPending: false,
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
