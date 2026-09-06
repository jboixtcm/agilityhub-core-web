import type { components } from "../generated/schema";

import brandingCanic from "./fixtures/branding-canic.json";
import brandingMinim from "./fixtures/branding-minim.json";
import meAdmin from "./fixtures/me-admin.json";
import meImpersonated from "./fixtures/me-impersonated.json";
import meInstructor from "./fixtures/me-instructor.json";
import meMember from "./fixtures/me-member.json";
import meMultiProfile from "./fixtures/me-multi-profile.json";
import sessions from "./fixtures/sessions.json";

type Branding = components["schemas"]["BrandingResponse"];
type Me = components["schemas"]["Me"];
type SessionList = components["schemas"]["Session"][];

export interface MockScenarioDefinition {
  branding: Branding;
  me: Me;
  sessions: SessionList;
  invalidMagicLink?: boolean;
  rateLimited?: boolean;
}

const canic = brandingCanic as Branding;
const minimal = brandingMinim as Branding;
const member = meMember as Me;
const multiProfile = meMultiProfile as Me;
const accountSessions = sessions;

const scenarios = {
  admin: {
    branding: canic,
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
      membership: { ...member.membership, gender: "MALE" },
    },
    sessions: accountSessions,
  },
  activationNonBinary: {
    branding: canic,
    me: {
      ...member,
      account: { ...member.account, name: "Àlex Roca" },
      membership: { ...member.membership, gender: "OTHER" },
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
