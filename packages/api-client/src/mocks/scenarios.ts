import brandingCanic from "./fixtures/branding-canic.json";
import brandingMinim from "./fixtures/branding-minim.json";
import meAdmin from "./fixtures/me-admin.json";
import meInstructor from "./fixtures/me-instructor.json";
import meMember from "./fixtures/me-member.json";

const scenarios = {
  admin: {
    branding: brandingCanic,
    me: meAdmin,
  },
  member: {
    branding: brandingCanic,
    me: meMember,
  },
  instructor: {
    branding: brandingCanic,
    me: meInstructor,
  },
  minimal: {
    branding: brandingMinim,
    me: meMember,
  },
  minimalAdmin: {
    branding: brandingMinim,
    me: meAdmin,
  },
} as const;

export type MockScenario = keyof typeof scenarios;

export const mockScenarios = Object.keys(scenarios) as MockScenario[];

let selectedScenario: MockScenario = "admin";

export function mockScenario(name: MockScenario): void {
  selectedScenario = name;
}

export function currentMockScenario() {
  return scenarios[selectedScenario];
}
